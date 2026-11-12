import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../lib/firebase';
import type { Lead, StageHistoryEntry, NotificationHistoryEntry, StageMessageConfig, PipelineStage } from '../types';
import { buildTemplateContext, renderTemplateText, DEFAULT_STAGE_MESSAGES } from '../utils/templateVariables';
import { fetchAllSessions } from './whatsappMultiSessionService';
import {
  doesWhatsAppNumberMatch,
  formatWhatsAppNumberDisplay,
  normalizeWhatsAppDigits
} from '../utils/whatsappNumberUtils';
import toast from 'react-hot-toast';

async function sendViaElectronWhatsAppWeb(params: {
  targetPhone: string;
  contactName?: string;
  message: string;
  sourceWhatsappNumber?: string;
  sourceSessionId?: string;
}): Promise<{ ok: boolean; error?: string; fromNumber?: string; resolvedPhone?: string }> {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Browser window unavailable' };
  }

  // When invoked from Chrome/external browser, bridge through running EcoBill Desktop on localhost control port
  if (!window.electronAPI?.isElectron) {
    try {
      const res = await fetch('/api/desktop/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        return { ok: true, fromNumber: data.fromNumber, resolvedPhone: data.resolvedPhone };
      }
      return {
        ok: false,
        error: data?.error || 'Open EcoBill Desktop window and connect your WhatsApp tab'
      };
    } catch {
      return { ok: false, error: 'EcoBill Desktop app is not open on this PC' };
    }
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (res: { ok: boolean; error?: string; fromNumber?: string; resolvedPhone?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(guardTimer);
      resolve(res);
    };

    const guardTimer = setTimeout(() => {
      finish({ ok: false, error: 'WhatsApp Web tab did not respond in time' });
    }, 38000);

    window.dispatchEvent(
      new CustomEvent('ecobill:wa-send-message', {
        detail: {
          ...params,
          callback: (res: { ok: boolean; error?: string; fromNumber?: string; resolvedPhone?: string }) => finish(res)
        }
      })
    );
  });
}

async function sendViaBaileysSession(params: {
  targetPhone: string;
  message: string;
  sourceWhatsappNumber?: string;
  sourceSessionId?: string;
}): Promise<{ ok: boolean; error?: string; fromNumber?: string }> {
  try {
    const sessions = await fetchAllSessions();
    const connected = sessions.filter((s) => s.status === 'connected');
    if (connected.length === 0) {
      return { ok: false, error: 'No connected WhatsApp session in Multi-Account backend' };
    }

    let matched = undefined;
    if (params.sourceWhatsappNumber) {
      matched =
        connected.find((s) => doesWhatsAppNumberMatch(s.phoneNumber, params.sourceWhatsappNumber)) ||
        connected.find(
          (s) =>
            s.id === params.sourceSessionId &&
            (!s.phoneNumber || doesWhatsAppNumberMatch(s.phoneNumber, params.sourceWhatsappNumber))
        );

      if (!matched) {
        return {
          ok: false,
          error: `Originating WhatsApp ${formatWhatsAppNumberDisplay(params.sourceWhatsappNumber)} is not connected`
        };
      }
    } else {
      matched =
        (params.sourceSessionId && connected.find((s) => s.id === params.sourceSessionId)) ||
        connected[0];
    }

    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: matched.id,
        phone: params.targetPhone,
        message: params.message
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error || 'Baileys send failed' };
    }

    return {
      ok: true,
      fromNumber: normalizeWhatsAppDigits(matched.phoneNumber || params.sourceWhatsappNumber || '')
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Baileys backend unreachable' };
  }
}

export interface StageMoveResult {
  success: boolean;
  message: string;
  notificationStatus?: {
    whatsapp?: 'sent' | 'pending' | 'failed' | 'disabled';
    sms?: 'sent' | 'pending' | 'failed' | 'disabled';
    email?: 'sent' | 'pending' | 'failed' | 'disabled';
  };
  error?: string;
}

const AUTO_SEND_STAGE_WA_KEY = 'ecobill.autoSendStageWhatsApp';
const AUTO_SEND_STAGE_WA_EVENT = 'ecobill:auto-send-stage-wa-changed';

export function getAutoSendOnStageMoveEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(AUTO_SEND_STAGE_WA_KEY);
  return raw === null ? true : raw === 'true';
}

export function setAutoSendOnStageMoveEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTO_SEND_STAGE_WA_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent(AUTO_SEND_STAGE_WA_EVENT, { detail: enabled }));
}

export function subscribeAutoSendOnStageMoveChange(callback: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (ev: Event) => {
    const custom = ev as CustomEvent<boolean>;
    callback(typeof custom.detail === 'boolean' ? custom.detail : getAutoSendOnStageMoveEnabled());
  };
  window.addEventListener(AUTO_SEND_STAGE_WA_EVENT, handler);
  return () => window.removeEventListener(AUTO_SEND_STAGE_WA_EVENT, handler);
}

export function stageRequiresReason(stage?: PipelineStage | null): boolean {
  if (!stage) return false;
  return (stage.required_fields || []).includes('reason') || stage.id === 'lost_cancelled';
}

/**
 * Opens WhatsApp Web with the prefilled stage message in a new browser tab.
 */
export function openWhatsAppWebDirect(phone: string, text: string): void {
  if (!phone) return;
  const digits = phone.replace(/\D/g, '');
  const finalPhone = digits.length === 10 ? `91${digits}` : digits;
  const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Checks whether a notification for a target stage was already sent to this lead
 */
export function checkDuplicateStageNotification(lead: Partial<Lead>, targetStageId: string): {
  isDuplicate: boolean;
  lastSentAt?: string;
  channel?: string;
} {
  const history = lead.notification_history || [];
  const existing = history.find(
    (n) => n.stage_id === targetStageId && n.channel === 'whatsapp' && n.status === 'sent'
  );

  if (existing) {
    let dateStr = 'earlier';
    if (existing.sent_at) {
      if (typeof existing.sent_at.toDate === 'function') dateStr = existing.sent_at.toDate().toLocaleDateString();
      else if (existing.sent_at.seconds) dateStr = new Date(existing.sent_at.seconds * 1000).toLocaleDateString();
      else dateStr = new Date(existing.sent_at).toLocaleDateString();
    }
    return {
      isDuplicate: true,
      lastSentAt: dateStr,
      channel: existing.channel,
    };
  }

  // Also check boolean flag map
  if (lead.notifications_sent && lead.notifications_sent[targetStageId]) {
    return { isDuplicate: true, lastSentAt: 'a previous transition' };
  }

  return { isDuplicate: false };
}

/**
 * Fetches the stage message configuration for a given stage ID
 */
export async function getStageMessageConfig(
  stageId: string,
  stageLabel: string,
  pipelineId?: string
): Promise<StageMessageConfig> {
  if (db) {
    try {
      const configDoc = await getDoc(doc(db, 'stage_messages', stageId));
      if (configDoc.exists()) {
        return { id: configDoc.id, ...configDoc.data() } as StageMessageConfig;
      }
    } catch (e) {
      console.warn('Could not fetch custom stage message config from Firestore:', e);
    }
  }

  // Fallback to default presets
  const preset = DEFAULT_STAGE_MESSAGES[stageId] || {
    whatsapp_enabled: true,
    whatsapp_template: `Hi {{customer_name}}, your trophy order is currently in the {{current_stage}} stage. Our team will keep you updated. – EcoTrophy`,
    sms_enabled: false,
    sms_template: `Hi {{customer_name}}, your trophy order has moved to {{current_stage}}. – EcoTrophy`,
    email_enabled: false,
    email_subject: `Order Status Update: {{current_stage}} - EcoTrophy`,
    email_template: `Hi {{customer_name}},\n\nYour order has entered {{current_stage}}. We will keep you updated on the progress.\n\nBest regards,\nEcoTrophy`,
  };

  return {
    id: stageId,
    stage_id: stageId,
    stage_name: stageLabel,
    pipeline_id: pipelineId || 'default',
    whatsapp_enabled: preset.whatsapp_enabled !== false,
    whatsapp_template: preset.whatsapp_template || '',
    sms_enabled: preset.sms_enabled === true,
    sms_template: preset.sms_template || '',
    email_enabled: preset.email_enabled === true,
    email_subject: preset.email_subject || '',
    email_template: preset.email_template || '',
    delay_minutes: 0,
    is_active: true,
  };
}

/**
 * Executes a manual stage transition and optionally dispatches the customer notification
 */
export async function executeManualStageMove(params: {
  lead: Lead;
  fromStage: PipelineStage;
  toStage: PipelineStage;
  pipelineId: string;
  pipelineName: string;
  sendMessage: boolean;
  skipDuplicateSend?: boolean;
  customReason?: string;
  userNote?: string;
  currentUserId?: string;
  currentUserName?: string;
}): Promise<StageMoveResult> {
  const {
    lead,
    fromStage,
    toStage,
    pipelineId,
    pipelineName,
    sendMessage,
    skipDuplicateSend = false,
    customReason,
    userNote,
    currentUserId = auth?.currentUser?.uid || 'user',
    currentUserName = auth?.currentUser?.displayName || auth?.currentUser?.email || 'CRM User',
  } = params;

  if (!db) {
    throw new Error('Firestore database is not initialized.');
  }

  const notificationStatus: StageMoveResult['notificationStatus'] = {};
  const notificationHistoryEntries: NotificationHistoryEntry[] = [];
  let whatsappFailureReason = '';
  const now = new Date();
  const duplicateCheck = skipDuplicateSend ? checkDuplicateStageNotification(lead, toStage.id) : { isDuplicate: false };
  const skippedDueToDuplicate = Boolean(sendMessage && duplicateCheck.isDuplicate);
  const effectiveSendMessage = Boolean(sendMessage && !skippedDueToDuplicate);

  // 1. Stage History Entry
  const stageHistoryEntry: StageHistoryEntry = {
    from_stage: fromStage.label || fromStage.id,
    to_stage: toStage.label || toStage.id,
    changed_by: currentUserId,
    changed_by_name: currentUserName,
    changed_at: now,
    note: customReason || userNote || `Moved to ${toStage.label}`,
    notification_triggered: effectiveSendMessage,
  };

  // 2. Resolve Notification Messages if enabled
  if (effectiveSendMessage) {
    const config = await getStageMessageConfig(toStage.id, toStage.label, pipelineId);
    const context = buildTemplateContext(lead, toStage.label, fromStage.label);

    // A. WhatsApp Notification
    if (config.whatsapp_enabled && config.whatsapp_template) {
      const renderedMessage = renderTemplateText(config.whatsapp_template, context);
      const phone = lead.phone || (lead as any).whatsapp_number || (lead as any).senderPhone || '';
      const cleanPhone = String(phone).replace(/\D/g, '');
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const contactLookupName = (lead.name || '').trim();

      if (!finalPhone && !contactLookupName) {
        notificationStatus.whatsapp = 'failed';
        whatsappFailureReason = 'Customer has no valid phone number or contact name saved on this lead.';
        notificationHistoryEntries.push({
          id: `wa_${Date.now()}`,
          stage_id: toStage.id,
          stage_name: toStage.label,
          channel: 'whatsapp',
          recipient: 'No phone',
          message: renderedMessage,
          status: 'failed',
          sent_at: now,
          sent_by: currentUserName,
          error: 'Customer has no valid phone number.',
        });
      } else {
        let sentWhatsApp = false;
        let lastWaError = '';
        const sourceWhatsappNumber = normalizeWhatsAppDigits(lead.source_whatsapp_number || '');
        const sourceSessionId = lead.source_session_id || '';
        let sentFromNumber = sourceWhatsappNumber;
        let resolvedRecipientPhone = finalPhone;

        // 1. Prefer Electron logged-in WhatsApp Web tab matching the lead's originating number
        // Supports both phone-number routing and saved WhatsApp contact-name lookup (when phone was not in sidebar DOM)
        const electronRes = await sendViaElectronWhatsAppWeb({
          targetPhone: finalPhone,
          contactName: contactLookupName,
          message: renderedMessage,
          sourceWhatsappNumber,
          sourceSessionId
        });

        if (electronRes.ok) {
          sentWhatsApp = true;
          if (electronRes.fromNumber) {
            sentFromNumber = normalizeWhatsAppDigits(electronRes.fromNumber);
          }
          if (electronRes.resolvedPhone && !finalPhone) {
            resolvedRecipientPhone = normalizeWhatsAppDigits(electronRes.resolvedPhone);
          }
        } else {
          lastWaError = electronRes.error || '';
        }

        // 2. Try connected Baileys session matching the exact originating number (requires numeric phone)
        if (!sentWhatsApp && finalPhone) {
          const baileysRes = await sendViaBaileysSession({
            targetPhone: finalPhone,
            message: renderedMessage,
            sourceWhatsappNumber,
            sourceSessionId
          });

          if (baileysRes.ok) {
            sentWhatsApp = true;
            if (baileysRes.fromNumber) {
              sentFromNumber = normalizeWhatsAppDigits(baileysRes.fromNumber);
            }
          } else if (baileysRes.error) {
            lastWaError = lastWaError ? `${lastWaError}; ${baileysRes.error}` : baileysRes.error;
          }
        }

        if (sentWhatsApp && db) {
          await addDoc(collection(db, 'messages'), {
            leadId: lead.id,
            senderPhone: resolvedRecipientPhone || contactLookupName,
            sourceWhatsappNumber: sentFromNumber,
            direction: 'outbound',
            type: 'text',
            content: renderedMessage,
            platform: 'whatsapp',
            triggeredBy: 'stage_change',
            created_at: serverTimestamp(),
          }).catch(() => {});
        }

        // 3. Only fall back to Cloud Function / Meta Cloud API if phone exists and no specific WhatsApp Web source number recorded
        if (!sentWhatsApp && finalPhone && !sourceWhatsappNumber && functions) {
          try {
            const sendFn = httpsCallable(functions, 'sendStageWhatsApp');
            await sendFn({
              leadId: lead.id,
              message: renderedMessage,
              phone: finalPhone,
              stageId: toStage.id,
              stageName: toStage.label,
            });
            sentWhatsApp = true;
          } catch (fnErr: any) {
            lastWaError = fnErr?.details?.message || fnErr?.message || 'Cloud function error';
            console.warn('[sendStageWhatsApp] Cloud function failed, trying direct Meta Cloud API fallback:', fnErr);
          }
        }

        // 4. Direct Meta Graph API Fallback (only when phone exists and no specific logged-in WhatsApp number is bound)
        if (!sentWhatsApp && finalPhone && !sourceWhatsappNumber) {
          try {
            let phoneId = '1263075550230396';
            let token = 'EAAP5CXj9PZA0BSZArJ0rvk8MMj0L90vBkzBNs6lhFeYwCEFv4ko0dj49kmqxRKwTZBsWhO18Ecsk4ZCQ4V6xLJtZCD2h2NAb3U9eakgQZCYELZAkQqPY300LngHx9DmeoOE3WBGTtASRr5XfjfBp1x0vmjKS6sf8dsKdDGIOvbtTM2QZBccvuBxS6hZCdg5QmhAZDZD';
            let version = 'v18.0';

            if (db) {
              try {
                const metaDoc = await getDoc(doc(db, 'meta_integrations', 'default'));
                if (metaDoc.exists()) {
                  const data = metaDoc.data();
                  if (data?.whatsappPhoneNumberId) phoneId = data.whatsappPhoneNumberId;
                  if (data?.metaWhatsAppAccessToken || data?.accessToken)
                    token = data.metaWhatsAppAccessToken || data.accessToken;
                  if (data?.graphApiVersion) version = data.graphApiVersion;
                }
              } catch (e) {
                console.warn('[stageNotificationService] Could not read meta_integrations/default:', e);
              }
            }

            const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: finalPhone,
                type: 'text',
                text: { body: renderedMessage },
              }),
            });

            const resJson = await res.json();
            if (resJson.error) {
              lastWaError = resJson.error.message || 'Meta Cloud API error';
            } else if (resJson.messages?.[0]?.id) {
              const wamid = resJson.messages[0].id;
              sentWhatsApp = true;

              if (db) {
                await addDoc(collection(db, 'messages'), {
                  leadId: lead.id,
                  senderPhone: finalPhone,
                  direction: 'outbound',
                  type: 'text',
                  content: renderedMessage,
                  metaMessageId: wamid,
                  platform: 'whatsapp',
                  triggeredBy: 'stage_change',
                  created_at: serverTimestamp(),
                });
              }
            }
          } catch (directErr: any) {
            lastWaError = directErr?.message || String(directErr);
          }
        }

        if (sentWhatsApp) {
          notificationStatus.whatsapp = 'sent';
          notificationHistoryEntries.push({
            id: `wa_${Date.now()}`,
            stage_id: toStage.id,
            stage_name: toStage.label,
            channel: 'whatsapp',
            recipient: resolvedRecipientPhone || contactLookupName || 'WhatsApp Contact',
            message: renderedMessage,
            status: 'sent',
            sent_at: now,
            sent_by: sentFromNumber
              ? `${currentUserName} (via ${formatWhatsAppNumberDisplay(sentFromNumber)})`
              : currentUserName,
          });
          const leadBackfill: Record<string, string> = {};
          if (sentFromNumber && !lead.source_whatsapp_number) {
            leadBackfill.source_whatsapp_number = sentFromNumber;
            leadBackfill.source_whatsapp_label = formatWhatsAppNumberDisplay(sentFromNumber);
          }
          if (resolvedRecipientPhone && !finalPhone) {
            leadBackfill.phone = resolvedRecipientPhone;
            leadBackfill.normalized_phone = resolvedRecipientPhone;
            leadBackfill.whatsapp_number = resolvedRecipientPhone;
          }
          if (Object.keys(leadBackfill).length > 0 && db) {
            updateDoc(doc(db, 'leads', lead.id), leadBackfill).catch(() => {});
          }
        } else {
          // Failed (e.g. missing originating tab, offline session, or 24h Meta Cloud window closed)
          // Record as failed notification so lead movement is NOT blocked
          const is24hWindow = lastWaError.includes('24 hours') || lastWaError.includes('131047');
          const reasonNotice = is24hWindow
            ? 'Customer 24h reply window closed. Use WhatsApp Web.'
            : lastWaError;
          whatsappFailureReason = reasonNotice;

          notificationStatus.whatsapp = 'failed';
          notificationHistoryEntries.push({
            id: `wa_failed_${Date.now()}`,
            stage_id: toStage.id,
            stage_name: toStage.label,
            channel: 'whatsapp',
            recipient: finalPhone || contactLookupName || 'No phone',
            message: renderedMessage,
            status: 'failed',
            sent_at: now,
            sent_by: currentUserName,
            error: reasonNotice,
          });
        }
      }
    } else {
      notificationStatus.whatsapp = 'disabled';
    }

    // B. SMS Notification (Modular Stub)
    if (config.sms_enabled && config.sms_template) {
      const renderedSms = renderTemplateText(config.sms_template, context);
      notificationStatus.sms = 'pending';
      notificationHistoryEntries.push({
        id: `sms_${Date.now()}`,
        stage_id: toStage.id,
        stage_name: toStage.label,
        channel: 'sms',
        recipient: lead.phone || 'No phone',
        message: renderedSms,
        status: 'pending',
        sent_at: now,
        sent_by: currentUserName,
        error: 'SMS gateway pending configuration',
      });
    }

    // C. Email Notification (Modular Stub)
    if (config.email_enabled && config.email_template) {
      const renderedEmail = renderTemplateText(config.email_template, context);
      notificationStatus.email = 'pending';
      notificationHistoryEntries.push({
        id: `email_${Date.now()}`,
        stage_id: toStage.id,
        stage_name: toStage.label,
        channel: 'email',
        recipient: lead.email || 'No email',
        message: renderedEmail,
        status: 'pending',
        sent_at: now,
        sent_by: currentUserName,
        error: 'SMTP email server pending configuration',
      });
    }
  }

  // 3. Update Lead in Firestore
  const existingStageHistory = lead.stage_history || [];
  const existingNotificationHistory = lead.notification_history || [];
  const existingSentMap = lead.notifications_sent || {};

  const updatedNotificationsSent = {
    ...existingSentMap,
    ...(notificationStatus.whatsapp === 'sent' ? { [toStage.id]: true } : {}),
  };

  const leadUpdatePayload: any = {
    pipeline_id: pipelineId,
    status: toStage.id,
    stage_history: [stageHistoryEntry, ...existingStageHistory],
    notification_history: [...notificationHistoryEntries, ...existingNotificationHistory],
    notifications_sent: updatedNotificationsSent,
    stageEnteredAt: serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  if (customReason !== undefined) {
    leadUpdatePayload.reason = customReason;
  }

  await updateDoc(doc(db, 'leads', lead.id), leadUpdatePayload);

  // 4. Record Activity Entry
  const activityMsg = effectiveSendMessage
    ? `Stage moved: "${fromStage.label}" ➔ "${toStage.label}" by ${currentUserName}. Customer notification (${notificationStatus.whatsapp === 'sent' ? 'WhatsApp Sent' : 'Message Logged'}) triggered.`
    : skippedDueToDuplicate
    ? `Stage moved: "${fromStage.label}" ➔ "${toStage.label}" by ${currentUserName} (Duplicate stage notification skipped).`
    : `Stage moved: "${fromStage.label}" ➔ "${toStage.label}" by ${currentUserName} (Notification skipped).`;

  await addDoc(collection(db, 'activities'), {
    lead_id: lead.id,
    type: 'lead.updated',
    message: activityMsg,
    actor: currentUserId,
    created_at: serverTimestamp(),
  });

  const formattedOrigin = lead.source_whatsapp_number
    ? formatWhatsAppNumberDisplay(lead.source_whatsapp_number)
    : '';
  let returnMessage = `Moved "${lead.name}" to ${toStage.label}.`;
  if (skippedDueToDuplicate) {
    returnMessage = `Moved "${lead.name}" to ${toStage.label}. (Notification skipped because update for this stage was already sent earlier).`;
  } else if (effectiveSendMessage && notificationStatus.whatsapp === 'sent') {
    returnMessage = formattedOrigin
      ? `Moved "${lead.name}" to ${toStage.label} and sent WhatsApp message from ${formattedOrigin}.`
      : `Moved "${lead.name}" to ${toStage.label} and sent WhatsApp update.`;
  } else if (effectiveSendMessage && notificationStatus.whatsapp === 'failed') {
    const cleanReason = whatsappFailureReason || (formattedOrigin ? `Connect ${formattedOrigin} in EcoBill Desktop Browser` : 'Connect WhatsApp Web in EcoBill Desktop Browser');
    returnMessage = formattedOrigin
      ? `Moved "${lead.name}" to ${toStage.label}. (WhatsApp from ${formattedOrigin} not sent: ${cleanReason})`
      : `Moved "${lead.name}" to ${toStage.label}. (WhatsApp not sent: ${cleanReason})`;
  } else if (effectiveSendMessage && notificationStatus.whatsapp === 'disabled') {
    returnMessage = `Moved "${lead.name}" to ${toStage.label}. (WhatsApp auto-message is disabled for this stage in Settings).`;
  }

  return {
    success: true,
    message: returnMessage,
    notificationStatus,
  };
}

/**
 * Shared helper for zero-click stage transitions in PipelineBoard & LeadDetail:
 * moves stage immediately, sends WhatsApp from originating number (skipping duplicate sends), and surfaces toast status.
 */
export async function runAutoStageMoveWithToast(params: {
  lead: Lead;
  fromStage: PipelineStage;
  toStage: PipelineStage;
  pipelineId: string;
  pipelineName: string;
}): Promise<StageMoveResult> {
  const { lead, fromStage, toStage, pipelineId, pipelineName } = params;
  const originNumDisplay = formatWhatsAppNumberDisplay(lead.source_whatsapp_number);
  const loadingToast = toast.loading(
    originNumDisplay
      ? `Moving "${lead.name}" to ${toStage.label} & sending WhatsApp from ${originNumDisplay}...`
      : `Moving "${lead.name}" to ${toStage.label} & sending WhatsApp update...`
  );

  try {
    const result = await executeManualStageMove({
      lead,
      fromStage,
      toStage,
      pipelineId,
      pipelineName,
      sendMessage: true,
      skipDuplicateSend: true,
    });
    if (result.notificationStatus?.whatsapp === 'failed') {
      toast.error(result.message, { id: loadingToast, duration: 5500 });
    } else {
      toast.success(result.message, { id: loadingToast, duration: 4500 });
    }
    return result;
  } catch (err: any) {
    const errMsg = err?.message || `Failed to move "${lead.name}" to ${toStage.label}.`;
    toast.error(errMsg, { id: loadingToast, duration: 5000 });
    return { success: false, message: errMsg, error: errMsg };
  }
}

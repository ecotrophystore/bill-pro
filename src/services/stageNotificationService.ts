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
    (n) => n.stage_id === targetStageId && (n.status === 'sent' || n.status === 'pending')
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
  const now = new Date();

  // 1. Stage History Entry
  const stageHistoryEntry: StageHistoryEntry = {
    from_stage: fromStage.label || fromStage.id,
    to_stage: toStage.label || toStage.id,
    changed_by: currentUserId,
    changed_by_name: currentUserName,
    changed_at: now,
    note: customReason || userNote || `Moved to ${toStage.label}`,
    notification_triggered: sendMessage,
  };

  // 2. Resolve Notification Messages if enabled
  if (sendMessage) {
    const config = await getStageMessageConfig(toStage.id, toStage.label, pipelineId);
    const context = buildTemplateContext(lead, toStage.label, fromStage.label);

    // A. WhatsApp Notification
    if (config.whatsapp_enabled && config.whatsapp_template) {
      const renderedMessage = renderTemplateText(config.whatsapp_template, context);
      const phone = lead.phone || (lead as any).senderPhone || '';
      const cleanPhone = String(phone).replace(/\D/g, '');
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      if (!finalPhone) {
        notificationStatus.whatsapp = 'failed';
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
        try {
          // Call Cloud Function directly — bypasses Firestore security rules
          // and uses the real Meta token stored as a server secret
          if (!functions) throw new Error('Firebase Functions not initialized');
          const sendFn = httpsCallable(functions, 'sendStageWhatsApp');
          await sendFn({
            leadId: lead.id,
            message: renderedMessage,
            phone: finalPhone,
            stageId: toStage.id,
            stageName: toStage.label,
          });

          notificationStatus.whatsapp = 'sent';
          notificationHistoryEntries.push({
            id: `wa_queued_${Date.now()}`,
            stage_id: toStage.id,
            stage_name: toStage.label,
            channel: 'whatsapp',
            recipient: finalPhone,
            message: renderedMessage,
            status: 'sent',
            sent_at: now,
            sent_by: currentUserName,
          });
        } catch (apiErr: any) {
          // Extract the actual error message from Firebase HttpsError
          const errMsg = apiErr?.details?.message || apiErr?.message || 'WhatsApp send failed';
          console.error('[sendStageWhatsApp] Error:', errMsg, apiErr);
          // Re-throw so the modal can show the actual error
          throw new Error(`WhatsApp failed: ${errMsg}`);
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
    ...(sendMessage ? { [toStage.id]: true } : {}),
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
  const activityMsg = sendMessage
    ? `Stage moved: "${fromStage.label}" ➔ "${toStage.label}" by ${currentUserName}. Customer notification (${notificationStatus.whatsapp === 'sent' ? 'WhatsApp Sent' : 'Message Logged'}) triggered.`
    : `Stage moved: "${fromStage.label}" ➔ "${toStage.label}" by ${currentUserName} (Notification skipped).`;

  await addDoc(collection(db, 'activities'), {
    lead_id: lead.id,
    type: 'lead.updated',
    message: activityMsg,
    actor: currentUserId,
    created_at: serverTimestamp(),
  });

  return {
    success: true,
    message: `Moved "${lead.name}" to ${toStage.label}.`,
    notificationStatus,
  };
}

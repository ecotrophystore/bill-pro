import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Lead } from '../types';

export interface WhatsAppFollowupAutomationConfig {
  enabled: boolean;
  scheduleTime: string; // "07:30"
  timeZone: string; // "Asia/Kolkata"
  targetStageId: string; // "follow_up"
  targetStageLabel: string; // "Follow Up"
  messageTemplate: string; // e.g. "Hi {{name}}!" or "Hi!"
  lastRunDate?: string; // "YYYY-MM-DD" in Asia/Kolkata
  lastRunAt?: any;
  lastRunSummary?: {
    totalLeads: number;
    sentCount: number;
    failedCount: number;
    timestamp: any;
    details?: Array<{ leadId: string; name: string; phone: string; status: 'sent' | 'failed' | 'skipped'; error?: string }>;
  };
  updated_at?: any;
  updated_by?: string;
}

const SETTINGS_DOC_PATH = 'system_settings';
const SETTINGS_DOC_ID = 'whatsapp_followup_automation';
const LOCAL_STORAGE_KEY = 'billpro.followup_automation';

export const DEFAULT_FOLLOWUP_CONFIG: WhatsAppFollowupAutomationConfig = {
  enabled: true,
  scheduleTime: '07:30',
  timeZone: 'Asia/Kolkata',
  targetStageId: 'follow_up',
  targetStageLabel: 'Follow Up',
  messageTemplate: 'Hi {{name}}!'
};

/**
 * Get current date string in IST (Asia/Kolkata) as YYYY-MM-DD
 */
export function getTodayDateIST(): string {
  const now = new Date();
  const istDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD format
  return istDateStr;
}

/**
 * Fetch automation config from Firestore or LocalStorage
 */
export async function getFollowupAutomationConfig(): Promise<WhatsAppFollowupAutomationConfig> {
  let localConfig = DEFAULT_FOLLOWUP_CONFIG;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    if (raw) localConfig = { ...DEFAULT_FOLLOWUP_CONFIG, ...JSON.parse(raw) };
  } catch (e) {}

  if (!db) return localConfig;
  try {
    const snap = await getDoc(doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID)).catch(() => null);
    if (snap && snap.exists()) {
      const merged = { ...localConfig, ...(snap.data() as WhatsAppFollowupAutomationConfig) };
      try {
        if (typeof window !== 'undefined') localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    }
    // Try fallback collection
    const altSnap = await getDoc(doc(db, 'settings', SETTINGS_DOC_ID)).catch(() => null);
    if (altSnap && altSnap.exists()) {
      const merged = { ...localConfig, ...(altSnap.data() as WhatsAppFollowupAutomationConfig) };
      return merged;
    }
  } catch (err) {
    console.warn('Error fetching followup automation config, using cache:', err);
  }
  return localConfig;
}

/**
 * Real-time subscription to automation config
 */
export function subscribeFollowupAutomationConfig(
  callback: (config: WhatsAppFollowupAutomationConfig) => void
): () => void {
  // Provide instant initial local cache
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    if (raw) callback({ ...DEFAULT_FOLLOWUP_CONFIG, ...JSON.parse(raw) });
  } catch (e) {}

  if (!db) {
    callback(DEFAULT_FOLLOWUP_CONFIG);
    return () => {};
  }

  return onSnapshot(
    doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID),
    (snap) => {
      if (snap.exists()) {
        const fresh = { ...DEFAULT_FOLLOWUP_CONFIG, ...(snap.data() as WhatsAppFollowupAutomationConfig) };
        try {
          if (typeof window !== 'undefined') localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(fresh));
        } catch {}
        callback(fresh);
      } else {
        callback(DEFAULT_FOLLOWUP_CONFIG);
      }
    },
    (err) => {
      console.warn('Error subscribing to followup automation config:', err);
    }
  );
}

/**
 * Update automation config (Toggle on/off, change message, etc.)
 */
export async function updateFollowupAutomationConfig(
  updates: Partial<WhatsAppFollowupAutomationConfig>,
  userIdentifier?: string
): Promise<void> {
  // Always update local cache immediately so toggle never fails in UI
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    const curr = raw ? JSON.parse(raw) : DEFAULT_FOLLOWUP_CONFIG;
    const next = { ...curr, ...updates };
    if (typeof window !== 'undefined') localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {}

  if (!db) return;

  const payload = {
    ...updates,
    updated_at: serverTimestamp(),
    updated_by: userIdentifier || 'Staff'
  };

  try {
    await setDoc(doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID), payload, { merge: true });
  } catch (err) {
    console.warn('Retrying to save in settings collection:', err);
    try {
      await setDoc(doc(db, 'settings', SETTINGS_DOC_ID), payload, { merge: true });
    } catch (e2) {
      console.warn('Could not sync config to cloud, cached locally:', e2);
    }
  }
}

/**
 * Format the "Hi" message for a specific lead
 */
export function formatFollowupMessage(template: string, lead: Lead): string {
  let name = '';
  if (lead.name) {
    const raw = lead.name.trim();
    // Use first name if valid, avoiding phone numbers saved as names
    if (!/^\+?[0-9\s-]+$/.test(raw)) {
      name = raw.split(' ')[0];
    }
  }

  let text = template || 'Hi {{name}}!';
  if (name) {
    text = text.replace(/\{\{name\}\}/gi, name);
  } else {
    // If no clean client name, replace "{{name}}" or "Hi {{name}}!" with a clean "Hi!"
    text = text.replace(/\s*\{\{name\}\}/gi, '').trim();
    if (!text || text.toLowerCase() === 'hi') {
      text = 'Hi!';
    }
  }
  return text;
}

/**
 * Normalize phone to 12-digit Indian number (91XXXXXXXXXX)
 */
function normalizePhone(raw?: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/**
 * Dispatch WhatsApp message directly via Meta Cloud API
 */
async function sendWhatsAppDirect(phone: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  let phoneId = '1263075550230396';
  let token = 'EAAP5CXj9PZA0BSZArJ0rvk8MMj0L90vBkzBNs6lhFeYwCEFv4ko0dj49kmqxRKwTZBsWhO18Ecsk4ZCQ4V6xLJtZCD2h2NAb3U9eakgQZCYELZAkQqPY300LngHx9DmeoOE3WBGTtASRr5XfjfBp1x0vmjKS6sf8dsKdDGIOvbtTM2QZBccvuBxS6hZCdg5QmhAZDZD';
  let version = 'v18.0';

  if (db) {
    try {
      const metaDoc = await getDoc(doc(db, 'meta_integrations', 'default'));
      if (metaDoc.exists()) {
        const d = metaDoc.data();
        if (d?.whatsappPhoneNumberId) phoneId = d.whatsappPhoneNumberId;
        if (d?.metaWhatsAppAccessToken || d?.accessToken) token = d.metaWhatsAppAccessToken || d.accessToken;
        if (d?.graphApiVersion) version = d.graphApiVersion;
      }
    } catch (e) {
      console.warn('Using default Meta config for automated followup dispatch');
    }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: text }
      })
    });

    const resJson = await res.json();
    if (resJson.error) {
      return { success: false, error: resJson.error.message || 'Meta API delivery error' };
    }
    const messageId = resJson.messages?.[0]?.id || `out_${Date.now()}`;
    return { success: true, messageId };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error' };
  }
}

/**
 * Execute the 7:30 AM Automated Follow-Up Dispatch to everyone in Follow-Up stage
 */
export async function executeFollowupMorningDispatch(options?: {
  force?: boolean;
  userInitiated?: boolean;
}): Promise<{
  success: boolean;
  totalLeads: number;
  sentCount: number;
  failedCount: number;
  details: Array<{ leadId: string; name: string; phone: string; status: 'sent' | 'failed' | 'skipped'; error?: string }>;
}> {
  if (!db) {
    return { success: false, totalLeads: 0, sentCount: 0, failedCount: 0, details: [] };
  }

  const config = await getFollowupAutomationConfig();
  if (!config.enabled && !options?.force) {
    console.log('[FollowUp Automation] Dispatch skipped: automation is turned OFF.');
    return { success: false, totalLeads: 0, sentCount: 0, failedCount: 0, details: [] };
  }

  const todayIST = getTodayDateIST();
  if (!options?.force && config.lastRunDate === todayIST) {
    console.log(`[FollowUp Automation] Dispatch skipped: already ran today (${todayIST}).`);
    return { success: false, totalLeads: 0, sentCount: 0, failedCount: 0, details: [] };
  }

  // 1. Query leads in the follow-up stage
  const targetStage = config.targetStageId || 'follow_up';
  const leadsQuery = query(collection(db, 'leads'), where('status', '==', targetStage));
  const leadsSnap = await getDocs(leadsQuery);

  if (leadsSnap.empty) {
    console.log(`[FollowUp Automation] No leads found in "${targetStage}" stage.`);
    await updateDoc(doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID), {
      lastRunDate: todayIST,
      lastRunAt: serverTimestamp(),
      lastRunSummary: {
        totalLeads: 0,
        sentCount: 0,
        failedCount: 0,
        timestamp: new Date().toISOString(),
        details: []
      }
    });
    return { success: true, totalLeads: 0, sentCount: 0, failedCount: 0, details: [] };
  }

  const leads = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
  const details: Array<{ leadId: string; name: string; phone: string; status: 'sent' | 'failed' | 'skipped'; error?: string }> = [];

  let sentCount = 0;
  let failedCount = 0;

  for (const lead of leads) {
    const rawPhone = lead.phone || (lead as any).normalized_phone;
    const cleanPhone = normalizePhone(rawPhone);

    if (!cleanPhone || cleanPhone.length < 10) {
      details.push({
        leadId: lead.id,
        name: lead.name,
        phone: rawPhone || '',
        status: 'skipped',
        error: 'Missing or invalid phone number'
      });
      continue;
    }

    const messageText = formatFollowupMessage(config.messageTemplate, lead);

    // Send WhatsApp Message
    const outcome = await sendWhatsAppDirect(cleanPhone, messageText);

    if (outcome.success) {
      sentCount += 1;
      details.push({
        leadId: lead.id,
        name: lead.name,
        phone: cleanPhone,
        status: 'sent'
      });

      // Record in messages collection
      try {
        await addDoc(collection(db, 'messages'), {
          leadId: lead.id,
          senderPhone: cleanPhone,
          direction: 'outbound',
          type: 'text',
          content: messageText,
          metaMessageId: outcome.messageId,
          platform: 'whatsapp',
          triggeredBy: 'automated_730am_followup',
          created_at: serverTimestamp()
        });

        // Record in activities collection
        await addDoc(collection(db, 'activities'), {
          lead_id: lead.id,
          type: 'whatsapp_automated_followup',
          title: 'Automated 7:30 AM Follow-Up Sent',
          message: `Sent automatic 7:30 AM greeting: "${messageText}"`,
          actor: 'Automated System (7:30 AM)',
          created_at: serverTimestamp()
        });
      } catch (logErr) {
        console.warn('Could not record message/activity log:', logErr);
      }
    } else {
      failedCount += 1;
      details.push({
        leadId: lead.id,
        name: lead.name,
        phone: cleanPhone,
        status: 'failed',
        error: outcome.error
      });
    }

    // Gentle 300ms pause between dispatches to respect rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  // Update summary in Firestore
  await updateDoc(doc(db, SETTINGS_DOC_PATH, SETTINGS_DOC_ID), {
    lastRunDate: todayIST,
    lastRunAt: serverTimestamp(),
    lastRunSummary: {
      totalLeads: leads.length,
      sentCount,
      failedCount,
      timestamp: new Date().toISOString(),
      details
    }
  });

  return {
    success: true,
    totalLeads: leads.length,
    sentCount,
    failedCount,
    details
  };
}


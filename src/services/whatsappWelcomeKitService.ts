import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { Lead, MessageTemplate, StageMessageConfig } from '../types';
import { buildTemplateContext, DEFAULT_STAGE_MESSAGES, renderTemplateText } from '../utils/templateVariables';
import { extractLast10Digits } from '../utils/whatsappNumberUtils';

export type WelcomeKitItemKind =
  | 'nff'
  | 'brochure'
  | 'testimonial_video'
  | 'app_template'
  | 'custom_text'
  | 'custom_media';

export type WelcomeKitAttachmentType = 'none' | 'document' | 'image' | 'video';

export interface WelcomeKitItem {
  id: string;
  kind: WelcomeKitItemKind;
  title: string;
  enabled: boolean;
  messageText: string;
  attachmentType: WelcomeKitAttachmentType;
  fileName?: string;
  mimeType?: string;
  fileUrl?: string;
  localFilePath?: string;
  fileSizeBytes?: number;
  sourceTemplateId?: string;
  sourceCollection?: 'message_templates' | 'stage_messages';
}

export interface NoReplyFollowUpConfig {
  enabled: boolean;
  afterDays: number;
  useTestimonialKitItem: boolean;
  onlyEarlyStages: boolean;
  messageText: string;
  attachmentType?: WelcomeKitAttachmentType;
  fileName?: string;
  mimeType?: string;
  fileUrl?: string;
  localFilePath?: string;
  fileSizeBytes?: number;
}

export interface WelcomeKitConfig {
  enabled: boolean;
  includeStageNewEnquiry: boolean;
  delayBetweenItemsMs: number;
  items: WelcomeKitItem[];
  noReplyFollowUp: NoReplyFollowUpConfig;
  updatedAt?: number;
}

export interface AppCustomizedTemplateOption {
  id: string;
  title: string;
  sourceCollection: 'message_templates' | 'stage_messages';
  body: string;
  categoryLabel: string;
}

const STORAGE_CONFIG_KEY = 'ecobill.whatsappWelcomeKit.v1';
const STORAGE_SENT_KEY = 'ecobill.whatsappWelcomeKitSent.v1';
const STORAGE_NO_REPLY_SENT_KEY = 'ecobill.whatsappNoReplySent.v1';
const CONFIG_CHANGED_EVENT = 'ecobill:welcome-kit-config-changed';

export const DEFAULT_NO_REPLY_FOLLOWUP_CONFIG: NoReplyFollowUpConfig = {
  enabled: false,
  afterDays: 2,
  useTestimonialKitItem: true,
  onlyEarlyStages: true,
  messageText:
    'Hi {{customer_name}}, just checking in on your trophy requirement! Wanted to share a quick client testimonial video with you. Let us know whenever you are ready to proceed. – EcoTrophy'
};

export const DEFAULT_WELCOME_KIT_ITEMS: WelcomeKitItem[] = [
  {
    id: 'preset_nff',
    kind: 'nff',
    title: 'NFF (Need Finding Form)',
    enabled: true,
    messageText:
      'Hi {{customer_name}}, welcome to EcoTrophy! To share exact trophy designs & pricing, please share your quick details in our NFF (quantity: {{quantity}}, event date, logo/customization needs).',
    attachmentType: 'none'
  },
  {
    id: 'preset_brochure',
    kind: 'brochure',
    title: 'Company Brochure / Catalogue',
    enabled: true,
    messageText: 'Here is our EcoTrophy Brochure & Catalogue for your reference, {{customer_name}}.',
    attachmentType: 'document'
  },
  {
    id: 'preset_testimonial_video',
    kind: 'testimonial_video',
    title: 'Customer Testimonial Video',
    enabled: true,
    messageText: 'Watch what our clients say about working with EcoTrophy!',
    attachmentType: 'video'
  }
];

export const DEFAULT_WELCOME_KIT_CONFIG: WelcomeKitConfig = {
  enabled: false,
  includeStageNewEnquiry: false,
  delayBetweenItemsMs: 1200,
  items: DEFAULT_WELCOME_KIT_ITEMS,
  noReplyFollowUp: DEFAULT_NO_REPLY_FOLLOWUP_CONFIG
};

function sanitizeNoReplyConfig(raw: any): NoReplyFollowUpConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_NO_REPLY_FOLLOWUP_CONFIG;
  const days = Number(raw.afterDays);
  return {
    enabled: Boolean(raw.enabled),
    afterDays: days >= 1 && days <= 14 ? days : 2,
    useTestimonialKitItem: raw.useTestimonialKitItem !== false,
    onlyEarlyStages: raw.onlyEarlyStages !== false,
    messageText:
      typeof raw.messageText === 'string' && raw.messageText.trim()
        ? raw.messageText
        : DEFAULT_NO_REPLY_FOLLOWUP_CONFIG.messageText,
    attachmentType: raw.attachmentType,
    fileName: raw.fileName ? String(raw.fileName) : undefined,
    mimeType: raw.mimeType ? String(raw.mimeType) : undefined,
    fileUrl: raw.fileUrl ? String(raw.fileUrl) : undefined,
    localFilePath: raw.localFilePath ? String(raw.localFilePath) : undefined,
    fileSizeBytes: typeof raw.fileSizeBytes === 'number' ? raw.fileSizeBytes : undefined
  };
}

function sanitizeConfig(raw: any): WelcomeKitConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_WELCOME_KIT_CONFIG;
  const items: WelcomeKitItem[] = Array.isArray(raw.items)
    ? raw.items.map((it: any, idx: number) => ({
        id: String(it?.id || `item_${idx + 1}`),
        kind: (it?.kind || 'custom_text') as WelcomeKitItemKind,
        title: String(it?.title || `Item ${idx + 1}`),
        enabled: it?.enabled !== false,
        messageText: String(it?.messageText || ''),
        attachmentType: (it?.attachmentType || 'none') as WelcomeKitAttachmentType,
        fileName: it?.fileName ? String(it.fileName) : undefined,
        mimeType: it?.mimeType ? String(it.mimeType) : undefined,
        fileUrl: it?.fileUrl ? String(it.fileUrl) : undefined,
        localFilePath: it?.localFilePath ? String(it.localFilePath) : undefined,
        fileSizeBytes: typeof it?.fileSizeBytes === 'number' ? it.fileSizeBytes : undefined,
        sourceTemplateId: it?.sourceTemplateId ? String(it.sourceTemplateId) : undefined,
        sourceCollection: it?.sourceCollection
      }))
    : DEFAULT_WELCOME_KIT_ITEMS;

  return {
    enabled: Boolean(raw.enabled),
    includeStageNewEnquiry: Boolean(raw.includeStageNewEnquiry),
    delayBetweenItemsMs: Number(raw.delayBetweenItemsMs) >= 400 ? Number(raw.delayBetweenItemsMs) : 1200,
    items,
    noReplyFollowUp: sanitizeNoReplyConfig(raw.noReplyFollowUp),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
  };
}

export function getCachedWelcomeKitConfig(): WelcomeKitConfig {
  if (typeof window === 'undefined') return DEFAULT_WELCOME_KIT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_CONFIG_KEY);
    if (!raw) return DEFAULT_WELCOME_KIT_CONFIG;
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_WELCOME_KIT_CONFIG;
  }
}

function writeLocalWelcomeKitCache(config: WelcomeKitConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT, { detail: config }));
  } catch {
    // ignore storage errors
  }
}

const FALLBACK_STAGE_MSG_DOC_ID = '__whatsapp_welcome_kit';

function isPermissionDeniedError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  return code.includes('permission-denied') || msg.includes('missing or insufficient permissions');
}

export function subscribeWelcomeKitConfig(onUpdate: (config: WelcomeKitConfig) => void): () => void {
  const unsubs: Array<() => void> = [];
  let bestUpdatedAt = 0;

  const publishIfFresher = (candidate: WelcomeKitConfig) => {
    const ts = typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0;
    if (ts >= bestUpdatedAt) {
      bestUpdatedAt = ts;
      writeLocalWelcomeKitCache(candidate);
      onUpdate(candidate);
    }
  };

  if (db) {
    let primaryExists = false;
    let fallbackExists = false;

    const handleSnap = (source: 'primary' | 'fallback', exists: boolean, data: any) => {
      if (source === 'primary') primaryExists = exists;
      if (source === 'fallback') fallbackExists = exists;

      if (exists && data) {
        publishIfFresher(sanitizeConfig(data));
      } else if (!primaryExists && !fallbackExists) {
        onUpdate(getCachedWelcomeKitConfig());
      }
    };

    unsubs.push(
      onSnapshot(
        doc(db, 'whatsapp_welcome_kit', 'default'),
        (snap) => handleSnap('primary', snap.exists(), snap.data()),
        () => {
          if (!fallbackExists) onUpdate(getCachedWelcomeKitConfig());
        }
      )
    );

    // Live fallback mirror inside already-permitted `stage_messages` collection
    unsubs.push(
      onSnapshot(
        doc(db, 'stage_messages', FALLBACK_STAGE_MSG_DOC_ID),
        (snap) => handleSnap('fallback', snap.exists(), snap.data()),
        () => {
          if (!primaryExists) onUpdate(getCachedWelcomeKitConfig());
        }
      )
    );
  }

  const localHandler = (ev: Event) => {
    const custom = ev as CustomEvent<WelcomeKitConfig>;
    if (custom.detail) onUpdate(custom.detail);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener(CONFIG_CHANGED_EVENT, localHandler);
  }

  return () => {
    unsubs.forEach((u) => u());
    if (typeof window !== 'undefined') {
      window.removeEventListener(CONFIG_CHANGED_EVENT, localHandler);
    }
  };
}

export async function saveWelcomeKitConfig(config: WelcomeKitConfig): Promise<WelcomeKitConfig> {
  const now = Date.now();
  const clean = sanitizeConfig({ ...config, updatedAt: now });
  writeLocalWelcomeKitCache(clean);

  if (db) {
    // Firestore rejects undefined values inside nested objects — strip them cleanly
    const firestoreSafeItems = clean.items.map((item) => {
      const out: Record<string, any> = {
        id: item.id,
        kind: item.kind,
        title: item.title,
        enabled: item.enabled,
        messageText: item.messageText,
        attachmentType: item.attachmentType || 'none'
      };
      if (item.fileName) out.fileName = item.fileName;
      if (item.mimeType) out.mimeType = item.mimeType;
      if (item.fileUrl) out.fileUrl = item.fileUrl;
      if (item.localFilePath) out.localFilePath = item.localFilePath;
      if (typeof item.fileSizeBytes === 'number') out.fileSizeBytes = item.fileSizeBytes;
      if (item.sourceTemplateId) out.sourceTemplateId = item.sourceTemplateId;
      if (item.sourceCollection) out.sourceCollection = item.sourceCollection;
      return out;
    });

    const firestoreNoReply: Record<string, any> = {
      enabled: clean.noReplyFollowUp.enabled,
      afterDays: clean.noReplyFollowUp.afterDays,
      useTestimonialKitItem: clean.noReplyFollowUp.useTestimonialKitItem,
      onlyEarlyStages: clean.noReplyFollowUp.onlyEarlyStages,
      messageText: clean.noReplyFollowUp.messageText
    };
    if (clean.noReplyFollowUp.attachmentType) firestoreNoReply.attachmentType = clean.noReplyFollowUp.attachmentType;
    if (clean.noReplyFollowUp.fileName) firestoreNoReply.fileName = clean.noReplyFollowUp.fileName;
    if (clean.noReplyFollowUp.mimeType) firestoreNoReply.mimeType = clean.noReplyFollowUp.mimeType;
    if (clean.noReplyFollowUp.fileUrl) firestoreNoReply.fileUrl = clean.noReplyFollowUp.fileUrl;
    if (clean.noReplyFollowUp.localFilePath) firestoreNoReply.localFilePath = clean.noReplyFollowUp.localFilePath;
    if (typeof clean.noReplyFollowUp.fileSizeBytes === 'number') {
      firestoreNoReply.fileSizeBytes = clean.noReplyFollowUp.fileSizeBytes;
    }

    const payload = {
      enabled: clean.enabled,
      includeStageNewEnquiry: clean.includeStageNewEnquiry,
      delayBetweenItemsMs: clean.delayBetweenItemsMs,
      items: firestoreSafeItems,
      noReplyFollowUp: firestoreNoReply,
      updatedAt: now,
      updated_at: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'whatsapp_welcome_kit', 'default'), payload, { merge: true });
    } catch (err: any) {
      if (!isPermissionDeniedError(err)) {
        throw err;
      }
      // If `whatsapp_welcome_kit` rules aren't deployed yet in Firebase, persist in already-permitted `stage_messages`
      try {
        await setDoc(doc(db, 'stage_messages', FALLBACK_STAGE_MSG_DOC_ID), payload, { merge: true });
      } catch (fallbackErr: any) {
        if (!isPermissionDeniedError(fallbackErr)) {
          throw fallbackErr;
        }
        // Keep local cache + live Desktop automation working even when Firestore rules restrict writes for this role
        console.warn('[WelcomeKit] Cloud sync skipped due to Firestore permissions; saved locally.', fallbackErr);
      }
    }
  }

  return clean;
}

export async function loadAppCustomizedTemplates(): Promise<AppCustomizedTemplateOption[]> {
  const options: AppCustomizedTemplateOption[] = [];

  if (db) {
    try {
      const [msgTplSnap, stageSnap] = await Promise.all([
        getDocs(collection(db, 'message_templates')).catch(() => null),
        getDocs(collection(db, 'stage_messages')).catch(() => null)
      ]);

      if (msgTplSnap) {
        for (const d of msgTplSnap.docs) {
          const data = d.data() as MessageTemplate;
          if (data?.channel === 'whatsapp' && data?.body?.trim()) {
            options.push({
              id: d.id,
              title: data.name || 'Message Template',
              sourceCollection: 'message_templates',
              body: data.body.trim(),
              categoryLabel: 'Message Templates'
            });
          }
        }
      }

      if (stageSnap) {
        for (const d of stageSnap.docs) {
          if (d.id === FALLBACK_STAGE_MSG_DOC_ID || d.id.startsWith('__')) continue;
          const data = d.data() as StageMessageConfig;
          if (data?.whatsapp_enabled !== false && data?.whatsapp_template?.trim()) {
            options.push({
              id: d.id,
              title: `${data.stage_name || d.id} (Stage Message)`,
              sourceCollection: 'stage_messages',
              body: data.whatsapp_template.trim(),
              categoryLabel: 'Stage Automation'
            });
          }
        }
      }
    } catch {
      // Fallback safely below
    }
  }

  // Ensure New Enquiry stage preset is always discoverable even if untouched in Firestore
  if (!options.some((o) => o.sourceCollection === 'stage_messages' && o.id === 'new_enquiry')) {
    const defNew = DEFAULT_STAGE_MESSAGES.new_enquiry;
    if (defNew?.whatsapp_template) {
      options.push({
        id: 'new_enquiry',
        title: 'New Enquiry (Default Stage Message)',
        sourceCollection: 'stage_messages',
        body: defNew.whatsapp_template,
        categoryLabel: 'Stage Automation'
      });
    }
  }

  return options;
}

export async function resolveStageNewEnquiryText(): Promise<string> {
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'stage_messages', 'new_enquiry'));
      if (snap.exists()) {
        const data = snap.data() as StageMessageConfig;
        if (data?.whatsapp_enabled !== false && data?.whatsapp_template?.trim()) {
          return data.whatsapp_template.trim();
        }
        return '';
      }
    } catch {
      // ignore and fall back
    }
  }
  return DEFAULT_STAGE_MESSAGES.new_enquiry?.whatsapp_template || '';
}

export function renderWelcomeKitMessage(
  templateText: string,
  leadContext: {
    name?: string;
    phone?: string;
    company?: string;
    quantity?: string | number;
    eventName?: string;
    requirement?: string;
    stageLabel?: string;
    pipelineName?: string;
  }
): string {
  if (!templateText) return '';
  const leadLike: Partial<Lead> = {
    name: leadContext.name || 'Valued Customer',
    phone: leadContext.phone || '',
    company: leadContext.company || '',
    required_quantity: leadContext.quantity || '',
    event_name: leadContext.eventName || ''
  };
  const ctx = {
    ...buildTemplateContext(leadLike, leadContext.stageLabel || 'New Enquiry', ''),
    source: 'WhatsApp',
    pipeline: leadContext.pipelineName || 'Sales Pipeline',
    stage: leadContext.stageLabel || 'New Enquiry',
    reason: leadContext.requirement || ''
  };
  return renderTemplateText(templateText, ctx).trim();
}

function loadSentRegistry(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_SENT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function buildSentKeys(leadId?: string, phone?: string, contactName?: string): string[] {
  const keys: string[] = [];
  if (leadId) keys.push(`lead:${leadId}`);
  const d10 = extractLast10Digits(phone || '');
  if (d10) keys.push(`phone:${d10}`);
  const normName = String(contactName || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!d10 && normName && normName !== 'whatsapp lead') {
    keys.push(`name:${normName}`);
  }
  return keys;
}

export function hasWelcomeKitBeenSent(params: {
  leadId?: string;
  phone?: string;
  contactName?: string;
}): boolean {
  const registry = loadSentRegistry();
  const keys = buildSentKeys(params.leadId, params.phone, params.contactName);
  return keys.some((k) => Boolean(registry[k]));
}

export function markWelcomeKitSentLocal(params: {
  leadId?: string;
  phone?: string;
  contactName?: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const registry = loadSentRegistry();
    const now = Date.now();
    for (const k of buildSentKeys(params.leadId, params.phone, params.contactName)) {
      registry[k] = now;
    }
    // Keep registry bounded to latest 1500 entries
    const entries = Object.entries(registry);
    if (entries.length > 1500) {
      entries.sort((a, b) => a[1] - b[1]);
      const pruned = Object.fromEntries(entries.slice(-1500));
      window.localStorage.setItem(STORAGE_SENT_KEY, JSON.stringify(pruned));
    } else {
      window.localStorage.setItem(STORAGE_SENT_KEY, JSON.stringify(registry));
    }
  } catch {
    // ignore storage errors
  }
}

export async function recordWelcomeKitDeliveryToCrm(params: {
  leadId?: string;
  phone?: string;
  contactName?: string;
  sourceWhatsappNumber?: string;
  sentSummary: string[];
}): Promise<void> {
  markWelcomeKitSentLocal({
    leadId: params.leadId,
    phone: params.phone,
    contactName: params.contactName
  });

  if (!db || params.sentSummary.length === 0) return;

  const summaryText = `Sent Welcome Kit (${params.sentSummary.join(', ')})`;

  if (params.leadId) {
    await updateDoc(doc(db, 'leads', params.leadId), {
      welcome_kit_sent: true,
      welcome_kit_sent_at: serverTimestamp(),
      last_welcome_kit_items: params.sentSummary,
      updated_at: serverTimestamp()
    }).catch(() => {});

    await addDoc(collection(db, 'activities'), {
      lead_id: params.leadId,
      leadId: params.leadId,
      type: 'whatsapp_welcome_kit',
      title: 'Welcome Kit Auto-Sent via WhatsApp',
      message: summaryText,
      actor: auth?.currentUser?.displayName || auth?.currentUser?.email || 'EcoBill Welcome Kit Automation',
      created_at: serverTimestamp(),
      date: new Date().toISOString()
    }).catch(() => {});
  }

  await addDoc(collection(db, 'messages'), {
    leadId: params.leadId || null,
    senderPhone: params.phone || params.contactName || '',
    sourceWhatsappNumber: params.sourceWhatsappNumber || '',
    direction: 'outbound',
    type: 'text',
    content: summaryText,
    platform: 'whatsapp',
    triggeredBy: 'welcome_kit_automation',
    created_at: serverTimestamp()
  }).catch(() => {});
}

const EARLY_FOLLOWUP_STAGES = new Set([
  'new_enquiry',
  'requirement_collection',
  'requirement_confirmed',
  'design_stage',
  'design_approval',
  'quotation_sent',
  'follow_up'
]);

function extractFirestoreMillis(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val?.toDate === 'function') return val.toDate().getTime();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function loadNoReplySentRegistry(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_NO_REPLY_SENT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function hasNoReplyFollowupBeenSent(params: {
  leadId?: string;
  phone?: string;
  contactName?: string;
}): boolean {
  const registry = loadNoReplySentRegistry();
  return buildSentKeys(params.leadId, params.phone, params.contactName).some((k) => Boolean(registry[k]));
}

export function markNoReplyFollowupSentLocal(params: {
  leadId?: string;
  phone?: string;
  contactName?: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const registry = loadNoReplySentRegistry();
    const now = Date.now();
    for (const k of buildSentKeys(params.leadId, params.phone, params.contactName)) {
      registry[k] = now;
    }
    const entries = Object.entries(registry);
    if (entries.length > 1500) {
      entries.sort((a, b) => a[1] - b[1]);
      window.localStorage.setItem(STORAGE_NO_REPLY_SENT_KEY, JSON.stringify(Object.fromEntries(entries.slice(-1500))));
    } else {
      window.localStorage.setItem(STORAGE_NO_REPLY_SENT_KEY, JSON.stringify(registry));
    }
  } catch {
    // ignore storage errors
  }
}

export interface DueNoReplyLead {
  leadId: string;
  name: string;
  phone: string;
  company?: string;
  quantity?: string;
  eventName?: string;
  requirement?: string;
  stageLabel?: string;
  pipelineId?: string;
  sourceWhatsappNumber?: string;
  sourceSessionId?: string;
  silentHours: number;
}

export async function findDueNoReplyLeadsForTestimonial(
  config: NoReplyFollowUpConfig,
  maxLeadsToReturn = 5
): Promise<DueNoReplyLead[]> {
  if (!db || !config.enabled) return [];

  const waitMs = Math.max(1, config.afterDays || 2) * 24 * 60 * 60 * 1000;
  const maxWindowMs = 14 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  try {
    const q = query(collection(db, 'leads'), orderBy('created_at', 'desc'), limit(150));
    const snap = await getDocs(q);
    const due: DueNoReplyLead[] = [];

    for (const docSnap of snap.docs) {
      if (due.length >= maxLeadsToReturn) break;
      const d = docSnap.data() as any;

      if (d?.no_reply_followup_sent) continue;
      const phone = String(d?.phone || d?.whatsapp_number || d?.normalized_phone || '').trim();
      const name = String(d?.name || '').trim();
      if (!phone && !name) continue;

      if (hasNoReplyFollowupBeenSent({ leadId: docSnap.id, phone, contactName: name })) {
        continue;
      }

      // Only follow up leads captured from / linked to WhatsApp
      const isWhatsAppLead =
        String(d?.source || '').toLowerCase() === 'whatsapp' ||
        Boolean(d?.source_whatsapp_number) ||
        Boolean(d?.whatsapp_number) ||
        Boolean(d?.whatsapp_session_label) ||
        Boolean(d?.welcome_kit_sent);
      if (!isWhatsAppLead) continue;

      const stageId = String(d?.status || 'new_enquiry');
      if (config.onlyEarlyStages && !EARLY_FOLLOWUP_STAGES.has(stageId)) {
        continue;
      }

      const lastCustomerReplyMs =
        extractFirestoreMillis(d?.lastCustomerReplyAt) ||
        extractFirestoreMillis(d?.created_at);
      if (!lastCustomerReplyMs) continue;

      const silentMs = nowMs - lastCustomerReplyMs;
      if (silentMs < waitMs || silentMs > maxWindowMs) continue;

      due.push({
        leadId: docSnap.id,
        name: name || (phone ? `+${phone}` : 'Customer'),
        phone,
        company: d?.company || '',
        quantity: d?.required_quantity ? String(d.required_quantity) : '',
        eventName: d?.event_name || '',
        requirement: d?.requirement || '',
        stageLabel: stageId,
        pipelineId: d?.pipeline_id || '',
        sourceWhatsappNumber: d?.source_whatsapp_number || '',
        sourceSessionId: d?.source_session_id || '',
        silentHours: Math.round(silentMs / (60 * 60 * 1000))
      });
    }

    return due;
  } catch (err) {
    console.warn('[NoReplyFollowUp] Could not query due leads:', err);
    return [];
  }
}

export async function recordNoReplyFollowupDelivery(params: {
  leadId: string;
  phone?: string;
  contactName?: string;
  sourceWhatsappNumber?: string;
  silentHours: number;
  afterDays: number;
  videoLabel: string;
}): Promise<void> {
  markNoReplyFollowupSentLocal({
    leadId: params.leadId,
    phone: params.phone,
    contactName: params.contactName
  });

  if (!db) return;

  const msgText = `Auto-sent ${params.videoLabel} after ${params.afterDays} day(s) of no reply (${params.silentHours}h elapsed)`;

  await updateDoc(doc(db, 'leads', params.leadId), {
    no_reply_followup_sent: true,
    no_reply_followup_sent_at: serverTimestamp(),
    updated_at: serverTimestamp()
  }).catch(() => {});

  await addDoc(collection(db, 'activities'), {
    lead_id: params.leadId,
    leadId: params.leadId,
    type: 'whatsapp_no_reply_followup',
    title: `Testimonial Video Auto-Sent (${params.afterDays}d No Reply)`,
    message: msgText,
    actor: auth?.currentUser?.displayName || auth?.currentUser?.email || 'EcoBill No-Reply Follow-Up',
    created_at: serverTimestamp(),
    date: new Date().toISOString()
  }).catch(() => {});

  await addDoc(collection(db, 'messages'), {
    leadId: params.leadId,
    senderPhone: params.phone || params.contactName || '',
    sourceWhatsappNumber: params.sourceWhatsappNumber || '',
    direction: 'outbound',
    type: 'video',
    content: msgText,
    platform: 'whatsapp',
    triggeredBy: 'no_reply_testimonial_followup',
    created_at: serverTimestamp()
  }).catch(() => {});
}


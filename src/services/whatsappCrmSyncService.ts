import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  DEFAULT_QUANTITY_PIPELINES,
  STANDARD_CRM_STAGES,
  type Lead,
  type Pipeline,
  type PipelineRule
} from '../types';
import { classifyLeadPipeline } from '../utils/pipelineClassifier';
import { extractMetaRequirements } from '../utils/metaRequirementExtractor';
import {
  isMediaOrSystemNoise,
  isCustomerEnquiryLead,
  hasCommercialEnquirySignal,
  extractCustomerAndCompanyInfo,
  isRealContactName,
  WHATSAPP_VENDOR_OR_INDIAMART_RE,
  WHATSAPP_SPAM_OR_ALERT_RE
} from '../utils/whatsappEnquiryQualifier';
import {
  extractLast10Digits,
  formatWhatsAppNumberDisplay,
  normalizeWhatsAppDigits
} from '../utils/whatsappNumberUtils';
import type { AiLeadInsight } from './whatsappMultiSessionService';
import { resolveLeadAssignment } from './leadAssignmentService';
import {
  classifyLeadIntent,
  evaluateFitsQualification,
  evaluateProsperSkills,
  computeSalesQualityAudit,
} from '../utils/salesIntelligenceEngine';
import type { FITSQualificationData } from '../types';

const AUTO_SYNC_STORAGE_KEY = 'ecobill.whatsappAutoCrmSync';
const AUTO_SYNC_EVENT_NAME = 'ecobill:whatsapp-autosync-changed';

export interface CrmSyncOutcome {
  action: 'created' | 'updated' | 'skipped';
  leadId?: string;
  leadName: string;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageLabel: string;
  assignedToId?: string;
  assignedToName?: string;
  reason?: string;
}

const inFlightSyncs = new Map<string, Promise<CrmSyncOutcome>>();
let cachedConfig: { pipelines: Pipeline[]; rules: PipelineRule[]; loadedAt: number } | null = null;

export function getAutoCrmSyncEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
  return raw === null ? true : raw === 'true';
}

export function setAutoCrmSyncEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent(AUTO_SYNC_EVENT_NAME, { detail: enabled }));
}

export function subscribeAutoCrmSyncChange(callback: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => { };
  const handler = (e: Event) => {
    const custom = e as CustomEvent<boolean>;
    callback(Boolean(custom.detail));
  };
  window.addEventListener(AUTO_SYNC_EVENT_NAME, handler);
  return () => window.removeEventListener(AUTO_SYNC_EVENT_NAME, handler);
}

function buildPhoneVariants(raw: string): { canonical: string; variants: string[] } {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return { canonical: '', variants: [] };
  const canonical = digits.length === 10 ? `91${digits}` : digits;
  const local10 = digits.length > 10 ? digits.slice(-10) : digits;
  const variants = Array.from(
    new Set([raw.trim(), digits, canonical, `+${canonical}`, local10, `0${local10}`].filter(Boolean))
  ).slice(0, 10);
  return { canonical, variants };
}

/**
 * Derives a canonical, deterministic Firestore document ID for a WhatsApp lead.
 * Guarantees that even if multiple team members are logged into the same WhatsApp account
 * in different browser windows/computers, all concurrent incoming message events target
 * the exact same Firestore document ID, preventing duplicate lead creation.
 */
export function getDeterministicWhatsAppLeadId(
  canonicalPhone?: string,
  remoteJid?: string,
  orderSuffix?: string
): string {
  const digits = (canonicalPhone || '').replace(/\D/g, '');
  const phone10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const suffix = orderSuffix ? `_${orderSuffix}` : '';
  if (phone10 && phone10.length >= 7) {
    return `lead_wa_${phone10}${suffix}`;
  }
  const cleanJid = (remoteJid || 'contact')
    .replace(/@.*$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return `lead_wa_${cleanJid}${suffix}`;
}

function parseNumericQuantity(rawQty?: string | number): number {
  if (typeof rawQty === 'number' && !isNaN(rawQty) && rawQty > 0) return rawQty;
  if (!rawQty) return 0;
  const match = String(rawQty).match(/(\d{1,6})/);
  if (!match) return 0;
  const parsed = parseInt(match[1], 10);
  return !isNaN(parsed) && parsed > 0 ? parsed : 0;
}

/** Recursively removes undefined fields so Firestore setDoc/updateDoc never fails */
function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(stripUndefined) as unknown as T;
  }
  if (typeof obj === 'object') {
    if (
      obj instanceof Date ||
      typeof (obj as any)?.toMillis === 'function' ||
      (obj as any)?._methodName !== undefined
    ) {
      return obj;
    }
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        clean[k] = stripUndefined(v);
      }
    }
    return clean as unknown as T;
  }
  return obj;
}

function parseNumericBudgetValue(rawBudget?: string): number {
  if (!rawBudget) return 0;
  const match = String(rawBudget).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k)?/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return 0;
  return match[2] ? Math.round(num * 1000) : Math.round(num);
}

async function loadPipelinesAndRules(): Promise<{ pipelines: Pipeline[]; rules: PipelineRule[] }> {
  if (!db) return { pipelines: DEFAULT_QUANTITY_PIPELINES, rules: [] };
  if (cachedConfig && Date.now() - cachedConfig.loadedAt < 60_000) {
    return { pipelines: cachedConfig.pipelines, rules: cachedConfig.rules };
  }

  try {
    const [pipesSnap, rulesSnap] = await Promise.all([
      getDocs(collection(db, 'pipelines')).catch(() => null),
      getDocs(collection(db, 'pipeline_rules')).catch(() => null)
    ]);

    const firestorePipelines = pipesSnap && !pipesSnap.empty
      ? pipesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Pipeline))
      : [];

    const mergedPipelines = [...firestorePipelines];
    DEFAULT_QUANTITY_PIPELINES.forEach((def) => {
      if (!mergedPipelines.some((p) => p.id === def.id)) {
        mergedPipelines.push(def);
      }
    });

    const rules = rulesSnap && !rulesSnap.empty
      ? rulesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PipelineRule))
      : [];

    cachedConfig = { pipelines: mergedPipelines, rules, loadedAt: Date.now() };
    return { pipelines: mergedPipelines, rules };
  } catch {
    return { pipelines: DEFAULT_QUANTITY_PIPELINES, rules: [] };
  }
}

export async function previewCrmPipelineAndStage(
  insight: AiLeadInsight,
  messageText = '',
  options?: { isRepeatCustomer?: boolean }
): Promise<{
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageLabel: string;
  matchedRuleName: string;
  requiredQuantity?: number;
  extracted: ReturnType<typeof extractMetaRequirements>;
}> {
  const { pipelines, rules } = await loadPipelinesAndRules();
  const combinedText = `${messageText || ''}\n${insight.requirement || ''}`.trim();
  const extracted = extractMetaRequirements(combinedText);

  const requiredQuantity =
    parseNumericQuantity(insight.quantity) || extracted.required_quantity;
  const budgetStr = insight.budget || extracted.budget || '';
  const estimatedValue = parseNumericBudgetValue(budgetStr);

  const snapshot: Partial<Lead> = {
    source: 'WhatsApp',
    required_quantity: requiredQuantity,
    value: estimatedValue || undefined,
    urgency: insight.urgency || extracted.urgency || 'medium',
    location: insight.location || extracted.location || '',
    customer_type: extracted.customer_type || '',
    event_type: insight.eventName ? undefined : extracted.event_type || '',
    budget: budgetStr,
    is_repeat_customer: Boolean(options?.isRepeatCustomer),
    customer_lifecycle: options?.isRepeatCustomer ? 'repeat_customer' : 'new_customer'
  };

  const classification = classifyLeadPipeline(snapshot, rules, pipelines);
  const targetPipeline =
    pipelines.find((p) => p.id === classification.pipeline_id) ||
    DEFAULT_QUANTITY_PIPELINES.find((p) => p.id === classification.pipeline_id) ||
    DEFAULT_QUANTITY_PIPELINES[3];

  const validStages = targetPipeline?.stages?.length ? targetPipeline.stages : STANDARD_CRM_STAGES;

  let candidateStageId = insight.pipelineStage || '';
  if (!candidateStageId) {
    if (insight.stage === 'lost') candidateStageId = 'lost_cancelled';
    else if (insight.stage === 'qualified') {
      candidateStageId = requiredQuantity ? 'requirement_confirmed' : 'requirement_collection';
    } else if (insight.stage === 'contacted') {
      candidateStageId = 'follow_up';
    } else {
      candidateStageId = validStages[0]?.id || 'new_enquiry';
    }
  }

  // Never jump past discovery/design stages on initial auto-classification unless explicitly verified
  const matchedStage =
    validStages.find((s) => s.id === candidateStageId) ||
    validStages[0] ||
    STANDARD_CRM_STAGES[0];

  return {
    pipelineId: targetPipeline?.id || classification.pipeline_id,
    pipelineName: targetPipeline?.name || classification.pipeline_name,
    stageId: matchedStage.id,
    stageLabel: matchedStage.label,
    matchedRuleName: classification.matched_rule_name,
    requiredQuantity,
    extracted
  };
}

const GENERIC_CONTACT_NAMES = new Set([
  'unknown',
  'customer',
  'contact',
  'lead',
  'inquiry',
  'whatsapp lead',
  'prospective lead',
  'prospective client',
  'valued customer',
  'meta ai',
  'whatsapp',
  'whatsapp business'
]);

function normalizeNameForDedupe(raw?: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isSpecificContactName(raw?: string): boolean {
  const norm = normalizeNameForDedupe(raw);
  if (norm.length < 4) return false;
  if (GENERIC_CONTACT_NAMES.has(norm)) return false;
  if (/^\+?\d[\d\s\-()]+$/.test(norm)) return false;
  return true;
}

interface CachedLeadEntry {
  id: string;
  data: Lead;
  phones10: string[];
  normName: string;
  emailLower: string;
  lastEventId: string;
}

let cachedLeadIndex: { entries: CachedLeadEntry[]; loadedAt: number } | null = null;

async function getLeadIndex(): Promise<CachedLeadEntry[]> {
  if (!db) return [];
  if (cachedLeadIndex && Date.now() - cachedLeadIndex.loadedAt < 45_000) {
    return cachedLeadIndex.entries;
  }
  const snap = await getDocs(query(collection(db, 'leads'), limit(1000))).catch(() => null);
  if (!snap) return [];
  const entries: CachedLeadEntry[] = snap.docs.map((d) => {
    const data = d.data() as Lead;
    const phones10 = Array.from(
      new Set(
        [data.phone, (data as any).normalized_phone, (data as any).whatsapp_number]
          .map((p) => extractLast10Digits(p))
          .filter((p) => p.length >= 7)
      )
    );
    return {
      id: d.id,
      data,
      phones10,
      normName: normalizeNameForDedupe(data.name),
      emailLower: String(data.email || '').trim().toLowerCase(),
      lastEventId: String((data as any).last_event_id || '')
    };
  });
  cachedLeadIndex = { entries, loadedAt: Date.now() };
  return entries;
}

function upsertCachedLeadIndex(id: string, data: Lead) {
  if (!cachedLeadIndex) return;
  const entry: CachedLeadEntry = {
    id,
    data,
    phones10: Array.from(
      new Set(
        [data.phone, (data as any).normalized_phone, (data as any).whatsapp_number]
          .map((p) => extractLast10Digits(p))
          .filter((p) => p.length >= 7)
      )
    ),
    normName: normalizeNameForDedupe(data.name),
    emailLower: String(data.email || '').trim().toLowerCase(),
    lastEventId: String((data as any).last_event_id || '')
  };
  const idx = cachedLeadIndex.entries.findIndex((e) => e.id === id);
  if (idx >= 0) cachedLeadIndex.entries[idx] = entry;
  else cachedLeadIndex.entries.unshift(entry);
}

const CLOSED_ORDER_STAGES = new Set([
  'delivered',
  'full_payment',
  'completed',
  'lost_cancelled'
]);

const POST_COMMITMENT_STAGES = new Set([
  'advance_payment',
  'production',
  'quality_check',
  'ready_for_dispatch',
  'dispatch'
]);

const REPEAT_ACK_ONLY_RE =
  /^(good\s*(morning|afternoon|evening|night)|gm|gn|happy\s+[\w\s]+|ok+|okay+|kk|thanks?|thank\s*you|tq|received|got it|noted|welcome|fine|super|nice|👍+|🙏+)[.!?\s]*$/i;

const EXPLICIT_NEW_ORDER_RE =
  /\b(new order|another order|repeat order|second order|2nd order|next order|one more order|additional order|separate order|fresh order|order again|need again|want again)\b/i;

function getTimestampMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * When a repeat customer has multiple lead cards, always prefer an active/open
 * order over historical delivered/completed/lost orders, and newest first.
 */
function pickPreferredLeadMatch(
  candidates: Array<{ id: string; data: Lead }>
): { id: string; data: Lead } | null {
  if (candidates.length === 0) return null;
  const deduped = new Map<string, { id: string; data: Lead }>();
  candidates.forEach((c) => deduped.set(c.id, c));

  return (
    Array.from(deduped.values()).sort((a, b) => {
      const aClosed = CLOSED_ORDER_STAGES.has(a.data.status || 'new_enquiry') ? 1 : 0;
      const bClosed = CLOSED_ORDER_STAGES.has(b.data.status || 'new_enquiry') ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;

      const aTime = Math.max(
        getTimestampMillis(a.data.updated_at),
        getTimestampMillis((a.data as any).lastCustomerReplyAt),
        getTimestampMillis(a.data.created_at)
      );
      const bTime = Math.max(
        getTimestampMillis(b.data.updated_at),
        getTimestampMillis((b.data as any).lastCustomerReplyAt),
        getTimestampMillis(b.data.created_at)
      );
      return bTime - aTime;
    })[0] || null
  );
}

function hasRepeatOrderIntent(params: {
  incomingText: string;
  insight: AiLeadInsight;
  requiredQuantity?: number;
  numericBudget: number;
  extractedTrophyType?: string;
}): boolean {
  if (params.insight.isBusinessLead === false) return false;
  const trimmed = (params.incomingText || '').trim();
  if (!trimmed || REPEAT_ACK_ONLY_RE.test(trimmed)) return false;

  return Boolean(
    params.requiredQuantity ||
    params.numericBudget > 0 ||
    EXPLICIT_NEW_ORDER_RE.test(trimmed) ||
    params.insight.trophyType ||
    params.extractedTrophyType ||
    /\b(troph|memento|momento|award|medal|shield|plaque|cup|crystal|acrylic|wooden|gift|souvenir|badge|crest|order|quote|quot|pric|rate|cost|brochure|catalog|design|mockup|enquir|inquir|need|want|requir|pcs|pieces|units)\b/i.test(
      trimmed
    )
  );
}

async function findExistingLead(
  phoneVariants: string[],
  threadEventKey: string,
  options?: { email?: string; candidateNames?: string[]; canonicalPhone?: string; remoteJid?: string }
): Promise<{ id: string; data: Lead } | null> {
  if (!db) return null;

  // Fast direct lookup: If lead was created with canonical deterministic ID, resolve immediately
  const directLeadId = getDeterministicWhatsAppLeadId(options?.canonicalPhone, options?.remoteJid);
  if (directLeadId) {
    const directSnap = await getDoc(doc(db, 'leads', directLeadId)).catch(() => null);
    if (directSnap && directSnap.exists()) {
      return { id: directSnap.id, data: directSnap.data() as Lead };
    }
  }

  const collected: Array<{ id: string; data: Lead }> = [];

  if (phoneVariants.length > 0) {
    const [byPhoneSnap, byNormSnap, byWaSnap] = await Promise.all([
      getDocs(query(collection(db, 'leads'), where('phone', 'in', phoneVariants), limit(25))).catch(() => null),
      getDocs(query(collection(db, 'leads'), where('normalized_phone', 'in', phoneVariants), limit(25))).catch(() => null),
      getDocs(query(collection(db, 'leads'), where('whatsapp_number', 'in', phoneVariants), limit(25))).catch(() => null)
    ]);
    [byPhoneSnap, byNormSnap, byWaSnap].forEach((snap) => {
      snap?.docs.forEach((d) => collected.push({ id: d.id, data: d.data() as Lead }));
    });
    const bestPhoneMatch = pickPreferredLeadMatch(collected);
    if (bestPhoneMatch) return bestPhoneMatch;
  }

  const eventKeys = Array.from(new Set([threadEventKey, options?.remoteJid].filter(Boolean) as string[]));
  for (const key of eventKeys) {
    const byEventSnap = await getDocs(
      query(collection(db, 'leads'), where('last_event_id', '==', key), limit(25))
    ).catch(() => null);
    if (byEventSnap && !byEventSnap.empty) {
      byEventSnap.docs.forEach((d) => collected.push({ id: d.id, data: d.data() as Lead }));
      const bestEventMatch = pickPreferredLeadMatch(collected);
      if (bestEventMatch) return bestEventMatch;
    }
  }

  const emailLower = String(options?.email || '').trim().toLowerCase();
  if (emailLower && emailLower.includes('@')) {
    const byEmailSnap = await getDocs(
      query(collection(db, 'leads'), where('email', '==', emailLower), limit(25))
    ).catch(() => null);
    if (byEmailSnap && !byEmailSnap.empty) {
      byEmailSnap.docs.forEach((d) => collected.push({ id: d.id, data: d.data() as Lead }));
      const bestEmailMatch = pickPreferredLeadMatch(collected);
      if (bestEmailMatch) return bestEmailMatch;
    }
  }

  // Fallback normalized scan across cached leads (catches "+91 98765 43210" formatted strings & saved WhatsApp names)
  const index = await getLeadIndex();
  const candidate10s = new Set<string>();
  if (options?.canonicalPhone) {
    const d = extractLast10Digits(options.canonicalPhone);
    if (d.length >= 7) candidate10s.add(d);
  }
  phoneVariants.forEach((v) => {
    const d = extractLast10Digits(v);
    if (d.length >= 7) candidate10s.add(d);
  });

  if (candidate10s.size > 0) {
    const phoneMatches = index.filter((e) => e.phones10.some((p) => candidate10s.has(p)));
    const best = pickPreferredLeadMatch(phoneMatches.map((m) => ({ id: m.id, data: m.data })));
    if (best) return best;
  }

  if (emailLower && emailLower.includes('@')) {
    const emailMatches = index.filter((e) => e.emailLower === emailLower);
    const best = pickPreferredLeadMatch(emailMatches.map((m) => ({ id: m.id, data: m.data })));
    if (best) return best;
  }

  const nameCandidates = (options?.candidateNames || [])
    .filter((n) => isSpecificContactName(n))
    .map((n) => normalizeNameForDedupe(n));

  if (nameCandidates.length > 0) {
    const nameMatches = index.filter((e) => {
      if (!nameCandidates.includes(e.normName)) return false;
      // Only merge by name if neither has conflicting different phone numbers
      if (candidate10s.size > 0 && e.phones10.length > 0 && !e.phones10.some((p) => candidate10s.has(p))) {
        return false;
      }
      return true;
    });
    const best = pickPreferredLeadMatch(nameMatches.map((m) => ({ id: m.id, data: m.data })));
    if (best) return best;
  }

  return null;
}

/**
 * Checks whether this contact is already saved in the CRM `customers` collection.
 */
export async function findExistingCustomer(phoneVariants: string[]): Promise<{
  id: string;
  name?: string;
  company?: string;
  phone?: string;
} | null> {
  if (!db || !phoneVariants || phoneVariants.length === 0) return null;
  try {
    const [byPhoneSnap, byWaSnap] = await Promise.all([
      getDocs(query(collection(db, 'customers'), where('phone', 'in', phoneVariants), limit(5))).catch(() => null),
      getDocs(query(collection(db, 'customers'), where('whatsapp_number', 'in', phoneVariants), limit(5))).catch(() => null)
    ]);
    const docItem = byPhoneSnap?.docs[0] || byWaSnap?.docs[0];
    if (docItem) {
      const d = docItem.data();
      return {
        id: docItem.id,
        name: d.name,
        company: d.company || d.organization,
        phone: d.phone || d.whatsapp_number
      };
    }
  } catch (err) {
    console.warn('[SyncService] Error finding existing customer:', err);
  }
  return null;
}

export async function findLeadForWhatsAppContact(contact: {
  phone?: string;
  remoteJid?: string;
  name?: string;
  email?: string;
}): Promise<{ id: string; data: Lead } | null> {
  const rawPhone = String(contact.phone || '').trim();
  const phoneVariants = rawPhone ? buildPhoneVariants(rawPhone).variants : [];
  const threadEventKey = contact.remoteJid ? `wa_${contact.remoteJid.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  return findExistingLead(phoneVariants, threadEventKey, {
    canonicalPhone: rawPhone,
    remoteJid: contact.remoteJid,
    candidateNames: contact.name ? [contact.name] : [],
    email: contact.email
  });
}

function resolveStageRank(stageId: string): number {
  return STANDARD_CRM_STAGES.findIndex((s) => s.id === stageId);
}

async function syncConversationAndMessageToCrm(params: {
  leadId: string;
  leadName: string;
  phone: string;
  sessionLabel?: string;
  messageText?: string;
  insight: AiLeadInsight;
  messageTimestamp?: number;
}) {
  if (!db) return;
  const cleanPhone = extractLast10Digits(params.phone);
  const fullPhone = params.phone || (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone);
  const convId = fullPhone
    ? `whatsapp_${fullPhone}`
    : `whatsapp_name_${normalizeNameForDedupe(params.leadName).replace(/[^a-z0-9]+/g, '_')}`;

  const msgText = (params.messageText || params.insight.requirement || '').trim();
  const historicalDate =
    params.messageTimestamp && params.messageTimestamp > 0 && params.messageTimestamp <= Date.now() + 60_000
      ? new Date(params.messageTimestamp)
      : null;

  await setDoc(
    doc(db, 'conversations', convId),
    stripUndefined({
      leadId: params.leadId || '',
      participantPhone: fullPhone || '',
      participantName: params.leadName || '',
      platform: 'whatsapp',
      status: 'open',
      sessionLabel: params.sessionLabel || 'WhatsApp Web',
      lastMessage: msgText,
      lastMessageAt: historicalDate || serverTimestamp(),
      lastCustomerReplyAt: historicalDate || serverTimestamp(),
      lastDirection: 'inbound',
      ai_qualification:
        params.insight.stage === 'qualified'
          ? 'Qualified'
          : params.insight.stage === 'lost'
            ? 'Not Qualified'
            : 'Needs Follow-up',
      ai_suggested_reply: params.insight.suggestedReply || '',
      updated_at: serverTimestamp()
    }),
    { merge: true }
  ).catch(() => { });

  if (msgText) {
    // Deterministic message signature prevents duplicate message entries across restarts
    const dateKey = (historicalDate || new Date()).toISOString().slice(0, 10);
    const msgHash = `${convId}_${msgText.slice(0, 80).replace(/[^a-zA-Z0-9]/g, '_')}_${dateKey}`;
    await setDoc(
      doc(db, 'messages', msgHash),
      stripUndefined({
        conversationId: convId,
        leadId: params.leadId || '',
        senderPhone: fullPhone || '',
        senderName: params.leadName || '',
        direction: 'inbound',
        type: 'text',
        content: msgText,
        metaMessageId: msgHash,
        platform: 'whatsapp',
        sourceAccount: params.sessionLabel || 'WhatsApp Web',
        aiProcessed: true,
        created_at: historicalDate || serverTimestamp()
      }),
      { merge: true }
    ).catch(() => { });
  }
}

export async function syncWhatsAppLeadToCrm(params: {
  sessionId?: string;
  sessionLabel?: string;
  sourceWhatsappNumber?: string;
  remoteJid: string;
  phone?: string;
  name?: string;
  pushname?: string;
  messageText?: string;
  insight: AiLeadInsight;
  forceCreate?: boolean;
  triggeredBy?: 'auto' | 'manual';
  messageTimestamp?: number;
}): Promise<CrmSyncOutcome> {
  const { canonical, variants } = buildPhoneVariants(params.phone || params.insight.phone || '');
  const sourceWhatsappDigits = normalizeWhatsAppDigits(params.sourceWhatsappNumber || '');
  const sourceWhatsappFormatted = formatWhatsAppNumberDisplay(sourceWhatsappDigits);
  const effectiveSessionLabel =
    params.sessionLabel || sourceWhatsappFormatted || 'WhatsApp Web';
  const phone10 = extractLast10Digits(canonical);
  const candidateNames = [params.insight.leadName, params.name].filter(Boolean) as string[];
  const bestNormName = candidateNames.find(isSpecificContactName);
  const dedupeLockKey =
    phone10 ||
    (bestNormName ? `name:${normalizeNameForDedupe(bestNormName)}` : '') ||
    params.remoteJid ||
    `${params.sessionId || 'wa'}:unknown`;

  const existingPromise = inFlightSyncs.get(dedupeLockKey);
  if (existingPromise) {
    return existingPromise;
  }

  const runPromise = (async (): Promise<CrmSyncOutcome> => {
    const resolved = await previewCrmPipelineAndStage(params.insight, params.messageText || '');
    // Prioritize customer's own details (pushname or self-introduction/AI details) over sales-team entered contact name
    const leadDisplayName =
      (params.pushname && isSpecificContactName(params.pushname) ? params.pushname : '') ||
      (isSpecificContactName(params.insight.leadName) ? params.insight.leadName : '') ||
      (params.pushname ? params.pushname : '') ||
      params.insight.leadName ||
      (canonical ? `+${canonical}` : 'WhatsApp Lead');

    if (!db) {
      return {
        action: 'skipped',
        leadName: leadDisplayName,
        pipelineId: resolved.pipelineId,
        pipelineName: resolved.pipelineName,
        stageId: resolved.stageId,
        stageLabel: resolved.stageLabel,
        reason: 'Firestore not initialized'
      };
    }

    const threadEventKey = `${params.sessionId || 'wa'}:${params.remoteJid}`;
    const existing = await findExistingLead(variants, threadEventKey, {
      email: params.insight.email,
      candidateNames,
      canonicalPhone: canonical,
      remoteJid: params.remoteJid
    });

    const now = new Date();
    const historicalDate =
      params.messageTimestamp && params.messageTimestamp > 0 && params.messageTimestamp <= Date.now() + 60_000
        ? new Date(params.messageTimestamp)
        : null;
    const actorId = auth?.currentUser?.uid || 'system_whatsapp_baileys';
    const actorName =
      params.triggeredBy === 'manual'
        ? auth?.currentUser?.displayName || auth?.currentUser?.email || 'CRM User'
        : 'WhatsApp AI Auto-Sync';

    const budgetStr = params.insight.budget || resolved.extracted.budget || '';
    const numericBudget = parseNumericBudgetValue(budgetStr);

    let repeatOrderSourceLead: { id: string; data: Lead } | null = null;

    if (existing) {
      const currentData = existing.data;
      const incomingText = (params.messageText || params.insight.requirement || '').trim();
      const prevLastMsg = String((currentData as any).last_message || '').trim();

      const currentPipelineId = currentData.pipeline_id || 'regular_order';
      const currentStageId = currentData.status || 'new_enquiry';
      const currentRank = resolveStageRank(currentStageId);
      const nextRank = resolveStageRank(resolved.stageId);
      const maxAutoAdvanceRank = resolveStageRank('design_approval');

      const isSameDuplicateText = Boolean(incomingText && prevLastMsg === incomingText);

      // OPTION A: If the customer's previous order is completed/delivered/closed, OR if they explicitly
      // request a new / separate / repeat order, treat this as a NEW requirement and create a new lead card!
      const isClosedStage = CLOSED_ORDER_STAGES.has(currentStageId);
      const isExplicitNewOrder = EXPLICIT_NEW_ORDER_RE.test(incomingText);
      const hasCommercialRequirement =
        hasCommercialEnquirySignal(incomingText, { quantity: params.insight.quantity, budget: params.insight.budget }) ||
        hasRepeatOrderIntent({
          incomingText,
          insight: params.insight,
          requiredQuantity: resolved.requiredQuantity,
          numericBudget,
          extractedTrophyType: resolved.extracted.trophy_type
        });

      const wantsNewOrderCard =
        !params.forceCreate &&
        !isSameDuplicateText &&
        hasCommercialRequirement &&
        (isClosedStage || isExplicitNewOrder);

      if (wantsNewOrderCard) {
        repeatOrderSourceLead = existing;
      } else {
        const existingReplyMs = Math.max(
          getTimestampMillis((currentData as any).lastCustomerReplyAt),
          getTimestampMillis(currentData.created_at)
        );
        if (
          !params.forceCreate &&
          historicalDate &&
          existingReplyMs > historicalDate.getTime() + 60_000
        ) {
          return {
            action: 'skipped',
            leadId: existing.id,
            leadName: currentData.name || leadDisplayName,
            pipelineId: currentPipelineId,
            pipelineName:
              DEFAULT_QUANTITY_PIPELINES.find((p) => p.id === currentPipelineId)?.name || resolved.pipelineName,
            stageId: currentStageId,
            stageLabel: STANDARD_CRM_STAGES.find((s) => s.id === currentStageId)?.label || currentStageId,
            reason: 'Newer activity already exists in CRM'
          };
        }

        // Check if this exact message was already synced and no new fields arrived
        const hasNewField = Boolean(
          (canonical && !currentData.phone) ||
          (sourceWhatsappDigits && !(currentData as any).source_whatsapp_number) ||
          (params.insight.email && !currentData.email) ||
          (params.insight.company && !currentData.company) ||
          (params.insight.location && !currentData.location) ||
          (resolved.requiredQuantity && !currentData.required_quantity) ||
          (budgetStr && !currentData.budget)
        );

        if (!params.forceCreate && incomingText && prevLastMsg === incomingText && !hasNewField) {
          return {
            action: 'skipped',
            leadId: existing.id,
            leadName: currentData.name || leadDisplayName,
            pipelineId: currentPipelineId,
            pipelineName:
              DEFAULT_QUANTITY_PIPELINES.find((p) => p.id === currentPipelineId)?.name || resolved.pipelineName,
            stageId: currentStageId,
            stageLabel: STANDARD_CRM_STAGES.find((s) => s.id === currentStageId)?.label || currentStageId,
            reason: 'Message already synced to CRM'
          };
        }

        // Extract real contact name and organization name to replace raw phone numbers
        const extractedContact = extractCustomerAndCompanyInfo({
          text: incomingText,
          senderName: params.name,
          phone: canonical || currentData.phone,
          aiName: params.insight.leadName,
          aiCompany: params.insight.company,
          existingName: currentData.name,
          existingCompany: currentData.company
        });

        const updatePayload: Record<string, any> = {
          updated_at: serverTimestamp(),
          lastCustomerReplyAt: historicalDate || serverTimestamp(),
          last_message: incomingText || currentData.last_message || '',
          last_message_channel: 'whatsapp',
          last_event_id: threadEventKey,
          whatsapp_session_label: effectiveSessionLabel || (currentData as any).whatsapp_session_label || 'WhatsApp Web',
          urgency: params.insight.urgency || currentData.urgency || 'medium',
          qualification_status:
            params.insight.stage === 'qualified'
              ? 'Qualified'
              : params.insight.stage === 'lost'
                ? 'Not Qualified'
                : currentData.qualification_status || 'Needs Follow-up',
          suggested_reply: params.insight.suggestedReply || currentData.suggested_reply || '',
          next_action: params.insight.suggestedAction || currentData.next_action || ''
        };

        // Save extracted real name instead of raw phone number
        if (extractedContact.hasSpecificName && (!isRealContactName(currentData.name) || !currentData.name)) {
          updatePayload.name = extractedContact.name;
        }
        // Save extracted company/school/organization name
        if (extractedContact.hasSpecificCompany && (!isRealContactName(currentData.company) || !currentData.company)) {
          updatePayload.company = extractedContact.company;
        }

        // Preserve the original business WhatsApp number the lead first came through; backfill if empty
        if (sourceWhatsappDigits && !(currentData as any).source_whatsapp_number) {
          updatePayload.source_whatsapp_number = sourceWhatsappDigits;
        }
        if (effectiveSessionLabel && !(currentData as any).source_whatsapp_label) {
          updatePayload.source_whatsapp_label = effectiveSessionLabel;
        }
        if (params.sessionId && !(currentData as any).source_session_id) {
          updatePayload.source_session_id = params.sessionId;
        }

        if (canonical && !currentData.phone) {
          updatePayload.phone = canonical;
          updatePayload.normalized_phone = canonical;
          updatePayload.whatsapp_number = canonical;
        } else if (canonical && !(currentData as any).normalized_phone) {
          updatePayload.normalized_phone = canonical;
          updatePayload.whatsapp_number = canonical;
        }
        if (params.insight.email && !currentData.email) updatePayload.email = params.insight.email.trim().toLowerCase();
        if ((params.insight.location || resolved.extracted.location) && !currentData.location) {
          updatePayload.location = params.insight.location || resolved.extracted.location;
        }
        if (resolved.requiredQuantity) {
          // Fill if missing, or update if still in early discovery and customer specified a new quantity
          if (!currentData.required_quantity || (currentRank >= 0 && currentRank <= resolveStageRank('requirement_confirmed'))) {
            updatePayload.required_quantity = resolved.requiredQuantity;
          }
        }
        if (budgetStr && (!currentData.budget || (numericBudget > 0 && !currentData.value))) {
          updatePayload.budget = budgetStr;
        }
        if (numericBudget > 0 && !currentData.value) updatePayload.value = numericBudget;
        if ((params.insight.eventName || resolved.extracted.event_name) && !currentData.event_name) {
          updatePayload.event_name = params.insight.eventName || resolved.extracted.event_name;
        }
        if ((params.insight.eventDate || resolved.extracted.event_date) && !currentData.event_date) {
          updatePayload.event_date = params.insight.eventDate || resolved.extracted.event_date;
        }
        if ((params.insight.deliveryDate || resolved.extracted.delivery_date) && !currentData.delivery_date) {
          updatePayload.delivery_date = params.insight.deliveryDate || resolved.extracted.delivery_date;
        }
        if ((params.insight.trophyType || resolved.extracted.trophy_type) && !currentData.trophy_type) {
          updatePayload.trophy_type = params.insight.trophyType || resolved.extracted.trophy_type;
        }
        if ((params.insight.trophySize || resolved.extracted.trophy_size) && !currentData.trophy_size) {
          updatePayload.trophy_size = params.insight.trophySize || resolved.extracted.trophy_size;
        }

        // Enrich requirement summary if the new message contains new meaningful product info
        const existingReq = String(currentData.requirement || '').trim();
        const newReqSnippet = (params.insight.requirement || incomingText).trim();
        if (newReqSnippet && !existingReq) {
          updatePayload.requirement = newReqSnippet;
        } else if (
          newReqSnippet &&
          params.insight.isBusinessLead !== false &&
          !existingReq.toLowerCase().includes(newReqSnippet.toLowerCase().slice(0, 30)) &&
          existingReq.length < 400
        ) {
          updatePayload.requirement = `${existingReq} • ${newReqSnippet}`.slice(0, 500);
        }

        let finalPipelineId = currentPipelineId;
        let finalPipelineName = resolved.pipelineName;
        let finalStageId = currentStageId;
        let finalStageLabel =
          STANDARD_CRM_STAGES.find((s) => s.id === currentStageId)?.label || currentStageId;

        const stageHistory = Array.isArray(currentData.stage_history)
          ? [...currentData.stage_history]
          : [];

        // Re-classify pipeline if it was Unclassified, OR if still in early inquiry and quantity tier changed
        const isEarlyDiscoveryStage = currentRank >= 0 && currentRank <= resolveStageRank('requirement_collection');
        if (
          resolved.requiredQuantity &&
          resolved.pipelineId !== 'unclassified' &&
          (currentPipelineId === 'unclassified' || !currentData.pipeline_id || (isEarlyDiscoveryStage && resolved.pipelineId !== currentPipelineId))
        ) {
          updatePayload.pipeline_id = resolved.pipelineId;
          finalPipelineId = resolved.pipelineId;
        } else {
          const matchedPipe = DEFAULT_QUANTITY_PIPELINES.find((p) => p.id === currentPipelineId);
          if (matchedPipe) finalPipelineName = matchedPipe.name;
        }

        // Advance only early discovery stages automatically without regressing or overriding sales/fulfillment stages
        const canAdvanceStage =
          currentRank >= 0 &&
          currentRank <= maxAutoAdvanceRank &&
          nextRank > currentRank &&
          nextRank <= maxAutoAdvanceRank;

        if (canAdvanceStage) {
          updatePayload.status = resolved.stageId;
          updatePayload.stageEnteredAt = serverTimestamp();
          finalStageId = resolved.stageId;
          finalStageLabel = resolved.stageLabel;

          stageHistory.push({
            from_stage:
              STANDARD_CRM_STAGES.find((s) => s.id === currentStageId)?.label || currentStageId,
            to_stage: resolved.stageLabel,
            changed_by: actorId,
            changed_by_name: actorName,
            changed_at: now,
            note: `WhatsApp follow-up updated stage (${resolved.matchedRuleName}): "${(incomingText || '').slice(0, 100)}"`,
            notification_triggered: false
          });
          updatePayload.stage_history = stageHistory;
        }

        // Strict Assignment Preservation: If lead is already assigned to a team member, KEEP THEM!
        const existingOwnerId = currentData.owner_id || (currentData as any).ownerId;
        if (!existingOwnerId && !currentData.sales_person) {
          // Only assign if completely unassigned
          const autoAssignment = await resolveLeadAssignment({
            source: 'WhatsApp',
            platform: 'meta',
            pipelineId: finalPipelineId,
            whatsappAccountLabel: effectiveSessionLabel,
            whatsappPhone: sourceWhatsappDigits || '',
            phone: canonical || currentData.phone || '',
            requiredQuantity: resolved.requiredQuantity,
            value: numericBudget,
            location: params.insight.location || resolved.extracted.location || currentData.location || '',
            name: updatePayload.name || currentData.name || leadDisplayName,
            company: updatePayload.company || currentData.company || '',
            requirement: incomingText,
            eventName: params.insight.eventName || resolved.extracted.event_name || ''
          }).catch(() => null);

          if (autoAssignment?.assigned) {
            updatePayload.owner_id = autoAssignment.ownerId;
            updatePayload.ownerId = autoAssignment.ownerId;
            updatePayload.sales_person = autoAssignment.ownerName;
            updatePayload.assigned_at = historicalDate || serverTimestamp();
            updatePayload.assigned_by = 'auto_assignment';
            updatePayload.assignment_rule_name = autoAssignment.ruleName || autoAssignment.mode;
          }
        }

        // Refresh EcoTrophy Intent, PROSPER and Audit on message update
        const updatedIntent = classifyLeadIntent({
          text: incomingText || currentData.requirement || '',
          quantity: updatePayload.required_quantity || currentData.required_quantity,
          budget: updatePayload.value || currentData.value,
          eventName: updatePayload.event_name || currentData.event_name,
          eventDate: updatePayload.event_date || currentData.event_date,
          company: updatePayload.company || currentData.company,
          isRepeatCustomer: currentData.is_repeat_customer,
        });
        updatePayload.intent_tier = updatedIntent.tier;
        updatePayload.intent_score = updatedIntent.score;
        updatePayload.intent_reasons = updatedIntent.reasons;

        const updatedProsper = evaluateProsperSkills(
          `${currentData.last_message || ''}\n${incomingText || ''}`,
          currentData.reason || ''
        );
        updatePayload.prosper_breakdown = updatedProsper;
        updatePayload.sales_audit = computeSalesQualityAudit(
          { ...currentData, ...updatePayload } as Lead,
          incomingText || ''
        );

        let deletedStaleCacheHit = false;
        try {
          await updateDoc(doc(db, 'leads', existing.id), stripUndefined(updatePayload));
        } catch (err: any) {
          const msg = String(err?.message || '');
          if (err?.code === 'not-found' || /no document to update/i.test(msg)) {
            // Lead was deleted from Firestore within the 45s cache TTL; invalidate cache and create a fresh lead card
            cachedLeadIndex = null;
            deletedStaleCacheHit = true;
          } else {
            throw err;
          }
        }

        if (!deletedStaleCacheHit) {
          upsertCachedLeadIndex(existing.id, { ...currentData, ...updatePayload } as Lead);

          await syncConversationAndMessageToCrm({
            leadId: existing.id,
            leadName: updatePayload.name || currentData.name || leadDisplayName,
            phone: canonical || currentData.phone || '',
            sessionLabel: params.sessionLabel,
            messageText: incomingText,
            insight: params.insight,
            messageTimestamp: params.messageTimestamp
          });

          await addDoc(collection(db, 'activities'), {
            lead_id: existing.id,
            leadId: existing.id,
            type: 'whatsapp_ai_update',
            title: `WhatsApp Reply Synced (${finalStageLabel})`,
            message: incomingText || 'New WhatsApp message synced',
            actor: actorName,
            sourceAccount: params.sessionLabel || 'WhatsApp Web',
            created_at: historicalDate || serverTimestamp(),
            date: (historicalDate || now).toISOString()
          }).catch(() => { });

          return {
            action: 'updated',
            leadId: existing.id,
            leadName: updatePayload.name || currentData.name || leadDisplayName,
            pipelineId: finalPipelineId,
            pipelineName: finalPipelineName,
            stageId: finalStageId,
            stageLabel: finalStageLabel
          };
        }
      }
    }

    // 1. Check if this contact is already saved in customers collection
    const existingCustomer = await findExistingCustomer(variants);
    const isContactSaved = Boolean(existingCustomer);

    const candidateIncomingText = (params.messageText || params.insight.requirement || '').trim();

    // 2. Extract real customer personal name and company/organization name from chat text and AI signals
    const extractedContact = extractCustomerAndCompanyInfo({
      text: candidateIncomingText,
      senderName: params.pushname || '',
      pushname: params.pushname,
      phone: canonical,
      aiName: params.insight.leadName,
      aiCompany: params.insight.company,
      existingName: existingCustomer?.name || repeatOrderSourceLead?.data?.name,
      existingCompany: existingCustomer?.company || repeatOrderSourceLead?.data?.company
    });

    const hasIntroducedName = Boolean(extractedContact.hasSpecificName && isRealContactName(extractedContact.name));
    const hasIntroducedCompany = Boolean(extractedContact.hasSpecificCompany && isRealContactName(extractedContact.company));
    const hasIntroducedNameOrCompany = hasIntroducedName || hasIntroducedCompany || Boolean(existingCustomer && isRealContactName(existingCustomer.name));

    const hasExplicitRequirement =
      hasCommercialEnquirySignal(candidateIncomingText, {
        quantity: params.insight.quantity,
        budget: params.insight.budget
      }) ||
      hasCommercialEnquirySignal(params.insight.requirement || '', {
        quantity: params.insight.quantity,
        budget: params.insight.budget
      }) ||
      Boolean(resolved.requiredQuantity && resolved.requiredQuantity > 0);

    // 3. Filter out vendor pitches, IndiaMART broadcasts, spam, or media noise
    const isSpamOrNoise =
      WHATSAPP_VENDOR_OR_INDIAMART_RE.test(candidateIncomingText) ||
      WHATSAPP_SPAM_OR_ALERT_RE.test(candidateIncomingText) ||
      isMediaOrSystemNoise(candidateIncomingText);

    if (!params.forceCreate && isSpamOrNoise) {
      return {
        action: 'skipped',
        leadName: leadDisplayName,
        pipelineId: resolved.pipelineId,
        pipelineName: resolved.pipelineName,
        stageId: resolved.stageId,
        stageLabel: resolved.stageLabel,
        reason: 'Filtered out vendor pitch / IndiaMART broadcast / promotional message / noise'
      };
    }

    // 4. TROPHY ENQUIRY & AI QUALIFICATION GATE FOR NEW LEADS:
    // Only add a new contact to the CRM as a lead when they enquire about a trophy/awards.
    // - If AI is unsure (flag_for_review or confidence < 0.70) -> prompt rep: "Is this a lead?"
    // - If non-trophy message from a new contact -> skip cleanly (no CRM lead entry)
    const isTrophyEnquiry =
      hasExplicitRequirement ||
      params.insight.isBusinessLead === true ||
      Boolean(params.insight.trophyType || resolved.extracted.trophy_type);

    if (!params.forceCreate && !isContactSaved && !repeatOrderSourceLead) {
      if (params.insight.flagForReview || (params.insight.confidenceScore && params.insight.confidenceScore < 0.7)) {
        return {
          action: 'skipped',
          leadName: leadDisplayName,
          pipelineId: resolved.pipelineId,
          pipelineName: resolved.pipelineName,
          stageId: resolved.stageId,
          stageLabel: resolved.stageLabel,
          reason: 'Waiting for user confirmation - Is this a lead?'
        };
      }

      if (!isTrophyEnquiry) {
        return {
          action: 'skipped',
          leadName: leadDisplayName,
          pipelineId: resolved.pipelineId,
          pipelineName: resolved.pipelineName,
          stageId: resolved.stageId,
          stageLabel: resolved.stageLabel,
          reason: 'Non-trophy enquiry from new contact. CRM lead creation skipped.'
        };
      }
    }

    // 5. USER CONTACT SAVING RULE:
    // If the contact is not saved and neither name, company, nor order specs are present:
    // prompt user confirmation rather than creating an empty anonymous lead
    if (!params.forceCreate && !isContactSaved && !hasIntroducedNameOrCompany && !hasExplicitRequirement) {
      return {
        action: 'skipped',
        leadName: leadDisplayName,
        pipelineId: resolved.pipelineId,
        pipelineName: resolved.pipelineName,
        stageId: resolved.stageId,
        stageLabel: resolved.stageLabel,
        reason: 'Waiting for user confirmation - Is this a lead?'
      };
    }

    // Strict De-duplication: Double check that lead does not already exist before creating a new card
    // (Skipped when repeatOrderSourceLead is active, since this is a verified new requirement for an existing customer)
    if (!repeatOrderSourceLead) {
      const duplicateCheck = await findExistingLead(variants, threadEventKey, {
        canonicalPhone: canonical,
        remoteJid: params.remoteJid,
        candidateNames
      });
      if (duplicateCheck) {
        return {
          action: 'skipped',
          leadId: duplicateCheck.id,
          leadName: duplicateCheck.data.name || leadDisplayName,
          pipelineId: duplicateCheck.data.pipeline_id || resolved.pipelineId,
          pipelineName: resolved.pipelineName,
          stageId: duplicateCheck.data.status || resolved.stageId,
          stageLabel: resolved.stageLabel,
          reason: 'Lead already exists in CRM'
        };
      }
    }

    const isRepeatCustomer = Boolean(repeatOrderSourceLead || (existingCustomer && existingCustomer.id));
    const priorData = repeatOrderSourceLead?.data;

    const effectiveLeadName =
      (params.pushname && isSpecificContactName(params.pushname) ? params.pushname : '') ||
      extractedContact.name ||
      existingCustomer?.name ||
      priorData?.name ||
      leadDisplayName;
    const effectiveCompany = extractedContact.company || existingCustomer?.company || params.insight.company || priorData?.company || resolved.extracted.organization || '';

    // Assignment: If this is an existing customer, strictly retain their prior assigned team member!
    const priorOwnerId = priorData?.owner_id || (priorData as any)?.ownerId;
    const priorSalesPerson = priorData?.sales_person;

    let finalOwnerId = priorOwnerId || '';
    let finalSalesPerson = priorSalesPerson || '';
    let assignmentMode = priorOwnerId ? 'Existing Team Member Retained' : '';

    if (!finalOwnerId) {
      const autoAssignment = await resolveLeadAssignment({
        source: 'WhatsApp',
        platform: 'meta',
        pipelineId: resolved.pipelineId,
        whatsappAccountLabel: effectiveSessionLabel,
        whatsappPhone: sourceWhatsappDigits || '',
        phone: canonical, // Preserves team member assignment if customer previously spoke to someone
        requiredQuantity: resolved.requiredQuantity,
        value: numericBudget,
        location: params.insight.location || resolved.extracted.location || priorData?.location || '',
        name: effectiveLeadName,
        company: effectiveCompany,
        requirement: params.insight.requirement || params.messageText || '',
        eventName: params.insight.eventName || resolved.extracted.event_name || ''
      }).catch(() => ({ assigned: false, ownerId: '', ownerName: '', ruleName: undefined, mode: 'unassigned' as const }));

      if (autoAssignment.assigned) {
        finalOwnerId = autoAssignment.ownerId;
        finalSalesPerson = autoAssignment.ownerName;
        assignmentMode = autoAssignment.ruleName || autoAssignment.mode;
      }
    }

    const qualificationStatus =
      params.insight.stage === 'qualified'
        ? 'Qualified'
        : params.insight.stage === 'lost'
          ? 'Not Qualified'
          : 'Needs Follow-up';

    // EcoTrophy AI Sales Intelligence: compute Intent, FITS, PROSPER, and Audit
    const intentResult = classifyLeadIntent({
      text: params.messageText || params.insight.requirement || '',
      quantity: resolved.requiredQuantity || params.insight.quantity,
      budget: numericBudget,
      eventName: params.insight.eventName || resolved.extracted.event_name,
      eventDate: params.insight.eventDate || resolved.extracted.event_date,
      deliveryDate: params.insight.deliveryDate || resolved.extracted.delivery_date,
      company: effectiveCompany,
      isRepeatCustomer,
    });

    const initialFits: FITSQualificationData = {
      fit_status: 'fit',
      intent_level: intentResult.tier.toLowerCase() as 'high' | 'medium' | 'low',
      event_importance: params.insight.eventName || resolved.extracted.event_name || 'Standard Event',
      timeline_date: params.insight.eventDate || resolved.extracted.event_date || '',
      delivery_pincode: params.insight.location || resolved.extracted.location || '',
      urgency_status: params.insight.urgency === 'high' ? 'urgent' : 'normal',
      scope_quantity: parseNumericQuantity(resolved.requiredQuantity || params.insight.quantity) || 0,
      scope_budget_limit: numericBudget || 0,
      scope_material_preference: params.insight.trophyType || resolved.extracted.trophy_type || '',
      completed_at: historicalDate || now,
    };
    const fitsEval = evaluateFitsQualification(initialFits);
    const initialProsper = evaluateProsperSkills(params.messageText || '');

    const newLeadPayload = {
      name: effectiveLeadName,
      company: effectiveCompany,
      phone: canonical || '',
      normalized_phone: canonical || '',
      whatsapp_number: canonical || '',
      email: (params.insight.email || priorData?.email || '').trim().toLowerCase(),
      location: params.insight.location || resolved.extracted.location || priorData?.location || '',
      required_quantity: resolved.requiredQuantity || '',
      value: numericBudget,
      budget: budgetStr,
      event_name: params.insight.eventName || resolved.extracted.event_name || '',
      event_type: resolved.extracted.event_type || '',
      event_date: params.insight.eventDate || resolved.extracted.event_date || '',
      delivery_date: params.insight.deliveryDate || resolved.extracted.delivery_date || '',
      trophy_type: params.insight.trophyType || resolved.extracted.trophy_type || '',
      trophy_size: params.insight.trophySize || resolved.extracted.trophy_size || '',
      customer_type: resolved.extracted.customer_type || '',
      requirement: params.insight.requirement || params.messageText || '',
      urgency: params.insight.urgency || resolved.extracted.urgency || 'medium',
      pipeline_id: resolved.pipelineId,
      status: resolved.stageId,
      owner_id: finalOwnerId,
      ownerId: finalOwnerId,
      sales_person: finalSalesPerson,
      ...(finalOwnerId
        ? {
          assigned_at: historicalDate || serverTimestamp(),
          assigned_by: isRepeatCustomer ? 'repeat_customer_retention' : 'auto_assignment',
          assignment_rule_name: assignmentMode
        }
        : {}),
      source: 'WhatsApp',
      platform: 'meta',
      source_whatsapp_number: sourceWhatsappDigits || '',
      source_whatsapp_label: effectiveSessionLabel,
      source_session_id: params.sessionId || '',
      whatsapp_session_label: effectiveSessionLabel,
      last_message: params.messageText || params.insight.requirement || '',
      last_message_channel: 'whatsapp',
      last_event_id: threadEventKey,
      qualification_status: qualificationStatus,
      qualification_reason: `${resolved.matchedRuleName} • ${params.insight.suggestedAction}`,
      suggested_reply: params.insight.suggestedReply || '',
      next_action: params.insight.suggestedAction || '',
      notes: `${isRepeatCustomer ? `New requirement from existing customer (Previous Order Status: ${STANDARD_CRM_STAGES.find((s) => s.id === priorData?.status)?.label || priorData?.status || 'Closed'})\n` : ''}Account: ${params.sessionLabel || 'WhatsApp Web'}\nRequirement: ${params.insight.requirement || params.messageText || ''}\nQuantity: ${resolved.requiredQuantity || params.insight.quantity || 'Not specified'}\nBudget: ${budgetStr || 'Not specified'}\nAI Action: ${params.insight.suggestedAction}`,
      is_repeat_customer: isRepeatCustomer,
      customer_lifecycle: isRepeatCustomer ? 'repeat_customer' : 'new_customer',
      // EcoTrophy AI Sales Intelligence Fields
      intent_tier: intentResult.tier,
      intent_score: intentResult.score,
      intent_reasons: intentResult.reasons,
      fits_data: initialFits,
      fits_score: fitsEval.score,
      prosper_breakdown: initialProsper,
      sales_audit: computeSalesQualityAudit(
        {
          name: effectiveLeadName,
          status: resolved.stageId,
          fits_data: initialFits,
          fits_score: fitsEval.score,
          prosper_breakdown: initialProsper,
          created_at: historicalDate || now,
        } as unknown as Lead,
        params.messageText || ''
      ),
      stage_history: [
        {
          from_stage: isRepeatCustomer ? 'Repeat WhatsApp Order' : 'WhatsApp Inbound',
          to_stage: resolved.stageLabel,
          changed_by: actorId,
          changed_by_name: actorName,
          changed_at: historicalDate || now,
          note: `${isRepeatCustomer ? 'Repeat requirement captured' : 'Captured'} from ${params.sessionLabel || 'WhatsApp Web'} → ${resolved.pipelineName} (${resolved.matchedRuleName})`,
          notification_triggered: false
        }
      ],
      notification_history: [],
      notifications_sent: {},
      stageEnteredAt: historicalDate || serverTimestamp(),
      lastCustomerReplyAt: historicalDate || serverTimestamp(),
      created_at: historicalDate || serverTimestamp(),
      updated_at: serverTimestamp()
    };

    // Multi-member concurrency protection: derive deterministic document ID so all logged-in team members resolve to the same doc
    const targetLeadDocId = getDeterministicWhatsAppLeadId(
      canonical,
      params.remoteJid,
      repeatOrderSourceLead
        ? `repeat_${(historicalDate || now).toISOString().slice(0, 10).replace(/-/g, '')}`
        : undefined
    );

    let finalAction: 'created' | 'updated' = 'created';
    let leadRefId = targetLeadDocId;

    try {
      await runTransaction(db, async (transaction) => {
        const leadDocRef = doc(db, 'leads', targetLeadDocId);
        const existingSnap = await transaction.get(leadDocRef);

        if (existingSnap.exists()) {
          // Another team member logged into this WhatsApp number already committed the lead record!
          finalAction = 'updated';
          leadRefId = targetLeadDocId;
          const serverLead = existingSnap.data() as Lead;

          // Merge latest message without overwriting assigned owner or reverting stage
          const updatePatch: Record<string, any> = {
            updated_at: serverTimestamp(),
            lastCustomerReplyAt: historicalDate || serverTimestamp(),
            last_message: params.messageText || params.insight.requirement || serverLead.last_message || '',
            last_message_channel: 'whatsapp',
            last_event_id: threadEventKey,
            whatsapp_session_label:
              effectiveSessionLabel || (serverLead as any).whatsapp_session_label || 'WhatsApp Web'
          };
          if (resolved.requiredQuantity && !serverLead.required_quantity) {
            updatePatch.required_quantity = resolved.requiredQuantity;
          }
          if (budgetStr && !serverLead.budget) {
            updatePatch.budget = budgetStr;
          }
          if (numericBudget > 0 && !serverLead.value) {
            updatePatch.value = numericBudget;
          }
          transaction.update(leadDocRef, stripUndefined(updatePatch));
        } else {
          // First team member to process this lead: atomic create
          finalAction = 'created';
          leadRefId = targetLeadDocId;
          transaction.set(leadDocRef, stripUndefined(newLeadPayload));
        }
      });
    } catch (txErr) {
      console.warn('[SyncService] Transaction creation conflict, falling back to idempotent setDoc:', txErr);
      const leadDocRef = doc(db, 'leads', targetLeadDocId);
      await setDoc(leadDocRef, stripUndefined(newLeadPayload), { merge: true });
      leadRefId = targetLeadDocId;
    }

    upsertCachedLeadIndex(leadRefId, newLeadPayload as unknown as Lead);

    // Ensure matching Customer doc exists (deduplicated by phone)
    if (variants.length > 0) {
      const custSnap = await getDocs(
        query(collection(db, 'customers'), where('phone', 'in', variants), limit(1))
      ).catch(() => null);
      if (!custSnap || custSnap.empty) {
        await addDoc(collection(db, 'customers'), {
          name: effectiveLeadName,
          phone: canonical,
          whatsapp_number: canonical,
          email: (params.insight.email || priorData?.email || '').trim().toLowerCase(),
          company: effectiveCompany,
          billing_address: params.insight.location || resolved.extracted.location || priorData?.location || '',
          type: effectiveCompany ? 'business' : 'individual',
          customer_type: isRepeatCustomer ? 'repeat' : 'new',
          notes: hasIntroducedNameOrCompany
            ? `Auto-saved contact from WhatsApp chat (${resolved.pipelineName})`
            : `Added from WhatsApp (${resolved.pipelineName})`,
          created_at: serverTimestamp()
        }).catch(() => { });
      } else {
        const custDoc = custSnap.docs[0];
        const updateCustPayload: any = { updated_at: serverTimestamp() };
        if (isRepeatCustomer) updateCustPayload.customer_type = 'repeat';
        if (effectiveCompany && !custDoc.data().company) updateCustPayload.company = effectiveCompany;
        if (isRealContactName(effectiveLeadName) && (!custDoc.data().name || !isRealContactName(custDoc.data().name))) {
          updateCustPayload.name = effectiveLeadName;
        }
        await updateDoc(doc(db, 'customers', custDoc.id), updateCustPayload).catch(() => { });
      }
    }

    await syncConversationAndMessageToCrm({
      leadId: leadRefId,
      leadName: effectiveLeadName,
      phone: canonical,
      sessionLabel: params.sessionLabel,
      messageText: params.messageText,
      insight: params.insight,
      messageTimestamp: params.messageTimestamp
    });

    await addDoc(collection(db, 'activities'), {
      lead_id: leadRefId,
      leadId: leadRefId,
      type: 'whatsapp_ai_qualification',
      title: `${isRepeatCustomer ? 'Repeat Order Lead' : 'New WhatsApp Lead'} → ${resolved.pipelineName}`,
      message: `Added at stage "${resolved.stageLabel}". Requirement: ${params.insight.requirement || params.messageText || ''}`,
      actor: actorName,
      sourceAccount: params.sessionLabel || 'WhatsApp Web',
      created_at: historicalDate || serverTimestamp(),
      date: (historicalDate || now).toISOString()
    }).catch(() => { });

    return {
      action: finalAction,
      leadId: leadRefId,
      leadName: effectiveLeadName,
      pipelineId: resolved.pipelineId,
      pipelineName: resolved.pipelineName,
      stageId: resolved.stageId,
      stageLabel: resolved.stageLabel,
      assignedToId: finalOwnerId || undefined,
      assignedToName: finalSalesPerson || undefined
    };
  })();

  inFlightSyncs.set(dedupeLockKey, runPromise);
  try {
    return await runPromise;
  } finally {
    inFlightSyncs.delete(dedupeLockKey);
  }
}


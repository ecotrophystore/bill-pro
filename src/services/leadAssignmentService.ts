import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Lead, User } from '../types';
import { getLeadOwnerId } from '../utils/leadVisibility';

export type LeadAssignmentSplitMode = 'equal_split' | 'weighted_split' | 'rules_only';

export type LeadAssignmentRuleField =
  | 'source'
  | 'whatsapp_account'
  | 'pipeline_id'
  | 'required_quantity'
  | 'value'
  | 'location'
  | 'keyword';

export type LeadAssignmentRuleOperator = 'equals' | 'contains' | 'gte' | 'lte' | 'between';

export interface TeamAssignee {
  userId: string;
  name: string;
  email: string;
  role: string;
  weight: number;
  active: boolean;
}

export interface LeadAssignmentRule {
  id: string;
  name: string;
  enabled: boolean;
  field: LeadAssignmentRuleField;
  operator: LeadAssignmentRuleOperator;
  value: string;
  secondaryValue?: string;
  assignMode: 'specific_user' | 'subset_split';
  assigneeIds: string[];
}

export interface LeadAssignmentConfig {
  enabled: boolean;
  splitMode: LeadAssignmentSplitMode;
  selectedMembers: TeamAssignee[];
  rules: LeadAssignmentRule[];
  updatedAt?: number;
  updatedBy?: string;
}

export interface LeadAssignmentRuntimeState {
  poolCursor: number;
  ruleCursors: Record<string, number>;
  lastAssignedUserId?: string;
  lastAssignedUserName?: string;
  lastAssignedRuleName?: string;
  lastAssignedAt?: number;
  totalAutoAssigned: number;
}

export interface LeadAssignmentContext {
  source?: string;
  platform?: string;
  pipelineId?: string;
  whatsappAccountLabel?: string;
  whatsappPhone?: string;
  requiredQuantity?: string | number;
  value?: number;
  location?: string;
  name?: string;
  company?: string;
  requirement?: string;
  campaign?: string;
  eventName?: string;
}

export interface LeadAssignmentResult {
  assigned: boolean;
  ownerId: string;
  ownerName: string;
  ownerEmail?: string;
  ruleName?: string;
  mode: 'rule_specific' | 'rule_split' | 'equal_split' | 'weighted_split' | 'unassigned';
}

const STORAGE_CONFIG_KEY = 'ecobill_lead_assignment_config_v1';
const STORAGE_STATE_KEY = 'ecobill_lead_assignment_state_v1';
const CONFIG_CHANGED_EVENT = 'ecobill:lead-assignment-changed';
export const ASSIGNMENT_STATE_DOC_ID = '__lead_assignment_state';

export const DEFAULT_LEAD_ASSIGNMENT_CONFIG: LeadAssignmentConfig = {
  enabled: false,
  splitMode: 'equal_split',
  selectedMembers: [],
  rules: [],
  updatedAt: 0,
};

export const DEFAULT_LEAD_ASSIGNMENT_STATE: LeadAssignmentRuntimeState = {
  poolCursor: 0,
  ruleCursors: {},
  totalAutoAssigned: 0,
};

function clampWeight(raw: any): number {
  const n = Math.round(Number(raw) || 1);
  if (n < 1) return 1;
  if (n > 10) return 10;
  return n;
}

export function sanitizeAssignmentConfig(raw: any): LeadAssignmentConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_LEAD_ASSIGNMENT_CONFIG;

  const splitMode: LeadAssignmentSplitMode =
    raw.splitMode === 'weighted_split' || raw.splitMode === 'rules_only' ? raw.splitMode : 'equal_split';

  const selectedMembers: TeamAssignee[] = Array.isArray(raw.selectedMembers)
    ? raw.selectedMembers
        .filter((m: any) => m && m.userId)
        .map((m: any) => ({
          userId: String(m.userId),
          name: String(m.name || m.email || 'Team Member'),
          email: String(m.email || ''),
          role: String(m.role || 'sales'),
          weight: clampWeight(m.weight),
          active: m.active !== false,
        }))
    : [];

  const rules: LeadAssignmentRule[] = Array.isArray(raw.rules)
    ? raw.rules
        .filter((r: any) => r && r.id)
        .map((r: any) => ({
          id: String(r.id),
          name: String(r.name || 'Routing Rule'),
          enabled: r.enabled !== false,
          field: (
            ['source', 'whatsapp_account', 'pipeline_id', 'required_quantity', 'value', 'location', 'keyword'].includes(
              r.field
            )
              ? r.field
              : 'source'
          ) as LeadAssignmentRuleField,
          operator: (
            ['equals', 'contains', 'gte', 'lte', 'between'].includes(r.operator) ? r.operator : 'contains'
          ) as LeadAssignmentRuleOperator,
          value: String(r.value ?? ''),
          secondaryValue: r.secondaryValue !== undefined ? String(r.secondaryValue) : undefined,
          assignMode: r.assignMode === 'subset_split' ? 'subset_split' : 'specific_user',
          assigneeIds: Array.isArray(r.assigneeIds) ? r.assigneeIds.map((id: any) => String(id)).filter(Boolean) : [],
        }))
    : [];

  return {
    enabled: Boolean(raw.enabled),
    splitMode,
    selectedMembers,
    rules,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
  };
}

function readLocalAssignmentConfig(): LeadAssignmentConfig {
  if (typeof window === 'undefined') return DEFAULT_LEAD_ASSIGNMENT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_CONFIG_KEY);
    if (!raw) return DEFAULT_LEAD_ASSIGNMENT_CONFIG;
    return sanitizeAssignmentConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_LEAD_ASSIGNMENT_CONFIG;
  }
}

function writeLocalAssignmentConfig(config: LeadAssignmentConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT, { detail: config }));
  } catch {
    // ignore storage errors
  }
}

function readLocalAssignmentState(): LeadAssignmentRuntimeState {
  if (typeof window === 'undefined') return DEFAULT_LEAD_ASSIGNMENT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_STATE_KEY);
    if (!raw) return DEFAULT_LEAD_ASSIGNMENT_STATE;
    const parsed = JSON.parse(raw);
    return {
      poolCursor: Math.max(0, Number(parsed?.poolCursor) || 0),
      ruleCursors: parsed?.ruleCursors && typeof parsed.ruleCursors === 'object' ? parsed.ruleCursors : {},
      lastAssignedUserId: parsed?.lastAssignedUserId,
      lastAssignedUserName: parsed?.lastAssignedUserName,
      lastAssignedRuleName: parsed?.lastAssignedRuleName,
      lastAssignedAt: typeof parsed?.lastAssignedAt === 'number' ? parsed.lastAssignedAt : undefined,
      totalAutoAssigned: Math.max(0, Number(parsed?.totalAutoAssigned) || 0),
    };
  } catch {
    return DEFAULT_LEAD_ASSIGNMENT_STATE;
  }
}

function writeLocalAssignmentState(state: LeadAssignmentRuntimeState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function subscribeLeadAssignmentConfig(onUpdate: (config: LeadAssignmentConfig) => void): () => void {
  const unsubs: Array<() => void> = [];
  let bestTs = 0;

  // Immediate cache emission
  const cached = readLocalAssignmentConfig();
  onUpdate(cached);

  const publishIfFresher = (candidate: LeadAssignmentConfig) => {
    const ts = candidate.updatedAt || 0;
    if (ts >= bestTs) {
      bestTs = ts;
      writeLocalAssignmentConfig(candidate);
      onUpdate(candidate);
    }
  };

  if (db) {
    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'lead_assignment'),
        (snap) => {
          if (snap.exists()) {
            publishIfFresher(sanitizeAssignmentConfig(snap.data()));
          }
        },
        () => {}
      )
    );
  }

  const localHandler = (ev: Event) => {
    const custom = ev as CustomEvent<LeadAssignmentConfig>;
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

export function subscribeLeadAssignmentState(onUpdate: (state: LeadAssignmentRuntimeState) => void): () => void {
  onUpdate(readLocalAssignmentState());
  if (!db) return () => {};

  return onSnapshot(
    doc(db, 'stage_messages', ASSIGNMENT_STATE_DOC_ID),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        const parsed: LeadAssignmentRuntimeState = {
          poolCursor: Math.max(0, Number(data?.poolCursor) || 0),
          ruleCursors: data?.ruleCursors && typeof data.ruleCursors === 'object' ? data.ruleCursors : {},
          lastAssignedUserId: data?.lastAssignedUserId,
          lastAssignedUserName: data?.lastAssignedUserName,
          lastAssignedRuleName: data?.lastAssignedRuleName,
          lastAssignedAt: typeof data?.lastAssignedAt === 'number' ? data.lastAssignedAt : undefined,
          totalAutoAssigned: Math.max(0, Number(data?.totalAutoAssigned) || 0),
        };
        writeLocalAssignmentState(parsed);
        onUpdate(parsed);
      }
    },
    () => {}
  );
}

export async function loadLeadAssignmentConfig(): Promise<LeadAssignmentConfig> {
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'settings', 'lead_assignment'));
      if (snap.exists()) {
        const parsed = sanitizeAssignmentConfig(snap.data());
        writeLocalAssignmentConfig(parsed);
        return parsed;
      }
    } catch {
      // Fallback to local cache
    }
  }
  return readLocalAssignmentConfig();
}

export async function saveLeadAssignmentConfig(
  config: LeadAssignmentConfig,
  actorName?: string
): Promise<LeadAssignmentConfig> {
  const clean = sanitizeAssignmentConfig({
    ...config,
    updatedAt: Date.now(),
    updatedBy: actorName || config.updatedBy || 'Admin',
  });
  writeLocalAssignmentConfig(clean);

  if (db) {
    const payload = {
      enabled: clean.enabled,
      splitMode: clean.splitMode,
      selectedMembers: clean.selectedMembers.map((m) => ({
        userId: m.userId,
        name: m.name,
        email: m.email,
        role: m.role,
        weight: clampWeight(m.weight),
        active: m.active,
      })),
      rules: clean.rules.map((r) => {
        const item: Record<string, any> = {
          id: r.id,
          name: r.name,
          enabled: r.enabled,
          field: r.field,
          operator: r.operator,
          value: r.value,
          assignMode: r.assignMode,
          assigneeIds: r.assigneeIds,
        };
        if (r.secondaryValue !== undefined) item.secondaryValue = r.secondaryValue;
        return item;
      }),
      updatedAt: clean.updatedAt,
      updatedBy: clean.updatedBy || 'Admin',
      updated_at: serverTimestamp(),
    };

    await setDoc(doc(db, 'settings', 'lead_assignment'), payload, { merge: true });
  }

  return clean;
}

export async function fetchTeamUsersForAssignment(): Promise<User[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, 'users')).catch(() => null);
  if (!snap) return [];

  const users = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as User))
    .filter((u) => u.is_active !== false);

  const roleRank = (role: string) => {
    if (role === 'sales') return 0;
    if (role === 'admin') return 1;
    if (role === 'accounts') return 2;
    return 3;
  };

  return users.sort((a, b) => {
    const r = roleRank(a.role) - roleRank(b.role);
    if (r !== 0) return r;
    return String(a.name || a.email).localeCompare(String(b.name || b.email));
  });
}

function buildWeightedSlots(members: TeamAssignee[], splitMode: LeadAssignmentSplitMode): TeamAssignee[] {
  const active = members.filter((m) => m.active && m.userId);
  if (active.length === 0) return [];
  if (splitMode !== 'weighted_split') return active;

  const slots: TeamAssignee[] = [];
  for (const member of active) {
    const count = clampWeight(member.weight);
    for (let i = 0; i < count; i++) {
      slots.push(member);
    }
  }
  return slots;
}

function extractNumericValue(raw: string | number | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const cleaned = String(raw).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return cleaned ? Number(cleaned[0]) || 0 : 0;
}

export function doesAssignmentRuleMatch(rule: LeadAssignmentRule, ctx: LeadAssignmentContext): boolean {
  if (!rule.enabled) return false;
  const rawTarget = String(rule.value || '').trim();
  if (!rawTarget && rule.field !== 'required_quantity' && rule.field !== 'value') return false;

  const targetLower = rawTarget.toLowerCase();
  const tokens = targetLower
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (rule.field === 'required_quantity' || rule.field === 'value') {
    const actualNum =
      rule.field === 'required_quantity'
        ? extractNumericValue(ctx.requiredQuantity)
        : Number(ctx.value) || 0;
    const targetNum = extractNumericValue(rule.value);
    const secondaryNum = extractNumericValue(rule.secondaryValue);

    if (rule.operator === 'gte') return actualNum >= targetNum;
    if (rule.operator === 'lte') return actualNum > 0 && actualNum <= targetNum;
    if (rule.operator === 'between') {
      const low = Math.min(targetNum, secondaryNum || targetNum);
      const high = Math.max(targetNum, secondaryNum || targetNum);
      return actualNum >= low && actualNum <= high;
    }
    return actualNum === targetNum;
  }

  let haystack = '';
  if (rule.field === 'source') {
    haystack = `${ctx.source || ''} ${ctx.platform || ''}`.toLowerCase().trim();
  } else if (rule.field === 'whatsapp_account') {
    haystack = `${ctx.whatsappAccountLabel || ''} ${ctx.whatsappPhone || ''}`.toLowerCase().trim();
  } else if (rule.field === 'pipeline_id') {
    haystack = String(ctx.pipelineId || '').toLowerCase().trim();
  } else if (rule.field === 'location') {
    haystack = String(ctx.location || '').toLowerCase().trim();
  } else if (rule.field === 'keyword') {
    haystack = [
      ctx.name,
      ctx.company,
      ctx.requirement,
      ctx.campaign,
      ctx.source,
      ctx.location,
      ctx.eventName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  if (!haystack) return false;
  if (rule.operator === 'equals') {
    return tokens.some((tok) => haystack === tok);
  }
  return tokens.some((tok) => haystack.includes(tok));
}

function getRuleAssignees(rule: LeadAssignmentRule, poolMembers: TeamAssignee[]): TeamAssignee[] {
  const byId = new Map<string, TeamAssignee>();
  poolMembers.forEach((m) => byId.set(m.userId, m));

  const resolved: TeamAssignee[] = [];
  for (const id of rule.assigneeIds) {
    const member = byId.get(id);
    if (member && member.active !== false) {
      resolved.push(member);
    }
  }
  return resolved;
}

export function previewNextPoolAssignee(
  config: LeadAssignmentConfig,
  state: LeadAssignmentRuntimeState
): TeamAssignee | null {
  if (!config.enabled || config.splitMode === 'rules_only') return null;
  const slots = buildWeightedSlots(config.selectedMembers, config.splitMode);
  if (slots.length === 0) return null;
  const idx = Math.abs(Number(state.poolCursor) || 0) % slots.length;
  return slots[idx] || null;
}

/**
 * Resolves the automatic owner for an incoming lead using configured routing rules
 * first and then weighted/equal round-robin split across the selected team pool.
 * Uses a Firestore transaction on `stage_messages/__lead_assignment_state` so splits stay balanced.
 */
export async function resolveLeadAssignment(
  ctx: LeadAssignmentContext,
  overrideConfig?: LeadAssignmentConfig
): Promise<LeadAssignmentResult> {
  const config = overrideConfig || (await loadLeadAssignmentConfig());
  if (!config.enabled) {
    return { assigned: false, ownerId: '', ownerName: '', mode: 'unassigned' };
  }

  // Ensure every member referenced in rules can be looked up even if inactive in general pool
  let allMembers = [...config.selectedMembers];
  const matchedRule = config.rules.find((r) => doesAssignmentRuleMatch(r, ctx));

  if (matchedRule && allMembers.length === 0) {
    const users = await fetchTeamUsersForAssignment().catch(() => [] as User[]);
    allMembers = users.map((u) => ({
      userId: u.id,
      name: u.name || u.email,
      email: u.email,
      role: u.role,
      weight: 1,
      active: u.is_active !== false,
    }));
  } else if (matchedRule) {
    const missingIds = matchedRule.assigneeIds.filter((id) => !allMembers.some((m) => m.userId === id));
    if (missingIds.length > 0) {
      const users = await fetchTeamUsersForAssignment().catch(() => [] as User[]);
      users.forEach((u) => {
        if (missingIds.includes(u.id)) {
          allMembers.push({
            userId: u.id,
            name: u.name || u.email,
            email: u.email,
            role: u.role,
            weight: 1,
            active: u.is_active !== false,
          });
        }
      });
    }
  }

  const ruleAssignees = matchedRule ? getRuleAssignees(matchedRule, allMembers) : [];
  const poolSlots = config.splitMode === 'rules_only' ? [] : buildWeightedSlots(config.selectedMembers, config.splitMode);

  if (ruleAssignees.length === 0 && poolSlots.length === 0) {
    return { assigned: false, ownerId: '', ownerName: '', mode: 'unassigned' };
  }

  const pickWithState = (state: LeadAssignmentRuntimeState): {
    chosen: TeamAssignee;
    nextState: LeadAssignmentRuntimeState;
    resultMode: LeadAssignmentResult['mode'];
    ruleName?: string;
  } => {
    if (matchedRule && ruleAssignees.length > 0) {
      const cursor = Math.max(0, Number(state.ruleCursors?.[matchedRule.id]) || 0);
      const chosen = ruleAssignees[cursor % ruleAssignees.length];
      return {
        chosen,
        resultMode: matchedRule.assignMode === 'subset_split' && ruleAssignees.length > 1 ? 'rule_split' : 'rule_specific',
        ruleName: matchedRule.name,
        nextState: {
          ...state,
          ruleCursors: {
            ...(state.ruleCursors || {}),
            [matchedRule.id]: (cursor + 1) % Math.max(1, ruleAssignees.length * 1000),
          },
          lastAssignedUserId: chosen.userId,
          lastAssignedUserName: chosen.name,
          lastAssignedRuleName: matchedRule.name,
          lastAssignedAt: Date.now(),
          totalAutoAssigned: (state.totalAutoAssigned || 0) + 1,
        },
      };
    }

    const cursor = Math.max(0, Number(state.poolCursor) || 0);
    const chosen = poolSlots[cursor % poolSlots.length];
    return {
      chosen,
      resultMode: config.splitMode === 'weighted_split' ? 'weighted_split' : 'equal_split',
      nextState: {
        ...state,
        poolCursor: (cursor + 1) % Math.max(1, poolSlots.length * 1000),
        lastAssignedUserId: chosen.userId,
        lastAssignedUserName: chosen.name,
        lastAssignedRuleName: undefined,
        lastAssignedAt: Date.now(),
        totalAutoAssigned: (state.totalAutoAssigned || 0) + 1,
      },
    };
  };

  if (db) {
    try {
      const stateRef = doc(db, 'stage_messages', ASSIGNMENT_STATE_DOC_ID);
      const outcome = await runTransaction(db, async (tx) => {
        const snap = await tx.get(stateRef);
        const raw = snap.exists() ? (snap.data() as any) : {};
        const currentState: LeadAssignmentRuntimeState = {
          poolCursor: Math.max(0, Number(raw?.poolCursor) || 0),
          ruleCursors: raw?.ruleCursors && typeof raw.ruleCursors === 'object' ? raw.ruleCursors : {},
          lastAssignedUserId: raw?.lastAssignedUserId,
          lastAssignedUserName: raw?.lastAssignedUserName,
          lastAssignedRuleName: raw?.lastAssignedRuleName,
          lastAssignedAt: typeof raw?.lastAssignedAt === 'number' ? raw.lastAssignedAt : undefined,
          totalAutoAssigned: Math.max(0, Number(raw?.totalAutoAssigned) || 0),
        };

        const picked = pickWithState(currentState);
        const writePayload: Record<string, any> = {
          poolCursor: picked.nextState.poolCursor,
          ruleCursors: picked.nextState.ruleCursors,
          lastAssignedUserId: picked.chosen.userId,
          lastAssignedUserName: picked.chosen.name,
          lastAssignedAt: picked.nextState.lastAssignedAt,
          totalAutoAssigned: picked.nextState.totalAutoAssigned,
          updated_at: serverTimestamp(),
        };
        if (picked.ruleName) {
          writePayload.lastAssignedRuleName = picked.ruleName;
        }
        tx.set(stateRef, writePayload, { merge: true });
        return picked;
      });

      writeLocalAssignmentState(outcome.nextState);
      return {
        assigned: true,
        ownerId: outcome.chosen.userId,
        ownerName: outcome.chosen.name,
        ownerEmail: outcome.chosen.email,
        ruleName: outcome.ruleName,
        mode: outcome.resultMode,
      };
    } catch (err) {
      console.warn('[LeadAssignment] Transaction fallback to local round-robin cursor:', err);
    }
  }

  const localState = readLocalAssignmentState();
  const picked = pickWithState(localState);
  writeLocalAssignmentState(picked.nextState);
  return {
    assigned: true,
    ownerId: picked.chosen.userId,
    ownerName: picked.chosen.name,
    ownerEmail: picked.chosen.email,
    ruleName: picked.ruleName,
    mode: picked.resultMode,
  };
}

export async function reassignLeadOwner(params: {
  leadId: string;
  ownerId: string;
  ownerName: string;
  actorId?: string;
  actorName?: string;
  reason?: string;
}): Promise<void> {
  if (!db || !params.leadId) return;

  await updateDoc(doc(db, 'leads', params.leadId), {
    owner_id: params.ownerId || '',
    ownerId: params.ownerId || '',
    sales_person: params.ownerName || '',
    assigned_at: serverTimestamp(),
    assigned_by: params.actorId || 'admin',
    updated_at: serverTimestamp(),
  });

  await addDoc(collection(db, 'activities'), {
    lead_id: params.leadId,
    type: 'lead.updated',
    message: params.ownerName
      ? `Lead assigned to ${params.ownerName}${params.reason ? ` (${params.reason})` : ''}`
      : 'Lead unassigned by Administrator',
    actor: params.actorId || 'admin',
    created_at: serverTimestamp(),
  }).catch(() => {});
}

/**
 * Splits currently unassigned leads across active team members & rules in order.
 */
export async function distributeUnassignedLeads(
  config: LeadAssignmentConfig,
  leads: Lead[],
  actorId?: string
): Promise<{ assignedCount: number; skippedCount: number }> {
  if (!db) return { assignedCount: 0, skippedCount: 0 };

  const unassigned = leads.filter((l) => !getLeadOwnerId(l) && !String(l.sales_person || '').trim());
  let assignedCount = 0;
  let skippedCount = 0;

  const workingConfig: LeadAssignmentConfig = { ...config, enabled: true };

  for (const lead of unassigned) {
    const decision = await resolveLeadAssignment(
      {
        source: lead.source,
        platform: lead.platform,
        pipelineId: lead.pipeline_id,
        whatsappAccountLabel: lead.source_whatsapp_label,
        whatsappPhone: lead.source_whatsapp_number,
        requiredQuantity: lead.required_quantity,
        value: Number(lead.value) || 0,
        location: lead.location,
        name: lead.name,
        company: lead.company || lead.organization,
        requirement: lead.requirement || lead.last_message,
        campaign: lead.campaign || lead.campaign_name,
        eventName: lead.event_name,
      },
      workingConfig
    );

    if (!decision.assigned || !decision.ownerId) {
      skippedCount++;
      continue;
    }

    await updateDoc(doc(db, 'leads', lead.id), {
      owner_id: decision.ownerId,
      ownerId: decision.ownerId,
      sales_person: decision.ownerName,
      assigned_at: serverTimestamp(),
      assigned_by: actorId || 'admin_bulk_split',
      assignment_rule_name: decision.ruleName || decision.mode,
      updated_at: serverTimestamp(),
    });
    assignedCount++;
  }

  return { assignedCount, skippedCount };
}


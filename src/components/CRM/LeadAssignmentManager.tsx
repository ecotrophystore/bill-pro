import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GitBranch,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import type { Lead, User } from '../../types';
import {
  DEFAULT_LEAD_ASSIGNMENT_CONFIG,
  DEFAULT_LEAD_ASSIGNMENT_STATE,
  distributeLeadsToTeam,
  distributeUnassignedLeads,
  fetchTeamUsersForAssignment,
  loadLeadAssignmentConfig,
  previewNextPoolAssignee,
  saveLeadAssignmentConfig,
  subscribeLeadAssignmentConfig,
  subscribeLeadAssignmentState,
  type LeadAssignmentConfig,
  type LeadAssignmentRule,
  type LeadAssignmentRuleField,
  type LeadAssignmentRuleOperator,
  type LeadAssignmentRuntimeState,
  type TeamAssignee,
} from '../../services/leadAssignmentService';
import { getLeadOwnerId } from '../../utils/leadVisibility';

interface LeadAssignmentManagerProps {
  /** Optional leads array so Admin can split currently unassigned leads in one click */
  leads?: Lead[];
  /** Optional close handler when rendered inside a modal */
  onClose?: () => void;
}

const FIELD_LABELS: Record<LeadAssignmentRuleField, string> = {
  source: 'Channel / Source (e.g. WhatsApp, Meta)',
  whatsapp_account: 'WhatsApp Number / Tab Label',
  pipeline_id: 'Order Pipeline Tier',
  required_quantity: 'Required Quantity (pcs)',
  value: 'Order Budget / Value (₹)',
  location: 'City / Location',
  keyword: 'Keyword (Name / Requirement / Campaign)',
};

const FIELD_DEFAULT_OP: Record<LeadAssignmentRuleField, LeadAssignmentRuleOperator> = {
  source: 'contains',
  whatsapp_account: 'contains',
  pipeline_id: 'equals',
  required_quantity: 'gte',
  value: 'gte',
  location: 'contains',
  keyword: 'contains',
};

export function LeadAssignmentManager({ leads = [], onClose }: LeadAssignmentManagerProps) {
  const { dbUser } = useAuth();
  const [teamUsers, setTeamUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [distributing, setDistributing] = useState(false);

  const [draft, setDraft] = useState<LeadAssignmentConfig>(DEFAULT_LEAD_ASSIGNMENT_CONFIG);
  const [runtimeState, setRuntimeState] = useState<LeadAssignmentRuntimeState>(DEFAULT_LEAD_ASSIGNMENT_STATE);

  useEffect(() => {
    let mounted = true;

    Promise.all([fetchTeamUsersForAssignment(), loadLeadAssignmentConfig()])
      .then(([users, cfg]) => {
        if (!mounted) return;
        setTeamUsers(users);
        setDraft(cfg);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const unsubCfg = subscribeLeadAssignmentConfig((cfg) => {
      if (mounted) setDraft(cfg);
    });
    const unsubState = subscribeLeadAssignmentState((st) => {
      if (mounted) setRuntimeState(st);
    });

    return () => {
      mounted = false;
      unsubCfg();
      unsubState();
    };
  }, []);

  const selectedMap = useMemo(() => {
    const map = new Map<string, TeamAssignee>();
    draft.selectedMembers.forEach((m) => map.set(m.userId, m));
    return map;
  }, [draft.selectedMembers]);

  const activePoolMembers = useMemo(
    () => draft.selectedMembers.filter((m) => m.active),
    [draft.selectedMembers]
  );

  const totalWeight = useMemo(
    () => activePoolMembers.reduce((sum, m) => sum + (m.weight || 1), 0),
    [activePoolMembers]
  );

  const nextAssignee = useMemo(
    () => previewNextPoolAssignee(draft, runtimeState),
    [draft, runtimeState]
  );

  const unassignedCount = useMemo(() => {
    return leads.filter((l) => !getLeadOwnerId(l) && !String(l.sales_person || '').trim()).length;
  }, [leads]);

  const toggleTeamMember = (user: User) => {
    setDraft((prev) => {
      const exists = prev.selectedMembers.some((m) => m.userId === user.id);
      if (exists) {
        return {
          ...prev,
          selectedMembers: prev.selectedMembers.filter((m) => m.userId !== user.id),
        };
      }
      return {
        ...prev,
        selectedMembers: [
          ...prev.selectedMembers,
          {
            userId: user.id,
            name: user.name || user.email,
            email: user.email,
            role: user.role,
            weight: 1,
            active: true,
          },
        ],
      };
    });
  };

  const applyQuickSplitPreset = (count: number | 'all_sales') => {
    const salesFirst = [...teamUsers].sort((a, b) => {
      if (a.role === 'sales' && b.role !== 'sales') return -1;
      if (b.role === 'sales' && a.role !== 'sales') return 1;
      return String(a.name || a.email).localeCompare(String(b.name || b.email));
    });

    const chosen =
      count === 'all_sales'
        ? salesFirst.filter((u) => u.role === 'sales')
        : salesFirst.slice(0, Math.min(count, salesFirst.length));

    if (chosen.length === 0) {
      toast.error('No matching active team members found in Staff Directory.');
      return;
    }

    setDraft((prev) => ({
      ...prev,
      enabled: true,
      splitMode: prev.splitMode === 'rules_only' ? 'equal_split' : prev.splitMode,
      selectedMembers: chosen.map((u) => ({
        userId: u.id,
        name: u.name || u.email,
        email: u.email,
        role: u.role,
        weight: 1,
        active: true,
      })),
    }));
  };

  const updateMember = (userId: string, patch: Partial<TeamAssignee>) => {
    setDraft((prev) => ({
      ...prev,
      selectedMembers: prev.selectedMembers.map((m) =>
        m.userId === userId ? { ...m, ...patch } : m
      ),
    }));
  };

  const addRoutingRule = () => {
    const defaultUser = activePoolMembers[0]?.userId || teamUsers[0]?.id || '';
    const newRule: LeadAssignmentRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `Rule #${draft.rules.length + 1}`,
      enabled: true,
      field: 'source',
      operator: 'contains',
      value: 'WhatsApp',
      assignMode: 'specific_user',
      assigneeIds: defaultUser ? [defaultUser] : [],
    };
    setDraft((prev) => ({ ...prev, rules: [...prev.rules, newRule] }));
  };

  const updateRule = (ruleId: string, patch: Partial<LeadAssignmentRule>) => {
    setDraft((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    }));
  };

  const moveRule = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    setDraft((prev) => {
      if (nextIdx < 0 || nextIdx >= prev.rules.length) return prev;
      const copy = [...prev.rules];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return { ...prev, rules: copy };
    });
  };

  const removeRule = (ruleId: string) => {
    setDraft((prev) => ({
      ...prev,
      rules: prev.rules.filter((r) => r.id !== ruleId),
    }));
  };

  const toggleRuleAssignee = (rule: LeadAssignmentRule, userId: string) => {
    if (rule.assignMode === 'specific_user') {
      updateRule(rule.id, { assigneeIds: [userId] });
      return;
    }
    const exists = rule.assigneeIds.includes(userId);
    const nextIds = exists
      ? rule.assigneeIds.filter((id) => id !== userId)
      : [...rule.assigneeIds, userId];
    updateRule(rule.id, { assigneeIds: nextIds });
  };

  const handleSave = async () => {
    // If selected members exist but are paused, prompt or auto-activate so admin isn't blocked
    if (draft.enabled && draft.splitMode !== 'rules_only' && activePoolMembers.length === 0 && draft.rules.every((r) => !r.enabled)) {
      if (draft.selectedMembers.length > 0) {
        toast.error('All selected team members are currently set to "Paused". Click the yellow "Paused" button on each member to set them to "Active", then click Save.');
      } else {
        toast.error('Check at least 1 team member above or add an active routing rule before enabling Auto-Assign.');
      }
      return;
    }

    setSaving(true);
    try {
      const saved = await saveLeadAssignmentConfig(draft, dbUser?.name || dbUser?.email || 'Admin');
      setDraft(saved);
      toast.success(
        saved.enabled
          ? `Lead assignment saved! Splitting across ${activePoolMembers.length} active member(s) & ${saved.rules.filter((r) => r.enabled).length} rule(s).`
          : 'Lead assignment settings saved (Auto-Assign is currently OFF).'
      );
      onClose?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save lead assignment configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDistributeUnassigned = async () => {
    if (unassignedCount === 0) {
      toast('All leads in your pipeline already have an assigned owner.');
      return;
    }
    if (activePoolMembers.length === 0 && draft.rules.every((r) => !r.enabled || r.assigneeIds.length === 0)) {
      toast.error('Select at least 2 team members or configure a routing rule first.');
      return;
    }

    setDistributing(true);
    try {
      await saveLeadAssignmentConfig(draft, dbUser?.name || 'Admin');
      const res = await distributeUnassignedLeads(draft, leads, dbUser?.id || 'admin');
      toast.success(`Assigned ${res.assignedCount} unassigned lead(s) across your team!`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to distribute unassigned leads');
    } finally {
      setDistributing(false);
    }
  };

  const handleSplitAllExistingLeads = async () => {
    if (leads.length === 0) {
      toast('No leads found to split.');
      return;
    }
    if (activePoolMembers.length === 0 && draft.rules.every((r) => !r.enabled || r.assigneeIds.length === 0)) {
      toast.error('Select at least 2 team members or configure a routing rule first.');
      return;
    }

    const confirmed = window.confirm(
      `Re-split ALL ${leads.length} existing leads across your active team members now?\n\nThis will reassign every existing lead according to your split mode (${draft.splitMode}) and routing rules.`
    );
    if (!confirmed) return;

    setDistributing(true);
    try {
      await saveLeadAssignmentConfig(draft, dbUser?.name || 'Admin');
      const res = await distributeLeadsToTeam(draft, leads, {
        actorId: dbUser?.id || 'admin',
        scope: 'all_existing',
      });
      toast.success(`Split and updated ${res.assignedCount} of ${res.totalCandidates} existing lead(s) across your team!`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to split existing leads');
    } finally {
      setDistributing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-xs text-secondary font-semibold">
        <Loader2 size={18} className="animate-spin text-primary" />
        Loading team members & assignment rules...
      </div>
    );
  }

  return (
    <div className="space-y-5 text-xs">
      {/* Admin-only banner & Master toggle */}
      <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary" />
            <h3 className="text-sm font-extrabold text-primary-dark">
              Automatic Lead Assignment &amp; Privacy Control
            </h3>
          </div>
          <p className="text-[11px] text-secondary leading-relaxed">
            Divide incoming WhatsApp, Meta Ads, and manual leads across 2, 3, or more team members and define routing rules.{' '}
            <strong className="text-primary-dark">
              Only Admins see all leads &amp; assignee names; each team member only sees leads assigned to them.
            </strong>
          </p>
        </div>

        <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-surface shadow-neo-surface border border-shadow-darker/10 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
            className="w-4 h-4 accent-primary rounded cursor-pointer"
          />
          <span className="font-extrabold text-primary-dark">Auto-Assign</span>
          <span
            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
              draft.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {draft.enabled ? 'ON' : 'OFF'}
          </span>
        </label>
      </div>

      {/* Live Queue Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-shadow-darker/10 bg-surface">
          <span className="text-[10px] font-bold uppercase text-secondary block">Active Split Pool</span>
          <span className="text-base font-black text-primary-dark">
            {draft.splitMode === 'rules_only'
              ? 'Rules Only'
              : `${activePoolMembers.length} Team Member${activePoolMembers.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="p-3 rounded-xl border border-shadow-darker/10 bg-surface">
          <span className="text-[10px] font-bold uppercase text-secondary block">Next Default Turn</span>
          <span className="text-base font-black text-primary truncate block">
            {nextAssignee ? `→ ${nextAssignee.name}` : 'None configured'}
          </span>
        </div>
        <div className="p-3 rounded-xl border border-shadow-darker/10 bg-surface">
          <span className="text-[10px] font-bold uppercase text-secondary block">Auto-Assigned Total</span>
          <span className="text-base font-black text-emerald-700">
            {runtimeState.totalAutoAssigned || 0} leads
          </span>
        </div>
      </div>

      {/* Section 1: Team Split Configuration */}
      <div className="neo-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-shadow-darker/10 pb-3">
          <div>
            <h4 className="text-xs sm:text-sm font-extrabold text-primary-dark flex items-center gap-1.5">
              <Users size={15} className="text-primary" />
              1. Split Incoming Leads Between Team Members
            </h4>
            <p className="text-[11px] text-secondary mt-0.5">
              Choose whether to split leads equally or by custom ratio between 2, 3, or more team members.
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => applyQuickSplitPreset(2)}
              className="px-2.5 py-1 rounded-lg border border-shadow-darker/15 text-[11px] font-bold hover:border-primary hover:text-primary transition-colors"
            >
              Split 2 People
            </button>
            <button
              type="button"
              onClick={() => applyQuickSplitPreset(3)}
              className="px-2.5 py-1 rounded-lg border border-shadow-darker/15 text-[11px] font-bold hover:border-primary hover:text-primary transition-colors"
            >
              Split 3 People
            </button>
            <button
              type="button"
              onClick={() => applyQuickSplitPreset('all_sales')}
              className="px-2.5 py-1 rounded-lg border border-shadow-darker/15 text-[11px] font-bold hover:border-primary hover:text-primary transition-colors"
            >
              All Sales Staff
            </button>
          </div>
        </div>

        {/* Split Mode Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'equal_split', label: 'Equal Round-Robin (1 : 1 : 1)', desc: 'Rotates evenly among selected active members' },
            { id: 'weighted_split', label: 'Custom Ratio Split (2 : 1 : 1)', desc: 'Give senior or full-time reps more leads' },
            { id: 'rules_only', label: 'Routing Rules Only', desc: 'Only assign leads matching custom rules below' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, splitMode: opt.id as any }))}
              className={`flex-1 min-w-[180px] text-left p-2.5 rounded-xl border transition-all ${
                draft.splitMode === opt.id
                  ? 'border-primary bg-primary/10 text-primary-dark shadow-xs'
                  : 'border-shadow-darker/15 bg-surface text-secondary hover:text-primary-dark'
              }`}
            >
              <div className="font-extrabold text-xs">{opt.label}</div>
              <div className="text-[10px] opacity-80 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* Team Member Checklist */}
        {teamUsers.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 text-amber-900 text-xs">
            No active team members found in the <code className="font-mono">users</code> directory yet. Invite Sales / Team members in HR &amp; Team Access first.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {teamUsers.map((user) => {
              const member = selectedMap.get(user.id);
              const isSelected = Boolean(member);
              const pct =
                member && member.active && totalWeight > 0
                  ? Math.round(((draft.splitMode === 'weighted_split' ? member.weight : 1) / (draft.splitMode === 'weighted_split' ? totalWeight : activePoolMembers.length)) * 100)
                  : 0;

              return (
                <div
                  key={user.id}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                    isSelected
                      ? member?.active
                        ? 'border-primary/40 bg-emerald-50/40'
                        : 'border-amber-300 bg-amber-50/40'
                      : 'border-shadow-darker/10 bg-surface opacity-80'
                  }`}
                >
                  <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTeamMember(user)}
                      className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-primary-dark truncate">{user.name || user.email}</span>
                        <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                          {user.role}
                        </span>
                        {isSelected && member?.active && draft.splitMode !== 'rules_only' && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                            ~{pct}%
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-secondary truncate">{user.email}</div>
                    </div>
                  </label>

                  {isSelected && member && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {draft.splitMode === 'weighted_split' && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-secondary font-semibold">Share:</span>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={member.weight}
                            onChange={(e) =>
                              updateMember(user.id, { weight: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })
                            }
                            className="neo-input !w-12 !py-1 !px-1.5 text-center font-bold text-xs"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => updateMember(user.id, { active: !member.active })}
                        className={`p-1.5 px-2 rounded-lg border text-[10px] font-bold flex items-center gap-1 transition-all ${
                          member.active
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800 shadow-xs'
                            : 'border-amber-300 bg-amber-200/80 text-amber-900 font-extrabold hover:bg-emerald-100 hover:text-emerald-800 hover:border-emerald-300'
                        }`}
                        title={member.active ? 'Currently Active & receiving leads (click to pause)' : 'Currently PAUSED (click to activate & receive leads)'}
                      >
                        {member.active ? <Play size={11} className="fill-emerald-700 text-emerald-700" /> : <Pause size={11} className="text-amber-900" />}
                        {member.active ? 'Active' : 'Paused (Click to Activate)'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Routing Rules (Control Who Receives Which Leads) */}
      <div className="neo-card space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-shadow-darker/10 pb-3">
          <div>
            <h4 className="text-xs sm:text-sm font-extrabold text-primary-dark flex items-center gap-1.5">
              <GitBranch size={15} className="text-primary" />
              2. Control Who Receives Which Leads (Priority Rules)
            </h4>
            <p className="text-[11px] text-secondary mt-0.5">
              Checked top-to-bottom before the general split. Route specific channels, WhatsApp numbers, bulk quantities, cities, or keywords to chosen member(s).
            </p>
          </div>
          <button
            type="button"
            onClick={addRoutingRule}
            className="neo-btn text-xs px-3 py-1.5 font-bold inline-flex items-center gap-1 text-primary shrink-0"
          >
            <Plus size={13} /> Add Routing Rule
          </button>
        </div>

        {draft.rules.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-shadow-darker/20 text-center text-secondary space-y-1.5">
            <p className="font-semibold text-primary-dark">No custom routing rules added yet</p>
            <p className="text-[11px]">
              All incoming leads will split across your selected team members above. Click <strong>Add Routing Rule</strong> to send specific leads (e.g., Bulk 100+ pcs, WhatsApp #2, Chennai, or Meta Ads) to specific people.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {draft.rules.map((rule, idx) => (
              <div
                key={rule.id}
                className={`p-3.5 rounded-xl border space-y-3 ${
                  rule.enabled ? 'border-shadow-darker/15 bg-surface' : 'border-dashed border-slate-200 opacity-65'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-primary/10 text-primary">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={rule.name}
                      onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                      placeholder="Rule name (e.g. Bulk Orders -> Senior Sales)"
                      className="neo-input !py-1 !px-2.5 text-xs font-bold flex-1"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1 text-[11px] font-semibold cursor-pointer mr-1">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                        className="accent-primary rounded"
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveRule(idx, -1)}
                      className="p-1 rounded border border-shadow-darker/15 disabled:opacity-30 hover:text-primary"
                      title="Move priority up"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draft.rules.length - 1}
                      onClick={() => moveRule(idx, 1)}
                      className="p-1 rounded border border-shadow-darker/15 disabled:opacity-30 hover:text-primary"
                      title="Move priority down"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRule(rule.id)}
                      className="p-1 rounded border border-rose-200 text-rose-600 hover:bg-rose-50"
                      title="Delete rule"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Condition row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-secondary block mb-1">When Lead Field</label>
                    <select
                      value={rule.field}
                      onChange={(e) => {
                        const field = e.target.value as LeadAssignmentRuleField;
                        updateRule(rule.id, { field, operator: FIELD_DEFAULT_OP[field] });
                      }}
                      className="neo-input w-full !py-1.5 text-xs font-semibold"
                    >
                      {Object.entries(FIELD_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>
                          {lbl}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-secondary block mb-1">Condition</label>
                    <select
                      value={rule.operator}
                      onChange={(e) => updateRule(rule.id, { operator: e.target.value as LeadAssignmentRuleOperator })}
                      className="neo-input w-full !py-1.5 text-xs font-semibold"
                    >
                      {rule.field === 'required_quantity' || rule.field === 'value' ? (
                        <>
                          <option value="gte">Greater than or equal (&gt;=)</option>
                          <option value="lte">Less than or equal (&lt;=)</option>
                          <option value="between">Between (Min - Max)</option>
                          <option value="equals">Exact match (=)</option>
                        </>
                      ) : (
                        <>
                          <option value="contains">Contains (comma-separated)</option>
                          <option value="equals">Exact match</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-secondary block mb-1">Match Value</label>
                    {rule.field === 'pipeline_id' ? (
                      <select
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        className="neo-input w-full !py-1.5 text-xs font-semibold"
                      >
                        <option value="bulk_order">Bulk Order (100+ pcs)</option>
                        <option value="regular_order">Regular Order (10-99 pcs)</option>
                        <option value="small_order">Small Order (1-9 pcs)</option>
                        <option value="unclassified">Unclassified / Pending</option>
                      </select>
                    ) : rule.operator === 'between' ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          placeholder="Min"
                          className="neo-input w-full !py-1.5 text-xs"
                        />
                        <input
                          type="text"
                          value={rule.secondaryValue || ''}
                          onChange={(e) => updateRule(rule.id, { secondaryValue: e.target.value })}
                          placeholder="Max"
                          className="neo-input w-full !py-1.5 text-xs"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        placeholder={
                          rule.field === 'whatsapp_account'
                            ? 'e.g. 9092366996, WhatsApp Web 2'
                            : rule.field === 'source'
                              ? 'e.g. whatsapp, facebook_lead_ads, instagram'
                              : rule.field === 'location'
                                ? 'e.g. Chennai, Coimbatore'
                                : rule.field === 'required_quantity'
                                  ? 'e.g. 100'
                                  : 'e.g. crystal, corporate, urgent'
                        }
                        className="neo-input w-full !py-1.5 text-xs"
                      />
                    )}
                  </div>
                </div>

                {/* Target Assignee row */}
                <div className="p-2.5 rounded-xl bg-shadow-darker/5 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-primary-dark flex items-center gap-1">
                      <UserCheck size={13} className="text-primary" />
                      Assign Matching Leads To:
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <label className="flex items-center gap-1 cursor-pointer font-semibold">
                        <input
                          type="radio"
                          name={`mode_${rule.id}`}
                          checked={rule.assignMode === 'specific_user'}
                          onChange={() =>
                            updateRule(rule.id, {
                              assignMode: 'specific_user',
                              assigneeIds: rule.assigneeIds.slice(0, 1),
                            })
                          }
                          className="accent-primary"
                        />
                        One Specific Person
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer font-semibold">
                        <input
                          type="radio"
                          name={`mode_${rule.id}`}
                          checked={rule.assignMode === 'subset_split'}
                          onChange={() => updateRule(rule.id, { assignMode: 'subset_split' })}
                          className="accent-primary"
                        />
                        Split Between Selected People
                      </label>
                    </div>
                  </div>

                  {rule.assignMode === 'specific_user' ? (
                    <select
                      value={rule.assigneeIds[0] || ''}
                      onChange={(e) => updateRule(rule.id, { assigneeIds: e.target.value ? [e.target.value] : [] })}
                      className="neo-input w-full !py-1.5 text-xs font-bold"
                    >
                      <option value="">Select team member...</option>
                      {teamUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email} ({u.role.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {teamUsers.map((u) => {
                        const checked = rule.assigneeIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => toggleRuleAssignee(rule, u.id)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-all ${
                              checked
                                ? 'border-primary bg-primary text-white'
                                : 'border-shadow-darker/15 bg-surface text-secondary hover:text-primary-dark'
                            }`}
                          >
                            {checked && <CheckCircle2 size={11} />}
                            {u.name || u.email}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-shadow-darker/10">
        <div className="flex flex-wrap items-center gap-2">
          {leads.length > 0 && (
            <>
              <button
                type="button"
                disabled={distributing || unassignedCount === 0}
                onClick={handleDistributeUnassigned}
                className="neo-btn text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 text-indigo-700 disabled:opacity-50"
                title="Only assign leads that currently have no sales owner"
              >
                {distributing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {unassignedCount > 0
                  ? `Split ${unassignedCount} Unassigned Lead${unassignedCount === 1 ? '' : 's'}`
                  : 'No Unassigned Leads'}
              </button>
              <button
                type="button"
                disabled={distributing || leads.length === 0}
                onClick={handleSplitAllExistingLeads}
                className="neo-btn text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 text-primary hover:bg-primary/10 disabled:opacity-50"
                title="Re-split and divide all existing leads among your team members"
              >
                {distributing ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
                Re-Split All {leads.length} Existing Leads
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 justify-end">
          {onClose && (
            <button type="button" onClick={onClose} className="neo-btn text-xs px-4 py-2 font-bold">
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="neo-btn-primary text-xs px-5 py-2 font-extrabold inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Assignment Rules
          </button>
        </div>
      </div>
    </div>
  );
}

export function LeadAssignmentModal({
  isOpen,
  onClose,
  leads = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  leads?: Lead[];
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-primary-dark/45 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] bg-surface rounded-card shadow-neo-raised border border-shadow-dark flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-shadow-dark flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-btn bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-primary-dark truncate">
                Auto Lead Assignment &amp; Team Split
              </h2>
              <p className="text-[11px] text-secondary truncate">
                Split incoming leads between 2, 3, or more members and control who gets which leads.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark shrink-0"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-sidebar-scrollbar">
          <LeadAssignmentManager leads={leads} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}


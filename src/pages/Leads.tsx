import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot, query, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  ArrowRight,
  Filter,
  Search,
  UserPlus,
  Trash2,
  Columns3,
  Building,
  Phone,
  ExternalLink,
  X,
  AlertTriangle,
  GitBranch,
  UserCheck,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { db } from '../lib/firebase';
import type { Lead, Pipeline, PipelineStage, User } from '../types';
import {
  STANDARD_CRM_STAGES,
  DEFAULT_QUANTITY_PIPELINES,
  DEFAULT_DESIGN_PIPELINE,
  DEFAULT_PRODUCTION_PIPELINE,
} from '../types';
import { useCRMPermission } from '../hooks/useCRMPermission';
import { normalizeRole } from '../config/roleAccess';
import {
  openWhatsAppWebDirect,
  executeManualStageMove,
  getStageMessageConfig,
  getStageMoveMode,
  runAutoStageMoveWithToast,
  stageRequiresReason,
  subscribeStageMoveModeChange,
  type StageMovePromptMode,
} from '../services/stageNotificationService';
import { StageChangeConfirmModal } from '../components/CRM/StageChangeConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { getLeadOwnerId, isAdminUser, subscribeScopedLeads } from '../utils/leadVisibility';
import { fetchTeamUsersForAssignment, reassignLeadOwner } from '../services/leadAssignmentService';
import { LeadAssignmentModal } from '../components/CRM/LeadAssignmentManager';
import toast from 'react-hot-toast';

function formatDate(value: any) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString('en-IN');
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toLocaleDateString('en-IN');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-IN');
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [selectedPipelineId, setSelectedPipelineId] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [pipelines, setPipelines] = useState<Pipeline[]>(DEFAULT_QUANTITY_PIPELINES);
  const [teamUsers, setTeamUsers] = useState<User[]>([]);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const { hasPermission } = useCRMPermission();
  const { dbUser } = useAuth();
  const isAdmin = isAdminUser(dbUser);
  const userRole = normalizeRole(dbUser?.role);
  const canMoveStage = hasPermission('move_stage') || hasPermission('edit_lead') || isAdmin;

  const visiblePipelines = useMemo(() => {
    if (isAdmin) return pipelines;
    if (userRole === 'design') {
      const designPipes = pipelines.filter((p) => p.id === 'design_pipeline' || p.pipeline_type === 'design');
      return designPipes.length > 0 ? designPipes : [DEFAULT_DESIGN_PIPELINE];
    }
    if (userRole === 'production') {
      const prodPipes = pipelines.filter((p) => p.id === 'production_pipeline' || p.pipeline_type === 'production');
      return prodPipes.length > 0 ? prodPipes : [DEFAULT_PRODUCTION_PIPELINE];
    }
    // Sales & others: exclude design and production
    return pipelines.filter(
      (p) =>
        p.id !== 'design_pipeline' &&
        p.id !== 'production_pipeline' &&
        p.pipeline_type !== 'design' &&
        p.pipeline_type !== 'production'
    );
  }, [pipelines, userRole, isAdmin]);

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    lead: Lead | null;
    fromStage: PipelineStage;
    toStage: PipelineStage;
    pipelineId: string;
    pipelineName: string;
  }>({
    isOpen: false,
    lead: null,
    fromStage: { id: '', label: '' },
    toStage: { id: '', label: '' },
    pipelineId: '',
    pipelineName: '',
  });

  const [stageMoveMode, setStageMoveModeState] = useState<StageMovePromptMode>(() => getStageMoveMode());
  const [isBulkMovingStage, setIsBulkMovingStage] = useState(false);

  useEffect(() => {
    return subscribeStageMoveModeChange((mode) => {
      setStageMoveModeState(mode);
    });
  }, []);

  const getLeadPipelineAndStages = (lead: Lead) => {
    const pId = lead.pipeline_id || 'regular_order';
    const pipeline =
      pipelines.find(
        (p) => p.id === pId || (pId === 'regular_order' && (p.id === 'default' || !p.id))
      ) ||
      pipelines[0] || {
        id: 'regular_order',
        name: 'Regular Order Pipeline',
        stages: STANDARD_CRM_STAGES,
      };
    const stages = pipeline.stages && pipeline.stages.length > 0 ? pipeline.stages : STANDARD_CRM_STAGES;
    return { pipeline, stages };
  };

  const initiateStageMove = async (lead: Lead, targetStageId: string) => {
    if (!canMoveStage) {
      toast.error('You do not have permission to move lead stages.');
      return;
    }

    const { pipeline, stages } = getLeadPipelineAndStages(lead);
    const currentStageId = lead.status || stages[0]?.id || 'new_enquiry';
    if (currentStageId === targetStageId) return;

    const fromStage = stages.find((s) => s.id === currentStageId) || {
      id: currentStageId,
      label: currentStageId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    };
    const toStage = stages.find((s) => s.id === targetStageId) || {
      id: targetStageId,
      label: targetStageId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    };

    let effectiveMode = toStage.move_prompt_mode || stageMoveMode;
    if (!toStage.move_prompt_mode && stageMoveMode === 'ask') {
      try {
        const cfg = await getStageMessageConfig(toStage.id, toStage.label, pipeline.id);
        if (cfg?.move_prompt_mode) {
          effectiveMode = cfg.move_prompt_mode;
        }
      } catch {
        // use default effectiveMode
      }
    }

    if (effectiveMode === 'auto_send' && !stageRequiresReason(toStage)) {
      void runAutoStageMoveWithToast({
        lead,
        fromStage,
        toStage,
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
      });
      return;
    }

    if (effectiveMode === 'without_message' && !stageRequiresReason(toStage)) {
      try {
        const res = await executeManualStageMove({
          lead,
          fromStage,
          toStage,
          pipelineId: pipeline.id,
          pipelineName: pipeline.name,
          sendMessage: false,
        });
        toast.success(res.message);
      } catch (err: any) {
        toast.error(err?.message || 'Failed to move lead');
      }
      return;
    }

    // Default 'ask': Open modal asking user "With Message" or "Without Message"
    setConfirmModalState({
      isOpen: true,
      lead,
      fromStage,
      toStage,
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
    });
  };

  const handlePipelineChange = async (lead: Lead, targetPipelineId: string) => {
    if (!hasPermission('edit_lead') && !isAdmin) {
      toast.error('You do not have permission to change lead pipeline.');
      return;
    }
    const currentPId = lead.pipeline_id || 'regular_order';
    if (currentPId === targetPipelineId) return;

    const targetPipe = pipelines.find((p) => p.id === targetPipelineId);
    const targetPipeName = targetPipe?.name || targetPipelineId;

    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        pipeline_id: targetPipelineId,
        updated_at: serverTimestamp(),
      });
      toast.success(`Moved "${lead.name}" to ${targetPipeName}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to change pipeline');
    }
  };

  const handleBulkStageChange = async (targetStageId: string) => {
    if (!canMoveStage) {
      toast.error('You do not have permission to move lead stages.');
      return;
    }
    if (selectedLeads.length === 0) return;

    const targetStageObj = stageOptions.find((s) => s.id === targetStageId) || {
      id: targetStageId,
      label: targetStageId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    };

    const confirm = window.confirm(
      `Are you sure you want to change the pipeline stage to "${targetStageObj.label}" for ${selectedLeads.length} selected lead(s)?`
    );
    if (!confirm) return;

    setIsBulkMovingStage(true);
    try {
      const now = new Date();
      const currentUserId = dbUser?.id || 'user';
      const currentUserName = dbUser?.name || dbUser?.email || 'CRM User';

      const updatePromises = selectedLeads.map(async (leadId) => {
        const lead = leads.find((l) => l.id === leadId);
        if (!lead) return;
        const fromStageLabel = (lead.status || 'new_enquiry').replace(/_/g, ' ');

        const stageHistoryEntry = {
          from_stage: fromStageLabel,
          to_stage: targetStageObj.label,
          changed_by: currentUserId,
          changed_by_name: currentUserName,
          changed_at: now,
          note: `Bulk moved to ${targetStageObj.label}`,
          notification_triggered: false,
        };

        const existingHistory = lead.stage_history || [];

        return updateDoc(doc(db, 'leads', leadId), {
          status: targetStageId,
          stage_history: [stageHistoryEntry, ...existingHistory],
          stageEnteredAt: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      });

      await Promise.all(updatePromises);
      toast.success(`Successfully moved ${selectedLeads.length} lead(s) to "${targetStageObj.label}"`);
      setSelectedLeads([]);
    } catch (err: any) {
      console.error('Failed to bulk move stages:', err);
      toast.error(err?.message || 'Failed to bulk move lead stages');
    } finally {
      setIsBulkMovingStage(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!hasPermission('edit_lead')) {
      alert('You do not have permission to delete leads.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'leads', id));
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete lead', error);
      alert('Failed to delete lead.');
    }
  };

  const handleBulkDelete = async () => {
    if (!hasPermission('edit_lead')) {
      alert('You do not have permission to delete leads.');
      return;
    }
    try {
      const batchPromises = selectedLeads.map(id => deleteDoc(doc(db, 'leads', id)));
      await Promise.all(batchPromises);
      setSelectedLeads([]);
      setShowBulkDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to bulk delete leads', error);
      alert('Failed to bulk delete leads.');
    }
  };

  const toggleSelectAll = () => {
    if (selectedLeads.length === filtered.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filtered.map(l => l.id));
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedLeads(prev => 
      prev.includes(id) ? prev.filter(leadId => leadId !== id) : [...prev, id]
    );
  };

  const [isDeduplicating, setIsDeduplicating] = useState(false);

  const handleCleanDuplicates = async () => {
    if (!hasPermission('edit_lead')) {
      toast.error('You do not have permission to deduplicate leads.');
      return;
    }

    setIsDeduplicating(true);
    try {
      const groups = new Map<string, Lead[]>();
      leads.forEach((l) => {
        const phone = (l.phone || (l as any).normalized_phone || (l as any).whatsapp_number || '').replace(/\D/g, '').slice(-10);
        const name = (l.name || '').trim().toLowerCase();
        let key = '';
        if (phone && phone.length === 10) {
          key = `phone:${phone}`;
        } else if (name && name.length > 3 && !name.includes('lead') && !name.includes('unknown') && !name.includes('customer')) {
          key = `name:${name}`;
        }
        if (key) {
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(l);
        }
      });

      let duplicateExcessCount = 0;
      const idsToDelete: string[] = [];

      groups.forEach((leadList) => {
        if (leadList.length > 1) {
          // Sort leads so the best/most advanced record is kept:
          // Prefer: has order value > has required quantity > advanced stage > most recently updated
          leadList.sort((a, b) => {
            const aVal = Number(a.value) || 0;
            const bVal = Number(b.value) || 0;
            if (aVal !== bVal) return bVal - aVal;

            const aQty = Number(a.required_quantity) || 0;
            const bQty = Number(b.required_quantity) || 0;
            if (aQty !== bQty) return bQty - aQty;

            const getMillis = (val: any) => {
              if (!val) return 0;
              if (typeof val?.toMillis === 'function') return val.toMillis();
              if (typeof val?.seconds === 'number') return val.seconds * 1000;
              if (val instanceof Date) return val.getTime();
              return new Date(val).getTime() || 0;
            };
            const aTime = getMillis(a.updated_at) || getMillis(a.created_at);
            const bTime = getMillis(b.updated_at) || getMillis(b.created_at);
            return bTime - aTime;
          });

          // Keeper is leadList[0]; all others are duplicates to remove
          for (let i = 1; i < leadList.length; i++) {
            idsToDelete.push(leadList[i].id);
            duplicateExcessCount++;
          }
        }
      });

      if (idsToDelete.length === 0) {
        toast.success('Zero duplicate leads found. All contact entries in the directory are unique!');
        return;
      }

      const confirmed = window.confirm(
        `Found ${duplicateExcessCount} duplicate lead entries across ${groups.size} contacts. Remove the duplicates and keep only 1 primary lead for each contact?`
      );
      if (!confirmed) return;

      const deletePromises = idsToDelete.map((id) => deleteDoc(doc(db, 'leads', id)));
      await Promise.all(deletePromises);
      toast.success(`Removed ${duplicateExcessCount} duplicate leads! Kept 1 unique lead for each contact.`);
    } catch (err: any) {
      console.error('Deduplication failed:', err);
      toast.error('Failed to deduplicate leads: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeduplicating(false);
    }
  };

  useEffect(() => {
    if (!db || !dbUser) return;

    const unsub = subscribeScopedLeads(
      db,
      dbUser,
      (scopedLeads) => {
        setLeads(scopedLeads);
        setLoading(false);
      },
      (error) => {
        console.error('Leads load failed', error);
        setLoading(false);
      }
    );

    const unsubPipelines = onSnapshot(query(collection(db, 'pipelines')), (snapshot) => {
      if (!snapshot.empty) {
        setPipelines(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Pipeline)));
      }
    });

    return () => {
      unsub();
      unsubPipelines();
    };
  }, [dbUser?.id, dbUser?.role]);

  useEffect(() => {
    fetchTeamUsersForAssignment()
      .then(setTeamUsers)
      .catch(() => {});
  }, []);

  // Filtered Leads
  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return leads.filter((lead) => {
      // Pipeline filter
      if (selectedPipelineId !== 'all') {
        const pId = lead.pipeline_id || 'regular_order';
        const matchesPipe = pId === selectedPipelineId || (selectedPipelineId === 'regular_order' && (pId === 'default' || !pId));
        if (!matchesPipe) return false;
      }

      // Assignee / Aligned team member filter (available to everyone)
      if (assigneeFilter !== 'all') {
        const ownerId = getLeadOwnerId(lead);
        const repName = String(lead.sales_person || '').trim().toLowerCase();
        if (assigneeFilter === 'unassigned') {
          if (ownerId || repName) return false;
        } else if (assigneeFilter === 'my_leads') {
          const myId = String(dbUser?.id || '').trim();
          const myName = String(dbUser?.name || '').trim().toLowerCase();
          const myEmail = String(dbUser?.email || '').trim().toLowerCase();
          const isMine =
            (ownerId && ownerId === myId) ||
            (repName && (repName === myName || repName === myEmail));
          if (!isMine) return false;
        } else {
          const targetUser = teamUsers.find((u) => u.id === assigneeFilter);
          const targetName = (targetUser?.name || '').trim().toLowerCase();
          const targetEmail = (targetUser?.email || '').trim().toLowerCase();
          const isMatch =
            (ownerId && ownerId === assigneeFilter) ||
            (repName && (repName === assigneeFilter.toLowerCase() || (targetName && repName === targetName) || (targetEmail && repName === targetEmail)));
          if (!isMatch) return false;
        }
      }

      // Text search (search across lead name, phone, email, company, and aligned sales rep)
      const searchFields = [
        lead.name,
        lead.phone,
        lead.email,
        lead.source,
        lead.campaign,
        lead.id,
        lead.company,
        lead.event_name,
        lead.sales_person,
      ];
      const matchesText =
        !text ||
        searchFields.some((value) => String(value || '').toLowerCase().includes(text));

      // Status filter
      const matchesStatus = status === 'all' || lead.status === status;

      // Platform filter
      const matchesPlatform = platform === 'all' || lead.platform === platform;

      return matchesText && matchesStatus && matchesPlatform;
    });
  }, [leads, search, status, platform, selectedPipelineId, assigneeFilter, dbUser, teamUsers]);

  // Overall KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const value = filtered
      .filter((l) => l.status !== 'lost_cancelled' && l.status !== 'lost')
      .reduce((sum, l) => sum + (Number(l.value) || 0), 0);
    const pieces = filtered.reduce((sum, l) => sum + (Number(l.required_quantity) || 0), 0);
    const completed = filtered.filter((l) => ['completed', 'delivered', 'full_payment'].includes(l.status || '')).length;

    return { total, value, pieces, completed };
  }, [filtered]);

  // Active stages for the filter dropdown
  const stageOptions = useMemo(() => {
    if (selectedPipelineId !== 'all') {
      const p = pipelines.find((pipe) => pipe.id === selectedPipelineId);
      if (p?.stages?.length) return p.stages;
    }
    return STANDARD_CRM_STAGES;
  }, [selectedPipelineId, pipelines]);

  return (
    <div className="space-y-6 animate-fade-in max-w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">CRM Directory</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary-dark mt-1">Customer Leads</h1>
          <p className="text-secondary text-xs sm:text-sm mt-1">
            Comprehensive tabular index with stage status, quantities, order values, and direct contact actions.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          {selectedLeads.length > 0 && canMoveStage && (
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-3 py-1.5 flex-1 sm:flex-none">
              <span className="text-xs font-bold text-primary whitespace-nowrap">
                Move {selectedLeads.length} to:
              </span>
              <select
                aria-label="Bulk change stage"
                disabled={isBulkMovingStage}
                className="bg-surface text-primary-dark border border-shadow-darker/20 rounded-lg text-xs font-bold px-2 py-1 outline-none cursor-pointer hover:border-primary transition-colors disabled:opacity-50"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkStageChange(e.target.value);
                    e.target.value = '';
                  }
                }}
              >
                <option value="" disabled>
                  {isBulkMovingStage ? 'Moving...' : 'Select Stage...'}
                </option>
                {stageOptions.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    {idx + 1}. {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedLeads.length > 0 && hasPermission('edit_lead') && (
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="neo-btn-primary bg-rose-600 hover:bg-rose-700 text-white flex-1 sm:flex-none flex justify-center items-center gap-2 text-sm font-semibold px-4 py-2.5"
            >
              <Trash2 size={16} /> Delete Selected ({selectedLeads.length})
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAssignmentModal(true)}
              className="neo-btn flex-1 sm:flex-none flex justify-center items-center gap-2 text-sm font-bold px-4 py-2.5 text-primary"
              title="Configure automatic lead splitting & team routing rules"
            >
              <GitBranch size={16} /> Auto-Assign Rules
            </button>
          )}
          {hasPermission('edit_lead') && (
            <button
              type="button"
              disabled={isDeduplicating}
              onClick={handleCleanDuplicates}
              className="neo-btn flex-1 sm:flex-none flex justify-center items-center gap-2 text-sm font-bold px-4 py-2.5 text-amber-700 hover:text-amber-800 disabled:opacity-50"
              title="Check for and consolidate duplicate leads, keeping only one entry per contact"
            >
              {isDeduplicating ? (
                <Loader2 size={16} className="animate-spin text-amber-600" />
              ) : (
                <Sparkles size={16} className="text-amber-500" />
              )}
              {isDeduplicating ? 'Deduplicating...' : 'Deduplicate Leads'}
            </button>
          )}
          <Link to="/pipeline" className="neo-btn flex-1 sm:flex-none flex justify-center items-center gap-2 text-sm font-semibold px-4 py-2.5">
            <Columns3 size={16} /> Pipeline Board
          </Link>
          {hasPermission('create_lead') && (
            <Link
              to="/leads/new"
              className="neo-btn-primary flex-1 sm:flex-none flex justify-center items-center gap-2 text-sm font-semibold px-4 py-2.5"
            >
              <UserPlus size={16} /> Add Lead
            </Link>
          )}
        </div>
      </div>

      {/* Pipeline Filter Bar */}
      <div className="w-full flex items-center gap-2 overflow-x-auto p-1.5 bg-transparent rounded-2xl border border-shadow-darker/10 custom-sidebar-scrollbar pb-2 snap-x">
        <button
          type="button"
          onClick={() => setSelectedPipelineId('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            selectedPipelineId === 'all'
              ? 'bg-transparent text-primary-dark shadow-sm border border-shadow-darker/15 scale-[1.02]'
              : 'text-secondary hover:text-primary-dark hover:bg-transparent'
          }`}
        >
          All Pipelines ({leads.length})
        </button>

        {visiblePipelines.map((p) => {
          const isSelected = selectedPipelineId === p.id;
          const count = leads.filter((l) => (l.pipeline_id || 'regular_order') === p.id).length;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPipelineId(p.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-transparent text-primary-dark shadow-sm border border-shadow-darker/15 scale-[1.02]'
                  : 'text-secondary hover:text-primary-dark hover:bg-transparent'
              }`}
            >
              <span>{p.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isSelected ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* KPI Summary Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs w-full">
        <div className="p-3 rounded-2xl bg-transparent border border-shadow-darker/10 shadow-xs">
          <span className="text-secondary font-medium block">Total Leads</span>
          <span className="text-xl font-black text-primary-dark">{kpis.total}</span>
        </div>
        <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 shadow-xs">
          <span className="text-emerald-700 font-medium block">Pipeline Value</span>
          <span className="text-xl font-black text-emerald-800">₹{kpis.value.toLocaleString('en-IN')}</span>
        </div>
        <div className="p-3 rounded-2xl bg-transparent border border-shadow-darker/10 shadow-xs">
          <span className="text-secondary font-medium block">Total Trophies Required</span>
          <span className="text-xl font-black text-primary-dark">{kpis.pieces.toLocaleString('en-IN')} pcs</span>
        </div>
        <div className="p-3 rounded-2xl bg-transparent border border-shadow-darker/10 shadow-xs">
          <span className="text-secondary font-medium block">Completed Orders</span>
          <span className="text-xl font-black text-indigo-700">{kpis.completed}</span>
        </div>
      </div>

      {/* Table Card */}
      <div className="neo-card space-y-4">
        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div className="flex items-center gap-2 neo-input flex-1 min-w-0">
            <Search size={18} className="text-secondary shrink-0" />
            <input
              className="bg-transparent border-none outline-none w-full text-sm min-w-0"
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-secondary hover:text-primary-dark shrink-0 p-1">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex gap-3 min-w-0">
            {/* Real Pipeline Stages Filter */}
            <div className="neo-input flex items-center gap-2 flex-1 min-w-0 !px-3">
              <Filter size={16} className="text-secondary shrink-0" />
              <select
                aria-label="Filter by stage"
                className="bg-transparent border-none outline-none text-sm font-semibold w-full min-w-0 cursor-pointer"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All Stages ({stageOptions.length})</option>
                {stageOptions.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    {idx + 1}. {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Platform Filter */}
            <div className="neo-input flex items-center gap-2 flex-1 min-w-0 !px-3">
              <Filter size={16} className="text-secondary shrink-0" />
              <select
                aria-label="Filter by platform"
                className="bg-transparent border-none outline-none text-sm font-semibold w-full min-w-0 cursor-pointer"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="all">All Platforms</option>
                <option value="manual">Manual</option>
                <option value="meta">Meta Ads</option>
                <option value="google">Google</option>
              </select>
            </div>

            {/* Assignee / Aligned Team Member Filter */}
            <div className="neo-input flex items-center gap-2 flex-1 min-w-0 !px-3">
              <UserCheck size={16} className="text-primary shrink-0" />
              <select
                aria-label="Filter by assigned team member"
                className="bg-transparent border-none outline-none text-sm font-semibold w-full min-w-0 cursor-pointer"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
              >
                <option value="all">All Team Leads</option>
                <option value="my_leads">My Assigned Leads</option>
                <option value="unassigned">Unassigned Only</option>
                {teamUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-secondary text-xs">Loading leads directory...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-secondary border border-dashed border-shadow-darker/20 rounded-xl text-xs">
            No leads found for current search and filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Desktop Table View */}
            <table className="w-full text-xs hidden md:table">
              <thead>
                <tr className="text-left text-secondary border-b border-shadow-darker/10">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={selectedLeads.length > 0 && selectedLeads.length === filtered.length}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = selectedLeads.length > 0 && selectedLeads.length < filtered.length;
                        }
                      }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                    />
                  </th>
                  <th className="py-3 pr-4 font-semibold">Customer & Lifecycle</th>
                  <th className="py-3 pr-4 font-semibold">Contact</th>
                  <th className="py-3 pr-4 font-semibold">Order Specs</th>
                  <th className="py-3 pr-4 font-semibold">Stage Status</th>
                  <th className="py-3 pr-4 font-semibold">Aligned To</th>
                  <th className="py-3 pr-4 font-semibold">Created Date</th>
                  <th className="py-3 pr-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-shadow-darker/5">
                {filtered.map((lead) => {
                  const currentStageObj = stageOptions.find((s) => s.id === lead.status) || {
                    id: lead.status || 'new_enquiry',
                    label: lead.status || 'New Enquiry',
                  };

                  return (
                    <tr key={lead.id} className="hover:bg-transparent transition-colors">
                      <td className="py-3.5 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              to={`/leads/${lead.id}`}
                              className="font-bold text-primary-dark hover:text-primary transition-colors text-sm"
                            >
                              {lead.name}
                            </Link>

                            {lead.is_repeat_customer || lead.customer_lifecycle === 'repeat_customer' ? (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200">
                                Repeat
                              </span>
                            ) : lead.customer_lifecycle === 'existing_customer' ? (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                                Existing
                              </span>
                            ) : (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                New
                              </span>
                            )}
                          </div>

                          {lead.company && (
                            <div className="text-[11px] text-secondary flex items-center gap-1">
                              <Building size={11} /> {lead.company}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 pr-4">
                        <div className="space-y-0.5">
                          {lead.phone ? (
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700">
                              <span>{lead.phone}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  openWhatsAppWebDirect(
                                    lead.phone || '',
                                    `Hi ${lead.name}, regarding your enquiry with EcoTrophy:`
                                  )
                                }
                                className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded hover:bg-emerald-50"
                                title="Open WhatsApp Web"
                              >
                                <ExternalLink size={12} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-secondary">-</span>
                          )}
                          {lead.email && <div className="text-secondary text-[10px] truncate max-w-[150px]">{lead.email}</div>}
                        </div>
                      </td>

                      <td className="py-3.5 pr-4">
                        <div className="space-y-0.5">
                          {lead.required_quantity && (
                            <div className="font-semibold text-primary-dark">🎯 {lead.required_quantity} pcs</div>
                          )}
                          {lead.value ? (
                            <div className="font-bold text-emerald-800 text-[11px]">
                              ₹{Number(lead.value).toLocaleString('en-IN')}
                            </div>
                          ) : (
                            <span className="text-secondary text-[10px]">TBD</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 pr-4">
                        {(() => {
                          const { pipeline: leadPipeline, stages: leadStages } = getLeadPipelineAndStages(lead);
                          const currentStageId = lead.status || leadStages[0]?.id || 'new_enquiry';
                          const hasCurrent = leadStages.some((s) => s.id === currentStageId);
                          const selectStages = hasCurrent
                            ? leadStages
                            : [
                                ...leadStages,
                                {
                                  id: currentStageId,
                                  label: currentStageId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                                },
                              ];

                          return (
                            <div className="space-y-1 min-w-[150px]">
                              <select
                                aria-label={`Change stage for ${lead.name}`}
                                disabled={!canMoveStage}
                                value={currentStageId}
                                onChange={(e) => initiateStageMove(lead, e.target.value)}
                                className="w-full text-xs font-bold bg-surface rounded-lg px-2.5 py-1.5 border border-shadow-darker/20 text-primary-dark hover:border-primary transition-colors cursor-pointer shadow-xs focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                                title={canMoveStage ? 'Change pipeline stage' : 'You do not have permission to change stage'}
                              >
                                {selectStages.map((s, idx) => (
                                  <option key={s.id} value={s.id}>
                                    {idx + 1}. {s.label}
                                  </option>
                                ))}
                              </select>

                              {visiblePipelines.length > 1 && (
                                <div className="flex items-center gap-1 text-[10px] text-secondary">
                                  <span className="shrink-0 font-medium">Pipe:</span>
                                  <select
                                    aria-label={`Change pipeline for ${lead.name}`}
                                    value={lead.pipeline_id || 'regular_order'}
                                    disabled={!hasPermission('edit_lead') && !isAdmin}
                                    onChange={(e) => handlePipelineChange(lead, e.target.value)}
                                    className="bg-transparent text-[10px] font-semibold text-slate-600 hover:text-primary-dark cursor-pointer border-none outline-none truncate max-w-[110px] p-0 disabled:cursor-default"
                                    title="Change Pipeline"
                                  >
                                    {visiblePipelines.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Aligned To Column */}
                      <td className="py-3.5 pr-4">
                        {(() => {
                          const ownerId = getLeadOwnerId(lead);
                          const matchedUser = teamUsers.find((u) => u.id === ownerId);
                          const alignedName = (lead.sales_person || matchedUser?.name || matchedUser?.email || '').trim();

                          if (isAdmin) {
                            return (
                              <select
                                aria-label={`Assign ${lead.name}`}
                                className="text-[11px] font-bold bg-surface rounded-lg px-2 py-1 border border-shadow-darker/15 text-primary-dark max-w-[150px] cursor-pointer"
                                value={ownerId}
                                onChange={async (e) => {
                                  const nextId = e.target.value;
                                  const nextUser = teamUsers.find((u) => u.id === nextId);
                                  try {
                                    await reassignLeadOwner({
                                      leadId: lead.id,
                                      ownerId: nextId,
                                      ownerName: nextUser ? nextUser.name || nextUser.email : '',
                                      actorId: dbUser?.id,
                                      actorName: dbUser?.name,
                                    });
                                    toast.success(
                                      nextUser ? `Assigned ${lead.name} to ${nextUser.name || nextUser.email}` : 'Lead unassigned'
                                    );
                                  } catch (err: any) {
                                    toast.error(err?.message || 'Reassign failed');
                                  }
                                }}
                              >
                                <option value="">Unassigned</option>
                                {teamUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name || u.email}
                                  </option>
                                ))}
                              </select>
                            );
                          }

                          return alignedName ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary-dark text-[11px] font-bold"
                              title={`Aligned Team Member: ${alignedName}`}
                            >
                              <span className="w-4 h-4 rounded-full bg-primary text-white text-[8px] font-black flex items-center justify-center uppercase shrink-0">
                                {alignedName.charAt(0)}
                              </span>
                              <span className="truncate max-w-[120px]">{alignedName}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-secondary/60 italic px-2 py-0.5 rounded bg-shadow-darker/5">
                              Unassigned
                            </span>
                          );
                        })()}
                      </td>

                      <td className="py-3.5 pr-4 text-secondary whitespace-nowrap">{formatDate(lead.created_at)}</td>

                      <td className="py-3.5 pr-4 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <Link
                            to={`/leads/${lead.id}`}
                            className="inline-flex items-center gap-1 text-primary-dark font-bold hover:underline"
                          >
                            360° <ArrowRight size={13} />
                          </Link>

                          {hasPermission('edit_lead') && (
                            <button
                              onClick={() => setDeleteConfirmId(lead.id)}
                              className="p-1 text-secondary hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Delete Lead"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-shadow-darker/10">
              <div className="p-4 border-b border-shadow-darker/10 bg-transparent flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-secondary">
                  <input
                    type="checkbox"
                    checked={selectedLeads.length > 0 && selectedLeads.length === filtered.length}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = selectedLeads.length > 0 && selectedLeads.length < filtered.length;
                      }
                    }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                  />
                  Select All
                </label>
              </div>
              {filtered.map((lead) => {
                const currentStageObj = stageOptions.find((s) => s.id === lead.status) || {
                  id: lead.status || 'new_enquiry',
                  label: lead.status || 'New Enquiry',
                };
                return (
                  <div key={lead.id} className="p-4 space-y-3 bg-transparent hover:bg-shadow-darker/5 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-3 flex-1 items-start">
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="w-4 h-4 mt-1 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                          <Link to={`/leads/${lead.id}`} className="font-bold text-primary-dark hover:text-primary transition-colors text-lg leading-tight">
                            {lead.name}
                          </Link>
                          {lead.is_repeat_customer || lead.customer_lifecycle === 'repeat_customer' ? (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200">Repeat</span>
                          ) : lead.customer_lifecycle === 'existing_customer' ? (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">Existing</span>
                          ) : (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">New</span>
                          )}
                        </div>
                        {lead.company && <div className="text-[11px] text-secondary flex items-center gap-1 mt-0.5"><Building size={11} /> {lead.company}</div>}
                      </div>
                    </div>
                    {(() => {
                      const { pipeline: leadPipeline, stages: leadStages } = getLeadPipelineAndStages(lead);
                      const currentStageId = lead.status || leadStages[0]?.id || 'new_enquiry';
                      const hasCurrent = leadStages.some((s) => s.id === currentStageId);
                      const selectStages = hasCurrent
                        ? leadStages
                        : [
                            ...leadStages,
                            {
                              id: currentStageId,
                              label: currentStageId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                            },
                          ];

                      return (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <select
                            aria-label={`Change stage for ${lead.name}`}
                            disabled={!canMoveStage}
                            value={currentStageId}
                            onChange={(e) => initiateStageMove(lead, e.target.value)}
                            className="text-[11px] font-bold bg-surface rounded-lg px-2 py-1 border border-shadow-darker/20 text-primary-dark hover:border-primary transition-colors cursor-pointer shadow-xs focus:ring-1 focus:ring-primary disabled:opacity-60 max-w-[140px]"
                            title={canMoveStage ? 'Change pipeline stage' : 'No permission to change stage'}
                          >
                            {selectStages.map((s, idx) => (
                              <option key={s.id} value={s.id}>
                                {idx + 1}. {s.label}
                              </option>
                            ))}
                          </select>
                          {pipelines.length > 1 && (
                            <span className="text-[9px] text-secondary font-medium truncate max-w-[140px]">
                              {leadPipeline.name}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    </div>

                    <div className="flex justify-between items-end text-sm">
                      <div className="space-y-1">
                        {lead.phone ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700">
                            <Phone size={11} /> {lead.phone}
                            <button onClick={() => openWhatsAppWebDirect(lead.phone || '', `Hi ${lead.name},`)} className="text-emerald-600 hover:text-emerald-700 ml-1"><ExternalLink size={12} /></button>
                          </div>
                        ) : null}
                        <div className="text-secondary text-[10px]">Added: {formatDate(lead.created_at)}</div>
                      </div>
                      <div className="text-right">
                        {lead.required_quantity && <div className="font-semibold text-primary-dark text-xs">🎯 {lead.required_quantity} pcs</div>}
                        {lead.value && <div className="font-bold text-emerald-800 text-sm mt-0.5">₹{Number(lead.value).toLocaleString('en-IN')}</div>}
                      </div>
                    </div>

                    {/* Aligned Team Member on Mobile */}
                    {(() => {
                      const ownerId = getLeadOwnerId(lead);
                      const matchedUser = teamUsers.find((u) => u.id === ownerId);
                      const alignedName = (lead.sales_person || matchedUser?.name || matchedUser?.email || '').trim();
                      return (
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-shadow-darker/10">
                          <span className="text-[11px] text-secondary font-medium flex items-center gap-1">
                            <UserCheck size={12} className="text-primary" /> Aligned To:
                          </span>
                          {alignedName ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary-dark text-[10px] font-bold">
                              <span className="w-3.5 h-3.5 rounded-full bg-primary text-white text-[8px] font-black flex items-center justify-center uppercase shrink-0">
                                {alignedName.charAt(0)}
                              </span>
                              {alignedName}
                            </span>
                          ) : (
                            <span className="text-[10px] text-secondary/60 italic">Unassigned</span>
                          )}
                        </div>
                      );
                    })()}

                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-shadow-darker/10">
                      <Link 
                        to={`/leads/${lead.id}`}
                        className="flex-1 neo-btn flex justify-center items-center gap-2 py-2.5 text-primary-dark font-bold text-sm"
                      >
                        360° Profile <ArrowRight size={16} />
                      </Link>
                      {hasPermission('edit_lead') && (
                        <button 
                          onClick={() => setDeleteConfirmId(lead.id)} 
                          className="neo-btn flex justify-center items-center p-2.5 text-error hover:text-error hover:bg-error/10 transition-colors"
                        >
                          <Trash2 size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Styled In-App Deletion Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="neo-card max-w-sm w-full space-y-4 p-5 bg-neo-bg rounded-2xl shadow-xl">
            <div className="flex items-center gap-2.5 text-rose-600">
               <AlertTriangle size={20} />
               <h3 className="font-bold text-sm">Delete Customer Lead?</h3>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              Are you sure you want to delete this lead record? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="neo-btn text-xs px-3.5 py-1.5 font-bold text-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                className="neo-btn-primary text-xs px-4 py-1.5 font-bold bg-rose-600 hover:bg-rose-700 text-white"
              >
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <LeadAssignmentModal
          isOpen={showAssignmentModal}
          onClose={() => setShowAssignmentModal(false)}
          leads={leads}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="neo-card max-w-sm w-full space-y-4 p-5 bg-neo-bg rounded-2xl shadow-xl">
            <div className="flex items-center gap-2.5 text-rose-600">
               <AlertTriangle size={20} />
               <h3 className="font-bold text-sm">Delete {selectedLeads.length} Leads?</h3>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              Are you sure you want to delete these lead records? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="neo-btn text-xs px-3.5 py-1.5 font-bold text-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                className="neo-btn-primary text-xs px-4 py-1.5 font-bold bg-rose-600 hover:bg-rose-700 text-white"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation & Notification Dispatch Modal */}
      <StageChangeConfirmModal
        isOpen={confirmModalState.isOpen}
        lead={confirmModalState.lead}
        fromStage={confirmModalState.fromStage}
        toStage={confirmModalState.toStage}
        pipelineId={confirmModalState.pipelineId}
        pipelineName={confirmModalState.pipelineName}
        onClose={() =>
          setConfirmModalState({
            isOpen: false,
            lead: null,
            fromStage: { id: '', label: '' },
            toStage: { id: '', label: '' },
            pipelineId: '',
            pipelineName: '',
          })
        }
        onSuccess={(res) => {
          toast.success(res.message);
        }}
      />
    </div>
  );
}




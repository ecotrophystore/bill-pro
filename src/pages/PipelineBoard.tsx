import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowRight,
  CircleAlert,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  Bot,
  Sparkles,
  Phone,
  Building,
  Calendar,
  Clock,
  DollarSign,
  User,
  Filter,
  Search,
  Truck,
  Eye,
  Send,
  MessageSquare,
  StickyNote,
  BellRing,
  Columns3,
  LayoutList,
  ExternalLink,
  Minimize2,
  Maximize2,
  Layers,
  CheckCircle2,
  Award,
  GitBranch,
  Flame,
  Crown,
  Zap,
  Palette,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Factory,
  Printer,
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { isAdminUser, subscribeScopedLeads } from '../utils/leadVisibility';
import { normalizeRole } from '../config/roleAccess';
import { LeadAssignmentModal } from '../components/CRM/LeadAssignmentManager';
import * as XLSX from 'xlsx';
import {
  type Lead,
  type Pipeline,
  type PipelineStage,
  type StageMovePromptMode,
  STANDARD_CRM_STAGES,
  DEFAULT_QUANTITY_PIPELINES,
  DEFAULT_DESIGN_STAGES,
  DEFAULT_DESIGN_PIPELINE,
  DEFAULT_PRODUCTION_STAGES,
  DEFAULT_PRODUCTION_PIPELINE,
} from '../types';
import toast from 'react-hot-toast';
import { ProductionJobCardModal } from '../components/Production/ProductionJobCardModal';
import { ProductionSpecsModal } from '../components/Production/ProductionSpecsModal';
import { ProductionProgressModal } from '../components/Production/ProductionProgressModal';
import { DesignBriefModal } from '../components/Design/DesignBriefModal';
import { SubmitDesignRequestModal } from '../components/Pipeline/SubmitDesignRequestModal';
import { printProductionTeamChecklist, printDesignTeamChecklist } from '../utils/printDesignProductionSheet';
import { useCRMPermission } from '../hooks/useCRMPermission';
import { StageChangeConfirmModal } from '../components/CRM/StageChangeConfirmModal';
import { LeadNotesDrawer } from '../components/CRM/LeadNotesDrawer';
import {
  executeManualStageMove,
  getStageMessageConfig,
  getStageMoveMode,
  setStageMoveMode,
  subscribeStageMoveModeChange,
  openWhatsAppWebDirect,
  runAutoStageMoveWithToast,
  stageRequiresReason,
} from '../services/stageNotificationService';
import { PipelineQuickChatModal } from '../components/Pipeline/PipelineQuickChatModal';
import { FollowupAutomationModal } from '../components/Pipeline/FollowupAutomationModal';
import {
  subscribeFollowupAutomationConfig,
  type WhatsAppFollowupAutomationConfig,
  DEFAULT_FOLLOWUP_CONFIG
} from '../services/whatsappFollowupAutomationService';
import { formatWhatsAppNumberDisplay } from '../utils/whatsappNumberUtils';
import { OrderTypeStageSummary } from '../components/Pipeline/OrderTypeStageSummary';

function SourceWhatsappBadge({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const displayValue =
    formatWhatsAppNumberDisplay(lead.source_whatsapp_number) ||
    (lead.source === 'WhatsApp' ? lead.source_whatsapp_label : '');
  if (!displayValue) return null;

  return (
    <span
      className={`inline-flex items-center font-bold rounded-input bg-primary/10 text-primary border border-primary/20 font-mono text-[9px] ${compact ? 'gap-0.5 px-1.5 py-0.2' : 'gap-1 px-1.5 py-0.5'
        }`}
      title={`WhatsApp: ${displayValue}`}
    >
      <Phone size={compact ? 8 : 9} className="shrink-0 text-primary" />
      {displayValue}
    </span>
  );
}

function LeadIntentPill({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  if (!lead.intent_tier) return null;
  const isHigh = lead.intent_tier === 'HIGH';
  const isMed = lead.intent_tier === 'MEDIUM';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-input font-extrabold uppercase border ${compact ? 'px-1.5 py-0.2 text-[8px]' : 'px-2 py-0.5 text-[9px]'
        } ${isHigh
          ? 'bg-primary text-surface border-primary-dark shadow-sm'
          : isMed
            ? 'bg-tertiary/15 text-tertiary border-tertiary/30'
            : 'bg-surface text-secondary border-shadow-darker/20'
        }`}
      title={`Intent: ${lead.intent_tier} (${lead.intent_score ?? 50}/100)`}
    >
      {isHigh && <Zap size={compact ? 8 : 9} className="fill-surface text-surface shrink-0" />}
      {lead.intent_tier}
    </span>
  );
}

type StageDraft = {
  id: string;
  label: string;
  required_fields?: string[];
};

type PipelineDraft = {
  name: string;
  scenario: string;
  stages: StageDraft[];
};

export interface StagePhase {
  id: string;
  name: string;
  shortLabel: string;
  badgeTone: string;
  borderTone: string;
  stageIds: string[];
}

export const STAGE_PHASES: StagePhase[] = [
  {
    id: 'phase_discovery',
    name: 'Discovery & Requirements',
    shortLabel: '1. Discovery',
    badgeTone: 'bg-primary/10 text-primary border-primary/20',
    borderTone: 'border-primary/40',
    stageIds: ['new_enquiry', 'requirement_collection', 'requirement_confirmed'],
  },
  {
    id: 'phase_design_quote',
    name: 'Design & Quotation',
    shortLabel: '2. Design & Quote',
    badgeTone: 'bg-primary-dark/10 text-primary-dark border-primary-dark/20',
    borderTone: 'border-primary-dark/40',
    stageIds: ['design_stage', 'design_approval', 'quotation_sent', 'follow_up'],
  },
  {
    id: 'phase_production',
    name: 'Order & Production',
    shortLabel: '3. Production',
    badgeTone: 'bg-tertiary/10 text-tertiary border-tertiary/20',
    borderTone: 'border-tertiary/40',
    stageIds: ['advance_payment', 'production', 'quality_check'],
  },
  {
    id: 'phase_fulfillment',
    name: 'Fulfillment & Dispatch',
    shortLabel: '4. Fulfillment',
    badgeTone: 'bg-secondary/15 text-primary-dark border-secondary/25',
    borderTone: 'border-secondary/40',
    stageIds: ['ready_for_dispatch', 'dispatch', 'delivered'],
  },
  {
    id: 'phase_closing',
    name: 'Payment & Closing',
    shortLabel: '5. Closing',
    badgeTone: 'bg-primary text-surface border-primary',
    borderTone: 'border-primary',
    stageIds: ['full_payment', 'completed', 'lost_cancelled'],
  },
];

function getStagePhase(stageId: string): StagePhase | null {
  return STAGE_PHASES.find((p) => p.stageIds.includes(stageId)) || null;
}

const STORAGE_KEY = 'billpro.activePipelineId';

const TONES = [
  'border-primary/20 hover:border-primary/40',
  'border-primary-dark/20 hover:border-primary-dark/40',
  'border-secondary/30 hover:border-secondary/50',
  'border-tertiary/25 hover:border-tertiary/45',
  'border-primary/30 hover:border-primary/50',
  'border-secondary/40 hover:border-secondary/60',
  'border-tertiary/30 hover:border-tertiary/50',
  'border-primary/25 hover:border-primary/45',
  'border-primary-dark/25 hover:border-primary-dark/45',
  'border-secondary/35 hover:border-secondary/55',
  'border-tertiary/35 hover:border-tertiary/55',
  'border-primary/35 hover:border-primary/55',
];

function stageTone(index: number) {
  return TONES[index % TONES.length];
}

function formatDate(value: any) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString('en-IN');
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toLocaleDateString('en-IN');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-IN');
}

function getReminderBadge(reminder: any): { text: string; tone: string; isOverdue: boolean } | null {
  if (!reminder || !reminder.datetime) return null;
  const d =
    typeof reminder.datetime.toDate === 'function'
      ? reminder.datetime.toDate()
      : typeof reminder.datetime.seconds === 'number'
        ? new Date(reminder.datetime.seconds * 1000)
        : new Date(reminder.datetime);
  if (Number.isNaN(d.getTime())) return null;

  const diffMs = d.getTime() - Date.now();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) {
    const minsAgo = Math.abs(diffMins);
    const timeStr = minsAgo < 60 ? `${minsAgo}m ago` : `${Math.round(minsAgo / 60)}h ago`;
    return {
      text: `Overdue (${timeStr})`,
      tone: 'bg-tertiary text-surface border-tertiary font-bold',
      isOverdue: true,
    };
  }

  if (diffMins < 60) {
    return {
      text: `In ${diffMins}m`,
      tone: 'bg-tertiary/20 text-tertiary border-tertiary/40 font-bold',
      isOverdue: false,
    };
  }

  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const isToday = d.toDateString() === new Date().toDateString();
  return {
    text: `${isToday ? 'Today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${timeStr}`,
    tone: 'bg-primary/10 text-primary border-primary/20 font-semibold',
    isOverdue: false,
  };
}

function normalizePipeline(pipeline: any): Pipeline {
  const isDesign = pipeline?.id === 'design_pipeline' || pipeline?.pipeline_type === 'design';
  const isProduction = pipeline?.id === 'production_pipeline' || pipeline?.pipeline_type === 'production';
  const stages: PipelineStage[] =
    Array.isArray(pipeline?.stages) && pipeline.stages.length > 0
      ? pipeline.stages.map((stage: any, index: number) => ({
        id: String(stage?.id || `stage_${index + 1}`),
        label: String(stage?.label || `Stage ${index + 1}`),
        required_fields: Array.isArray(stage?.required_fields) ? stage.required_fields : [],
      }))
      : isDesign
        ? DEFAULT_DESIGN_STAGES.map((s) => ({ ...s }))
        : isProduction
          ? DEFAULT_PRODUCTION_STAGES.map((s) => ({ ...s }))
          : STANDARD_CRM_STAGES.map((stage) => ({ ...stage }));

  return {
    id: String(pipeline?.id || 'pipeline_default'),
    name: String(
      pipeline?.name ||
      (isDesign ? '🎨 Design Team Pipeline' : isProduction ? '🏭 Production Team Pipeline' : 'Untitled Pipeline')
    ),
    scenario: String(
      pipeline?.scenario ||
      (isDesign
        ? 'Artwork, Concepts & Mockups'
        : isProduction
          ? 'Cutting, Engraving, Assembly & QC'
          : '')
    ),
    stages,
    is_default: Boolean(pipeline?.is_default),
    pipeline_type: pipeline?.pipeline_type || (isDesign ? 'design' : isProduction ? 'production' : undefined),
    created_at: pipeline?.created_at || new Date(),
    updated_at: pipeline?.updated_at,
  };
}

export default function PipelineBoard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPipeline = searchParams.get('pipeline');

  const [pipelines, setPipelines] = useState<Pipeline[]>(DEFAULT_QUANTITY_PIPELINES);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(() => {
    if (urlPipeline) return urlPipeline;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    return 'regular_order';
  });

  // Manage Stages Modal state (for Design & Production pipelines)
  const [showManageStagesModal, setShowManageStagesModal] = useState(false);
  const [editingStages, setEditingStages] = useState<PipelineStage[]>([]);
  const [newStageLabel, setNewStageLabel] = useState('');
  const [isSavingStages, setIsSavingStages] = useState(false);
  // Factory Production Job Card & Specs states
  const [selectedJobCardLead, setSelectedJobCardLead] = useState<Lead | null>(null);
  const [selectedProductionSpecsLead, setSelectedProductionSpecsLead] = useState<Lead | null>(null);
  const [selectedProductionSpecsMode, setSelectedProductionSpecsMode] = useState<'view' | 'edit'>('view');
  const [selectedProductionProgressLead, setSelectedProductionProgressLead] = useState<Lead | null>(null);
  // Design Brief & Submission states
  const [selectedDesignBriefLead, setSelectedDesignBriefLead] = useState<Lead | null>(null);
  const [submitDesignModalLead, setSubmitDesignModalLead] = useState<Lead | null>(null);
  const [submitDesignTargetStage, setSubmitDesignTargetStage] = useState<string>('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingPipelines, setLoadingPipelines] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [qualificationFilter, setQualificationFilter] = useState('all');
  const [salesPersonFilter, setSalesPersonFilter] = useState('all');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({});

  const [dragId, setDragId] = useState('');
  const [message, setMessage] = useState('');
  const [stageMoveMode, setStageMoveModeState] = useState<StageMovePromptMode>(() => getStageMoveMode());
  const { hasPermission } = useCRMPermission();
  const { dbUser } = useAuth();
  const isAdmin = isAdminUser(dbUser);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);

  // Stage Change Confirmation Modal State
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    lead: Lead | null;
    fromStage: PipelineStage | { id: string; label: string };
    toStage: PipelineStage | { id: string; label: string };
  }>({
    isOpen: false,
    lead: null,
    fromStage: { id: '', label: '' },
    toStage: { id: '', label: '' },
  });

  // Quick Chat State
  const [quickChatLead, setQuickChatLead] = useState<Lead | null>(null);
  // Delete Lead Confirmation State
  const [deleteConfirmLead, setDeleteConfirmLead] = useState<Lead | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState(false);
  // 7:30 AM Follow-Up Automation Modal & Config State
  const [showFollowupModal, setShowFollowupModal] = useState(false);
  const [followupConfig, setFollowupConfig] = useState<WhatsAppFollowupAutomationConfig>(DEFAULT_FOLLOWUP_CONFIG);

  useEffect(() => {
    return subscribeFollowupAutomationConfig(setFollowupConfig);
  }, []);
  // Notes & Reminders Drawer State
  const [notesDrawerState, setNotesDrawerState] = useState<{
    isOpen: boolean;
    lead: Lead | null;
    stageName?: string;
  }>({
    isOpen: false,
    lead: null,
    stageName: '',
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 2);
      setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth - 5);
    }
  };

  const scrollPipeline = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const firstChild = container.firstElementChild as HTMLElement;
      if (firstChild) {
        const scrollAmount = firstChild.offsetWidth + 16;
        container.scrollBy({
          left: direction === 'left' ? -scrollAmount : scrollAmount,
          behavior: 'smooth',
        });
      }
    }
  };

  const scrollToStage = (stageId: string) => {
    const el = document.getElementById(`stage-col-${stageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  };

  const toggleStageCollapse = (stageId: string) => {
    setCollapsedStages((prev) => ({
      ...prev,
      [stageId]: !prev[stageId],
    }));
  };

  const handleContainerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!scrollContainerRef.current || !dragId) return;
    const container = scrollContainerRef.current;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const edgeThreshold = 80;
    if (x < edgeThreshold) {
      container.scrollLeft -= 15;
    } else if (x > rect.width - edgeThreshold) {
      container.scrollLeft += 15;
    }
  };

  useEffect(() => {
    return subscribeStageMoveModeChange((mode) => {
      setStageMoveModeState(mode);
    });
  }, []);

  useEffect(() => {
    if (!db) return;

    // Load pipelines
    const unsubPipelines = onSnapshot(
      collection(db, 'pipelines'),
      (snap) => {
        if (snap.empty) {
          setPipelines(DEFAULT_QUANTITY_PIPELINES);
        } else {
          const list = snap.docs.map((d) => normalizePipeline({ id: d.id, ...d.data() }));
          // Ensure default pipelines exist if not present
          const merged = [...list];
          DEFAULT_QUANTITY_PIPELINES.forEach((def) => {
            if (!merged.some((p) => p.id === def.id)) {
              merged.push(def);
            }
          });
          setPipelines(merged);
        }
        setLoadingPipelines(false);
      },
      (err) => {
        console.error('Failed to load pipelines:', err);
        setPipelines(DEFAULT_QUANTITY_PIPELINES);
        setLoadingPipelines(false);
      }
    );

    // Load leads (Admin sees all; team members only see leads assigned to them)
    const unsubLeads = subscribeScopedLeads(
      db,
      dbUser,
      (list) => {
        setLeads(list);
        setLoadingLeads(false);
      },
      (err) => {
        console.error('Failed to load leads:', err);
        setLoadingLeads(false);
      }
    );

    return () => {
      unsubPipelines();
      unsubLeads();
    };
  }, [dbUser?.id, dbUser?.role]);

  const userRole = normalizeRole(dbUser?.role);

  // Sync if URL search param changes with strict role boundary guards
  useEffect(() => {
    if (userRole === 'design') {
      if (selectedPipelineId !== 'design_pipeline') {
        setSelectedPipelineId('design_pipeline');
      }
      return;
    }

    if (userRole === 'production') {
      if (selectedPipelineId !== 'production_pipeline') {
        setSelectedPipelineId('production_pipeline');
      }
      return;
    }

    // Sales and non-admin roles cannot view design or production pipelines
    if (userRole === 'sales' || !isAdmin) {
      if (urlPipeline === 'design_pipeline' || urlPipeline === 'production_pipeline') {
        setSelectedPipelineId('default_pipeline');
        return;
      }
    }

    if (urlPipeline && urlPipeline !== selectedPipelineId) {
      setSelectedPipelineId(urlPipeline);
    }
  }, [urlPipeline, userRole, selectedPipelineId, isAdmin]);

  // Role-filtered pipelines:
  // - Admin: all pipelines
  // - Design: ONLY design_pipeline
  // - Production: ONLY production_pipeline
  // - Sales & others: ONLY sales pipelines (never design or production)
  const visiblePipelines = useMemo(() => {
    if (isAdmin) return pipelines;

    if (userRole === 'design') {
      const designPipes = pipelines.filter(
        (p) => p.id === 'design_pipeline' || p.pipeline_type === 'design'
      );
      return designPipes.length > 0 ? designPipes : [DEFAULT_DESIGN_PIPELINE];
    }

    if (userRole === 'production') {
      const prodPipes = pipelines.filter(
        (p) => p.id === 'production_pipeline' || p.pipeline_type === 'production'
      );
      return prodPipes.length > 0 ? prodPipes : [DEFAULT_PRODUCTION_PIPELINE];
    }

    // Sales & other non-admin roles: exclude design & production pipelines
    return pipelines.filter(
      (p) =>
        p.id !== 'design_pipeline' &&
        p.id !== 'production_pipeline' &&
        p.pipeline_type !== 'design' &&
        p.pipeline_type !== 'production'
    );
  }, [pipelines, userRole, isAdmin]);

  const activePipeline = useMemo(() => {
    const found = visiblePipelines.find((p) => p.id === selectedPipelineId);
    return (
      found ||
      visiblePipelines[0] ||
      (userRole === 'design'
        ? DEFAULT_DESIGN_PIPELINE
        : userRole === 'production'
          ? DEFAULT_PRODUCTION_PIPELINE
          : DEFAULT_QUANTITY_PIPELINES[1])
    );
  }, [visiblePipelines, selectedPipelineId, userRole]);

  const isDesignPipeline = useMemo(() => {
    return activePipeline?.id === 'design_pipeline' || activePipeline?.pipeline_type === 'design';
  }, [activePipeline]);

  const isProductionPipeline = useMemo(() => {
    return activePipeline?.id === 'production_pipeline' || activePipeline?.pipeline_type === 'production';
  }, [activePipeline]);

  const activeStages = useMemo(() => {
    if (activePipeline?.stages?.length) return activePipeline.stages;
    if (isDesignPipeline) return DEFAULT_DESIGN_STAGES;
    if (isProductionPipeline) return DEFAULT_PRODUCTION_STAGES;
    return STANDARD_CRM_STAGES;
  }, [activePipeline, isDesignPipeline, isProductionPipeline]);

  // Extract unique sales persons from leads
  const salesPersons = useMemo(() => {
    const reps = new Set<string>();
    leads.forEach((l) => {
      if (l.sales_person && l.sales_person.trim()) {
        reps.add(l.sales_person.trim());
      }
    });
    return Array.from(reps).sort();
  }, [leads]);

  // Filter and Group leads
  const { filteredLeadsList, groupedLeads } = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    activeStages.forEach((stage) => {
      map[stage.id] = [];
    });
    map['other'] = [];

    const list: Lead[] = [];

    leads.forEach((lead) => {
      if (isDesignPipeline) {
        // A lead qualifies for the Design Pipeline if:
        // 1. lead.pipeline_id === 'design_pipeline' OR
        // 2. lead.status is 'design_stage', 'design_approval', or 'requirement_design_finalization' OR
        // 3. lead.design_stage_id is set OR
        // 4. lead.design_person is assigned AND lead is not closed
        const isDesignLead =
          lead.pipeline_id === 'design_pipeline' ||
          lead.status === 'design_stage' ||
          lead.status === 'design_approval' ||
          lead.status === 'requirement_design_finalization' ||
          Boolean((lead as any).design_stage_id) ||
          (Boolean((lead as any).design_person) && lead.status !== 'completed' && lead.status !== 'lost_cancelled');

        if (!isDesignLead) return;
      } else if (isProductionPipeline) {
        // A lead qualifies for the Production Pipeline if:
        // 1. lead.pipeline_id === 'production_pipeline' OR
        // 2. lead.status is 'advance_payment', 'production', 'quality_check', or 'ready_for_dispatch' OR
        // 3. lead.production_stage_id is set OR
        // 4. lead.production_person is assigned AND lead is not closed
        const isProdLead =
          lead.pipeline_id === 'production_pipeline' ||
          lead.status === 'advance_payment' ||
          lead.status === 'production' ||
          lead.status === 'quality_check' ||
          lead.status === 'ready_for_dispatch' ||
          Boolean((lead as any).production_stage_id) ||
          (Boolean((lead as any).production_person) && lead.status !== 'completed' && lead.status !== 'lost_cancelled');

        if (!isProdLead) return;
      } else {
        // Standard sales pipeline matching
        const leadPipeId = lead.pipeline_id || 'regular_order';
        const matchesPipeline =
          leadPipeId === activePipeline.id ||
          (activePipeline.id === 'regular_order' && (leadPipeId === 'default' || !leadPipeId));

        if (!matchesPipeline) return;
      }

      // Filter by Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (lead.name || '').toLowerCase().includes(q) ||
          (lead.phone || '').includes(q) ||
          (lead.company || '').toLowerCase().includes(q) ||
          (lead.event_name || '').toLowerCase().includes(q) ||
          ((lead.sales_person || '').toLowerCase().includes(q)) ||
          (((lead as any).design_person || '').toLowerCase().includes(q)) ||
          (((lead as any).production_person || '').toLowerCase().includes(q));
        if (!match) return;
      }

      // Filter by Urgency
      if (urgencyFilter !== 'all' && lead.urgency !== urgencyFilter) {
        return;
      }

      // Filter by Qualification
      if (qualificationFilter !== 'all' && lead.qualification_status !== qualificationFilter) {
        return;
      }

      // Filter by Sales Person / Assignee
      if (salesPersonFilter !== 'all') {
        if (salesPersonFilter === 'my_leads') {
          const myName = (dbUser?.name || '').trim().toLowerCase();
          const myEmail = (dbUser?.email || '').trim().toLowerCase();
          const leadRep = (lead.sales_person || '').trim().toLowerCase();
          const leadDesigner = ((lead as any).design_person || '').trim().toLowerCase();
          const leadProduction = ((lead as any).production_person || '').trim().toLowerCase();
          const leadOwnerId = (lead.owner_id || (lead as any).ownerId || '').trim();
          const isMe = (leadOwnerId && leadOwnerId === dbUser?.id) ||
            (leadRep && (leadRep === myName || leadRep === myEmail)) ||
            (leadDesigner && (leadDesigner === myName || leadDesigner === myEmail)) ||
            (leadProduction && (leadProduction === myName || leadProduction === myEmail));
          if (!isMe) return;
        } else if (salesPersonFilter === 'unassigned') {
          if (lead.sales_person && lead.sales_person.trim()) return;
        } else if (
          lead.sales_person !== salesPersonFilter &&
          (lead as any).design_person !== salesPersonFilter &&
          (lead as any).production_person !== salesPersonFilter
        ) {
          return;
        }
      }

      // Filter by Stage Phase (only if NOT design or production pipeline, because sub-workflows have their own stages)
      if (!isDesignPipeline && !isProductionPipeline && phaseFilter !== 'all') {
        const selectedPhase = STAGE_PHASES.find((p) => p.id === phaseFilter);
        const currentStage = lead.status || activeStages[0]?.id || 'new_enquiry';
        if (selectedPhase && !selectedPhase.stageIds.includes(currentStage)) {
          return;
        }
      }

      list.push(lead);

      const statusKey = isDesignPipeline
        ? ((lead as any).design_stage_id || activeStages[0]?.id || 'concept_creation')
        : isProductionPipeline
          ? ((lead as any).production_stage_id || activeStages[0]?.id || 'material_prep')
          : (lead.status || activeStages[0]?.id || 'new_enquiry');
      if (map[statusKey]) {
        map[statusKey].push(lead);
      } else {
        map['other'].push(lead);
      }
    });

    return { filteredLeadsList: list, groupedLeads: map };
  }, [
    leads,
    activePipeline,
    isDesignPipeline,
    isProductionPipeline,
    activeStages,
    searchQuery,
    urgencyFilter,
    qualificationFilter,
    salesPersonFilter,
    phaseFilter,
  ]);

  // Displayed stages based on phase filter
  const displayedStages = useMemo(() => {
    if (isDesignPipeline || isProductionPipeline || phaseFilter === 'all') return activeStages;
    const selectedPhase = STAGE_PHASES.find((p) => p.id === phaseFilter);
    if (!selectedPhase) return activeStages;
    return activeStages.filter((s) => selectedPhase.stageIds.includes(s.id));
  }, [activeStages, phaseFilter, isDesignPipeline, isProductionPipeline]);

  // Phase-level stats for Navigator ribbon
  const phaseStats = useMemo(() => {
    return STAGE_PHASES.map((phase) => {
      let count = 0;
      let val = 0;
      phase.stageIds.forEach((sId) => {
        const arr = groupedLeads[sId] || [];
        count += arr.length;
        arr.forEach((l) => {
          if (l.value && typeof l.value === 'number') val += l.value;
        });
      });
      return {
        ...phase,
        count,
        value: val,
      };
    });
  }, [groupedLeads]);

  const handleSelectPipeline = (id: string) => {
    setSelectedPipelineId(id);
    localStorage.setItem(STORAGE_KEY, id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === 'regular_order') {
        next.delete('pipeline');
      } else {
        next.set('pipeline', id);
      }
      return next;
    }, { replace: true });
  };

  const handleAddCustomStage = () => {
    if (!newStageLabel.trim()) return;
    const cleanId = newStageLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `stage_${Date.now()}`;
    const nextLabel = newStageLabel.trim();
    if (editingStages.some((s) => s.id === cleanId)) {
      toast.error('A stage with this ID already exists. Please choose a different name.');
      return;
    }
    setEditingStages([...editingStages, { id: cleanId, label: nextLabel }]);
    setNewStageLabel('');
  };

  const handleRemoveCustomStage = (stageId: string) => {
    if (editingStages.length <= 2) {
      toast.error('The pipeline must contain at least 2 stages.');
      return;
    }
    setEditingStages(editingStages.filter((s) => s.id !== stageId));
  };

  const handleMoveStageOrder = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= editingStages.length) return;
    const copy = [...editingStages];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    setEditingStages(copy);
  };

  const handleSaveDesignStages = async () => {
    if (editingStages.length < 2) {
      toast.error('Pipeline must have at least 2 stages.');
      return;
    }
    setIsSavingStages(true);
    try {
      const docRef = doc(db, 'pipelines', activePipeline.id);
      await setDoc(
        docRef,
        {
          id: activePipeline.id,
          name: activePipeline.name,
          scenario: activePipeline.scenario,
          pipeline_type: activePipeline.pipeline_type || (isDesignPipeline ? 'design' : isProductionPipeline ? 'production' : undefined),
          stages: editingStages,
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success(`${activePipeline.name} stages saved successfully!`);
      setShowManageStagesModal(false);
    } catch (err: any) {
      console.error('Failed to save pipeline stages:', err);
      toast.error('Failed to save stages: ' + (err?.message || 'Permission denied'));
    } finally {
      setIsSavingStages(false);
    }
  };

  const initiateStageMove = async (lead: Lead, targetStageId: string) => {
    if (isDesignPipeline) {
      const currentStageId = (lead as any).design_stage_id || activeStages[0]?.id || 'concept_creation';
      if (currentStageId === targetStageId) return;

      const fromStage = activeStages.find((s) => s.id === currentStageId) || {
        id: currentStageId,
        label: currentStageId,
      };
      const toStage = activeStages.find((s) => s.id === targetStageId) || {
        id: targetStageId,
        label: targetStageId,
      };

      try {
        const updates: any = {
          design_stage_id: targetStageId,
          updated_at: serverTimestamp(),
        };

        if (targetStageId === 'client_proofing') {
          updates.design_status = 'proof_sent';
        } else if (targetStageId === 'revision_needed') {
          updates.design_status = 'revisions_requested';
        } else if (targetStageId === 'final_artwork_ready') {
          updates.design_status = 'approved';
          // Auto-advance sales lead if currently in design_stage or design_approval
          if (!lead.status || lead.status === 'design_stage' || lead.status === 'design_approval') {
            updates.status = 'quotation_sent';
          }
        } else {
          updates.design_status = 'in_progress';
        }

        await updateDoc(doc(db, 'leads', lead.id), updates);

        const autoAdvanceNote =
          targetStageId === 'final_artwork_ready' && updates.status === 'quotation_sent'
            ? ' Auto-advanced sales pipeline to "Quotation Sent".'
            : '';

        await addDoc(collection(db, 'activities'), {
          lead_id: lead.id,
          type: 'design_stage_changed',
          content: `🎨 Design Stage changed: "${fromStage.label}" ➔ "${toStage.label}" by ${dbUser?.name || 'Designer'}.${autoAdvanceNote}`,
          user_name: dbUser?.name || 'Designer',
          user_id: dbUser?.id || '',
          created_at: serverTimestamp(),
        });

        toast.success(`Design stage updated: ${toStage.label}${autoAdvanceNote ? ' (Sales Lead advanced to Quotation Sent)' : ''}`);
      } catch (err: any) {
        console.error('Failed to move design stage:', err);
        toast.error('Failed to update design stage: ' + (err?.message || 'Unknown error'));
      }
      return;
    }

    if (isProductionPipeline) {
      const currentStageId = (lead as any).production_stage_id || activeStages[0]?.id || 'material_prep';
      if (currentStageId === targetStageId) return;

      const fromStage = activeStages.find((s) => s.id === currentStageId) || {
        id: currentStageId,
        label: currentStageId,
      };
      const toStage = activeStages.find((s) => s.id === targetStageId) || {
        id: targetStageId,
        label: targetStageId,
      };

      try {
        const updates: any = {
          production_stage_id: targetStageId,
          updated_at: serverTimestamp(),
        };

        if (targetStageId === 'quality_check') {
          updates.production_status = 'qc_passed';
          if (lead.status === 'production') updates.status = 'quality_check';
        } else if (targetStageId === 'ready_for_dispatch') {
          updates.production_status = 'packed';
          if (lead.status === 'production' || lead.status === 'quality_check' || lead.status === 'advance_payment') {
            updates.status = 'ready_for_dispatch';
          }
        } else {
          updates.production_status = 'in_production';
          if (lead.status === 'advance_payment') updates.status = 'production';
        }

        await updateDoc(doc(db, 'leads', lead.id), updates);

        const autoAdvMsg =
          targetStageId === 'ready_for_dispatch' && updates.status === 'ready_for_dispatch'
            ? ' Auto-advanced sales pipeline to "Ready for Dispatch".'
            : '';

        await addDoc(collection(db, 'activities'), {
          lead_id: lead.id,
          type: 'production_stage_changed',
          content: `🏭 Production Stage changed: "${fromStage.label}" ➔ "${toStage.label}" by ${dbUser?.name || 'Production'}.${autoAdvMsg}`,
          user_name: dbUser?.name || 'Production',
          user_id: dbUser?.id || '',
          created_at: serverTimestamp(),
        });

        toast.success(`Production stage updated: ${toStage.label}${autoAdvMsg ? ' (Order ready for dispatch)' : ''}`);
      } catch (err: any) {
        console.error('Failed to move production stage:', err);
        toast.error('Failed to update production stage: ' + (err?.message || 'Unknown error'));
      }
      return;
    }

    const currentStageId = lead.status || activeStages[0]?.id || 'new_enquiry';
    if (currentStageId === targetStageId) return;

    // Prompt Sales with Design Request form when moving to Design stage
    if (
      !isDesignPipeline &&
      !isProductionPipeline &&
      (targetStageId === 'requirement_design_finalization' || targetStageId === 'design_stage')
    ) {
      setSubmitDesignTargetStage(targetStageId);
      setSubmitDesignModalLead(lead);
      return;
    }

    const fromStage = activeStages.find((s) => s.id === currentStageId) || {
      id: currentStageId,
      label: currentStageId,
    };
    const toStage = activeStages.find((s) => s.id === targetStageId) || {
      id: targetStageId,
      label: targetStageId,
    };

    let effectiveMode = toStage.move_prompt_mode || stageMoveMode;
    if (!toStage.move_prompt_mode && stageMoveMode === 'ask') {
      try {
        const cfg = await getStageMessageConfig(toStage.id, toStage.label, activePipeline.id);
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
        pipelineId: activePipeline.id,
        pipelineName: activePipeline.name,
      });
      return;
    }

    if (effectiveMode === 'without_message' && !stageRequiresReason(toStage)) {
      try {
        const res = await executeManualStageMove({
          lead,
          fromStage,
          toStage,
          pipelineId: activePipeline.id,
          pipelineName: activePipeline.name,
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
    });
  };

  // Intercept Drop Action to either auto-send immediately or open confirmation modal
  const handleCardDrop = (targetStageId: string) => {
    if (!dragId) return;
    const targetLead = leads.find((l) => l.id === dragId);
    setDragId('');
    if (!targetLead) return;
    initiateStageMove(targetLead, targetStageId);
  };

  const handleQuickMove = (lead: Lead, targetStageId: string) => {
    initiateStageMove(lead, targetStageId);
  };

  const handleDeleteLead = async () => {
    if (!deleteConfirmLead) return;
    if (!hasPermission('edit_lead') && !isAdmin) {
      toast.error('You do not have permission to delete leads.');
      return;
    }
    setIsDeletingLead(true);
    try {
      await deleteDoc(doc(db, 'leads', deleteConfirmLead.id));
      toast.success(`Lead "${deleteConfirmLead.name}" deleted successfully.`);
      if (quickChatLead?.id === deleteConfirmLead.id) {
        setQuickChatLead(null);
      }
      if (notesDrawerState.lead?.id === deleteConfirmLead.id) {
        setNotesDrawerState({ isOpen: false, lead: null, stageName: '' });
      }
      setDeleteConfirmLead(null);
    } catch (err: any) {
      console.error('Failed to delete lead from pipeline', err);
      toast.error('Failed to delete lead: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeletingLead(false);
    }
  };

  const handleExportExcel = () => {
    try {
      const rows: any[] = [];
      activeStages.forEach((stage) => {
        const stageLeads = groupedLeads[stage.id] || [];
        stageLeads.forEach((lead) => {
          rows.push({
            'Customer Name': lead.name,
            Company: lead.company || lead.organization || '',
            Phone: lead.phone || '',
            Email: lead.email || '',
            Quantity: lead.required_quantity || '',
            'Order Value': lead.value || 0,
            'Event Name': lead.event_name || '',
            'Event Date': lead.event_date || '',
            'Delivery Date': lead.delivery_date || '',
            'Aligned To': lead.sales_person || 'Unassigned',
            Stage: stage.label,
            Pipeline: activePipeline.name,
            Urgency: lead.urgency || '',
            Qualification: lead.qualification_status || '',
            'Created Date': formatDate(lead.created_at),
          });
        });
      });

      if (rows.length === 0) {
        setMessage('No leads found in this pipeline to export.');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pipeline Leads');
      XLSX.writeFile(wb, `${activePipeline.name.replace(/\s+/g, '_')}_Leads.xlsx`);
      setMessage('Exported pipeline leads to Excel successfully.');
    } catch (err: any) {
      console.error('Export failed:', err);
      setMessage('Failed to export to Excel.');
    }
  };

  const totalPipelineLeads = useMemo(() => {
    return Object.values(groupedLeads).reduce((sum, arr) => sum + arr.length, 0);
  }, [groupedLeads]);

  const totalPipelineValue = useMemo(() => {
    let val = 0;
    Object.values(groupedLeads).forEach((arr) => {
      arr.forEach((l) => {
        if (l.value && typeof l.value === 'number') val += l.value;
      });
    });
    return val;
  }, [groupedLeads]);

  return (
    <div className="space-y-5 animate-fade-in max-w-full">
      {/* Top Header & Global Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-primary">CRM Workspace</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark font-bold border border-primary/20 flex items-center gap-1 shrink-0">
              <CheckCircle2 size={11} className="text-primary" /> Active Pipeline
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-primary-dark mt-1">Pipeline Board</h1>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
          {/* View Mode Switcher (Kanban vs Table) */}
          <div className="flex items-center p-1 bg-surface rounded-xl border border-shadow-darker/20 shadow-neo-surface">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${viewMode === 'kanban'
                ? 'bg-primary text-surface shadow-sm'
                : 'text-secondary hover:text-primary-dark'
                }`}
            >
              <Columns3 size={14} /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${viewMode === 'table'
                ? 'bg-primary text-surface shadow-sm'
                : 'text-secondary hover:text-primary-dark'
                }`}
            >
              <LayoutList size={14} /> Table
            </button>
          </div>

          {/* Stage Move Option: Ask (With/Without Message), Auto-Send, or No Message */}
          <div
            className="flex items-center rounded-xl border border-shadow-darker/20 bg-surface p-0.5 shadow-xs text-xs"
            title="Configure stage transition behavior"
          >
            <button
              type="button"
              onClick={() => setStageMoveMode('ask')}
              className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${stageMoveMode === 'ask'
                ? 'bg-primary text-white shadow-xs'
                : 'text-secondary hover:text-primary-dark'
                }`}
              title="Ask 'With Message' or 'Without Message' whenever a lead is moved"
            >
              <MessageSquare size={13} />
              <span>Ask on Move</span>
            </button>
            <button
              type="button"
              onClick={() => setStageMoveMode('auto_send')}
              className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${stageMoveMode === 'auto_send'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-secondary hover:text-primary-dark'
                }`}
              title="Auto-send WhatsApp update and move stage immediately"
            >
              <Send size={13} />
              <span>Auto-Send</span>
            </button>
            <button
              type="button"
              onClick={() => setStageMoveMode('without_message')}
              className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${stageMoveMode === 'without_message'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-secondary hover:text-primary-dark'
                }`}
              title="Move stage without sending any message"
            >
              <CheckCircle2 size={13} />
              <span>No Message</span>
            </button>
          </div>

          {/* 7:30 AM Automated Follow-Up Toggle & Modal Opener */}
          <button
            type="button"
            onClick={() => setShowFollowupModal(true)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-xs ${followupConfig.enabled
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-surface text-secondary border-shadow-darker/20 hover:text-primary-dark'
              }`}
            title="Configure or test 7:30 AM Automated WhatsApp Follow-up to leads in Follow-up stage"
          >
            <Clock size={13} className={followupConfig.enabled ? 'text-emerald-500 animate-pulse' : 'text-secondary'} />
            <span className="hidden sm:inline">7:30 AM Follow-Up:</span>
            <span className="sm:hidden">7:30 AM:</span>
            <span
              className={`font-extrabold px-1.5 py-0.2 rounded text-[10px] ${followupConfig.enabled
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                }`}
            >
              {followupConfig.enabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAssignmentModal(true)}
              className="neo-btn text-xs px-3 py-2 inline-flex items-center gap-1.5 font-bold text-primary-dark"
              title="Configure routing rules"
            >
              <GitBranch size={14} className="text-primary" /> Auto-Assign
            </button>
          )}
          <button
            onClick={handleExportExcel}
            className="neo-btn text-xs px-3 py-2 inline-flex items-center gap-1.5 font-bold text-primary-dark"
          >
            <Download size={14} className="text-secondary" /> Export
          </button>
          <Link
            to="/leads/new"
            className="neo-btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 font-bold text-surface shadow-md"
          >
            <UserPlus size={14} /> + Lead
          </Link>
        </div>
      </div>

      {/* Pipeline Tab Switcher (Small / Regular / Bulk / Custom / Design) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-2 bg-surface rounded-2xl border border-shadow-darker/20 shadow-neo-surface w-full min-w-0">
        <div className="w-full sm:flex-1 flex items-center gap-2 overflow-x-auto py-0.5 custom-sidebar-scrollbar snap-x">
          {visiblePipelines.map((pipe) => {
            const isSelected = pipe.id === activePipeline.id;
            const isDesign = pipe.id === 'design_pipeline' || pipe.pipeline_type === 'design';
            const isProd = pipe.id === 'production_pipeline' || pipe.pipeline_type === 'production';
            return (
              <button
                key={pipe.id}
                onClick={() => handleSelectPipeline(pipe.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-2 shrink-0 snap-start ${isSelected
                  ? 'bg-primary text-surface shadow-sm'
                  : 'text-secondary hover:text-primary-dark hover:bg-shadow-darker/10'
                  }`}
              >
                {isDesign && <Palette size={13} className={isSelected ? 'text-white' : 'text-primary'} />}
                {isProd && <Factory size={13} className={isSelected ? 'text-white' : 'text-primary'} />}
                <span>{pipe.name}</span>
                {pipe.scenario && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${isSelected ? 'bg-surface/20 text-surface' : 'bg-shadow-darker/20 text-secondary'
                      }`}
                  >
                    {pipe.scenario}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Pipeline Quick Summary */}
        <div className="flex items-center gap-3 text-xs font-bold px-2 py-1 text-secondary shrink-0">
          <span>
            Deals: <strong className="text-primary-dark">{totalPipelineLeads}</strong>
          </span>
          {totalPipelineValue > 0 && (
            <span>
              Value:{' '}
              <strong className="text-primary font-black">₹{totalPipelineValue.toLocaleString('en-IN')}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Bulk vs Regular Orders Stage Distribution Summary */}
      <OrderTypeStageSummary
        leads={leads}
        stages={activeStages}
        activePipelineId={selectedPipelineId}
        onSelectPipeline={handleSelectPipeline}
        onScrollToStage={scrollToStage}
        isDesignPipeline={isDesignPipeline}
        isProductionPipeline={isProductionPipeline}
        searchQuery={searchQuery}
        salesPersonFilter={salesPersonFilter}
        dbUser={dbUser}
      />

      {/* Stage Jump Navigator Ribbon (or Design/Production Sub-Workflow Banner) */}
      {isDesignPipeline ? (
        <div className="p-3.5 bg-surface rounded-2xl border border-shadow-darker/30 shadow-neo-surface flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center font-black shadow-sm shrink-0">
              <Palette size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-primary-dark uppercase tracking-wider">
                  Dedicated Design Pipeline &amp; Sub-Workflow
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark font-extrabold border border-primary/20">
                  {filteredLeadsList.length} Active Leads in Design
                </span>
              </div>
              <p className="text-xs text-secondary mt-0.5">
                Moving a design card to <strong>Final Artwork / Vector Ready</strong> automatically marks artwork approved and advances the sales lead to Quotation Sent.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
            {(isAdmin || dbUser?.role === 'design') && (
              <button
                type="button"
                onClick={() => {
                  setEditingStages([...activeStages]);
                  setShowManageStagesModal(true);
                }}
                className="neo-btn text-xs px-3.5 py-2 inline-flex items-center gap-1.5 font-bold text-primary-dark hover:text-primary border border-shadow-darker/30 shadow-xs"
                title="Add new stages, rename, or reorder design pipeline stages"
              >
                <Pencil size={13} className="text-primary" />
                <span>Manage Design Stages</span>
              </button>
            )}
          </div>
        </div>
      ) : isProductionPipeline ? (
        <div className="p-3.5 bg-surface rounded-2xl border border-shadow-darker/30 shadow-neo-surface flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 text-white flex items-center justify-center font-black shadow-sm shrink-0">
              <Factory size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-amber-950 uppercase tracking-wider">
                  🏭 Dedicated Production &amp; Manufacturing Sub-Workflow
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold border border-amber-200">
                  {filteredLeadsList.length} Orders in Production
                </span>
              </div>
              <p className="text-xs text-secondary mt-0.5">
                Manage material blanks, laser/UV engraving, assembly, QC, and box packing. Advancing to <strong>Ready for Dispatch</strong> updates the sales lead for dispatch hand-off.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
            {(isAdmin || dbUser?.role === 'production') && (
              <button
                type="button"
                onClick={() => {
                  setEditingStages([...activeStages]);
                  setShowManageStagesModal(true);
                }}
                className="neo-btn text-xs px-3.5 py-2 inline-flex items-center gap-1.5 font-bold text-amber-950 bg-white hover:bg-amber-50 border border-amber-200 shadow-xs"
                title="Add new stages, rename, or reorder manufacturing stages"
              >
                <Pencil size={13} className="text-amber-600" />
                <span>⚙️ Manage Production Stages</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-3 bg-surface rounded-2xl border border-shadow-darker/20 shadow-neo-surface space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-black text-primary-dark">
              <Layers size={14} className="text-primary" />
              <span>Phase Navigator</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Focus on specific phase"
                className="neo-input !py-1 !px-2.5 !text-xs font-bold text-primary-dark"
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
              >
                <option value="all">All Phases ({activeStages.length} Stages)</option>
                {STAGE_PHASES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-0.5 pb-0.5 overflow-x-auto custom-sidebar-scrollbar snap-x">
            {phaseStats.map((phase) => {
              const isPhaseActive = phaseFilter === 'all' || phaseFilter === phase.id;
              return (
                <div
                  key={phase.id}
                  className={`p-2 rounded-xl border transition-all text-xs flex flex-col justify-between min-w-[200px] sm:min-w-0 shrink-0 snap-start ${isPhaseActive
                    ? 'bg-surface border-shadow-darker/30 shadow-neo-surface'
                    : 'bg-surface/50 border-dashed border-shadow-darker/15 opacity-60'
                    }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-extrabold text-primary-dark truncate text-[11px]">{phase.shortLabel}</span>
                    <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {phase.count}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {phase.stageIds.map((sId) => {
                      const stageObj = activeStages.find((s) => s.id === sId);
                      if (!stageObj) return null;
                      const stageCount = groupedLeads[sId]?.length || 0;
                      return (
                        <button
                          key={sId}
                          type="button"
                          onClick={() => scrollToStage(sId)}
                          className={`text-[10px] px-1.5 py-0.5 rounded-md border flex items-center gap-1 transition-all ${stageCount > 0
                            ? 'bg-surface font-extrabold text-primary-dark border-primary/30 shadow-xs hover:border-primary hover:text-primary'
                            : 'bg-transparent text-secondary border-shadow-darker/15 hover:bg-shadow-darker/10'
                            }`}
                          title={`Jump to ${stageObj.label} (${stageCount})`}
                        >
                          <span className="truncate max-w-[75px]">{stageObj.label}</span>
                          {stageCount > 0 && <span className="text-primary font-black">· {stageCount}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Advanced Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 w-full min-w-0">
        <div className="relative w-full lg:flex-1 min-w-0 shrink-0">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary shrink-0" />
          <input
            type="text"
            className="neo-input w-full pl-10 text-xs min-w-0"
            placeholder="Search by customer name, phone, company, event, sales person..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary-dark shrink-0 p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-3 min-w-0 w-full lg:w-auto">
          {/* Sales Rep / Assignee Filter */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <span className="text-secondary font-bold">Aligned To:</span>
            <select
              aria-label="Filter by assigned team member"
              className="neo-input !py-1.5 !text-xs cursor-pointer min-w-0"
              value={salesPersonFilter}
              onChange={(e) => setSalesPersonFilter(e.target.value)}
            >
              <option value="all">All Team Members</option>
              <option value="my_leads">My Assigned Leads</option>
              <option value="unassigned">Unassigned Only</option>
              {salesPersons.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          </div>

          {/* Urgency Filter */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <span className="text-secondary font-bold">Urgency:</span>
            <select
              aria-label="Filter by deal urgency"
              className="neo-input !py-1.5 !text-xs cursor-pointer min-w-0"
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
            >
              <option value="all">All Urgencies</option>
              <option value="high">High Urgency</option>
              <option value="medium">Medium Urgency</option>
              <option value="low">Low Urgency</option>
            </select>
          </div>

          {/* AI Qualification Filter */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <span className="text-secondary font-bold">AI Status:</span>
            <select
              aria-label="Filter by AI qualification status"
              className="neo-input !py-1.5 !text-xs cursor-pointer min-w-0"
              value={qualificationFilter}
              onChange={(e) => setQualificationFilter(e.target.value)}
            >
              <option value="all">All Qualifications</option>
              <option value="Qualified">Qualified</option>
              <option value="Needs Follow-up">Needs Follow-up</option>
              <option value="Not Qualified">Not Qualified</option>
            </select>
          </div>
        </div>

        {(searchQuery ||
          urgencyFilter !== 'all' ||
          qualificationFilter !== 'all' ||
          salesPersonFilter !== 'all' ||
          phaseFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setUrgencyFilter('all');
                setQualificationFilter('all');
                setSalesPersonFilter('all');
                setPhaseFilter('all');
              }}
              className="text-xs text-tertiary hover:text-primary-dark font-extrabold px-2 py-1 underline shrink-0"
            >
              Reset Filters
            </button>
          )}
      </div>

      {message && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary-dark flex items-start justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <CircleAlert size={16} className="text-primary shrink-0" />
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage('')} className="text-secondary hover:text-primary-dark">
            <X size={14} />
          </button>
        </div>
      )}

      {/* MAIN VIEW: KANBAN BOARD OR COMPACT TABLE */}
      {loadingLeads || loadingPipelines ? (
        <div className="py-24 text-center text-secondary">
          <Loader2 size={24} className="animate-spin mx-auto mb-2 text-primary" />
          Loading pipeline board...
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE LIST VIEW */
        <div className="neo-card space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-secondary">
              Showing {filteredLeadsList.length} customer leads in {activePipeline.name}
            </span>
          </div>

          {filteredLeadsList.length === 0 ? (
            <div className="py-16 text-center text-secondary border border-dashed border-shadow-darker/20 rounded-xl text-xs">
              No matching leads found for current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Desktop Table View */}
              <table className="w-full text-xs text-left hidden md:table">
                <thead>
                  <tr className="border-b border-shadow-darker/10 text-secondary">
                    <th className="py-3 px-3 font-bold">Customer & Company</th>
                    <th className="py-3 px-3 font-bold">Contact</th>
                    <th className="py-3 px-3 font-bold">Order Specs</th>
                    <th className="py-3 px-3 font-bold">Event & Delivery</th>
                    <th className="py-3 px-3 font-bold">Aligned To</th>
                    <th className="py-3 px-3 font-bold">Pipeline Stage</th>
                    <th className="py-3 px-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-shadow-darker/5">
                  {filteredLeadsList.map((lead) => {
                    const currentStageKey = isDesignPipeline
                      ? ((lead as any).design_stage_id || 'concept_creation')
                      : isProductionPipeline
                        ? ((lead as any).production_stage_id || 'material_prep')
                        : (lead.status || 'new_enquiry');
                    const currentStageObj = activeStages.find((s) => s.id === currentStageKey) || {
                      id: currentStageKey,
                      label: currentStageKey,
                    };

                    return (
                      <tr key={lead.id} className="hover:bg-shadow-darker/10 transition-colors">
                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link
                                to={`/leads/${lead.id}`}
                                className="font-extrabold text-primary-dark hover:text-primary transition-colors text-sm inline-flex items-center gap-1"
                              >
                                <span>{lead.name}</span>
                                {(lead.is_repeat_customer || lead.customer_lifecycle === 'repeat_customer') && (
                                  <span title="Repeat Customer">
                                    <Crown size={12} className="text-tertiary fill-tertiary shrink-0" />
                                  </span>
                                )}
                              </Link>
                              <SourceWhatsappBadge lead={lead} compact />
                              <LeadIntentPill lead={lead} compact />
                            </div>
                            {lead.company && (
                              <div className="text-secondary text-[11px] font-medium flex items-center gap-1">
                                <Building size={11} className="text-secondary/70" /> {lead.company}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            {lead.phone ? (
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-primary-dark font-bold">
                                <span>{lead.phone}</span>
                                <button
                                  type="button"
                                  onClick={() => setQuickChatLead(lead)}
                                  className="text-primary hover:text-primary-dark p-0.5 rounded hover:bg-primary/10 transition-colors"
                                  title="Chat in WhatsApp Live Chat"
                                >
                                  <MessageSquare size={12} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-secondary/50">-</span>
                            )}
                            {lead.email && (
                              <div className="text-secondary text-[10px] truncate max-w-[140px]">{lead.email}</div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            {lead.value ? (
                              <div className="font-black text-primary-dark text-xs">
                                ₹{Number(lead.value).toLocaleString('en-IN')}
                              </div>
                            ) : (
                              <span className="text-secondary/50 text-[10px] font-semibold">TBD</span>
                            )}
                            {lead.required_quantity && (
                              <div className="font-bold text-secondary text-[10px]">
                                {lead.required_quantity} pcs
                              </div>
                            )}
                            {isDesignPipeline && lead.design_notes && (
                              <div className="text-[10px] text-primary-dark line-clamp-1 italic max-w-[140px]" title={`Citation / Requirements: ${lead.design_notes}`}>
                                📝 {lead.design_notes}
                              </div>
                            )}
                            {isDesignPipeline && lead.artwork_url && (
                              <a
                                href={lead.artwork_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-primary hover:underline inline-flex items-center gap-0.5"
                                title="Open customer raw artwork / logo"
                              >
                                <ExternalLink size={9} /> Raw Artwork
                              </a>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="space-y-0.5 text-[11px]">
                            {lead.event_name && (
                              <div className="text-primary-dark font-bold truncate max-w-[150px] flex items-center gap-1">
                                <Award size={11} className="text-primary shrink-0" /> {lead.event_name}
                              </div>
                            )}
                            {lead.delivery_date && (
                              <div className="text-tertiary font-bold flex items-center gap-1">
                                <Truck size={11} className="shrink-0" /> {lead.delivery_date}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-secondary text-[11px] font-semibold">
                          <div className="space-y-1">
                            {lead.sales_person ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[10px] border border-primary/20"
                                title={`Sales: ${lead.sales_person}`}
                              >
                                <span className="w-3.5 h-3.5 rounded-full bg-primary text-white text-[8px] font-black flex items-center justify-center uppercase shrink-0">
                                  {lead.sales_person.charAt(0)}
                                </span>
                                {lead.sales_person}
                              </span>
                            ) : (
                              <span className="text-secondary/50 text-[10px] italic">Unassigned Sales</span>
                            )}
                            {(lead as any).design_person && (
                              <div
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark font-bold text-[10px] border border-primary/20"
                                title={`Designer: ${(lead as any).design_person}`}
                              >
                                <Palette size={10} className="text-primary shrink-0" />
                                <span>{(lead as any).design_person}</span>
                              </div>
                            )}
                            {(lead as any).production_person && (
                              <div
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-200"
                                title={`Production: ${(lead as any).production_person}`}
                              >
                                <Factory size={10} className="text-amber-600 shrink-0" />
                                <span>{(lead as any).production_person}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <select
                            aria-label={`Change stage for ${lead.name}`}
                            className="text-[11px] font-bold bg-surface rounded-input px-2 py-1 border border-shadow-darker/20 text-primary-dark hover:border-primary transition-colors"
                            value={currentStageKey}
                            onChange={(e) => handleQuickMove(lead, e.target.value)}
                          >
                            {activeStages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isDesignPipeline && (
                              <button
                                type="button"
                                onClick={() => setSelectedDesignBriefLead(lead)}
                                className="p-1.5 rounded-input border border-primary/25 hover:bg-primary/10 text-primary-dark transition-colors font-bold text-xs inline-flex items-center gap-1 shadow-2xs"
                                title="Open Design Brief & Creative Requirements"
                              >
                                <Palette size={13} className="text-primary" />
                                <span className="hidden sm:inline">Brief</span>
                              </button>
                            )}
                            {isProductionPipeline && (
                              <button
                                type="button"
                                onClick={() => setSelectedProductionSpecsLead(lead)}
                                className="p-1.5 rounded-input border border-primary/25 hover:bg-primary/10 text-primary-dark transition-colors font-bold text-xs inline-flex items-center gap-1 shadow-2xs"
                                title="Open Production Specifications"
                              >
                                <Factory size={13} className="text-primary" />
                                <span className="hidden sm:inline">Specs</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedJobCardLead(lead)}
                              className="p-1.5 rounded-input border border-shadow-darker/20 hover:border-primary/40 hover:bg-primary/10 text-secondary hover:text-primary-dark transition-colors"
                              title="Print Factory Job Card"
                            >
                              <Printer size={13} />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setNotesDrawerState({
                                  isOpen: true,
                                  lead,
                                  stageName: currentStageObj.label,
                                })
                              }
                              className="p-1.5 rounded-input border border-shadow-darker/20 hover:border-primary text-secondary hover:text-primary transition-colors"
                              title="Notes & Alarms"
                            >
                              <StickyNote
                                size={13}
                                className={lead.notes_count ? 'text-primary' : 'text-secondary/60'}
                              />
                            </button>

                            <Link
                              to={`/leads/${lead.id}`}
                              className="neo-btn text-[10px] !px-2.5 !py-1 font-extrabold inline-flex items-center gap-1 text-primary-dark"
                            >
                              <Eye size={11} className="text-primary" /> 360°
                            </Link>

                            <button
                              type="button"
                              onClick={() => setDeleteConfirmLead(lead)}
                              className="p-1.5 rounded-input border border-shadow-darker/20 hover:border-rose-500 hover:bg-rose-500/10 text-secondary hover:text-rose-600 transition-colors"
                              title={`Delete lead: ${lead.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-shadow-darker/10">
                {filteredLeadsList.map((lead) => {
                  const currentStageKey = isDesignPipeline
                    ? ((lead as any).design_stage_id || 'concept_creation')
                    : isProductionPipeline
                      ? ((lead as any).production_stage_id || 'material_prep')
                      : (lead.status || 'new_enquiry');
                  const currentStageObj = activeStages.find((s) => s.id === currentStageKey) || {
                    id: currentStageKey,
                    label: currentStageKey,
                  };

                  return (
                    <div key={lead.id} className="p-4 space-y-3 bg-transparent hover:bg-shadow-darker/5 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link to={`/leads/${lead.id}`} className="font-bold text-primary-dark hover:text-primary transition-colors text-lg leading-tight">
                              {lead.name}
                            </Link>
                            {lead.is_repeat_customer || lead.customer_lifecycle === 'repeat_customer' ? (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-primary/10 text-primary-dark border border-primary/20">Repeat</span>
                            ) : lead.customer_lifecycle === 'existing_customer' ? (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-primary/10 text-primary-dark border border-primary/20">Existing</span>
                            ) : (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-primary/10 text-primary-dark border border-primary/20">New</span>
                            )}
                            <SourceWhatsappBadge lead={lead} compact />
                          </div>
                          {lead.company && <div className="text-[11px] text-secondary flex items-center gap-1 mt-0.5"><Building size={11} /> {lead.company}</div>}
                        </div>
                        <div className="text-right">
                          {lead.required_quantity && <div className="font-semibold text-primary-dark text-xs">🎯 {lead.required_quantity} pcs</div>}
                          {lead.value && <div className="font-bold text-emerald-800 text-sm mt-0.5">₹{Number(lead.value).toLocaleString('en-IN')}</div>}
                        </div>
                      </div>

                      <div className="flex justify-between items-end text-sm">
                        <div className="space-y-1">
                          {lead.phone ? (
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700">
                              <Phone size={11} /> {lead.phone}
                              <button onClick={() => setQuickChatLead(lead)} className="text-emerald-600 hover:text-emerald-700 ml-1"><MessageSquare size={12} /></button>
                            </div>
                          ) : null}
                          <div className="text-secondary text-[10px] flex items-center gap-1">
                            <span>Sales:</span>
                            <span className="font-bold text-primary-dark">{lead.sales_person || 'Unassigned'}</span>
                          </div>
                          {(lead as any).design_person && (
                            <div className="text-secondary text-[10px] flex items-center gap-1">
                              <span>Designer:</span>
                              <span className="font-bold text-primary-dark">{(lead as any).design_person}</span>
                            </div>
                          )}
                          {(lead as any).production_person && (
                            <div className="text-secondary text-[10px] flex items-center gap-1">
                              <span>Production:</span>
                              <span className="font-bold text-amber-800">{(lead as any).production_person}</span>
                            </div>
                          )}
                        </div>

                        <div className="text-right flex flex-col items-end gap-1">
                          <select
                            aria-label={`Change stage for ${lead.name}`}
                            className="text-[10px] font-bold bg-transparent rounded-lg px-2 py-1 border border-shadow-darker/20 text-primary-dark focus:ring-1 focus:ring-primary w-32"
                            value={currentStageKey}
                            onChange={(e) => handleQuickMove(lead, e.target.value)}
                          >
                            {activeStages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-shadow-darker/10">
                        {isDesignPipeline && (
                          <button
                            type="button"
                            onClick={() => setSelectedDesignBriefLead(lead)}
                            className="neo-btn flex justify-center items-center px-3 py-2 text-primary-dark hover:text-primary bg-primary/10 hover:bg-primary/20 transition-colors font-bold text-xs gap-1 border border-primary/20"
                            title="View Design Brief"
                          >
                            <Palette size={14} className="text-primary" />
                            <span>Brief</span>
                          </button>
                        )}
                        {isProductionPipeline && (
                          <button
                            type="button"
                            onClick={() => setSelectedProductionSpecsLead(lead)}
                            className="neo-btn flex justify-center items-center px-3 py-2 text-primary-dark hover:text-primary bg-primary/10 hover:bg-primary/20 transition-colors font-bold text-xs gap-1 border border-primary/20"
                            title="View Production Specifications"
                          >
                            <Factory size={14} className="text-primary" />
                            <span>Specs</span>
                          </button>
                        )}
                        <Link
                          to={`/leads/${lead.id}`}
                          className="flex-1 neo-btn flex justify-center items-center gap-2 py-2 text-primary-dark font-bold text-xs"
                        >
                          <Eye size={14} /> 360° Profile
                        </Link>
                        <button
                          type="button"
                          onClick={() => setSelectedJobCardLead(lead)}
                          className="neo-btn flex justify-center items-center p-2.5 text-secondary hover:text-primary-dark transition-colors"
                          title="Print Factory Job Card"
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setNotesDrawerState({
                              isOpen: true,
                              lead,
                              stageName: currentStageObj.label,
                            })
                          }
                          className="neo-btn flex justify-center items-center p-2.5 text-secondary hover:text-primary transition-colors"
                          title="Notes & Alarms"
                        >
                          <StickyNote size={16} className={lead.notes_count ? 'text-primary fill-primary/20' : ''} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmLead(lead)}
                          className="neo-btn flex justify-center items-center p-2.5 text-secondary hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
                          title={`Delete lead: ${lead.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* KANBAN BOARD VIEW */
        <div className="relative group/pipeline">
          {/* Left Navigation Arrow */}
          <button
            type="button"
            onClick={() => scrollPipeline('left')}
            disabled={!canScrollLeft}
            aria-label="Previous stages"
            className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 md:-translate-x-4 z-20 p-2.5 rounded-full bg-transparent backdrop-blur border border-shadow-darker/20 shadow-neo-raised text-primary-dark hover:text-primary transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none ${!canScrollLeft ? 'opacity-0 pointer-events-none' : 'opacity-90 hover:opacity-100'
              }`}
          >
            <ChevronLeft size={22} className="stroke-[2.5]" />
          </button>

          {/* Right Navigation Arrow */}
          <button
            type="button"
            onClick={() => scrollPipeline('right')}
            disabled={!canScrollRight}
            aria-label="Next stages"
            className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 md:translate-x-4 z-20 p-2.5 rounded-full bg-transparent backdrop-blur border border-shadow-darker/20 shadow-neo-raised text-primary-dark hover:text-primary transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none ${!canScrollRight ? 'opacity-0 pointer-events-none' : 'opacity-90 hover:opacity-100'
              }`}
          >
            <ChevronRight size={22} className="stroke-[2.5]" />
          </button>

          <div
            ref={scrollContainerRef}
            onScroll={checkScroll}
            onDragOver={handleContainerDragOver}
            className="flex flex-nowrap items-start gap-4 overflow-x-auto pb-6 pt-1 px-1 pipeline-scrollbar scroll-smooth"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {displayedStages.map((stage, index) => {
              const stageLeads = groupedLeads[stage.id] || [];
              const stageVal = stageLeads.reduce((s, l) => s + (Number(l.value) || 0), 0);
              const phase = getStagePhase(stage.id);
              const isCollapsed = Boolean(collapsedStages[stage.id]);

              if (isCollapsed) {
                // COLLAPSED COMPACT COLUMN
                return (
                  <div
                    key={stage.id}
                    id={`stage-col-${stage.id}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={() => handleCardDrop(stage.id)}
                    className="flex-shrink-0 w-14 neo-card border border-shadow-darker/10 bg-transparent rounded-2xl p-2 flex flex-col items-center justify-between min-h-[360px] cursor-pointer hover:bg-slate-200/60 transition-all group"
                    onClick={() => toggleStageCollapse(stage.id)}
                    title={`Click to expand ${stage.label} (${stageLeads.length} leads)`}
                  >
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStageCollapse(stage.id);
                        }}
                        className="p-1 rounded-md text-secondary hover:text-primary hover:bg-transparent transition-colors"
                        title="Expand column"
                      >
                        <Maximize2 size={12} />
                      </button>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-transparent border border-shadow-darker/15 text-primary-dark">
                        {stageLeads.length}
                      </span>
                    </div>

                    <div className="writing-vertical text-xs font-black text-primary-dark tracking-wider rotate-180 uppercase select-none py-4">
                      {index + 1}. {stage.label}
                    </div>

                    {stageVal > 0 && (
                      <div className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-input border border-primary/20 truncate max-w-[48px]">
                        ₹{(stageVal / 1000).toFixed(0)}k
                      </div>
                    )}
                  </div>
                );
              }

              // STANDARD FULL KANBAN COLUMN
              return (
                <div
                  key={stage.id}
                  id={`stage-col-${stage.id}`}
                  className={`flex-shrink-0 flex-grow-0 w-80 neo-card space-y-3 border ${stageTone(
                    index
                  )} bg-surface rounded-2xl transition-all shadow-neo-surface`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={() => handleCardDrop(stage.id)}
                >
                  {/* Column Header */}
                  <div className="border-b border-shadow-darker/15 pb-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {phase && (
                          <span
                            className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-input border block w-fit mb-1 ${phase.badgeTone}`}
                          >
                            {phase.shortLabel}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-primary-dark tracking-tight">
                            {index + 1}. {stage.label}
                          </span>
                        </div>
                        {stageVal > 0 && (
                          <div className="text-[11px] font-black text-primary mt-0.5">
                            ₹{stageVal.toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary shadow-xs">
                          {stageLeads.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleStageCollapse(stage.id)}
                          className="p-1 rounded-md text-secondary hover:text-primary-dark hover:bg-shadow-darker/10 transition-colors"
                          title="Collapse this column"
                        >
                          <Minimize2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Quick 7:30 AM Follow-Up Dispatch Pill for Follow-Up stage */}
                    {stage.id === 'follow_up' && (
                      <button
                        type="button"
                        onClick={() => setShowFollowupModal(true)}
                        className={`w-full mt-2 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center justify-between border transition-all ${followupConfig.enabled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-surface border-shadow-darker/20 text-secondary hover:text-primary-dark'
                          }`}
                        title="Configure or test 7:30 AM Automated Follow-Up"
                      >
                        <span className="flex items-center gap-1.5">
                          <Clock size={11} className={followupConfig.enabled ? 'text-emerald-500 animate-pulse' : 'text-secondary'} />
                          <span>7:30 AM "Hi" Dispatch:</span>
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded font-extrabold ${followupConfig.enabled
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            }`}
                        >
                          {followupConfig.enabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Customer Cards List */}
                  <div className="space-y-2.5 min-h-[160px]">
                    {stageLeads.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-shadow-darker/20 p-5 text-xs text-secondary text-center">
                        Drop card here
                      </div>
                    ) : (
                      stageLeads.map((lead) => {
                        const isHigh = lead.intent_tier === 'HIGH';
                        const isMed = lead.intent_tier === 'MEDIUM';
                        const isRepeat = lead.is_repeat_customer || lead.customer_lifecycle === 'repeat_customer';

                        return (
                          <div
                            key={lead.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', lead.id);
                              setDragId(lead.id);
                            }}
                            onDragEnd={() => setDragId('')}
                            className={`rounded-card bg-surface border border-shadow-darker/20 shadow-neo-surface p-3.5 cursor-grab active:cursor-grabbing hover:shadow-neo-hover transition-all relative overflow-hidden group space-y-2 border-l-4 ${isHigh
                              ? 'border-l-primary'
                              : isMed
                                ? 'border-l-tertiary'
                                : 'border-l-secondary/40'
                              }`}
                          >
                            {/* Card Top: Client Name + Crown + Micro Badges */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Link
                                    to={`/leads/${lead.id}`}
                                    className="font-extrabold text-sm text-primary-dark hover:text-primary transition-colors truncate max-w-[170px] inline-flex items-center gap-1"
                                    title={lead.name}
                                  >
                                    <span>{lead.name}</span>
                                    {isRepeat && (
                                      <span title="Repeat Customer">
                                        <Crown
                                          size={13}
                                          className="text-tertiary fill-tertiary shrink-0"
                                        />
                                      </span>
                                    )}
                                  </Link>
                                </div>
                                {lead.company && (
                                  <div className="text-[11px] text-secondary font-medium truncate flex items-center gap-1 mt-0.5">
                                    <Building size={10} className="shrink-0 text-secondary/70" />
                                    <span>{lead.company}</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {lead.intent_tier && (
                                  <span
                                    className={`px-1.5 py-0.2 rounded-input text-[9px] font-black uppercase border ${isHigh
                                      ? 'bg-primary text-surface border-primary'
                                      : isMed
                                        ? 'bg-tertiary/15 text-tertiary border-tertiary/30'
                                        : 'bg-surface text-secondary border-shadow-darker/20'
                                      }`}
                                    title={`Intent: ${lead.intent_tier} (${lead.intent_score ?? 50}/100)`}
                                  >
                                    ⚡ {lead.intent_score ?? lead.intent_tier}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmLead(lead);
                                  }}
                                  className="p-1 rounded-md text-rose-500/70 hover:text-rose-700 hover:bg-rose-500/15 transition-colors"
                                  title={`Delete lead: ${lead.name}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                                <GripVertical
                                  size={14}
                                  className="text-secondary/40 group-hover:text-primary shrink-0 transition-colors"
                                />
                              </div>
                            </div>

                            {/* Bolder Numbers: Deal Value + Units */}
                            <div className="flex items-baseline justify-between pt-1 border-t border-shadow-darker/10">
                              <div className="font-black text-base text-primary-dark tracking-tight">
                                {lead.value ? (
                                  `₹${Number(lead.value).toLocaleString('en-IN')}`
                                ) : (
                                  <span className="text-secondary/50 text-xs font-semibold">TBD</span>
                                )}
                              </div>
                              {lead.required_quantity && (
                                <div className="text-[11px] font-extrabold text-secondary px-2 py-0.5 rounded-input bg-shadow-darker/10 border border-shadow-darker/15">
                                  {lead.required_quantity} pcs
                                </div>
                              )}
                            </div>

                            {/* Event or Urgency Milestone Row */}
                            {(lead.event_name || lead.delivery_date || lead.event_date || lead.urgency === 'high') && (
                              <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold">
                                {lead.event_name && (
                                  <span
                                    className="px-1.5 py-0.5 rounded bg-shadow-darker/10 text-primary-dark truncate max-w-[150px] inline-flex items-center gap-1"
                                    title={lead.event_name}
                                  >
                                    <Award size={10} className="shrink-0 text-primary" />
                                    {lead.event_name}
                                  </span>
                                )}
                                {lead.delivery_date && (
                                  <span className="px-1.5 py-0.5 rounded bg-tertiary/10 text-tertiary border border-tertiary/20 inline-flex items-center gap-1">
                                    <Truck size={10} className="shrink-0" />
                                    {lead.delivery_date}
                                  </span>
                                )}
                                {lead.urgency === 'high' && (
                                  <span className="px-1.5 py-0.5 rounded bg-primary text-surface font-black inline-flex items-center gap-0.5">
                                    <Zap size={9} className="fill-surface" /> High
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Design Pipeline Micro Spec & Proofs */}
                            {isDesignPipeline && (
                              <div className="space-y-1 pt-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                  {(lead as any).design_status && (
                                    <span
                                      className={`px-1.5 py-0.2 rounded font-black uppercase text-[9px] border ${(lead as any).design_status === 'approved'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : (lead as any).design_status === 'revisions_requested'
                                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                                          : (lead as any).design_status === 'proof_sent'
                                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                                            : 'bg-primary/10 text-primary-dark border-primary/20'
                                        }`}
                                    >
                                      {((lead as any).design_status || '').replace(/_/g, ' ')}
                                    </span>
                                  )}
                                  {Boolean((lead as any).mockups?.length) && (
                                    <span className="px-1.5 py-0.2 rounded bg-surface text-secondary font-bold border border-shadow-darker/30 text-[9px]">
                                      🖼️ {(lead as any).mockups.length} {(lead as any).mockups.length === 1 ? 'proof' : 'proofs'}
                                    </span>
                                  )}
                                  {lead.trophy_size && (
                                    <span className="px-1.5 py-0.2 rounded bg-surface text-secondary font-bold border border-shadow-darker/30 text-[9px]">
                                      📏 {lead.trophy_size}
                                    </span>
                                  )}
                                  {(lead as any).artwork_url && (
                                    <a
                                      href={(lead as any).artwork_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[9px] text-primary hover:underline font-bold inline-flex items-center gap-0.5"
                                      title="Open customer logo / vector artwork link"
                                    >
                                      <ExternalLink size={9} /> Artwork Link
                                    </a>
                                  )}
                                </div>

                                {lead.design_notes && (
                                  <div
                                    className="p-1.5 rounded-lg bg-surface border border-shadow-darker/25 text-[10px] text-primary-dark line-clamp-2 italic shadow-2xs"
                                    title={`Design & Citation Requirement: ${lead.design_notes}`}
                                  >
                                    <span className="font-bold not-italic text-primary-dark">📝 Req / Citation: </span>
                                    {lead.design_notes}
                                  </div>
                                )}

                                <div className="flex items-center justify-between gap-1.5 flex-wrap pt-1">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDesignBriefLead(lead);
                                      }}
                                      className="text-[10px] font-bold text-primary-dark hover:text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded-lg inline-flex items-center gap-1 shadow-2xs transition-all"
                                      title="View full 17-point creative design requirements & assets"
                                    >
                                      <Palette size={11} className="text-primary" />
                                      <span>Design Brief</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const hasSpecs = Boolean(
                                          lead.single_box_size ||
                                          lead.trophy_materials_used ||
                                          lead.materials_stock_status ||
                                          lead.delivery_mode
                                        );
                                        setSelectedProductionSpecsMode(hasSpecs ? 'view' : 'edit');
                                        setSelectedProductionSpecsLead(lead);
                                      }}
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg inline-flex items-center gap-1 shadow-2xs transition-all ${Boolean(
                                        lead.single_box_size ||
                                        lead.trophy_materials_used ||
                                        lead.materials_stock_status ||
                                        lead.delivery_mode
                                      )
                                        ? 'text-secondary hover:text-primary-dark bg-surface hover:bg-surface-hover border border-shadow-darker/30'
                                        : 'text-primary-dark bg-primary/15 hover:bg-primary/25 border border-primary/30 font-extrabold'
                                        }`}
                                      title="Hand off & specify 9 manufacturing requirements for Production"
                                    >
                                      <Factory size={11} className="text-primary" />
                                      <span>
                                        {Boolean(
                                          lead.single_box_size ||
                                          lead.trophy_materials_used ||
                                          lead.materials_stock_status ||
                                          lead.delivery_mode
                                        )
                                          ? 'Production Specs'
                                          : '+ Add Production Specs'}
                                      </span>
                                    </button>
                                  </div>

                                  {lead.design_deadline && (
                                    <span className="text-[9px] font-semibold text-secondary bg-surface border border-shadow-darker/30 px-1.5 py-0.5 rounded">
                                      ⏳ Due: {lead.design_deadline}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Production Pipeline Micro Spec & Quantity Progress */}
                            {isProductionPipeline && (
                              <div className="space-y-2 pt-1 border-t border-shadow-darker/10 mt-1">
                                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                  {(lead as any).production_status && (
                                    <span
                                      className="px-1.5 py-0.2 rounded font-extrabold uppercase text-[9px] bg-primary/10 text-primary-dark border border-primary/20"
                                    >
                                      {((lead as any).production_status || '').replace(/_/g, ' ')}
                                    </span>
                                  )}
                                  {(lead as any).trophy_size && (
                                    <span className="text-[10px] text-secondary font-bold">
                                      📐 {(lead as any).trophy_size}
                                    </span>
                                  )}
                                  {lead.single_box_size && (
                                    <span className="text-[9px] text-secondary font-medium truncate max-w-[110px]" title={`Single Box: ${lead.single_box_size}`}>
                                      📦 {lead.single_box_size}
                                    </span>
                                  )}
                                </div>

                                {/* Project Batch Quantity Progress Meter */}
                                <div className="bg-surface/90 p-2 rounded-xl border border-shadow-darker/15 space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px] font-bold">
                                    <span className="text-secondary flex items-center gap-1">
                                      <TrendingUp size={11} className="text-primary" /> Progress by Quantity:
                                    </span>
                                    <span className="text-primary font-mono font-extrabold">
                                      {lead.production_overall_progress || 0}% Complete
                                    </span>
                                  </div>

                                  <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                    <div
                                      className="h-full bg-primary rounded-full transition-all duration-300"
                                      style={{ width: `${lead.production_overall_progress || 0}%` }}
                                    />
                                  </div>

                                  {/* Top 3 Manufacturing Step Counts */}
                                  {lead.production_batch_stages && lead.production_batch_stages.length > 0 ? (
                                    <div className="space-y-1 pt-0.5">
                                      {lead.production_batch_stages.slice(0, 3).map((st) => {
                                        const pct = st.target_quantity > 0 ? Math.min(100, Math.round((st.completed_quantity / st.target_quantity) * 100)) : 0;
                                        return (
                                          <div key={st.id} className="flex items-center justify-between text-[9px] text-slate-700 dark:text-slate-200">
                                            <span className="truncate max-w-[130px] font-medium">{st.name.replace(/^\d+\.\s*/, '')}</span>
                                            <span className="font-mono font-bold text-primary-dark">
                                              {st.completed_quantity}/{st.target_quantity} ({pct}%)
                                            </span>
                                          </div>
                                        );
                                      })}
                                      {lead.production_batch_stages.length > 3 && (
                                        <div className="text-[8.5px] text-secondary text-right font-medium">
                                          +{lead.production_batch_stages.length - 3} more steps...
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-[9px] text-secondary italic">
                                      Target: {lead.required_quantity || 100} pcs &bull; Click "Log Pieces" to record work
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-1 flex-wrap pt-0.5">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProductionProgressLead(lead);
                                      }}
                                      className="text-[10px] font-bold text-white bg-primary hover:bg-primary-dark px-2 py-0.5 rounded-lg inline-flex items-center gap-1 shadow-2xs transition-all"
                                      title="Record piece counts for each manufacturing step"
                                    >
                                      <Plus size={10} />
                                      <span>Log Pieces</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedProductionSpecsLead(lead);
                                      }}
                                      className="text-[10px] font-bold text-primary-dark hover:text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded-lg inline-flex items-center gap-1 shadow-2xs transition-all"
                                      title="View & Edit 9 Production Specifications"
                                    >
                                      <Factory size={10} className="text-primary" />
                                      <span>Specs</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        printProductionTeamChecklist(lead);
                                      }}
                                      className="text-[10px] font-bold text-secondary hover:text-primary-dark bg-surface hover:bg-surface-hover border border-shadow-darker/30 px-2 py-0.5 rounded-lg inline-flex items-center gap-1 shadow-2xs transition-all"
                                      title="Print clean 1-page Production Team Checklist with 9 manufacturing specifications"
                                    >
                                      <Printer size={10} className="text-primary" />
                                      <span>Print</span>
                                    </button>
                                  </div>

                                  {lead.production_deadline && (
                                    <span className="text-[9px] font-semibold text-secondary bg-surface border border-shadow-darker/30 px-1.5 py-0.5 rounded">
                                      ⏳ {lead.production_deadline}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Sales Pipeline Design Request Quick Button */}
                            {!isDesignPipeline && !isProductionPipeline && (lead.status === 'requirement_design_finalization' || lead.status === 'design_stage' || lead.design_deadline || lead.trophy_size) && (
                              <div className="pt-0.5 flex items-center justify-between gap-1 flex-wrap text-[10px]">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSubmitDesignTargetStage(lead.status || 'requirement_design_finalization');
                                    setSubmitDesignModalLead(lead);
                                  }}
                                  className="text-[10px] font-bold text-primary-dark hover:text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded-md inline-flex items-center gap-1 transition-colors"
                                  title="Open & update Design Request specifications"
                                >
                                  <Palette size={10} className="text-primary" />
                                  <span>{lead.concept || lead.trophy_size ? 'Design Specs' : '+ Submit Design'}</span>
                                </button>
                                {lead.trophy_size && (
                                  <span className="text-[9px] text-secondary font-medium truncate max-w-[120px]">
                                    📏 {lead.trophy_size}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Active Reminder Micro Banner (if any) */}
                            {lead.active_reminder &&
                              (() => {
                                const badge = getReminderBadge(lead.active_reminder);
                                if (!badge) return null;
                                return (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setNotesDrawerState({ isOpen: true, lead, stageName: stage.label })
                                    }
                                    className={`w-full text-left text-[10px] px-2 py-1 rounded-input border flex items-center justify-between transition-all ${badge.tone}`}
                                    title={`Reminder: ${lead.active_reminder.title || ''}`}
                                  >
                                    <span className="truncate">{badge.text}</span>
                                    <Clock size={10} className="shrink-0 ml-1 opacity-80" />
                                  </button>
                                );
                              })()}

                            {/* Card Footer: Rep Avatar + 1-Click WhatsApp + Actions */}
                            <div className="flex items-center justify-between pt-1.5 border-t border-shadow-darker/10 gap-1.5">
                              <div className="flex items-center gap-1.5">
                                {isDesignPipeline ? (
                                  (lead as any).design_person ? (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary-dark text-[9px] font-bold border border-primary/20 max-w-[120px] truncate"
                                      title={`Designer: ${(lead as any).design_person}`}
                                    >
                                      <Palette size={10} className="text-primary shrink-0" />
                                      <span className="truncate">{(lead as any).design_person}</span>
                                    </span>
                                  ) : (
                                    <span
                                      className="text-[9px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"
                                      title="Unassigned Designer"
                                    >
                                      🎨 Unassigned
                                    </span>
                                  )
                                ) : isProductionPipeline ? (
                                  (lead as any).production_person ? (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[9px] font-bold border border-amber-200 max-w-[120px] truncate"
                                      title={`Production: ${(lead as any).production_person}`}
                                    >
                                      <Factory size={10} className="text-amber-600 shrink-0" />
                                      <span className="truncate">{(lead as any).production_person}</span>
                                    </span>
                                  ) : (
                                    <span
                                      className="text-[9px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"
                                      title="Unassigned Production"
                                    >
                                      🏭 Unassigned
                                    </span>
                                  )
                                ) : lead.sales_person ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold border border-primary/20 max-w-[120px] truncate"
                                    title={`Aligned: ${lead.sales_person}`}
                                  >
                                    <span className="w-3.5 h-3.5 rounded-full bg-primary text-white text-[8px] font-black flex items-center justify-center uppercase shrink-0">
                                      {lead.sales_person.charAt(0)}
                                    </span>
                                    <span className="truncate">{lead.sales_person}</span>
                                  </span>
                                ) : (
                                  <span
                                    className="text-[9px] text-secondary/60 italic px-1"
                                    title="Unassigned"
                                  >
                                    Unassigned
                                  </span>
                                )}

                                {lead.phone && (
                                  <button
                                    type="button"
                                    onClick={() => setQuickChatLead(lead)}
                                    className="p-1 rounded-md text-primary hover:bg-primary/10 transition-colors"
                                    title={`Chat with ${lead.phone}`}
                                  >
                                    <MessageSquare size={12} />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setNotesDrawerState({ isOpen: true, lead, stageName: stage.label })
                                  }
                                  className="p-1 rounded-md text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                                  title="Notes & Reminders"
                                >
                                  <StickyNote
                                    size={12}
                                    className={lead.notes_count ? 'text-primary' : 'text-secondary/60'}
                                  />
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Link
                                  to={`/leads/${lead.id}`}
                                  className="text-[10px] font-black text-primary hover:underline"
                                  title="View 360 profile"
                                >
                                  360°
                                </Link>

                                <select
                                  aria-label={`Move stage for ${lead.name}`}
                                  className="text-[10px] font-bold bg-surface rounded-input px-1.5 py-1 border border-shadow-darker/20 text-primary-dark hover:border-primary transition-colors max-w-[85px] truncate"
                                  value={isDesignPipeline ? ((lead as any).design_stage_id || stage.id) : isProductionPipeline ? ((lead as any).production_stage_id || stage.id) : (lead.status || stage.id)}
                                  onChange={(e) => handleQuickMove(lead, e.target.value)}
                                >
                                  {activeStages.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmLead(lead);
                                  }}
                                  className="p-1 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-500/15 transition-colors shrink-0"
                                  title={`Delete lead: ${lead.name}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )
      }

      {/* Confirmation & Notification Dispatch Modal */}
      <StageChangeConfirmModal
        isOpen={confirmModalState.isOpen}
        lead={confirmModalState.lead}
        fromStage={confirmModalState.fromStage}
        toStage={confirmModalState.toStage}
        pipelineId={activePipeline.id}
        pipelineName={activePipeline.name}
        onClose={() =>
          setConfirmModalState({
            isOpen: false,
            lead: null,
            fromStage: { id: '', label: '' },
            toStage: { id: '', label: '' },
          })
        }
        onSuccess={(res) => {
          setMessage(res.message);
        }}
      />

      {/* Pipeline Stage Notes, Multi-Member Mentions & Reminder Drawer */}
      <LeadNotesDrawer
        isOpen={notesDrawerState.isOpen}
        lead={notesDrawerState.lead}
        stageName={notesDrawerState.stageName}
        onClose={() =>
          setNotesDrawerState({
            isOpen: false,
            lead: null,
            stageName: '',
          })
        }
      />

      {/* Quick Chat Modal */}
      {
        quickChatLead && (
          <PipelineQuickChatModal
            lead={quickChatLead}
            onClose={() => setQuickChatLead(null)}
          />
        )
      }

      {
        isAdmin && (
          <LeadAssignmentModal
            isOpen={showAssignmentModal}
            onClose={() => setShowAssignmentModal(false)}
            leads={leads}
          />
        )
      }

      {/* 7:30 AM Automated Daily Follow-Up Dispatcher Modal */}
      <FollowupAutomationModal
        isOpen={showFollowupModal}
        onClose={() => setShowFollowupModal(false)}
      />

      {/* Delete Lead Confirmation Modal */}
      {
        deleteConfirmLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-shadow-darker/20 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-primary-dark">
                    Delete Lead from Pipeline?
                  </h3>
                  <p className="text-xs text-secondary mt-0.5">
                    This action permanently removes the lead from the CRM pipeline.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-shadow-darker/5 border border-shadow-darker/10 space-y-1.5 text-xs">
                <div className="font-bold text-primary-dark text-sm">
                  {deleteConfirmLead.name}
                </div>
                {deleteConfirmLead.company && (
                  <div className="text-secondary flex items-center gap-1">
                    <Building size={12} />
                    <span>{deleteConfirmLead.company}</span>
                  </div>
                )}
                {deleteConfirmLead.phone && (
                  <div className="text-secondary font-mono flex items-center gap-1">
                    <Phone size={12} />
                    <span>{deleteConfirmLead.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                    Stage: {(deleteConfirmLead.status || 'New').replace(/_/g, ' ')}
                  </span>
                  {deleteConfirmLead.value && (
                    <span className="font-bold text-emerald-700">
                      ₹{Number(deleteConfirmLead.value).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeletingLead}
                  onClick={() => setDeleteConfirmLead(null)}
                  className="neo-btn text-xs font-semibold px-4 py-2 text-secondary hover:text-primary-dark"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingLead}
                  onClick={handleDeleteLead}
                  className="neo-btn-primary text-xs font-bold px-4 py-2 !bg-rose-600 hover:!bg-rose-700 text-white inline-flex items-center gap-1.5 shadow-sm"
                >
                  {isDeletingLead ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={13} />
                      <span>Delete Lead</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Manage Pipeline Stages Modal (Design or Production) */}
      {
        showManageStagesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface border border-shadow-darker/20 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center font-bold">
                    {isProductionPipeline ? <Factory size={18} /> : <Palette size={18} />}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-primary-dark">
                      Manage {isProductionPipeline ? 'Production' : isDesignPipeline ? 'Design' : activePipeline.name} Pipeline Stages
                    </h3>
                    <p className="text-xs text-secondary">
                      Add new stages, rename labels, or change the stage order
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManageStagesModal(false)}
                  className="p-1.5 rounded-lg text-secondary hover:text-primary-dark hover:bg-shadow-darker/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Stage List */}
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-sidebar-scrollbar">
                {editingStages.map((stage, idx) => (
                  <div
                    key={stage.id}
                    className="flex items-center gap-2 p-2 rounded-xl border border-shadow-darker/20 bg-shadow-darker/5"
                  >
                    <span className="w-5 text-center text-xs font-bold text-secondary">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={stage.label}
                      onChange={(e) => {
                        const copy = [...editingStages];
                        copy[idx] = { ...copy[idx], label: e.target.value };
                        setEditingStages(copy);
                      }}
                      className="flex-1 text-xs font-bold bg-surface rounded-input px-2.5 py-1.5 border border-shadow-darker/20 text-primary-dark focus:border-primary"
                      placeholder="Stage Label"
                    />
                    <span className="text-[10px] font-mono text-secondary/70 px-1.5 py-0.5 rounded bg-shadow-darker/10">
                      {stage.id}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveStageOrder(idx, 'up')}
                        className="p-1 text-secondary hover:text-primary disabled:opacity-30 disabled:hover:text-secondary rounded"
                        title="Move up"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === editingStages.length - 1}
                        onClick={() => handleMoveStageOrder(idx, 'down')}
                        className="p-1 text-secondary hover:text-primary disabled:opacity-30 disabled:hover:text-secondary rounded"
                        title="Move down"
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={editingStages.length <= 2}
                        onClick={() => handleRemoveCustomStage(stage.id)}
                        className="p-1 text-rose-500/70 hover:text-rose-700 disabled:opacity-30 rounded ml-0.5"
                        title="Remove stage"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Stage Input */}
              <div className="flex items-center gap-2 pt-2 border-t border-shadow-darker/10">
                <input
                  type="text"
                  value={newStageLabel}
                  onChange={(e) => setNewStageLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomStage();
                    }
                  }}
                  placeholder={isProductionPipeline ? "e.g. Laser Engraving, QC Check..." : "e.g. 3D Model Rendering, Client Proofing..."}
                  className="flex-1 text-xs bg-surface rounded-input px-3 py-2 border border-shadow-darker/20 text-primary-dark focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleAddCustomStage}
                  className="neo-btn text-xs px-3 py-2 font-bold inline-flex items-center gap-1 shrink-0 text-primary-dark bg-primary/10 hover:bg-primary/20 border border-primary/20"
                >
                  <Plus size={13} /> Add Stage
                </button>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-shadow-darker/10">
                <button
                  type="button"
                  onClick={() => setEditingStages(isProductionPipeline ? [...DEFAULT_PRODUCTION_STAGES] : [...DEFAULT_DESIGN_STAGES])}
                  className="text-xs text-secondary hover:text-primary-dark flex items-center gap-1 font-semibold"
                  title="Reset to default stages"
                >
                  <RotateCcw size={12} /> Reset to Defaults
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManageStagesModal(false)}
                    className="neo-btn text-xs px-4 py-2 font-semibold text-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingStages}
                    onClick={handleSaveDesignStages}
                    className="neo-btn-primary text-xs px-4 py-2 font-bold text-white inline-flex items-center gap-1.5 shadow-sm bg-primary hover:bg-primary-dark"
                  >
                    {isSavingStages ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Stages</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Printable Factory Job Card Modal */}
      {
        selectedJobCardLead && (
          <ProductionJobCardModal
            isOpen={Boolean(selectedJobCardLead)}
            lead={selectedJobCardLead}
            onClose={() => setSelectedJobCardLead(null)}
            onOpenSpecsModal={() => {
              setSelectedProductionSpecsLead(selectedJobCardLead);
            }}
          />
        )
      }

      {/* Dedicated Production Specifications Modal */}
      {
        selectedProductionSpecsLead && (
          <ProductionSpecsModal
            isOpen={Boolean(selectedProductionSpecsLead)}
            lead={selectedProductionSpecsLead}
            initialTab={selectedProductionSpecsMode}
            onClose={() => setSelectedProductionSpecsLead(null)}
            onOpenJobCard={() => {
              setSelectedJobCardLead(selectedProductionSpecsLead);
            }}
          />
        )
      }

      {/* Project-Based Manufacturing Quantity Progress Modal */}
      {
        selectedProductionProgressLead && (
          <ProductionProgressModal
            isOpen={Boolean(selectedProductionProgressLead)}
            lead={selectedProductionProgressLead}
            onClose={() => setSelectedProductionProgressLead(null)}
          />
        )
      }

      {/* Dedicated Design Brief & Creative Requirements Modal */}
      {
        selectedDesignBriefLead && (
          <DesignBriefModal
            isOpen={Boolean(selectedDesignBriefLead)}
            lead={selectedDesignBriefLead}
            onClose={() => setSelectedDesignBriefLead(null)}
            onOpenProductionSpecs={() => {
              const currentLead = selectedDesignBriefLead;
              setSelectedDesignBriefLead(null);
              setSelectedProductionSpecsLead(currentLead);
            }}
          />
        )
      }

      {/* Sales Submit Design Request Form Modal */}
      {
        submitDesignModalLead && (
          <SubmitDesignRequestModal
            isOpen={Boolean(submitDesignModalLead)}
            lead={submitDesignModalLead}
            targetStageId={submitDesignTargetStage}
            onClose={() => {
              setSubmitDesignModalLead(null);
              setSubmitDesignTargetStage('');
            }}
          />
        )
      }
    </div >
  );
}




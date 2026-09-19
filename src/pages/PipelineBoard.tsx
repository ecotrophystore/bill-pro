import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import * as XLSX from 'xlsx';
import {
  type Lead,
  type Pipeline,
  type PipelineStage,
  STANDARD_CRM_STAGES,
  DEFAULT_QUANTITY_PIPELINES,
} from '../types';
import { useCRMPermission } from '../hooks/useCRMPermission';
import { StageChangeConfirmModal } from '../components/CRM/StageChangeConfirmModal';
import { LeadNotesDrawer } from '../components/CRM/LeadNotesDrawer';
import { openWhatsAppWebDirect } from '../services/stageNotificationService';

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
    badgeTone: 'bg-sky-100 text-sky-800 border-sky-200',
    borderTone: 'border-sky-300',
    stageIds: ['new_enquiry', 'requirement_collection', 'requirement_confirmed'],
  },
  {
    id: 'phase_design_quote',
    name: 'Design & Quotation',
    shortLabel: '2. Design & Quote',
    badgeTone: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    borderTone: 'border-indigo-300',
    stageIds: ['design_stage', 'design_approval', 'quotation_sent', 'follow_up'],
  },
  {
    id: 'phase_production',
    name: 'Order & Production',
    shortLabel: '3. Production',
    badgeTone: 'bg-amber-100 text-amber-800 border-amber-200',
    borderTone: 'border-amber-300',
    stageIds: ['advance_payment', 'production', 'quality_check'],
  },
  {
    id: 'phase_fulfillment',
    name: 'Fulfillment & Dispatch',
    shortLabel: '4. Fulfillment',
    badgeTone: 'bg-teal-100 text-teal-800 border-teal-200',
    borderTone: 'border-teal-300',
    stageIds: ['ready_for_dispatch', 'dispatch', 'delivered'],
  },
  {
    id: 'phase_closing',
    name: 'Payment & Closing',
    shortLabel: '5. Closing',
    badgeTone: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    borderTone: 'border-emerald-300',
    stageIds: ['full_payment', 'completed', 'lost_cancelled'],
  },
];

function getStagePhase(stageId: string): StagePhase | null {
  return STAGE_PHASES.find((p) => p.stageIds.includes(stageId)) || null;
}

const STORAGE_KEY = 'billpro.activePipelineId';

const TONES = [
  'bg-slate-500/10 text-slate-700 border-slate-500/20',
  'bg-sky-500/10 text-sky-700 border-sky-500/20',
  'bg-blue-500/10 text-blue-700 border-blue-500/20',
  'bg-indigo-500/10 text-indigo-700 border-indigo-500/20',
  'bg-purple-500/10 text-purple-700 border-purple-500/20',
  'bg-amber-500/10 text-amber-700 border-amber-500/20',
  'bg-orange-500/10 text-orange-700 border-orange-500/20',
  'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  'bg-teal-500/10 text-teal-700 border-teal-500/20',
  'bg-cyan-500/10 text-cyan-700 border-cyan-500/20',
  'bg-violet-500/10 text-violet-700 border-violet-200',
  'bg-rose-500/10 text-rose-700 border-rose-500/20',
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
      text: `🔔 Overdue (${timeStr})`,
      tone: 'bg-rose-100 text-rose-900 border-rose-300 font-bold animate-pulse',
      isOverdue: true,
    };
  }

  if (diffMins < 60) {
    return {
      text: `🔔 In ${diffMins}m`,
      tone: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
      isOverdue: false,
    };
  }

  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const isToday = d.toDateString() === new Date().toDateString();
  return {
    text: `🔔 ${isToday ? 'Today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${timeStr}`,
    tone: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold',
    isOverdue: false,
  };
}

function normalizePipeline(pipeline: any): Pipeline {
  const stages: PipelineStage[] =
    Array.isArray(pipeline?.stages) && pipeline.stages.length > 0
      ? pipeline.stages.map((stage: any, index: number) => ({
          id: String(stage?.id || `stage_${index + 1}`),
          label: String(stage?.label || `Stage ${index + 1}`),
          required_fields: Array.isArray(stage?.required_fields) ? stage.required_fields : [],
        }))
      : STANDARD_CRM_STAGES.map((stage) => ({ ...stage }));

  return {
    id: String(pipeline?.id || 'pipeline_default'),
    name: String(pipeline?.name || 'Untitled Pipeline'),
    scenario: String(pipeline?.scenario || ''),
    stages,
    is_default: Boolean(pipeline?.is_default),
    created_at: pipeline?.created_at || new Date(),
    updated_at: pipeline?.updated_at,
  };
}

export default function PipelineBoard() {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<Pipeline[]>(DEFAULT_QUANTITY_PIPELINES);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || 'regular_order';
  });
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
  const { hasPermission } = useCRMPermission();

  // Stage Change Confirmation Modal State
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    lead: Lead | null;
    fromStage: PipelineStage;
    toStage: PipelineStage;
  }>({
    isOpen: false,
    lead: null,
    fromStage: { id: '', label: '' },
    toStage: { id: '', label: '' },
  });

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

    // Load leads
    const unsubLeads = onSnapshot(
      collection(db, 'leads'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
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
  }, []);

  const activePipeline = useMemo(() => {
    const found = pipelines.find((p) => p.id === selectedPipelineId);
    return found || pipelines[0] || DEFAULT_QUANTITY_PIPELINES[1];
  }, [pipelines, selectedPipelineId]);

  const activeStages = useMemo(() => {
    return activePipeline?.stages?.length ? activePipeline.stages : STANDARD_CRM_STAGES;
  }, [activePipeline]);

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
      // Filter by pipeline matching
      const leadPipeId = lead.pipeline_id || 'regular_order';
      const matchesPipeline =
        leadPipeId === activePipeline.id ||
        (activePipeline.id === 'regular_order' && (leadPipeId === 'default' || !leadPipeId));

      if (!matchesPipeline) return;

      // Filter by Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (lead.name || '').toLowerCase().includes(q) ||
          (lead.phone || '').includes(q) ||
          (lead.company || '').toLowerCase().includes(q) ||
          (lead.event_name || '').toLowerCase().includes(q) ||
          (lead.sales_person || '').toLowerCase().includes(q);
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

      // Filter by Sales Person
      if (salesPersonFilter !== 'all' && lead.sales_person !== salesPersonFilter) {
        return;
      }

      // Filter by Stage Phase (if applicable)
      if (phaseFilter !== 'all') {
        const selectedPhase = STAGE_PHASES.find((p) => p.id === phaseFilter);
        const currentStage = lead.status || activeStages[0]?.id || 'new_enquiry';
        if (selectedPhase && !selectedPhase.stageIds.includes(currentStage)) {
          return;
        }
      }

      list.push(lead);

      const statusKey = lead.status || activeStages[0]?.id || 'new_enquiry';
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
    activeStages,
    searchQuery,
    urgencyFilter,
    qualificationFilter,
    salesPersonFilter,
    phaseFilter,
  ]);

  // Displayed stages based on phase filter
  const displayedStages = useMemo(() => {
    if (phaseFilter === 'all') return activeStages;
    const selectedPhase = STAGE_PHASES.find((p) => p.id === phaseFilter);
    if (!selectedPhase) return activeStages;
    return activeStages.filter((s) => selectedPhase.stageIds.includes(s.id));
  }, [activeStages, phaseFilter]);

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
  };

  // Intercept Drop Action to open confirmation modal
  const handleCardDrop = (targetStageId: string) => {
    if (!dragId) return;

    const targetLead = leads.find((l) => l.id === dragId);
    if (!targetLead) return;

    const currentStageId = targetLead.status || activeStages[0]?.id || 'new_enquiry';
    if (currentStageId === targetStageId) {
      setDragId('');
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

    setDragId('');
    setConfirmModalState({
      isOpen: true,
      lead: targetLead,
      fromStage,
      toStage,
    });
  };

  const handleQuickMove = (lead: Lead, targetStageId: string) => {
    const currentStageId = lead.status || activeStages[0]?.id || 'new_enquiry';
    if (currentStageId === targetStageId) return;

    const fromStage = activeStages.find((s) => s.id === currentStageId) || {
      id: currentStageId,
      label: currentStageId,
    };
    const toStage = activeStages.find((s) => s.id === targetStageId) || {
      id: targetStageId,
      label: targetStageId,
    };

    setConfirmModalState({
      isOpen: true,
      lead,
      fromStage,
      toStage,
    });
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
            'Sales Person': lead.sales_person || '',
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">CRM Workspace</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 size={11} /> Manual Stage Control
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary-dark mt-1">Pipeline Board</h1>
          <p className="text-secondary text-xs sm:text-sm">
            Track customer orders through all 16 production & fulfillment milestones with instant stage navigation.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* View Mode Switcher (Kanban vs Table) */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-shadow-darker/10">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'kanban'
                  ? 'bg-white text-primary-dark shadow-sm'
                  : 'text-secondary hover:text-primary-dark'
              }`}
            >
              <Columns3 size={14} /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-primary-dark shadow-sm'
                  : 'text-secondary hover:text-primary-dark'
              }`}
            >
              <LayoutList size={14} /> Table List
            </button>
          </div>

          <button
            onClick={handleExportExcel}
            className="neo-btn text-xs px-3.5 py-2 inline-flex items-center gap-1.5 font-bold"
          >
            <Download size={14} /> Export Excel
          </button>
          <Link
            to="/leads/new"
            className="neo-btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5 font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
          >
            <UserPlus size={14} /> Add Customer Lead
          </Link>
        </div>
      </div>

      {/* Pipeline Tab Switcher (Small / Regular / Bulk / Custom) */}
      <div className="flex items-center justify-between gap-4 p-2 bg-slate-100/80 rounded-2xl border border-shadow-darker/10 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {pipelines.map((pipe) => {
            const isSelected = pipe.id === activePipeline.id;
            return (
              <button
                key={pipe.id}
                onClick={() => handleSelectPipeline(pipe.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                  isSelected
                    ? 'bg-white text-primary-dark shadow-sm border border-shadow-darker/15 scale-[1.02]'
                    : 'text-secondary hover:text-primary-dark hover:bg-white/60'
                }`}
              >
                <span>{pipe.name}</span>
                {pipe.scenario && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                      isSelected ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-600'
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
        <div className="flex items-center gap-4 text-xs font-semibold px-3 py-1 text-secondary ml-auto">
          <span>
            Total Customers: <strong className="text-primary-dark">{totalPipelineLeads}</strong>
          </span>
          {totalPipelineValue > 0 && (
            <span>
              Pipeline Value:{' '}
              <strong className="text-emerald-700">₹{totalPipelineValue.toLocaleString('en-IN')}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Stage Jump Navigator Ribbon (Bird's-Eye View across 5 Phases) */}
      <div className="p-3 bg-white/90 rounded-2xl border border-shadow-darker/10 shadow-xs space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Layers size={14} className="text-primary" />
            <span>Pipeline Stage Navigator</span>
            <span className="text-[10px] text-secondary font-normal">(Click any stage to scroll directly)</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-secondary">Focus Phase:</span>
            <select
              aria-label="Focus on specific phase"
              className="neo-input !py-1 !px-2.5 !text-xs font-bold"
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
            >
              <option value="all">All 5 Phases ({activeStages.length} Stages)</option>
              {STAGE_PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1">
          {phaseStats.map((phase) => {
            const isPhaseActive = phaseFilter === 'all' || phaseFilter === phase.id;
            return (
              <div
                key={phase.id}
                className={`p-2 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                  isPhaseActive
                    ? 'bg-slate-50 border-shadow-darker/10 hover:border-primary/40 shadow-xs'
                    : 'bg-slate-100/50 border-dashed border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-bold text-primary-dark truncate text-[11px]">{phase.shortLabel}</span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-white border border-shadow-darker/15 text-primary-dark">
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
                        className={`text-[10px] px-1.5 py-0.5 rounded-md border flex items-center gap-1 transition-all ${
                          stageCount > 0
                            ? 'bg-white font-bold text-slate-800 border-shadow-darker/20 hover:border-primary hover:text-primary'
                            : 'bg-slate-100/80 text-secondary border-slate-200 hover:bg-white'
                        }`}
                        title={`Jump to ${stageObj.label} (${stageCount} leads)`}
                      >
                        <span className="truncate max-w-[80px]">{stageObj.label}</span>
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

      {/* Search & Advanced Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            className="neo-input w-full pl-10 text-xs"
            placeholder="Search by customer name, phone, company, event, sales person..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary-dark"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sales Rep Filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-secondary font-bold">Rep:</span>
          <select
            aria-label="Filter by assigned sales representative"
            className="neo-input !py-1.5 !text-xs"
            value={salesPersonFilter}
            onChange={(e) => setSalesPersonFilter(e.target.value)}
          >
            <option value="all">All Sales Reps</option>
            {salesPersons.map((rep) => (
              <option key={rep} value={rep}>
                {rep}
              </option>
            ))}
          </select>
        </div>

        {/* Urgency Filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-secondary font-bold">Urgency:</span>
          <select
            aria-label="Filter by deal urgency"
            className="neo-input !py-1.5 !text-xs"
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
          >
            <option value="all">All Urgencies</option>
            <option value="high">🔥 High Urgency</option>
            <option value="medium">⚡ Medium Urgency</option>
            <option value="low">🌱 Low Urgency</option>
          </select>
        </div>

        {/* AI Qualification Filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-secondary font-bold">AI Status:</span>
          <select
            aria-label="Filter by AI qualification status"
            className="neo-input !py-1.5 !text-xs"
            value={qualificationFilter}
            onChange={(e) => setQualificationFilter(e.target.value)}
          >
            <option value="all">All Qualifications</option>
            <option value="Qualified">✨ Qualified</option>
            <option value="Needs Follow-up">⏳ Needs Follow-up</option>
            <option value="Not Qualified">❌ Not Qualified</option>
          </select>
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
            className="text-xs text-rose-600 hover:text-rose-700 font-bold px-2 py-1 underline"
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
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-shadow-darker/10 text-secondary">
                    <th className="py-3 px-3 font-bold">Customer & Company</th>
                    <th className="py-3 px-3 font-bold">Contact</th>
                    <th className="py-3 px-3 font-bold">Order Specs</th>
                    <th className="py-3 px-3 font-bold">Event & Delivery</th>
                    <th className="py-3 px-3 font-bold">Sales Rep</th>
                    <th className="py-3 px-3 font-bold">Pipeline Stage</th>
                    <th className="py-3 px-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-shadow-darker/5">
                  {filteredLeadsList.map((lead) => {
                    const currentStageObj = activeStages.find((s) => s.id === lead.status) || {
                      id: lead.status || 'new_enquiry',
                      label: lead.status || 'New Enquiry',
                    };

                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3">
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
                              <div className="text-secondary text-[11px] flex items-center gap-1">
                                <Building size={11} /> {lead.company}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            {lead.phone ? (
                              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                <span>{lead.phone}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(
                                      `/whatsapp-automation?leadId=${lead.id}&phone=${lead.phone}`
                                    )
                                  }
                                  className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded hover:bg-emerald-50"
                                  title="Chat in WhatsApp Live Chat"
                                >
                                  <MessageSquare size={12} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-secondary">-</span>
                            )}
                            {lead.email && (
                              <div className="text-secondary text-[10px] truncate max-w-[140px]">{lead.email}</div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            {lead.required_quantity && (
                              <div className="font-semibold text-primary-dark text-[11px]">
                                🎯 {lead.required_quantity} pcs
                              </div>
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

                        <td className="py-3 px-3">
                          <div className="space-y-0.5 text-[11px]">
                            {lead.event_name && (
                              <div className="text-primary-dark truncate max-w-[150px]">🏆 {lead.event_name}</div>
                            )}
                            {lead.delivery_date && (
                              <div className="text-amber-900 font-medium">🚚 {lead.delivery_date}</div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-secondary text-[11px]">
                          {lead.sales_person || 'EcoTrophy Rep'}
                        </td>

                        <td className="py-3 px-3">
                          <select
                            aria-label={`Change stage for ${lead.name}`}
                            className="text-[11px] font-bold bg-slate-100 rounded-lg px-2 py-1 border border-shadow-darker/10 text-primary-dark hover:bg-slate-200 transition-colors"
                            value={lead.status || currentStageObj.id}
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
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setNotesDrawerState({
                                  isOpen: true,
                                  lead,
                                  stageName: currentStageObj.label,
                                })
                              }
                              className="p-1.5 rounded-lg border border-shadow-darker/10 hover:bg-slate-100 text-slate-700"
                              title="Notes & Alarms"
                            >
                              <StickyNote
                                size={14}
                                className={lead.notes_count ? 'text-primary' : 'text-slate-400'}
                              />
                            </button>

                            <Link
                              to={`/leads/${lead.id}`}
                              className="neo-btn text-[11px] px-2.5 py-1 font-bold inline-flex items-center gap-1 text-primary"
                            >
                              <Eye size={12} /> 360°
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
            className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 md:-translate-x-4 z-20 p-2.5 rounded-full bg-surface/95 backdrop-blur border border-shadow-darker/20 shadow-neo-raised text-primary-dark hover:text-primary transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none ${
              !canScrollLeft ? 'opacity-0 pointer-events-none' : 'opacity-90 hover:opacity-100'
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
            className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 md:translate-x-4 z-20 p-2.5 rounded-full bg-surface/95 backdrop-blur border border-shadow-darker/20 shadow-neo-raised text-primary-dark hover:text-primary transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none ${
              !canScrollRight ? 'opacity-0 pointer-events-none' : 'opacity-90 hover:opacity-100'
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
                    className="flex-shrink-0 w-14 neo-card border border-shadow-darker/10 bg-slate-100/70 rounded-2xl p-2 flex flex-col items-center justify-between min-h-[360px] cursor-pointer hover:bg-slate-200/60 transition-all group"
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
                        className="p-1 rounded-md text-secondary hover:text-primary hover:bg-white transition-colors"
                        title="Expand column"
                      >
                        <Maximize2 size={12} />
                      </button>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-white border border-shadow-darker/15 text-primary-dark">
                        {stageLeads.length}
                      </span>
                    </div>

                    <div className="writing-vertical text-xs font-bold text-slate-700 tracking-wider rotate-180 uppercase select-none py-4">
                      {index + 1}. {stage.label}
                    </div>

                    {stageVal > 0 && (
                      <div className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200 truncate max-w-[48px]">
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
                  )} bg-slate-50/40 rounded-2xl transition-all`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={() => handleCardDrop(stage.id)}
                >
                  {/* Column Header */}
                  <div className="border-b border-shadow-darker/10 pb-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {phase && (
                          <span
                            className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border block w-fit mb-1 ${phase.badgeTone}`}
                          >
                            {phase.shortLabel}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-primary-dark">
                            {index + 1}. {stage.label}
                          </span>
                        </div>
                        {stageVal > 0 && (
                          <div className="text-[11px] font-bold text-emerald-700 mt-0.5">
                            ₹{stageVal.toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-surface border border-shadow-darker/15 text-primary-dark shadow-xs">
                          {stageLeads.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleStageCollapse(stage.id)}
                          className="p-1 rounded-md text-secondary hover:text-primary-dark hover:bg-surface/80 transition-colors"
                          title="Collapse this column"
                        >
                          <Minimize2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Customer Cards List */}
                  <div className="space-y-3 min-h-[160px]">
                    {stageLeads.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-shadow-darker/20 p-5 text-xs text-secondary text-center">
                        Drop customer card here to move to {stage.label}
                      </div>
                    ) : (
                      stageLeads.map((lead) => (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', lead.id);
                            setDragId(lead.id);
                          }}
                          onDragEnd={() => setDragId('')}
                          className="rounded-2xl bg-surface border border-shadow-darker/10 p-3.5 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all relative overflow-hidden group space-y-2.5"
                        >
                          {/* AI Qualification Accent Strip */}
                          {lead.qualification_status === 'Qualified' && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
                          )}
                          {lead.qualification_status === 'Needs Follow-up' && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-400" />
                          )}
                          {lead.qualification_status === 'Not Qualified' && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-400" />
                          )}

                          {/* Customer Title, Status & Phone */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {lead.is_repeat_customer || lead.customer_lifecycle === 'repeat_customer' ? (
                                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                                    Repeat Customer
                                  </span>
                                ) : lead.customer_lifecycle === 'existing_customer' ? (
                                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                                    Existing Customer
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    New Customer
                                  </span>
                                )}

                                {lead.source && (
                                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                    {lead.source}
                                  </span>
                                )}
                              </div>

                              <Link
                                to={`/leads/${lead.id}`}
                                className="font-bold text-sm text-primary-dark hover:text-primary transition-colors block"
                              >
                                {lead.name}
                              </Link>
                              {lead.company && (
                                <div className="text-xs text-secondary flex items-center gap-1">
                                  <Building size={11} /> {lead.company}
                                </div>
                              )}
                            </div>
                            <GripVertical
                              size={16}
                              className="text-secondary/50 shrink-0 group-hover:text-primary mt-1"
                            />
                          </div>

                          {/* Phone & Direct 1-Click WhatsApp Trigger */}
                          {lead.phone && (
                            <div className="text-xs text-slate-600 flex items-center justify-between font-mono bg-slate-50/80 px-2 py-1 rounded-lg border border-shadow-darker/5">
                              <div className="flex items-center gap-1.5">
                                <Phone size={11} className="text-emerald-600" />
                                <span>{lead.phone}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/whatsapp-automation?leadId=${lead.id}&phone=${lead.phone}`
                                  )
                                }
                                className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 hover:underline"
                                title="Chat in WhatsApp Live Chat"
                              >
                                <span>Chat</span>
                                <MessageSquare size={10} />
                              </button>
                            </div>
                          )}

                          {/* Last Inbound Message Snippet (if available) */}
                          {lead.last_message && (
                            <div className="text-[11px] text-slate-600 bg-slate-50/80 p-2 rounded-lg border border-shadow-darker/5 line-clamp-2 italic">
                              "{lead.last_message}"
                            </div>
                          )}

                          {/* Order Specs Matrix (Quantity, Value, Event Date, Delivery) */}
                          <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1 border-t border-shadow-darker/5">
                            {lead.required_quantity ? (
                              <div className="bg-slate-50 px-2 py-1 rounded-md border border-shadow-darker/5 font-semibold text-primary-dark">
                                🎯 {lead.required_quantity} pcs
                              </div>
                            ) : null}

                            {lead.value ? (
                              <div className="bg-emerald-50/70 px-2 py-1 rounded-md border border-emerald-100 font-bold text-emerald-800">
                                ₹{Number(lead.value).toLocaleString('en-IN')}
                              </div>
                            ) : null}

                            {lead.event_name ? (
                              <div
                                className="bg-slate-50 px-2 py-1 rounded-md border border-shadow-darker/5 text-secondary truncate col-span-2"
                                title={lead.event_name}
                              >
                                🏆 {lead.event_name}
                              </div>
                            ) : null}

                            {lead.event_date ? (
                              <div className="bg-slate-50 px-2 py-1 rounded-md border border-shadow-darker/5 text-secondary">
                                📅 {lead.event_date}
                              </div>
                            ) : null}

                            {lead.delivery_date ? (
                              <div className="bg-amber-50 px-2 py-1 rounded-md border border-amber-100 text-amber-900 font-medium">
                                🚚 {lead.delivery_date}
                              </div>
                            ) : null}
                          </div>

                          {/* Assigned Rep & Urgency */}
                          <div className="flex items-center justify-between gap-1 text-[10px] text-secondary pt-1 flex-wrap">
                            {lead.sales_person ? (
                              <span className="flex items-center gap-1 font-semibold text-slate-700">
                                <User size={10} /> {lead.sales_person}
                              </span>
                            ) : (
                              <span>EcoTrophy Rep</span>
                            )}

                            {lead.urgency === 'high' && (
                              <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                                High Urgency
                              </span>
                            )}
                          </div>

                          {/* Active Reminder Banner (if any) */}
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
                                  className={`w-full text-left text-[10px] px-2 py-1 rounded-lg border flex items-center justify-between transition-all hover:scale-[1.01] ${badge.tone}`}
                                  title={`Active reminder: ${lead.active_reminder.title || ''}`}
                                >
                                  <span className="truncate">{badge.text}</span>
                                  <Clock size={11} className="shrink-0 ml-1 opacity-80" />
                                </button>
                              );
                            })()}

                          {/* Card Footer Actions */}
                          <div className="flex items-center justify-between pt-2 border-t border-shadow-darker/10 gap-1.5 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/leads/${lead.id}`}
                                className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                              >
                                <Eye size={12} /> 360°
                              </Link>

                              {/* Quick Notes & Reminders Drawer Trigger */}
                              <button
                                type="button"
                                onClick={() =>
                                  setNotesDrawerState({ isOpen: true, lead, stageName: stage.label })
                                }
                                className="text-[11px] font-bold text-slate-700 hover:text-primary transition-colors flex items-center gap-1 bg-slate-100 hover:bg-primary/10 px-2 py-0.5 rounded-md border border-shadow-darker/5"
                                title="Open Notes, Team Mentions & Reminder Alarms"
                              >
                                <StickyNote
                                  size={12}
                                  className={lead.notes_count ? 'text-primary' : 'text-slate-500'}
                                />
                                <span>{lead.notes_count ? `${lead.notes_count} Notes` : '+ Note'}</span>
                              </button>
                            </div>

                            {/* Quick Stage Move Dropdown */}
                            <select
                              aria-label={`Move stage for ${lead.name}`}
                              className="text-[11px] font-semibold bg-slate-100 rounded-lg px-2 py-1 border border-shadow-darker/10 text-primary-dark hover:bg-slate-200 transition-colors"
                              value={lead.status || stage.id}
                              onChange={(e) => handleQuickMove(lead, e.target.value)}
                            >
                              <option value="" disabled>
                                Move stage...
                              </option>
                              {activeStages.map((s) => (
                                <option key={s.id} value={s.id}>
                                  ➔ {s.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
    </div>
  );
}

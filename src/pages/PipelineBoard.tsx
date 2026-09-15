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
    id: String(pipeline?.id || 'regular_order'),
    name: String(pipeline?.name || 'Regular Order Pipeline'),
    scenario: String(pipeline?.scenario || '10–99 Pieces'),
    is_default: pipeline?.is_default === true || pipeline?.id === 'regular_order',
    stages,
    created_at: pipeline?.created_at || (new Date() as any),
    updated_at: pipeline?.updated_at,
  };
}

export default function PipelineBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || 'regular_order';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [qualificationFilter, setQualificationFilter] = useState<string>('all');

  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingPipelines, setLoadingPipelines] = useState(true);
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [deletingPipeline, setDeletingPipeline] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPipelineId, setEditingPipelineId] = useState('');
  const [pipelineDraft, setPipelineDraft] = useState<PipelineDraft>({
    name: '',
    scenario: '',
    stages: STANDARD_CRM_STAGES.map((stage) => ({ ...stage })),
  });
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
          // Initialize with default quantity pipelines
          setPipelines(DEFAULT_QUANTITY_PIPELINES);
        } else {
          const loaded = snap.docs.map((d) => normalizePipeline({ id: d.id, ...d.data() }));
          // Merge with default quantity pipelines if not present
          const existingIds = new Set(loaded.map((p) => p.id));
          const merged = [...loaded];
          DEFAULT_QUANTITY_PIPELINES.forEach((def) => {
            if (!existingIds.has(def.id)) {
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
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
        setLeads(rows);
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

  // Group leads into stages
  const groupedLeads = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    activeStages.forEach((stage) => {
      map[stage.id] = [];
    });
    map['other'] = [];

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

      const statusKey = lead.status || activeStages[0]?.id || 'new_enquiry';
      if (map[statusKey]) {
        map[statusKey].push(lead);
      } else {
        map['other'].push(lead);
      }
    });

    return map;
  }, [leads, activePipeline, activeStages, searchQuery, urgencyFilter, qualificationFilter]);

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
    <div className="space-y-6 animate-fade-in max-w-full">
      {/* Header & Pipeline Selectors */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">CRM Kanban</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
              Manual Stage Control
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary-dark mt-1">Pipeline Board</h1>
          <p className="text-secondary text-sm">
            Drag and drop customer cards to manually update stages. Automated notification preview will confirm before sending.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
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

      {/* Search & Filter Bar */}
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

        {/* Urgency Filter */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-secondary font-bold">Urgency:</span>
          <select
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

      {/* Horizontal Scrollable Stages Container */}
      {loadingLeads || loadingPipelines ? (
        <div className="py-24 text-center text-secondary">
          <Loader2 size={24} className="animate-spin mx-auto mb-2 text-primary" />
          Loading pipeline board...
        </div>
      ) : (
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
            {activeStages.map((stage, index) => {
              const stageLeads = groupedLeads[stage.id] || [];
              const stageVal = stageLeads.reduce((s, l) => s + (Number(l.value) || 0), 0);

              return (
                <div
                  key={stage.id}
                  className={`flex-shrink-0 flex-grow-0 w-80 neo-card space-y-3.5 border ${stageTone(index)} bg-slate-50/40 rounded-2xl`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={() => handleCardDrop(stage.id)}
                >
                  {/* Column Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-shadow-darker/10 pb-2.5">
                    <div>
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
                    <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-surface border border-shadow-darker/15 text-primary-dark shadow-xs">
                      {stageLeads.length}
                    </span>
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
                          {/* AI Qualification Bar */}
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
                            <div className="space-y-1">
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
                            <GripVertical size={16} className="text-secondary/50 shrink-0 group-hover:text-primary mt-1" />
                          </div>

                          {/* Phone & Contact */}
                          {lead.phone && (
                            <div className="text-xs text-slate-600 flex items-center gap-1.5 font-mono">
                              <Phone size={12} className="text-emerald-600" />
                              <span>{lead.phone}</span>
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
                              <div className="bg-slate-50 px-2 py-1 rounded-md border border-shadow-darker/5 text-secondary truncate col-span-2" title={lead.event_name}>
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
                              <span>EcoTrophy Team</span>
                            )}

                            {lead.urgency === 'high' && (
                              <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                                High Urgency
                              </span>
                            )}
                          </div>

                          {/* Card Footer Actions */}
                          <div className="flex items-center justify-between pt-2 border-t border-shadow-darker/10">
                            <Link
                              to={`/leads/${lead.id}`}
                              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                            >
                              <Eye size={12} /> View 360°
                            </Link>

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
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';
import {
  ArrowRight,
  Filter,
  Search,
  UserPlus,
  Trash2,
  Columns3,
  Building,
  Phone,
  DollarSign,
  ExternalLink,
  CheckCircle2,
  Clock,
  Layers,
  Award,
  AlertTriangle,
  X,
} from 'lucide-react';
import { db } from '../lib/firebase';
import type { Lead, Pipeline } from '../types';
import { STANDARD_CRM_STAGES, DEFAULT_QUANTITY_PIPELINES } from '../types';
import { useCRMPermission } from '../hooks/useCRMPermission';
import { openWhatsAppWebDirect } from '../services/stageNotificationService';

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
  const [pipelines, setPipelines] = useState<Pipeline[]>(DEFAULT_QUANTITY_PIPELINES);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { hasPermission } = useCRMPermission();

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

  useEffect(() => {
    if (!db) return;

    const q = query(collection(db, 'leads'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setLeads(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Lead)));
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

      // Text search
      const matchesText =
        !text ||
        [lead.name, lead.phone, lead.email, lead.source, lead.campaign, lead.id, lead.company, lead.event_name, lead.sales_person].some(
          (value) => String(value || '').toLowerCase().includes(text)
        );

      // Status filter
      const matchesStatus = status === 'all' || lead.status === status;

      // Platform filter
      const matchesPlatform = platform === 'all' || lead.platform === platform;

      return matchesText && matchesStatus && matchesPlatform;
    });
  }, [leads, search, status, platform, selectedPipelineId]);

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">CRM Directory</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary-dark mt-1">Customer Leads</h1>
          <p className="text-secondary text-xs sm:text-sm mt-0.5">
            Comprehensive tabular index with stage status, quantities, order values, and direct contact actions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link to="/pipeline" className="neo-btn inline-flex items-center gap-2 text-xs font-bold px-3.5 py-2">
            <Columns3 size={14} /> Pipeline Board
          </Link>
          {hasPermission('create_lead') && (
            <Link
              to="/leads/new"
              className="neo-btn-primary inline-flex items-center gap-2 text-xs font-bold px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
            >
              <UserPlus size={14} /> Add Customer Lead
            </Link>
          )}
        </div>
      </div>

      {/* Pipeline Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto p-1.5 bg-transparent rounded-2xl border border-shadow-darker/10">
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

        {pipelines.map((p) => {
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
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
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 neo-input w-full lg:max-w-xl">
            <Search size={16} className="text-secondary" />
            <input
              className="bg-transparent border-none outline-none w-full text-xs"
              placeholder="Search name, phone, email, company, event, sales rep..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-secondary hover:text-primary-dark">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5 text-xs">
            {/* Real Pipeline Stages Filter */}
            <div className="neo-input flex items-center gap-1.5 !py-1 !px-2.5">
              <Filter size={14} className="text-secondary" />
              <select
                aria-label="Filter by stage"
                className="bg-transparent border-none outline-none text-xs font-semibold"
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
            <div className="neo-input flex items-center gap-1.5 !py-1 !px-2.5">
              <Filter size={14} className="text-secondary" />
              <select
                aria-label="Filter by platform"
                className="bg-transparent border-none outline-none text-xs font-semibold"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="all">All Platforms</option>
                <option value="manual">Manual</option>
                <option value="meta">Meta (WhatsApp/Ads)</option>
                <option value="google">Google</option>
                <option value="test">Test</option>
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
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-secondary border-b border-shadow-darker/10">
                  <th className="py-3 pr-4 font-semibold">Customer & Lifecycle</th>
                  <th className="py-3 pr-4 font-semibold">Contact</th>
                  <th className="py-3 pr-4 font-semibold">Order Specs</th>
                  <th className="py-3 pr-4 font-semibold">Stage Status</th>
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
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-primary/10 text-primary-dark border border-primary/20">
                          {currentStageObj.label}
                        </span>
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
          </div>
        )}
      </div>

      {/* Styled In-App Deletion Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="neo-card max-w-sm w-full space-y-4 p-5 bg-transparent rounded-2xl shadow-xl">
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
    </div>
  );
}




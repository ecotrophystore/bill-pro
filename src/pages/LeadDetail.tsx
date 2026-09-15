import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where, updateDoc, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Save,
  Send,
  Sparkles,
  Bot,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Clock,
  MapPin,
  Target,
  Building,
  Truck,
  FileText,
  User,
  History,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';
import { db, auth } from '../lib/firebase';
import {
  type Lead,
  type LeadActivity,
  type MessageTemplate,
  type Pipeline,
  type PipelineStage,
  type User as DBUser,
  type StageHistoryEntry,
  type NotificationHistoryEntry,
  STANDARD_CRM_STAGES,
  DEFAULT_QUANTITY_PIPELINES,
} from '../types';
import { useCRMPermission } from '../hooks/useCRMPermission';
import { StageChangeConfirmModal } from '../components/CRM/StageChangeConfirmModal';
import { PipelineReassignBanner } from '../components/CRM/PipelineReassignBanner';
import { classifyLeadPipeline } from '../utils/pipelineClassifier';

type LeadFormState = {
  name: string;
  company: string;
  phone: string;
  email: string;
  location: string;
  required_quantity: string;
  value: string;
  event_name: string;
  event_date: string;
  delivery_date: string;
  trophy_size: string;
  sales_person: string;
  design_person: string;
  tracking_number: string;
  source: string;
  campaign: string;
  owner_id: string;
  status: string;
  reason: string;
  next_follow_up_date: string;
};

function formatDate(value: any) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString('en-IN');
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toLocaleString('en-IN');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-IN');
}

function toDateInputValue(value: any) {
  if (!value) return '';
  const date =
    typeof value.toDate === 'function'
      ? value.toDate()
      : typeof value.seconds === 'number'
      ? new Date(value.seconds * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>(DEFAULT_QUANTITY_PIPELINES);
  const [users, setUsers] = useState<DBUser[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'quotation'>('details');
  const [dismissedReassign, setDismissedReassign] = useState(false);
  const { hasPermission } = useCRMPermission();

  // Stage change modal state
  const [stageModalState, setStageModalState] = useState<{
    isOpen: boolean;
    fromStage: PipelineStage;
    toStage: PipelineStage;
  }>({
    isOpen: false,
    fromStage: { id: '', label: '' },
    toStage: { id: '', label: '' },
  });

  const [form, setForm] = useState<LeadFormState>({
    name: '',
    company: '',
    phone: '',
    email: '',
    location: '',
    required_quantity: '',
    value: '',
    event_name: '',
    event_date: '',
    delivery_date: '',
    trophy_size: '',
    sales_person: '',
    design_person: '',
    tracking_number: '',
    source: '',
    campaign: '',
    owner_id: '',
    status: 'new_enquiry',
    reason: '',
    next_follow_up_date: '',
  });

  useEffect(() => {
    if (!db || !id) return;

    // Load lead doc
    const unsubLead = onSnapshot(
      doc(db, 'leads', id),
      (snapshot) => {
        if (snapshot.exists()) {
          setLead({ id: snapshot.id, ...snapshot.data() } as Lead);
        } else {
          setLead(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Lead load failed', error);
        setLoading(false);
      }
    );

    // Load pipelines
    const unsubPipelines = onSnapshot(collection(db, 'pipelines'), (snap) => {
      if (!snap.empty) {
        setPipelines(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pipeline)));
      }
    });

    // Load users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DBUser)));
    });

    // Load activities
    const unsubActivities = onSnapshot(
      query(collection(db, 'activities'), where('lead_id', '==', id)),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadActivity));
        rows.sort((a, b) => {
          const at =
            typeof a.created_at?.toDate === 'function'
              ? a.created_at.toDate().getTime()
              : (a.created_at as any)?.seconds
              ? (a.created_at as any).seconds * 1000
              : 0;
          const bt =
            typeof b.created_at?.toDate === 'function'
              ? b.created_at.toDate().getTime()
              : (b.created_at as any)?.seconds
              ? (b.created_at as any).seconds * 1000
              : 0;
          return bt - at;
        });
        setActivities(rows);
      }
    );

    return () => {
      unsubLead();
      unsubPipelines();
      unsubUsers();
      unsubActivities();
    };
  }, [id]);

  useEffect(() => {
    if (!lead) return;

    setForm({
      name: lead.name || '',
      company: lead.company || lead.organization || '',
      phone: lead.phone || '',
      email: lead.email || '',
      location: lead.location || '',
      required_quantity: lead.required_quantity ? String(lead.required_quantity) : '',
      value: lead.value ? String(lead.value) : '',
      event_name: lead.event_name || '',
      event_date: lead.event_date || '',
      delivery_date: lead.delivery_date || '',
      trophy_size: lead.trophy_size || '',
      sales_person: lead.sales_person || '',
      design_person: lead.design_person || '',
      tracking_number: lead.tracking_number || '',
      source: lead.source || '',
      campaign: lead.campaign || '',
      owner_id: lead.owner_id || '',
      status: lead.status || 'new_enquiry',
      reason: lead.reason || '',
      next_follow_up_date: toDateInputValue(lead.next_follow_up_date),
    });
  }, [lead]);

  const activePipeline = useMemo(() => {
    if (!lead) return DEFAULT_QUANTITY_PIPELINES[1];
    const found = pipelines.find((p) => p.id === lead.pipeline_id);
    return found || DEFAULT_QUANTITY_PIPELINES[1];
  }, [lead, pipelines]);

  const activeStages = useMemo(() => {
    return activePipeline?.stages?.length ? activePipeline.stages : STANDARD_CRM_STAGES;
  }, [activePipeline]);

  // Check if quantity/value qualifies for a different pipeline
  const recommendedPipeline = useMemo(() => {
    if (!lead || dismissedReassign) return null;
    const qty = Number(form.required_quantity);
    if (isNaN(qty) || qty <= 0) return null;

    const classification = classifyLeadPipeline(
      { ...lead, required_quantity: qty, value: Number(form.value) || undefined },
      [],
      pipelines
    );

    const currentPipeId = lead.pipeline_id || 'regular_order';
    if (classification.pipeline_id !== currentPipeId) {
      return {
        id: classification.pipeline_id,
        name: classification.pipeline_name,
        reason: classification.reason,
      };
    }
    return null;
  }, [lead, form.required_quantity, form.value, pipelines, dismissedReassign]);

  const handleStageSelectChange = (newStageId: string) => {
    if (!lead || newStageId === lead.status) return;

    const fromStage = activeStages.find((s) => s.id === lead.status) || {
      id: lead.status || 'new_enquiry',
      label: lead.status || 'New Enquiry',
    };
    const toStage = activeStages.find((s) => s.id === newStageId) || {
      id: newStageId,
      label: newStageId,
    };

    setStageModalState({
      isOpen: true,
      fromStage,
      toStage,
    });
  };

  const handleReassignPipeline = async (targetPipelineId: string) => {
    if (!db || !id) return;
    try {
      await updateDoc(doc(db, 'leads', id), {
        pipeline_id: targetPipelineId,
        updated_at: serverTimestamp(),
      });
      setFeedback(`Moved customer to ${pipelines.find((p) => p.id === targetPipelineId)?.name || 'Pipeline'}.`);
      setDismissedReassign(true);
    } catch (err: any) {
      console.error('Failed to reassign pipeline:', err);
      setFeedback('Error updating pipeline.');
    }
  };

  const handleSaveDetails = async () => {
    if (!db || !id) return;
    setSaving(true);
    setFeedback('');

    try {
      const payload: any = {
        name: form.name.trim(),
        company: form.company.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        location: form.location.trim(),
        required_quantity: form.required_quantity ? Number(form.required_quantity) || form.required_quantity : '',
        value: form.value ? Number(form.value) || 0 : 0,
        event_name: form.event_name.trim(),
        event_date: form.event_date.trim(),
        delivery_date: form.delivery_date.trim(),
        trophy_size: form.trophy_size.trim(),
        sales_person: form.sales_person.trim(),
        design_person: form.design_person.trim(),
        tracking_number: form.tracking_number.trim(),
        source: form.source.trim(),
        campaign: form.campaign.trim(),
        owner_id: form.owner_id.trim(),
        reason: form.reason.trim(),
        updated_at: serverTimestamp(),
      };

      if (form.next_follow_up_date) {
        payload.next_follow_up_date = new Date(form.next_follow_up_date);
      }

      await updateDoc(doc(db, 'leads', id), payload);

      // Record activity
      await addDoc(collection(db, 'activities'), {
        lead_id: id,
        type: 'lead.updated',
        message: `Lead details updated by ${auth?.currentUser?.displayName || auth?.currentUser?.email || 'User'}.`,
        actor: auth?.currentUser?.uid || 'user',
        created_at: serverTimestamp(),
      });

      setFeedback('Customer details saved successfully.');
    } catch (err: any) {
      console.error('Save failed:', err);
      setFeedback(err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToCustomer = async () => {
    if (!db || !lead) return;
    try {
      const custRef = await addDoc(collection(db, 'customers'), {
        name: lead.name,
        phone: lead.phone || '',
        email: lead.email || '',
        company: lead.company || lead.organization || '',
        type: 'business',
        notes: `Converted from lead. Quantity: ${lead.required_quantity || '-'}, Event: ${lead.event_name || '-'}`,
        created_at: serverTimestamp(),
      });
      setFeedback(`Converted to Customer record (${custRef.id}) in Customer Library!`);
    } catch (e: any) {
      console.error('Customer conversion failed:', e);
      setFeedback('Failed to create customer record.');
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-secondary">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-primary" />
        Loading customer profile...
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="space-y-4">
        <Link to="/pipeline" className="inline-flex items-center gap-2 text-primary-dark font-semibold">
          <ArrowLeft size={16} /> Back to pipeline
        </Link>
        <div className="neo-card text-center py-16 text-secondary">Customer record not found.</div>
      </div>
    );
  }

  const currentStageLabel = activeStages.find((s) => s.id === lead.status)?.label || lead.status;
  const stageHistoryList = lead.stage_history || [];
  const notificationHistoryList = lead.notification_history || [];

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          to="/pipeline"
          className="inline-flex items-center gap-2 text-xs font-bold text-secondary hover:text-primary-dark transition-colors"
        >
          <ArrowLeft size={14} /> Back to Pipeline Board
        </Link>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleConvertToCustomer}
            className="neo-btn text-xs px-3.5 py-1.5 font-bold flex items-center gap-1.5 text-secondary hover:text-primary-dark"
          >
            <Building size={14} /> Save to Customer Library
          </button>

          <Link
            to={`/quotations/new?lead_id=${lead.id}&name=${encodeURIComponent(lead.name)}&phone=${encodeURIComponent(
              lead.phone || ''
            )}&company=${encodeURIComponent(lead.company || '')}`}
            className="neo-btn-primary text-xs px-4 py-1.5 font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center gap-1.5 shadow-md"
          >
            <FileText size={14} /> Create Quotation
          </Link>
        </div>
      </div>

      {/* Pipeline Reassignment Recommendation Banner */}
      <PipelineReassignBanner
        currentPipelineName={activePipeline.name}
        recommendedPipeline={recommendedPipeline}
        onConfirmReassign={handleReassignPipeline}
        onDismiss={() => setDismissedReassign(true)}
      />

      {/* Profile Header Card */}
      <div className="neo-card space-y-4 border border-shadow-darker/10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-primary tracking-wide uppercase">
                {activePipeline.name}
              </span>
              <span>•</span>
              <span className="text-xs text-secondary">Created {formatDate(lead.created_at)}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-primary-dark mt-1">{lead.name}</h1>
            {lead.company && (
              <div className="text-sm font-semibold text-secondary flex items-center gap-1.5 mt-0.5">
                <Building size={14} /> {lead.company}
              </div>
            )}
          </div>

          {/* Manual Stage Selector */}
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
              Current Stage (Click to Change)
            </span>
            <div className="relative">
              <select
                className="neo-btn-primary text-xs font-bold py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md cursor-pointer"
                value={lead.status || 'new_enquiry'}
                onChange={(e) => handleStageSelectChange(e.target.value)}
              >
                {activeStages.map((s, idx) => (
                  <option key={s.id} value={s.id} className="bg-surface text-primary-dark font-medium">
                    {idx + 1}. {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Quick Contact & Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-shadow-darker/10 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-shadow-darker/5">
            <span className="text-secondary font-medium block">Phone</span>
            <span className="font-bold text-primary-dark">{lead.phone || 'No phone'}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-shadow-darker/5">
            <span className="text-secondary font-medium block">Quantity</span>
            <span className="font-bold text-primary-dark">
              {lead.required_quantity ? `${lead.required_quantity} pieces` : 'Not specified'}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
            <span className="text-emerald-800 font-medium block">Order Value</span>
            <span className="font-bold text-emerald-900">
              {lead.value ? `₹${Number(lead.value).toLocaleString('en-IN')}` : '₹0'}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-shadow-darker/5">
            <span className="text-secondary font-medium block">Delivery Deadline</span>
            <span className="font-bold text-primary-dark">{lead.delivery_date || 'TBD'}</span>
          </div>
        </div>
      </div>

      {/* AI Intelligence Card (if available) */}
      {(lead.qualification_status || lead.requirement || lead.suggested_reply) && (
        <div className="neo-card space-y-3 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-surface border border-emerald-500/20">
          <div className="flex items-center justify-between gap-3 border-b border-shadow-darker/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-600" />
              <h2 className="text-sm font-bold text-primary-dark">AI Sales Intelligence</h2>
            </div>
            {lead.qualification_status && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {lead.qualification_status}
              </span>
            )}
          </div>

          {lead.requirement && (
            <div className="text-xs leading-relaxed text-slate-800">
              <strong>Requirement:</strong> {lead.requirement}
            </div>
          )}

          {lead.suggested_reply && (
            <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-slate-800">
              <span className="font-bold text-emerald-900 block mb-1">AI Drafted Reply Context:</span>
              <p className="whitespace-pre-wrap">{lead.suggested_reply}</p>
            </div>
          )}
        </div>
      )}

      {/* Tab Navigation (Details Form vs Activity & History) */}
      <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-2">
        <button
          onClick={() => setActiveTab('details')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'details'
              ? 'bg-primary text-white shadow-sm'
              : 'text-secondary hover:text-primary-dark hover:bg-slate-100'
          }`}
        >
          Customer & Order Details
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'bg-primary text-white shadow-sm'
              : 'text-secondary hover:text-primary-dark hover:bg-slate-100'
          }`}
        >
          <History size={14} /> Stage History & Notifications ({stageHistoryList.length + notificationHistoryList.length})
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary-dark flex items-center justify-between gap-2 animate-fade-in">
          <span>{feedback}</span>
          <button onClick={() => setFeedback('')} className="text-secondary hover:text-primary-dark">
            <X size={14} />
          </button>
        </div>
      )}

      {/* TAB 1: Customer & Order Details Form */}
      {activeTab === 'details' && (
        <div className="neo-card space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            {/* Customer Info */}
            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Customer Name</label>
              <input
                type="text"
                className="neo-input w-full"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Company / Organization</label>
              <input
                type="text"
                className="neo-input w-full"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Phone Number</label>
              <input
                type="text"
                className="neo-input w-full"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Email Address</label>
              <input
                type="email"
                className="neo-input w-full"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Location / City</label>
              <input
                type="text"
                className="neo-input w-full"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>

            {/* Order Specs */}
            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Required Quantity (Pieces)</label>
              <input
                type="number"
                className="neo-input w-full font-bold text-emerald-800"
                value={form.required_quantity}
                onChange={(e) => setForm({ ...form, required_quantity: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Estimated Order Value (₹)</label>
              <input
                type="number"
                className="neo-input w-full font-bold text-emerald-800"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Event Name</label>
              <input
                type="text"
                className="neo-input w-full"
                placeholder="e.g. Annual Award Function"
                value={form.event_name}
                onChange={(e) => setForm({ ...form, event_name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Event Date</label>
              <input
                type="text"
                className="neo-input w-full"
                placeholder="e.g. 24 Oct 2026"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Delivery Deadline</label>
              <input
                type="text"
                className="neo-input w-full"
                placeholder="e.g. 20 Oct 2026"
                value={form.delivery_date}
                onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Trophy Size / Material</label>
              <input
                type="text"
                className="neo-input w-full"
                placeholder="e.g. 8 inch Wooden / Crystal"
                value={form.trophy_size}
                onChange={(e) => setForm({ ...form, trophy_size: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Shipment Tracking Number</label>
              <input
                type="text"
                className="neo-input w-full"
                placeholder="e.g. ST49201928"
                value={form.tracking_number}
                onChange={(e) => setForm({ ...form, tracking_number: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Assigned Sales Person</label>
              <input
                type="text"
                className="neo-input w-full"
                placeholder="Sales rep name"
                value={form.sales_person}
                onChange={(e) => setForm({ ...form, sales_person: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Assigned Design Person</label>
              <input
                type="text"
                className="neo-input w-full"
                placeholder="Designer name"
                value={form.design_person}
                onChange={(e) => setForm({ ...form, design_person: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-primary-dark block">Next Follow-up Date</label>
              <input
                type="date"
                className="neo-input w-full"
                value={form.next_follow_up_date}
                onChange={(e) => setForm({ ...form, next_follow_up_date: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-shadow-darker/10">
            <button
              type="button"
              onClick={handleSaveDetails}
              disabled={saving}
              className="neo-btn-primary text-xs px-6 py-2.5 font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save All Details
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: Stage Transition & Notification History Stream */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Stage Move History */}
          <div className="neo-card space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
              <h2 className="text-sm font-bold text-primary-dark flex items-center gap-2">
                <History size={16} className="text-primary" />
                Stage Transition Timeline (Manual Changes)
              </h2>
              <span className="text-xs text-secondary">{stageHistoryList.length} stage transitions</span>
            </div>

            {stageHistoryList.length === 0 ? (
              <div className="py-8 text-center text-xs text-secondary">
                No manual stage transitions recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {stageHistoryList.map((entry, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 border border-shadow-darker/10 flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-bold text-primary-dark">
                        <span className="text-slate-600">{entry.from_stage}</span>
                        <ArrowRight size={12} className="text-emerald-600" />
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {entry.to_stage}
                        </span>
                      </div>
                      {entry.note && <div className="text-secondary italic">"{entry.note}"</div>}
                    </div>

                    <div className="text-right text-[11px] text-secondary shrink-0">
                      <div>By: {entry.changed_by_name || 'CRM User'}</div>
                      <div>{formatDate(entry.changed_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Automated Notification History */}
          <div className="neo-card space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
              <h2 className="text-sm font-bold text-primary-dark flex items-center gap-2">
                <MessageSquare size={16} className="text-emerald-600" />
                Automated Customer Notifications Log
              </h2>
              <span className="text-xs text-secondary">{notificationHistoryList.length} notifications</span>
            </div>

            {notificationHistoryList.length === 0 ? (
              <div className="py-8 text-center text-xs text-secondary">
                No automated stage notifications recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {notificationHistoryList.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-900 uppercase tracking-wider text-[10px] bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                          {n.channel}
                        </span>
                        <span className="font-semibold text-slate-800">Stage: {n.stage_name}</span>
                      </div>
                      <span className="text-[11px] text-secondary">{formatDate(n.sent_at)}</span>
                    </div>

                    <p className="text-slate-800 leading-relaxed font-sans bg-white/80 p-2.5 rounded-lg border border-shadow-darker/5 whitespace-pre-wrap">
                      {n.message}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-secondary pt-1">
                      <span>Recipient: {n.recipient}</span>
                      <span
                        className={`font-semibold ${
                          n.status === 'sent' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        Status: {n.status} {n.error ? `(${n.error})` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation & Notification Dispatch Modal */}
      <StageChangeConfirmModal
        isOpen={stageModalState.isOpen}
        lead={lead}
        fromStage={stageModalState.fromStage}
        toStage={stageModalState.toStage}
        pipelineId={activePipeline.id}
        pipelineName={activePipeline.name}
        onClose={() =>
          setStageModalState({
            isOpen: false,
            fromStage: { id: '', label: '' },
            toStage: { id: '', label: '' },
          })
        }
        onSuccess={(res) => {
          setFeedback(res.message);
        }}
      />
    </div>
  );
}

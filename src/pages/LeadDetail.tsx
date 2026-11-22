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
  ExternalLink,
  StickyNote,
  Bell,
  Plus,
  Layers,
  Award,
  Trash2,
  Pin,
  Tag,
  CircleAlert,
  ChevronRight,
  Flame,
  BookOpen,
  Palette,
  Shapes,
  Download,
  Image as ImageIcon,
  Factory,
  Box,
  Bus,
  Plane,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { ContextualSalesGuide } from '../components/CRM/ContextualSalesGuide';
import { SalesQualityAuditModal } from '../components/CRM/SalesQualityAuditModal';
import { LostLeadIntelligenceModal } from '../components/CRM/LostLeadIntelligenceModal';
import { SubmitDesignRequestModal } from '../components/Pipeline/SubmitDesignRequestModal';
import { ProductionSpecsModal } from '../components/Production/ProductionSpecsModal';
import { ProductionJobCardModal } from '../components/Production/ProductionJobCardModal';
import { ProductionProgressModal } from '../components/Production/ProductionProgressModal';
import { printDesignTeamChecklist, printProductionTeamChecklist } from '../utils/printDesignProductionSheet';
import { normalizeRole } from '../config/roleAccess';
import { db, auth, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  type Lead,
  type LeadActivity,
  type LeadNote,
  type NoteCategory,
  type NotePriority,
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
import { useAuth } from '../contexts/AuthContext';
import { isAdminUser, isLeadAssignedToUser } from '../utils/leadVisibility';
import { StageChangeConfirmModal } from '../components/CRM/StageChangeConfirmModal';
import { PipelineReassignBanner } from '../components/CRM/PipelineReassignBanner';
import { LeadNotesDrawer } from '../components/CRM/LeadNotesDrawer';
import { classifyLeadPipeline } from '../utils/pipelineClassifier';
import {
  executeManualStageMove,
  getStageMessageConfig,
  getStageMoveMode,
  openWhatsAppWebDirect,
  runAutoStageMoveWithToast,
  stageRequiresReason,
  subscribeStageMoveModeChange,
  type StageMovePromptMode,
} from '../services/stageNotificationService';
import { STAGE_PHASES, type StagePhase } from './PipelineBoard';
import {
  createLeadNote,
  deleteLeadNote,
  togglePinLeadNote,
} from '../services/leadNoteService';

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
  const [leadNotes, setLeadNotes] = useState<LeadNote[]>([]);
  const [leadQuotations, setLeadQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'artwork' | 'production' | 'sales_guide' | 'notes' | 'quotation' | 'conversation' | 'history'>('details');
  const [showEditBriefModal, setShowEditBriefModal] = useState(false);
  const [showProductionSpecsModal, setShowProductionSpecsModal] = useState(false);
  const [productionSpecsMode, setProductionSpecsMode] = useState<'view' | 'edit'>('view');
  const [showProductionProgressModal, setShowProductionProgressModal] = useState(false);
  const [showJobCardModal, setShowJobCardModal] = useState(false);
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [composerText, setComposerText] = useState('');
  const [dismissedReassign, setDismissedReassign] = useState(false);
  const { hasPermission } = useCRMPermission();
  const { dbUser } = useAuth();
  const isAdmin = isAdminUser(dbUser);
  const userRole = normalizeRole(dbUser?.role);

  useEffect(() => {
    if (userRole === 'design') {
      setActiveTab('artwork');
    } else if (userRole === 'production') {
      setActiveTab('production');
    }
  }, [userRole]);

  // Inline Note Form State
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState<NoteCategory>('general');
  const [newNotePriority, setNewNotePriority] = useState<NotePriority>('medium');
  const [addingNote, setAddingNote] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);

  const handleEnrichCompany = async () => {
    if (!functions || !id || !lead) return;
    const companyName = lead.company || lead.organization || lead.name;
    if (!companyName) {
      setFeedback('No company name to enrich');
      return;
    }

    setIsEnriching(true);
    try {
      const enrich = httpsCallable(functions, 'enrichCompanyManual');
      await enrich({ leadId: id, companyName });
      setFeedback('Company intelligence successfully fetched!');
    } catch (err: any) {
      console.error('Enrichment failed:', err);
      setFeedback('Failed to enrich company data.');
    } finally {
      setIsEnriching(false);
    }
  };

  // Stage change modal state & stage move preference (ask, auto_send, or without_message)
  const [stageMoveMode, setStageMoveModeState] = useState<StageMovePromptMode>(() => getStageMoveMode());
  useEffect(() => {
    return subscribeStageMoveModeChange((mode) => {
      setStageMoveModeState(mode);
    });
  }, []);

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

    // Load notes directly for inline tab
    const unsubNotes = onSnapshot(
      query(collection(db, 'lead_notes'), where('lead_id', '==', id)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadNote));
        list.sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          const at = a.created_at?.toDate?.()?.getTime?.() || 0;
          const bt = b.created_at?.toDate?.()?.getTime?.() || 0;
          return bt - at;
        });
        setLeadNotes(list);
      }
    );

    // Load omnichannel messages
    const unsubMessages = onSnapshot(
      query(collection(db, 'messages'), where('leadId', '==', id)),
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        msgs.sort((a: any, b: any) => {
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
          return at - bt;
        });
        setMessages(msgs);
      }
    );

    return () => {
      unsubLead();
      unsubPipelines();
      unsubUsers();
      unsubActivities();
      unsubNotes();
      unsubMessages();
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
      value: lead.value ? String(lead.value) : (lead.budget ? String(lead.budget).replace(/[^\d]/g, '') : ''),
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

  // Load linked quotations for this lead with robust matching (lead_id, name, phone, company, customer_id)
  useEffect(() => {
    if (!db || !lead) return;

    const normalize = (val?: string) => (val || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanDigits = (val?: string) => (val || '').replace(/\D/g, '');

    const leadIdNorm = id || lead.id;
    const leadDigits = cleanDigits(lead.phone);
    const leadCleanName = normalize(lead.name);
    const leadCleanCompany = normalize(lead.company);
    const leadCustId = (lead as any).customer_id;

    const unsubQuotations = onSnapshot(collection(db, 'quotations'), (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((q: any) => {
          // 1. Direct lead_id match
          if (q.lead_id && (q.lead_id === leadIdNorm || q.lead_id === lead.id)) {
            return true;
          }

          // 2. Direct customer_id match
          if (leadCustId && q.customer_id && leadCustId === q.customer_id) {
            return true;
          }

          // 3. Phone number match (last 8-10 digits or exact)
          const quotePhoneDigits = cleanDigits(q.customer_phone || q.phone);
          if (leadDigits && quotePhoneDigits && leadDigits.length >= 7 && quotePhoneDigits.length >= 7) {
            if (leadDigits.endsWith(quotePhoneDigits) || quotePhoneDigits.endsWith(leadDigits)) {
              return true;
            }
          }

          // 4. Normalized customer name match (handles extra spaces, punctuation, e.g. "Rajesh  Rathinam")
          const quoteCleanName = normalize(q.customer_name);
          if (quoteCleanName && leadCleanName) {
            if (quoteCleanName === leadCleanName) return true;
            // Substring containment if name is at least 4 letters
            if (leadCleanName.length >= 4 && (quoteCleanName.includes(leadCleanName) || leadCleanName.includes(quoteCleanName))) {
              return true;
            }
          }

          // 5. Company name match
          if (quoteCleanName && leadCleanCompany && leadCleanCompany.length >= 3) {
            if (quoteCleanName.includes(leadCleanCompany) || leadCleanCompany.includes(quoteCleanName)) {
              return true;
            }
          }

          return false;
        });

      // Sort by creation date descending
      rows.sort((a: any, b: any) => {
        const tA = a.created_at?.toMillis ? a.created_at.toMillis() : new Date(a.created_at || a.custom_date || 0).getTime();
        const tB = b.created_at?.toMillis ? b.created_at.toMillis() : new Date(b.created_at || b.custom_date || 0).getTime();
        return tB - tA;
      });

      setLeadQuotations(rows);
    });
    return () => unsubQuotations();
  }, [id, lead?.name, lead?.phone, lead?.company, (lead as any)?.customer_id]);

  const activePipeline = useMemo(() => {
    if (!lead) return DEFAULT_QUANTITY_PIPELINES[1];
    const found = pipelines.find((p) => p.id === lead.pipeline_id);
    return found || DEFAULT_QUANTITY_PIPELINES[1];
  }, [lead, pipelines]);

  const activeStages = useMemo(() => {
    return activePipeline?.stages?.length ? activePipeline.stages : STANDARD_CRM_STAGES;
  }, [activePipeline]);

  // Current stage label and index
  const currentStageIndex = useMemo(() => {
    const currentId = lead?.status || 'new_enquiry';
    const idx = activeStages.findIndex((s) => s.id === currentId);
    return idx >= 0 ? idx : 0;
  }, [lead?.status, activeStages]);

  const currentStageLabel = activeStages[currentStageIndex]?.label || lead?.status || 'New Enquiry';

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

  const handleStageSelectChange = async (newStageId: string) => {
    if (!lead || newStageId === lead.status) return;

    if (newStageId === 'lost_cancelled' || newStageId === 'won_lost') {
      setShowLostModal(true);
      return;
    }

    const fromStage = activeStages.find((s) => s.id === (lead.status || 'new_enquiry')) || {
      id: lead.status || 'new_enquiry',
      label: currentStageLabel,
    };
    const toStage = activeStages.find((s) => s.id === newStageId) || {
      id: newStageId,
      label: newStageId,
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
      const res = await runAutoStageMoveWithToast({
        lead,
        fromStage,
        toStage,
        pipelineId: activePipeline.id,
        pipelineName: activePipeline.name,
      });
      setFeedback(res.message);
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
        setFeedback(res.message);
      } catch (err: any) {
        setFeedback(err?.message || 'Failed to move lead');
      }
      return;
    }

    // Default 'ask': Open modal asking user "With Message" or "Without Message"
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
      setFeedback(`Reassigned to ${recommendedPipeline?.name || targetPipelineId}`);
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
        ...(isAdmin
          ? {
            sales_person: form.sales_person.trim(),
            owner_id: form.owner_id.trim(),
            ownerId: form.owner_id.trim(),
          }
          : {}),
        design_person: form.design_person.trim(),
        tracking_number: form.tracking_number.trim(),
        source: form.source.trim(),
        campaign: form.campaign.trim(),
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

      setFeedback('Customer & order details saved successfully.');
    } catch (err: any) {
      console.error('Save failed:', err);
      setFeedback(err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddInlineNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim() || !id || !lead) return;

    setAddingNote(true);
    try {
      await createLeadNote(
        {
          lead_id: id,
          lead_name: lead.name,
          company: lead.company,
          phone: lead.phone,
          pipeline_id: activePipeline.id,
          stage_id: lead.status,
          stage_name: currentStageLabel,
          content: newNoteContent.trim(),
          category: newNoteCategory,
          priority: newNotePriority,
          tagged_users: [],
          has_reminder: false,
        },
        {
          uid: auth?.currentUser?.uid || 'user',
          name: auth?.currentUser?.displayName || auth?.currentUser?.email || 'CRM Rep',
          email: auth?.currentUser?.email || '',
        }
      );
      setNewNoteContent('');
      setFeedback('Note recorded successfully.');
    } catch (err: any) {
      console.error('Failed to create inline note:', err);
      setFeedback('Failed to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteInlineNote = async (noteId: string) => {
    if (!id) return;
    try {
      await deleteLeadNote(noteId, id);
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const handleTogglePin = async (noteId: string, currentPinned: boolean) => {
    try {
      await togglePinLeadNote(noteId, !currentPinned);
    } catch (err) {
      console.error('Failed to toggle pin:', err);
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
        notes: `Converted from CRM Lead. Quantity: ${lead.required_quantity || '-'}, Event: ${lead.event_name || '-'}`,
        created_at: serverTimestamp(),
      });
      setFeedback(`Saved to Customer Library as record (${custRef.id})!`);
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

  if (dbUser && !isLeadAssignedToUser(lead, dbUser)) {
    return (
      <div className="space-y-4 max-w-xl mx-auto py-12">
        <Link to="/pipeline" className="inline-flex items-center gap-2 text-primary-dark font-semibold text-xs">
          <ArrowLeft size={16} /> Back to My Pipeline
        </Link>
        <div className="neo-card text-center py-12 space-y-2 border border-rose-200 bg-rose-50/40">
          <ShieldCheck size={28} className="mx-auto text-rose-600" />
          <h2 className="text-base font-extrabold text-primary-dark">Access Restricted</h2>
          <p className="text-xs text-secondary max-w-md mx-auto leading-relaxed">
            This lead is not assigned to you. Only the administrator or the assigned team member can view this lead record.
          </p>
        </div>
      </div>
    );
  }

  const stageHistoryList = lead.stage_history || [];
  const notificationHistoryList = lead.notification_history || [];

  return (
    <div className="space-y-5 animate-fade-in max-w-6xl mx-auto">
      {/* Top Breadcrumb & Quick Action Buttons */}
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
            onClick={() => setNotesDrawerOpen(true)}
            className="neo-btn text-xs px-3.5 py-1.5 font-bold flex items-center gap-1.5 text-primary-dark hover:bg-primary/10"
            title="Open Notes, Team Mentions & Reminder Alarms Drawer"
          >
            <StickyNote size={14} className={leadNotes.length || lead.notes_count ? 'text-primary' : 'text-secondary'} />
            <span>Notes & Reminders ({leadNotes.length || lead.notes_count || 0})</span>
          </button>

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

      {/* Pipeline Reassignment Recommendation Banner (Rule 1) */}
      <PipelineReassignBanner
        currentPipelineName={activePipeline.name}
        recommendedPipeline={recommendedPipeline}
        onConfirmReassign={handleReassignPipeline}
        onDismiss={() => setDismissedReassign(true)}
      />

      {/* Profile Header Card */}
      <div className="neo-card space-y-4 border border-shadow-darker/10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-primary tracking-wide uppercase">
                {activePipeline.name}
              </span>
              <span>•</span>
              <span className="text-xs text-secondary">Created {formatDate(lead.created_at)}</span>

              {/* Customer Lifecycle Badge */}
              {lead.is_repeat_customer || lead.customer_lifecycle === 'repeat_customer' ? (
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark border border-primary/20 shadow-xs">
                  Repeat Customer
                </span>
              ) : lead.customer_lifecycle === 'existing_customer' ? (
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark border border-primary/20 shadow-xs">
                  Existing Customer
                </span>
              ) : (
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs">
                  New Customer
                </span>
              )}

              {/* Lead Source Badge */}
              {lead.source && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-transparent text-slate-700 border border-slate-200">
                  {lead.source}
                </span>
              )}

              {lead.campaign_name && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                  Campaign: {lead.campaign_name}
                </span>
              )}

              {/* EcoTrophy Intent Badge */}
              {lead.intent_tier && (
                <span
                  className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1 shadow-xs ${lead.intent_tier === 'HIGH'
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : lead.intent_tier === 'MEDIUM'
                      ? 'bg-amber-50 text-amber-700 border-amber-300'
                      : 'bg-slate-50 text-slate-700 border-slate-300'
                    }`}
                  title={`Intent Score: ${lead.intent_score ?? 50}/100. ${lead.intent_reasons?.join(', ') || ''}`}
                >
                  {lead.intent_tier === 'HIGH' && <Flame size={12} className="text-rose-500 fill-rose-500" />}
                  {lead.intent_tier} INTENT ({lead.intent_score ?? 50}/100)
                </span>
              )}

              {/* 100-Mark Quality Audit Button */}
              <button
                type="button"
                onClick={() => setShowAuditModal(true)}
                className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary-dark border border-primary/20 shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
                title="View 100-Mark Sales Quality Audit Scorecard"
              >
                <Award size={12} className="text-primary" />
                <span>Audit: {lead.sales_audit?.total_score ?? 78}/100 M</span>
              </button>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-primary-dark">{lead.name}</h1>

            {lead.company && (
              <div className="text-sm font-semibold text-secondary flex items-center gap-1.5">
                <Building size={14} /> {lead.company}
              </div>
            )}
          </div>

          {/* Quick Stage Move Dropdown */}
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">
              Stage Selector
            </span>
            <select
              aria-label="Select pipeline stage"
              className="neo-btn-primary text-xs font-bold py-2 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md cursor-pointer"
              value={lead.status || 'new_enquiry'}
              onChange={(e) => handleStageSelectChange(e.target.value)}
            >
              {activeStages.map((s, idx) => (
                <option key={s.id} value={s.id} className="bg-transparent text-primary-dark font-medium">
                  {idx + 1}. {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Contact & Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-shadow-darker/10 text-xs">
          {/* Phone with 1-click WhatsApp web button */}
          <div className="p-2.5 rounded-xl bg-transparent border border-shadow-darker/5 flex items-center justify-between">
            <div>
              <span className="text-secondary font-medium block">Phone</span>
              <span className="font-bold text-primary-dark font-mono">{lead.phone || 'No phone'}</span>
            </div>
            {lead.phone && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/whatsapp-automation?leadId=${lead.id}&phone=${lead.phone}`
                    )
                  }
                  className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center gap-1 text-xs font-semibold"
                  title="Chat in WhatsApp Live Chat"
                >
                  <MessageSquare size={14} />
                  <span>Chat</span>
                </button>
                <a
                  href={`tel:${lead.phone}`}
                  className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-200 border border-slate-300 transition-colors"
                  title="Call Customer"
                >
                  <Phone size={14} />
                </a>
              </div>
            )}
          </div>

          <div className="p-2.5 rounded-xl bg-transparent border border-shadow-darker/5">
            <span className="text-secondary font-medium block">Quantity</span>
            <span className="font-bold text-primary-dark">
              {lead.required_quantity ? `🎯 ${lead.required_quantity} pieces` : 'Not specified'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
            <span className="text-emerald-800 font-medium block">Order Value</span>
            <span className="font-bold text-emerald-900">
              {lead.value ? `₹${Number(lead.value).toLocaleString('en-IN')}` : '₹0'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-transparent border border-shadow-darker/5">
            <span className="text-secondary font-medium block">Delivery Deadline</span>
            <span className="font-bold text-primary-dark">
              {lead.delivery_date ? `🚚 ${lead.delivery_date}` : 'TBD'}
            </span>
          </div>
        </div>
      </div>

      {/* VISUAL STAGE PROGRESS STEPPER (5 PHASES & 16 STAGES) */}
      <div className="neo-card space-y-3.5 bg-gradient-to-br from-slate-50/80 to-white border border-shadow-darker/10">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary-dark">
              Order Milestone Stepper
            </h2>
            <span className="text-xs text-secondary">
              (Stage {currentStageIndex + 1} of {activeStages.length}: <strong className="text-primary-dark">{currentStageLabel}</strong>)
            </span>
          </div>
          <span className="text-[11px] text-secondary">
            Click any milestone stage below to initiate manual transition & notification preview
          </span>
        </div>

        {/* 5 Phase Track */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {STAGE_PHASES.map((phase, pIdx) => {
            const hasCurrentStage = phase.stageIds.includes(lead.status || 'new_enquiry');
            const phaseFirstStageIndex = activeStages.findIndex((s) => phase.stageIds.includes(s.id));
            const isPhasePassed = currentStageIndex > phaseFirstStageIndex && !hasCurrentStage;

            return (
              <div
                key={phase.id}
                className={`p-2.5 rounded-xl border text-xs transition-all ${hasCurrentStage
                  ? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary/20'
                  : isPhasePassed
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-transparent border-slate-200 text-slate-500 opacity-80'
                  }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-extrabold text-[11px] truncate">{phase.shortLabel}</span>
                  {isPhasePassed ? (
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  ) : hasCurrentStage ? (
                    <span className="w-2 h-2 rounded-full bg-primary animate-ping shrink-0" />
                  ) : (
                    <span className="text-[10px] text-slate-400">P{pIdx + 1}</span>
                  )}
                </div>

                {/* Sub-stages chips */}
                <div className="flex items-center gap-1 flex-wrap">
                  {phase.stageIds.map((sId) => {
                    const stg = activeStages.find((s) => s.id === sId);
                    if (!stg) return null;
                    const stgIdx = activeStages.findIndex((s) => s.id === sId);
                    const isPassed = currentStageIndex > stgIdx;
                    const isCurrent = lead.status === sId || (stgIdx === 0 && !lead.status);

                    return (
                      <button
                        key={sId}
                        type="button"
                        onClick={() => handleStageSelectChange(sId)}
                        className={`text-[9px] px-1.5 py-0.5 rounded transition-all font-semibold truncate max-w-[85px] ${isCurrent
                          ? 'bg-primary text-white shadow-xs font-bold'
                          : isPassed
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-transparent text-slate-600 hover:bg-slate-200 border border-shadow-darker/5'
                          }`}
                        title={`Click to set stage to: ${stg.label}`}
                      >
                        {stg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
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

      {/* Company Intelligence Widget */}
      {((lead as any).company_intelligence || lead.company || lead.organization) && (
        <div className="neo-card space-y-3 bg-surface border border-shadow-darker/20 shadow-neo-surface">
          <div className="flex items-center justify-between gap-3 border-b border-shadow-darker/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Building size={16} className="text-primary" />
              <h2 className="text-sm font-bold text-primary-dark">Company Intelligence</h2>
            </div>

            <div className="flex items-center gap-2">
              {(lead as any).company_intelligence?.status === 'success' ? (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary-dark border border-primary/20 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Enriched
                </span>
              ) : (lead as any).company_intelligence?.status === 'not_found' ? (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Not Found
                </span>
              ) : null}

              <button
                onClick={handleEnrichCompany}
                disabled={isEnriching}
                className="text-[10px] font-bold px-2 py-1 rounded bg-primary text-white hover:bg-primary-dark flex items-center gap-1 disabled:opacity-50"
              >
                {isEnriching ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                {(lead as any).company_intelligence ? 'Re-enrich' : 'Enrich Data'}
              </button>
            </div>
          </div>

          {(lead as any).company_intelligence?.status === 'success' && (lead as any).company_intelligence?.data && (
            <div className="space-y-3">
              <div className="flex gap-4">
                {(lead as any).company_intelligence.data.logo_url && (
                  <div className="w-12 h-12 rounded-xl bg-white border border-shadow-darker/10 flex items-center justify-center shrink-0 p-1">
                    <img src={(lead as any).company_intelligence.data.logo_url} alt="Logo" className="w-full h-full object-contain" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-bold text-primary-dark">{(lead as any).company_intelligence.data.name}</h3>
                  <p className="text-xs text-secondary mt-1 line-clamp-3">
                    {(lead as any).company_intelligence.data.description}
                  </p>
                </div>
              </div>

              {(lead as any).company_intelligence.data.website && (
                <div className="pt-2 border-t border-shadow-darker/5">
                  <a href={(lead as any).company_intelligence.data.website} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                    <ExternalLink size={12} /> Visit Website
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* Tab Navigation Ribbon */}
      <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-2 flex-wrap">
        <button
          onClick={() => setActiveTab('artwork')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'artwork'
            ? 'bg-primary text-white shadow-sm'
            : 'text-secondary hover:text-primary-dark hover:bg-transparent'
            }`}
        >
          <Palette size={14} /> Creative Brief &amp; Artwork
        </button>

        <button
          onClick={() => setActiveTab('details')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'details'
            ? 'bg-primary text-white shadow-sm'
            : 'text-secondary hover:text-primary-dark hover:bg-transparent'
            }`}
        >
          <Award size={14} /> Customer &amp; Order Specs
        </button>

        <button
          onClick={() => setActiveTab('production')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'production'
            ? 'bg-primary text-white shadow-sm'
            : 'text-secondary hover:text-primary-dark hover:bg-transparent'
            }`}
        >
          <Factory size={14} /> Production Specs &amp; Logistics
        </button>

        <button
          onClick={() => setActiveTab('sales_guide')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'sales_guide'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-sm'
            : 'text-secondary hover:text-primary-dark hover:bg-transparent'
            }`}
        >
          <BookOpen size={14} /> AI Sales Guide & Playbook
        </button>

        <button
          onClick={() => setActiveTab('notes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'notes'
            ? 'bg-primary text-white shadow-sm'
            : 'text-secondary hover:text-primary-dark hover:bg-transparent'
            }`}
        >
          <StickyNote size={14} /> Notes & Reminders ({leadNotes.length || lead.notes_count || 0})
        </button>

        <button
          onClick={() => setActiveTab('quotation')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'quotation'
            ? 'bg-primary text-white shadow-sm'
            : 'text-secondary hover:text-primary-dark hover:bg-transparent'
            }`}
        >
          <FileText size={14} /> Quotations ({leadQuotations.length})
        </button>

        <button
          onClick={() => setActiveTab('conversation')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'conversation'
            ? 'bg-primary text-white shadow-sm'
            : 'text-secondary hover:text-primary-dark hover:bg-transparent'
            }`}
        >
          <MessageSquare size={14} /> Omnichannel Chat ({messages.length})
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'history'
            ? 'bg-primary text-white shadow-sm'
            : 'text-secondary hover:text-primary-dark hover:bg-transparent'
            }`}
        >
          <History size={14} /> Stage History ({stageHistoryList.length + notificationHistoryList.length})
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

      {/* DEDICATED CREATIVE BRIEF & ARTWORK TAB */}
      {activeTab === 'artwork' && (
        <div className="space-y-5 animate-fade-in">
          {/* Header Action Banner */}
          <div className="neo-card bg-surface border border-shadow-darker/30 shadow-neo-surface space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary-dark flex items-center gap-1.5">
                    <Palette size={14} className="text-primary" /> Creative Brief &amp; Design Specifications
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-primary/10 text-primary-dark border border-primary/20">
                    17 Parameters
                  </span>
                </div>
                <h2 className="text-lg font-bold text-primary-dark mt-1">
                  Design Requirements for {lead.company || lead.name}
                </h2>
                <p className="text-xs text-secondary mt-0.5">
                  Designer: <strong className="text-primary-dark">{lead.design_person || 'Unassigned'}</strong> • Sales: <strong className="text-primary-dark">{lead.sales_person || 'Sales Team'}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/trophy-creator?leadId=${lead.id}&leadName=${encodeURIComponent(
                        lead.name || ''
                      )}&company=${encodeURIComponent(lead.company || '')}`
                    )
                  }
                  className="neo-btn text-xs px-3.5 py-1.5 font-bold text-amber-900 border border-amber-300 bg-amber-50 hover:bg-amber-100 flex items-center gap-1.5 shadow-2xs"
                  title="Launch AI Trophy Design Creator with Lead details"
                >
                  <Sparkles size={13} className="text-amber-600" />
                  <span>✨ AI Trophy Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => lead && printDesignTeamChecklist(lead)}
                  className="neo-btn text-xs px-3.5 py-1.5 font-bold text-secondary hover:text-primary-dark border border-shadow-darker/30 flex items-center gap-1.5 shadow-2xs"
                  title="Print Design Team Checklist with details provided by Sales"
                >
                  <Printer size={13} className="text-primary" />
                  <span>Print Design Checklist</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProductionSpecsMode('edit');
                    setShowProductionSpecsModal(true);
                  }}
                  className="neo-btn text-xs px-3.5 py-1.5 font-bold text-primary-dark hover:text-primary border border-primary/20 bg-primary/10 hover:bg-primary/20 flex items-center gap-1.5 transition-colors shadow-2xs"
                  title="Specify 9 manufacturing requirements and hand off to Production Pipeline"
                >
                  <Factory size={13} className="text-primary" />
                  <span>🏭 + Add Details for Production</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditBriefModal(true)}
                  className="neo-btn-primary text-xs px-3.5 py-1.5 font-bold flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white shadow-xs"
                >
                  <Palette size={13} />
                  <span>Edit Creative Brief</span>
                </button>
                {(userRole === 'design' || isAdmin) && (
                  <Link
                    to="/pipeline?pipeline=design_pipeline"
                    className="neo-btn text-xs px-3.5 py-1.5 font-bold text-primary-dark hover:text-primary border border-shadow-darker/30 flex items-center gap-1.5"
                  >
                    <ExternalLink size={13} />
                    <span>Design Pipeline</span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* 17-Point Design Specifications Card */}
          <div className="neo-card border border-shadow-darker/25 shadow-neo-surface space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-darker/15 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-primary-dark flex items-center gap-1.5">
                <Sparkles size={14} className="text-primary" /> Physical &amp; Creative Specifications
              </h3>
            </div>

            {/* Micro specs grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-surface border border-shadow-darker/15 shadow-2xs">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block mb-0.5">
                  1. Size / Dimensions
                </span>
                <span className="font-bold text-primary-dark">
                  {lead.trophy_size || 'To be specified'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface border border-shadow-darker/15 shadow-2xs">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block mb-0.5">
                  2. Shape / Silhouette
                </span>
                <span className="font-bold text-primary-dark">
                  {lead.shapes || lead.trophy_type || 'Custom Cut'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface border border-shadow-darker/15 shadow-2xs">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block mb-0.5">
                  3. Material
                </span>
                <span className="font-bold text-primary-dark">
                  {lead.material || 'Acrylic / Wood'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface border border-shadow-darker/15 shadow-2xs">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block mb-0.5">
                  4. Theme / Occasion
                </span>
                <span className="font-bold text-primary-dark">
                  {lead.theme || lead.event_name || 'Standard'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface border border-shadow-darker/15 shadow-2xs">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block mb-0.5">
                  5. Quantity
                </span>
                <span className="font-bold text-primary-dark">
                  {lead.required_quantity ? `${lead.required_quantity} pcs` : 'TBD'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface border border-shadow-darker/15 shadow-2xs">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block mb-0.5">
                  6. Budget / Value
                </span>
                <span className="font-bold text-primary-dark">
                  {lead.value ? `₹${lead.value.toLocaleString('en-IN')}` : lead.budget || 'Custom'}
                </span>
              </div>
            </div>

            {/* Concept, Variants & Brand Colors */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-surface border border-shadow-darker/10 md:col-span-2 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  7. Concept &amp; Creative Instructions
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {lead.concept || lead.concept_notes || lead.design_notes || 'No custom concept notes entered yet. Click "Edit Creative Brief" to add.'}
                </p>
                {lead.model_variants && (
                  <div className="pt-2 border-t border-shadow-darker/10 text-xs">
                    <strong className="text-slate-500 font-semibold">8. Models / Variants:</strong>{' '}
                    <span className="text-slate-800 dark:text-slate-200 font-medium">{lead.model_variants}</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-shadow-darker/10 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  9. Brand Colors
                </span>
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  {lead.brand_colors || 'No specific colors specified'}
                </p>
                <div className="pt-2 border-t border-shadow-darker/10 space-y-1 text-xs">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">10. Design Deadline:</span>
                    <strong className="text-amber-700">{lead.design_deadline || 'Not set'}</strong>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">11. Production Target:</span>
                    <strong className="text-slate-700 dark:text-slate-200">{lead.production_deadline || 'Not set'}</strong>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">12. Delivery Deadline:</span>
                    <strong className="text-slate-700 dark:text-slate-200">{lead.delivery_date || 'Not set'}</strong>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">13. Event Date:</span>
                    <strong className="text-slate-700 dark:text-slate-200">{lead.event_date || 'Not set'}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Assets: Logo & References */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {/* 14. Customer Logo */}
              <div className="p-3 rounded-xl border border-shadow-darker/10 bg-slate-50 dark:bg-slate-900/40">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  14. Customer Logo
                </span>
                {lead.artwork_url ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={lead.artwork_url}
                      alt="Logo"
                      className="w-16 h-16 object-contain rounded-lg border border-shadow-darker/20 bg-white p-1"
                    />
                    <div className="space-y-1">
                      <a
                        href={lead.artwork_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                      >
                        <Download size={12} /> Download Original Logo
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No logo uploaded yet.</p>
                )}
              </div>

              {/* 15. Reference Designs */}
              <div className="p-3 rounded-xl border border-shadow-darker/10 bg-slate-50 dark:bg-slate-900/40">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  15. Reference Designs ({Array.isArray(lead.reference_designs) ? lead.reference_designs.length : 0})
                </span>
                {Array.isArray(lead.reference_designs) && lead.reference_designs.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {lead.reference_designs.map((refUrl, idx) => (
                      <a
                        key={idx}
                        href={refUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-14 h-14 rounded-lg overflow-hidden border border-shadow-darker/20 shrink-0 bg-white"
                      >
                        <img src={refUrl} alt={`Ref ${idx + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No reference images attached.</p>
                )}
              </div>
            </div>

            {/* 16 & 17: Company & Contact Information */}
            <div className="p-3 rounded-xl border border-shadow-darker/10 bg-slate-50 dark:bg-slate-900/40 text-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                16 &amp; 17. Company &amp; Contact Details
              </span>
              <div className="flex flex-wrap items-center gap-4 text-slate-700 dark:text-slate-200">
                <span><strong>Company:</strong> {lead.company || lead.name}</span>
                <span><strong>Contact Person:</strong> {lead.name}</span>
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="text-primary font-mono hover:underline">
                    📞 {lead.phone}
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                    ✉️ {lead.email}
                  </a>
                )}
              </div>
            </div>

            {/* Production Team Handoff & Manufacturing Requirements Card */}
            <div className="p-4 rounded-2xl bg-surface border border-shadow-darker/25 shadow-neo-surface space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-shadow-darker/15 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary-dark">
                    <Factory size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-primary-dark uppercase tracking-wide">
                      Production Team Handoff &amp; Manufacturing Requirements
                    </h3>
                    <p className="text-[11px] text-secondary">
                      Provide the 9 manufacturing and dispatch specifications before transferring the order to the factory floor.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProductionSpecsMode('edit');
                    setShowProductionSpecsModal(true);
                  }}
                  className="neo-btn-primary text-xs px-4 py-2 font-bold bg-primary text-white hover:bg-primary-dark inline-flex items-center gap-1.5 shadow-xs shrink-0"
                >
                  ✏️ Fill / Edit Details for Production
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs text-primary-dark">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-shadow-darker/10">
                  <span className="text-[10px] text-secondary font-bold uppercase block mb-0.5">1. Trophy Size</span>
                  <span className="font-semibold">{lead.trophy_size || 'Pending size'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-shadow-darker/10">
                  <span className="text-[10px] text-secondary font-bold uppercase block mb-0.5">3. Materials to Use</span>
                  <span className="font-semibold">{lead.trophy_materials_used || lead.material || 'Pending materials'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-shadow-darker/10">
                  <span className="text-[10px] text-secondary font-bold uppercase block mb-0.5">5. Single Box Size</span>
                  <span className="font-semibold">{lead.single_box_size || 'Not specified'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-shadow-darker/10">
                  <span className="text-[10px] text-secondary font-bold uppercase block mb-0.5">7. Delivery Mode</span>
                  <span className="font-semibold">{lead.delivery_mode ? lead.delivery_mode.replace(/_/g, ' ') : 'Courier'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED SALES GUIDE TAB */}
      {activeTab === 'sales_guide' && (
        <div className="space-y-4">
          <ContextualSalesGuide
            lead={lead}
            onApplyReply={(text) => {
              setComposerText(text);
              setActiveTab('conversation');
            }}
          />
        </div>
      )}

      {/* DEDICATED PRODUCTION TEAM WORKSPACE TAB */}
      {activeTab === 'production' && (
        <div className="neo-card space-y-6">
          {/* Header Banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-surface/40 border border-shadow-darker/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary-dark">
                <Factory size={22} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-primary-dark tracking-tight">
                  Production Specifications &amp; Manufacturing
                </h3>
                <p className="text-xs text-secondary">
                  Targeted production requirements, raw materials stock, packaging specifications, and logistics.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowProductionProgressModal(true)}
                className="neo-btn-primary px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-dark flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={14} /> Log Pieces &amp; Steps
              </button>
              <button
                type="button"
                onClick={() => setShowProductionSpecsModal(true)}
                className="neo-btn px-4 py-2 text-xs font-bold text-primary-dark border-primary/20 hover:bg-primary/5 flex items-center gap-1.5"
              >
                ✏️ Edit Production Specs
              </button>
              <button
                type="button"
                onClick={() => lead && printProductionTeamChecklist(lead)}
                className="neo-btn px-4 py-2 text-xs font-bold text-secondary hover:text-primary-dark border border-shadow-darker/30 flex items-center gap-1.5"
                title="Print clean 1-page Production Team Checklist with 9 manufacturing specifications"
              >
                🖨️ Print Production Checklist
              </button>
            </div>
          </div>

          {/* Project-Based Manufacturing Progress by Quantity Section */}
          <div className="p-4 rounded-2xl bg-surface border border-shadow-darker/25 shadow-neo-surface space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-shadow-darker/15 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary-dark">
                  <TrendingUp size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-primary-dark uppercase tracking-wide">
                    Project Manufacturing Progress by Quantity
                  </h3>
                  <p className="text-[11px] text-secondary">
                    Live piece count tracking across cutting, printing, base assembly, and finishing steps.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs text-secondary font-bold block">Overall Completion</span>
                  <span className="text-sm font-mono font-extrabold text-primary">
                    {lead.production_overall_progress || 0}% Complete
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProductionProgressModal(true)}
                  className="neo-btn-primary text-xs px-3.5 py-1.5 font-bold bg-primary text-white hover:bg-primary-dark inline-flex items-center gap-1 shadow-xs"
                >
                  <Plus size={13} /> + Record Piece Count
                </button>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden shadow-inner">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${lead.production_overall_progress || 0}%` }}
              />
            </div>

            {/* Step-by-Step Breakdown Cards */}
            {lead.production_batch_stages && lead.production_batch_stages.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                {lead.production_batch_stages.map((stage) => {
                  const pct =
                    stage.target_quantity > 0
                      ? Math.min(100, Math.round((stage.completed_quantity / stage.target_quantity) * 100))
                      : 0;
                  const isDone = stage.completed_quantity >= stage.target_quantity;
                  return (
                    <div
                      key={stage.id}
                      className={`p-2.5 rounded-xl border text-xs space-y-1.5 ${
                        isDone ? 'bg-primary/5 border-primary/20' : 'bg-slate-50 dark:bg-slate-900/40 border-shadow-darker/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <strong className="text-primary-dark line-clamp-1">{stage.name}</strong>
                        <span className="font-mono font-bold text-primary shrink-0">
                          {stage.completed_quantity} / {stage.target_quantity} pcs
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-secondary">
                        <span>{pct}% complete</span>
                        <span>{Math.max(0, stage.target_quantity - stage.completed_quantity)} pcs left</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-secondary italic text-center py-2">
                Workflow steps initialized for order ({lead.required_quantity || 100} pcs). Click "+ Record Piece Count" to log daily progress.
              </div>
            )}
          </div>

          {/* 9 Targeted Production Parameters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Size */}
            <div className="p-4 rounded-xl border border-shadow-darker/10 bg-slate-50/80 dark:bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Shapes size={14} className="text-primary" /> 1. Trophy Size / Dimensions
                </span>
              </div>
              <p className="text-sm font-bold text-primary-dark">
                {lead.trophy_size || 'Not specified'}
              </p>
              <p className="text-[11px] text-slate-500">Exact physical height / dimensions for tooling and cutting</p>
            </div>

            {/* 2. Production Deadline */}
            <div className="p-4 rounded-xl border border-shadow-darker/10 bg-slate-50/80 dark:bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-tertiary" /> 2. Production Deadline
                </span>
              </div>
              <p className="text-sm font-bold text-tertiary">
                {lead.production_deadline || lead.delivery_date ? formatDate(lead.production_deadline || lead.delivery_date) : 'Pending Timeline'}
              </p>
              <p className="text-[11px] text-slate-500">Required manufacturing completion date before dispatch</p>
            </div>

            {/* 3. Materials to Use */}
            <div className="p-4 rounded-xl border border-shadow-darker/10 bg-slate-50/80 dark:bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Layers size={14} className="text-primary" /> 3. Materials to Use in Trophy
                </span>
              </div>
              <p className="text-sm font-bold text-primary-dark">
                {lead.trophy_materials_used || lead.material || 'Standard Trophy Materials'}
              </p>
              <p className="text-[11px] text-slate-500">Wood, Acrylic, Brass, Crystal, MDF, Recycled composite, etc.</p>
            </div>

            {/* 4. Stock / Materials to Buy */}
            <div className="p-4 rounded-xl border border-shadow-darker/10 bg-slate-50/80 dark:bg-slate-900/40 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Box size={14} className="text-primary" /> 4. Raw Material Stock Status
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${lead.materials_stock_status === 'in_stock'
                  ? 'bg-primary/10 text-primary-dark border border-primary/20'
                  : lead.materials_stock_status === 'need_to_buy'
                    ? 'bg-tertiary/15 text-tertiary border border-tertiary/30'
                    : lead.materials_stock_status === 'ordered'
                      ? 'bg-secondary/15 text-secondary border border-secondary/30'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                  {lead.materials_stock_status ? lead.materials_stock_status.replace(/_/g, ' ') : 'Check Stock'}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-shadow-darker/10 text-xs text-slate-700 dark:text-slate-200">
                <strong className="text-[10px] uppercase text-secondary block mb-0.5">Purchases Required:</strong>
                {lead.materials_to_buy || 'No custom purchase requirement specified.'}
              </div>
            </div>

            {/* 5. Packing Single Box Size */}
            <div className="p-4 rounded-xl border border-shadow-darker/10 bg-slate-50/80 dark:bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Box size={14} className="text-primary" /> 5. Single Box Packing Size
                </span>
              </div>
              <p className="text-sm font-bold text-primary-dark">
                {lead.single_box_size || 'Standard individual box'}
              </p>
              <p className="text-[11px] text-slate-500">Dimensions of the individual presentation / inner box</p>
            </div>

            {/* 6. Whole Box / Master Carton Size */}
            <div className="p-4 rounded-xl border border-shadow-darker/10 bg-slate-50/80 dark:bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Box size={14} className="text-primary" /> 6. Whole Box / Master Carton Size
                </span>
              </div>
              <p className="text-sm font-bold text-primary-dark">
                {lead.master_box_size || 'Standard corrugated master carton'}
              </p>
              <p className="text-[11px] text-slate-500">Outer packaging specifications for transit safety</p>
            </div>

            {/* 7. Delivery Mode & Transport Details */}
            <div className="p-4 rounded-xl border border-shadow-darker/10 bg-slate-50/80 dark:bg-slate-900/40 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Truck size={14} className="text-primary" /> 7. Logistics &amp; Transport Mode
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary-dark border border-primary/20">
                  {lead.delivery_mode ? lead.delivery_mode.replace(/_/g, ' ') : 'Standard Courier'}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-shadow-darker/10 text-xs text-slate-700 dark:text-slate-200">
                <strong className="text-[10px] uppercase text-secondary block mb-0.5">Transit / Booking Notes:</strong>
                {lead.delivery_details || 'Dispatch via preferred transport partner (Courier, Bus, Flight or Train).'}
              </div>
            </div>

            {/* 8. Delivery Location */}
            <div className="p-4 rounded-xl border border-shadow-darker/10 bg-slate-50/80 dark:bg-slate-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-primary" /> 8. Delivery Destination Address
                </span>
              </div>
              <p className="text-sm font-bold text-primary-dark">
                {lead.delivery_location || lead.location || 'Customer pickup or address pending'}
              </p>
              <p className="text-[11px] text-slate-500">Final factory dispatch destination</p>
            </div>

            {/* 9. Prototype Status & Physical Sample */}
            <div className="p-4 rounded-xl border border-shadow-darker/10 bg-slate-50/80 dark:bg-slate-900/40 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Award size={14} className="text-primary" /> 9. Prototype / Sample Status
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${lead.prototype_status === 'client_approved' || lead.prototype_status === 'sample_ready'
                  ? 'bg-primary/10 text-primary-dark border border-primary/20'
                  : lead.prototype_status === 'sample_in_progress' || lead.prototype_status === 'needed'
                    ? 'bg-tertiary/15 text-tertiary border border-tertiary/30'
                    : 'bg-slate-100 text-slate-600'
                  }`}>
                  {lead.prototype_status ? lead.prototype_status.replace(/_/g, ' ') : 'Not Required'}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-shadow-darker/10 text-xs text-slate-700 dark:text-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="line-clamp-2">{lead.prototype_notes || 'No prototype notes logged.'}</span>
                  {lead.prototype_photo_url && (
                    <a
                      href={lead.prototype_photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 rounded-md overflow-hidden border border-shadow-darker/20 shrink-0 bg-slate-100"
                    >
                      <img src={lead.prototype_photo_url} alt="Prototype" className="w-full h-full object-cover" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: SECTIONAL CUSTOMER & ORDER DETAILS FORM */}
      {activeTab === 'details' && (
        <div className="space-y-5">
          {/* Quick Contextual Sales Guide Banner */}
          <ContextualSalesGuide
            lead={lead}
            onApplyReply={(text) => {
              setComposerText(text);
              setActiveTab('conversation');
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Section 1: Contact & Organization */}
            <div className="neo-card space-y-3.5">
              <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-2">
                <Building size={16} className="text-primary" />
                <h3 className="text-xs font-bold text-primary-dark uppercase tracking-wider">
                  Contact & Organization
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-primary-dark block mb-1">Customer Name</label>
                  <input
                    type="text"
                    className="neo-input w-full"
                    placeholder="Customer full name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-primary-dark block mb-1">Company / Organization</label>
                  <input
                    type="text"
                    className="neo-input w-full"
                    placeholder="e.g. Acme Corp / Rotary Club"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-primary-dark block mb-1">Phone Number</label>
                  <input
                    type="text"
                    className="neo-input w-full font-mono"
                    placeholder="10-digit mobile number"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-primary-dark block mb-1">Email Address</label>
                  <input
                    type="email"
                    className="neo-input w-full"
                    placeholder="customer@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-primary-dark block mb-1">Location / City</label>
                  <input
                    type="text"
                    className="neo-input w-full"
                    placeholder="City, State"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Trophy & Requirement Specifications */}
            <div className="neo-card space-y-3.5">
              <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-2">
                <Award size={16} className="text-primary" />
                <h3 className="text-xs font-bold text-primary-dark uppercase tracking-wider">
                  Trophy & Requirement Specifications
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-emerald-800 block mb-1">
                    Required Quantity (Pieces)
                  </label>
                  <input
                    type="number"
                    className="neo-input w-full font-bold text-emerald-900 border-emerald-300"
                    placeholder="e.g. 50"
                    value={form.required_quantity}
                    onChange={(e) => setForm({ ...form, required_quantity: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-emerald-800 block mb-1">
                    Estimated Deal Value (₹)
                  </label>
                  <input
                    type="number"
                    className="neo-input w-full font-bold text-emerald-900 border-emerald-300"
                    placeholder="e.g. 35000"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-primary-dark block mb-1">
                    Trophy Size / Material
                  </label>
                  <input
                    type="text"
                    className="neo-input w-full"
                    placeholder="e.g. 8 inch Wooden / Crystal Star"
                    value={form.trophy_size}
                    onChange={(e) => setForm({ ...form, trophy_size: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-primary-dark block mb-1">
                    Order Reason / Notes
                  </label>
                  <textarea
                    className="neo-input w-full min-h-[70px] resize-y"
                    placeholder="Additional customer specifications or notes..."
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Event & Delivery Logistics */}
            <div className="neo-card space-y-3.5">
              <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-2">
                <Truck size={16} className="text-primary" />
                <h3 className="text-xs font-bold text-primary-dark uppercase tracking-wider">
                  Event & Delivery Logistics
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-primary-dark block mb-1">Event Name</label>
                  <input
                    type="text"
                    className="neo-input w-full"
                    placeholder="e.g. Annual Sports Meet 2026"
                    value={form.event_name}
                    onChange={(e) => setForm({ ...form, event_name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-primary-dark block mb-1">Event Date</label>
                  <input
                    type="text"
                    className="neo-input w-full"
                    placeholder="e.g. 24 Oct 2026"
                    value={form.event_date}
                    onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-amber-900 block mb-1">
                    Delivery Deadline
                  </label>
                  <input
                    type="text"
                    className="neo-input w-full font-semibold text-amber-950 border-amber-300"
                    placeholder="e.g. 20 Oct 2026"
                    value={form.delivery_date}
                    onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-primary-dark block mb-1">
                    Shipment Tracking Number
                  </label>
                  <input
                    type="text"
                    className="neo-input w-full font-mono"
                    placeholder="e.g. ST49201928 / Bluedart"
                    value={form.tracking_number}
                    onChange={(e) => setForm({ ...form, tracking_number: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Ownership, Follow-up & Source */}
            <div className="neo-card space-y-3.5">
              <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-2">
                <User size={16} className="text-primary" />
                <h3 className="text-xs font-bold text-primary-dark uppercase tracking-wider">
                  Ownership, Follow-up & Source
                </h3>
              </div>

              <div className="space-y-3 text-xs">
                {isAdmin && (
                  <div>
                    <label className="font-bold text-primary-dark block mb-1">
                      Assigned Team Member (Admin Only)
                    </label>
                    <select
                      className="neo-input w-full font-semibold"
                      value={form.owner_id}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const matchedUser = users.find((u) => u.id === nextId);
                        setForm({
                          ...form,
                          owner_id: nextId,
                          sales_person: matchedUser ? matchedUser.name || matchedUser.email : '',
                        });
                      }}
                    >
                      <option value="">Unassigned</option>
                      {users
                        .filter((u) => u.is_active !== false)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.email} ({u.role.toUpperCase()})
                          </option>
                        ))}
                    </select>
                    {form.sales_person && !users.some((u) => u.id === form.owner_id) && (
                      <p className="text-[10px] text-secondary mt-1">Current label: {form.sales_person}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="font-bold text-primary-dark block mb-1">Assigned Design Person</label>
                  <input
                    type="text"
                    className="neo-input w-full"
                    placeholder="Designer name"
                    value={form.design_person}
                    onChange={(e) => setForm({ ...form, design_person: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-bold text-primary-dark block mb-1">Next Follow-up Date</label>
                  <input
                    type="date"
                    className="neo-input w-full font-medium"
                    value={form.next_follow_up_date}
                    onChange={(e) => setForm({ ...form, next_follow_up_date: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-primary-dark block mb-1">Source</label>
                    <input
                      type="text"
                      className="neo-input w-full"
                      placeholder="e.g. WhatsApp, Meta"
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-primary-dark block mb-1">Campaign</label>
                    <input
                      type="text"
                      className="neo-input w-full"
                      placeholder="e.g. Diwali Promo"
                      value={form.campaign}
                      onChange={(e) => setForm({ ...form, campaign: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
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

      {/* TAB 2: INLINE LIVE NOTES & REMINDERS WORKSPACE */}
      {activeTab === 'notes' && (
        <div className="space-y-5">
          {/* Add Inline Note Form */}
          <div className="neo-card space-y-3">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-2.5">
              <h2 className="text-xs font-bold text-primary-dark flex items-center gap-2 uppercase tracking-wider">
                <StickyNote size={15} className="text-primary" />
                Add Internal Note & Follow-up
              </h2>
              <button
                type="button"
                onClick={() => setNotesDrawerOpen(true)}
                className="text-xs text-primary hover:underline font-bold flex items-center gap-1"
              >
                <span>Open Audio Dictation & Calendar Sync Drawer</span>
                <ExternalLink size={12} />
              </button>
            </div>

            <form onSubmit={handleAddInlineNote} className="space-y-3">
              <textarea
                className="neo-input w-full text-xs min-h-[80px] resize-y"
                placeholder={`Type notes regarding ${lead.name}'s requirements, stage updates, or call summaries...`}
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                required
              />

              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-secondary font-bold">Category:</span>
                    <select
                      aria-label="Note Category"
                      className="neo-input !py-1 !px-2 text-xs"
                      value={newNoteCategory}
                      onChange={(e) => setNewNoteCategory(e.target.value as NoteCategory)}
                    >
                      <option value="general">📝 General</option>
                      <option value="call">📞 Call Log</option>
                      <option value="whatsapp">💬 WhatsApp</option>
                      <option value="requirement">🎯 Requirement</option>
                      <option value="urgent">🚨 Urgent</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-secondary font-bold">Priority:</span>
                    <select
                      aria-label="Note Priority"
                      className="neo-input !py-1 !px-2 text-xs"
                      value={newNotePriority}
                      onChange={(e) => setNewNotePriority(e.target.value as NotePriority)}
                    >
                      <option value="low">🌱 Low</option>
                      <option value="medium">⚡ Medium</option>
                      <option value="high">🔥 High</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={addingNote || !newNoteContent.trim()}
                  className="neo-btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md disabled:opacity-50"
                >
                  {addingNote ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Add Note
                </button>
              </div>
            </form>
          </div>

          {/* Notes Stream */}
          <div className="neo-card space-y-3">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-2.5">
              <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider">
                Note History ({leadNotes.length})
              </h2>
              <span className="text-xs text-secondary">
                Most recent and pinned notes for {lead.name}
              </span>
            </div>

            {leadNotes.length === 0 ? (
              <div className="py-12 text-center text-xs text-secondary border border-dashed border-shadow-darker/15 rounded-xl">
                No notes logged yet. Use the form above or the drawer to add call logs, customer requests, or follow-up reminders.
              </div>
            ) : (
              <div className="space-y-3">
                {leadNotes.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-2xl border text-xs space-y-2 transition-all ${n.is_pinned
                      ? 'bg-amber-50/50 border-amber-200'
                      : 'bg-transparent border-shadow-darker/10'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-primary-dark">{n.author_name}</span>
                        <span className="text-[10px] text-secondary">•</span>
                        <span className="text-[10px] text-secondary">{formatDate(n.created_at)}</span>

                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-transparent border border-shadow-darker/15 text-slate-700">
                          {n.category || 'General'}
                        </span>

                        {n.priority === 'high' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-200">
                            High Priority
                          </span>
                        )}

                        {n.stage_name && (
                          <span className="text-[9px] text-secondary">Stage: {n.stage_name}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(n.id, !!n.is_pinned)}
                          className={`p-1 rounded hover:bg-transparent text-secondary ${n.is_pinned ? 'text-amber-600' : 'hover:text-primary'
                            }`}
                          title={n.is_pinned ? 'Unpin note' : 'Pin note to top'}
                        >
                          <Pin size={13} className={n.is_pinned ? 'fill-amber-500' : ''} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteInlineNote(n.id)}
                          className="p-1 rounded hover:bg-rose-50 text-secondary hover:text-rose-600"
                          title="Delete note"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{n.content}</p>

                    {n.has_reminder && n.reminder_datetime && (
                      <div className="pt-1.5 border-t border-shadow-darker/5 flex items-center justify-between text-[10px] text-secondary">
                        <span className="flex items-center gap-1 font-semibold text-emerald-800">
                          <Bell size={11} /> Reminder: {formatDate(n.reminder_datetime)}
                        </span>
                        <span className="capitalize">{n.reminder_status || 'scheduled'}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LINKED QUOTATIONS & ESTIMATES */}
      {activeTab === 'quotation' && (
        <div className="neo-card space-y-4">
          <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
                <FileText size={16} className="text-primary" />
                Linked Quotations ({leadQuotations.length})
              </h2>
              <p className="text-xs text-secondary mt-0.5">
                Estimates and formal quotations generated for {lead.name}.
              </p>
            </div>

            <Link
              to={`/quotations/new?lead_id=${lead.id}&name=${encodeURIComponent(lead.name)}&phone=${encodeURIComponent(
                lead.phone || ''
              )}&company=${encodeURIComponent(lead.company || '')}`}
              className="neo-btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
            >
              <Plus size={14} /> Create New Quotation
            </Link>
          </div>

          {leadQuotations.length === 0 ? (
            <div className="py-12 text-center text-xs text-secondary border border-dashed border-shadow-darker/15 rounded-xl space-y-3">
              <FileText size={32} className="mx-auto text-secondary/40" />
              <p className="font-semibold text-primary-dark">No quotations created for this customer yet.</p>
              <p className="text-[11px] text-secondary max-w-sm mx-auto">
                Generate a branded PDF quotation with custom line items, advance payment tracking, and GST calculations in 1-click.
              </p>
              <Link
                to={`/quotations/new?lead_id=${lead.id}&name=${encodeURIComponent(lead.name)}&phone=${encodeURIComponent(
                  lead.phone || ''
                )}&company=${encodeURIComponent(lead.company || '')}`}
                className="neo-btn text-xs px-4 py-1.5 font-bold inline-flex items-center gap-1 text-primary"
              >
                <Plus size={13} /> Draft Quotation Now
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left hidden md:table">
                <thead>
                  <tr className="border-b border-shadow-darker/10 text-secondary">
                    <th className="py-2.5 px-3 font-bold">Quote #</th>
                    <th className="py-2.5 px-3 font-bold">Date</th>
                    <th className="py-2.5 px-3 font-bold">Items Summary</th>
                    <th className="py-2.5 px-3 font-bold">Total Value</th>
                    <th className="py-2.5 px-3 font-bold">Advance Status</th>
                    <th className="py-2.5 px-3 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-shadow-darker/5">
                  {leadQuotations.map((q: any) => (
                    <tr key={q.id} className="hover:bg-transparent transition-colors">
                      <td className="py-3 px-3 font-bold text-primary-dark">
                        {q.number || 'Draft Quote'}
                      </td>
                      <td className="py-3 px-3 text-secondary">{formatDate(q.created_at)}</td>
                      <td className="py-3 px-3 text-slate-700">
                        {q.items?.length
                          ? `${q.items.length} item(s) (${q.items[0]?.description || 'Custom Trophy'})`
                          : 'General Estimate'}
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-800">
                        ₹{(q.grand_total || q.total_amount || q.total || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-3">
                        {q.advance_amount ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ₹{q.advance_amount} Adv Paid
                          </span>
                        ) : (
                          <span className="text-secondary text-[10px]">No advance recorded</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          to={`/quotations/edit/${q.id}`}
                          className="neo-btn text-[11px] px-3 py-1 font-bold inline-flex items-center gap-1 text-primary"
                        >
                          View / Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-shadow-darker/10">
                {leadQuotations.map((q: any) => (
                  <div key={q.id} className="py-4 space-y-3">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="font-bold text-primary-dark">{q.number || 'Draft Quote'}</div>
                        <div className="text-[10px] text-secondary mt-0.5">{formatDate(q.created_at)}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-emerald-800">
                          ₹{(q.grand_total || q.total_amount || q.total || 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>

                    <div className="bg-shadow-darker/5 p-2 rounded-lg text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-secondary font-medium">Items:</span>
                        <span className="text-slate-700 truncate max-w-[150px]">
                          {q.items?.length
                            ? `${q.items.length} item(s) (${q.items[0]?.description || 'Custom Trophy'})`
                            : 'General Estimate'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary font-medium">Advance:</span>
                        <span>
                          {q.advance_amount ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              ₹{q.advance_amount} Adv Paid
                            </span>
                          ) : (
                            <span className="text-secondary text-[10px]">No advance recorded</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Link
                        to={`/quotations/edit/${q.id}`}
                        className="neo-btn text-[11px] px-4 py-1.5 font-bold inline-flex items-center gap-1 text-primary w-full justify-center"
                      >
                        View / Edit
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: OMNICHANNEL CONVERSATION FEED */}
      {activeTab === 'conversation' && (
        <div className="space-y-6">
          <div className="neo-card space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-xs font-bold text-primary-dark flex items-center gap-2 uppercase tracking-wider">
                  <MessageSquare size={16} className="text-primary" />
                  Meta Omnichannel Conversation History
                </h2>
                <p className="text-xs text-secondary mt-0.5">
                  Unified communication timeline across WhatsApp, Facebook Messenger, Lead Ads, and Instagram.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-transparent text-slate-700 border border-slate-200">
                {messages.length} messages
              </span>
            </div>

            {/* Message Stream */}
            {messages.length === 0 ? (
              <div className="py-12 text-center text-xs text-secondary space-y-2">
                <MessageSquare size={32} className="mx-auto text-secondary/40 animate-pulse" />
                <p className="font-semibold text-primary-dark">No Meta messages recorded for this lead yet.</p>
                <p className="text-[11px] text-secondary max-w-sm mx-auto">
                  Enquiries received through WhatsApp Webhooks, Facebook Messenger, Instagram, or Lead Ads will automatically appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[450px] overflow-y-auto p-2 bg-transparent rounded-xl border border-shadow-darker/5">
                {messages.map((m: any, idx: number) => {
                  const isInbound = m.direction === 'inbound';
                  const platformLabel =
                    m.platform === 'whatsapp'
                      ? 'WhatsApp'
                      : m.platform === 'facebook_messenger'
                        ? 'Messenger'
                        : m.platform === 'facebook_lead_ad'
                          ? 'Lead Ad'
                          : m.platform === 'instagram'
                            ? 'Instagram'
                            : m.platform || 'Direct';

                  const badgeColor = 'bg-primary/10 text-primary-dark border-primary/20';

                  return (
                    <div
                      key={m.id || idx}
                      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'} text-xs`}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1 text-[10px] text-secondary">
                        <span className={`px-1.5 py-0.2 rounded font-extrabold uppercase border ${badgeColor}`}>
                          {platformLabel}
                        </span>
                        <span className="font-bold text-slate-700">
                          {isInbound ? m.senderName || lead.name : 'EcoTrophy Team'}
                        </span>
                        <span>•</span>
                        <span>{formatDate(m.created_at)}</span>
                      </div>

                      <div
                        className={`max-w-lg p-3.5 rounded-2xl border shadow-xs whitespace-pre-wrap leading-relaxed ${isInbound
                          ? 'bg-transparent text-slate-800 border-shadow-darker/10 rounded-tl-none'
                          : 'bg-emerald-600 text-white border-emerald-700 rounded-tr-none'
                          }`}
                      >
                        {m.content}
                      </div>

                      {m.campaignName && (
                        <span className="text-[10px] text-secondary mt-0.5 px-1">
                          Campaign: {m.campaignName} {m.adName ? `• Ad: ${m.adName}` : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick WhatsApp Web Composer */}
            <div className="pt-4 border-t border-shadow-darker/10 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-primary-dark flex items-center gap-1.5">
                  <Phone size={13} className="text-emerald-600" />
                  Direct WhatsApp Response Composer
                </label>
                <span className="text-[10px] text-secondary">
                  Target: {lead.phone || 'No phone number'}
                </span>
              </div>

              {/* Variable Chips */}
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-[10px] font-bold text-secondary uppercase">Quick Variables:</span>
                {[
                  { label: 'Customer Name', value: lead.name },
                  { label: 'Stage', value: currentStageLabel },
                  { label: 'Quantity', value: lead.required_quantity ? `${lead.required_quantity} pcs` : '' },
                  { label: 'Event', value: lead.event_name || '' },
                  { label: 'Delivery Date', value: lead.delivery_date || '' },
                ]
                  .filter((chip) => Boolean(chip.value))
                  .map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setComposerText((prev) => `${prev} ${chip.value} `.trim())}
                      className="px-2 py-0.5 rounded-md bg-transparent hover:bg-slate-200 border border-slate-200 text-primary-dark font-medium transition-colors"
                    >
                      + {chip.label}
                    </button>
                  ))}
              </div>

              <textarea
                className="neo-input w-full text-xs min-h-[85px] resize-y"
                placeholder={`Hi ${lead.name}, regarding your trophy enquiry for ${lead.event_name || 'your event'}...`}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
              />

              <div className="flex items-center justify-between flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setComposerText(
                      `Hi ${lead.name}, thank you for contacting EcoTrophy! We have received your enquiry for ${lead.required_quantity || ''
                      } trophies and our team is reviewing your requirements.`
                    )
                  }
                  className="text-[11px] font-bold text-primary hover:underline"
                >
                  Use Greeting Template
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/whatsapp-automation?leadId=${lead.id}&phone=${lead.phone}`
                      )
                    }
                    disabled={!lead.phone}
                    className="neo-btn-primary text-xs px-4 py-2 font-bold flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50"
                  >
                    <MessageSquare size={14} /> Open Live Chat
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const text = composerText.trim() || `Hi ${lead.name}, regarding your trophy enquiry with EcoTrophy:`;
                      openWhatsAppWebDirect(lead.phone || '', text);
                    }}
                    disabled={!lead.phone}
                    className="neo-btn text-xs px-3 py-2 font-semibold flex items-center gap-1.5 text-secondary hover:text-primary-dark disabled:opacity-50"
                    title="Open in WhatsApp Web"
                  >
                    <ExternalLink size={13} /> WhatsApp Web
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STAGE TRANSITION & NOTIFICATION HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Stage Move History */}
          <div className="neo-card space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
              <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
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
                    className="p-3 rounded-xl bg-transparent border border-shadow-darker/10 flex items-start justify-between gap-4 text-xs"
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
              <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
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

                    <p className="text-slate-800 leading-relaxed font-sans bg-transparent p-2.5 rounded-lg border border-shadow-darker/5 whitespace-pre-wrap">
                      {n.message}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-secondary pt-1">
                      <span>Recipient: {n.recipient}</span>
                      <span
                        className={`font-semibold ${n.status === 'sent' ? 'text-emerald-700' : 'text-amber-700'
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

      {/* Slide-over Notes & Reminders Drawer */}
      <LeadNotesDrawer
        isOpen={notesDrawerOpen}
        lead={lead}
        stageName={currentStageLabel}
        onClose={() => setNotesDrawerOpen(false)}
      />

      {/* 100-Mark Sales Quality Audit Modal */}
      <SalesQualityAuditModal
        lead={lead}
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        onAuditUpdated={(newAudit) => {
          setLead((prev) => (prev ? { ...prev, sales_audit: newAudit } : null));
          setFeedback('Sales Quality Audit updated successfully!');
        }}
      />

      {/* Lost Lead Intelligence Diagnostic Modal */}
      <LostLeadIntelligenceModal
        lead={lead}
        isOpen={showLostModal}
        onClose={() => setShowLostModal(false)}
        onSave={(lostData) => {
          setLead((prev) =>
            prev
              ? {
                ...prev,
                status: 'lost_cancelled',
                lost_intelligence: lostData,
              }
              : null
          );
          setFeedback('Lost Lead Intelligence logged and annual win-back scheduled.');
        }}
      />

      {/* Submit / Edit Design Request Modal */}
      {showEditBriefModal && lead && (
        <SubmitDesignRequestModal
          isOpen={showEditBriefModal}
          lead={lead}
          onClose={() => setShowEditBriefModal(false)}
          onSuccess={() => {
            setShowEditBriefModal(false);
            setFeedback('Design Brief specifications updated successfully.');
          }}
        />
      )}

      {/* Production Specifications & Parameters Modal */}
      {showProductionSpecsModal && lead && (
        <ProductionSpecsModal
          isOpen={showProductionSpecsModal}
          lead={lead}
          initialTab={productionSpecsMode}
          onClose={() => setShowProductionSpecsModal(false)}
          onSuccess={() => {
            setShowProductionSpecsModal(false);
            setFeedback('Production specifications updated successfully.');
          }}
        />
      )}

      {/* Production Factory Job Card / Work Order Modal */}
      {showJobCardModal && lead && (
        <ProductionJobCardModal
          isOpen={showJobCardModal}
          lead={lead}
          onClose={() => setShowJobCardModal(false)}
          onOpenSpecsModal={() => {
            setShowJobCardModal(false);
            setShowProductionSpecsModal(true);
          }}
        />
      )}

      {/* Project-based Manufacturing Progress Modal */}
      {showProductionProgressModal && lead && (
        <ProductionProgressModal
          isOpen={showProductionProgressModal}
          lead={lead}
          onClose={() => setShowProductionProgressModal(false)}
        />
      )}
    </div>
  );
}




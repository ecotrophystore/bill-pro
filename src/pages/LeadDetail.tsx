import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, query, where, updateDoc, addDoc } from 'firebase/firestore';
import { ArrowLeft, BadgeCheck, CalendarDays, Loader2, Mail, MessageSquare, Phone, Save, Send, Sparkles, Bot, AlertTriangle, CheckCircle2, DollarSign, Clock, MapPin, Target } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import type { Lead, LeadActivity, MessageTemplate, Pipeline, User } from '../types';
import { useCRMPermission } from '../hooks/useCRMPermission';

type LeadFormState = {
  name: string;
  phone: string;
  email: string;
  source: string;
  campaign: string;
  owner_id: string;
  status: string;
  reason: string;
  next_follow_up_date: string;
};

type StageDraft = {
  id: string;
  label: string;
};

const DEFAULT_STAGES: StageDraft[] = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'lost', label: 'Lost' },
];

function normalizePipeline(pipeline: any): Pipeline {
  const stages = Array.isArray(pipeline?.stages) && pipeline.stages.length > 0
    ? pipeline.stages.map((stage: any, index: number) => ({
        id: String(stage?.id || `stage_${index + 1}`),
        label: String(stage?.label || `Stage ${index + 1}`),
      }))
    : DEFAULT_STAGES.map((stage) => ({ ...stage }));

  return {
    id: String(pipeline?.id || 'default'),
    name: String(pipeline?.name || 'Default pipeline'),
    scenario: String(pipeline?.scenario || 'General'),
    is_default: pipeline?.is_default === true || pipeline?.id === 'default',
    stages,
    created_at: pipeline?.created_at || (new Date() as any),
    updated_at: pipeline?.updated_at,
  };
}

function formatDate(value: any) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toLocaleString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function toDateInputValue(value: any) {
  if (!value) return '';
  const date = typeof value.toDate === 'function'
    ? value.toDate()
    : typeof value.seconds === 'number'
      ? new Date(value.seconds * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderTemplateText(template: string, values: Record<string, string>) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => values[key] || '');
}

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline>(normalizePipeline({ id: 'default' }));
  const [users, setUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [queueing, setQueueing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [templateFeedback, setTemplateFeedback] = useState('');
  const { hasPermission } = useCRMPermission();
  const [form, setForm] = useState<LeadFormState>({
    name: '',
    phone: '',
    email: '',
    source: '',
    campaign: '',
    owner_id: '',
    status: 'new',
    reason: '',
    next_follow_up_date: '',
  });

  useEffect(() => {
    if (!db || !id) return;

    const unsubLead = onSnapshot(doc(db, 'leads', id), (snapshot) => {
      setLead(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Lead) : null);
      setLoading(false);
    }, (error) => {
      console.error('Lead detail failed', error);
      setLoading(false);
    });

    const usersQuery = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as User));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setUsers(rows.filter((user) => user.is_active !== false));
    }, (error) => {
      console.error('Lead users load failed', error);
    });

    const activityQuery = query(collection(db, 'activities'), where('lead_id', '==', id));
    const unsubActivities = onSnapshot(activityQuery, (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as LeadActivity));
      rows.sort((a, b) => {
        const at = typeof a.created_at?.toDate === 'function' ? a.created_at.toDate().getTime() : new Date((a.created_at as any)?.seconds ? (a.created_at as any).seconds * 1000 : a.created_at as any).getTime();
        const bt = typeof b.created_at?.toDate === 'function' ? b.created_at.toDate().getTime() : new Date((b.created_at as any)?.seconds ? (b.created_at as any).seconds * 1000 : b.created_at as any).getTime();
        return bt - at;
      });
      setActivities(rows);
    });

    return () => {
      unsubLead();
      unsubUsers();
      unsubActivities();
    };
  }, [id]);

  useEffect(() => {
    if (!lead) return;

    const pipelineId = lead.pipeline_id || 'default';
    if (!db) return;

    const unsubPipeline = onSnapshot(doc(db, 'pipelines', pipelineId), (snapshot) => {
      setPipeline(snapshot.exists() ? normalizePipeline({ id: snapshot.id, ...snapshot.data() }) : normalizePipeline({ id: pipelineId }));
    }, (error) => {
      console.error('Pipeline load failed', error);
      setPipeline(normalizePipeline({ id: pipelineId }));
    });

    return () => unsubPipeline();
  }, [lead?.pipeline_id]);

  useEffect(() => {
    if (!lead || !db) return;

    const templateQuery = query(collection(db, 'message_templates'));
    const unsubTemplates = onSnapshot(templateQuery, (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as MessageTemplate));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setTemplates(rows);
    }, (error) => {
      console.error('Message templates load failed', error);
    });

    return () => unsubTemplates();
  }, [lead, pipeline.id]);

  useEffect(() => {
    if (!templates.length) {
      setSelectedTemplateId('');
      return;
    }

    if (!templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (!lead) return;

    setForm({
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      source: lead.source || '',
      campaign: lead.campaign || '',
      owner_id: lead.owner_id || '',
      status: lead.status || 'new',
      reason: lead.reason || '',
      next_follow_up_date: toDateInputValue(lead.next_follow_up_date),
    });
  }, [lead]);

  const handleSave = async () => {
    if (!functions || !id) {
      setFeedback('Firebase Functions is not initialized.');
      return;
    }

    const ownerChanged = form.owner_id !== (lead?.owner_id || '');
    if (ownerChanged && !hasPermission('assign_lead')) {
      setFeedback('Error: You do not have permission to assign leads.');
      return;
    }
    const statusChanged = form.status !== (lead?.status || '');
    if (statusChanged && !hasPermission('move_stage')) {
      setFeedback('Error: You do not have permission to move lead stage.');
      return;
    }
    const otherFieldsChanged = form.name !== (lead?.name || '') ||
                               form.phone !== (lead?.phone || '') ||
                               form.email !== (lead?.email || '') ||
                               form.source !== (lead?.source || '') ||
                               form.campaign !== (lead?.campaign || '') ||
                               form.reason !== (lead?.reason || '') ||
                               form.next_follow_up_date !== toDateInputValue(lead?.next_follow_up_date);

    if (otherFieldsChanged && !hasPermission('edit_lead')) {
      setFeedback('Error: You do not have permission to edit lead details.');
      return;
    }

    // Configurable validation check
    const nextStage = pipeline.stages?.find(s => s.id === form.status) || { id: form.status, label: form.status, required_fields: [] };
    const reqs = nextStage.required_fields || [];
    if (reqs.includes('phone') && !form.phone.trim()) {
      setFeedback(`Phone number is required for stage "${nextStage.label}".`);
      return;
    }
    if (reqs.includes('email') && !form.email.trim()) {
      setFeedback(`Email is required for stage "${nextStage.label}".`);
      return;
    }
    if (reqs.includes('reason') && !form.reason.trim()) {
      setFeedback(`Reason is required for stage "${nextStage.label}".`);
      return;
    }

    setSaving(true);
    setFeedback('');

    try {
      const updateLeadDetails = httpsCallable(functions, 'updateLeadDetails');
      const result = await updateLeadDetails({
        leadId: id,
        name: form.name,
        phone: form.phone,
        email: form.email,
        source: form.source,
        campaign: form.campaign,
        owner_id: form.owner_id,
        status: form.status,
        reason: form.reason,
        next_follow_up_date: form.next_follow_up_date,
      });

      const data = result.data as { success?: boolean; changedFields?: string[] };
      setFeedback(data.changedFields?.length ? `Saved changes: ${data.changedFields.join(', ')}` : 'Nothing changed.');
    } catch (error: any) {
      console.warn("Cloud function failed, attempting client-side save fallback:", error);
      try {
        await updateDoc(doc(db, 'leads', id), {
          name: form.name,
          phone: form.phone,
          email: form.email,
          source: form.source,
          campaign: form.campaign,
          owner_id: form.owner_id,
          status: form.status,
          reason: form.reason,
          next_follow_up_date: form.next_follow_up_date,
          updated_at: new Date()
        });
        setFeedback('Saved changes (fallback mode).');
      } catch (fallbackError: any) {
        console.error("Client-side fallback also failed:", fallbackError);
        setFeedback(fallbackError?.message || 'Failed to save lead');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-secondary">Loading lead...</div>;
  }

  if (!lead) {
    return (
      <div className="space-y-4">
        <Link to="/leads" className="inline-flex items-center gap-2 text-primary-dark font-semibold">
          <ArrowLeft size={16} /> Back to leads
        </Link>
        <div className="neo-card text-center py-16 text-secondary">Lead not found.</div>
      </div>
    );
  }

  const stageLookup = new Map((pipeline.stages || DEFAULT_STAGES).map((stage) => [stage.id, stage.label]));
  const statusLabel = stageLookup.get(lead.status) || lead.status;
  const stageClass = lead.status === 'new'
    ? 'bg-secondary/10 text-secondary'
    : lead.status === 'contacted'
      ? 'bg-warning/10 text-warning'
      : lead.status === 'qualified'
        ? 'bg-success/10 text-success'
        : lead.status === 'lost'
          ? 'bg-error/10 text-error'
          : 'bg-primary/10 text-primary-dark';

  const statusOptions = [...(pipeline.stages || DEFAULT_STAGES)];
  if (!statusOptions.some((stage) => stage.id === lead.status)) {
    statusOptions.unshift({ id: lead.status, label: lead.status });
  }

  const activeTemplate = templates.find((template) => template.id === selectedTemplateId) || templates[0] || null;
  const templateContext = {
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    source: lead.source || '',
    campaign: lead.campaign || '',
    pipeline: pipeline.name || 'Default pipeline',
    stage: statusLabel,
    reason: lead.reason || '',
  };
  const renderedSubject = activeTemplate?.subject ? renderTemplateText(activeTemplate.subject, templateContext) : 'No subject';
  const renderedBody = activeTemplate ? renderTemplateText(activeTemplate.body, templateContext) : 'No template selected.';

  const handleQueueTemplate = async () => {
    if (!functions || !id || !activeTemplate) {
      setTemplateFeedback('Select a template first.');
      return;
    }

    if (!hasPermission('send_message')) {
      setTemplateFeedback('Error: You do not have permission to send template messages.');
      return;
    }

    setQueueing(true);
    setTemplateFeedback('');
    try {
      const queueLeadTemplateMessage = httpsCallable(functions, 'queueLeadTemplateMessage');
      const result = await queueLeadTemplateMessage({ leadId: id, templateId: activeTemplate.id });
      const data = result.data as { success?: boolean; queueId?: string; subject?: string; channel?: string };
      setTemplateFeedback(`Queued ${activeTemplate.name}${data.channel ? ` via ${data.channel}` : ''}${data.queueId ? ` | ${data.queueId}` : ''}`);
    } catch (error: any) {
      console.warn("Cloud function failed, attempting client-side save fallback:", error);
      try {
        const queueRef = await addDoc(collection(db, 'message_queue'), {
          lead_id: id,
          template_id: activeTemplate.id,
          pipeline_id: pipeline.id || "default",
          channel: activeTemplate.channel || "note",
          subject: renderedSubject,
          body: renderedBody,
          status: "queued",
          created_by: "client-fallback",
          created_at: new Date(),
          updated_at: new Date(),
        });
        
        await addDoc(collection(db, 'activities'), {
          lead_id: id,
          type: "message.template.queued",
          message: `${activeTemplate.name}${renderedSubject ? ` | ${renderedSubject}` : ""}: ${renderedBody}`,
          actor: "system",
          created_at: new Date(),
        });
        
        setTemplateFeedback(`Queued ${activeTemplate.name} via ${activeTemplate.channel || 'note'} (fallback mode).`);
      } catch (fallbackError: any) {
        console.error("Client-side fallback also failed:", fallbackError);
        setTemplateFeedback(fallbackError?.message || 'Failed to queue message');
      }
    } finally {
      setQueueing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/leads" className="inline-flex items-center gap-2 text-primary-dark font-semibold hover:underline">
        <ArrowLeft size={16} /> Back to leads
      </Link>

      <div className="neo-card space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">{lead.name}</h1>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-secondary">
              <span>{lead.source}</span>
              <span>•</span>
              <span className="capitalize">{lead.platform}</span>
              <span>•</span>
              <span>{pipeline.name}</span>
              <span>•</span>
              <span>{formatDate(lead.created_at)}</span>
            </div>
          </div>
          <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest ${stageClass}`}>
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="neo-input flex items-center gap-3">
            <Phone size={16} className="text-secondary" />
            <span>{lead.phone || 'No phone'}</span>
          </div>
          <div className="neo-input flex items-center gap-3">
            <Mail size={16} className="text-secondary" />
            <span>{lead.email || 'No email'}</span>
          </div>
          <div className="neo-input flex items-center gap-3">
            <BadgeCheck size={16} className="text-secondary" />
            <span>Owner: {lead.owner_id || 'Unassigned'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-secondary">Campaign</div>
            <div className="font-semibold text-primary-dark">{lead.campaign || '-'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-secondary">Pipeline</div>
            <div className="font-semibold text-primary-dark">{pipeline.name}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-secondary">Scenario</div>
            <div className="font-semibold text-primary-dark">{pipeline.scenario || '-'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-secondary">Lead ID</div>
            <div className="font-semibold text-primary-dark">{lead.id}</div>
          </div>
        </div>
      </div>

      {/* AI Qualification & Intelligence Card */}
      {(lead.qualification_status || lead.requirement || lead.suggested_reply || lead.flag_for_review) && (
        <div className="neo-card space-y-4 border border-primary/20 bg-gradient-to-br from-surface via-surface to-primary/5 relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-shadow-darker/10 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary-dark">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-primary-dark">AI Sales Qualification & Intelligence</h2>
                <p className="text-xs text-secondary">Extracted automatically from incoming WhatsApp conversation</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {lead.qualification_status === 'Qualified' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 size={13} /> Qualified
                </span>
              )}
              {lead.qualification_status === 'Needs Follow-up' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  <Bot size={13} /> Needs Follow-up
                </span>
              )}
              {lead.qualification_status === 'Not Qualified' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                  Not Qualified
                </span>
              )}

              {lead.urgency && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize border ${
                  lead.urgency === 'high'
                    ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                    : lead.urgency === 'medium'
                    ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                    : 'bg-secondary/10 text-secondary border-secondary/20'
                }`}>
                  Urgency: {lead.urgency}
                </span>
              )}

              {typeof lead.confidence_score === 'number' && (
                <span className="text-xs text-secondary font-medium px-2.5 py-1 rounded-full bg-shadow-darker/5 border border-shadow-darker/10">
                  Confidence: {Math.round(lead.confidence_score * 100)}%
                </span>
              )}
            </div>
          </div>

          {lead.flag_for_review && (
            <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-800 dark:text-yellow-300 text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span><strong>Flagged for Review:</strong> Ambiguous intent or low AI confidence score. Review conversation carefully before proceeding.</span>
            </div>
          )}

          {lead.qualification_reason && (
            <div className="text-xs text-secondary bg-shadow-darker/5 p-3 rounded-xl border border-shadow-darker/10">
              <span className="font-semibold text-primary-dark">Qualification Analysis: </span>
              {lead.qualification_reason}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {lead.requirement && (
              <div className="p-3 rounded-xl bg-surface border border-shadow-darker/10 space-y-1">
                <div className="text-secondary uppercase tracking-wider text-[10px] font-semibold flex items-center gap-1">
                  <Target size={12} /> Requirement
                </div>
                <div className="font-semibold text-primary-dark text-sm">{lead.requirement}</div>
              </div>
            )}
            {lead.budget && (
              <div className="p-3 rounded-xl bg-surface border border-shadow-darker/10 space-y-1">
                <div className="text-secondary uppercase tracking-wider text-[10px] font-semibold flex items-center gap-1">
                  <DollarSign size={12} /> Budget
                </div>
                <div className="font-semibold text-primary-dark text-sm">{lead.budget}</div>
              </div>
            )}
            {lead.timeline && (
              <div className="p-3 rounded-xl bg-surface border border-shadow-darker/10 space-y-1">
                <div className="text-secondary uppercase tracking-wider text-[10px] font-semibold flex items-center gap-1">
                  <Clock size={12} /> Timeline
                </div>
                <div className="font-semibold text-primary-dark text-sm">{lead.timeline}</div>
              </div>
            )}
            {lead.location && (
              <div className="p-3 rounded-xl bg-surface border border-shadow-darker/10 space-y-1">
                <div className="text-secondary uppercase tracking-wider text-[10px] font-semibold flex items-center gap-1">
                  <MapPin size={12} /> Location
                </div>
                <div className="font-semibold text-primary-dark text-sm">{lead.location}</div>
              </div>
            )}
          </div>

          {lead.next_action && (
            <div className="text-xs bg-primary/5 p-3 rounded-xl border border-primary/15 text-primary-dark">
              <strong>Recommended Next Action:</strong> {lead.next_action}
            </div>
          )}

          {lead.suggested_reply && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary-dark">AI Drafted Reply (Awaiting Approval):</span>
                <Link to="/whatsapp-automation" className="text-xs text-primary font-semibold hover:underline">
                  Open in WhatsApp Inbox →
                </Link>
              </div>
              <div className="p-3 rounded-xl bg-surface border border-shadow-darker/10 text-xs text-secondary whitespace-pre-wrap font-sans">
                {lead.suggested_reply}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="neo-card space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-primary-dark">Edit Lead</h2>
            <p className="text-sm text-secondary">Update status, owner, and follow-up date from one place.</p>
          </div>
          <button disabled={saving} onClick={handleSave} className="neo-btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Save Changes
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Name</label>
            <input className="neo-input w-full" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Phone</label>
            <input className="neo-input w-full" value={form.phone} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Email</label>
            <input className="neo-input w-full" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Source</label>
            <input className="neo-input w-full" value={form.source} onChange={(e) => setForm((current) => ({ ...current, source: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Campaign</label>
            <input className="neo-input w-full" value={form.campaign} onChange={(e) => setForm((current) => ({ ...current, campaign: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Owner</label>
            <select className="neo-input w-full" value={form.owner_id} onChange={(e) => setForm((current) => ({ ...current, owner_id: e.target.value }))}>
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs text-secondary">
              {users.length === 0 ? 'No active users found.' : 'Pick a team member to assign this lead.'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Status</label>
            <select className="neo-input w-full" value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}>
              {statusOptions.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Follow-up Date</label>
            <div className="neo-input flex items-center gap-3">
              <CalendarDays size={16} className="text-secondary" />
              <input type="date" className="w-full bg-transparent outline-none" value={form.next_follow_up_date} onChange={(e) => setForm((current) => ({ ...current, next_follow_up_date: e.target.value }))} />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-2">Lost Reason</label>
          <textarea className="neo-input w-full min-h-28 resize-y" value={form.reason} onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))} placeholder="Required if status is Lost" />
        </div>

        {feedback && (
          <div className="neo-card !p-3 bg-success/5 border border-success/20 text-sm text-primary-dark flex items-start gap-2">
            <BadgeCheck size={16} className="mt-0.5 text-success" />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      <div className="neo-card space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-primary-dark flex items-center gap-2"><MessageSquare size={18} /> Message Template</h2>
            <p className="text-sm text-secondary">Pick a template for this pipeline and queue a rendered message.</p>
          </div>
          <button disabled={queueing || !activeTemplate} onClick={handleQueueTemplate} className="neo-btn-primary flex items-center gap-2">
            {queueing ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            Queue Message
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Template</label>
            <select className="neo-input w-full" value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
              <option value="">Select a template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name} ({template.channel})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Channel</label>
            <div className="neo-input w-full">{activeTemplate?.channel || 'No channel selected'}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-shadow-darker/10 bg-surface p-4 space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-secondary">Subject</div>
          <div className="font-semibold text-primary-dark">{renderedSubject}</div>
          <div className="text-xs uppercase tracking-[0.2em] text-secondary pt-2">Message</div>
          <pre className="whitespace-pre-wrap text-sm text-primary-dark leading-6">{renderedBody}</pre>
        </div>

        <div className="text-xs text-secondary">
          Placeholders: {`{name}, {phone}, {email}, {source}, {campaign}, {pipeline}, {stage}, {reason}`}
        </div>

        {templateFeedback && (
          <div className="neo-card !p-3 bg-success/5 border border-success/20 text-sm text-primary-dark flex items-start gap-2">
            <BadgeCheck size={16} className="mt-0.5 text-success" />
            <span>{templateFeedback}</span>
          </div>
        )}
      </div>

      <div className="neo-card space-y-4">
        <h2 className="text-lg font-bold text-primary-dark">Activity</h2>
        {activities.length === 0 ? (
          <div className="text-secondary py-10 text-center border border-dashed border-shadow-darker/20 rounded-xl">No activity yet.</div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="neo-input flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-primary-dark">{activity.type}</div>
                  <div className="text-sm text-secondary">{activity.message}</div>
                </div>
                <div className="text-xs text-secondary whitespace-nowrap">{formatDate(activity.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

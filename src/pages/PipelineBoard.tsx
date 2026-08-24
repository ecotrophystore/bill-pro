import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ArrowDown, ArrowRight, ArrowUp, CircleAlert, GripVertical, Loader2, Pencil, Plus, Trash2, UserPlus, X, Download } from 'lucide-react';
import { auth, db, functions } from '../lib/firebase';
import * as XLSX from 'xlsx';
import type { Lead, Pipeline, PipelineStage } from '../types';
import { useCRMPermission } from '../hooks/useCRMPermission';


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

const DEFAULT_STAGES: StageDraft[] = [
  { id: 'new', label: 'New', required_fields: [] },
  { id: 'contacted', label: 'Contacted', required_fields: [] },
  { id: 'qualified', label: 'Qualified', required_fields: ['phone'] },
  { id: 'lost', label: 'Lost', required_fields: ['reason'] },
];

const DEFAULT_PIPELINE: Pipeline = {
  id: 'default',
  name: 'Default pipeline',
  scenario: 'General',
  is_default: true,
  stages: DEFAULT_STAGES as PipelineStage[],
  created_at: new Date() as any,
};

const TONES = [
  'bg-secondary/10 text-secondary border-secondary/20',
  'bg-warning/10 text-warning border-warning/20',
  'bg-success/10 text-success border-success/20',
  'bg-error/10 text-error border-error/20',
  'bg-primary/10 text-primary-dark border-primary/20',
  'bg-shadow-darker/10 text-primary-dark border-shadow-darker/20',
];

function stageTone(index: number) {
  return TONES[index % TONES.length];
}

function newStage(seed = 1): StageDraft {
  return {
    id: `stage_${Date.now()}_${seed}`,
    label: 'New stage',
    required_fields: [],
  };
}

function formatDate(value: any) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toLocaleDateString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

function normalizePipeline(pipeline: any): Pipeline {
  const stages: PipelineStage[] = Array.isArray(pipeline?.stages) && pipeline.stages.length > 0
    ? pipeline.stages.map((stage: any, index: number) => ({
        id: String(stage?.id || `stage_${index + 1}`),
        label: String(stage?.label || `Stage ${index + 1}`),
        required_fields: Array.isArray(stage?.required_fields) ? stage.required_fields : [],
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

function pipelineLabel(pipeline: Pipeline) {
  return pipeline.scenario ? `${pipeline.name} - ${pipeline.scenario}` : pipeline.name;
}

function validateMove(lead: Lead, nextStage: PipelineStage) {
  const reqs = nextStage.required_fields || [];
  if (reqs.includes('phone') && !lead.phone) {
    return `Phone number is required for stage "${nextStage.label}".`;
  }
  if (reqs.includes('email') && !lead.email) {
    return `Email is required for stage "${nextStage.label}".`;
  }
  if (reqs.includes('reason') && !(lead.reason || '').trim()) {
    return `Lost reason is required for stage "${nextStage.label}".`;
  }
  // Default legacy fallback validations
  if (nextStage.id === 'qualified' && !(lead.phone || lead.email)) {
    return 'Need at least a phone number or email before qualifying.';
  }
  return '';
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export default function PipelineBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState('default');
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingPipelines, setLoadingPipelines] = useState(true);
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [deletingPipeline, setDeletingPipeline] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPipelineId, setEditingPipelineId] = useState('');
  const [pipelineDraft, setPipelineDraft] = useState<PipelineDraft>({
    name: '',
    scenario: '',
    stages: DEFAULT_STAGES.map((stage) => ({ ...stage })),
  });
  const [dragId, setDragId] = useState('');
  const [message, setMessage] = useState('');
  const { hasPermission } = useCRMPermission();

  // Follow-up scheduling modal states
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);
  const [followUpNextStageId, setFollowUpNextStageId] = useState('');
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpReason, setFollowUpReason] = useState('Asked to call back');
  const [followUpDescription, setFollowUpDescription] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('');
  const [followUpSaving, setFollowUpSaving] = useState(false);

  // Lost reason modal states
  const [lostModalOpen, setLostModalOpen] = useState(false);
  const [lostLead, setLostLead] = useState<Lead | null>(null);
  const [lostNextStageId, setLostNextStageId] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [lostSaving, setLostSaving] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setSelectedPipelineId(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, selectedPipelineId);
  }, [selectedPipelineId]);

  useEffect(() => {
    if (!db) return;

    const unsubPipelines = onSnapshot(query(collection(db, 'pipelines')), (snapshot) => {
      const rows = snapshot.docs.map((item) => normalizePipeline({ id: item.id, ...item.data() }));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setPipelines(rows);
      setLoadingPipelines(false);
    }, (error) => {
      console.error('Pipeline load failed', error);
      setLoadingPipelines(false);
    });

    const unsubLeads = onSnapshot(query(collection(db, 'leads')), (snapshot) => {
      setLeads(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Lead)));
      setLoadingLeads(false);
    }, (error) => {
      console.error('Lead load failed', error);
      setLoadingLeads(false);
    });

    return () => {
      unsubPipelines();
      unsubLeads();
    };
  }, []);

  const pipelineList = useMemo(() => {
    const rows = [DEFAULT_PIPELINE, ...pipelines.filter((item) => item.id !== 'default')];
    const deduped = new Map<string, Pipeline>();
    rows.forEach((pipeline) => deduped.set(pipeline.id, pipeline));
    return Array.from(deduped.values()).sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : a.name.localeCompare(b.name)));
  }, [pipelines]);

  useEffect(() => {
    if (!pipelineList.length) return;
    if (!pipelineList.some((item) => item.id === selectedPipelineId)) {
      setSelectedPipelineId(pipelineList[0].id);
    }
  }, [pipelineList, selectedPipelineId]);

  const activePipeline = useMemo(() => {
    return pipelineList.find((item) => item.id === selectedPipelineId) || DEFAULT_PIPELINE;
  }, [pipelineList, selectedPipelineId]);

  const activeStages = activePipeline.stages?.length ? activePipeline.stages : DEFAULT_STAGES;
  const stageLabelMap = useMemo(() => new Map(activeStages.map((stage) => [stage.id, stage.label])), [activeStages]);

  const grouped = useMemo(() => {
    const rows = activeStages.reduce((acc, stage) => {
      acc[stage.id] = leads.filter((lead) => (lead.pipeline_id || 'default') === activePipeline.id && lead.status === stage.id);
      return acc;
    }, {} as Record<string, Lead[]>);

    const other = leads.filter((lead) => (lead.pipeline_id || 'default') === activePipeline.id && !activeStages.some((stage) => stage.id === lead.status));
    if (other.length > 0) rows.other = other;
    return rows;
  }, [leads, activePipeline.id, activeStages]);

  const openCreate = () => {
    setEditingPipelineId('');
    setPipelineDraft({
      name: '',
      scenario: '',
      stages: DEFAULT_STAGES.map((stage) => ({ ...stage })),
    });
    setEditorOpen(true);
  };

  const openEdit = (pipeline: Pipeline) => {
    setEditingPipelineId(pipeline.id);
    setPipelineDraft({
      name: pipeline.name,
      scenario: pipeline.scenario || '',
      stages: (pipeline.stages?.length ? pipeline.stages : DEFAULT_STAGES).map((stage) => ({
        id: stage.id,
        label: stage.label,
        required_fields: stage.required_fields || [],
      })),
    });
    setEditorOpen(true);
  };

  const moveStageDraft = (index: number, direction: 'up' | 'down') => {
    setPipelineDraft((current) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.stages.length) return current;
      const stages = [...current.stages];
      [stages[index], stages[targetIndex]] = [stages[targetIndex], stages[index]];
      return { ...current, stages };
    });
  };

  const savePipeline = async () => {
    if (!db) return;

    const name = pipelineDraft.name.trim();
    if (!name) {
      setMessage('Enter a pipeline name.');
      return;
    }
    if (pipelineDraft.stages.length === 0) {
      setMessage('Add at least one stage.');
      return;
    }

    const payload = {
      name,
      scenario: pipelineDraft.scenario.trim() || 'General',
      stages: pipelineDraft.stages
        .map((stage) => ({
          id: stage.id.trim() || `stage_${Date.now()}`,
          label: stage.label.trim() || 'Stage',
          required_fields: stage.required_fields || [],
        }))
        .filter((stage) => stage.label.length > 0),
      is_default: editingPipelineId === 'default',
      updated_at: serverTimestamp(),
    };

    if (payload.stages.length === 0) {
      setMessage('Add at least one stage label.');
      return;
    }

    setSavingPipeline(true);
    setMessage('');

    try {
      if (editingPipelineId) {
        await setDoc(doc(db, 'pipelines', editingPipelineId), payload, { merge: true });
        setSelectedPipelineId(editingPipelineId);
        setMessage(`Updated pipeline ${name}.`);
      } else {
        const docRef = await addDoc(collection(db, 'pipelines'), {
          ...payload,
          created_at: serverTimestamp(),
        });
        setSelectedPipelineId(docRef.id);
        setMessage(`Created pipeline ${name}.`);
      }
      setEditorOpen(false);
      setEditingPipelineId('');
    } catch (error: any) {
      console.error('Pipeline save failed', error);
      setMessage(error?.message || 'Failed to save pipeline');
    } finally {
      setSavingPipeline(false);
    }
  };

  const deletePipeline = async () => {
    if (!db) return;
    if (activePipeline.id === 'default') {
      setMessage('Default pipeline cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(`Delete ${activePipeline.name}? Leads will be moved back to Default pipeline.`);
    if (!confirmed) return;

    setDeletingPipeline(true);
    setMessage('');

    try {
      const leadsQuery = query(collection(db, 'leads'), where('pipeline_id', '==', activePipeline.id));
      const leadSnapshot = await getDocs(leadsQuery);
      const fallbackStage = DEFAULT_STAGES[0]?.id || 'new';

      for (const leadChunk of chunk(leadSnapshot.docs, 350)) {
        const batch = writeBatch(db);
        leadChunk.forEach((item) => {
          const leadData = item.data() as Lead;
          batch.update(item.ref, {
            pipeline_id: 'default',
            status: DEFAULT_STAGES.some((stage) => stage.id === leadData.status) ? leadData.status : fallbackStage,
            updated_at: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      await deleteDoc(doc(db, 'pipelines', activePipeline.id));
      setSelectedPipelineId('default');
      setMessage(`Deleted pipeline ${activePipeline.name}.`);
    } catch (error: any) {
      console.error('Pipeline delete failed', error);
      setMessage(error?.message || 'Failed to delete pipeline');
    } finally {
      setDeletingPipeline(false);
    }
  };

  const handleSaveFollowUp = async () => {
    if (!db || !functions || !followUpLead) return;

    if (!followUpTitle.trim()) {
      setMessage('Follow-up title is required.');
      return;
    }
    if (!followUpDate) {
      setMessage('Follow-up date is required.');
      return;
    }
    if (!followUpTime) {
      setMessage('Follow-up time is required.');
      return;
    }

    setFollowUpSaving(true);
    setMessage('');

    try {
      const combinedDateTime = new Date(`${followUpDate}T${followUpTime}`);
      if (Number.isNaN(combinedDateTime.getTime())) {
        setMessage('Invalid date or time selected.');
        setFollowUpSaving(false);
        return;
      }

      // Update lead details
      await updateDoc(doc(db, 'leads', followUpLead.id), {
        pipeline_id: activePipeline.id,
        status: followUpNextStageId,
        followup_reason: followUpReason,
        next_follow_up_date: combinedDateTime.toISOString(),
        stageEnteredAt: serverTimestamp(),
        updated_at: serverTimestamp()
      });

      // Automatically add/save activities and queue message
      const currentUserId = auth.currentUser?.uid || 'system';

      // 1. Add activity entry
      await addDoc(collection(db, 'activities'), {
        lead_id: followUpLead.id,
        type: 'lead.updated',
        message: `Scheduled Follow-up: "${followUpTitle.trim()}" (Reason: ${followUpReason}) - ${followUpDescription.trim() || 'No description'} on ${followUpDate} at ${followUpTime}`,
        actor: currentUserId,
        created_at: serverTimestamp(),
      });

      // 2. Add message to message_queue
      await addDoc(collection(db, 'message_queue'), {
        lead_id: followUpLead.id,
        pipeline_id: activePipeline.id,
        channel: 'note',
        subject: `Follow-up Scheduled: ${followUpTitle.trim()}`,
        body: `Follow-up Scheduled:\nTitle: ${followUpTitle.trim()}\nReason: ${followUpReason}\nDescription: ${followUpDescription.trim() || 'No description'}\nTime: ${followUpDate} ${followUpTime}`,
        status: 'queued',
        created_by: currentUserId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setMessage(`Scheduled follow-up for ${followUpLead.name} in ${activePipeline.name}.`);
      setFollowUpModalOpen(false);
      setFollowUpLead(null);
    } catch (error: any) {
      console.error('Follow-up save failed', error);
      setMessage(error?.message || 'Failed to save follow-up details');
    } finally {
      setFollowUpSaving(false);
    }
  };

  const handleSaveLostReason = async () => {
    if (!lostLead) return;
    if (!lostReason.trim()) {
      setMessage('Lost reason is required.');
      return;
    }

    setLostSaving(true);
    try {
      await moveLead(lostLead, lostNextStageId, lostReason);
      setLostModalOpen(false);
      setLostLead(null);
    } catch (error) {
      console.error('Failed to save lost reason', error);
    } finally {
      setLostSaving(false);
    }
  };

  const moveLead = async (lead: Lead, nextStageId: string, customReason?: string) => {
    if (!db || !functions) return;

    if (!hasPermission('move_stage')) {
      setMessage('Error: You do not have permission to move leads between stages.');
      return;
    }

    const nextStage = activeStages.find((s) => s.id === nextStageId) || { id: nextStageId, label: nextStageId };
    
    // If reason is needed and we don't have customReason, open modal
    const requiresReason = (nextStage.required_fields || []).includes('reason');
    if (requiresReason && customReason === undefined) {
      setLostLead(lead);
      setLostNextStageId(nextStageId);
      setLostReason(lead.reason || '');
      setLostModalOpen(true);
      return;
    }

    // Now validate, including the customReason if provided
    const validation = validateMove(customReason !== undefined ? { ...lead, reason: customReason } : lead, nextStage);
    if (validation) {
      setMessage(validation);
      return;
    }

    const isFollowUpStage = nextStageId === 'followup' || nextStage.label.toLowerCase().includes('follow');
    if (isFollowUpStage) {
      setFollowUpLead(lead);
      setFollowUpNextStageId(nextStageId);
      setFollowUpTitle(`Follow up with ${lead.name}`);
      setFollowUpDescription('');
      
      const today = new Date();
      const pad = (num: number) => String(num).padStart(2, '0');
      setFollowUpDate(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
      setFollowUpTime('10:00');
      
      setFollowUpModalOpen(true);
      return;
    }

    const nextReason = requiresReason ? customReason?.trim() : lead.reason;

    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        pipeline_id: activePipeline.id,
        status: nextStageId,
        reason: requiresReason ? nextReason : '',
        stageEnteredAt: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      setMessage(`Moved ${lead.name} in ${activePipeline.name}.`);
    } catch (error: any) {
      console.error('Stage update failed', error);
      setMessage(error?.message || 'Failed to move lead');
    }
  };

  const nextStageIdFor = (index: number) => activeStages[(index + 1) % activeStages.length]?.id || activeStages[0]?.id || 'new';

  const handleExportPipeline = () => {
    try {
      const exportData: any[] = [];
      activeStages.forEach(stage => {
        const stageLeads = grouped[stage.id] || [];
        stageLeads.forEach(lead => {
          exportData.push({
            'Lead Name': lead.name,
            'Phone': lead.phone || '',
            'Email': lead.email || '',
            'Stage': stage.label,
            'Source': lead.source || '',
            'Campaign': lead.campaign || '',
            'Value': lead.value || 0,
            'Follow-up Reason': lead.followup_reason || '',
            'Created At': formatDate(lead.created_at)
          });
        });
      });

      if (grouped.other && grouped.other.length > 0) {
        grouped.other.forEach(lead => {
          exportData.push({
            'Lead Name': lead.name,
            'Phone': lead.phone || '',
            'Email': lead.email || '',
            'Stage': 'Other',
            'Source': lead.source || '',
            'Campaign': lead.campaign || '',
            'Value': lead.value || 0,
            'Follow-up Reason': lead.followup_reason || '',
            'Created At': formatDate(lead.created_at)
          });
        });
      }

      if (exportData.length === 0) {
        setMessage('No leads to export in this pipeline.');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(exportData);
      
      const objectMaxLength: number[] = [];
      exportData.forEach(row => {
        Object.keys(row).forEach((key, i) => {
          const value = row[key] ? row[key].toString() : '';
          const length = Math.max(value.length, key.length);
          objectMaxLength[i] = Math.max(objectMaxLength[i] || 0, length);
        });
      });
      ws['!cols'] = objectMaxLength.map(w => ({ width: w + 2 }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pipeline Leads");
      XLSX.writeFile(wb, `${activePipeline.name.replace(/\s+/g, '_')}_Leads.xlsx`);
      setMessage(`Exported ${exportData.length} leads successfully.`);
    } catch (error) {
      console.error('Export failed', error);
      setMessage('Failed to export pipeline leads.');
    }
  };

  const handleDrop = async (stageId: string) => {
    const lead = leads.find((item) => item.id === dragId);
    setDragId('');
    if (lead && lead.status !== stageId) {
      await moveLead(lead, stageId);
    }
  };

  const isLoading = loadingLeads || loadingPipelines;
  const totalLeadsInPipeline = useMemo(() => activeStages.reduce((total, stage) => total + (grouped[stage.id]?.length || 0), 0) + (grouped.other?.length || 0), [activeStages, grouped]);
  const hasUnmapped = Boolean(grouped.other?.length);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Pipeline Board</h1>
            <p className="text-secondary mt-1">Create separate pipelines for different scenarios and define their own stages.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-secondary">
            <span className="rounded-full border border-shadow-darker/10 px-3 py-1">Active: {activePipeline.name}</span>
            <span className="rounded-full border border-shadow-darker/10 px-3 py-1">Scenario: {activePipeline.scenario || 'General'}</span>
            <span className="rounded-full border border-shadow-darker/10 px-3 py-1">Stages: {activeStages.length}</span>
            <span className="rounded-full border border-shadow-darker/10 px-3 py-1">Leads: {totalLeadsInPipeline}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select className="neo-input min-w-72" value={selectedPipelineId} onChange={(e) => setSelectedPipelineId(e.target.value)}>
            {pipelineList.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>{pipelineLabel(pipeline)}</option>
            ))}
          </select>
          {hasPermission('manage_automation') && (
            <>
              <button onClick={openCreate} className="neo-btn inline-flex items-center gap-2"><Plus size={16} /> Create Pipeline</button>
              <button onClick={() => openEdit(activePipeline)} className="neo-btn inline-flex items-center gap-2"><Pencil size={16} /> Edit</button>
              <button disabled={deletingPipeline || activePipeline.id === 'default'} onClick={deletePipeline} className="neo-btn inline-flex items-center gap-2 disabled:opacity-40"><Trash2 size={16} /> Delete</button>
            </>
          )}
          {hasPermission('create_lead') && (
            <Link to="/leads/new" className="neo-btn-primary inline-flex items-center gap-2"><UserPlus size={16} /> Add Lead</Link>
          )}
          <button onClick={handleExportPipeline} className="neo-btn inline-flex items-center gap-2"><Download size={16} /> Export</button>
        </div>
      </div>

      {editorOpen && (
        <div className="neo-card space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">{editingPipelineId ? 'Edit Pipeline' : 'Create Pipeline'}</h2>
              <p className="text-sm text-secondary">Add, rename, or remove stages for this scenario.</p>
            </div>
            <button onClick={() => setEditorOpen(false)} className="neo-btn inline-flex items-center gap-2"><X size={16} /> Close</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-primary-dark mb-2">Pipeline Name</label>
              <input className="neo-input w-full" value={pipelineDraft.name} onChange={(e) => setPipelineDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Sales - Meta Leads" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-primary-dark mb-2">Scenario</label>
              <input className="neo-input w-full" value={pipelineDraft.scenario} onChange={(e) => setPipelineDraft((current) => ({ ...current, scenario: e.target.value }))} placeholder="Meta Ads / Google Ads / Referral" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-bold text-primary-dark">Stages</h3>
            </div>

            <div className="space-y-3">
              {pipelineDraft.stages.map((stage, index) => (
                <div key={stage.id} className="border border-shadow-darker/10 rounded-2xl p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label className="block text-xs uppercase tracking-[0.2em] text-secondary mb-2">Stage Label</label>
                      <input className="neo-input w-full" value={stage.label} onChange={(e) => setPipelineDraft((current) => ({
                        ...current,
                        stages: current.stages.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item),
                      }))} placeholder="Stage label" />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => moveStageDraft(index, 'up')}
                        disabled={index === 0}
                        className="neo-btn inline-flex items-center gap-2 disabled:opacity-40"
                      >
                        <ArrowUp size={14} /> Up
                      </button>
                      <button
                        onClick={() => moveStageDraft(index, 'down')}
                        disabled={index === pipelineDraft.stages.length - 1}
                        className="neo-btn inline-flex items-center gap-2 disabled:opacity-40"
                      >
                        <ArrowDown size={14} /> Down
                      </button>
                      <button
                        disabled={pipelineDraft.stages.length === 1}
                        onClick={() => setPipelineDraft((current) => ({ ...current, stages: current.stages.filter((_, itemIndex) => itemIndex !== index) }))}
                        className="neo-btn inline-flex items-center gap-2 disabled:opacity-40"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs">
                    <span className="text-secondary font-semibold">Stage Requirements:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(stage.required_fields || []).includes('phone')}
                        onChange={() => {
                          const currentReqs = stage.required_fields || [];
                          const nextReqs = currentReqs.includes('phone') ? currentReqs.filter(f => f !== 'phone') : [...currentReqs, 'phone'];
                          setPipelineDraft(curr => ({
                            ...curr,
                            stages: curr.stages.map((item, i) => i === index ? { ...item, required_fields: nextReqs } : item)
                          }));
                        }}
                      />
                      Phone Number
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(stage.required_fields || []).includes('email')}
                        onChange={() => {
                          const currentReqs = stage.required_fields || [];
                          const nextReqs = currentReqs.includes('email') ? currentReqs.filter(f => f !== 'email') : [...currentReqs, 'email'];
                          setPipelineDraft(curr => ({
                            ...curr,
                            stages: curr.stages.map((item, i) => i === index ? { ...item, required_fields: nextReqs } : item)
                          }));
                        }}
                      />
                      Email
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(stage.required_fields || []).includes('reason')}
                        onChange={() => {
                          const currentReqs = stage.required_fields || [];
                          const nextReqs = currentReqs.includes('reason') ? currentReqs.filter(f => f !== 'reason') : [...currentReqs, 'reason'];
                          setPipelineDraft(curr => ({
                            ...curr,
                            stages: curr.stages.map((item, i) => i === index ? { ...item, required_fields: nextReqs } : item)
                          }));
                        }}
                      />
                      Lost/Drop Reason
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-start pt-2">
              <button onClick={() => setPipelineDraft((current) => ({ ...current, stages: [...current.stages, newStage(current.stages.length + 1)] }))} className="neo-btn inline-flex items-center gap-2"><Plus size={14} /> Add stage</button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button disabled={savingPipeline} onClick={savePipeline} className="neo-btn-primary inline-flex items-center gap-2">
              {savingPipeline ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              Save Pipeline
            </button>
            <button onClick={() => setEditorOpen(false)} className="neo-btn inline-flex items-center gap-2">Cancel</button>
          </div>
        </div>
      )}
      {followUpModalOpen && followUpLead && (
        <div className="fixed inset-0 bg-shadow-darker/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="neo-card max-w-lg w-full space-y-4 animate-scale-up bg-surface">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-primary-dark">Schedule Follow-up</h2>
                <p className="text-sm text-secondary">Set follow-up details for {followUpLead.name}</p>
              </div>
              <button
                onClick={() => {
                  setFollowUpModalOpen(false);
                  setFollowUpLead(null);
                }}
                className="neo-btn !p-1.5"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1.5">Follow-up Title</label>
                <input
                  className="neo-input w-full"
                  value={followUpTitle}
                  onChange={(e) => setFollowUpTitle(e.target.value)}
                  placeholder="e.g. Discuss Quotation details"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1.5">Customer Response / Reason</label>
                <select
                  className="neo-input w-full"
                  value={followUpReason}
                  onChange={(e) => setFollowUpReason(e.target.value)}
                >
                  <option value="Asked to call back">Asked to call back</option>
                  <option value="Needs more time">Needs more time</option>
                  <option value="Send quotation/info">Send quotation/info</option>
                  <option value="Not picking up">Not picking up</option>
                  <option value="Busy/In a meeting">Busy/In a meeting</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1.5">Description / Notes</label>
                <textarea
                  className="neo-input w-full min-h-24 resize-y"
                  value={followUpDescription}
                  onChange={(e) => setFollowUpDescription(e.target.value)}
                  placeholder="Details about the follow-up task..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-primary-dark mb-1.5">Date</label>
                  <input
                    type="date"
                    className="neo-input w-full"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-primary-dark mb-1.5">Time</label>
                  <input
                    type="time"
                    className="neo-input w-full"
                    value={followUpTime}
                    onChange={(e) => setFollowUpTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setFollowUpModalOpen(false);
                  setFollowUpLead(null);
                }}
                className="neo-btn"
                disabled={followUpSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveFollowUp}
                className="neo-btn-primary flex items-center gap-2"
                disabled={followUpSaving}
              >
                {followUpSaving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                Schedule Follow-up
              </button>
            </div>
          </div>
        </div>
      )}

      {lostModalOpen && lostLead && (
        <div className="fixed inset-0 bg-shadow-darker/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="neo-card max-w-lg w-full space-y-4 animate-scale-up bg-surface">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-primary-dark">Enter Reason</h2>
                <p className="text-sm text-secondary">Please provide a reason for moving {lostLead.name} to the {activeStages.find(s => s.id === lostNextStageId)?.label || 'selected'} stage</p>
              </div>
              <button
                onClick={() => {
                  setLostModalOpen(false);
                  setLostLead(null);
                }}
                className="neo-btn !p-1.5"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1.5">Lost Reason</label>
                <textarea
                  className="neo-input w-full min-h-28 resize-y"
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  placeholder="Required. e.g. Price too high / Went with a competitor / No response"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setLostModalOpen(false);
                  setLostLead(null);
                }}
                className="neo-btn"
                disabled={lostSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLostReason}
                className="neo-btn-primary flex items-center gap-2"
                disabled={lostSaving}
              >
                {lostSaving ? <Loader2 className="animate-spin" size={16} /> : null}
                Save & Move
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className="neo-card !p-3 bg-primary/5 border border-primary/20 text-sm text-primary-dark flex items-start gap-2">
          <CircleAlert size={16} className="mt-0.5 text-primary-dark" />
          <span>{message}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-secondary">
          <Loader2 className="animate-spin mx-auto mb-3" size={20} />
          Loading pipelines...
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          {activeStages.map((stage, index) => (
            <div
              key={stage.id}
              className={`neo-card space-y-4 border ${stageTone(index)}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-primary-dark">{stage.label}</h2>


                </div>
                <div className="text-sm font-black text-primary-dark">{grouped[stage.id]?.length || 0}</div>
              </div>

              <div className="space-y-3 min-h-[120px]">
                {(grouped[stage.id] || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-shadow-darker/20 p-4 text-sm text-secondary text-center">Drop leads here</div>
                ) : (
                  (grouped[stage.id] || []).map((lead) => (
                    <div 
                      key={lead.id} 
                      draggable 
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', lead.id);
                        setDragId(lead.id);
                      }} 
                      onDragEnd={() => setDragId('')} 
                      className="rounded-2xl bg-surface border border-shadow-darker/10 p-4 shadow-sm cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-primary-dark">{lead.name}</div>
                          <div className="text-xs text-secondary mt-1">{lead.phone || lead.email || 'No contact yet'}</div>
                        </div>
                        <GripVertical size={16} className="text-secondary shrink-0" />
                      </div>

                      <div className="mt-3 space-y-1 text-xs text-secondary">
                        <div>{lead.source}</div>
                        <div>{lead.campaign || 'No campaign'}</div>
                        <div>{formatDate(lead.created_at)}</div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-2">
                        <Link to={`/leads/${lead.id}`} className="inline-flex items-center gap-1 text-primary-dark font-semibold text-sm hover:underline">
                          Open <ArrowRight size={13} />
                        </Link>
                        <button onClick={() => moveLead(lead, nextStageIdFor(index))} className="text-xs font-semibold text-secondary hover:text-primary-dark">Next stage</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}

          {hasUnmapped && (
            <div className="neo-card space-y-4 border bg-shadow-darker/5 border-shadow-darker/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-primary-dark">Other</h2>
                  <p className="text-xs text-secondary mt-1">Leads whose status is not mapped to this pipeline.</p>
                </div>
                <div className="text-sm font-black text-primary-dark">{grouped.other?.length || 0}</div>
              </div>
              <div className="space-y-3 min-h-[120px]">
                {(grouped.other || []).map((lead) => (
                  <div key={lead.id} className="rounded-2xl bg-surface border border-shadow-darker/10 p-4 shadow-sm">
                    <div className="font-semibold text-primary-dark">{lead.name}</div>
                    <div className="text-xs text-secondary mt-1">{lead.status}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}




// @ts-nocheck
import { useEffect, useState, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, doc, setDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Bot, Plus, Loader2, Play, Pause, Edit2, Check, AlertCircle, X } from 'lucide-react';
import { db, functions, auth } from '../lib/firebase';
import { useCRMPermission } from '../hooks/useCRMPermission';
import type { WhatsAppAutomation, Pipeline } from '../types';
import { WorkflowBuilder } from '../components/WhatsAppAutomation/WorkflowBuilder';

export default function WhatsAppAutomation() {
  const { hasPermission } = useCRMPermission();
  const [view, setView] = useState<'list' | 'form' | 'detail'>('list');
  const [automations, setAutomations] = useState<WhatsAppAutomation[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [draft, setDraft] = useState<Partial<WhatsAppAutomation> | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      collection(db, 'whatsapp_automations'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as WhatsAppAutomation));
        data.sort((a, b) => {
          const aTime = (a as any).createdAt?.toMillis?.() || 0;
          const bTime = (b as any).createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
        setAutomations(data);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching automations:', err);
        setLoading(false);
      }
    );
    const unsubP = onSnapshot(collection(db, 'pipelines'), (snap) => {
      setPipelines(snap.docs.map(d => ({ id: d.id, ...d.data() } as Pipeline)));
    });
    return () => { unsub(); unsubP(); };
  }, []);

  const allPipelines = useMemo(() => {
    const defaultStub: Pipeline = {
      id: 'default', name: 'Default Pipeline', scenario: 'General', is_default: true,
      stages: [
        { id: 'new', label: 'New' }, { id: 'contacted', label: 'Contacted' },
        { id: 'qualified', label: 'Qualified' }, { id: 'lost', label: 'Lost' }
      ],
      created_at: new Date() as any,
    };
    return pipelines.some(p => p.id === 'default') ? pipelines : [defaultStub, ...pipelines];
  }, [pipelines]);

  const openCreate = () => {
    setDraft({});
    setMessage(''); setIsError(false);
    setView('form');
  };

  const openEdit = (a: WhatsAppAutomation) => {
    setDraft(a);
    setMessage(''); setIsError(false);
    setView('form');
  };

  const handleSaveCompiled = async (compiledData: Partial<WhatsAppAutomation>) => {
    if (!db) return;
    const uid = auth?.currentUser?.uid ?? 'system';
    setSaving(true); setIsError(false); setMessage('');
    try {
      const payload = { ...compiledData, updatedAt: serverTimestamp() };
      if (draft?.id) {
        await setDoc(doc(db, 'whatsapp_automations', draft.id), payload, { merge: true });
        setMessage(`✓ Updated automation "${payload.name}".`);
      } else {
        await addDoc(collection(db, 'whatsapp_automations'), { ...payload, createdBy: uid, createdAt: serverTimestamp() });
        setMessage(`✓ Created automation "${payload.name}".`);
      }
      setView('list');
    } catch (err: any) {
      setIsError(true); setMessage(err?.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async (a: WhatsAppAutomation) => {
    if (!db) return;
    const newStatus = a.status === 'active' ? 'paused' : 'active';
    try {
      await updateDoc(doc(db, 'whatsapp_automations', a.id), { status: newStatus, updatedAt: serverTimestamp() });
      setMessage(`Automation ${newStatus}.`);
    } catch (err: any) { setIsError(true); setMessage(err?.message ?? 'Failed to update status.'); }
  };

  const doActivate = async (a: WhatsAppAutomation) => {
    if (!functions) return;
    setActivating(true); setIsError(false); setMessage('');
    try {
      const fn = httpsCallable(functions, 'activateAutomation');
      const result: any = await fn({ automationId: a.id });
      setMessage(`✓ Activated! Enrolled ${result.data?.enrolled ?? 0} leads. Skipped: ${result.data?.skipped ?? 0}.`);
    } catch (err: any) {
      setIsError(true); setMessage(err?.message ?? 'Activation failed.');
    } finally { setActivating(false); }
  };

  if (view === 'form' && draft) {
    return (
      <WorkflowBuilder 
        initialData={draft}
        allPipelines={allPipelines}
        onSave={handleSaveCompiled}
        onCancel={() => setView('list')}
        saving={saving}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shrink-0">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">WhatsApp Automation</h1>
            <p className="text-secondary mt-0.5 text-sm">Visual node builder for automated WhatsApp sequences.</p>
          </div>
        </div>
        {hasPermission('manage_automation') && (
          <button onClick={openCreate} className="neo-btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> New Automation
          </button>
        )}
      </div>

      {message && (
        <div className={`neo-card !p-3 text-sm flex items-start gap-2 border ${isError ? 'bg-rose-500/5 border-rose-500/20 text-rose-400' : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'}`}>
          {isError ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <Check size={16} className="mt-0.5 shrink-0" />}
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="ml-auto opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="neo-card py-20 flex items-center justify-center text-secondary">
          <Loader2 className="animate-spin mr-2" size={20} /> Loading automations...
        </div>
      ) : automations.length === 0 ? (
        <div className="neo-card py-20 text-center space-y-4">
          <Bot size={32} className="text-emerald-400 mx-auto opacity-50" />
          <p className="text-lg font-semibold text-primary-dark">No automations yet</p>
          <button onClick={openCreate} className="neo-btn-primary mx-auto inline-flex items-center gap-2"><Plus size={16}/> Create First Automation</button>
        </div>
      ) : (
        <div className="grid gap-4">
          {automations.map(a => {
            const pipelineName = allPipelines.find(p => p && p.id === a.pipelineId)?.name || a.pipelineId || 'Unknown Pipeline';
            const stageName = allPipelines.find(p => p && p.id === a.pipelineId)?.stages?.find(s => s && s.id === a.stageId)?.label || a.stageId || 'Unknown Stage';
            return (
              <div key={a.id} className="neo-card hover:shadow-neo-raised transition-all p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-primary-dark">{a.name || 'Unnamed Automation'}</h3>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${a.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 text-slate-500'}`}>{a.status || 'draft'}</span>
                    </div>
                    <div className="text-sm text-secondary mt-1">
                      {pipelineName} &rarr; {stageName} &bull; {(a.scheduleType || 'immediate').replace(/_/g, ' ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status !== 'draft' && (
                      <button onClick={() => togglePause(a)} className="neo-btn !px-3 !py-1.5 text-sm">
                        {a.status === 'active' ? <><Pause size={14} className="mr-1 inline" /> Pause</> : <><Play size={14} className="mr-1 inline" /> Resume</>}
                      </button>
                    )}
                    {a.status === 'draft' && (
                      <button onClick={() => doActivate(a)} disabled={activating} className="neo-btn-primary !px-3 !py-1.5 text-sm">
                        {activating ? <Loader2 size={14} className="animate-spin mr-1 inline" /> : <Play size={14} className="mr-1 inline" />} Activate
                      </button>
                    )}
                    <button onClick={() => openEdit(a)} className="neo-btn !px-3 !py-1.5 text-sm">
                      <Edit2 size={14} className="mr-1 inline" /> Edit Builder
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

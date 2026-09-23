// @ts-nocheck
import { useEffect, useState, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, doc, setDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Bot, Plus, Loader2, Play, Pause, Edit2, Check, AlertCircle, X, Sparkles, Workflow, MessageSquare } from 'lucide-react';
import { db, functions, auth } from '../lib/firebase';
import { useCRMPermission } from '../hooks/useCRMPermission';
import type { WhatsAppAutomation, Pipeline } from '../types';
import { WorkflowBuilder } from '../components/WhatsAppAutomation/WorkflowBuilder';
import { WhatsAppAiInbox } from '../components/WhatsAppAutomation/WhatsAppAiInbox';
import { WhatsAppLiveChat } from '../components/WhatsAppAutomation/WhatsAppLiveChat';

export default function WhatsAppAutomation() {
  const { hasPermission } = useCRMPermission();
  const [activeTab, setActiveTab] = useState<'chat' | 'inbox' | 'workflows'>('chat');
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
    if (!db) {
      throw new Error('Database is not initialized.');
    }
    const uid = auth?.currentUser?.uid ?? 'system';
    setSaving(true); setIsError(false); setMessage('');
    try {
      // Clean and sanitize nodes/edges to remove undefined or non-serializable fields for Firestore
      const cleanNodes = JSON.parse(JSON.stringify(compiledData.workflowNodes || []));
      const cleanEdges = JSON.parse(JSON.stringify(compiledData.workflowEdges || []));

      const payload = {
        ...compiledData,
        workflowNodes: cleanNodes,
        workflowEdges: cleanEdges,
        updatedAt: serverTimestamp(),
      };

      if (draft?.id) {
        await setDoc(doc(db, 'whatsapp_automations', draft.id), payload, { merge: true });
        setMessage(`✓ Updated automation "${payload.name}".`);
      } else {
        await addDoc(collection(db, 'whatsapp_automations'), { ...payload, createdBy: uid, createdAt: serverTimestamp() });
        setMessage(`✓ Created automation "${payload.name}".`);
      }
      setView('list');
    } catch (err: any) {
      console.error('Error saving automation:', err);
      setIsError(true);
      setMessage(err?.message ?? 'Failed to save.');
      throw err;
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
    if (!db) return;
    setActivating(true); setIsError(false); setMessage('');
    try {
      if (functions) {
        try {
          const fn = httpsCallable(functions, 'activateAutomation');
          const result: any = await fn({ automationId: a.id });
          setMessage(`✓ Activated! Enrolled ${result.data?.enrolled ?? 0} leads. Skipped: ${result.data?.skipped ?? 0}.`);
          return;
        } catch (fnErr: any) {
          console.warn('Callable activateAutomation fallback to direct Firestore:', fnErr);
        }
      }
      await updateDoc(doc(db, 'whatsapp_automations', a.id), { 
        status: 'active', 
        updatedAt: serverTimestamp() 
      });
      setMessage(`✓ Automation "${a.name || 'Automation'}" is now active!`);
    } catch (err: any) {
      console.error('Error activating automation:', err);
      setIsError(true); 
      setMessage(err?.message ?? 'Activation failed.');
    } finally { 
      setActivating(false); 
    }
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
    <div className={activeTab === 'chat' ? 'w-full h-[calc(100vh-7rem)] flex flex-col min-h-0' : 'space-y-6 animate-fade-in max-w-6xl mx-auto'}>
      {/* Header & Tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-1 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shrink-0">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-primary-dark">WhatsApp Command Center</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Meta Cloud API Active
              </span>
            </div>
            <p className="text-secondary text-xs hidden sm:block">Automated AI lead qualification, 2-way live chat & sequence workflows.</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-transparent rounded-xl border border-shadow-darker/20 shadow-xs">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'chat'
                ? 'bg-transparent text-emerald-700 shadow-sm'
                : 'text-secondary hover:text-primary-dark'
            }`}
          >
            <MessageSquare size={14} className="text-emerald-500" /> WhatsApp Live Chat
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'inbox'
                ? 'bg-transparent text-primary shadow-sm'
                : 'text-secondary hover:text-primary-dark'
            }`}
          >
            <Sparkles size={14} className="text-amber-500" /> AI Qualification Hub
          </button>
          <button
            onClick={() => setActiveTab('workflows')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'workflows'
                ? 'bg-transparent text-primary shadow-sm'
                : 'text-secondary hover:text-primary-dark'
            }`}
          >
            <Workflow size={14} className="text-teal-500" /> Workflow Sequences ({automations.length})
          </button>
        </div>
      </div>

      {activeTab === 'chat' ? (
        <div className="flex-1 min-h-0 w-full pt-1">
          <WhatsAppLiveChat />
        </div>
      ) : activeTab === 'inbox' ? (
        <WhatsAppAiInbox />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-primary-dark">Automated Sequences</h2>
            {hasPermission('manage_automation') && (
              <button onClick={openCreate} className="neo-btn-primary inline-flex items-center gap-2 text-sm">
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
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${a.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-transparent text-slate-500'}`}>{a.status || 'draft'}</span>
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
      )}
    </div>
  );
}



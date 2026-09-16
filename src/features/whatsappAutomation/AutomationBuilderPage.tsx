// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AlertTriangle, Bot, CheckCircle2, Loader2, Plus, Save, Send, X } from 'lucide-react';
import { auth, db, functions } from '../../lib/firebase';
import { useCRMPermission } from '../../hooks/useCRMPermission';
import type { Lead, Pipeline, WhatsAppAutomation, WorkflowNodeConfig, WorkflowNodeType } from '../../types';
import { AutomationToolbar } from './AutomationToolbar';
import { AddStepMenu } from './AddStepMenu';
import { WorkflowCanvas } from './WorkflowCanvas';
import { AUTOMATION_PRESETS, createPresetBlueprint, type AutomationPresetKey } from './automationPresets';
import { compileWorkflowToAutomation } from './workflowCompiler';
import { validateWorkflowGraph } from './workflowValidation';
import type { ReactFlowInstance } from '@xyflow/react';

const emptyForm = {
  name: '', status: 'draft' as const, pipelineId: '', stageId: '', audienceMode: 'current_and_future' as const,
  metaTemplateName: '', templateLanguage: 'en_US', timezone: 'Asia/Kolkata', sendTime: '10:00',
  delayDays: 2, repeatEveryDays: 3, maxMessagesPerLead: 3,
  stopOnReply: true, stopOnStageChange: true, skipWon: true, skipLost: true, skipOptedOut: true, preventDuplicate: true,
};

const presetLabel = new Map(AUTOMATION_PRESETS.map((item) => [item.key, item.label]));
const initialBlueprint = createPresetBlueprint('custom');

function fmt(v: any) { if (!v) return '—'; if (typeof v.toDate === 'function') return v.toDate().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); return '—'; }
function newNode(type: WorkflowNodeType, summary = '', config: Record<string, any> = {}): WorkflowNodeConfig { const titles: Record<string, string> = { trigger: 'Trigger', condition: 'Condition', delay: 'Delay', whatsapp: 'WhatsApp Message', payment_condition: 'Payment Check', production_condition: 'Production Check', dispatch_condition: 'Dispatch Check', review_delay: 'Repeat Follow-up', stop_condition: 'Stop Condition', end: 'End Workflow', add: 'Add Step' }; return { id: `${type}-${Math.random().toString(36).slice(2, 10)}`, type, data: { title: titles[type] || type, summary, icon: type, config } }; }

export default function AutomationBuilderPage() {
  const navigate = useNavigate();
  const { hasPermission } = useCRMPermission();
  const [automations, setAutomations] = useState<WhatsAppAutomation[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [nodes, setNodes] = useState<WorkflowNodeConfig[]>(initialBlueprint.nodes.map((node) => ({ ...node })));
  const [edges, setEdges] = useState(initialBlueprint.edges.map((edge) => ({ ...edge })));
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [presetKey, setPresetKey] = useState<AutomationPresetKey>('custom');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [workflowLock, setWorkflowLock] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addAnchorId, setAddAnchorId] = useState('');
  const [addAnchorLabel, setAddAnchorLabel] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const [testLeadId, setTestLeadId] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const flowRef = useRef<ReactFlowInstance | null>(null);

  const selectedAutomation = useMemo(() => automations.find((item) => item.id === selectedAutomationId) || null, [automations, selectedAutomationId]);
  const pipeline = useMemo(() => pipelines.find((item) => item.id === form.pipelineId) || null, [pipelines, form.pipelineId]);
  const stageOptions = pipeline?.stages || [];
  const selectedNode = useMemo(() => nodes.find((item) => item.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const validation = useMemo(() => validateWorkflowGraph(nodes, edges), [nodes, edges]);

  useEffect(() => {
    if (!db) return;
    const unsubA = onSnapshot(query(collection(db, 'whatsapp_automations'), orderBy('createdAt', 'desc')), (snapshot) => setAutomations(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as WhatsAppAutomation))));
    const unsubP = onSnapshot(query(collection(db, 'pipelines')), (snapshot) => setPipelines(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Pipeline))));
    const unsubL = onSnapshot(query(collection(db, 'leads')), (snapshot) => setLeads(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Lead))));
    return () => { unsubA(); unsubP(); unsubL(); };
  }, []);

  useEffect(() => {
    if (!selectedAutomation) return;
    setForm({
      name: selectedAutomation.name || '', status: selectedAutomation.status || 'draft', pipelineId: selectedAutomation.pipelineId || '', stageId: selectedAutomation.stageId || '', audienceMode: selectedAutomation.audienceMode || 'current_and_future', metaTemplateName: selectedAutomation.metaTemplateName || '', templateLanguage: selectedAutomation.templateLanguage || 'en_US', timezone: selectedAutomation.timezone || 'Asia/Kolkata', sendTime: selectedAutomation.sendTime || '10:00', delayDays: selectedAutomation.delayDays || 2, repeatEveryDays: selectedAutomation.repeatEveryDays || 3, maxMessagesPerLead: selectedAutomation.maxMessagesPerLead || 3, stopOnReply: selectedAutomation.stopOnReply, stopOnStageChange: selectedAutomation.stopOnStageChange, skipWon: selectedAutomation.skipWon, skipLost: selectedAutomation.skipLost, skipOptedOut: selectedAutomation.skipOptedOut, preventDuplicate: selectedAutomation.preventDuplicate,
    });
    setNodes((selectedAutomation.workflowNodes?.length ? selectedAutomation.workflowNodes : initialBlueprint.nodes).map((node) => ({ ...node })));
    setEdges((selectedAutomation.workflowEdges?.length ? selectedAutomation.workflowEdges : initialBlueprint.edges).map((edge) => ({ ...edge })));
    setDirty(false);
    setSelectedNodeId('');
  }, [selectedAutomation?.id]);

  const canvas = useMemo(() => {
    const displayNodes: any[] = [];
    const displayEdges: any[] = [];
    nodes.forEach((node, index) => {
      displayNodes.push({ ...node, position: { x: 80, y: index * 220 + 20 }, kind: node.type, data: { ...node.data, warnings: node.data.warnings || [] } });
      const next = nodes[index + 1];
      if (next) {
        const addId = `add-${node.id}`;
        displayNodes.push({ id: addId, type: 'add', kind: 'add', position: { x: 180, y: index * 220 + 126 }, data: { title: 'Add Step', summary: 'Insert a step here', kind: 'add', anchorId: node.id, warnings: [], config: {} } });
        displayEdges.push({ id: `e-${node.id}-${addId}`, source: node.id, target: addId, type: 'smoothstep' });
        displayEdges.push({ id: `e-${addId}-${next.id}`, source: addId, target: next.id, type: 'smoothstep' });
      }
    });
    if (nodes.length === 0) displayNodes.push({ id: 'empty-add', type: 'add', kind: 'add', position: { x: 80, y: 80 }, data: { title: 'Add Step', summary: 'Insert the first step', kind: 'add', anchorId: '', warnings: [], config: {} } });
    return { nodes: displayNodes, edges: displayEdges };
  }, [nodes]);

  const setNodePatch = (nodeId: string, patch: Record<string, any>) => {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, config: { ...(node.data.config || {}), ...patch }, summary: patch.summary || node.data.summary } } : node));
    setDirty(true);
    setMessage('Unsaved changes');
  };

  const saveWorkflow = async (activate: boolean) => {
    if (!db || !hasPermission('manage_automation')) return;
    if (!form.name.trim()) return setMessage('Automation name is required.');
    if (!form.pipelineId || !form.stageId) return setMessage('Pipeline and stage are required.');
    const compiled = compileWorkflowToAutomation(nodes, edges, { ...form, createdBy: auth.currentUser?.uid || 'system' } as any);
    if (compiled.criticalErrors.length) return setMessage(compiled.criticalErrors[0]);
    if (!compiled.payload.metaTemplateName) return setMessage('Select an approved WhatsApp template.');
    setSaving(true); setMessage(''); setIsError(false);
    const payload: any = { ...compiled.payload, name: form.name.trim(), status: activate ? 'active' : form.status, updatedAt: serverTimestamp(), draftUpdatedAt: serverTimestamp(), publishedAt: activate ? serverTimestamp() : compiled.payload.publishedAt, publishedVersion: activate ? (compiled.payload.workflowVersion || 1) : compiled.payload.publishedVersion };
    try {
      if (selectedAutomationId) await setDoc(doc(db, 'whatsapp_automations', selectedAutomationId), payload, { merge: true });
      else setSelectedAutomationId((await addDoc(collection(db, 'whatsapp_automations'), { ...payload, createdBy: auth.currentUser?.uid || 'system', createdAt: serverTimestamp() })).id);
      setDirty(false);
      setMessage(activate ? 'Workflow activated.' : 'Draft saved.');
    } catch (error: any) { setIsError(true); setMessage(error?.message || 'Failed to save workflow.'); } finally { setSaving(false); }
  };

  const startNew = (preset: AutomationPresetKey) => {
    const blueprint = createPresetBlueprint(preset);
    setPresetKey(preset);
    setSelectedAutomationId('');
    setForm({ ...emptyForm, name: presetLabel.get(preset) || 'New automation', pipelineId: form.pipelineId, stageId: form.stageId });
    setNodes(blueprint.nodes.map((node) => ({ ...node })));
    setEdges(blueprint.edges.map((edge) => ({ ...edge })));
    setDirty(true);
    setMessage(`Started ${presetLabel.get(preset) || 'Custom'} preset.`);
  };

  const addStepAfter = (anchorId: string) => { const anchor = nodes.find((item) => item.id === anchorId); setAddAnchorId(anchorId); setAddAnchorLabel(anchor?.data.summary || anchor?.data.title || 'step'); setAddMenuOpen(true); };
  const insertStep = (anchorId: string, type: WorkflowNodeType) => { const index = nodes.findIndex((item) => item.id === anchorId); setNodes([...nodes.slice(0, index + 1), newNode(type), ...nodes.slice(index + 1)]); setAddMenuOpen(false); setDirty(true); };
  const deleteNode = (nodeId: string) => { setNodes((current) => current.filter((node) => node.id !== nodeId)); setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)); setSelectedNodeId((current) => current === nodeId ? '' : current); setDirty(true); };
  const runTest = async () => { if (!functions || !selectedAutomationId || !testLeadId) return; try { await httpsCallable(functions, 'enrollLeadInAutomation')({ automationId: selectedAutomationId, leadId: testLeadId, isTest: true }); setMessage('Test workflow started.'); setTestOpen(false); } catch (error: any) { setIsError(true); setMessage(error?.message || 'Test failed.'); } };

  if (!hasPermission('manage_automation')) return <div className="neo-card"><p className="font-semibold text-primary-dark">You do not have permission to manage automations.</p></div>;

  const topAutomations = automations.slice(0, 8);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">WhatsApp Automation Builder</h1>
          <p className="text-secondary mt-1">Visual workflow builder for WhatsApp CRM automations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {AUTOMATION_PRESETS.slice(0, 3).map((preset) => <button key={preset.key} type="button" onClick={() => startNew(preset.key)} className="neo-btn inline-flex items-center gap-2"><Plus size={14} /> {preset.label}</button>)}
        </div>
      </div>

      {message && <div className={`neo-card !p-3 text-sm flex items-start gap-2 border ${isError ? 'border-rose-500/20 bg-rose-500/5 text-rose-500' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700'}`}><CheckCircle2 size={16} className="mt-0.5" /><span>{message}</span><button type="button" className="ml-auto" onClick={() => setMessage('')}><X size={14} /></button></div>}

      <AutomationToolbar
        name={form.name}
        status={form.status}
        isDirty={dirty}
        isSaving={saving}
        running={form.status === 'active'}
        locked={workflowLock}
        onBack={() => navigate('/pipeline')}
        onToggleRunning={() => setForm((current) => ({ ...current, status: current.status === 'active' ? 'paused' : 'active' }))}
        onNameChange={(value) => { setForm((current) => ({ ...current, name: value })); setDirty(true); }}
        onTest={() => setTestOpen(true)}
        onSaveDraft={() => saveWorkflow(false)}
        onActivate={() => saveWorkflow(true)}
        onPause={() => selectedAutomationId && updateDoc(doc(db, 'whatsapp_automations', selectedAutomationId), { status: 'paused', updatedAt: serverTimestamp() })}
        onResume={() => selectedAutomationId && updateDoc(doc(db, 'whatsapp_automations', selectedAutomationId), { status: 'active', updatedAt: serverTimestamp() })}
        onFitView={() => flowRef.current?.fitView({ padding: 0.2 })}
        onZoomIn={() => flowRef.current?.zoomIn()}
        onZoomOut={() => flowRef.current?.zoomOut()}
        onToggleLock={() => setWorkflowLock((current) => !current)}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.8fr] gap-5">
        <div className="space-y-5">
          <div className="neo-card flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs text-secondary">
              <span className="rounded-full border border-shadow-darker/10 px-3 py-1">Preset: {presetLabel.get(presetKey) || 'Custom'}</span>
              <span className="rounded-full border border-shadow-darker/10 px-3 py-1">Pipeline: {pipeline?.name || '—'}</span>
              <span className="rounded-full border border-shadow-darker/10 px-3 py-1">Warnings: {validation.criticalErrors.length + Object.keys(validation.warningsByNodeId).length}</span>
            </div>
            <select className="neo-input min-w-72" value={selectedAutomationId} onChange={(event) => setSelectedAutomationId(event.target.value)}>
              <option value="">New draft</option>
              {topAutomations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <WorkflowCanvas
            nodes={canvas.nodes as any}
            edges={canvas.edges as any}
            onNodeClick={(nodeId) => setSelectedNodeId(nodeId)}
            onNodeDelete={deleteNode}
            onNodeAdd={addStepAfter}
            locked={workflowLock}
            fitViewKey={`${selectedAutomationId || 'new'}:${canvas.nodes.length}`}
            onPaneClick={() => setSelectedNodeId('')}
            onInit={(instance: ReactFlowInstance) => { flowRef.current = instance; }}
          />

          <div className="neo-card space-y-3">
            <h2 className="font-bold text-primary-dark flex items-center gap-2"><Bot size={18} /> Automations</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {topAutomations.map((automation) => <button key={automation.id} type="button" onClick={() => setSelectedAutomationId(automation.id)} className={`rounded-2xl border px-3 py-2 text-left ${selectedAutomationId === automation.id ? 'border-primary/30 bg-primary/5' : 'border-shadow-darker/10 bg-surface'}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold text-primary-dark">{automation.name}</span><span className="text-xs text-secondary">{automation.status}</span></div><div className="text-xs text-secondary mt-1">{automation.pipelineId} · {automation.stageId} · {fmt(automation.updatedAt || automation.createdAt)}</div></button>)}
            </div>
          </div>
        </div>

        <aside className="neo-card sticky top-24 space-y-4">
          {!selectedNode ? (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-primary-dark">Workflow settings</h3>
              <label className="block text-sm font-semibold text-primary-dark">Automation name<input className="neo-input w-full mt-1" value={form.name} onChange={(event) => { setForm((current) => ({ ...current, name: event.target.value })); setDirty(true); }} /></label>
              <label className="block text-sm font-semibold text-primary-dark">Purpose preset<select className="neo-input w-full mt-1" value={presetKey} onChange={(event) => setPresetKey(event.target.value as AutomationPresetKey)}>{AUTOMATION_PRESETS.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-semibold text-primary-dark">Pipeline<select className="neo-input w-full mt-1" value={form.pipelineId} onChange={(event) => { setForm((current) => ({ ...current, pipelineId: event.target.value })); setDirty(true); }}><option value="">Select pipeline</option>{pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="block text-sm font-semibold text-primary-dark">Stage<select className="neo-input w-full mt-1" value={form.stageId} onChange={(event) => { setForm((current) => ({ ...current, stageId: event.target.value })); setDirty(true); }}><option value="">Select stage</option>{stageOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              </div>
              <label className="block text-sm font-semibold text-primary-dark">Audience mode<select className="neo-input w-full mt-1" value={form.audienceMode} onChange={(event) => { setForm((current) => ({ ...current, audienceMode: event.target.value as any })); setDirty(true); }}><option value="future_leads">Future leads only</option><option value="current_leads">Current leads only</option><option value="current_and_future">Current and future leads</option></select></label>
              <label className="block text-sm font-semibold text-primary-dark">Template name<input className="neo-input w-full mt-1" value={form.metaTemplateName} onChange={(event) => { setForm((current) => ({ ...current, metaTemplateName: event.target.value })); setDirty(true); }} /></label>
              <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold text-primary-dark">Delay days<input className="neo-input w-full mt-1" type="number" value={form.delayDays} onChange={(event) => { setForm((current) => ({ ...current, delayDays: Number(event.target.value) })); setDirty(true); }} /></label><label className="block text-sm font-semibold text-primary-dark">Send time<input className="neo-input w-full mt-1" type="time" value={form.sendTime} onChange={(event) => { setForm((current) => ({ ...current, sendTime: event.target.value })); setDirty(true); }} /></label></div>
              <button type="button" className="neo-btn-primary w-full" onClick={() => saveWorkflow(false)} disabled={saving}>{saving ? <Loader2 className="animate-spin mr-2 inline" size={14} /> : <Save size={14} className="inline mr-2" />} Save draft</button>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-primary-dark">Node settings</h3>
              <p className="text-sm text-secondary">{selectedNode.data.summary}</p>
              <label className="block text-sm font-semibold text-primary-dark">Summary<input className="neo-input w-full mt-1" value={selectedNode.data.summary} onChange={(event) => setNodePatch(selectedNode.id, { summary: event.target.value })} /></label>
              {selectedNode.type === 'trigger' && <label className="block text-sm font-semibold text-primary-dark">Stage<select className="neo-input w-full mt-1" value={selectedNode.data.config?.stageId || form.stageId} onChange={(event) => setNodePatch(selectedNode.id, { stageId: event.target.value })}><option value="">Select stage</option>{stageOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
              {selectedNode.type === 'whatsapp' && <label className="block text-sm font-semibold text-primary-dark">Meta template<input className="neo-input w-full mt-1" value={selectedNode.data.config?.metaTemplateName || form.metaTemplateName} onChange={(event) => setNodePatch(selectedNode.id, { metaTemplateName: event.target.value })} /></label>}
              {(selectedNode.type === 'delay' || selectedNode.type === 'review_delay') && <label className="block text-sm font-semibold text-primary-dark">Wait days<input className="neo-input w-full mt-1" type="number" value={selectedNode.data.config?.value || form.delayDays} onChange={(event) => setNodePatch(selectedNode.id, { value: Number(event.target.value) })} /></label>}
              <button type="button" className="neo-btn w-full" onClick={() => setSelectedNodeId('')}>Close</button>
            </div>
          )}
        </aside>
      </div>

      <AddStepMenu open={addMenuOpen} anchorLabel={addAnchorLabel} allowedTypes={['condition', 'delay', 'whatsapp', 'payment_condition', 'production_condition', 'dispatch_condition', 'review_delay', 'stop_condition', 'end']} onChoose={(type) => insertStep(addAnchorId, type)} onClose={() => setAddMenuOpen(false)} />

      {testOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="neo-card w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-xl font-bold text-primary-dark">Test Workflow</h3><button type="button" className="neo-btn !px-3 !py-2" onClick={() => setTestOpen(false)}><X size={14} /></button></div>
            <label className="block text-sm font-semibold text-primary-dark">Test lead<select className="neo-input w-full mt-1" value={testLeadId} onChange={(event) => { setTestLeadId(event.target.value); const lead = leads.find((item) => item.id === event.target.value); setTestPhone(lead?.phone || ''); }}><option value="">Select lead</option>{leads.filter((lead) => lead.phone).map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.phone}</option>)}</select></label>
            <label className="block text-sm font-semibold text-primary-dark">Manual number<input className="neo-input w-full mt-1" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} /></label>
            <div className="flex justify-end gap-2"><button type="button" className="neo-btn" onClick={() => setTestOpen(false)}>Cancel</button><button type="button" className="neo-btn-primary inline-flex items-center gap-2" onClick={runTest}><Send size={14} /> Run Test</button></div>
          </div>
        </div>
      )}

      {!validation.criticalErrors.length ? null : <div className="neo-card text-sm text-rose-600 border border-rose-500/20 bg-rose-500/5"><AlertTriangle size={14} className="inline mr-2" /> {validation.criticalErrors[0]}</div>}
    </div>
  );
}



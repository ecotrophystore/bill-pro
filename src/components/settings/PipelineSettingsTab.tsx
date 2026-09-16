import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Plus,
  Save,
  Trash2,
  Edit2,
  MoveUp,
  MoveDown,
  MessageSquare,
  Sparkles,
  Phone,
  Mail,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Bot,
  HelpCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import {
  type Pipeline,
  type PipelineStage,
  type PipelineRule,
  type StageMessageConfig,
  STANDARD_CRM_STAGES,
  DEFAULT_QUANTITY_PIPELINES,
} from '../../types';
import {
  DEFAULT_STAGE_MESSAGES,
  AVAILABLE_TEMPLATE_VARIABLES,
  renderTemplateText,
  buildTemplateContext,
} from '../../utils/templateVariables';

export default function PipelineSettingsTab() {
  const [subTab, setSubTab] = useState<'stage_messages' | 'pipelines' | 'rules' | 'integrations'>('stage_messages');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stageMessages, setStageMessages] = useState<Record<string, StageMessageConfig>>({});
  const [rules, setRules] = useState<PipelineRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Stage message editor selected stage
  const [selectedStageId, setSelectedStageId] = useState<string>('design_stage');
  const [editingConfig, setEditingConfig] = useState<StageMessageConfig | null>(null);

  // New pipeline modal / draft state
  const [pipelineDraft, setPipelineDraft] = useState<Partial<Pipeline>>({
    name: '',
    scenario: '',
    stages: STANDARD_CRM_STAGES,
  });
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null);

  // New rule draft state
  const [ruleDraft, setRuleDraft] = useState<Partial<PipelineRule>>({
    name: '',
    pipeline_id: 'bulk_order',
    field: 'required_quantity',
    operator: 'greater_than_or_equal',
    value: 100,
    is_active: true,
    priority: 1,
  });

  useEffect(() => {
    if (!db) return;

    // Load pipelines
    const unsubPipelines = onSnapshot(collection(db, 'pipelines'), (snap) => {
      if (snap.empty) {
        setPipelines(DEFAULT_QUANTITY_PIPELINES);
      } else {
        const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pipeline));
        const existingIds = new Set(loaded.map((p) => p.id));
        const merged = [...loaded];
        DEFAULT_QUANTITY_PIPELINES.forEach((def) => {
          if (!existingIds.has(def.id)) merged.push(def);
        });
        setPipelines(merged);
      }
      setLoading(false);
    });

    // Load stage messages
    const unsubStageMessages = onSnapshot(collection(db, 'stage_messages'), (snap) => {
      const map: Record<string, StageMessageConfig> = {};
      snap.docs.forEach((d) => {
        map[d.id] = { id: d.id, ...d.data() } as StageMessageConfig;
      });
      setStageMessages(map);
    });

    // Load pipeline rules
    const unsubRules = onSnapshot(collection(db, 'pipeline_rules'), (snap) => {
      const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PipelineRule));
      setRules(loaded);
    });

    return () => {
      unsubPipelines();
      unsubStageMessages();
      unsubRules();
    };
  }, []);

  // Update editing config when selected stage changes
  useEffect(() => {
    const stage = STANDARD_CRM_STAGES.find((s) => s.id === selectedStageId) || STANDARD_CRM_STAGES[0];
    const existing = stageMessages[stage.id];

    if (existing) {
      setEditingConfig({ ...existing });
    } else {
      const preset = DEFAULT_STAGE_MESSAGES[stage.id] || {};
      setEditingConfig({
        id: stage.id,
        stage_id: stage.id,
        stage_name: stage.label,
        pipeline_id: 'all',
        whatsapp_enabled: preset.whatsapp_enabled !== false,
        whatsapp_template: preset.whatsapp_template || '',
        sms_enabled: preset.sms_enabled === true,
        sms_template: preset.sms_template || '',
        email_enabled: preset.email_enabled === true,
        email_subject: preset.email_subject || '',
        email_template: preset.email_template || '',
        delay_minutes: 0,
        is_active: true,
      });
    }
  }, [selectedStageId, stageMessages]);

  const handleSaveStageMessage = async () => {
    if (!db || !editingConfig) return;
    setSaving(true);
    setStatusMessage(null);

    try {
      await setDoc(doc(db, 'stage_messages', editingConfig.stage_id), {
        ...editingConfig,
        updated_at: serverTimestamp(),
      });
      setStatusMessage({ type: 'success', text: `Saved automated messages for stage "${editingConfig.stage_name}"!` });
    } catch (err: any) {
      console.error('Failed to save stage message:', err);
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to save stage message config.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePipeline = async () => {
    if (!db || !pipelineDraft.name?.trim()) return;
    setSaving(true);
    setStatusMessage(null);

    try {
      const payload = {
        name: pipelineDraft.name.trim(),
        scenario: pipelineDraft.scenario?.trim() || '',
        stages: pipelineDraft.stages || STANDARD_CRM_STAGES,
        updated_at: serverTimestamp(),
      };

      if (editingPipelineId) {
        await setDoc(doc(db, 'pipelines', editingPipelineId), payload, { merge: true });
        setStatusMessage({ type: 'success', text: `Updated pipeline "${payload.name}"!` });
      } else {
        await addDoc(collection(db, 'pipelines'), {
          ...payload,
          is_default: false,
          created_at: serverTimestamp(),
        });
        setStatusMessage({ type: 'success', text: `Created new pipeline "${payload.name}"!` });
      }

      setEditingPipelineId(null);
      setPipelineDraft({ name: '', scenario: '', stages: STANDARD_CRM_STAGES });
    } catch (err: any) {
      console.error('Failed to save pipeline:', err);
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to save pipeline.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePipeline = async (pipeId: string, pipeName: string) => {
    if (!db) return;
    if (pipeId === 'small_order' || pipeId === 'regular_order' || pipeId === 'bulk_order') {
      alert('Default quantity pipelines cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete pipeline "${pipeName}"?`)) return;

    try {
      await deleteDoc(doc(db, 'pipelines', pipeId));
      setStatusMessage({ type: 'success', text: `Deleted pipeline "${pipeName}".` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete pipeline.' });
    }
  };

  const handleInsertVariable = (variable: string) => {
    if (!editingConfig) return;
    setEditingConfig({
      ...editingConfig,
      whatsapp_template: `${editingConfig.whatsapp_template} ${variable}`,
    });
  };

  const handleAddRule = async () => {
    if (!db || !ruleDraft.name?.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'pipeline_rules'), {
        ...ruleDraft,
        created_at: serverTimestamp(),
      });
      setRuleDraft({
        name: '',
        pipeline_id: 'bulk_order',
        field: 'required_quantity',
        operator: 'greater_than_or_equal',
        value: 100,
        is_active: true,
        priority: rules.length + 1,
      });
      setStatusMessage({ type: 'success', text: 'Added new pipeline classification rule!' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to add rule.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!db || !window.confirm('Delete this classification rule?')) return;
    try {
      await deleteDoc(doc(db, 'pipeline_rules', ruleId));
      setStatusMessage({ type: 'success', text: 'Rule deleted.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to delete rule.' });
    }
  };

  const sampleContext = buildTemplateContext(
    {
      name: 'Karthik Raja',
      company: 'Rotary Club',
      required_quantity: 50,
      value: 35000,
      event_name: 'Annual Awards 2026',
      event_date: '24 Oct 2026',
      delivery_date: '20 Oct 2026',
      sales_person: 'Monisha',
      tracking_number: 'ST49201928',
    },
    editingConfig?.stage_name || 'Design Stage',
    'Requirement Confirmed'
  );

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-3 flex-wrap">
        <button
          onClick={() => setSubTab('stage_messages')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            subTab === 'stage_messages'
              ? 'bg-primary text-white shadow-sm'
              : 'text-secondary hover:text-primary-dark hover:bg-slate-100'
          }`}
        >
          <MessageSquare size={14} /> Stage Messages & Notifications
        </button>

        <button
          onClick={() => setSubTab('pipelines')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            subTab === 'pipelines'
              ? 'bg-primary text-white shadow-sm'
              : 'text-secondary hover:text-primary-dark hover:bg-slate-100'
          }`}
        >
          <Sliders size={14} /> Manage Pipelines ({pipelines.length})
        </button>

        <button
          onClick={() => setSubTab('rules')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            subTab === 'rules'
              ? 'bg-primary text-white shadow-sm'
              : 'text-secondary hover:text-primary-dark hover:bg-slate-100'
          }`}
        >
          <Sparkles size={14} /> Automatic Pipeline Rules ({rules.length})
        </button>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)}>
            <AlertCircle size={14} />
          </button>
        </div>
      )}

      {/* SUB-TAB 1: Stage Messages Configuration */}
      {subTab === 'stage_messages' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Stage Selector Sidebar */}
          <div className="md:col-span-4 neo-card space-y-2 p-3 bg-slate-50/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-secondary px-2 block">
              Select Stage to Configure
            </span>
            <div className="space-y-1 max-h-[560px] overflow-y-auto pr-1">
              {STANDARD_CRM_STAGES.map((s, idx) => {
                const isSelected = s.id === selectedStageId;
                const isConfigured = Boolean(stageMessages[s.id]?.whatsapp_template);
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStageId(s.id)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-primary text-white shadow-sm scale-[1.02]'
                        : 'text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    <span>
                      {idx + 1}. {s.label}
                    </span>
                    {isConfigured && (
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stage Message Editor Form */}
          {editingConfig && (
            <div className="md:col-span-8 neo-card space-y-5">
              <div className="flex items-start justify-between gap-3 border-b border-shadow-darker/10 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Stage Message Configuration</span>
                  <h3 className="text-lg font-extrabold text-primary-dark mt-0.5">{editingConfig.stage_name}</h3>
                </div>
                <button
                  type="button"
                  onClick={handleSaveStageMessage}
                  disabled={saving}
                  className="neo-btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save Stage Message
                </button>
              </div>

              {/* Variable Insertion Chips */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-secondary block">
                  Click variable to insert into template:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.variable}
                      type="button"
                      onClick={() => handleInsertVariable(v.variable)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 border border-shadow-darker/10 text-primary-dark hover:bg-primary/10 hover:border-primary/30 transition-colors"
                      title={v.label}
                    >
                      {v.variable}
                    </button>
                  ))}
                </div>
              </div>

              {/* WhatsApp Message Section */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <Phone size={13} className="text-emerald-600" />
                    WhatsApp Customer Notification
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-emerald-900">
                    <input
                      type="checkbox"
                      checked={editingConfig.whatsapp_enabled}
                      onChange={(e) => setEditingConfig({ ...editingConfig, whatsapp_enabled: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    Enable WhatsApp
                  </label>
                </div>

                <textarea
                  className="neo-input w-full text-xs min-h-[90px] font-sans"
                  value={editingConfig.whatsapp_template}
                  onChange={(e) => setEditingConfig({ ...editingConfig, whatsapp_template: e.target.value })}
                  placeholder="Type WhatsApp message template..."
                />

                {/* WhatsApp Live Preview */}
                <div className="p-3 rounded-xl bg-white border border-emerald-100 text-xs">
                  <span className="text-[10px] font-bold text-secondary block mb-1">Live WhatsApp Preview:</span>
                  <p className="text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                    {renderTemplateText(editingConfig.whatsapp_template, sampleContext)}
                  </p>
                </div>
              </div>

              {/* SMS Message Section */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-sky-50/50 border border-sky-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                    📱 SMS Notification
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-sky-900">
                    <input
                      type="checkbox"
                      checked={editingConfig.sms_enabled}
                      onChange={(e) => setEditingConfig({ ...editingConfig, sms_enabled: e.target.checked })}
                      className="rounded text-sky-600 focus:ring-sky-500"
                    />
                    Enable SMS
                  </label>
                </div>

                <textarea
                  className="neo-input w-full text-xs min-h-[60px]"
                  value={editingConfig.sms_template}
                  onChange={(e) => setEditingConfig({ ...editingConfig, sms_template: e.target.value })}
                  placeholder="Type SMS message template..."
                />
              </div>

              {/* Email Notification Section */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Mail size={13} className="text-indigo-600" />
                    Email Notification
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-indigo-900">
                    <input
                      type="checkbox"
                      checked={editingConfig.email_enabled}
                      onChange={(e) => setEditingConfig({ ...editingConfig, email_enabled: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    Enable Email
                  </label>
                </div>

                <input
                  type="text"
                  className="neo-input w-full text-xs mb-1"
                  placeholder="Email Subject Line..."
                  value={editingConfig.email_subject || ''}
                  onChange={(e) => setEditingConfig({ ...editingConfig, email_subject: e.target.value })}
                />

                <textarea
                  className="neo-input w-full text-xs min-h-[80px]"
                  value={editingConfig.email_template}
                  onChange={(e) => setEditingConfig({ ...editingConfig, email_template: e.target.value })}
                  placeholder="Type Email body template..."
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: Manage Pipelines */}
      {subTab === 'pipelines' && (
        <div className="space-y-6">
          <div className="neo-card space-y-4">
            <h3 className="text-sm font-bold text-primary-dark">
              {editingPipelineId ? 'Edit Pipeline' : 'Create Custom Pipeline'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-primary-dark">Pipeline Name</label>
                <input
                  type="text"
                  className="neo-input w-full"
                  placeholder="e.g. Corporate Orders / School Orders"
                  value={pipelineDraft.name || ''}
                  onChange={(e) => setPipelineDraft({ ...pipelineDraft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-primary-dark">Description / Criteria</label>
                <input
                  type="text"
                  className="neo-input w-full"
                  placeholder="e.g. Annual Trophy Requirement >= 50"
                  value={pipelineDraft.scenario || ''}
                  onChange={(e) => setPipelineDraft({ ...pipelineDraft, scenario: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {editingPipelineId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPipelineId(null);
                    setPipelineDraft({ name: '', scenario: '', stages: STANDARD_CRM_STAGES });
                  }}
                  className="neo-btn text-xs"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="button"
                onClick={handleSavePipeline}
                disabled={saving || !pipelineDraft.name?.trim()}
                className="neo-btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5"
              >
                <Save size={13} /> {editingPipelineId ? 'Update Pipeline' : 'Create Pipeline'}
              </button>
            </div>
          </div>

          {/* Existing Pipelines Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-secondary uppercase tracking-wider">Active Pipelines</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pipelines.map((pipe) => (
                <div key={pipe.id} className="neo-card p-4 space-y-3 border border-shadow-darker/10">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-primary-dark">{pipe.name}</h4>
                      <span className="text-xs text-secondary">{pipe.scenario || 'General Pipeline'}</span>
                    </div>
                    {pipe.is_default && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                        Default
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-secondary font-medium">
                    {pipe.stages?.length || STANDARD_CRM_STAGES.length} stages configured
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-shadow-darker/10">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPipelineId(pipe.id);
                        setPipelineDraft({
                          name: pipe.name,
                          scenario: pipe.scenario || '',
                          stages: pipe.stages || STANDARD_CRM_STAGES,
                        });
                      }}
                      className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-primary-dark hover:bg-slate-200"
                    >
                      Edit
                    </button>
                    {!pipe.is_default && (
                      <button
                        type="button"
                        onClick={() => handleDeletePipeline(pipe.id, pipe.name)}
                        className="text-xs font-semibold px-2.5 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Automatic Pipeline Classification Rules */}
      {subTab === 'rules' && (
        <div className="space-y-6">
          <div className="neo-card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-primary-dark">Create Classification Rule</h3>
                <p className="text-xs text-secondary">
                  Automatically assign new leads to specific pipelines based on order quantity or value.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-primary-dark">Rule Name</label>
                <input
                  type="text"
                  className="neo-input w-full"
                  placeholder="e.g. Bulk Order (100+ pcs)"
                  value={ruleDraft.name}
                  onChange={(e) => setRuleDraft({ ...ruleDraft, name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-primary-dark">Condition Field</label>
                <select
                  className="neo-input w-full"
                  value={ruleDraft.field}
                  onChange={(e) => setRuleDraft({ ...ruleDraft, field: e.target.value as any })}
                >
                  <option value="required_quantity">Required Quantity</option>
                  <option value="value">Order Value (₹)</option>
                  <option value="location">Location / City</option>
                  <option value="urgency">Urgency</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-primary-dark">Operator & Value</label>
                <div className="flex gap-1.5">
                  <select
                    className="neo-input w-1/2"
                    value={ruleDraft.operator}
                    onChange={(e) => setRuleDraft({ ...ruleDraft, operator: e.target.value as any })}
                  >
                    <option value="greater_than_or_equal">&gt;=</option>
                    <option value="less_than_or_equal">&lt;=</option>
                    <option value="equals">=</option>
                  </select>
                  <input
                    type="text"
                    className="neo-input w-1/2 font-bold"
                    value={ruleDraft.value}
                    onChange={(e) => setRuleDraft({ ...ruleDraft, value: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-primary-dark">Assign to Pipeline</label>
                <select
                  className="neo-input w-full font-bold text-emerald-800"
                  value={ruleDraft.pipeline_id}
                  onChange={(e) => setRuleDraft({ ...ruleDraft, pipeline_id: e.target.value })}
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleAddRule}
                disabled={saving || !ruleDraft.name?.trim()}
                className="neo-btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
              >
                <Plus size={13} /> Add Classification Rule
              </button>
            </div>
          </div>

          {/* Existing Rules List */}
          <div className="neo-card space-y-3">
            <h4 className="text-xs font-bold text-secondary uppercase tracking-wider">Configured Rules ({rules.length})</h4>
            {rules.length === 0 ? (
              <div className="py-6 text-center text-xs text-secondary">
                Using default quantity-based classification (Small &lt;10, Regular 10–99, Bulk &gt;=100).
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3 rounded-xl bg-slate-50 border border-shadow-darker/10 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-bold text-primary-dark">{rule.name}</span>
                      <span className="text-secondary ml-2">
                        If <strong>{rule.field}</strong> {rule.operator} <strong>{rule.value}</strong> ➔ Assign to{' '}
                        <strong className="text-emerald-700">
                          {pipelines.find((p) => p.id === rule.pipeline_id)?.name || rule.pipeline_id}
                        </strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1 rounded text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

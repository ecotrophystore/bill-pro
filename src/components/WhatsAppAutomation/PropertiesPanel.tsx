import { Settings2, Plus, X, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { Pipeline } from '../../types';

interface PropertiesPanelProps {
  selectedNode: Node | null;
  onUpdateNodeData: (nodeId: string, newData: any) => void;
  allPipelines: Pipeline[];
}

export function PropertiesPanel({ selectedNode, onUpdateNodeData, allPipelines }: PropertiesPanelProps) {
  if (!selectedNode) {
    return (
      <div className="w-80 bg-white border-l border-shadow-darker/10 flex flex-col h-full shrink-0 z-10 p-6 items-center justify-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
          <Settings2 size={20} className="text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-primary-dark">No Node Selected</p>
        <p className="text-xs text-secondary mt-1">Select a node on the canvas to configure its properties.</p>
      </div>
    );
  }

  const { type, data } = selectedNode;
  const config: any = data.config || {};

  const handleConfigChange = (key: string, value: any) => {
    onUpdateNodeData(selectedNode.id, {
      ...data,
      config: { ...config, [key]: value },
    });
  };

  const renderTriggerProperties = () => {
    const selectedPipeline = allPipelines.find(p => p.id === config.pipelineId);
    const stages = selectedPipeline?.stages || [];

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-1.5">Pipeline</label>
          <select
            className="neo-input w-full"
            value={config.pipelineId || ''}
            onChange={(e) => {
              const newPipelineId = e.target.value;
              onUpdateNodeData(selectedNode.id, {
                ...data,
                config: { ...config, pipelineId: newPipelineId, stageId: '' },
                summary: `Enters ${allPipelines.find(p => p.id === newPipelineId)?.name || 'Pipeline'}`,
              });
            }}
          >
            <option value="">Select Pipeline...</option>
            {allPipelines.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-1.5">Pipeline Stage</label>
          <select
            className="neo-input w-full"
            value={config.stageId || ''}
            onChange={(e) => {
              const stageName = stages.find(s => s.id === e.target.value)?.label || 'Stage';
              const pName = selectedPipeline?.name || 'Pipeline';
              onUpdateNodeData(selectedNode.id, {
                ...data,
                config: { ...config, stageId: e.target.value },
                summary: `Enters ${pName} → ${stageName}`,
              });
            }}
            disabled={!config.pipelineId}
          >
            <option value="">Select Stage...</option>
            {stages.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-1.5">Audience Mode</label>
          <select
            className="neo-input w-full"
            value={config.audienceMode || 'current_and_future'}
            onChange={(e) => handleConfigChange('audienceMode', e.target.value)}
          >
            <option value="current_leads">Current leads only</option>
            <option value="future_leads">Future leads only</option>
            <option value="current_and_future">Current and future leads</option>
          </select>
        </div>
      </div>
    );
  };

  const renderWhatsAppProperties = () => {
    const mappings = config.variableMappings || {};
    const varKeys = Object.keys(mappings).length ? Object.keys(mappings) : ['1', '2'];

    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-500 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Template name must match Meta Business Manager exactly.
        </div>
        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-1.5">Meta Template Name</label>
          <input
            className="neo-input w-full font-mono"
            placeholder="e.g. welcome_lead"
            value={config.metaTemplateName || ''}
            onChange={(e) => {
              onUpdateNodeData(selectedNode.id, {
                ...data,
                config: { ...config, metaTemplateName: e.target.value },
                summary: `Template: ${e.target.value || 'Not set'}`,
              });
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-1.5">Template Language</label>
          <select
            className="neo-input w-full"
            value={config.templateLanguage || 'en_US'}
            onChange={(e) => handleConfigChange('templateLanguage', e.target.value)}
          >
            <option value="en_US">en_US (English US)</option>
            <option value="en">en (English)</option>
            <option value="hi">hi (Hindi)</option>
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="text-sm font-semibold text-primary-dark">Variables</label>
            <button
              onClick={() => {
                const newKey = String(varKeys.length + 1);
                handleConfigChange('variableMappings', { ...mappings, [newKey]: '' });
              }}
              className="text-primary hover:text-primary-dark text-xs font-semibold flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          <div className="space-y-2">
            {varKeys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="neo-input !w-12 text-center font-mono text-xs shrink-0 !py-1.5 px-1">{`{{${key}}}`}</span>
                <ChevronRight size={14} className="text-secondary shrink-0" />
                <select
                  className="neo-input flex-1 !py-1.5 px-2 text-xs"
                  value={mappings[key] || ''}
                  onChange={(e) => {
                    const next = { ...mappings, [key]: e.target.value };
                    handleConfigChange('variableMappings', next);
                  }}
                >
                  <option value="">Select field...</option>
                  <option value="name">name</option>
                  <option value="phone">phone</option>
                  <option value="email">email</option>
                </select>
                <button
                  onClick={() => {
                    const next = { ...mappings };
                    delete next[key];
                    handleConfigChange('variableMappings', next);
                  }}
                  className="text-secondary hover:text-rose-400 p-1"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderDelayProperties = () => {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-1.5">Wait For (Days)</label>
          <input
            type="number"
            min={0}
            className="neo-input w-full"
            value={config.delayDays ?? 1}
            onChange={(e) => {
              const days = Number(e.target.value);
              onUpdateNodeData(selectedNode.id, {
                ...data,
                config: { ...config, delayDays: days },
                summary: `Wait ${days} day(s)`,
              });
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-1.5">Send Time</label>
          <input
            type="time"
            className="neo-input w-full"
            value={config.sendTime || '10:00'}
            onChange={(e) => handleConfigChange('sendTime', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-1.5">Timezone</label>
          <select
            className="neo-input w-full"
            value={config.timezone || 'Asia/Kolkata'}
            onChange={(e) => handleConfigChange('timezone', e.target.value)}
          >
            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 bg-white border-l border-shadow-darker/10 flex flex-col h-full shrink-0 z-10">
      <div className="p-4 border-b border-shadow-darker/10 flex items-center justify-between">
        <h2 className="text-sm font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
          Properties
        </h2>
        <div className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest">
          {type}
        </div>
      </div>

      <div className="p-5 overflow-y-auto flex-1">
        {type === 'trigger' && renderTriggerProperties()}
        {type === 'whatsapp' && renderWhatsAppProperties()}
        {type === 'delay' && renderDelayProperties()}
        {type === 'condition' && (
          <div className="text-sm text-secondary">
            Condition logic is currently handled globally in automation settings.
          </div>
        )}
      </div>
    </div>
  );
}
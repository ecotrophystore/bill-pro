import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, Check, AlertCircle, Save, X, Bot, RefreshCw, AlertTriangle, Settings2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { nodeTypes } from './CustomNodes';
import type { Pipeline, WhatsAppAutomation, WorkflowNodeConfig, WorkflowEdgeConfig } from '../../types';

interface WorkflowBuilderProps {
  initialData?: Partial<WhatsAppAutomation>;
  allPipelines: Pipeline[];
  onSave: (compiledData: Partial<WhatsAppAutomation>) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

const initialNodes: Node[] = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 250, y: 100 },
    data: {
      title: 'Trigger Event',
      summary: 'Start when lead enters stage',
      icon: 'play',
      config: { pipelineId: '', stageId: '', audienceMode: 'current_and_future' }
    },
  },
];

let id = 0;
const getId = () => `node_${id++}_${Date.now()}`;

function BuilderContext({ initialData, allPipelines, onSave, onCancel, saving }: WorkflowBuilderProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  // Try to load existing nodes from initialData
  const defaultNodes = initialData?.workflowNodes?.length 
    ? (initialData.workflowNodes as unknown as Node[]) 
    : initialNodes;
    
  const defaultEdges = initialData?.workflowEdges?.length
    ? (initialData.workflowEdges as unknown as Edge[])
    : [];

  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Name and Global Configs
  const [name, setName] = useState(initialData?.name || '');
  const [status, setStatus] = useState(initialData?.status || 'draft');
  const [globalSettings, setGlobalSettings] = useState({
    stopOnReply: initialData?.stopOnReply ?? true,
    stopOnStageChange: initialData?.stopOnStageChange ?? true,
    skipWon: initialData?.skipWon ?? true,
    skipLost: initialData?.skipLost ?? true,
    skipOptedOut: initialData?.skipOptedOut ?? true,
    preventDuplicate: initialData?.preventDuplicate ?? true,
    maxMessagesPerLead: initialData?.maxMessagesPerLead ?? 3,
  });

  const [errorMsg, setErrorMsg] = useState('');

  // Handle Selection
  useEffect(() => {
    const selected = nodes.find((n) => n.selected);
    if (selected) {
      setSelectedNodeId(selected.id);
    } else {
      setSelectedNodeId(null);
    }
  }, [nodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ 
      ...params, 
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#94a3b8' },
      style: { strokeWidth: 2, stroke: '#94a3b8' } 
    }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;

      const position = {
        x: event.clientX - (reactFlowWrapper.current?.getBoundingClientRect().left ?? 0) - 140,
        y: event.clientY - (reactFlowWrapper.current?.getBoundingClientRect().top ?? 0) - 40,
      };

      const newNode: Node = {
        id: getId(),
        type,
        position,
        data: {
          title: type === 'whatsapp' ? 'WhatsApp Message' : type === 'delay' ? 'Time Delay' : 'Condition',
          summary: 'Configure in properties',
          icon: type === 'whatsapp' ? 'bot' : type === 'delay' ? 'clock' : 'split',
          config: {}
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
  );

  const updateNodeData = useCallback((nodeId: string, newData: any) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return { ...n, data: newData };
        }
        return n;
      })
    );
  }, [setNodes]);

  const handleCompileAndSave = async () => {
    setErrorMsg('');
    if (!name.trim()) {
      setErrorMsg('Automation name is required.');
      return;
    }

    // Validation
    const triggers = nodes.filter(n => n.type === 'trigger');
    if (triggers.length === 0) {
      setErrorMsg('Workflow must have a Trigger node.');
      return;
    }
    if (triggers.length > 1) {
      setErrorMsg('Workflow can only have one Trigger node.');
      return;
    }

    const triggerNode = triggers[0];
    const triggerConfig: any = triggerNode.data.config || {};
    if (!triggerConfig.pipelineId || !triggerConfig.stageId) {
      setErrorMsg('Trigger node must have a Pipeline and Stage selected.');
      return;
    }

    const whatsappNodes = nodes.filter(n => n.type === 'whatsapp');
    if (whatsappNodes.length === 0) {
      setErrorMsg('Workflow must have at least one WhatsApp Message node.');
      return;
    }
    
    // For MVP compilation: We walk from trigger to find delay and whatsapp
    // Currently backend supports 1 delay + 1 whatsapp (with optional repeat)
    let currentId = triggerNode.id;
    let scheduleType = 'immediate';
    let delayDays = 0;
    let sendTime = '10:00';
    let timezone = 'Asia/Kolkata';
    let whatsappConfig: any = null;

    let iterationCount = 0;
    while (currentId && iterationCount < 10) {
      iterationCount++;
      const outgoingEdge = edges.find(e => e.source === currentId);
      if (!outgoingEdge) break;

      const nextNode = nodes.find(n => n.id === outgoingEdge.target);
      if (!nextNode) break;

      if (nextNode.type === 'delay') {
        const delayConfig: any = nextNode.data.config || {};
        scheduleType = 'days_after_stage';
        delayDays = Number(delayConfig.delayDays || 1);
        sendTime = delayConfig.sendTime || '10:00';
        timezone = delayConfig.timezone || 'Asia/Kolkata';
      }

      if (nextNode.type === 'whatsapp') {
        whatsappConfig = nextNode.data.config;
        break; // Stop after finding first whatsapp node for flat config
      }
      
      currentId = nextNode.id;
    }

    if (!whatsappConfig || !whatsappConfig.metaTemplateName) {
      setErrorMsg('WhatsApp Message node must have a Meta Template Name configured.');
      return;
    }

    // Prepare payload
    const compiledPayload: Partial<WhatsAppAutomation> = {
      name: name.trim(),
      status: status as any,
      pipelineId: triggerConfig.pipelineId,
      stageId: triggerConfig.stageId,
      audienceMode: triggerConfig.audienceMode || 'current_and_future',
      scheduleType: scheduleType as any,
      delayDays,
      sendTime,
      timezone,
      metaTemplateName: whatsappConfig.metaTemplateName,
      templateLanguage: whatsappConfig.templateLanguage || 'en_US',
      variableMappings: whatsappConfig.variableMappings || {},
      
      // Global settings
      ...globalSettings,

      // Save raw graph
      workflowNodes: nodes as unknown as WorkflowNodeConfig[],
      workflowEdges: edges as unknown as WorkflowEdgeConfig[],
    };

    try {
      await onSave(compiledPayload);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save automation.');
    }
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  return (
    <div className="flex flex-col h-[85vh] bg-slate-50/50 rounded-2xl border border-shadow-darker/10 overflow-hidden shadow-sm">
      {/* Top Bar */}
      <div className="bg-white border-b border-shadow-darker/10 px-4 py-3 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shrink-0">
            <Bot size={20} className="text-white" />
          </div>
          <div className="flex-1 max-w-sm">
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Automation Name" 
              className="w-full text-lg font-bold text-primary-dark bg-transparent border-none focus:ring-0 p-0 placeholder:text-slate-300"
            />
          </div>
          <div className="h-8 w-px bg-shadow-darker/10 mx-2"></div>
          <select 
            value={status} 
            onChange={e => setStatus(e.target.value as any)}
            className="neo-input !py-1.5 text-sm font-semibold text-primary-dark w-32"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          {errorMsg && (
            <div className="text-rose-500 text-sm font-medium flex items-center gap-1.5 bg-rose-500/10 px-3 py-1.5 rounded-lg mr-2">
              <AlertCircle size={14} /> {errorMsg}
            </div>
          )}
          <button onClick={onCancel} className="neo-btn text-sm inline-flex items-center gap-1.5">
            <X size={16} /> Cancel
          </button>
          <button 
            onClick={handleCompileAndSave} 
            disabled={saving}
            className="neo-btn-primary text-sm inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Automation
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.5 }}
            defaultEdgeOptions={{ 
              type: 'smoothstep',
              markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#94a3b8' },
              style: { strokeWidth: 2, stroke: '#94a3b8' }
            }}
          >
            <Background color="#cbd5e1" gap={24} size={2} />
            <Controls className="bg-white border-shadow-darker/10 shadow-sm rounded-xl overflow-hidden [&>button]:border-b [&>button]:border-shadow-darker/5" />
          </ReactFlow>

          {/* Global Settings overlay button (can be placed absolutely) */}
          <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-md p-3 rounded-2xl border border-shadow-darker/10 shadow-lg text-sm max-w-xs z-10">
             <div className="font-bold text-primary-dark mb-2 flex items-center gap-1.5"><Settings2 size={14}/> Global Safety Rules</div>
             <div className="space-y-1.5">
               <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                 <input type="checkbox" checked={globalSettings.stopOnReply} onChange={e => setGlobalSettings({...globalSettings, stopOnReply: e.target.checked})} className="rounded accent-primary"/>
                 Stop on reply
               </label>
               <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                 <input type="checkbox" checked={globalSettings.stopOnStageChange} onChange={e => setGlobalSettings({...globalSettings, stopOnStageChange: e.target.checked})} className="rounded accent-primary"/>
                 Stop on stage change
               </label>
               <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                 <input type="checkbox" checked={globalSettings.preventDuplicate} onChange={e => setGlobalSettings({...globalSettings, preventDuplicate: e.target.checked})} className="rounded accent-primary"/>
                 Prevent duplicates
               </label>
             </div>
          </div>
        </div>

        <PropertiesPanel 
          selectedNode={selectedNode}
          onUpdateNodeData={updateNodeData}
          allPipelines={allPipelines}
        />
      </div>
    </div>
  );
}

export function WorkflowBuilder(props: WorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <BuilderContext {...props} />
    </ReactFlowProvider>
  );
}
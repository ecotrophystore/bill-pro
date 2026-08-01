// @ts-nocheck
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkflowNode } from './WorkflowNode';
import type { WorkflowNodeData } from '../../types';

const nodeTypes = { workflowNode: WorkflowNode, addNode: WorkflowNode };

interface WorkflowCanvasProps {
  nodes: any[];
  edges: any[];
  onNodeClick?: (id: string) => void;
  onNodeDelete?: (id: string) => void;
  onNodeAdd?: (id: string) => void;
  onPaneClick?: () => void;
  onInit?: (instance: any) => void;
  locked?: boolean;
  fitViewKey?: string;
}

export function WorkflowCanvas({ nodes, edges, onNodeClick, onNodeDelete, onNodeAdd, onPaneClick, onInit, locked, fitViewKey }: WorkflowCanvasProps) {
  const flowNodes = nodes.map((node) => ({
    ...node,
    type: node.kind === 'add' ? 'addNode' : 'workflowNode',
    data: { ...node.data, kind: node.kind, onSelect: onNodeClick, onDelete: onNodeDelete, onAdd: onNodeAdd },
  }));

  return (
    <div className="h-full min-h-[720px] rounded-[32px] border border-shadow-darker/10 bg-[radial-gradient(circle_at_top,_rgba(0,128,125,0.08),_transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.7),rgba(255,255,255,0.45))] shadow-neo-raised overflow-hidden">
      <ReactFlow key={fitViewKey} nodes={flowNodes as any} edges={edges as any} nodeTypes={nodeTypes as any} onPaneClick={onPaneClick} onInit={onInit} fitView panOnDrag={!locked} nodesDraggable={!locked} nodesConnectable={!locked} elementsSelectable minZoom={0.4} maxZoom={1.8}>
        <Background gap={28} size={1} color="rgba(15, 23, 42, 0.08)" />
        <Controls position="bottom-right" className="!shadow-neo-raised !border !border-shadow-darker/10 !bg-surface" />
        <MiniMap nodeStrokeColor={() => '#94a3b8'} nodeColor={(node) => (node.data as any)?.kind === 'whatsapp' ? '#10b981' : '#e2e8f0'} className="!bg-surface/90 !shadow-neo-raised" />
      </ReactFlow>
    </div>
  );
}


import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Play, MessageSquare, Clock, AlertTriangle, Zap, Split } from 'lucide-react';
import type { WorkflowNodeData } from '../../types';

const IconMap: Record<string, any> = {
  play: Play,
  bot: MessageSquare,
  clock: Clock,
  zap: Zap,
  split: Split
};

const BaseNode = ({
  data,
  icon,
  gradientClass,
  isSource = false,
  isTarget = false,
  selected = false,
}: {
  data: WorkflowNodeData;
  icon: any;
  gradientClass: string;
  isSource?: boolean;
  isTarget?: boolean;
  selected?: boolean;
}) => {
  const Icon = IconMap[data.icon || ''] || icon;

  return (
    <div
      className={`relative w-[280px] rounded-2xl border bg-white shadow-sm transition-all duration-200 ${
        selected ? 'border-primary ring-4 ring-primary/10 shadow-md' : 'border-shadow-darker/10 hover:border-primary/30'
      }`}
    >
      {isTarget && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 border-2 bg-white border-primary"
        />
      )}
      
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${gradientClass}`}
          >
            <Icon size={18} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-primary-dark text-sm leading-tight truncate">
              {data.title}
            </h3>
            <p className="text-xs text-secondary mt-1 line-clamp-2 leading-snug">
              {data.summary}
            </p>
          </div>
        </div>

        {data.warnings && data.warnings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-shadow-darker/5 space-y-1.5">
            {data.warnings.map((w, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded-lg ${
                  w.severity === 'error'
                    ? 'bg-rose-500/10 text-rose-500'
                    : 'bg-amber-500/10 text-amber-500'
                }`}
              >
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isSource && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 border-2 bg-white border-primary"
        />
      )}
    </div>
  );
};

export const TriggerNode = memo((props: NodeProps) => {
  return (
    <BaseNode
      data={props.data as unknown as WorkflowNodeData}
      icon={Play}
      gradientClass="bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20 shadow-lg"
      isSource
      selected={props.selected}
    />
  );
});

export const ActionNode = memo((props: NodeProps) => {
  return (
    <BaseNode
      data={props.data as unknown as WorkflowNodeData}
      icon={MessageSquare}
      gradientClass="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20 shadow-lg"
      isSource
      isTarget
      selected={props.selected}
    />
  );
});

export const DelayNode = memo((props: NodeProps) => {
  return (
    <BaseNode
      data={props.data as unknown as WorkflowNodeData}
      icon={Clock}
      gradientClass="bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20 shadow-lg"
      isSource
      isTarget
      selected={props.selected}
    />
  );
});

export const ConditionNode = memo((props: NodeProps) => {
  return (
    <BaseNode
      data={props.data as unknown as WorkflowNodeData}
      icon={Split}
      gradientClass="bg-gradient-to-br from-sky-500 to-blue-600 shadow-sky-500/20 shadow-lg"
      isSource
      isTarget
      selected={props.selected}
    />
  );
});

export const nodeTypes = {
  trigger: TriggerNode,
  whatsapp: ActionNode,
  delay: DelayNode,
  condition: ConditionNode,
};
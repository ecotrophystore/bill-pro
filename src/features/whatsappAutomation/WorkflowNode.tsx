// @ts-nocheck
import { memo } from 'react';
import { AlertTriangle, CirclePlus, Clock3, Filter, MessageSquare, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { WorkflowNodeData } from '../../types';

const iconMap: Record<string, JSX.Element> = {
  trigger: <Sparkles size={16} />, condition: <Filter size={16} />, delay: <Clock3 size={16} />, whatsapp: <MessageSquare size={16} />, payment_condition: <Filter size={16} />, production_condition: <Filter size={16} />, dispatch_condition: <Filter size={16} />, review_delay: <Clock3 size={16} />, stop_condition: <ShieldAlert size={16} />, end: <ShieldAlert size={16} />,
};

function NodeRenderer({ id, data, selected }: NodeProps<WorkflowNodeData & { kind: string; anchorId?: string; onSelect?: (id: string) => void; onDelete?: (id: string) => void; onAdd?: (id: string) => void; }>) {
  if ((data as any).kind === 'add') {
    return <button type="button" onClick={() => data.onAdd?.((data as any).anchorId || id)} className="w-11 h-11 rounded-full border border-shadow-darker/15 bg-surface shadow-neo-raised flex items-center justify-center text-primary-dark hover:text-primary transition-all hover:scale-105"><CirclePlus size={18} /></button>;
  }
  const warnings = data.warnings || [];
  return <div className={`min-w-[280px] max-w-[320px] rounded-3xl border bg-surface shadow-neo-raised overflow-hidden ${selected ? 'ring-2 ring-primary/40' : ''}`} onClick={() => data.onSelect?.(id)}><Handle type="target" position={Position.Top} className="!w-3 !h-3 !border-2 !border-surface !bg-primary" /><div className="p-4 space-y-3"><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 text-primary-dark">{iconMap[(data as any).kind] || <Sparkles size={16} />}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-bold text-primary-dark text-sm uppercase tracking-[0.16em]">{data.title}</h3>{warnings.some((w) => w.severity === 'error') ? <AlertTriangle size={14} className="text-rose-500" /> : null}</div><p className="mt-1 text-sm text-secondary leading-5">{data.summary}</p></div><button type="button" onClick={(event) => { event.stopPropagation(); data.onDelete?.(id); }} className="text-secondary hover:text-rose-500 transition-colors" title="Delete node"><Trash2 size={14} /></button></div>{warnings.length > 0 ? <div className="w-full rounded-2xl border px-3 py-2 text-left text-xs font-medium flex items-start gap-2 border-amber-500/20 bg-amber-500/5 text-amber-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{warnings[0]?.message}</span></div> : null}</div><Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !border-2 !border-surface !bg-primary" /></div>;
}

export const WorkflowNode = memo(NodeRenderer);


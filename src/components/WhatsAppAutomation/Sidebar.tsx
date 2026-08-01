import { Play, MessageSquare, Clock, Split, Settings2 } from 'lucide-react';

const NODE_TYPES = [
  {
    type: 'trigger',
    label: 'Trigger Event',
    icon: Play,
    description: 'Start when lead enters stage',
    gradient: 'from-indigo-500 to-purple-600',
    color: 'text-indigo-500'
  },
  {
    type: 'whatsapp',
    label: 'WhatsApp Message',
    icon: MessageSquare,
    description: 'Send a template message',
    gradient: 'from-emerald-500 to-teal-600',
    color: 'text-emerald-500'
  },
  {
    type: 'delay',
    label: 'Time Delay',
    icon: Clock,
    description: 'Wait before next step',
    gradient: 'from-amber-500 to-orange-500',
    color: 'text-amber-500'
  },
  {
    type: 'condition',
    label: 'Condition',
    icon: Split,
    description: 'Split based on rules',
    gradient: 'from-sky-500 to-blue-600',
    color: 'text-sky-500'
  }
];

export function Sidebar() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-64 bg-white border-r border-shadow-darker/10 flex flex-col h-full shrink-0 z-10">
      <div className="p-4 border-b border-shadow-darker/10">
        <h2 className="text-sm font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
          <Settings2 size={16} /> Workflow Nodes
        </h2>
        <p className="text-xs text-secondary mt-1">
          Drag and drop nodes to build your sequence.
        </p>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto flex-1">
        {NODE_TYPES.map((node) => {
          const Icon = node.icon;
          return (
            <div
              key={node.type}
              className="neo-card p-3 cursor-grab hover:shadow-neo-raised active:cursor-grabbing group transition-all"
              onDragStart={(event) => onDragStart(event, node.type)}
              draggable
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${node.gradient} flex items-center justify-center shrink-0`}>
                  <Icon size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primary-dark group-hover:text-primary transition-colors">
                    {node.label}
                  </h3>
                  <p className="text-xs text-secondary leading-tight mt-0.5">
                    {node.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
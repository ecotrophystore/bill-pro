// @ts-nocheck
import { ChevronLeft, EllipsisVertical, Expand, Lock, Loader2, Pause, Play, Save, Send, Unlock, ZoomIn, ZoomOut, PencilLine, Dot } from 'lucide-react';
import type { AutomationStatus } from '../../types';

interface Props {
  name: string;
  status: AutomationStatus;
  isDirty: boolean;
  isSaving: boolean;
  running: boolean;
  locked: boolean;
  onBack: () => void;
  onToggleRunning: () => void;
  onNameChange: (value: string) => void;
  onTest: () => void;
  onSaveDraft: () => void;
  onActivate: () => void;
  onPause: () => void;
  onResume: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleLock: () => void;
}

export function AutomationToolbar({ name, status, isDirty, isSaving, running, locked, onBack, onToggleRunning, onNameChange, onTest, onSaveDraft, onActivate, onPause, onResume, onFitView, onZoomIn, onZoomOut, onToggleLock }: Props) {
  return <div className="sticky top-0 z-40 rounded-[28px] border border-shadow-darker/10 bg-surface/90 backdrop-blur-xl shadow-neo-raised px-4 py-3"><div className="flex flex-wrap items-center gap-3"><button type="button" onClick={onBack} className="neo-btn !px-4 !py-2 inline-flex items-center gap-2"><ChevronLeft size={16} /> Back</button><button type="button" onClick={onToggleRunning} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${running ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-amber-500/30 bg-amber-500/10 text-amber-700'}`}>{running ? <Play size={14} /> : <Pause size={14} />}{running ? 'Running' : 'Paused'}</button><div className="flex items-center gap-2 rounded-full border border-shadow-darker/10 bg-surface px-3 py-2 min-w-[220px] flex-1 max-w-[420px]"><input value={name} onChange={(event) => onNameChange(event.target.value)} className="w-full bg-transparent outline-none text-primary-dark font-semibold placeholder:text-secondary/60" placeholder="Untitled automation" /><PencilLine size={14} className="text-secondary shrink-0" /></div><div className="flex items-center gap-2 rounded-full border border-shadow-darker/10 bg-surface px-3 py-2 text-sm text-secondary"><Dot size={18} className={isDirty ? 'text-amber-500' : 'text-emerald-500'} />{isSaving ? <span className="inline-flex items-center gap-1 text-amber-700"><Loader2 size={14} className="animate-spin" /> Saving</span> : <span>Saved</span>}<span className="font-semibold text-emerald-700">{isDirty ? 'Unsaved changes' : 'Synced'}</span></div><div className="flex items-center gap-2 ml-auto flex-wrap"><button type="button" onClick={onTest} className="neo-btn inline-flex items-center gap-2"><Send size={15} /> Test Workflow</button><button type="button" onClick={onSaveDraft} className="neo-btn inline-flex items-center gap-2"><Save size={15} /> Save Draft</button>{status !== 'active' ? <button type="button" onClick={onActivate} className="neo-btn-primary inline-flex items-center gap-2"><Play size={15} /> Activate</button> : <button type="button" onClick={onPause} className="neo-btn inline-flex items-center gap-2 text-amber-600"><Pause size={15} /> Pause</button>}{status === 'paused' ? <button type="button" onClick={onResume} className="neo-btn inline-flex items-center gap-2 text-emerald-700"><Play size={15} /> Resume</button> : null}<button type="button" onClick={onToggleLock} className="neo-btn inline-flex items-center gap-2">{locked ? <Lock size={15} /> : <Unlock size={15} />}{locked ? 'Locked' : 'Unlocked'}</button><button type="button" className="neo-btn inline-flex items-center gap-2"><EllipsisVertical size={15} /> Menu</button><div className="flex items-center gap-1 rounded-full border border-shadow-darker/10 bg-surface px-2 py-1"><button type="button" onClick={onZoomOut} className="neo-btn !px-3 !py-2"><ZoomOut size={14} /></button><button type="button" onClick={onFitView} className="neo-btn !px-3 !py-2"><Expand size={14} /></button><button type="button" onClick={onZoomIn} className="neo-btn !px-3 !py-2"><ZoomIn size={14} /></button></div></div></div></div>;
}


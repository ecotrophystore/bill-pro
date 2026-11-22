import React, { useState, useMemo } from 'react';
import {
  Factory,
  X,
  Package,
  Plus,
  Check,
  Clock,
  User,
  History,
  Sliders,
  AlertCircle,
  TrendingUp,
  Trash2,
  Edit2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { Lead, ProductionBatchStage, ProductionProgressLog } from '../../types';
import toast from 'react-hot-toast';

interface ProductionProgressModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function getDefaultProductionBatchStages(targetQty: number): ProductionBatchStage[] {
  const qty = targetQty > 0 ? targetQty : 100;
  return [
    {
      id: 'toolpath_prep',
      name: '1. Cutting Toolpaths & Vector Files Prepared',
      target_quantity: qty,
      completed_quantity: 0,
      unit: 'pcs',
      order: 1,
    },
    {
      id: 'wood_pieces_cut',
      name: '2. Wooden Pieces / Bases Cut',
      target_quantity: qty,
      completed_quantity: 0,
      unit: 'pcs',
      order: 2,
    },
    {
      id: 'acrylic_tops_cut',
      name: '3. Acrylic Tops Cut & Edges Polished',
      target_quantity: qty,
      completed_quantity: 0,
      unit: 'pcs',
      order: 3,
    },
    {
      id: 'uv_laser_print',
      name: '4. UV Printing / Laser Engraving Done',
      target_quantity: qty,
      completed_quantity: 0,
      unit: 'pcs',
      order: 4,
    },
    {
      id: 'base_assembly',
      name: '5. Bases & Stems Assembled',
      target_quantity: qty,
      completed_quantity: 0,
      unit: 'pcs',
      order: 5,
    },
    {
      id: 'fully_finished',
      name: '6. Fully Finished, Buffed & QC Passed',
      target_quantity: qty,
      completed_quantity: 0,
      unit: 'pcs',
      order: 6,
    },
    {
      id: 'box_packaging',
      name: '7. Box Packaging & Dispatch Ready',
      target_quantity: qty,
      completed_quantity: 0,
      unit: 'pcs',
      order: 7,
    },
  ];
}

export function ProductionProgressModal({
  isOpen,
  lead,
  onClose,
  onSuccess,
}: ProductionProgressModalProps) {
  const { user: currentUser, dbUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'log' | 'stages' | 'history'>('log');
  const [saving, setSaving] = useState(false);

  const orderQuantity = useMemo(() => {
    if (!lead) return 100;
    const parsed = parseInt(String(lead.required_quantity || '100'), 10);
    return isNaN(parsed) || parsed <= 0 ? 100 : parsed;
  }, [lead?.required_quantity]);

  // Active stages list
  const currentStages: ProductionBatchStage[] = useMemo(() => {
    if (lead?.production_batch_stages && lead.production_batch_stages.length > 0) {
      return [...lead.production_batch_stages].sort((a, b) => a.order - b.order);
    }
    return getDefaultProductionBatchStages(orderQuantity);
  }, [lead?.production_batch_stages, orderQuantity]);

  // Active logs list
  const currentLogs: ProductionProgressLog[] = useMemo(() => {
    return lead?.production_batch_logs || [];
  }, [lead?.production_batch_logs]);

  // Log Form State
  const [selectedStageId, setSelectedStageId] = useState<string>(
    currentStages[0]?.id || 'toolpath_prep'
  );
  const [logQty, setLogQty] = useState<string>('');
  const [operatorName, setOperatorName] = useState<string>(
    dbUser?.name || currentUser?.displayName || 'Factory Operator'
  );
  const [shift, setShift] = useState<'Morning' | 'Evening' | 'Night'>('Morning');
  const [logNotes, setLogNotes] = useState<string>('');

  // Customize Stages Form State
  const [newStageName, setNewStageName] = useState('');
  const [newStageTarget, setNewStageTarget] = useState(String(orderQuantity));

  if (!isOpen || !lead) return null;

  // Overall completion percentage calculation
  const overallPercentage = useMemo(() => {
    if (currentStages.length === 0) return 0;
    const totalPercentageSum = currentStages.reduce((acc, stage) => {
      const stagePct =
        stage.target_quantity > 0
          ? Math.min(100, Math.round((stage.completed_quantity / stage.target_quantity) * 100))
          : 0;
      return acc + stagePct;
    }, 0);
    return Math.round(totalPercentageSum / currentStages.length);
  }, [currentStages]);

  // Handle Incremental Progress Log Submission
  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !lead) return;

    const qtyNumber = parseInt(logQty, 10);
    if (isNaN(qtyNumber) || qtyNumber <= 0) {
      toast.error('Please enter a valid completed piece quantity (greater than 0)');
      return;
    }

    const targetStage = currentStages.find((s) => s.id === selectedStageId);
    if (!targetStage) {
      toast.error('Selected manufacturing stage was not found');
      return;
    }

    setSaving(true);
    const toastId = toast.loading(`Logging +${qtyNumber} pcs to ${targetStage.name}...`);

    try {
      const newCompleted = targetStage.completed_quantity + qtyNumber;
      const updatedStages = currentStages.map((s) => {
        if (s.id === selectedStageId) {
          return {
            ...s,
            completed_quantity: newCompleted,
          };
        }
        return s;
      });

      // Recalculate overall progress
      const totalPercentageSum = updatedStages.reduce((acc, s) => {
        const stagePct =
          s.target_quantity > 0
            ? Math.min(100, Math.round((s.completed_quantity / s.target_quantity) * 100))
            : 0;
        return acc + stagePct;
      }, 0);
      const newOverallProgress = Math.round(totalPercentageSum / updatedStages.length);

      const newLogEntry: ProductionProgressLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stage_id: selectedStageId,
        stage_name: targetStage.name,
        quantity: qtyNumber,
        cumulative_after: newCompleted,
        operator_name: operatorName.trim() || 'Factory Worker',
        operator_id: dbUser?.id || currentUser?.uid || '',
        shift,
        timestamp: new Date().toISOString(),
        notes: logNotes.trim(),
      };

      const updatedLogs = [newLogEntry, ...currentLogs];

      await updateDoc(doc(db, 'leads', lead.id), {
        production_batch_stages: updatedStages,
        production_batch_logs: updatedLogs,
        production_overall_progress: newOverallProgress,
        updated_at: serverTimestamp(),
      });

      // Log activity
      await addDoc(collection(db, 'activities'), {
        lead_id: lead.id,
        type: 'production_batch_logged',
        content: `🏭 Production Log: +${qtyNumber} pcs logged for "${targetStage.name}" (Total: ${newCompleted}/${targetStage.target_quantity} pcs) by ${operatorName}.`,
        user_name: operatorName,
        user_id: dbUser?.id || currentUser?.uid || '',
        created_at: serverTimestamp(),
      });

      toast.success(
        `Logged +${qtyNumber} pcs to "${targetStage.name}" (${newCompleted}/${targetStage.target_quantity})!`,
        { id: toastId }
      );

      setLogQty('');
      setLogNotes('');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error logging production batch:', err);
      toast.error('Failed to log batch: ' + (err?.message || 'Unknown error'), { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  // Handle Adding a Custom Manufacturing Step
  const handleAddCustomStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !lead || !newStageName.trim()) return;

    const targetNum = parseInt(newStageTarget, 10);
    const validTarget = isNaN(targetNum) || targetNum <= 0 ? orderQuantity : targetNum;

    const newStage: ProductionBatchStage = {
      id: `stage_${Date.now()}`,
      name: newStageName.trim(),
      target_quantity: validTarget,
      completed_quantity: 0,
      unit: 'pcs',
      order: currentStages.length + 1,
    };

    const updatedStages = [...currentStages, newStage];

    setSaving(true);
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        production_batch_stages: updatedStages,
        updated_at: serverTimestamp(),
      });
      toast.success(`Custom step "${newStageName.trim()}" added to project!`);
      setNewStageName('');
      setNewStageTarget(String(orderQuantity));
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error adding custom stage:', err);
      toast.error('Failed to add stage');
    } finally {
      setSaving(false);
    }
  };

  // Handle Deleting a Custom Step
  const handleDeleteStage = async (stageId: string, stageName: string) => {
    if (!db || !lead) return;
    if (currentStages.length <= 1) {
      toast.error('Order must have at least one production step');
      return;
    }

    if (!window.confirm(`Are you sure you want to remove "${stageName}" from this order's workflow?`)) {
      return;
    }

    const updatedStages = currentStages
      .filter((s) => s.id !== stageId)
      .map((s, idx) => ({ ...s, order: idx + 1 }));

    setSaving(true);
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        production_batch_stages: updatedStages,
        updated_at: serverTimestamp(),
      });
      toast.success(`Removed "${stageName}"`);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error deleting stage:', err);
      toast.error('Failed to remove stage');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in print:hidden">
      <div className="bg-surface border border-shadow-darker/30 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-neo-raised overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-shadow-darker/20 bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary-dark">
              <Factory size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-primary-dark text-base leading-tight">
                  Project Quantity Progress Tracker
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary-dark border border-primary/20">
                  {orderQuantity} PCS ORDER
                </span>
              </div>
              <p className="text-xs text-secondary mt-0.5">
                Client: <strong className="text-primary-dark">{lead.company || lead.name}</strong> • Size: <strong className="text-primary-dark">{lead.trophy_size || 'Standard'}</strong> • Deadline: <strong className="text-tertiary">{lead.production_deadline || 'Open'}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-lg text-secondary hover:text-primary-dark hover:bg-surface-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Overall Completion Gauge Bar */}
        <div className="px-5 py-3 bg-surface/60 border-b border-shadow-darker/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-primary-dark mb-1">
              <span className="flex items-center gap-1.5">
                <TrendingUp size={14} className="text-primary" /> Overall Project Manufacturing Progress
              </span>
              <span className="font-extrabold text-primary text-sm">
                {overallPercentage}% Complete
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden shadow-inner">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${overallPercentage}%` }}
              />
            </div>
          </div>

          {/* Tab Navigation Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-shadow-darker/10 border border-shadow-darker/15 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('log')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === 'log'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-secondary hover:text-primary-dark'
              }`}
            >
              <Plus size={13} /> Log Pieces
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stages')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === 'stages'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-secondary hover:text-primary-dark'
              }`}
            >
              <Sliders size={13} /> Customize Steps ({currentStages.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                activeTab === 'history'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-secondary hover:text-primary-dark'
              }`}
            >
              <History size={13} /> History ({currentLogs.length})
            </button>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-primary-dark space-y-5">
          
          {/* TAB 1: LOG DAILY PIECE COUNTS */}
          {activeTab === 'log' && (
            <div className="space-y-6">
              {/* Incremental Batch Log Form */}
              <form
                onSubmit={handleAddLog}
                className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-primary text-white">
                      <Plus size={14} />
                    </span>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary-dark">
                      Record Completed Pieces (Incremental Daily Log)
                    </h4>
                  </div>
                  <span className="text-[11px] text-secondary font-medium">
                    Cumulative totals update automatically
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Select Stage */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-primary-dark mb-1">
                      Manufacturing Step <span className="text-tertiary">*</span>
                    </label>
                    <select
                      value={selectedStageId}
                      onChange={(e) => setSelectedStageId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark font-semibold"
                    >
                      {currentStages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.completed_quantity} / {s.target_quantity} pcs)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity completed */}
                  <div>
                    <label className="block text-xs font-bold text-primary-dark mb-1">
                      + Pieces Completed Today <span className="text-tertiary">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        required
                        value={logQty}
                        onChange={(e) => setLogQty(e.target.value)}
                        placeholder="e.g. 150"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark font-bold font-mono"
                      />
                    </div>
                  </div>

                  {/* Operator Name */}
                  <div>
                    <label className="block text-xs font-bold text-primary-dark mb-1">
                      Operator / Worker
                    </label>
                    <input
                      type="text"
                      value={operatorName}
                      onChange={(e) => setOperatorName(e.target.value)}
                      placeholder="e.g. Kumar / CNC Team"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark font-medium"
                    />
                  </div>
                </div>

                {/* Quick Add Pills & Notes */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-secondary uppercase">Quick Add:</span>
                    {[25, 50, 100, 200, 500].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setLogQty(String(q))}
                        className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-surface border border-shadow-darker/20 hover:border-primary text-secondary hover:text-primary transition-all"
                      >
                        +{q}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={shift}
                      onChange={(e) => setShift(e.target.value as any)}
                      className="px-2 py-1 text-xs rounded-lg border border-shadow-darker/20 bg-surface text-secondary font-bold"
                    >
                      <option value="Morning">Morning Shift</option>
                      <option value="Evening">Evening Shift</option>
                      <option value="Night">Night Shift</option>
                    </select>

                    <button
                      type="submit"
                      disabled={saving || !logQty}
                      className="neo-btn-primary text-xs px-4 py-2 font-bold bg-primary text-white hover:bg-primary-dark inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <Check size={14} /> Log Work (+{logQty || '0'} pcs)
                    </button>
                  </div>
                </div>
              </form>

              {/* Manufacturing Steps Progress Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                    <Factory size={14} className="text-primary" /> Step-by-Step Quantity Breakdown
                  </h4>
                  <span className="text-[11px] text-secondary">
                    Total Order Target: <strong>{orderQuantity} pcs</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {currentStages.map((stage) => {
                    const pct =
                      stage.target_quantity > 0
                        ? Math.min(
                            100,
                            Math.round((stage.completed_quantity / stage.target_quantity) * 100)
                          )
                        : 0;
                    const remaining = Math.max(0, stage.target_quantity - stage.completed_quantity);
                    const isDone = stage.completed_quantity >= stage.target_quantity;

                    return (
                      <div
                        key={stage.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isDone
                            ? 'bg-primary/5 border-primary/30'
                            : 'bg-surface border-shadow-darker/20 shadow-neo-surface'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h5 className="text-xs font-bold text-primary-dark leading-snug">
                              {stage.name}
                            </h5>
                            <span className="text-[11px] text-secondary font-medium">
                              Target: {stage.target_quantity} {stage.unit || 'pcs'}
                            </span>
                          </div>

                          <div className="text-right">
                            <span
                              className={`text-sm font-extrabold font-mono ${
                                isDone ? 'text-primary' : 'text-primary-dark'
                              }`}
                            >
                              {stage.completed_quantity} / {stage.target_quantity}
                            </span>
                            <div className="text-[10px] font-bold text-secondary">
                              {pct}% complete
                            </div>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mb-2">
                          <div
                            className={`h-full transition-all duration-300 rounded-full ${
                              isDone ? 'bg-primary' : 'bg-primary/80'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {/* Card Footer: Remaining & Quick Add */}
                        <div className="flex items-center justify-between pt-1 border-t border-shadow-darker/10 text-[11px]">
                          <span className={remaining === 0 ? 'text-primary font-bold' : 'text-secondary'}>
                            {remaining === 0 ? '✓ Target Reached' : `${remaining} pcs remaining`}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStageId(stage.id);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="text-[10px] font-bold text-primary hover:underline flex items-center gap-0.5"
                          >
                            + Log for this step
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOMIZE STAGES PER ORDER */}
          {activeTab === 'stages' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-surface border border-shadow-darker/20 shadow-neo-surface space-y-3">
                <div className="flex items-center justify-between border-b border-shadow-darker/15 pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary-dark flex items-center gap-1.5">
                    <Plus size={14} className="text-primary" /> Add Custom Manufacturing Step for this Order
                  </h4>
                  <span className="text-[11px] text-secondary">
                    e.g. "Wooden Base Cut", "Gold Foil Stamping", "Brass Inlay"
                  </span>
                </div>

                <form onSubmit={handleAddCustomStage} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-primary-dark mb-1">
                      Step Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      placeholder="e.g. 500 Wooden Bases Cut, 100 Printed, 200 Assembled..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-primary-dark mb-1">
                      Target Quantity (Pcs)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        required
                        value={newStageTarget}
                        onChange={(e) => setNewStageTarget(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark font-mono font-bold"
                      />
                      <button
                        type="submit"
                        disabled={saving || !newStageName.trim()}
                        className="neo-btn-primary text-xs px-3 py-2 font-bold bg-primary text-white hover:bg-primary-dark shrink-0"
                      >
                        Add Step
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Current Active Stages List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">
                  Active Manufacturing Workflow Steps ({currentStages.length})
                </h4>

                <div className="space-y-2">
                  {currentStages.map((stage, idx) => (
                    <div
                      key={stage.id}
                      className="p-3 rounded-xl bg-surface border border-shadow-darker/20 shadow-neo-surface flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-md bg-primary/10 text-primary-dark font-bold font-mono text-[11px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <strong className="text-primary-dark block">{stage.name}</strong>
                          <span className="text-[11px] text-secondary">
                            Target: {stage.target_quantity} {stage.unit || 'pcs'} • Completed:{' '}
                            <strong className="text-primary">{stage.completed_quantity} pcs</strong>
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteStage(stage.id, stage.name)}
                        className="p-1.5 rounded-lg text-secondary hover:text-tertiary hover:bg-tertiary/10 transition-colors"
                        title="Remove step from workflow"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BATCH LOG HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-secondary">
                  Work Log Audit Trail ({currentLogs.length} entries)
                </h4>
              </div>

              {currentLogs.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-surface border border-shadow-darker/20 text-secondary text-xs italic">
                  No batch progress has been logged yet for this order.
                </div>
              ) : (
                <div className="space-y-2">
                  {currentLogs.map((log) => {
                    const logDate = new Date(log.timestamp).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={log.id}
                        className="p-3 rounded-xl bg-surface border border-shadow-darker/20 shadow-neo-surface flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-primary/10 text-primary border border-primary/20 shrink-0">
                            +{log.quantity} pcs
                          </span>
                          <div>
                            <span className="font-bold text-primary-dark block">
                              {log.stage_name}
                            </span>
                            <span className="text-[11px] text-secondary">
                              Logged by <strong>{log.operator_name}</strong> • Shift: {log.shift || 'General'}
                              {log.notes ? ` • "${log.notes}"` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="text-right text-[11px] text-secondary shrink-0">
                          <div>Cumulative: <strong>{log.cumulative_after} pcs</strong></div>
                          <span className="text-[10px] text-slate-400">{logDate}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-shadow-darker/20 bg-surface flex items-center justify-between">
          <span className="text-xs text-secondary font-medium">
            Project progress automatically updates on the Production Kanban Board.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="neo-btn text-xs px-5 py-2 font-bold text-primary-dark"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  X, 
  Check, 
  FileText, 
  Calendar, 
  DollarSign, 
  User, 
  Hash, 
  ShieldAlert, 
  ArrowRight, 
  Copy, 
  Layers,
  CheckSquare,
  Square
} from 'lucide-react';

export interface ExpenseItem {
  id: string;
  date: string;
  member: string;
  purpose: string;
  requested: number;
  paid: number;
  taxStatus: 'GST' | 'Non-GST';
  gstPercent: number;
  gstAmount: number;
  nonGstAmount: number;
  paymentMode: 'Cash' | 'UPI' | 'Bank' | 'Card';
  billNo?: string;
  notes?: string;
  created_at?: any;
  isDuplicateOverride?: boolean;
}

export interface DuplicateBillMatch {
  incoming: ExpenseItem;
  existing: ExpenseItem;
  reason: string;
  source: 'database' | 'staged';
}

interface DuplicateBillModalProps {
  isOpen: boolean;
  duplicateMatches: DuplicateBillMatch[];
  cleanItemsCount: number;
  onAddAnyway: (acceptedIncomingItems: ExpenseItem[]) => void;
  onDiscardDuplicates: () => void;
  onCancelAll: () => void;
}

export const DuplicateBillModal: React.FC<DuplicateBillModalProps> = ({
  isOpen,
  duplicateMatches,
  cleanItemsCount,
  onAddAnyway,
  onDiscardDuplicates,
  onCancelAll,
}) => {
  // Track which duplicate items the user has checked to add anyway
  const [selectedToKeep, setSelectedToKeep] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      // By default, if single item, select it for user convenience if they click Add
      // If multiple items, default to unchecked
      const initial: Record<string, boolean> = {};
      duplicateMatches.forEach((m) => {
        initial[m.incoming.id] = duplicateMatches.length === 1;
      });
      setSelectedToKeep(initial);
    }
  }, [isOpen, duplicateMatches]);

  if (!isOpen || duplicateMatches.length === 0) return null;

  const isSingle = duplicateMatches.length === 1;
  const singleMatch = duplicateMatches[0];

  const handleToggle = (id: string) => {
    setSelectedToKeep((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSingleAdd = () => {
    onAddAnyway([
      {
        ...singleMatch.incoming,
        isDuplicateOverride: true,
        notes: (singleMatch.incoming.notes ? singleMatch.incoming.notes + ' ' : '') + '[Duplicate Confirmed by User]',
      },
    ]);
  };

  const handleBatchSelectedAdd = () => {
    const accepted = duplicateMatches
      .filter((m) => selectedToKeep[m.incoming.id])
      .map((m) => ({
        ...m.incoming,
        isDuplicateOverride: true,
        notes: (m.incoming.notes ? m.incoming.notes + ' ' : '') + '[Duplicate Confirmed by User]',
      }));
    onAddAnyway(accepted);
  };

  const handleAddAllAnyway = () => {
    const all = duplicateMatches.map((m) => ({
      ...m.incoming,
      isDuplicateOverride: true,
      notes: (m.incoming.notes ? m.incoming.notes + ' ' : '') + '[Duplicate Confirmed by User]',
    }));
    onAddAnyway(all);
  };

  const selectedCount = Object.values(selectedToKeep).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onCancelAll}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-surface border border-shadow-darker/20 rounded-2xl shadow-2xl z-10 overflow-hidden animate-fade-in my-8">
        
        {/* Header with warning accent */}
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-500/20 p-6 flex items-start justify-between">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-xs border border-amber-500/30">
              <AlertTriangle size={24} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-primary-dark">
                  {isSingle ? 'Repeated Bill Detected' : `${duplicateMatches.length} Repeated Bills Detected`}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  Duplicate Warning
                </span>
              </div>
              <p className="text-xs text-secondary mt-1">
                {isSingle
                  ? 'This uploaded bill appears to match an existing record already in your expenses.'
                  : `${duplicateMatches.length} bills in this upload match existing expense records.`}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelAll}
            className="p-2 rounded-xl text-secondary hover:text-primary-dark hover:bg-secondary/10 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4 custom-sidebar-scrollbar">
          
          {cleanItemsCount > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-2.5 text-xs text-primary-dark">
              <Layers size={16} className="text-primary shrink-0" />
              <span>
                <strong>{cleanItemsCount} unique new item(s)</strong> have no duplicates and are ready to be added.
              </span>
            </div>
          )}

          {duplicateMatches.map((match, idx) => {
            const isChecked = selectedToKeep[match.incoming.id];

            return (
              <div 
                key={match.incoming.id || idx}
                className={`neo-card p-4 rounded-xl border transition-all ${
                  isChecked 
                    ? 'border-amber-500/50 bg-amber-500/5 shadow-xs' 
                    : 'border-shadow-darker/10 bg-surface'
                }`}
              >
                {/* Reason header */}
                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-shadow-darker/10">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                      {match.reason}
                    </span>
                  </div>

                  {!isSingle && (
                    <button
                      type="button"
                      onClick={() => handleToggle(match.incoming.id)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-surface border border-shadow-darker/20 hover:border-primary text-secondary hover:text-primary-dark transition-colors"
                    >
                      {isChecked ? (
                        <>
                          <CheckSquare size={14} className="text-amber-500" />
                          <span className="text-amber-600 dark:text-amber-400">Selected to Add</span>
                        </>
                      ) : (
                        <>
                          <Square size={14} />
                          <span>Check to Add</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Side-by-side comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Incoming / Uploaded Bill */}
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-[11px] text-primary uppercase tracking-wider flex items-center gap-1">
                          <FileText size={12} /> Uploaded Bill
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
                          New File
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-secondary flex items-center gap-1"><Hash size={11} /> Bill No:</span>
                          <span className="font-bold text-primary-dark">
                            {match.incoming.billNo || <span className="text-secondary italic">None</span>}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-secondary flex items-center gap-1"><Calendar size={11} /> Date:</span>
                          <span className="font-medium text-primary-dark">{match.incoming.date}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-secondary flex items-center gap-1"><User size={11} /> Vendor/Member:</span>
                          <span className="font-semibold text-primary-dark truncate max-w-[130px]">{match.incoming.member}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-secondary">Purpose:</span>
                          <span className="text-secondary text-right truncate max-w-[130px]">{match.incoming.purpose}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-primary/10 flex items-center justify-between font-bold">
                      <span className="text-secondary">Amount Paid:</span>
                      <span className="text-sm font-extrabold text-primary">₹{match.incoming.paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Existing Bill in System */}
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-[11px] text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                          <Copy size={12} /> Existing Match
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          match.source === 'database'
                            ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
                            : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'
                        }`}>
                          {match.source === 'database' ? 'Saved in Cloud' : 'In Preview Queue'}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-secondary flex items-center gap-1"><Hash size={11} /> Bill No:</span>
                          <span className="font-bold text-primary-dark">
                            {match.existing.billNo || <span className="text-secondary italic">None</span>}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-secondary flex items-center gap-1"><Calendar size={11} /> Date:</span>
                          <span className="font-medium text-primary-dark">{match.existing.date}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-secondary flex items-center gap-1"><User size={11} /> Vendor/Member:</span>
                          <span className="font-semibold text-primary-dark truncate max-w-[130px]">{match.existing.member}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-secondary">Purpose:</span>
                          <span className="text-secondary text-right truncate max-w-[130px]">{match.existing.purpose}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-amber-500/10 flex items-center justify-between font-bold">
                      <span className="text-secondary">Amount Paid:</span>
                      <span className="text-sm font-extrabold text-amber-700 dark:text-amber-400">
                        ₹{match.existing.paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 bg-surface border-t border-shadow-darker/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-secondary w-full sm:w-auto text-center sm:text-left">
            {isSingle ? (
              <span>Do you want to add this repeated bill anyway?</span>
            ) : (
              <span>
                {selectedCount > 0 
                  ? `${selectedCount} duplicate(s) selected to add.` 
                  : 'Select duplicates or add only clean items.'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {isSingle ? (
              <>
                {/* Single Bill Choice: Don't Add OR Add Anyway */}
                <button
                  type="button"
                  onClick={onDiscardDuplicates}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-secondary/10 hover:bg-secondary/20 text-primary-dark transition-colors flex items-center gap-1.5"
                >
                  <X size={15} />
                  Don't Add (Discard)
                </button>
                <button
                  type="button"
                  onClick={handleSingleAdd}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary-dark shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Check size={15} />
                  Yes, Add Bill
                </button>
              </>
            ) : (
              <>
                {/* Batch Choice */}
                <button
                  type="button"
                  onClick={onCancelAll}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-secondary hover:text-primary-dark hover:bg-secondary/10 transition-colors"
                >
                  Cancel All
                </button>

                {cleanItemsCount > 0 && (
                  <button
                    type="button"
                    onClick={onDiscardDuplicates}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-secondary/15 hover:bg-secondary/25 text-primary-dark transition-colors flex items-center gap-1.5"
                  >
                    <ShieldAlert size={14} />
                    Skip Duplicates & Add Clean ({cleanItemsCount})
                  </button>
                )}

                {selectedCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleBatchSelectedAdd}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary-dark shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <Check size={14} />
                    Add Selected ({selectedCount})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddAllAnyway}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold border border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition-colors flex items-center gap-1.5"
                  >
                    Add All Anyway
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

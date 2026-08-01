/**
 * Step 3 & 4 — Import Preview and Confirm
 * Shows a preview table of all parsed rows with validation status,
 * duplicate indicators, and per-row duplicate action selectors.
 */
import { useState, useMemo } from 'react';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import type { ImportRow, DuplicateAction } from '../../types/customerImport';
import { CUSTOMER_FIELD_LABELS } from '../../types/customerImport';

interface Props {
  rows: ImportRow[];
  onRowsChange: (rows: ImportRow[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  isImporting: boolean;
  importProgress: { current: number; total: number } | null;
}

type FilterTab = 'all' | 'valid' | 'invalid' | 'duplicate';

export default function CustomerImportPreview({
  rows,
  onRowsChange,
  onConfirm,
  onBack,
  isImporting,
  importProgress,
}: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => r.isValid && !r.duplicate).length;
    const duplicates = rows.filter((r) => r.duplicate).length;
    const invalid = rows.filter((r) => !r.isValid).length;
    return { valid, duplicates, invalid, total: rows.length };
  }, [rows]);

  const filteredRows = useMemo(() => {
    switch (activeTab) {
      case 'valid': return rows.filter((r) => r.isValid && !r.duplicate);
      case 'invalid': return rows.filter((r) => !r.isValid);
      case 'duplicate': return rows.filter((r) => Boolean(r.duplicate));
      default: return rows;
    }
  }, [rows, activeTab]);

  const handleDuplicateActionChange = (rowNumber: number, action: DuplicateAction) => {
    onRowsChange(
      rows.map((r) => r.rowNumber === rowNumber ? { ...r, duplicateAction: action } : r)
    );
  };

  const setAllDuplicateAction = (action: DuplicateAction) => {
    onRowsChange(
      rows.map((r) => r.duplicate ? { ...r, duplicateAction: action } : r)
    );
  };

  const canImport = rows.some(
    (r) => r.isValid && (!r.duplicate || r.duplicateAction !== 'skip')
  );

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Rows', value: stats.total, color: 'text-primary-dark', bg: 'bg-primary/5' },
          { label: 'Valid', value: stats.valid, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Duplicates', value: stats.duplicates, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Invalid', value: stats.invalid, color: 'text-red-700', bg: 'bg-red-50' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.bg} text-center`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-secondary mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bulk duplicate action */}
      {stats.duplicates > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {stats.duplicates} duplicate{stats.duplicates > 1 ? 's' : ''} detected
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Set action for all duplicates at once, or change individually below.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['skip', 'update', 'new'] as DuplicateAction[]).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => setAllDuplicateAction(action)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors capitalize"
              >
                All → {action === 'new' ? 'Import as New' : action === 'update' ? 'Update' : 'Skip'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-shadow-darker/5 rounded-xl w-fit">
        {([
          ['all', `All (${stats.total})`],
          ['valid', `Valid (${stats.valid})`],
          ['duplicate', `Duplicates (${stats.duplicates})`],
          ['invalid', `Invalid (${stats.invalid})`],
        ] as [FilterTab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab
                ? 'bg-surface shadow-neo-raised text-primary-dark'
                : 'text-secondary hover:text-primary-dark'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Preview table */}
      <div className="overflow-hidden rounded-2xl border border-shadow-darker/15 max-h-[360px] overflow-y-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface border-b border-shadow-darker/10 text-left text-secondary uppercase tracking-wider">
              <th className="px-3 py-2.5 font-semibold w-12">Row</th>
              <th className="px-3 py-2.5 font-semibold">Customer Name</th>
              <th className="px-3 py-2.5 font-semibold">Phone</th>
              <th className="px-3 py-2.5 font-semibold">Email</th>
              <th className="px-3 py-2.5 font-semibold">GST Number</th>
              <th className="px-3 py-2.5 font-semibold w-20">Status</th>
              <th className="px-3 py-2.5 font-semibold w-32">Duplicate Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-secondary text-sm">
                  No rows match this filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <>
                  <tr
                    key={`row-${row.rowNumber}`}
                    className={`border-b border-shadow-darker/5 last:border-0 cursor-pointer hover:bg-shadow-darker/3 transition-colors ${
                      !row.isValid ? 'bg-red-50/40' : row.duplicate ? 'bg-amber-50/40' : ''
                    }`}
                    onClick={() =>
                      setExpandedRow(expandedRow === row.rowNumber ? null : row.rowNumber)
                    }
                  >
                    <td className="px-3 py-2.5 text-secondary font-mono">{row.rowNumber}</td>
                    <td className="px-3 py-2.5 font-semibold text-primary-dark truncate max-w-[140px]">
                      {row.mappedData.name || <span className="text-red-400 italic">Missing</span>}
                    </td>
                    <td className="px-3 py-2.5 text-secondary">{row.mappedData.phone || '—'}</td>
                    <td className="px-3 py-2.5 text-secondary truncate max-w-[120px]">
                      {row.mappedData.email || '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-secondary">
                      {row.mappedData.gst_number || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {!row.isValid ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                          <XCircle size={12} /> Invalid
                        </span>
                      ) : row.duplicate ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                          <AlertTriangle size={12} /> Duplicate
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                          <CheckCircle size={12} /> Valid
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.duplicate ? (
                        <select
                          value={row.duplicateAction}
                          onChange={(e) =>
                            handleDuplicateActionChange(
                              row.rowNumber,
                              e.target.value as DuplicateAction
                            )
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs neo-input py-1 px-2 w-full"
                        >
                          <option value="skip">Skip</option>
                          <option value="update">Update</option>
                          <option value="new">Import as New</option>
                        </select>
                      ) : (
                        <span className="text-secondary">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Expandable detail row */}
                  {expandedRow === row.rowNumber && (
                    <tr key={`detail-${row.rowNumber}`} className="bg-shadow-darker/3">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-2">
                          {/* All mapped fields */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(row.mappedData).map(([field, value]) => (
                              <div key={field}>
                                <span className="text-secondary text-[10px] uppercase tracking-wider">
                                  {CUSTOMER_FIELD_LABELS[field as keyof typeof CUSTOMER_FIELD_LABELS] ?? field}
                                </span>
                                <p className="text-primary-dark text-xs font-medium truncate">{value || '—'}</p>
                              </div>
                            ))}
                          </div>

                          {/* Errors */}
                          {row.errors.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {row.errors.map((err, ei) => (
                                <div key={ei} className="flex items-center gap-2 text-red-600 text-xs">
                                  <XCircle size={11} />
                                  <span>
                                    <strong>{CUSTOMER_FIELD_LABELS[err.field as keyof typeof CUSTOMER_FIELD_LABELS] ?? err.field}:</strong>{' '}
                                    {err.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Duplicate reason */}
                          {row.duplicate && (
                            <div className="flex items-center gap-2 text-amber-700 text-xs mt-1">
                              <AlertTriangle size={11} />
                              <span>Duplicate: {row.duplicate.matchReason}</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-secondary text-center">
        Click any row to expand details. Scroll to see all {stats.total} rows.
      </p>

      {/* Import progress */}
      {isImporting && importProgress && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-secondary">
            <span className="flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin" />
              Importing {importProgress.current} of {importProgress.total} customers…
            </span>
            <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-shadow-darker/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{
                width: `${(importProgress.current / importProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isImporting}
          className="neo-btn px-6 py-2 disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canImport || isImporting}
          className="neo-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isImporting ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              Importing…
            </>
          ) : (
            'Confirm Import →'
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Step 2 — Column Mapper
 * Shows auto-detected column mappings and allows manual correction.
 * Prevents the same destination field from being mapped to multiple columns.
 */
import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Minus, ChevronRight } from 'lucide-react';
import type { ColumnMapping, CustomerField } from '../../types/customerImport';
import { CUSTOMER_FIELD_LABELS, CUSTOMER_FIELDS_ORDERED } from '../../types/customerImport';

interface Props {
  headers: string[];
  initialMappings: ColumnMapping[];
  onMappingsConfirmed: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
}

export default function CustomerColumnMapper({
  headers,
  initialMappings,
  onMappingsConfirmed,
  onBack,
}: Props) {
  const [mappings, setMappings] = useState<ColumnMapping[]>(initialMappings);

  // Keep in sync if parent changes initialMappings
  useEffect(() => {
    setMappings(initialMappings);
  }, [initialMappings]);

  /** Returns the set of fields currently in use (excluding a given index) */
  const usedFields = (excludeIndex: number): Set<CustomerField> => {
    const used = new Set<CustomerField>();
    mappings.forEach((m, i) => {
      if (i !== excludeIndex && m.field) used.add(m.field);
    });
    return used;
  };

  const handleFieldChange = (index: number, value: string) => {
    setMappings((prev) =>
      prev.map((m, i) =>
        i === index
          ? {
              ...m,
              field: value === '' ? null : (value as CustomerField),
              mappedBy: value === '' ? 'ignored' : 'manual',
            }
          : m
      )
    );
  };

  const autoMapped = mappings.filter((m) => m.field && m.mappedBy === 'auto').length;
  const manualMapped = mappings.filter((m) => m.field && m.mappedBy === 'manual').length;
  const unmapped = mappings.filter((m) => !m.field).length;
  const hasName = mappings.some((m) => m.field === 'name');

  return (
    <div className="space-y-6">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
          <CheckCircle size={13} />
          {autoMapped} auto-mapped
        </div>
        {manualMapped > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold">
            <CheckCircle size={13} />
            {manualMapped} manually mapped
          </div>
        )}
        {unmapped > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
            <AlertCircle size={13} />
            {unmapped} unmapped (will be skipped)
          </div>
        )}
      </div>

      {/* Mapping table */}
      <div className="overflow-hidden rounded-2xl border border-shadow-darker/15">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-shadow-darker/5 border-b border-shadow-darker/10 text-left text-xs text-secondary uppercase tracking-wider">
              <th className="px-4 py-3 font-semibold w-8">#</th>
              <th className="px-4 py-3 font-semibold">Source Column (from file)</th>
              <th className="px-4 py-3 font-semibold w-6" />
              <th className="px-4 py-3 font-semibold">Map to Customer Field</th>
              <th className="px-4 py-3 font-semibold w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping, index) => {
              const used = usedFields(index);
              const isMapped = Boolean(mapping.field);

              return (
                <tr
                  key={index}
                  className="border-b border-shadow-darker/5 last:border-0 hover:bg-shadow-darker/3 transition-colors"
                >
                  <td className="px-4 py-3 text-secondary text-xs">{index + 1}</td>

                  {/* Source column name */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-shadow-darker/5 px-2 py-1 rounded-lg text-primary-dark">
                      {mapping.sourceHeader || '(empty header)'}
                    </span>
                  </td>

                  {/* Arrow */}
                  <td className="px-2 py-3 text-secondary">
                    <ChevronRight size={14} />
                  </td>

                  {/* Destination dropdown */}
                  <td className="px-4 py-3">
                    <select
                      value={mapping.field ?? ''}
                      onChange={(e) => handleFieldChange(index, e.target.value)}
                      className="neo-input text-sm py-1.5 px-3 w-full max-w-xs"
                    >
                      <option value="">— Skip this column —</option>
                      {CUSTOMER_FIELDS_ORDERED.map((field) => (
                        <option
                          key={field}
                          value={field}
                          disabled={used.has(field)}
                        >
                          {CUSTOMER_FIELD_LABELS[field]}
                          {used.has(field) ? ' (already mapped)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3">
                    {isMapped ? (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                          mapping.mappedBy === 'auto'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        <CheckCircle size={11} />
                        {mapping.mappedBy === 'auto' ? 'Auto' : 'Manual'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-shadow-darker/5 text-secondary">
                        <Minus size={11} />
                        Skipped
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Validation warning */}
      {!hasName && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm font-medium">
            <strong>Customer Name</strong> is required but not mapped. Please map at least one
            column to "Customer Name" before continuing.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="neo-btn px-6 py-2">
          ← Back
        </button>
        <button
          type="button"
          onClick={() => onMappingsConfirmed(mappings)}
          disabled={!hasName}
          className="neo-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Preview Data →
        </button>
      </div>
    </div>
  );
}

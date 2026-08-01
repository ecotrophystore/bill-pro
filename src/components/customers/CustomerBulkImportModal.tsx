/**
 * CustomerBulkImportModal — Root orchestrator for the 5-step bulk import flow.
 *
 * Steps:
 *  1. Upload File
 *  2. Map Columns
 *  3. Preview & Validate
 *  4. Confirm Import  (integrated into Step 3 preview)
 *  5. Import Result
 */
import { useState, useCallback } from 'react';
import { X, Upload, GitBranch, Eye, CheckCircle, BarChart2, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import CustomerImportUpload from './CustomerImportUpload';
import CustomerColumnMapper from './CustomerColumnMapper';
import CustomerImportPreview from './CustomerImportPreview';
import CustomerImportResult from './CustomerImportResult';
import {
  autoMapColumns,
  buildImportRows,
  batchImportCustomers,
  writeImportAuditLog,
} from '../../lib/customerImport';
import type { Customer } from '../../types';
import type {
  ImportStep,
  ColumnMapping,
  ImportRow,
  ImportResult,
  ParsedFile,
} from '../../types/customerImport';

interface Props {
  existingCustomers: Customer[];
  onImportComplete: () => void;
  onClose: () => void;
}

const STEP_LABELS: Record<ImportStep, string> = {
  1: 'Upload File',
  2: 'Map Columns',
  3: 'Preview & Validate',
  4: 'Confirm Import',
  5: 'Import Result',
};

const STEP_ICONS: Record<ImportStep, React.ReactNode> = {
  1: <Upload size={15} />,
  2: <GitBranch size={15} />,
  3: <Eye size={15} />,
  4: <CheckCircle size={15} />,
  5: <BarChart2 size={15} />,
};

export default function CustomerBulkImportModal({
  existingCustomers,
  onImportComplete,
  onClose,
}: Props) {
  const { user, dbUser } = useAuth();
  const [step, setStep] = useState<ImportStep>(1);

  // Step 1 data
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);

  // Step 2 data
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);

  // Step 3 data
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  // Step 5 data
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ─── Permission check ─────────────────────────────────────────────────────
  const canImport = dbUser?.role === 'admin' || dbUser?.role === 'accounts';

  // ─── Step 1 → 2 ───────────────────────────────────────────────────────────
  const handleFileParsed = useCallback((file: ParsedFile) => {
    setParsedFile(file);
    const autoMapped = autoMapColumns(file.headers);
    setMappings(autoMapped);
    setStep(2);
  }, []);

  // ─── Step 2 → 3 ───────────────────────────────────────────────────────────
  const handleMappingsConfirmed = useCallback(
    (confirmedMappings: ColumnMapping[]) => {
      if (!parsedFile) return;
      setMappings(confirmedMappings);
      const rows = buildImportRows(parsedFile.rows, confirmedMappings, existingCustomers);
      setImportRows(rows);
      setStep(3);
    },
    [parsedFile, existingCustomers]
  );

  // ─── Step 3 → 5 (actual import) ───────────────────────────────────────────
  const handleConfirmImport = useCallback(async () => {
    if (!parsedFile || !user) return;
    if (isImporting) return; // Prevent double-submit

    setIsImporting(true);
    setImportProgress({ current: 0, total: importRows.filter((r) => r.isValid).length });

    try {
      const result = await batchImportCustomers({
        rows: importRows,
        userId: user.uid,
        fileName: parsedFile.fileName,
        onProgress: (current, total) => setImportProgress({ current, total }),
      });

      // Write audit log
      await writeImportAuditLog(user.uid, {
        importedCount: result.importedCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedRows.length,
        fileName: parsedFile.fileName,
      });

      setImportResult({
        totalRows: importRows.length,
        importedCount: result.importedCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedRows.length,
        failedRows: result.failedRows,
        fileName: parsedFile.fileName,
      });

      // Trigger customer list refresh in parent
      onImportComplete();

      setStep(5);
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import failed. Please try again.');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  }, [parsedFile, user, importRows, isImporting, onImportComplete]);

  // ─── Reset to start a new import ─────────────────────────────────────────
  const handleImportAnother = useCallback(() => {
    setParsedFile(null);
    setMappings([]);
    setImportRows([]);
    setImportResult(null);
    setImportProgress(null);
    setStep(1);
  }, []);

  // ─── Step indicator ───────────────────────────────────────────────────────
  const visibleSteps: ImportStep[] = [1, 2, 3, 5];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-surface w-full max-w-3xl rounded-card shadow-neo-hover border border-shadow-darker/10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-shadow-darker/10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-primary-dark flex items-center gap-2">
              <Upload size={20} className="text-primary" />
              Bulk Customer Import
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Import customers from CSV or Excel files
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-1.5 rounded-lg text-secondary hover:text-primary-dark hover:bg-shadow-darker/10 transition-colors disabled:opacity-50"
            aria-label="Close import modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        {step !== 5 && (
          <div className="px-6 py-4 border-b border-shadow-darker/10 shrink-0">
            <div className="flex items-center gap-1">
              {visibleSteps.map((s, i) => {
                const isCompleted = (step as number) > (s as number);
                const isCurrent = step === s || (step === 4 && s === 3);
                return (
                  <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
                    <div
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        isCurrent
                          ? 'bg-primary text-surface'
                          : isCompleted
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-shadow-darker/5 text-secondary'
                      }`}
                    >
                      {STEP_ICONS[s]}
                      <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
                      <span className="sm:hidden">{s === 5 ? 5 : s}</span>
                    </div>
                    {i < visibleSteps.length - 1 && (
                      <div
                        className={`h-px flex-1 mx-1 rounded-full ${
                          step > s ? 'bg-emerald-300' : 'bg-shadow-darker/15'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Permission denied */}
          {!canImport ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                <Lock size={28} />
              </div>
              <h3 className="text-lg font-bold text-primary-dark">Access Restricted</h3>
              <p className="text-secondary text-sm max-w-xs">
                Only <strong>Admin</strong> and <strong>Accounts</strong> users can perform bulk
                imports. Please contact your administrator.
              </p>
            </div>
          ) : step === 1 ? (
            <CustomerImportUpload onFileParsed={handleFileParsed} />
          ) : step === 2 ? (
            <CustomerColumnMapper
              headers={parsedFile?.headers ?? []}
              initialMappings={mappings}
              onMappingsConfirmed={handleMappingsConfirmed}
              onBack={() => setStep(1)}
            />
          ) : step === 3 || step === 4 ? (
            <CustomerImportPreview
              rows={importRows}
              onRowsChange={setImportRows}
              onConfirm={handleConfirmImport}
              onBack={() => setStep(2)}
              isImporting={isImporting}
              importProgress={importProgress}
            />
          ) : step === 5 && importResult ? (
            <CustomerImportResult
              result={importResult}
              onClose={onClose}
              onImportAnother={handleImportAnother}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

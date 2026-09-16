/**
 * Step 5 — Import Result
 * Displays a summary of the completed import with counts and
 * an option to download an error report for failed rows.
 */
import { CheckCircle, XCircle, AlertTriangle, SkipForward, Download, RefreshCw } from 'lucide-react';
import type { ImportResult } from '../../types/customerImport';
import { downloadErrorReport } from '../../lib/customerImport';

interface Props {
  result: ImportResult;
  onClose: () => void;
  onImportAnother: () => void;
}

export default function CustomerImportResult({ result, onClose, onImportAnother }: Props) {
  const hasErrors = result.failedCount > 0;
  const isFullSuccess = result.failedCount === 0 && result.skippedCount === 0;

  return (
    <div className="space-y-6">
      {/* Hero status */}
      <div className="text-center py-4">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            isFullSuccess
              ? 'bg-emerald-100 text-emerald-600'
              : hasErrors
              ? 'bg-amber-100 text-amber-600'
              : 'bg-sky-100 text-sky-600'
          }`}
        >
          {isFullSuccess ? (
            <CheckCircle size={40} />
          ) : hasErrors ? (
            <AlertTriangle size={40} />
          ) : (
            <CheckCircle size={40} />
          )}
        </div>
        <h3 className="text-xl font-bold text-primary-dark">
          {isFullSuccess
            ? 'Import Complete!'
            : hasErrors
            ? 'Import Completed with Errors'
            : 'Import Complete'}
        </h3>
        <p className="text-secondary text-sm mt-1">
          {result.totalRows} row{result.totalRows !== 1 ? 's' : ''} processed from{' '}
          <span className="font-semibold">{result.fileName}</span>
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl p-4 bg-emerald-50 text-center">
          <CheckCircle size={20} className="text-emerald-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-emerald-700">{result.importedCount}</div>
          <div className="text-xs text-emerald-600 mt-0.5 font-medium">Imported</div>
        </div>
        <div className="rounded-2xl p-4 bg-sky-50 text-center">
          <RefreshCw size={20} className="text-sky-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-sky-700">{result.updatedCount}</div>
          <div className="text-xs text-sky-600 mt-0.5 font-medium">Updated</div>
        </div>
        <div className="rounded-2xl p-4 bg-gray-50 text-center">
          <SkipForward size={20} className="text-gray-500 mx-auto mb-1" />
          <div className="text-2xl font-bold text-gray-600">{result.skippedCount}</div>
          <div className="text-xs text-gray-500 mt-0.5 font-medium">Skipped</div>
        </div>
        <div className={`rounded-2xl p-4 text-center ${hasErrors ? 'bg-red-50' : 'bg-gray-50'}`}>
          <XCircle size={20} className={`mx-auto mb-1 ${hasErrors ? 'text-red-500' : 'text-gray-400'}`} />
          <div className={`text-2xl font-bold ${hasErrors ? 'text-red-600' : 'text-gray-400'}`}>
            {result.failedCount}
          </div>
          <div className={`text-xs mt-0.5 font-medium ${hasErrors ? 'text-red-500' : 'text-gray-400'}`}>
            Failed
          </div>
        </div>
      </div>

      {/* Failed rows detail */}
      {hasErrors && (
        <div className="rounded-2xl border border-red-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-b border-red-200">
            <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <XCircle size={15} />
              {result.failedCount} failed row{result.failedCount !== 1 ? 's' : ''}
            </p>
            <button
              type="button"
              onClick={() => downloadErrorReport(result.failedRows, result.fileName)}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-900 underline underline-offset-2"
            >
              <Download size={13} />
              Download Error Report (.xlsx)
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-red-50/50 border-b border-red-100 text-left text-secondary uppercase tracking-wider">
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Field</th>
                  <th className="px-3 py-2 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.failedRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-red-100 last:border-0 hover:bg-red-50/30 transition-colors"
                  >
                    <td className="px-3 py-2 font-mono text-secondary">{row.rowNumber}</td>
                    <td className="px-3 py-2 font-medium text-primary-dark truncate max-w-[120px]">
                      {row.customerName}
                    </td>
                    <td className="px-3 py-2 text-secondary">{row.failedField}</td>
                    <td className="px-3 py-2 text-red-600">{row.errorReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={onImportAnother}
          className="neo-btn flex-1 flex items-center justify-center gap-2"
        >
          <RefreshCw size={15} />
          Import Another File
        </button>
        <button
          type="button"
          onClick={onClose}
          className="neo-btn-primary flex-1 flex items-center justify-center gap-2"
        >
          <CheckCircle size={15} />
          Done — View Customers
        </button>
      </div>
    </div>
  );
}

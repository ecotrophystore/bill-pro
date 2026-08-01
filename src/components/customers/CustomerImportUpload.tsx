/**
 * Step 1 — File Upload
 * Allows users to drag-and-drop or click-to-upload CSV/XLS/XLSX files.
 * Also provides a "Download Sample Template" button.
 */
import { useCallback, useRef, useState } from 'react';
import { Upload, FileDown, File, X, AlertCircle } from 'lucide-react';
import { downloadSampleTemplate, parseImportFile } from '../../lib/customerImport';
import type { ParsedFile } from '../../types/customerImport';

interface Props {
  onFileParsed: (result: ParsedFile) => void;
}

const ACCEPTED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];
const ACCEPTED_MIME = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export default function CustomerImportUpload({ onFileParsed }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        setError(`Unsupported file type: ${ext}. Please upload CSV, XLS, or XLSX.`);
        return;
      }
      setSelectedFile(file);
      setIsLoading(true);
      try {
        const parsed = await parseImportFile(file);
        if (parsed.rows.length === 0) {
          setError('The file has no data rows. Please check your file and try again.');
          setIsLoading(false);
          return;
        }
        onFileParsed(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file.');
        setSelectedFile(null);
      } finally {
        setIsLoading(false);
      }
    },
    [onFileParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [handleFile]
  );

  return (
    <div className="space-y-6">
      {/* Download sample template */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5 border border-primary/20">
        <div>
          <p className="text-sm font-semibold text-primary-dark">New to importing?</p>
          <p className="text-xs text-secondary mt-0.5">
            Download our sample template with the correct column headers.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadSampleTemplate}
          className="neo-btn flex items-center gap-2 text-sm whitespace-nowrap"
        >
          <FileDown size={16} />
          Download Template
        </button>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload file drop zone"
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-primary bg-primary/10 scale-[1.01]'
            : 'border-shadow-darker/30 hover:border-primary/50 hover:bg-primary/5'
          }
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isLoading && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={[...ACCEPTED_EXTENSIONS, ...ACCEPTED_MIME].join(',')}
          className="hidden"
          onChange={handleInputChange}
          id="bulk-import-file-input"
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <p className="text-secondary font-medium">Reading file…</p>
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <File size={28} />
            </div>
            <p className="text-primary-dark font-semibold">{selectedFile.name}</p>
            <p className="text-xs text-secondary">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
            <button
              type="button"
              className="text-xs text-secondary hover:text-error flex items-center gap-1 mt-1"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                setError(null);
              }}
            >
              <X size={12} /> Remove file
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <Upload size={30} />
            </div>
            <div>
              <p className="text-primary-dark font-semibold text-lg">
                Drop your file here
              </p>
              <p className="text-secondary text-sm mt-1">
                or <span className="text-primary font-semibold underline underline-offset-2">click to browse</span>
              </p>
            </div>
            <p className="text-xs text-secondary/60 mt-1">
              Supported: CSV, XLS, XLSX
            </p>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
    </div>
  );
}

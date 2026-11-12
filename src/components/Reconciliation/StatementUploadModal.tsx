import { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Loader2, Calendar } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { db, auth } from '../../lib/firebase';
import { collection, addDoc, getDocs, query, where, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { extractDataFromDocument } from '../../services/ai';
import { parseAnyDate, toMonthKey } from '../../utils/reconciliationEngine';

export interface StatementUploadResult {
  statementLogId: string;
  startDate: Date;
  endDate: Date;
  coveredMonths: string[];
  rowCount: number;
}

function parseNumericAmount(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (val === null || val === undefined) return 0;
  const cleaned = String(val).replace(/[₹$,\s]/g, '').trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeParsedRow(r: any): {
  date: Date;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  reference: string;
} | null {
  const dateObj =
    r.Date instanceof Date
      ? r.Date
      : parseAnyDate(r.Date || r.date || r['Txn Date'] || r['Transaction Date'] || r['Value Date']);
  if (!dateObj || isNaN(dateObj.getTime())) return null;

  const description = String(
    r.Description || r.description || r.Narration || r.narration || r.Particulars || r.particulars || r.Remarks || 'Unknown'
  ).trim();

  const creditVal = parseNumericAmount(r.Credit ?? r.credit ?? r.Deposit ?? r.deposit ?? r['Deposit Amt.'] ?? r['Credit Amount']);
  const debitVal = parseNumericAmount(r.Debit ?? r.debit ?? r.Withdrawal ?? r.withdrawal ?? r['Withdrawal Amt.'] ?? r['Debit Amount']);
  const genericVal = parseNumericAmount(r.Amount ?? r.amount ?? r['Transaction Amount']);

  let amount = 0;
  let type: 'credit' | 'debit' = 'credit';

  if (debitVal > 0 && creditVal === 0) {
    amount = Math.abs(debitVal);
    type = 'debit';
  } else if (creditVal > 0 && debitVal === 0) {
    amount = Math.abs(creditVal);
    type = 'credit';
  } else if (genericVal !== 0) {
    const rawType = String(r.Type || r.type || r['Dr/Cr'] || '').toLowerCase();
    if (genericVal < 0 || rawType.includes('deb') || rawType === 'dr') {
      type = 'debit';
    } else {
      type = 'credit';
    }
    amount = Math.abs(genericVal);
  }

  if (amount <= 0 || isNaN(amount)) return null;

  const reference = String(
    r.Reference || r.reference || r['Ref No'] || r['Ref No.'] || r['Chq./Ref.No.'] || r.Ref || r['UTR'] || ''
  ).trim();

  return { date: dateObj, description, amount, type, reference };
}

export default function StatementUploadModal({
  isOpen,
  onClose,
  onComplete,
  defaultMonthKey,
}: {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (result: StatementUploadResult) => void;
  defaultMonthKey?: string;
}) {
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [coversFullMonth, setCoversFullMonth] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (defaultMonthKey && /^\d{4}-\d{2}$/.test(defaultMonthKey)) {
        const [y, m] = defaultMonthKey.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        setPeriodFrom(`${defaultMonthKey}-01`);
        setPeriodTo(`${defaultMonthKey}-${String(lastDay).padStart(2, '0')}`);
      }
    }
  }, [isOpen, defaultMonthKey]);

  if (!isOpen) return null;

  const processAndSaveTransactions = async (validRows: NonNullable<ReturnType<typeof normalizeParsedRow>>[]) => {
    if (validRows.length === 0) throw new Error('Could not parse valid transactions. Check the file format and columns.');

    const sorted = [...validRows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const minTxnDate = sorted[0].date;
    const maxTxnDate = sorted[sorted.length - 1].date;

    const startDate = periodFrom ? parseAnyDate(periodFrom) || minTxnDate : minTxnDate;
    const endDate = periodTo ? parseAnyDate(periodTo) || maxTxnDate : maxTxnDate;

    if (endDate.getTime() < startDate.getTime()) {
      throw new Error('Statement Period End date cannot be earlier than Start date.');
    }

    const cleanBank = bankName.trim();
    const cleanAcct = accountNumber.trim();

    // Check overlapping statement coverage for this same bank & account
    const logQuery = query(
      collection(db, 'statement_logs'),
      where('bank_name', '==', cleanBank),
      where('account_number', '==', cleanAcct)
    );
    const logSnap = await getDocs(logQuery);
    let hasOverlap = false;
    logSnap.forEach((d) => {
      const log = d.data();
      const logStart = parseAnyDate(log.start_date);
      const logEnd = parseAnyDate(log.end_date);
      if (logStart && logEnd) {
        const s1 = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
        const e1 = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
        const s2 = new Date(logStart.getFullYear(), logStart.getMonth(), logStart.getDate()).getTime();
        const e2 = new Date(logEnd.getFullYear(), logEnd.getMonth(), logEnd.getDate()).getTime();
        if (s1 <= e2 && e1 >= s2) {
          hasOverlap = true;
        }
      }
    });

    if (hasOverlap) {
      throw new Error(
        `Duplicate Date Range Detected: "${cleanBank} (${cleanAcct})" already has an uploaded statement overlapping ${startDate.toLocaleDateString('en-IN')} to ${endDate.toLocaleDateString('en-IN')}.`
      );
    }

    // Derive covered_months explicitly from [startDate, endDate] (only full months or user-confirmed single month)
    const coveredMonthsSet = new Set<string>();
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endMonthCursor = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (cursor <= endMonthCursor) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const mKey = `${y}-${String(m).padStart(2, '0')}`;
      const daysInM = new Date(y, m, 0).getDate();
      const mStart = new Date(y, m - 1, 1);
      const mEnd = new Date(y, m - 1, daysInM);

      let coveredDays = 0;
      for (let d = 1; d <= daysInM; d++) {
        const dt = new Date(y, m - 1, d).getTime();
        const s0 = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
        const e0 = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()).getTime();
        if (dt >= s0 && dt <= e0) coveredDays++;
      }

      if (coveredDays / daysInM >= 0.8 || (coversFullMonth && minTxnDate >= mStart && maxTxnDate <= new Date(mEnd.getTime() + 86400000))) {
        coveredMonthsSet.add(mKey);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const coveredMonths = Array.from(coveredMonthsSet);

    const logRef = await addDoc(collection(db, 'statement_logs'), {
      bank_name: cleanBank,
      account_number: cleanAcct,
      start_date: Timestamp.fromDate(startDate),
      end_date: Timestamp.fromDate(endDate),
      upload_date: Timestamp.now(),
      uploaded_by: auth?.currentUser?.uid || 'unknown',
      row_count: validRows.length,
      covered_months: coveredMonths,
      statement_month: coveredMonths.length === 1 ? coveredMonths[0] : toMonthKey(startDate),
    });

    // Save every imported transaction in batches
    const BATCH_LIMIT = 400;
    for (let i = 0; i < validRows.length; i += BATCH_LIMIT) {
      const slice = validRows.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      slice.forEach((row, idx) => {
        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          bank_transaction_id: `b_tx_${Date.now()}_${i + idx}_${Math.floor(Math.random() * 1000)}`,
          statement_log_id: logRef.id,
          bank_name: cleanBank,
          account_number: cleanAcct,
          date: Timestamp.fromDate(row.date),
          amount: row.amount,
          description: row.description,
          type: row.type,
          reference_number: row.reference || '',
          match_status: 'pending_review',
          created_at: Timestamp.now(),
        });
      });
      await batch.commit();
    }

    setIsUploading(false);
    setFile(null);
    if (onComplete) {
      onComplete({
        statementLogId: logRef.id,
        startDate,
        endDate,
        coveredMonths,
        rowCount: validRows.length,
      });
    }
    onClose();
  };

  const handleFileChange = (selectedFile: File | null) => {
    setFile(selectedFile);
    setError(null);
    if (!selectedFile) return;

    // Auto-detect statement date span from CSV / XLSX so user sees exact range before uploading
    const ext = selectedFile.name.toLowerCase().split('.').pop();
    if (ext === 'csv') {
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const parsed = (results.data as any[]).map(normalizeParsedRow).filter(Boolean) as NonNullable<ReturnType<typeof normalizeParsedRow>>[];
          if (parsed.length > 0) {
            parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
            const first = parsed[0].date;
            const last = parsed[parsed.length - 1].date;
            const fmtIso = (d: Date) =>
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            setPeriodFrom(fmtIso(first));
            setPeriodTo(fmtIso(last));
          }
        },
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet) as any[];
          const parsed = rows.map(normalizeParsedRow).filter(Boolean) as NonNullable<ReturnType<typeof normalizeParsedRow>>[];
          if (parsed.length > 0) {
            parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
            const fmtIso = (d: Date) =>
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            setPeriodFrom(fmtIso(parsed[0].date));
            setPeriodTo(fmtIso(parsed[parsed.length - 1].date));
          }
        } catch {}
      };
      reader.readAsArrayBuffer(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !bankName.trim() || !accountNumber.trim()) {
      setError('Please enter Bank Name, Account Number, and select a statement file.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const ext = file.name.toLowerCase().split('.').pop();

      if (ext === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const rows = results.data as any[];
              if (rows.length === 0) throw new Error('The CSV file is empty.');
              const validRows = rows.map(normalizeParsedRow).filter(Boolean) as NonNullable<ReturnType<typeof normalizeParsedRow>>[];
              await processAndSaveTransactions(validRows);
            } catch (err: any) {
              setError(err.message);
              setIsUploading(false);
            }
          },
          error: (err) => {
            setError('Error parsing CSV: ' + err.message);
            setIsUploading(false);
          },
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet) as any[];
            if (rows.length === 0) throw new Error('The Excel file is empty.');
            const validRows = rows.map(normalizeParsedRow).filter(Boolean) as NonNullable<ReturnType<typeof normalizeParsedRow>>[];
            await processAndSaveTransactions(validRows);
          } catch (err: any) {
            setError(err.message);
            setIsUploading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === 'pdf') {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const base64Url = e.target?.result as string;
            const base64Data = base64Url.split(',')[1];
            const data = await extractDataFromDocument(base64Data, file.type || 'application/pdf', 'statement');
            if (!data?.transactions) throw new Error('Failed to extract transactions from PDF.');
            const validRows = (data.transactions as any[])
              .map(normalizeParsedRow)
              .filter(Boolean) as NonNullable<ReturnType<typeof normalizeParsedRow>>[];
            await processAndSaveTransactions(validRows);
          } catch (err: any) {
            setError(err.message);
            setIsUploading(false);
          }
        };
        reader.readAsDataURL(file);
      } else {
        setError('Unsupported file format. Please upload CSV, XLSX, XLS, or PDF.');
        setIsUploading(false);
      }
    } catch (err: any) {
      setError(err.message);
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface rounded-card shadow-neo-raised w-full max-w-lg overflow-hidden border border-shadow-light animate-fade-in">
        <div className="p-6 border-b border-shadow-dark flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-primary-dark">Upload Bank Statement</h2>
            <p className="text-xs text-secondary mt-0.5">
              Imports all transactions and automatically compares them against bills.
            </p>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-primary-dark transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 bg-surface shadow-neo-surface text-error rounded-card text-xs font-semibold border border-error/20">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-primary-dark px-1 block mb-1">Bank Name</label>
              <input
                type="text"
                className="neo-input w-full text-xs"
                placeholder="e.g. HDFC Bank"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-primary-dark px-1 block mb-1">Account (Last 4 digits)</label>
              <input
                type="text"
                className="neo-input w-full text-xs"
                placeholder="e.g. 3061"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-primary-dark px-1 flex items-center gap-1 mb-1">
                <Calendar size={12} className="text-primary" /> Statement From
              </label>
              <input
                type="date"
                className="neo-input w-full text-xs"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-primary-dark px-1 flex items-center gap-1 mb-1">
                <Calendar size={12} className="text-primary" /> Statement To
              </label>
              <input
                type="date"
                className="neo-input w-full text-xs"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer select-none px-1">
            <input
              type="checkbox"
              checked={coversFullMonth}
              onChange={(e) => setCoversFullMonth(e.target.checked)}
              className="accent-primary rounded"
            />
            <span>Mark statement as covering the full month of the imported transactions</span>
          </label>

          <div>
            <label className="text-xs font-bold text-primary-dark px-1 block mb-1">Statement File</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="neo-input w-full h-28 flex flex-col items-center justify-center cursor-pointer border-dashed border-2 border-shadow-dark hover:border-primary transition-colors"
            >
              <input
                type="file"
                accept=".csv, .xlsx, .xls, .pdf"
                ref={fileInputRef}
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />
              <FileText size={28} className="text-primary/60 mb-1.5" />
              <p className="text-xs text-primary-dark font-semibold">
                {file ? file.name : 'Click to select statement file'}
              </p>
              <p className="text-[11px] text-secondary mt-0.5">Supports CSV, XLSX, XLS, PDF</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-shadow-dark">
            <button type="button" onClick={onClose} className="neo-btn text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="neo-btn-primary text-xs flex items-center gap-2"
            >
              {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {isUploading ? 'Importing & Reconciling...' : 'Upload & Process'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

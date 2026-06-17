import { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { db, functions } from '../../lib/firebase';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

export default function StatementUploadModal({ 
  isOpen, 
  onClose,
  onComplete
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onComplete?: () => void;
}) {
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const processAndSaveTransactions = async (validRows: any[]) => {
    if (validRows.length === 0) throw new Error("Could not parse rows. Check file format.");

    const sorted = [...validRows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const startDate = sorted[0].date;
    const endDate = sorted[sorted.length - 1].date;

    const logQuery = query(collection(db, 'statement_logs'), 
      where('bank_name', '==', bankName),
      where('account_number', '==', accountNumber)
    );
    const logSnap = await getDocs(logQuery);
    let hasOverlap = false;
    logSnap.forEach(doc => {
      const log = doc.data();
      const logStart = log.start_date.toDate().getTime();
      const logEnd = log.end_date.toDate().getTime();
      if ((startDate.getTime() <= logEnd) && (endDate.getTime() >= logStart)) {
        hasOverlap = true;
      }
    });

    if (hasOverlap) {
      throw new Error(`Duplicate Date Range Detected: This account already has a statement overlapping with ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
    }

    await addDoc(collection(db, 'statement_logs'), {
      bank_name: bankName,
      account_number: accountNumber,
      start_date: Timestamp.fromDate(startDate),
      end_date: Timestamp.fromDate(endDate),
      upload_date: Timestamp.now(),
      row_count: validRows.length
    });

    for (const row of validRows) {
      await addDoc(collection(db, 'transactions'), {
        bank_transaction_id: `b_tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        date: Timestamp.fromDate(row.date),
        amount: row.amount,
        description: row.description,
        type: row.type,
        reference_number: row.reference || '',
        match_status: 'pending_review'
      });
    }

    if (functions) {
      const analyzeFn = httpsCallable(functions, 'analyzePendingTransactions');
      analyzeFn().catch(e => console.error("Auto analysis failed:", e));
    }

    if (onComplete) onComplete();
    onClose();
  };

  const handleUpload = async () => {
    if (!file || !bankName || !accountNumber) {
      setError("Please fill in all fields and select a file.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const ext = file.name.toLowerCase().split('.').pop();
      
      const parseDateStr = (dStr: string | undefined) => {
        if (!dStr) return new Date(NaN);
        const parts = dStr.toString().split(/[-/]/);
        if (parts.length === 3) {
           if (parts[0].length === 4) return new Date(dStr);
           return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
        return new Date(dStr);
      };

      if (ext === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const rows = results.data as any[];
              if (rows.length === 0) throw new Error("Empty CSV");
              const validRows = rows.map(r => ({
                date: parseDateStr(r.Date || r.date),
                description: r.Description || r.description || r.Narration || r.narration || 'Unknown',
                amount: parseFloat(r.Amount || r.amount || r.Credit || r.credit || r.Debit || r.debit || '0'),
                type: (r.Type || r.type || '').toLowerCase().includes('deb') || (r.Debit || r.debit) ? 'debit' : 'credit',
                reference: r.Reference || r.reference || r['Ref No'] || r.Ref || ''
              })).filter(r => !isNaN(r.amount) && !isNaN(r.date.getTime()));
              
              await processAndSaveTransactions(validRows);
            } catch (err: any) {
              setError(err.message);
              setIsUploading(false);
            }
          },
          error: (err) => {
            setError("Error parsing CSV: " + err.message);
            setIsUploading(false);
          }
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet) as any[];
            
            if (rows.length === 0) throw new Error("Empty Excel file");
            const validRows = rows.map(r => ({
              date: r.Date instanceof Date ? r.Date : parseDateStr(r.Date || r.date || r['Value Date']),
              description: r.Description || r.description || r.Narration || r.narration || 'Unknown',
              amount: parseFloat(r.Amount || r.amount || r.Credit || r.credit || r.Debit || r.debit || '0'),
              type: (r.Type || r.type || '').toLowerCase().includes('deb') || (r.Debit || r.debit) ? 'debit' : 'credit',
              reference: r.Reference || r.reference || r['Ref No'] || r.Ref || ''
            })).filter(r => !isNaN(r.amount) && !isNaN(r.date.getTime()));

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
            
            if (!functions) throw new Error("Functions not initialized");
            const parsePdfFn = httpsCallable(functions, 'parsePDFStatement');
            const res = await parsePdfFn({ base64Data, mimeType: file.type || 'application/pdf' });
            const data = res.data as any;
            
            if (!data.success || !data.transactions) throw new Error("Failed to extract data from PDF");
            
            const validRows = data.transactions.map((r: any) => ({
              date: new Date(r.date),
              description: r.description || 'Unknown',
              amount: parseFloat(r.amount || 0),
              type: r.type === 'debit' ? 'debit' : 'credit',
              reference: r.reference || ''
            })).filter((r: any) => !isNaN(r.amount) && !isNaN(r.date.getTime()));

            await processAndSaveTransactions(validRows);
          } catch (err: any) {
            setError(err.message);
            setIsUploading(false);
          }
        };
        reader.readAsDataURL(file);
      } else {
        setError("Unsupported file format. Please upload CSV, XLSX, or PDF.");
        setIsUploading(false);
      }
    } catch (err: any) {
      setError(err.message);
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-primary-dark/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface rounded-3xl shadow-neo-surface w-full max-w-lg overflow-hidden border border-shadow-darker/10 animate-slide-up">
        <div className="bg-shadow-darker/5 p-6 border-b border-shadow-darker/10 flex justify-between items-center">
          <h2 className="text-xl font-bold text-primary-dark">Upload Bank Statement</h2>
          <button onClick={onClose} className="text-secondary hover:text-error transition-colors"><X size={24} /></button>
        </div>
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-error/10 text-error rounded-xl text-sm font-semibold border border-error/20">
              {error}
            </div>
          )}
          
          <div>
             <label className="text-sm font-semibold text-primary-dark px-1">Bank Name</label>
             <input type="text" className="neo-input w-full mt-1" placeholder="e.g. HDFC Bank" value={bankName} onChange={e => setBankName(e.target.value)} />
          </div>

          <div>
             <label className="text-sm font-semibold text-primary-dark px-1">Account Number (Last 4 digits)</label>
             <input type="text" className="neo-input w-full mt-1" placeholder="e.g. 1234" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-semibold text-primary-dark px-1">Statement File</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 neo-input w-full h-32 flex flex-col items-center justify-center cursor-pointer border-dashed border-2 hover:border-primary transition-colors"
            >
               <input 
                 type="file" 
                 accept=".csv, .xlsx, .xls, .pdf" 
                 ref={fileInputRef} 
                 onChange={e => setFile(e.target.files?.[0] || null)} 
                 className="hidden" 
               />
               <FileText size={32} className="text-secondary/50 mb-2" />
               <p className="text-sm text-secondary font-medium">
                 {file ? file.name : "Click to select or drag and drop file"}
               </p>
               <p className="text-xs text-secondary/70 mt-1">Supports: CSV, XLSX, XLS, PDF</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-shadow-darker/10">
            <button onClick={onClose} className="neo-btn text-secondary hover:text-error">Cancel</button>
            <button 
              onClick={handleUpload} 
              disabled={isUploading}
              className="neo-btn-primary flex items-center gap-2"
            >
              {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {isUploading ? "Processing..." : "Upload & Analyze"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

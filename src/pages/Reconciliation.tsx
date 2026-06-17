import { useEffect, useState } from 'react';
import { CheckCircle2, Search, ArrowUpRight, ArrowDownLeft, Loader2, Sparkles, AlertCircle, Upload, ArrowLeft, FolderOpen, Download, ChevronDown } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, where, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import StatementUploadModal from '../components/Reconciliation/StatementUploadModal';
import type { Transaction, StatementUploadLog } from '../types';
import VoiceDictation from '../components/VoiceDictation';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reconciliation() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statementLogs, setStatementLogs] = useState<StatementUploadLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending_review'>('pending_review');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReportDropdown, setShowReportDropdown] = useState(false);

  const filteredTransactions = transactions.filter(tx => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      tx.description?.toLowerCase().includes(query) ||
      tx.category?.toLowerCase().includes(query) ||
      (tx.amount && tx.amount.toString().includes(query)) ||
      tx.bank_transaction_id?.toLowerCase().includes(query) ||
      (tx.metadata?.suggested_doc_id && tx.metadata.suggested_doc_id.toLowerCase().includes(query))
    );
  });

  const handleVoiceReconciliation = (customerName: string | null, items: any[]) => {
    const term = customerName || (items && items[0]?.description) || '';
    if (term) {
      setSearchQuery(term);
    }
  };

  const handleDownloadReport = (format: 'excel' | 'pdf') => {
    if (format === 'excel') {
      const reportData = filteredTransactions.map(tx => ({
        'Date': tx.date ? (tx.date as any).toDate ? (tx.date as any).toDate().toLocaleDateString('en-IN') : new Date(tx.date as any).toLocaleDateString('en-IN') : 'N/A',
        'Description': tx.description,
        'Type': tx.type.toUpperCase(),
        'Amount (₹)': tx.amount,
        'Category': tx.category || 'Uncategorized',
        'Match Status': tx.match_status.toUpperCase(),
        'Matched Document ID': tx.metadata?.suggested_doc_id || 'None'
      }));

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
      XLSX.writeFile(wb, "Reconciliation_Report.xlsx");
    } else {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Reconciliation Report", 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

      autoTable(doc, {
        startY: 40,
        head: [['Date', 'Description', 'Type', 'Amount', 'Category', 'Match Status']],
        body: filteredTransactions.map(tx => [
          tx.date ? (tx.date as any).toDate ? (tx.date as any).toDate().toLocaleDateString('en-IN') : new Date(tx.date as any).toLocaleDateString('en-IN') : 'N/A',
          tx.description || '',
          tx.type.toUpperCase(),
          `Rs. ${tx.amount.toLocaleString()}`,
          tx.category || 'Uncategorized',
          tx.match_status.toUpperCase()
        ]),
        theme: 'striped',
      });
      doc.save("Reconciliation_Report.pdf");
    }
  };

  const handleAutoMatchAll = async () => {
    if (!functions) return;
    
    const candidates = transactions.filter(
      tx => (tx.match_status === 'pending_review' || tx.match_status === 'unmatched') && tx.metadata?.suggested_doc_id
    );

    if (candidates.length === 0) {
      alert("No pending transactions with AI suggestions to match.");
      return;
    }

    const confirm = window.confirm(`Are you sure you want to auto-match all ${candidates.length} transactions with AI suggestions?`);
    if (!confirm) return;

    setIsAutoMatching(true);
    let successCount = 0;
    let failCount = 0;

    try {
      const matchFn = httpsCallable(functions, 'matchTransaction');
      
      await Promise.all(
        candidates.map(async (tx) => {
          try {
            await matchFn({
              transactionId: tx.id,
              documentId: tx.metadata!.suggested_doc_id,
              documentType: tx.type === 'credit' ? 'invoice' : 'purchase'
            });
            successCount++;
          } catch (err) {
            console.error(`Failed to auto-match transaction ${tx.id}:`, err);
            failCount++;
          }
        })
      );

      alert(`Auto-match complete! Successfully matched ${successCount} transactions.${failCount > 0 ? ` Failed to match ${failCount} transactions.` : ''}`);
    } catch (err: any) {
      console.error("Auto-matching process failed:", err);
      alert("An error occurred during auto-matching: " + err.message);
    } finally {
      setIsAutoMatching(false);
    }
  };


  useEffect(() => {
    if (!db) return;
    const q = filter === 'pending_review' 
      ? query(collection(db, 'transactions'), where('match_status', 'in', ['pending_review', 'unmatched']))
      : query(collection(db, 'transactions'));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
        fetched.sort((a, b) => {
          const dateA = a.date && typeof (a.date as any).toDate === 'function' ? (a.date as any).toDate() : new Date((a.date as any) || 0);
          const dateB = b.date && typeof (b.date as any).toDate === 'function' ? (b.date as any).toDate() : new Date((b.date as any) || 0);
          return dateB.getTime() - dateA.getTime();
        });
        setTransactions(fetched);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching transactions:", error);
        setLoading(false);
      }
    );

    const logQ = query(collection(db, 'statement_logs'), orderBy('upload_date', 'desc'), limit(1));
    const unsubLogs = onSnapshot(logQ, (snap) => {
      setStatementLogs(snap.docs.map(d => ({id: d.id, ...d.data()} as StatementUploadLog)));
    });

    return () => { unsubscribe(); unsubLogs(); };
  }, [filter]);

  const handleAcceptMatch = async (tx: Transaction) => {
    if (!functions) return;
    if (!tx.metadata?.suggested_doc_id) {
       alert("No suggested document to match with.");
       return;
    }

    setProcessingId(tx.id);
    try {
      const matchFn = httpsCallable(functions, 'matchTransaction');
      await matchFn({
        transactionId: tx.id,
        documentId: tx.metadata.suggested_doc_id,
        documentType: tx.type === 'credit' ? 'invoice' : 'purchase'
      });
      // Verification: Success feedback
      console.log("Match successful");
    } catch (err: any) {
      console.error("Match failed:", err);
      alert("Failed to match: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleManualMatch = async (tx: Transaction) => {
    if (!tx.matched_id && !tx.metadata?.suggested_doc_id) {
       alert("No document linked to this transaction. Match not possible.");
       return;
    }
    
    const confirm = window.confirm(`Confirm matching this ₹${tx.amount} payment with the selected document?`);
    if (!confirm) return;

    setProcessingId(tx.id);
    try {
      const matchFn = httpsCallable(functions!, 'matchTransaction');
      await matchFn({
        transactionId: tx.id,
        documentId: tx.matched_id || tx.metadata?.suggested_doc_id,
        documentType: tx.type === 'credit' ? 'invoice' : 'purchase'
      });
      alert("Match confirmed!");
    } catch (err: any) {
      console.error("Match failed:", err);
      alert("Failed to confirm match: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const getStats = () => {
    let paymentsCollected = 0;
    let purchasePayments = 0;
    let salesPayments = 0;
    let otherExpenses = 0;

    transactions.forEach(tx => {
      if (tx.type === 'credit') paymentsCollected++;
      
      if (tx.category === 'Sales') salesPayments++;
      else if (tx.category === 'Purchase') purchasePayments++;
      else if (tx.category && ['Maintenance', 'Assets', 'Salary', 'Taxes', 'General'].includes(tx.category)) otherExpenses++;
      else if (tx.type === 'debit' && !tx.category) otherExpenses++; // Fallback
    });

    return { paymentsCollected, purchasePayments, salesPayments, otherExpenses };
  };

  const stats = getStats();
  const latestLog = statementLogs[0];
  const lastUploadDate = latestLog?.upload_date ? (latestLog.upload_date as any).toDate() : null;
  const nextUploadDate = latestLog?.end_date ? new Date((latestLog.end_date as any).toDate().getTime() + 30 * 24 * 60 * 60 * 1000) : null;

  const groupedTransactions = filteredTransactions.reduce((acc, tx) => {
    const cat = tx.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = { transactions: [], amount: 0, pendingCount: 0 };
    acc[cat].transactions.push(tx);
    acc[cat].amount += tx.amount;
    if (tx.match_status === 'pending_review' || tx.match_status === 'unmatched') {
      acc[cat].pendingCount++;
    }
    return acc;
  }, {} as Record<string, { transactions: Transaction[], amount: number, pendingCount: number }>);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Top Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-shadow-darker/30">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-primary-dark">Bank Reconciliation</h1>
          <p className="text-secondary mt-2 text-sm md:text-base">Match bank statements with invoices and purchases using AI assistance.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="shadow-sm rounded-2xl bg-white/40 p-1 border border-black/5 hover:border-black/10 transition-colors">
            <VoiceDictation 
              onParsedItems={handleVoiceReconciliation} 
              functionName="parseVoiceCommand" 
              label="Voice Reconciliation" 
            />
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setShowReportDropdown(!showReportDropdown)} 
              className="px-5 py-2.5 text-sm font-bold bg-white/60 hover:bg-white/90 text-primary-dark border border-black/5 hover:border-black/10 rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2"
            >
              <Download size={16} /> Report <ChevronDown size={14} />
            </button>
            {showReportDropdown && (
              <div 
                className="absolute right-0 mt-2 w-44 bg-white border border-black/5 rounded-xl shadow-lg z-50 py-1"
                onMouseLeave={() => setShowReportDropdown(false)}
              >
                <button 
                  onClick={() => { handleDownloadReport('excel'); setShowReportDropdown(false); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors text-sm font-semibold text-secondary hover:text-primary-dark"
                >
                  Excel (.xlsx)
                </button>
                <button 
                  onClick={() => { handleDownloadReport('pdf'); setShowReportDropdown(false); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors text-sm font-semibold text-secondary hover:text-primary-dark"
                >
                  PDF (.pdf)
                </button>
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsUploadModalOpen(true)} 
            className="px-5 py-2.5 text-sm font-bold bg-white/60 hover:bg-white/90 text-primary-dark border border-black/5 hover:border-black/10 rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2"
          >
            <Upload size={16} />
            Upload Statement
          </button>

          <button 
            onClick={handleAutoMatchAll} 
            disabled={isAutoMatching}
            className="px-5 py-2.5 text-sm font-bold bg-primary hover:bg-primary-dark text-white rounded-xl shadow-md transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
          >
            {isAutoMatching ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isAutoMatching ? 'Matching...' : 'Auto-Match All'}
          </button>
        </div>
      </div>

      {/* CFO Dashboard Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Upload Status */}
        <div className="bg-white/60 border border-white/80 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-300">
          <div>
             <p className="text-[10px] font-extrabold text-secondary uppercase tracking-widest mb-1.5">Upload Status</p>
             <h3 className="text-xl font-extrabold text-primary-dark">
                {lastUploadDate ? lastUploadDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}
             </h3>
             {latestLog && (
                <p className="text-[11px] text-secondary mt-1.5 font-medium truncate bg-black/5 px-2 py-1 rounded">
                   {latestLog.bank_name}
                </p>
             )}
          </div>
          <div className="mt-6 pt-4 border-t border-black/5 flex justify-between items-center">
             <div>
                <p className="text-[9px] font-extrabold text-secondary uppercase tracking-widest">Next Due Date</p>
                <p className="text-sm font-extrabold text-orange-600 mt-0.5">
                   {nextUploadDate ? nextUploadDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending'}
                </p>
             </div>
             {latestLog && (
                <span className="text-[9px] text-secondary/70 font-semibold text-right max-w-[100px] truncate">
                   Data to: {latestLog.end_date ? (latestLog.end_date as any).toDate().toLocaleDateString('en-IN', {day: 'numeric', month: 'short'}) : ''}
                </span>
             )}
          </div>
        </div>

        {/* Card 2: Payments Collected */}
        <div className="bg-white/60 border border-white/80 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-300">
          <div>
             <p className="text-[10px] font-extrabold text-secondary uppercase tracking-widest mb-1.5">Payments Collected</p>
             <h3 className="text-4xl font-black text-green-700">{stats.paymentsCollected}</h3>
          </div>
          <div className="mt-6 pt-4 border-t border-black/5">
             <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Total Credits Processed</p>
          </div>
        </div>

        {/* Card 3: Sales Processed */}
        <div className="bg-white/60 border border-white/80 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-300">
          <div>
             <p className="text-[10px] font-extrabold text-secondary uppercase tracking-widest mb-1.5">Sales Processed</p>
             <h3 className="text-4xl font-black text-primary-dark">{stats.salesPayments}</h3>
          </div>
          <div className="mt-6 pt-4 border-t border-black/5">
             <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Matched to Invoices</p>
          </div>
        </div>

        {/* Card 4: Purchases & Other Expenses */}
        <div className="bg-white/60 border border-white/80 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-300">
          <div className="flex gap-4">
            <div className="flex-1">
               <p className="text-[10px] font-extrabold text-secondary uppercase tracking-widest mb-1.5">Purchases</p>
               <h3 className="text-3xl font-black text-orange-600">{stats.purchasePayments}</h3>
            </div>
            <div className="w-px bg-black/10"></div>
            <div className="flex-1 pl-2">
               <p className="text-[10px] font-extrabold text-secondary uppercase tracking-widest mb-1.5">Other Exp.</p>
               <h3 className="text-3xl font-black text-red-600">{stats.otherExpenses}</h3>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-black/5">
             <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Total Debits Classified</p>
          </div>
        </div>
      </div>

      {/* Tabs and Search Section */}
      {!selectedCategory && (
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 mt-8 bg-white/20 p-2.5 rounded-2xl border border-white/40 shadow-sm">
          <div className="flex bg-white/50 p-1.5 rounded-xl border border-black/5 gap-1.5 self-start shadow-sm">
            <button 
              onClick={() => setFilter('pending_review')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                filter === 'pending_review' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-secondary hover:text-primary-dark hover:bg-black/5'
              }`}
            >
              Pending ({transactions.filter(t => t.match_status === 'pending_review' || t.match_status === 'unmatched').length})
            </button>
            <button 
              onClick={() => setFilter('all')}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                filter === 'all' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-secondary hover:text-primary-dark hover:bg-black/5'
              }`}
            >
              All Transactions
            </button>
          </div>
          <div className="relative w-full md:w-80 shadow-sm rounded-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
            <input 
              type="text" 
              placeholder="Search transactions..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/70 hover:bg-white focus:bg-white rounded-xl border border-black/5 focus:border-primary/20 outline-none text-sm text-primary-dark font-medium transition-all"
            />
          </div>
        </div>
      )}

      {/* Category Drill-down Header */}
      {selectedCategory && (
         <div className="flex items-center gap-4 pb-6 border-b border-shadow-darker/30">
           <button 
             onClick={() => setSelectedCategory(null)} 
             className="px-4 py-2 text-sm font-bold bg-white/60 hover:bg-white/90 text-primary-dark border border-black/5 hover:border-black/10 rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2"
           >
             <ArrowLeft size={16} />
             Back to Categories
           </button>
           <div>
             <h2 className="text-2xl font-black text-primary-dark">{selectedCategory} Payments</h2>
             <p className="text-xs text-secondary font-semibold mt-1">{groupedTransactions[selectedCategory]?.transactions.length || 0} transactions</p>
           </div>
         </div>
      )}

      {/* Categories Grid or Detailed Table View */}
      {loading ? (
        <div className="p-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-primary" size={36} />
          <span className="text-sm text-secondary font-bold">Loading transactions...</span>
        </div>
      ) : !selectedCategory ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(groupedTransactions).map(([cat, data]) => (
            <div 
              key={cat} 
              onClick={() => setSelectedCategory(cat)} 
              className="bg-white/60 hover:bg-white/90 border border-white/80 p-6 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[160px] group"
            >
                <div className="flex justify-between items-start mb-4">
                   <div className="flex items-center gap-3">
                     <div className="p-3 bg-primary/10 rounded-xl text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                       <FolderOpen size={20} />
                     </div>
                     <h3 className="text-lg font-bold text-primary-dark group-hover:text-primary transition-colors">{cat}</h3>
                   </div>
                   <span className="text-[10px] font-extrabold uppercase text-secondary bg-black/5 px-2.5 py-1 rounded-full">{data.transactions.length} items</span>
                </div>
                
                <div className="flex items-end justify-between mt-6 pt-4 border-t border-black/5">
                   <div>
                     <p className="text-[9px] font-bold text-secondary uppercase tracking-widest mb-1">Total Amount</p>
                     <div className="text-2xl font-black text-primary-dark">₹ {data.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                   </div>
                   <div className="text-right">
                     {data.pendingCount > 0 ? (
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 justify-end">
                          <AlertCircle size={12} /> {data.pendingCount} Pending
                        </span>
                     ) : (
                        <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 justify-end">
                          <CheckCircle2 size={12} /> Cleared
                        </span>
                     )}
                   </div>
                </div>
            </div>
          ))}
        </div>
      ) : transactions.filter(tx => (tx.category || 'Uncategorized') === selectedCategory).length === 0 ? (
        <div className="p-20 text-center bg-white/40 border-2 border-dashed border-black/10 rounded-3xl shadow-sm flex flex-col items-center justify-center">
           <CheckCircle2 size={48} className="text-green-500 mb-4 opacity-40 animate-bounce" />
           <p className="text-primary-dark font-bold text-lg">All transactions cleared!</p>
           <p className="text-secondary text-sm mt-1">No pending review actions required in this category.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.filter(tx => (tx.category || 'Uncategorized') === selectedCategory).map((tx) => (
            <div 
              key={tx.id} 
              className="bg-white/60 hover:bg-white/85 border border-white/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                    tx.type === 'credit' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {tx.type === 'credit' ? <ArrowDownLeft size={22} /> : <ArrowUpRight size={22} />}
                  </div>
                  <div>
                    <div className="font-extrabold text-primary-dark text-base md:text-lg">{tx.description}</div>
                    <div className="text-xs text-secondary flex flex-wrap items-center gap-2 mt-1">
                      <span>{(tx.date && typeof (tx.date as any).toDate === 'function' ? (tx.date as any).toDate() : new Date((tx.date as any) || '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      <span className="text-black/20">•</span>
                      <span className="font-mono">Ref: {(tx as any).reference_number || tx.bank_transaction_id || 'None'}</span>
                      {tx.category && (
                        <>
                          <span className="text-black/20">•</span>
                          <span className="px-2 py-0.5 bg-black/5 rounded text-[9px] font-extrabold uppercase text-secondary">
                            {tx.category}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-black/5">
                  <div className="text-left md:text-right">
                    <div className={`text-xl font-black ${tx.type === 'credit' ? 'text-green-700' : 'text-primary-dark'}`}>
                      {tx.type === 'credit' ? '+' : '-'} ₹ {tx.amount.toLocaleString()}
                    </div>
                    <div className="flex justify-start md:justify-end mt-1">
                      {tx.match_status === 'pending_review' || tx.match_status === 'unmatched' ? (
                         <span className="text-[9px] font-extrabold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                           <AlertCircle size={10} /> Pending Match
                         </span>
                      ) : (
                         <span className="text-[9px] font-extrabold text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                           <CheckCircle2 size={10} /> Matched
                         </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {tx.match_status === 'pending_review' || tx.match_status === 'unmatched' ? (
                      <button 
                        onClick={() => handleManualMatch(tx)}
                        disabled={processingId === tx.id}
                        className="px-4 py-2.5 text-xs font-black uppercase tracking-wider bg-primary hover:bg-primary-dark text-white rounded-xl shadow-sm transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {processingId === tx.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Confirm Match
                      </button>
                    ) : (
                      <button className="px-4 py-2.5 text-xs font-black uppercase tracking-wider text-error hover:bg-error/10 border border-error/10 hover:border-transparent rounded-xl transition-all">
                        Unlink
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              {tx.confidence_score && tx.match_status === 'unmatched' && (
                 <div className="mt-4 p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3 shadow-inner">
                    <Sparkles size={16} className="text-primary mt-0.5 shrink-0 animate-pulse" />
                    <div className="flex-1">
                      <p className="text-xs font-black text-primary-dark">AI Suggestion ({Math.round(tx.confidence_score * 100)}% match score)</p>
                      <p className="text-xs text-secondary mt-1 font-medium">{tx.match_explanation}</p>
                      <button 
                        onClick={() => handleAcceptMatch(tx)}
                        disabled={processingId === tx.id}
                        className={`mt-3 text-xs font-extrabold uppercase tracking-wider bg-white/80 hover:bg-primary hover:text-white px-3 py-1.5 rounded-lg border border-primary/20 shadow-sm transition-all flex items-center gap-2 ${
                          processingId === tx.id ? 'text-secondary/50 animate-pulse' : 'text-primary'
                        }`}
                      >
                        {processingId === tx.id ? 'Processing...' : 'Accept Match'}
                      </button>
                     </div>
                  </div>
               )}
             </div>
          ))}
        </div>
      )}

      <StatementUploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onComplete={() => alert("Statement uploaded successfully. Transactions are now pending review.")}
      />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { CheckCircle2, ArrowUpRight, ArrowDownLeft, Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useToast } from '../components/Shared/Toast';
import type { Transaction } from '../types';

export default function Reconciliation() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unmatched'>('unmatched');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!db) return;
    const q = filter === 'unmatched' 
      ? query(collection(db, 'transactions'), where('match_status', '==', 'unmatched'), orderBy('date', 'desc'))
      : query(collection(db, 'transactions'), orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching transactions:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [filter]);

  const handleFetchTransactions = async () => {
    setIsFetching(true);
    try {
      if (!functions) {
        showToast('Cloud Functions not configured. Connect your bank API in Settings > Integrations to enable automatic transaction fetching.', 'warning');
        return;
      }
      const fetchFn = httpsCallable(functions, 'fetchBankTransactions');
      const result = await fetchFn({});
      showToast(`Fetched ${(result.data as any)?.count || 0} new transactions`, 'success');
    } catch (err: any) {
      console.error("Fetch failed:", err);
      showToast('Transaction fetch requires bank API integration. Your existing transactions are shown below.', 'info');
    } finally {
      setIsFetching(false);
    }
  };

  const handleAutoMatchAll = async () => {
    if (transactions.filter(t => t.match_status === 'unmatched').length === 0) {
      showToast('No unmatched transactions to process.', 'info');
      return;
    }
    setIsAutoMatching(true);
    try {
      if (!functions) {
        showToast('Cloud Functions not configured. Auto-matching requires deployed AI functions.', 'warning');
        return;
      }
      const matchAllFn = httpsCallable(functions, 'autoMatchTransactions');
      const result = await matchAllFn({});
      showToast(`Auto-matched ${(result.data as any)?.matched || 0} transactions`, 'success');
    } catch (err: any) {
      console.error("Auto-match failed:", err);
      showToast('Auto-matching requires deployed Cloud Functions. Use manual matching for now.', 'info');
    } finally {
      setIsAutoMatching(false);
    }
  };

  const handleAcceptMatch = async (tx: Transaction) => {
    if (!functions) return;
    if (!tx.metadata?.suggested_doc_id) {
       showToast('No suggested document to match with.', 'warning');
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
      showToast('Transaction matched successfully!', 'success');
    } catch (err: any) {
      console.error("Match failed:", err);
      showToast('Failed to match: ' + err.message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleManualMatch = (tx: Transaction) => {
    showToast(`Manual matching for "${tx.description}" — select the corresponding invoice or purchase from your records.`, 'info');
  };

  const handleAiSuggest = async (tx: Transaction) => {
    showToast('AI is analyzing this transaction for potential matches...', 'info');
    if (!functions) {
      setTimeout(() => {
        showToast('AI suggestions require deployed Cloud Functions. Deploy the aiAuditor function to enable this.', 'warning');
      }, 1500);
      return;
    }
    try {
      const suggestFn = httpsCallable(functions, 'suggestTransactionMatch');
      await suggestFn({ transactionId: tx.id });
      showToast('AI suggestion generated — check the match panel below the transaction.', 'success');
    } catch (err) {
      showToast('AI suggestion service not available. Try manual matching.', 'warning');
    }
  };

  const handleUnlink = (tx: Transaction) => {
    showToast(`Unlinking match for "${tx.description}" is not reversible. Contact admin if needed.`, 'warning');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Bank Reconciliation</h1>
          <p className="text-secondary mt-1">Match bank statements with invoices and purchases using AI.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleFetchTransactions}
            disabled={isFetching}
            className="neo-btn flex items-center gap-2"
          >
            {isFetching ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {isFetching ? 'Fetching...' : 'Fetch New Txns'}
          </button>
          <button 
            onClick={handleAutoMatchAll}
            disabled={isAutoMatching}
            className="neo-btn-primary flex items-center gap-2"
          >
            {isAutoMatching ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {isAutoMatching ? 'Matching...' : 'Auto-Match All'}
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => setFilter('unmatched')}
          className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
            filter === 'unmatched' ? 'bg-primary text-surface shadow-neo-pressed' : 'bg-surface text-secondary shadow-neo-raised'
          }`}
        >
          Unmatched ({filter === 'unmatched' ? transactions.length : transactions.filter(t => t.match_status === 'unmatched').length})
        </button>
        <button 
          onClick={() => setFilter('all')}
          className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
            filter === 'all' ? 'bg-primary text-surface shadow-neo-pressed' : 'bg-surface text-secondary shadow-neo-raised'
          }`}
        >
          All Transactions
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-primary" size={40} /></div>
        ) : transactions.length === 0 ? (
          <div className="p-20 text-center neo-card border-2 border-dashed border-shadow-darker/10">
             <CheckCircle2 size={48} className="mx-auto text-success mb-4 opacity-20" />
             <p className="text-secondary font-medium">All clear! No unmatched transactions found.</p>
             <p className="text-xs text-secondary/60 mt-2">Click "Fetch New Txns" to check for new bank transactions.</p>
          </div>
        ) : transactions.map((tx) => (
          <div key={tx.id} className="neo-card group hover:shadow-neo-inset transition-all border border-transparent hover:border-primary/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  tx.type === 'credit' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                }`}>
                  {tx.type === 'credit' ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
                </div>
                <div>
                  <div className="font-bold text-primary-dark">{tx.description}</div>
                  <div className="text-xs text-secondary flex items-center gap-2">
                    {tx.date?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} • Ref: {tx.bank_transaction_id}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="text-right">
                  <div className={`text-xl font-black ${tx.type === 'credit' ? 'text-green-700' : 'text-primary-dark'}`}>
                    {tx.type === 'credit' ? '+' : '-'} ₹ {tx.amount.toLocaleString()}
                  </div>
                  {tx.match_status === 'unmatched' ? (
                     <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-1 justify-end">
                       <AlertCircle size={10} /> Unmatched
                     </span>
                  ) : (
                     <span className="text-[10px] font-black text-green-600 uppercase tracking-widest flex items-center gap-1 justify-end">
                       <CheckCircle2 size={10} /> Matched
                     </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {tx.match_status === 'unmatched' ? (
                    <>
                      <button 
                        onClick={() => handleManualMatch(tx)}
                        className="neo-btn !py-2 !px-4 text-xs font-black uppercase hover:bg-primary hover:text-surface transition-all"
                      >
                        Match Manually
                      </button>
                      <button 
                        onClick={() => handleAiSuggest(tx)}
                        className="neo-btn !py-2 !px-4 text-xs font-black uppercase flex items-center gap-2 bg-primary/5 text-primary border-primary/20"
                      >
                         <Sparkles size={14} />
                         AI Suggest
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => handleUnlink(tx)}
                      className="neo-btn !py-2 !px-4 text-xs font-black uppercase text-error hover:bg-error/5 border-error/10"
                    >
                      Unlink
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {tx.confidence_score && tx.match_status === 'unmatched' && (
               <div className="mt-4 p-3 bg-primary/5 rounded-xl border border-primary/10 flex items-start gap-3">
                  <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-primary-dark">AI Suggestion ({Math.round(tx.confidence_score * 100)}% match)</p>
                    <p className="text-[11px] text-secondary">{tx.match_explanation}</p>
                    <button 
                      onClick={() => handleAcceptMatch(tx)}
                      disabled={processingId === tx.id}
                      className={`mt-2 text-xs font-black uppercase tracking-tighter hover:underline flex items-center gap-2 ${
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
    </div>
  );
}

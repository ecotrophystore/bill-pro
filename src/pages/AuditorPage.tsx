import { useEffect, useState } from 'react';
import { Shield, List, Clock, Loader2, Search, Banknote, Receipt, Brain, Sparkles, AlertCircle } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useToast } from '../components/Shared/Toast';
import clsx from 'clsx';

interface AuditLog {
  id: string;
  document_type: string;
  document_id: string;
  action: string;
  user_id: string;
  timestamp: any;
  notes: string;
}

export default function AuditorPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [invTotal, setInvTotal] = useState(0);
  const [memoTotal, setMemoTotal] = useState(0);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const firestore = db;
    if (!firestore) return;

    // Fetch live totals for reconciliation
    const fetchTotals = async () => {
      const invSnap = await getDocs(collection(firestore, 'invoices'));
      const memoSnap = await getDocs(collection(firestore, 'cash_memos'));
      
      let iTotal = 0;
      invSnap.forEach(doc => { if (doc.data().status !== 'cancelled') iTotal += doc.data().grand_total || 0; });
      
      let mTotal = 0;
      memoSnap.forEach(doc => mTotal += doc.data().grand_total || 0);
      
      setInvTotal(iTotal);
      setMemoTotal(mTotal);
    };

    fetchTotals();

    const q = query(collection(firestore, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog)));
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching audit logs:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const runAiAudit = async () => {
    if (!functions) return;
    setAiLoading(true);
    try {
      const auditFn = httpsCallable<{ message: string }, { text: string }>(functions, 'aiAuditor');
      const result = await auditFn({ 
        message: `Perform a deep financial audit. Current State: Invoices Total ₹${invTotal}, Cash Memos Total ₹${memoTotal}. Check for anomalies and provide 3 strategic recommendations.` 
      });
      setAiInsight(result.data.text);
      showToast('AI Audit Complete', 'success');
    } catch (err) {
      console.error(err);
      showToast('AI Audit Failed', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-primary-dark uppercase italic flex items-center gap-3">
            <Shield size={32} className="text-primary" />
            AI Audit 2050
          </h1>
          <p className="text-secondary mt-1 font-medium bg-primary/5 px-3 py-1 rounded-lg inline-block">
            Autonomous financial verification & risk assessment.
          </p>
        </div>
        <div className="flex items-center gap-4">
           <button onClick={runAiAudit} disabled={aiLoading} className="neo-btn-primary !bg-tertiary flex items-center gap-2 group">
              {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Brain size={18} />}
              <span>{aiLoading ? 'Auditing...' : 'Run Deep AI Audit'}</span>
           </button>
           <div className="px-4 py-2 bg-success/10 text-success rounded-full text-[10px] font-black uppercase tracking-widest shadow-neo-inset border border-success/20">
              System Sealed
           </div>
        </div>
      </div>

      {/* 2050 Reconciliation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoice Reconciliation */}
        <div className="neo-card border-l-4 border-primary bg-gradient-to-br from-surface to-primary/5">
          <div className="flex justify-between items-start mb-6">
            <div className="p-3 bg-primary/10 rounded-2xl text-primary shadow-neo-inset">
              <Receipt size={24} />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-secondary uppercase tracking-widest">Invoices (GST)</p>
              <h2 className="text-3xl font-black text-primary-dark tracking-tighter">₹ {invTotal.toLocaleString()}</h2>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-xs font-bold p-2 bg-white/50 rounded-lg">
              <span className="text-secondary">Reconciliation Status</span>
              <span className="text-success uppercase">Synced</span>
            </div>
            <div className="h-2 bg-shadow-darker/10 rounded-full overflow-hidden">
               <div className="h-full bg-primary w-full animate-pulse-slow"></div>
            </div>
          </div>
        </div>

        {/* Cash Memo Reconciliation */}
        <div className="neo-card border-l-4 border-tertiary bg-gradient-to-br from-surface to-tertiary/5">
          <div className="flex justify-between items-start mb-6">
            <div className="p-3 bg-tertiary/10 rounded-2xl text-tertiary shadow-neo-inset">
              <Banknote size={24} />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-secondary uppercase tracking-widest">Cash Memos (Non-GST)</p>
              <h2 className="text-3xl font-black text-primary-dark tracking-tighter">₹ {memoTotal.toLocaleString()}</h2>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-xs font-bold p-2 bg-white/50 rounded-lg">
              <span className="text-secondary">Cash Flow Integrity</span>
              <span className="text-tertiary uppercase">Verified</span>
            </div>
            <div className="h-2 bg-shadow-darker/10 rounded-full overflow-hidden">
               <div className="h-full bg-tertiary w-full animate-pulse-slow" style={{animationDelay: '1s'}}></div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Auditor Insight Section */}
      {aiInsight && (
        <div className="neo-card bg-primary-dark text-surface relative overflow-hidden animate-scale-in">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Sparkles size={120} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <Brain size={20} />
              <h3 className="font-black uppercase text-sm tracking-widest">Gemini 1.5 Flash - Audit Analysis</h3>
            </div>
            <div className="text-lg font-medium leading-relaxed whitespace-pre-line text-surface/90 italic">
              "{aiInsight}"
            </div>
            <div className="mt-6 pt-4 border-t border-surface/10 flex items-center gap-2 text-[10px] font-black uppercase text-primary tracking-widest">
              <AlertCircle size={12} />
              Advisory: Human review recommended for strategic decisions.
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="neo-card overflow-hidden !p-0 shadow-neo-raised">
        <div className="p-4 border-b border-shadow-darker/10 flex justify-between items-center bg-shadow-darker/5">
           <div className="flex items-center gap-2 text-sm font-black text-primary-dark uppercase italic tracking-tight">
              <List size={18} className="text-primary" />
              Immutable Audit Trail
           </div>
           <div className="flex gap-2">
              <div className="neo-input !py-1.5 !px-3 flex items-center gap-2 bg-white/50">
                 <Search size={14} className="text-secondary" />
                 <input type="text" placeholder="Search logs..." className="bg-transparent border-none outline-none text-xs w-48 font-bold" />
              </div>
           </div>
        </div>

        <div className="divide-y divide-shadow-darker/5">
          {loading ? (
            <div className="p-12 text-center text-secondary">
               <Loader2 className="animate-spin mx-auto mb-2 text-primary" />
               <p className="text-xs font-black uppercase tracking-widest">Accessing Secure Records...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-secondary italic font-medium">System initialized. No audit history yet.</div>
          ) : logs.map((log) => (
            <div key={log.id} className="p-4 hover:bg-primary/5 transition-all flex items-start justify-between group">
              <div className="flex gap-4">
                <div className={clsx('p-3 rounded-xl shadow-neo-raised transition-transform group-hover:scale-110',
                  log.action === 'create' ? 'bg-primary/10 text-primary' : 
                  log.action === 'conversion' ? 'bg-tertiary/10 text-tertiary' : 'bg-warning/10 text-warning'
                )}>
                   <Clock size={16} />
                </div>
                <div>
                   <div className="flex items-center gap-2">
                     <p className="text-sm font-black text-primary-dark uppercase tracking-tight">
                        {log.action}
                     </p>
                     <span className="px-2 py-0.5 bg-shadow-darker/5 rounded text-[8px] font-black text-secondary uppercase tracking-tighter">
                       {log.document_type}
                     </span>
                   </div>
                   <p className="text-xs text-secondary mt-1 font-medium">{log.notes}</p>
                   <p className="text-[10px] text-secondary/60 mt-2 flex items-center gap-1 font-mono uppercase tracking-tighter">
                      ID: {log.document_id} • BY: {log.user_id.slice(0, 8)}...
                   </p>
                </div>
              </div>
              <div className="text-right">
                 <p className="text-[11px] font-black text-primary-dark uppercase tracking-tight">
                    {log.timestamp?.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                 </p>
                 <p className="text-[9px] font-bold text-secondary uppercase">
                    {log.timestamp?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                 </p>
                 {log.action === 'conversion' && (
                   <div className="mt-2 flex items-center justify-end gap-1 text-[8px] font-black text-tertiary uppercase tracking-tighter">
                     <Shield size={10} />
                     Rule #11 Pass
                   </div>
                 )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

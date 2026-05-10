import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { TrendingUp, Clock, AlertCircle, FileText, Loader2, IndianRupee, Plus, Download, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Shared/Toast';
import type { Invoice } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    pendingInvoices: 0,
    unreconciledCount: 0,
    recentInvoices: [] as Invoice[],
    pendingQuotes: 0,
    totalPurchases: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;

    // Revenue & Pending Invoices
    const invQuery = query(collection(db, 'invoices'));
    const unsubscribeInvoices = onSnapshot(invQuery, (snapshot) => {
      const invs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      const revenue = invs.filter(i => i.payment_status === 'paid').reduce((sum, i) => sum + i.grand_total, 0);
      const pending = invs.filter(i => i.payment_status === 'unpaid' || i.payment_status === 'partial').reduce((sum, i) => sum + i.grand_total, 0);
      
      setMetrics(prev => ({
        ...prev,
        totalRevenue: revenue,
        pendingInvoices: pending,
        recentInvoices: [...invs].sort((a, b) => (b.created_at?.toMillis() || 0) - (a.created_at?.toMillis() || 0)).slice(0, 5)
      }));
      setLoading(false);
    }, (error) => {
      console.error("Dashboard invoices error:", error);
      setLoading(false);
    });

    // Pending Quotations (Conversion Requested)
    const quoteQuery = query(collection(db, 'quotations'), where('status', '==', 'convert_requested'));
    const unsubscribeQuotes = onSnapshot(quoteQuery, (snapshot) => {
      setMetrics(prev => ({
        ...prev,
        pendingQuotes: snapshot.size
      }));
    }, (error) => {
      console.error("Dashboard quotations error:", error);
    });

    // Purchases count
    const purchaseQuery = query(collection(db, 'purchases'));
    const unsubscribePurchases = onSnapshot(purchaseQuery, (snapshot) => {
      const pending = snapshot.docs.filter(d => d.data().status === 'pending').length;
      setMetrics(prev => ({
        ...prev,
        totalPurchases: pending
      }));
    }, (error) => {
      console.error("Dashboard purchases error:", error);
    });

    return () => {
      unsubscribeInvoices();
      unsubscribeQuotes();
      unsubscribePurchases();
    };
  }, []);

  const handleGenerateReport = () => {
    showToast('Navigating to Reports — generate PDF or export data from there.', 'info');
    navigate('/reports');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-dark" size={48} />
      </div>
    );
  }
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Dashboard</h1>
          <p className="text-secondary mt-1">Overview of EcoBill financial activity.</p>
        </div>
        <button 
          onClick={handleGenerateReport}
          className="neo-btn-primary flex items-center gap-2"
        >
          <Download size={18} />
          Generate Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="neo-card flex flex-col justify-between h-36 bg-surface shadow-neo-surface group hover:shadow-neo-inset transition-all cursor-default">
          <div className="flex justify-between items-start">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Revenue</span>
            <TrendingUp size={18} className="text-secondary opacity-50 group-hover:text-primary-dark transition-colors" />
          </div>
          <div className="flex items-baseline gap-1">
             <span className="text-2xl font-black text-primary-dark tracking-tight">₹ {metrics.totalRevenue.toLocaleString()}</span>
          </div>
        </div>

        <div className="neo-card flex flex-col justify-between h-36 bg-surface shadow-neo-surface group hover:shadow-neo-inset transition-all cursor-default border-l-4 border-warning/20">
          <div className="flex justify-between items-start">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Pending</span>
            <Clock size={18} className="text-warning opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-2xl font-black text-warning tracking-tight">₹ {metrics.pendingInvoices.toLocaleString()}</span>
        </div>

        <div 
          onClick={() => navigate('/quotations')}
          className="neo-card flex flex-col justify-between h-36 bg-surface shadow-neo-surface group hover:shadow-neo-inset transition-all cursor-pointer"
        >
          <div className="flex justify-between items-start">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Quotes To Convert</span>
            <AlertCircle size={18} className="text-error opacity-50" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-error tracking-tight">{metrics.pendingQuotes}</span>
            {metrics.pendingQuotes > 0 && <span className="neo-badge-error text-[10px] py-0.5 shadow-none ring-1 ring-error/20">Action Needed</span>}
          </div>
        </div>

        <div className="neo-card flex flex-col justify-between h-36 bg-surface shadow-neo-surface group hover:shadow-neo-inset transition-all cursor-default">
          <div className="flex justify-between items-start">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Quick Actions</span>
            <FileText size={18} className="text-primary-dark opacity-30" />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => navigate('/cash-memos/new')}
              title="New Cash Memo"
              className="w-10 h-10 rounded-lg bg-shadow-darker/5 flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all shadow-neo-raised active:shadow-neo-pressed"
            >
              <IndianRupee size={16} className="text-primary-dark" />
            </button>
            <button 
              onClick={() => navigate('/invoices/new')}
              title="New Invoice"
              className="w-10 h-10 rounded-lg bg-shadow-darker/5 flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-all shadow-neo-raised active:shadow-neo-pressed"
            >
              <Plus size={16} className="text-primary-dark" />
            </button>
          </div>
        </div>
      </div>

      {/* Main interaction space */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="neo-card lg:col-span-2 min-h-[400px]">
          <h3 className="mb-4 text-xl font-bold text-primary-dark">Recent Activity</h3>
          <div className="space-y-4">
            {metrics.recentInvoices.length === 0 ? (
              <div className="py-20 text-center text-secondary opacity-50 border-2 border-dashed border-shadow-darker/10 rounded-xl">
                 <FileText size={32} className="mx-auto mb-2 opacity-20" />
                 No activity yet.
              </div>
            ) : metrics.recentInvoices.map(inv => (
              <div 
                key={inv.id} 
                onClick={() => navigate('/invoices')}
                className="flex justify-between items-center p-4 neo-input hover:shadow-neo-pressed transition-shadow cursor-pointer border border-transparent"
              >
                <div>
                  <p className="font-bold text-primary-dark">{inv.number}</p>
                  <p className="text-sm text-secondary font-medium">Auto-synced from Firestore</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-primary-dark">₹ {inv.grand_total.toLocaleString()}</p>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${
                    inv.payment_status === 'paid' ? 'text-success' : 'text-warning'
                  }`}>{inv.payment_status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="neo-card flex flex-col">
          <h3 className="mb-4 text-xl font-bold text-primary-dark">AI Auditor Tip</h3>
          <div className="bg-primary/5 rounded-card p-6 flex-1 flex flex-col justify-center items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary-dark flex items-center justify-center shadow-neo-raised">
              {metrics.totalPurchases > 0 
                ? <AlertCircle size={32} className="text-surface" />
                : <CheckCircle2 size={32} className="text-surface" />
              }
            </div>
            <div>
              <p className="text-sm font-bold text-primary-dark">
                {metrics.totalPurchases > 0 ? 'Purchase Reconciliation' : 'All Clear'}
              </p>
              <p className="text-xs text-secondary mt-1">
                {metrics.totalPurchases > 0 
                  ? `There are ${metrics.totalPurchases} purchase receipts pending verification. Verify them to keep inventory accurate.`
                  : 'No pending items! All purchases are verified and up to date.'
                }
              </p>
            </div>
            <button 
              onClick={() => navigate('/purchases')}
              className="neo-btn-primary text-sm w-full mt-4"
            >
              {metrics.totalPurchases > 0 ? 'Review Now' : 'View Purchases'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

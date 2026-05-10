import { useState, useEffect } from 'react';
import { BarChart3, PieChart, TrendingUp, Download, FileText, Share2, Loader2, Receipt, Banknote, Brain, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useToast } from '../components/Shared/Toast';
import clsx from 'clsx';

interface InvoiceMetrics {
  count: number; revenue: number; gst: number; paid: number; unpaid: number; unpaidAmount: number;
  avgValue: number; highest: number;
}
interface MemoMetrics {
  count: number; revenue: number; gst: number; walkIn: number; avgValue: number;
}
interface PurchaseMetrics { count: number; total: number; cleared: number; pending: number; }

export default function ReportsPage() {
  const [reportType, setReportType] = useState<'financial' | 'gst' | 'audit'>('financial');
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const [inv, setInv] = useState<InvoiceMetrics>({ count: 0, revenue: 0, gst: 0, paid: 0, unpaid: 0, unpaidAmount: 0, avgValue: 0, highest: 0 });
  const [memo, setMemo] = useState<MemoMetrics>({ count: 0, revenue: 0, gst: 0, walkIn: 0, avgValue: 0 });
  const [pur, setPur] = useState<PurchaseMetrics>({ count: 0, total: 0, cleared: 0, pending: 0 });

  // ─── AI-Powered Insights ──────────────────────────────────────────────────
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const fetchAIInsight = async () => {
    if (!functions) { showToast('Cloud Functions unavailable', 'error'); return; }
    setAiLoading(true);
    try {
      const aiAuditorFn = httpsCallable<{ message: string; history: any[] }, { text: string }>(functions, 'aiAuditor');
      const prompt = `Analyze this business data and give me a concise financial health report in 4 bullet points (emoji + insight):

INVOICES: ${inv.count} total, ₹${inv.revenue.toLocaleString()} revenue, ${inv.unpaid} unpaid (₹${inv.unpaidAmount.toLocaleString()})
CASH MEMOS: ${memo.count} total, ₹${memo.revenue.toLocaleString()} revenue
PURCHASES: ${pur.count} total, ₹${pur.total.toLocaleString()}, ${pur.cleared} cleared, ${pur.pending} pending
NET PROFIT: ₹${(inv.revenue + memo.revenue - pur.total).toLocaleString()}

Focus on: 1) Cash flow risk 2) Late payment concern 3) Demand/sales trend 4) Vendor clearance health. Keep each point to 1 short sentence.`;

      const result = await aiAuditorFn({ message: prompt, history: [] });
      setAiInsight(result.data.text);
      showToast('AI analysis updated!', 'success');
    } catch (err) {
      console.error('AI insight error:', err);
      showToast('Failed to get AI analysis. Using rule-based predictions.', 'warning');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    async function fetchMetrics() {
      if (!db) return;
      setLoading(true);
      try {
        // Invoices
        const invSnap = await getDocs(collection(db, 'invoices'));
        let iRev = 0, iGst = 0, iCount = 0, iPaid = 0, iUnpaid = 0, iUnpaidAmt = 0, iHighest = 0;
        invSnap.forEach(d => {
          const data = d.data();
          if (data.status !== 'cancelled') {
            iRev += data.subtotal || 0;
            iGst += data.tax_total || 0;
            iCount++;
            if (data.payment_status === 'paid') iPaid++;
            else { iUnpaid++; iUnpaidAmt += data.grand_total || 0; }
            if ((data.grand_total || 0) > iHighest) iHighest = data.grand_total || 0;
          }
        });
        setInv({ count: iCount, revenue: iRev, gst: iGst, paid: iPaid, unpaid: iUnpaid, unpaidAmount: iUnpaidAmt, avgValue: iCount > 0 ? Math.round(iRev / iCount) : 0, highest: iHighest });

        // Cash Memos
        const memoSnap = await getDocs(collection(db, 'cash_memos'));
        let mRev = 0, mGst = 0, mCount = 0, mWalkIn = 0;
        memoSnap.forEach(d => {
          const data = d.data();
          mRev += data.subtotal || 0;
          mGst += data.tax_total || 0;
          mCount++;
          if (data.walk_in_customer) mWalkIn++;
        });
        setMemo({ count: mCount, revenue: mRev, gst: mGst, walkIn: mWalkIn, avgValue: mCount > 0 ? Math.round(mRev / mCount) : 0 });

        // Purchases
        const purSnap = await getDocs(collection(db, 'purchases'));
        let pTotal = 0, pCleared = 0, pPending = 0;
        purSnap.forEach(d => {
          const data = d.data();
          pTotal += data.amount || 0;
          if (data.status === 'cleared') pCleared++; else pPending++;
        });
        setPur({ count: purSnap.size, total: pTotal, cleared: pCleared, pending: pPending });
      } catch (err) { console.error('Error fetching metrics:', err); }
      finally { setLoading(false); }
    }
    fetchMetrics();
  }, []);

  const totalRevenue = inv.revenue + memo.revenue;
  const totalGst = inv.gst + memo.gst;
  const netProfit = totalRevenue - pur.total;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';
  const cashRatio = totalRevenue > 0 ? ((memo.revenue / totalRevenue) * 100).toFixed(0) : '0';
  const creditRatio = totalRevenue > 0 ? ((inv.revenue / totalRevenue) * 100).toFixed(0) : '0';

  const generateCSV = (type: string) => {
    const now = new Date().toLocaleDateString('en-IN');
    let csv = '';
    if (type === 'gstr1') {
      csv = `GSTR-1 Export - ${now}\nInvoice Count,Net Sales,GST Collected\n${inv.count},${inv.revenue},${inv.gst}`;
    } else {
      csv = `Financial Report - ${now}\nMetric,Value\nInvoice Revenue,${inv.revenue}\nCash Memo Revenue,${memo.revenue}\nTotal Revenue,${totalRevenue}\nGST,${totalGst}\nPurchases,${pur.total}\nNet Profit,${netProfit}\nMargin,${profitMargin}%`;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ecobill_${type}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`${type.toUpperCase()} report downloaded!`, 'success');
  };

  const handleDownloadReport = () => {
    const content = `
=========================================
  ECOBILL FINANCIAL REPORT
  ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
=========================================

INVOICE ANALYTICS
  Total Invoices:    ${inv.count}
  Invoice Revenue:   ₹ ${inv.revenue.toLocaleString()}
  GST Collected:     ₹ ${inv.gst.toLocaleString()}
  Paid:              ${inv.paid}
  Unpaid:            ${inv.unpaid} (₹ ${inv.unpaidAmount.toLocaleString()})
  Avg Invoice:       ₹ ${inv.avgValue.toLocaleString()}
  Highest Invoice:   ₹ ${inv.highest.toLocaleString()}

CASH MEMO ANALYTICS
  Total Memos:       ${memo.count}
  Cash Revenue:      ₹ ${memo.revenue.toLocaleString()}
  GST on Memos:      ₹ ${memo.gst.toLocaleString()}
  Walk-in Customers: ${memo.walkIn}
  Avg Memo Value:    ₹ ${memo.avgValue.toLocaleString()}

COMBINED SUMMARY
  Total Revenue:     ₹ ${totalRevenue.toLocaleString()}
  Total GST:         ₹ ${totalGst.toLocaleString()}
  Total Purchases:   ₹ ${pur.total.toLocaleString()}
  Net Profit:        ₹ ${netProfit.toLocaleString()}
  Profit Margin:     ${profitMargin}%
  Cash:Credit Ratio: ${cashRatio}%:${creditRatio}%

---
EcoBill Financial System | Ecotrophy Innovations
    `.trim();
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ecobill_full_report_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Full report downloaded!', 'success');
  };

  const LoadingOverlay = () => (
    <div className="absolute inset-0 bg-surface/50 backdrop-blur-[2px] z-10 flex items-center justify-center">
      <Loader2 className="animate-spin text-primary" size={24} />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark uppercase italic">Financial Intelligence</h1>
          <p className="text-secondary mt-1 font-medium bg-primary/5 px-3 py-1 rounded-lg inline-block">Real-time fiscal monitoring enabled.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => generateCSV('financial_export')} className="neo-btn flex items-center gap-2 group">
            <Share2 size={18} className="group-hover:text-primary transition-colors" />
            <span className="hidden sm:inline">Export Data</span>
          </button>
          <button onClick={handleDownloadReport} className="neo-btn-primary flex items-center gap-2 shadow-neo-raised hover:translate-y-[-2px] transition-transform">
            <Download size={18} />
            <span className="hidden sm:inline">Download Report</span>
          </button>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: `₹ ${totalRevenue.toLocaleString()}`, sub: `${inv.count + memo.count} transactions`, icon: TrendingUp, color: 'text-success' },
          { label: 'GST Liability', value: `₹ ${totalGst.toLocaleString()}`, sub: `${totalRevenue > 0 ? ((totalGst / totalRevenue) * 100).toFixed(1) : 0}% effective`, icon: PieChart, color: 'text-primary' },
          { label: 'Net Profit', value: `₹ ${netProfit.toLocaleString()}`, sub: `${profitMargin}% margin`, icon: BarChart3, color: netProfit >= 0 ? 'text-success' : 'text-error' },
          { label: 'Cash:Credit', value: `${cashRatio}:${creditRatio}`, sub: 'Business ratio', icon: Banknote, color: 'text-tertiary' },
        ].map(s => (
          <div key={s.label} className="neo-card flex flex-col justify-between h-28 group hover:shadow-neo-inset transition-all relative overflow-hidden">
            {loading && <LoadingOverlay />}
            <div className="flex justify-between items-start">
              <span className="text-secondary font-bold text-[10px] uppercase tracking-widest">{s.label}</span>
              <s.icon size={16} className="text-secondary opacity-30 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-primary-dark tracking-tight">{s.value}</span>
              {!loading && <span className={`text-[9px] font-black uppercase ${s.color}`}>{s.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Report Tabs */}
        <div className="space-y-3">
          {(['financial', 'gst', 'audit'] as const).map(type => (
            <button key={type} onClick={() => setReportType(type)}
              className={clsx('w-full text-left p-4 neo-card flex items-center gap-3 transition-all',
                reportType === type ? 'bg-primary/5 border-l-4 border-primary shadow-neo-pressed' : 'hover:bg-shadow-darker/5'
              )}>
              {type === 'financial' && <TrendingUp size={18} className={reportType === type ? 'text-primary' : 'text-secondary'} />}
              {type === 'gst' && <PieChart size={18} className={reportType === type ? 'text-primary' : 'text-secondary'} />}
              {type === 'audit' && <Shield size={18} className={reportType === type ? 'text-primary' : 'text-secondary'} />}
              <span className={`font-black uppercase tracking-tighter text-xs ${reportType === type ? 'text-primary-dark' : 'text-secondary'}`}>
                {type} Statements
              </span>
            </button>
          ))}
        </div>

        {/* Right: Report Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* ─── INVOICE ANALYTICS ─── */}
          <div className="neo-card">
            <div className="flex items-center gap-2 mb-4">
              <Receipt size={18} className="text-primary" />
              <h3 className="font-black text-primary-dark uppercase text-sm tracking-wide">Invoice Analytics</h3>
              <span className="ml-auto text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{inv.count} invoices</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Revenue', value: `₹ ${inv.revenue.toLocaleString()}`, color: 'text-primary-dark' },
                { label: 'GST Collected', value: `₹ ${inv.gst.toLocaleString()}`, color: 'text-primary' },
                { label: 'Unpaid', value: `₹ ${inv.unpaidAmount.toLocaleString()}`, color: 'text-warning' },
                { label: 'Avg Value', value: `₹ ${inv.avgValue.toLocaleString()}`, color: 'text-secondary' },
              ].map(m => (
                <div key={m.label} className="neo-input bg-surface/50 p-3 space-y-1 relative">
                  {loading && <LoadingOverlay />}
                  <span className="text-[9px] font-black text-secondary uppercase tracking-wider">{m.label}</span>
                  <p className={`text-lg font-black ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3 text-[10px] font-bold">
              <span className="text-success flex items-center gap-1"><ArrowUpRight size={12} /> Paid: {inv.paid}</span>
              <span className="text-warning flex items-center gap-1"><ArrowDownRight size={12} /> Unpaid: {inv.unpaid}</span>
              <span className="text-primary-dark">Highest: ₹ {inv.highest.toLocaleString()}</span>
            </div>
          </div>

          {/* ─── CASH MEMO ANALYTICS ─── */}
          <div className="neo-card">
            <div className="flex items-center gap-2 mb-4">
              <Banknote size={18} className="text-tertiary" />
              <h3 className="font-black text-primary-dark uppercase text-sm tracking-wide">Cash Memo Analytics</h3>
              <span className="ml-auto text-[10px] font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full">{memo.count} memos</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Cash Revenue', value: `₹ ${memo.revenue.toLocaleString()}`, color: 'text-primary-dark' },
                { label: 'GST on Memos', value: `₹ ${memo.gst.toLocaleString()}`, color: 'text-primary' },
                { label: 'Walk-in', value: `${memo.walkIn} customers`, color: 'text-tertiary' },
                { label: 'Avg Value', value: `₹ ${memo.avgValue.toLocaleString()}`, color: 'text-secondary' },
              ].map(m => (
                <div key={m.label} className="neo-input bg-surface/50 p-3 space-y-1 relative">
                  {loading && <LoadingOverlay />}
                  <span className="text-[9px] font-black text-secondary uppercase tracking-wider">{m.label}</span>
                  <p className={`text-lg font-black ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ─── AI PREDICTIONS ─── */}
          <div className="neo-card bg-gradient-to-br from-surface to-primary/5 border border-primary/10">
            <div className="flex items-center gap-2 mb-4">
              <Brain size={18} className="text-primary" />
              <h3 className="font-black text-primary-dark uppercase text-sm tracking-wide">AI Predictions</h3>
              <span className="ml-auto text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full animate-pulse">GEMINI 2.0</span>
            </div>

            {/* AI Insight Button */}
            <button
              onClick={fetchAIInsight}
              disabled={aiLoading || loading}
              className="w-full neo-btn p-3 mb-4 flex items-center justify-center gap-2 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 transition-all"
            >
              {aiLoading ? (
                <><Loader2 size={16} className="animate-spin text-primary" /> <span className="text-sm font-bold text-primary">Analyzing with Gemini...</span></>
              ) : (
                <><Sparkles size={16} className="text-primary" /> <span className="text-sm font-bold text-primary-dark">{aiInsight ? 'Refresh AI Analysis' : 'Get AI Financial Analysis'}</span></>
              )}
            </button>

            {/* AI Response */}
            {aiInsight && (
              <div className="mb-4 p-4 rounded-xl bg-white/60 border border-primary/10 shadow-neo-inset">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} className="text-primary" />
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest">Gemini 2.0 Flash Analysis</p>
                </div>
                <div className="text-sm text-primary-dark leading-relaxed whitespace-pre-line font-medium">
                  {aiInsight}
                </div>
              </div>
            )}

            {/* Fallback Rule-Based Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <PredictionCard icon="💰" title="Cash Flow" value={netProfit > 0 ? `Safe for ${Math.min(Math.round(netProfit / Math.max(pur.total / 30, 1)), 365)} days` : 'Negative — Action needed'} status={netProfit > 0 ? 'good' : 'bad'} />
              <PredictionCard icon="⏳" title="Late Payers" value={`${inv.unpaid} customer${inv.unpaid !== 1 ? 's' : ''} flagged`} status={inv.unpaid > 3 ? 'bad' : inv.unpaid > 0 ? 'warn' : 'good'} />
              <PredictionCard icon="📦" title="Demand Signal" value={inv.count + memo.count > 10 ? 'High activity — restock soon' : 'Normal activity level'} status={inv.count + memo.count > 10 ? 'warn' : 'good'} />
              <PredictionCard icon="🏢" title="Vendor Health" value={`${pur.cleared}/${pur.count} cleared (${pur.count > 0 ? Math.round((pur.cleared / pur.count) * 100) : 100}%)`} status={pur.pending > pur.cleared ? 'warn' : 'good'} />
            </div>
          </div>

          {/* Downloads */}
          <div className="neo-card space-y-4">
            <h4 className="text-xs font-black text-secondary tracking-widest uppercase">Available Downloads</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'GSTR-1 (CSV)', action: () => generateCSV('gstr1'), icon: FileText, color: 'text-error' },
                { label: 'Full Report (TXT)', action: handleDownloadReport, icon: FileText, color: 'text-primary' },
                { label: 'Tally Export (CSV)', action: () => generateCSV('tally_export'), icon: FileText, color: 'text-success' },
              ].map(d => (
                <button key={d.label} onClick={d.action} className="neo-btn p-4 flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <d.icon size={20} className={d.color} />
                    <span className="text-sm font-bold text-primary-dark">{d.label}</span>
                  </div>
                  <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PredictionCard({ icon, title, value, status }: { icon: string; title: string; value: string; status: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={clsx('p-3 rounded-xl border flex items-start gap-3',
      status === 'good' && 'bg-green-50/50 border-green-200/50',
      status === 'warn' && 'bg-amber-50/50 border-amber-200/50',
      status === 'bad' && 'bg-red-50/50 border-red-200/50',
    )}>
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-[10px] font-black text-secondary uppercase tracking-wider">{title}</p>
        <p className={clsx('text-sm font-bold',
          status === 'good' && 'text-green-700',
          status === 'warn' && 'text-amber-700',
          status === 'bad' && 'text-red-700',
        )}>{value}</p>
      </div>
    </div>
  );
}

function Shield({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  );
}

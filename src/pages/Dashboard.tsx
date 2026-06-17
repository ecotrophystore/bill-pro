import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { TrendingUp, Clock, AlertCircle, FileText, Loader2, IndianRupee, Plus, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Invoice } from '../types';

type DateFilter = 'today' | 'week' | 'month' | 'fy' | 'custom' | 'specific_date' | 'specific_month' | 'specific_year';

const getFiscalYearStart = () => {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 3, 1);
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    pendingInvoices: 0,
    unreconciledCount: 0,
    recentInvoices: [] as Invoice[],
    pendingQuotes: 0,
    pendingPurchases: 0
  });
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [specificDate, setSpecificDate] = useState<string>('');
  const [specificMonth, setSpecificMonth] = useState<string>('');
  const [specificYear, setSpecificYear] = useState<string>(new Date().getFullYear().toString());

  useEffect(() => {
    if (!db) return;

    let startDate: Date | null = null;
    let endDate: Date | null = null;
    const now = new Date();

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'fy':
        startDate = getFiscalYearStart();
        break;
      case 'custom':
        if (customStart) startDate = new Date(customStart);
        if (customEnd) endDate = new Date(customEnd);
        if (endDate) endDate.setHours(23, 59, 59, 999);
        break;
      case 'specific_date':
        if (specificDate) {
          startDate = new Date(specificDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(specificDate);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
      case 'specific_month':
        if (specificMonth) {
          const [yyyy, mm] = specificMonth.split('-');
          startDate = new Date(parseInt(yyyy), parseInt(mm) - 1, 1);
          endDate = new Date(parseInt(yyyy), parseInt(mm), 0);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
      case 'specific_year':
        if (specificYear) {
          startDate = new Date(parseInt(specificYear), 0, 1);
          endDate = new Date(parseInt(specificYear), 11, 31);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
    }

    // Revenue & Pending Invoices
    const invQuery = query(collection(db, 'invoices'));
    const unsubscribeInvoices = onSnapshot(invQuery, (snapshot) => {
      let invs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      
      // Filter by date
      if (startDate || endDate) {
        invs = invs.filter(inv => {
          if (!inv.created_at) return false;
          const invDate = inv.created_at.toDate();
          if (startDate && invDate < startDate) return false;
          if (endDate && invDate > endDate) return false;
          return true;
        });
      }

      const revenue = invs.filter(i => i.payment_status === 'paid').reduce((sum, i) => sum + i.grand_total, 0);
      const pending = invs.filter(i => i.payment_status === 'unpaid' || i.payment_status === 'partial').reduce((sum, i) => sum + (i.balance_amount || i.grand_total), 0);
      
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

    // Pending Purchases count
    const purchaseQuery = query(collection(db, 'purchases'), where('status', '==', 'pending'));
    const unsubscribePurchases = onSnapshot(purchaseQuery, (snapshot) => {
      setMetrics(prev => ({
        ...prev,
        pendingPurchases: snapshot.size
      }));
    }, (error) => {
      console.error("Dashboard purchases error:", error);
    });

    return () => {
      unsubscribeInvoices();
      unsubscribeQuotes();
      unsubscribePurchases();
    };
  }, [dateFilter, customStart, customEnd, specificDate, specificMonth, specificYear]);

  const handleGenerateReport = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text("EcoBill Financial Report", 14, 22);
    
    // Subtitle
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    
    let filterLabel = dateFilter.toUpperCase();
    if (dateFilter === 'today') {
      filterLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } else if (dateFilter === 'week') {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      filterLabel = `${start.toLocaleDateString()} to ${now.toLocaleDateString()}`;
    } else if (dateFilter === 'month') {
      filterLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
    } else if (dateFilter === 'fy') {
      const start = getFiscalYearStart();
      filterLabel = `FY ${start.getFullYear()}-${start.getFullYear() + 1}`;
    } else if (dateFilter === 'custom') {
      filterLabel = `${customStart} to ${customEnd}`;
    } else if (dateFilter === 'specific_date') {
      filterLabel = specificDate ? new Date(specificDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'None';
    } else if (dateFilter === 'specific_month') {
      filterLabel = specificMonth;
    } else if (dateFilter === 'specific_year') {
      filterLabel = specificYear;
    }
    doc.text(`Date Filter: ${filterLabel}`, 14, 36);

    // Metrics Table
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Key Metrics", 14, 48);
    
    autoTable(doc, {
      startY: 52,
      head: [['Metric', 'Value']],
      body: [
        ['Total Revenue', `Rs. ${metrics.totalRevenue.toLocaleString()}`],
        ['Pending Balance', `Rs. ${metrics.pendingInvoices.toLocaleString()}`],
        ['Quotes To Convert', metrics.pendingQuotes.toString()]
      ],
      theme: 'grid',
      headStyles: { fillColor: [46, 125, 50], textColor: 255, fontStyle: 'bold' }, // Primary green
      styles: { fontSize: 11, cellPadding: 5 }
    });

    // Recent Invoices Table
    doc.setFontSize(14);
    doc.text("Recent Invoice Activity", 14, (doc as any).lastAutoTable.finalY + 14);

    const tableData = metrics.recentInvoices.map(inv => {
      let dateStr = 'Unknown Date';
      if (inv.created_at) {
        if (typeof (inv.created_at as any).toDate === 'function') {
          dateStr = (inv.created_at as any).toDate().toLocaleDateString();
        } else if ((inv.created_at as any).seconds) {
          dateStr = new Date((inv.created_at as any).seconds * 1000).toLocaleDateString();
        } else {
          const d = new Date(inv.created_at as unknown as string);
          if (!isNaN(d.getTime())) dateStr = d.toLocaleDateString();
        }
      }
      return [
        inv.number,
        inv.customer_name || 'N/A',
        inv.status.toUpperCase(),
        dateStr,
        `Rs. ${inv.grand_total.toLocaleString()}`,
        `Rs. ${(inv.balance_amount || 0).toLocaleString()}`
      ];
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 18,
      head: [['Invoice No', 'Customer', 'Status', 'Date', 'Grand Total', 'Balance']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' }, // Dark slate
      styles: { fontSize: 10, cellPadding: 4 }
    });

    doc.save(`EcoBill_Report_${new Date().toISOString().split('T')[0]}.pdf`);
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
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 bg-surface p-1 rounded-xl shadow-neo-raised border border-shadow-darker/10">
            <Calendar size={16} className="text-secondary ml-2" />
            <select 
              value={dateFilter} 
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className="bg-transparent border-none text-sm font-semibold text-primary-dark focus:ring-0 py-1.5 cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="fy">This Financial Year</option>
              <option value="specific_date">Specific Date</option>
              <option value="specific_month">Specific Month</option>
              <option value="specific_year">Specific Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 animate-fade-in">
              <input type="date" className="neo-input text-xs !py-1.5" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span className="text-secondary text-xs">to</span>
              <input type="date" className="neo-input text-xs !py-1.5" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          )}

          {dateFilter === 'specific_date' && (
            <div className="animate-fade-in">
              <input type="date" className="neo-input text-xs !py-1.5" value={specificDate} onChange={e => setSpecificDate(e.target.value)} />
            </div>
          )}

          {dateFilter === 'specific_month' && (
            <div className="animate-fade-in">
              <input type="month" className="neo-input text-xs !py-1.5" value={specificMonth} onChange={e => setSpecificMonth(e.target.value)} />
            </div>
          )}

          {dateFilter === 'specific_year' && (
            <div className="animate-fade-in">
              <input type="number" min="2000" max="2100" placeholder="YYYY" className="neo-input text-xs !py-1.5 w-24" value={specificYear} onChange={e => setSpecificYear(e.target.value)} />
            </div>
          )}

          <button onClick={handleGenerateReport} className="neo-btn-primary">Generate Report</button>
        </div>
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

        <div className="neo-card flex flex-col justify-between h-36 bg-surface shadow-neo-surface group hover:shadow-neo-inset transition-all cursor-default">
          <div className="flex justify-between items-start">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Quotes To Convert</span>
            <AlertCircle size={18} className="text-error opacity-50" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-error tracking-tight">{metrics.pendingQuotes}</span>
            <span className="neo-badge-error text-[10px] py-0.5 shadow-none ring-1 ring-error/20">Critical</span>
          </div>
        </div>

        <div className="neo-card flex flex-col justify-between h-36 bg-surface shadow-neo-surface group hover:shadow-neo-inset transition-all cursor-default">
          <div className="flex justify-between items-start">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Quick Actions</span>
            <FileText size={18} className="text-primary-dark opacity-30" />
          </div>
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-lg bg-shadow-darker/5 flex items-center justify-center hover:bg-shadow-darker/10 transition-colors">
              <IndianRupee size={14} className="text-primary-dark" />
            </div>
            <div className="w-8 h-8 rounded-lg bg-shadow-darker/5 flex items-center justify-center hover:bg-shadow-darker/10 transition-colors">
              <Plus size={14} className="text-primary-dark" />
            </div>
          </div>
        </div>
      </div>

      {/* Main interaction space */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="neo-card lg:col-span-2 min-h-[400px]">
          <h3 className="mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {metrics.recentInvoices.length === 0 ? (
              <div className="py-20 text-center text-secondary opacity-50 border-2 border-dashed border-shadow-darker/10 rounded-xl">
                 <FileText size={32} className="mx-auto mb-2 opacity-20" />
                 No activity yet.
              </div>
            ) : metrics.recentInvoices.map(inv => (
              <div key={inv.id} className="flex justify-between items-center p-4 neo-input hover:shadow-neo-pressed transition-shadow cursor-default border border-transparent">
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
          <h3 className="mb-4">AI Auditor Tip</h3>
          <div className="bg-primary/5 rounded-card p-4 flex-1 flex flex-col justify-center items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary-dark flex items-center justify-center shadow-neo-raised">
              <span className="text-surface font-bold text-xl">!</span>
            </div>
            <p className="text-sm font-medium text-primary-dark">
              There are {metrics.pendingPurchases} purchase receipts pending OCR verification.
            </p>
            <button onClick={() => navigate('/purchases')} className="neo-btn text-sm w-full mt-2">Review Now</button>
          </div>
        </div>
      </div>
    </div>
  );
}

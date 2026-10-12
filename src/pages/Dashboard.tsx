import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, onSnapshot, getDocs, query, orderBy } from 'firebase/firestore';
import { 
  Calendar, 
  FileText, 
  Loader2, 
  Plus, 
  IndianRupee, 
  Activity, 
  Layers, 
  RefreshCw,
  Download,
  Filter,
  CheckCircle2,
  Cloud
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Invoice, CashMemo, ProformaInvoice, Quotation, Lead } from '../types';
import { 
  ExecutiveSummaryCards, 
  type DrillDownType 
} from '../components/Dashboard/ExecutiveSummaryCards';
import { CoreVisualAnalytics } from '../components/Dashboard/CoreVisualAnalytics';
import { ActionableOperationalTables } from '../components/Dashboard/ActionableOperationalTables';
import { DrillDownModal } from '../components/Dashboard/DrillDownModal';
import {
  type DashboardDateFilter,
  getDateRangeBounds,
  calculateExecutiveMetrics,
  generateSalesTrends,
  generateMonthlyComparison,
  generateLeadsByPipeline,
  generatePurchaseExpenseTrends,
  getDocAmount,
  getItemDate
} from '../utils/dashboardMetrics';

export default function Dashboard() {
  const navigate = useNavigate();

  // Firestore real-time data states
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cashMemos, setCashMemos] = useState<CashMemo[]>([]);
  const [proformaInvoices, setProformaInvoices] = useState<ProformaInvoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());

  // Global Date Filter states (defaulting to 'all' so all real historical records appear immediately)
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>('all');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  // Drill-down Modal states
  const [drillDownType, setDrillDownType] = useState<DrillDownType | string | null>(null);
  const [isDrillDownOpen, setIsDrillDownOpen] = useState(false);

  // 1. Real-time Multi-Collection Firestore Sync
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    let loadedCount = 0;
    const totalCollections = 7;
    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount >= totalCollections) {
        setLoading(false);
        setLastSyncedAt(new Date());
      }
    };

    // A. Sync Invoices
    const invUnsub = onSnapshot(
      collection(db, 'invoices'),
      (snap) => {
        setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
        checkAllLoaded();
      },
      (err) => {
        console.warn("Invoices sync notice:", err);
        checkAllLoaded();
      }
    );

    // B. Sync Cash Memos
    const memoUnsub = onSnapshot(
      collection(db, 'cash_memos'),
      (snap) => {
        setCashMemos(snap.docs.map(d => ({ id: d.id, ...d.data() } as CashMemo)));
        checkAllLoaded();
      },
      (err) => {
        console.warn("Cash memos sync notice:", err);
        checkAllLoaded();
      }
    );

    // C. Sync Proforma Invoices
    const piUnsub = onSnapshot(
      collection(db, 'proforma_invoices'),
      (snap) => {
        setProformaInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProformaInvoice)));
        checkAllLoaded();
      },
      (err) => {
        console.warn("Proforma invoices sync notice:", err);
        checkAllLoaded();
      }
    );

    // D. Sync Quotations
    const qtnUnsub = onSnapshot(
      collection(db, 'quotations'),
      (snap) => {
        setQuotations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Quotation)));
        checkAllLoaded();
      },
      (err) => {
        console.warn("Quotations sync notice:", err);
        checkAllLoaded();
      }
    );

    // E. Sync Leads & Production Orders
    const leadUnsub = onSnapshot(
      collection(db, 'leads'),
      (snap) => {
        setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
        checkAllLoaded();
      },
      (err) => {
        console.warn("Leads sync notice:", err);
        checkAllLoaded();
      }
    );

    // F. Sync Purchases
    const purchaseUnsub = onSnapshot(
      collection(db, 'purchases'),
      (snap) => {
        setPurchases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        checkAllLoaded();
      },
      (err) => {
        console.warn("Purchases sync notice:", err);
        checkAllLoaded();
      }
    );

    // G. Sync Expenses
    // Check localStorage fallback first
    let localExpenses: any[] = [];
    try {
      const rawLocal = localStorage.getItem('ecobill_saved_expenses');
      if (rawLocal) {
        const parsed = JSON.parse(rawLocal);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localExpenses = parsed;
          setExpenses(parsed);
        }
      }
    } catch (e) {
      console.warn("Local expenses check error:", e);
    }

    const expenseUnsub = onSnapshot(
      collection(db, 'expenses'),
      (snap) => {
        const remoteExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (remoteExpenses.length > 0) {
          setExpenses(remoteExpenses);
        } else if (localExpenses.length > 0) {
          setExpenses(localExpenses);
        } else {
          setExpenses([]);
        }
        checkAllLoaded();
      },
      (err) => {
        console.warn("Expenses sync notice:", err);
        if (localExpenses.length > 0) setExpenses(localExpenses);
        checkAllLoaded();
      }
    );

    return () => {
      invUnsub();
      memoUnsub();
      piUnsub();
      qtnUnsub();
      leadUnsub();
      purchaseUnsub();
      expenseUnsub();
    };
  }, []);

  // Manual Triggered Refresh
  const handleManualRefresh = async () => {
    if (!db) return;
    setIsRefreshing(true);
    try {
      const [invSnap, memoSnap, piSnap, qtnSnap, leadSnap, purchSnap, expSnap] = await Promise.all([
        getDocs(collection(db, 'invoices')).catch(() => null),
        getDocs(collection(db, 'cash_memos')).catch(() => null),
        getDocs(collection(db, 'proforma_invoices')).catch(() => null),
        getDocs(collection(db, 'quotations')).catch(() => null),
        getDocs(collection(db, 'leads')).catch(() => null),
        getDocs(collection(db, 'purchases')).catch(() => null),
        getDocs(collection(db, 'expenses')).catch(() => null)
      ]);

      if (invSnap) setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
      if (memoSnap) setCashMemos(memoSnap.docs.map(d => ({ id: d.id, ...d.data() } as CashMemo)));
      if (piSnap) setProformaInvoices(piSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProformaInvoice)));
      if (qtnSnap) setQuotations(qtnSnap.docs.map(d => ({ id: d.id, ...d.data() } as Quotation)));
      if (leadSnap) setLeads(leadSnap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
      if (purchSnap) setPurchases(purchSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (expSnap && expSnap.docs.length > 0) {
        setExpenses(expSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        try {
          const raw = localStorage.getItem('ecobill_saved_expenses');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) setExpenses(parsed);
          }
        } catch (e) {}
      }

      setLastSyncedAt(new Date());
    } catch (e) {
      console.error("Manual refresh error:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 2. Computed Financial & Operational Metrics (Guaranteed strict financial accuracy)
  const bounds = useMemo(() => {
    return getDateRangeBounds(dateFilter, customStart, customEnd);
  }, [dateFilter, customStart, customEnd]);

  const metrics = useMemo(() => {
    return calculateExecutiveMetrics(leads, invoices, cashMemos, proformaInvoices, bounds);
  }, [leads, invoices, cashMemos, proformaInvoices, bounds]);

  const salesTrends = useMemo(() => {
    return generateSalesTrends(invoices, cashMemos, bounds);
  }, [invoices, cashMemos, bounds]);

  const monthlyComparison = useMemo(() => {
    return generateMonthlyComparison(invoices, cashMemos, proformaInvoices);
  }, [invoices, cashMemos, proformaInvoices]);

  const pipelineDistribution = useMemo(() => {
    return generateLeadsByPipeline(leads);
  }, [leads]);

  // Purchases & Expenses Trends
  const purchaseExpenseResult = useMemo(() => {
    return generatePurchaseExpenseTrends(purchases, expenses, bounds);
  }, [purchases, expenses, bounds]);

  // Handle Card & Chart Drill-downs
  const handleDrillDown = (type: DrillDownType | string) => {
    setDrillDownType(type);
    setIsDrillDownOpen(true);
  };

  // PDF Executive Report Generator
  const handleGenerateReport = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(0, 77, 64);
    doc.text("EcoBill Executive & Operations Report", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 14, 28);
    const periodLabel = bounds.isAllTime 
      ? 'All Time (Complete Historical Database)' 
      : `${bounds.start.toLocaleDateString('en-IN')} to ${bounds.end.toLocaleDateString('en-IN')}`;
    doc.text(`Active Period: ${periodLabel}`, 14, 34);

    // Executive Metrics Table
    autoTable(doc, {
      startY: 42,
      head: [['Executive Metric', 'Value', 'Operational Context']],
      body: [
        ['Total Leads Captured', metrics.totalLeads.toString(), 'All acquisition channels'],
        ['Active Production Orders', metrics.activeOrders.toString(), 'Shop floor engraving/printing'],
        ['Total Gross Sales', `Rs. ${metrics.totalSales.toLocaleString('en-IN')}`, 'Invoices, Memos & Proformas'],
        ['Payments Received', `Rs. ${metrics.paymentsReceived.toLocaleString('en-IN')}`, 'Realized cash collections'],
        ['Outstanding Balances', `Rs. ${metrics.outstandingAmounts.toLocaleString('en-IN')}`, 'Pending client accounts'],
        ['Vendor Purchases', `Rs. ${purchaseExpenseResult.totalPurchases.toLocaleString('en-IN')}`, 'Raw materials & inventory'],
        ['Operating Expenses', `Rs. ${purchaseExpenseResult.totalExpenses.toLocaleString('en-IN')}`, 'Staff, utility & shop costs'],
        ['Pending Follow-ups', metrics.pendingFollowups.toString(), 'Urgent priority action items']
      ],
      theme: 'grid',
      headStyles: { fillColor: [0, 77, 64], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 4 }
    });

    // Recent Invoices Table
    const recentInvoices = invoices.filter(i => i.status !== 'cancelled').slice(0, 15);
    const invoiceRows = recentInvoices.map(inv => [
      inv.number,
      inv.customer_name || 'Walk-in',
      inv.payment_status.toUpperCase(),
      `Rs. ${getDocAmount(inv).toLocaleString('en-IN')}`,
      `Rs. ${(inv.balance_amount || 0).toLocaleString('en-IN')}`
    ]);

    doc.text("Recent Invoices & Payment Ledger", 14, (doc as any).lastAutoTable.finalY + 12);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 16,
      head: [['Invoice #', 'Customer', 'Status', 'Grand Total', 'Balance']],
      body: invoiceRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3.5 }
    });

    doc.save(`EcoBill_Executive_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const totalRecordCount = invoices.length + cashMemos.length + proformaInvoices.length + leads.length + quotations.length + purchases.length + expenses.length;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse p-2">
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="h-8 w-56 bg-shadow-darker/10 rounded-xl mb-2"></div>
            <div className="h-4 w-72 bg-shadow-darker/10 rounded-lg"></div>
          </div>
          <div className="h-10 w-44 bg-shadow-darker/10 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="neo-card h-28 bg-shadow-darker/5 rounded-2xl border border-shadow-darker/10"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="neo-card h-80 bg-shadow-darker/5 rounded-2xl border border-shadow-darker/10"></div>
          <div className="neo-card h-80 bg-shadow-darker/5 rounded-2xl border border-shadow-darker/10"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      
      {/* 1. Header & Live Sync Banner */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">
              Executive Command Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-800 text-xs font-bold border border-emerald-500/20">
              <Cloud size={13} className="text-emerald-600" />
              Live Firestore Synced
            </span>
          </div>
          <p className="text-secondary text-sm mt-1">
            Real-time business performance from {totalRecordCount} records ({invoices.length} Invoices, {purchases.length} Purchases, {expenses.length} Expenses, {leads.length} Leads).
          </p>
        </div>

        {/* Global Date Filter Selector & Sync Actions */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Quick Date Pills */}
          <div className="inline-flex rounded-xl bg-surface p-1 border border-shadow-darker/10 shadow-sm overflow-x-auto max-w-full">
            {(['all', 'today', 'week', 'month', 'fy', 'custom'] as DashboardDateFilter[]).map((f) => {
              const labels: Record<DashboardDateFilter, string> = {
                all: 'All Time',
                today: 'Today',
                week: 'This Week',
                month: 'This Month',
                fy: 'This FY',
                year: 'This Year',
                custom: 'Custom'
              };
              const isActive = dateFilter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDateFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-secondary hover:text-primary-dark'
                  }`}
                >
                  {labels[f]}
                </button>
              );
            })}
          </div>

          {/* Custom Date Pickers */}
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 animate-fade-in">
              <input 
                type="date" 
                value={customStart} 
                onChange={e => setCustomStart(e.target.value)} 
                className="neo-input text-xs !py-1.5"
                title="Start Date"
              />
              <span className="text-secondary text-xs font-bold">to</span>
              <input 
                type="date" 
                value={customEnd} 
                onChange={e => setCustomEnd(e.target.value)} 
                className="neo-input text-xs !py-1.5"
                title="End Date"
              />
            </div>
          )}

          {/* Refresh Real Data Button */}
          <button 
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="neo-btn flex items-center gap-1.5 text-xs py-2 px-3 font-bold text-primary-dark hover:text-primary"
            title="Force refresh database records"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-primary" : "text-primary"} />
            {isRefreshing ? 'Syncing...' : 'Sync Data'}
          </button>

          {/* Export PDF Button */}
          <button 
            type="button"
            onClick={handleGenerateReport} 
            className="neo-btn-primary flex items-center gap-1.5 text-xs py-2 px-3.5 font-bold"
          >
            <Download size={14} /> Export Report
          </button>
        </div>
      </div>

      {/* 2. Executive Summary Cards (6 Real-Time Metrics) */}
      <section aria-label="Executive Summary Cards">
        <ExecutiveSummaryCards 
          metrics={metrics}
          onCardClick={handleDrillDown}
        />
      </section>

      {/* 3. Core Visual Analytics & Charts (Including Purchases & Expenses Graph) */}
      <section aria-label="Core Visual Analytics">
        <CoreVisualAnalytics 
          salesTrends={salesTrends}
          monthlyComparison={monthlyComparison}
          pipelineDistribution={pipelineDistribution}
          collectionsReceived={metrics.paymentsReceived}
          outstandingBalance={metrics.outstandingAmounts}
          purchaseExpenseTrends={purchaseExpenseResult.data}
          totalPurchases={purchaseExpenseResult.totalPurchases}
          totalExpenses={purchaseExpenseResult.totalExpenses}
          totalOutflow={purchaseExpenseResult.totalOutflow}
          purchases={purchases}
          expenses={expenses}
          globalBounds={bounds}
          onStageClick={handleDrillDown}
          onCollectionsClick={() => handleDrillDown('payments_received')}
          onOutstandingClick={() => handleDrillDown('outstanding_amounts')}
          onPurchasesClick={() => handleDrillDown('purchases')}
        />
      </section>

      {/* 4. Actionable Operational Tables */}
      <section aria-label="Actionable Operational Tables">
        <ActionableOperationalTables 
          leads={leads}
          invoices={invoices}
          cashMemos={cashMemos}
          proformaInvoices={proformaInvoices}
        />
      </section>

      {/* 5. Interactive Drill-Down Modal */}
      <DrillDownModal 
        isOpen={isDrillDownOpen}
        onClose={() => setIsDrillDownOpen(false)}
        type={drillDownType}
        leads={leads}
        invoices={invoices}
        cashMemos={cashMemos}
        proformaInvoices={proformaInvoices}
        quotations={quotations}
        purchases={purchases}
      />

    </div>
  );
}

import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  ExternalLink, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Layers, 
  FileText, 
  Trash2,
  TrendingUp,
  ShoppingBag,
  Receipt,
  Users,
  CreditCard,
  Building,
  Tag,
  ArrowUpRight,
  Filter,
  Package
} from 'lucide-react';
import type { Lead, Invoice, CashMemo, ProformaInvoice, Quotation } from '../../types';
import type { DrillDownType } from './ExecutiveSummaryCards';
import { 
  STAGE_LABEL_MAP, 
  parseDate, 
  getDocAmount, 
  getItemDate,
  getPurchaseAmount,
  getExpenseAmount 
} from '../../utils/dashboardMetrics';

interface UnifiedSalesRecord {
  id: string;
  docType: 'Invoice' | 'Cash Memo' | 'Proforma';
  number: string;
  customer_name: string;
  grand_total: number;
  balance_amount: number;
  cleared_amount: number;
  payment_status: string;
  status: string;
  displayDate: string;
  route: string;
}

interface UnifiedPurchaseRecord {
  id: string;
  number: string;
  vendorName: string;
  vendorPhone?: string;
  category: string;
  itemsText: string;
  itemCount: number;
  grand_total: number;
  tax_amount: number;
  status: string;
  displayDate: string;
  route: string;
  raw: any;
}

interface UnifiedExpenseRecord {
  id: string;
  purpose: string;
  member: string;
  paymentMode: string;
  taxStatus: string;
  gstPercent: number;
  gstAmount: number;
  billNo: string;
  notes: string;
  paid_amount: number;
  category: string;
  displayDate: string;
  route: string;
  raw: any;
}

interface DrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: DrillDownType | string | null;
  leads: Lead[];
  invoices: Invoice[];
  cashMemos: CashMemo[];
  proformaInvoices?: ProformaInvoice[];
  quotations?: Quotation[];
  purchases?: any[];
  expenses?: any[];
}

export const DrillDownModal: React.FC<DrillDownModalProps> = ({
  isOpen,
  onClose,
  type,
  leads,
  invoices,
  cashMemos,
  proformaInvoices = [],
  quotations = [],
  purchases = [],
  expenses = []
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  
  // Section Navigation: 'sales' | 'purchases' | 'expenses' | 'leads'
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases' | 'expenses' | 'leads'>('sales');

  // Sub-filters for individual sections
  const [salesTypeFilter, setSalesTypeFilter] = useState<'all' | 'Invoice' | 'Cash Memo' | 'Proforma'>('all');
  const [salesStatusFilter, setSalesStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<string>('all');
  const [expenseModeFilter, setExpenseModeFilter] = useState<string>('all');
  const [expenseTaxFilter, setExpenseTaxFilter] = useState<string>('all');

  // Sync activeTab whenever modal opens or type changes
  useEffect(() => {
    if (!type) return;
    if (type === 'purchases') {
      setActiveTab('purchases');
    } else if (type === 'expenses') {
      setActiveTab('expenses');
    } else if (type === 'total_sales' || type === 'payments_received' || type === 'outstanding_amounts') {
      setActiveTab('sales');
      if (type === 'payments_received') setSalesStatusFilter('paid');
      else if (type === 'outstanding_amounts') setSalesStatusFilter('unpaid');
      else setSalesStatusFilter('all');
    } else {
      setActiveTab('leads');
    }
    setSearch('');
  }, [type, isOpen]);

  // 1. Unified Sales Records (Invoices, Cash Memos, Proformas)
  const allSalesRecords = useMemo<UnifiedSalesRecord[]>(() => {
    const list: UnifiedSalesRecord[] = [];
    
    // Tax Invoices
    invoices.filter(i => i.status !== 'cancelled').forEach(i => {
      const grand = getDocAmount(i);
      const bal = i.payment_status === 'paid' ? 0 : (Number(i.balance_amount) || grand);
      list.push({
        id: i.id,
        docType: 'Invoice',
        number: i.number || 'Tax Inv',
        customer_name: i.customer_name || 'Direct Customer',
        grand_total: grand,
        balance_amount: bal,
        cleared_amount: Math.max(0, grand - bal),
        payment_status: i.payment_status || 'unpaid',
        status: i.status || 'finalized',
        displayDate: getItemDate(i)?.toLocaleDateString('en-IN') || '-',
        route: '/invoices'
      });
    });

    // Cash Memos
    cashMemos.filter(m => m.status !== 'cancelled').forEach(m => {
      const grand = getDocAmount(m);
      list.push({
        id: m.id,
        docType: 'Cash Memo',
        number: m.number || 'Cash Memo',
        customer_name: m.customer_name || 'Walk-in Customer',
        grand_total: grand,
        balance_amount: 0,
        cleared_amount: grand,
        payment_status: 'paid',
        status: m.status || 'finalized',
        displayDate: getItemDate(m)?.toLocaleDateString('en-IN') || '-',
        route: '/cash-memos'
      });
    });

    // Proforma Invoices
    proformaInvoices.filter(p => p.status !== 'cancelled').forEach(p => {
      const grand = getDocAmount(p);
      const bal = p.payment_status === 'paid' ? 0 : (Number(p.balance_amount) || grand);
      list.push({
        id: p.id,
        docType: 'Proforma',
        number: p.number || 'Proforma',
        customer_name: p.customer_name || 'Direct Customer',
        grand_total: grand,
        balance_amount: bal,
        cleared_amount: Math.max(0, grand - bal),
        payment_status: p.payment_status || 'unpaid',
        status: p.status || 'draft',
        displayDate: getItemDate(p)?.toLocaleDateString('en-IN') || '-',
        route: '/proforma-invoices'
      });
    });

    return list;
  }, [invoices, cashMemos, proformaInvoices]);

  // 2. Unified Purchases Records
  const allPurchaseRecords = useMemo<UnifiedPurchaseRecord[]>(() => {
    return purchases.map((p: any) => {
      const amt = getPurchaseAmount(p);
      const vendorObj = typeof p.vendor === 'object' ? p.vendor : null;
      const vendorName = vendorObj?.name || (typeof p.vendor === 'string' ? p.vendor : 'Unknown Vendor');
      const vendorPhone = vendorObj?.phone || '';
      const ref = p.invoice?.invoice_number || p.reference || p.id?.slice(0, 8) || 'PO Bill';
      const d = getItemDate(p);
      const itemsList = Array.isArray(p.items) ? p.items : [];
      const itemsSummary = itemsList.map((it: any) => it.itemName || it.name || it.description).filter(Boolean).join(', ');

      return {
        id: p.id,
        number: ref,
        vendorName,
        vendorPhone,
        category: p.category || 'Raw Material',
        itemsText: itemsSummary || 'Procurement items',
        itemCount: itemsList.length,
        grand_total: amt,
        tax_amount: Number(p.taxAmount || p.tax || 0),
        status: p.status || 'submitted',
        displayDate: d ? d.toLocaleDateString('en-IN') : '-',
        route: '/purchases',
        raw: p
      };
    });
  }, [purchases]);

  // 3. Unified Expenses Records
  const allExpenseRecords = useMemo<UnifiedExpenseRecord[]>(() => {
    return expenses.map((e: any) => {
      const amt = getExpenseAmount(e);
      const d = getItemDate(e);
      return {
        id: e.id,
        purpose: e.purpose || e.description || 'General Expense',
        member: e.member || e.paidTo || e.requestedBy || 'Staff Member',
        paymentMode: e.paymentMode || e.payment_mode || 'Cash',
        taxStatus: e.taxStatus || (e.gstAmount ? 'GST' : 'Non-GST'),
        gstPercent: Number(e.gstPercent || 0),
        gstAmount: Number(e.gstAmount || 0),
        billNo: e.billNo || e.bill_no || e.voucher_no || '',
        notes: e.notes || '',
        paid_amount: amt,
        category: e.category || 'Operational',
        displayDate: d ? d.toLocaleDateString('en-IN') : '-',
        route: '/expense',
        raw: e
      };
    });
  }, [expenses]);

  // Summary KPIs for Sales
  const salesSummary = useMemo(() => {
    const gross = allSalesRecords.reduce((sum, r) => sum + r.grand_total, 0);
    const cleared = allSalesRecords.reduce((sum, r) => sum + r.cleared_amount, 0);
    const balance = allSalesRecords.reduce((sum, r) => sum + r.balance_amount, 0);
    const invCount = allSalesRecords.filter(r => r.docType === 'Invoice').length;
    const memoCount = allSalesRecords.filter(r => r.docType === 'Cash Memo').length;
    const profCount = allSalesRecords.filter(r => r.docType === 'Proforma').length;
    return { gross, cleared, balance, invCount, memoCount, profCount };
  }, [allSalesRecords]);

  // Summary KPIs for Purchases
  const purchasesSummary = useMemo(() => {
    const total = allPurchaseRecords.reduce((sum, r) => sum + r.grand_total, 0);
    const vendorsSet = new Set(allPurchaseRecords.map(r => r.vendorName.toLowerCase().trim()));
    const approvedCount = allPurchaseRecords.filter(r => ['approved', 'confirmed', 'cleared'].includes(r.status.toLowerCase())).length;
    return { total, vendorCount: vendorsSet.size, count: allPurchaseRecords.length, approvedCount };
  }, [allPurchaseRecords]);

  // Summary KPIs for Expenses
  const expensesSummary = useMemo(() => {
    const total = allExpenseRecords.reduce((sum, r) => sum + r.paid_amount, 0);
    const cashTotal = allExpenseRecords.filter(r => r.paymentMode.toLowerCase() === 'cash').reduce((sum, r) => sum + r.paid_amount, 0);
    const digitalTotal = total - cashTotal;
    const totalGst = allExpenseRecords.reduce((sum, r) => sum + r.gstAmount, 0);
    return { total, cashTotal, digitalTotal, totalGst, count: allExpenseRecords.length };
  }, [allExpenseRecords]);

  // Filtered Sales
  const filteredSales = useMemo(() => {
    return allSalesRecords.filter(s => {
      if (salesTypeFilter !== 'all' && s.docType !== salesTypeFilter) return false;
      if (salesStatusFilter === 'paid' && s.payment_status !== 'paid') return false;
      if (salesStatusFilter === 'unpaid' && s.payment_status === 'paid') return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.number.toLowerCase().includes(q) ||
        s.customer_name.toLowerCase().includes(q) ||
        s.displayDate.includes(q) ||
        s.payment_status.toLowerCase().includes(q)
      );
    });
  }, [allSalesRecords, salesTypeFilter, salesStatusFilter, search]);

  // Filtered Purchases
  const filteredPurchases = useMemo(() => {
    return allPurchaseRecords.filter(p => {
      if (purchaseStatusFilter !== 'all' && p.status.toLowerCase() !== purchaseStatusFilter.toLowerCase()) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.number.toLowerCase().includes(q) ||
        p.vendorName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.itemsText.toLowerCase().includes(q) ||
        p.displayDate.includes(q)
      );
    });
  }, [allPurchaseRecords, purchaseStatusFilter, search]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return allExpenseRecords.filter(e => {
      if (expenseModeFilter !== 'all' && e.paymentMode.toLowerCase() !== expenseModeFilter.toLowerCase()) return false;
      if (expenseTaxFilter !== 'all' && e.taxStatus.toLowerCase() !== expenseTaxFilter.toLowerCase()) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        e.purpose.toLowerCase().includes(q) ||
        e.member.toLowerCase().includes(q) ||
        e.billNo.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q) ||
        e.displayDate.includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    });
  }, [allExpenseRecords, expenseModeFilter, expenseTaxFilter, search]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    let base = leads;
    if (type === 'active_orders') {
      base = leads.filter(l => 
        ['advance_payment', 'production', 'quality_check', 'ready_for_dispatch', 'dispatch', 'design_stage', 'design_approval', 'requirement_confirmed'].includes(l.status || '')
      );
    } else if (type === 'pending_followups') {
      base = leads.filter(l => {
        if (l.leadStatus === 'lost' || l.leadStatus === 'won' || l.status === 'lost_cancelled') return false;
        if (l.status === 'follow_up' || l.qualification_status === 'Needs Follow-up') return true;
        const d = parseDate(l.next_follow_up_date);
        return d && d <= endOfToday;
      });
    } else if (typeof type === 'string' && STAGE_LABEL_MAP[type]) {
      base = leads.filter(l => l.status === type);
    }

    if (!search) return base;
    const q = search.toLowerCase();
    return base.filter(l => 
      l.name?.toLowerCase().includes(q) ||
      l.company?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.requirement?.toLowerCase().includes(q)
    );
  }, [leads, type, search]);

  if (!isOpen || !type) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-5">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Main Modal Window */}
      <div className="relative bg-surface rounded-2xl border border-shadow-darker/10 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col z-10 animate-scale-up overflow-hidden">
        
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-shadow-darker/10 bg-surface flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              activeTab === 'sales'
                ? 'bg-primary/10 text-primary-dark border-primary/20'
                : activeTab === 'purchases'
                ? 'bg-amber-400/20 text-amber-900 border-amber-500/30'
                : activeTab === 'expenses'
                ? 'bg-rose-500/15 text-rose-900 border-rose-500/20'
                : 'bg-primary/10 text-primary-dark border-primary/20'
            }`}>
              {activeTab === 'sales' && <TrendingUp size={20} />}
              {activeTab === 'purchases' && <ShoppingBag size={20} />}
              {activeTab === 'expenses' && <Receipt size={20} />}
              {activeTab === 'leads' && <Users size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-primary-dark tracking-tight">
                  {activeTab === 'sales' && 'Sales Breakdown & Transactions'}
                  {activeTab === 'purchases' && 'Vendor Purchases Breakdown'}
                  {activeTab === 'expenses' && 'Operating Expenses Breakdown'}
                  {activeTab === 'leads' && 'Inquiries & Order Workflow Breakdown'}
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary-dark">
                  {activeTab === 'sales' && `${filteredSales.length} records`}
                  {activeTab === 'purchases' && `${filteredPurchases.length} bills`}
                  {activeTab === 'expenses' && `${filteredExpenses.length} entries`}
                  {activeTab === 'leads' && `${filteredLeads.length} leads`}
                </span>
              </div>
              <p className="text-xs text-secondary mt-0.5">
                {activeTab === 'sales' && 'Granular breakdown of all Tax Invoices, Cash Memos, and Proformas'}
                {activeTab === 'purchases' && 'Itemized procurement bills, vendor accounts, and purchase orders'}
                {activeTab === 'expenses' && 'Operating overheads, utility bills, staff reimbursements, and GST breakdown'}
                {activeTab === 'leads' && 'Pipeline progress, client follow-ups, and production gate tracking'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-secondary hover:text-primary-dark hover:bg-secondary/10 transition-colors"
            title="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Section Navigation Tabs (Allows 1-click switching between Sales, Purchases, Expenses while keeping data separate) */}
        <div className="px-4 sm:px-5 py-2.5 bg-primary/5 border-b border-shadow-darker/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 custom-sidebar-scrollbar">
            {/* Sales Tab */}
            <button
              type="button"
              onClick={() => { setActiveTab('sales'); setSearch(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'sales'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-secondary hover:text-primary-dark hover:bg-primary/10'
              }`}
            >
              <TrendingUp size={14} />
              <span>Sales ({allSalesRecords.length})</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === 'sales' ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
              }`}>
                ₹{salesSummary.gross.toLocaleString('en-IN')}
              </span>
            </button>

            {/* Purchases Tab */}
            <button
              type="button"
              onClick={() => { setActiveTab('purchases'); setSearch(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'purchases'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-secondary hover:text-primary-dark hover:bg-amber-400/20'
              }`}
            >
              <ShoppingBag size={14} />
              <span>Purchases ({allPurchaseRecords.length})</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === 'purchases' ? 'bg-white/20 text-white' : 'bg-amber-400/20 text-amber-900'
              }`}>
                ₹{purchasesSummary.total.toLocaleString('en-IN')}
              </span>
            </button>

            {/* Expenses Tab */}
            <button
              type="button"
              onClick={() => { setActiveTab('expenses'); setSearch(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-secondary hover:text-primary-dark hover:bg-rose-500/15'
              }`}
            >
              <Receipt size={14} />
              <span>Expenses ({allExpenseRecords.length})</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === 'expenses' ? 'bg-white/20 text-white' : 'bg-rose-500/15 text-rose-900'
              }`}>
                ₹{expensesSummary.total.toLocaleString('en-IN')}
              </span>
            </button>

            {/* Leads Tab (if leads exist or triggered from leads) */}
            {(leads.length > 0 || activeTab === 'leads') && (
              <button
                type="button"
                onClick={() => { setActiveTab('leads'); setSearch(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'leads'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-secondary hover:text-primary-dark hover:bg-primary/10'
                }`}
              >
                <Users size={14} />
                <span>Leads ({leads.length})</span>
              </button>
            )}
          </div>

          {/* Quick Action Navigation */}
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (activeTab === 'sales') navigate('/invoices');
                else if (activeTab === 'purchases') navigate('/purchases');
                else if (activeTab === 'expenses') navigate('/expense');
                else navigate('/leads');
              }}
              className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Go to full {activeTab === 'sales' ? 'Sales Ledger' : activeTab === 'purchases' ? 'Purchases' : activeTab === 'expenses' ? 'Expenses' : 'Leads'} page</span>
              <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        {/* Section Mini KPI Summary Banner */}
        <div className="p-4 bg-surface border-b border-shadow-darker/10">
          {activeTab === 'sales' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-xl border border-primary/20 bg-primary/5">
                <span className="text-[10px] font-bold text-secondary uppercase">Gross Sales Revenue</span>
                <div className="text-sm sm:text-base font-black text-primary-dark">₹{salesSummary.gross.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-secondary mt-0.5">{allSalesRecords.length} total documents</div>
              </div>
              <div className="p-2.5 rounded-xl border border-emerald-600/20 bg-emerald-500/5">
                <span className="text-[10px] font-bold text-emerald-900 uppercase">Cleared Collections</span>
                <div className="text-sm sm:text-base font-black text-emerald-900">₹{salesSummary.cleared.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-emerald-800/80 mt-0.5">Realized in bank/cash</div>
              </div>
              <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-400/10">
                <span className="text-[10px] font-bold text-amber-900 uppercase">Pending Receivables</span>
                <div className="text-sm sm:text-base font-black text-amber-950">₹{salesSummary.balance.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-amber-900/80 mt-0.5">Balance dues to collect</div>
              </div>
              <div className="p-2.5 rounded-xl border border-shadow-darker/10 bg-surface">
                <span className="text-[10px] font-bold text-secondary uppercase">Document Breakdown</span>
                <div className="text-xs font-bold text-primary-dark mt-1 flex flex-col gap-0.5">
                  <span>{salesSummary.invCount} Tax Invoices</span>
                  <span className="text-secondary text-[11px]">{salesSummary.memoCount} Memos • {salesSummary.profCount} Proformas</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'purchases' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-400/10">
                <span className="text-[10px] font-bold text-amber-900 uppercase">Total Procurement</span>
                <div className="text-sm sm:text-base font-black text-amber-950">₹{purchasesSummary.total.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-amber-900/80 mt-0.5">Materials & vendor spending</div>
              </div>
              <div className="p-2.5 rounded-xl border border-primary/20 bg-primary/5">
                <span className="text-[10px] font-bold text-secondary uppercase">Unique Suppliers</span>
                <div className="text-sm sm:text-base font-black text-primary-dark">{purchasesSummary.vendorCount} Vendors</div>
                <div className="text-[10px] text-secondary mt-0.5">Active supply network</div>
              </div>
              <div className="p-2.5 rounded-xl border border-emerald-600/20 bg-emerald-500/5">
                <span className="text-[10px] font-bold text-emerald-900 uppercase">Cleared Bills</span>
                <div className="text-sm sm:text-base font-black text-emerald-900">{purchasesSummary.approvedCount} Confirmed</div>
                <div className="text-[10px] text-emerald-800/80 mt-0.5">Approved PO records</div>
              </div>
              <div className="p-2.5 rounded-xl border border-shadow-darker/10 bg-surface">
                <span className="text-[10px] font-bold text-secondary uppercase">Total Bill Entries</span>
                <div className="text-sm sm:text-base font-black text-primary-dark">{purchasesSummary.count} Bills</div>
                <div className="text-[10px] text-secondary mt-0.5">Procurement transactions</div>
              </div>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10">
                <span className="text-[10px] font-bold text-rose-900 uppercase">Total Operating Costs</span>
                <div className="text-sm sm:text-base font-black text-rose-950">₹{expensesSummary.total.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-rose-900/80 mt-0.5">Shop floor & overheads</div>
              </div>
              <div className="p-2.5 rounded-xl border border-emerald-600/20 bg-emerald-500/5">
                <span className="text-[10px] font-bold text-emerald-900 uppercase">Cash Outflow</span>
                <div className="text-sm sm:text-base font-black text-emerald-900">₹{expensesSummary.cashTotal.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-emerald-800/80 mt-0.5">Cash register payments</div>
              </div>
              <div className="p-2.5 rounded-xl border border-primary/20 bg-primary/5">
                <span className="text-[10px] font-bold text-secondary uppercase">Bank / UPI / Card</span>
                <div className="text-sm sm:text-base font-black text-primary-dark">₹{expensesSummary.digitalTotal.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-secondary mt-0.5">Digital transactions</div>
              </div>
              <div className="p-2.5 rounded-xl border border-shadow-darker/10 bg-surface">
                <span className="text-[10px] font-bold text-secondary uppercase">GST Claimable</span>
                <div className="text-sm sm:text-base font-black text-primary-dark">₹{expensesSummary.totalGst.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-secondary mt-0.5">Input tax credit amount</div>
              </div>
            </div>
          )}
        </div>

        {/* Search & Sub-Filter Bar */}
        <div className="p-3 sm:p-4 bg-primary/5 border-b border-shadow-darker/10 flex flex-wrap items-center justify-between gap-3">
          {/* Live Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input
              type="text"
              placeholder={
                activeTab === 'sales'
                  ? "Search by doc #, customer, date..."
                  : activeTab === 'purchases'
                  ? "Search vendor, PO #, item, category..."
                  : activeTab === 'expenses'
                  ? "Search purpose, payee, bill #, mode..."
                  : "Search leads by client, phone, requirement..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="neo-input !py-1.5 !pl-8 text-xs w-full"
            />
          </div>

          {/* Contextual Sub-Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'sales' && (
              <>
                <select
                  value={salesTypeFilter}
                  onChange={(e) => setSalesTypeFilter(e.target.value as any)}
                  className="neo-input !py-1 !px-2.5 text-xs bg-white font-medium"
                >
                  <option value="all">All Doc Types</option>
                  <option value="Invoice">Tax Invoices Only</option>
                  <option value="Cash Memo">Cash Memos Only</option>
                  <option value="Proforma">Proformas Only</option>
                </select>

                <select
                  value={salesStatusFilter}
                  onChange={(e) => setSalesStatusFilter(e.target.value as any)}
                  className="neo-input !py-1 !px-2.5 text-xs bg-white font-medium"
                >
                  <option value="all">All Payment Status</option>
                  <option value="paid">Cleared / Paid</option>
                  <option value="unpaid">Pending Balance</option>
                </select>
              </>
            )}

            {activeTab === 'purchases' && (
              <select
                value={purchaseStatusFilter}
                onChange={(e) => setPurchaseStatusFilter(e.target.value)}
                className="neo-input !py-1 !px-2.5 text-xs bg-white font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="confirmed">Confirmed</option>
                <option value="cleared">Cleared</option>
                <option value="submitted">Submitted</option>
              </select>
            )}

            {activeTab === 'expenses' && (
              <>
                <select
                  value={expenseModeFilter}
                  onChange={(e) => setExpenseModeFilter(e.target.value)}
                  className="neo-input !py-1 !px-2.5 text-xs bg-white font-medium"
                >
                  <option value="all">All Payment Modes</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank</option>
                  <option value="card">Card</option>
                </select>

                <select
                  value={expenseTaxFilter}
                  onChange={(e) => setExpenseTaxFilter(e.target.value)}
                  className="neo-input !py-1 !px-2.5 text-xs bg-white font-medium"
                >
                  <option value="all">All Tax Statuses</option>
                  <option value="gst">GST Bills</option>
                  <option value="non-gst">Non-GST</option>
                </select>
              </>
            )}
          </div>
        </div>

        {/* Table Content Area */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 custom-sidebar-scrollbar">
          
          {/* 1. SALES BREAKDOWN TABLE */}
          {activeTab === 'sales' && (
            <div className="overflow-x-auto">
              {filteredSales.length === 0 ? (
                <div className="py-12 text-center text-secondary space-y-2">
                  <p className="font-semibold text-sm">No sales records match the selected filters.</p>
                  <p className="text-xs text-secondary/70">Try adjusting your search query or clear sub-filters.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10 sticky top-0 bg-surface">
                    <tr>
                      <th className="p-3">Doc #</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Customer / Client</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Grand Total</th>
                      <th className="p-3 text-right">Cleared</th>
                      <th className="p-3 text-right">Balance Due</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-shadow-darker/5">
                    {filteredSales.map((doc) => (
                      <tr key={`${doc.docType}-${doc.id}`} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3 font-bold text-primary-dark">{doc.number}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                            doc.docType === 'Invoice'
                              ? 'bg-primary/10 text-primary-dark border-primary/20'
                              : doc.docType === 'Cash Memo'
                              ? 'bg-emerald-500/15 text-emerald-900 border-emerald-500/20'
                              : 'bg-amber-400/20 text-amber-900 border-amber-500/30'
                          }`}>
                            {doc.docType}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-primary-dark max-w-xs truncate">{doc.customer_name}</td>
                        <td className="p-3 text-secondary font-mono text-[11px]">{doc.displayDate}</td>
                        <td className="p-3 text-right font-bold text-primary-dark">₹{doc.grand_total.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-right font-medium text-emerald-900">₹{doc.cleared_amount.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-right font-black">
                          {doc.balance_amount > 0 ? (
                            <span className="text-amber-950 font-black">₹{doc.balance_amount.toLocaleString('en-IN')}</span>
                          ) : (
                            <span className="text-secondary font-normal">₹0</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            doc.payment_status === 'paid' 
                              ? 'bg-emerald-500/15 text-emerald-900 border-emerald-500/20' 
                              : doc.payment_status === 'partial'
                              ? 'bg-amber-400/20 text-amber-900 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-900 border-rose-500/20'
                          }`}>
                            {doc.payment_status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate(doc.route);
                            }}
                            className="neo-btn !py-1 !px-2.5 text-xs text-primary font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            Open <ExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 2. PURCHASES BREAKDOWN TABLE */}
          {activeTab === 'purchases' && (
            <div className="overflow-x-auto">
              {filteredPurchases.length === 0 ? (
                <div className="py-12 text-center text-secondary space-y-2">
                  <p className="font-semibold text-sm">No purchase records match the selected criteria.</p>
                  <p className="text-xs text-secondary/70">Adjust your search or add procurement bills in the Purchases section.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10 sticky top-0 bg-surface">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Bill / Ref #</th>
                      <th className="p-3">Vendor / Supplier</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Items Summary</th>
                      <th className="p-3 text-right">Tax / GST</th>
                      <th className="p-3 text-right">Total Amount</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-shadow-darker/5">
                    {filteredPurchases.map((doc) => (
                      <tr key={doc.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3 text-secondary font-mono text-[11px]">{doc.displayDate}</td>
                        <td className="p-3 font-bold text-primary-dark">{doc.number}</td>
                        <td className="p-3">
                          <div className="font-bold text-primary-dark">{doc.vendorName}</div>
                          {doc.vendorPhone && <div className="text-[10px] text-secondary font-mono">{doc.vendorPhone}</div>}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-400/20 text-amber-900 border border-amber-500/30">
                            {doc.category}
                          </span>
                        </td>
                        <td className="p-3 text-secondary max-w-xs truncate" title={doc.itemsText}>
                          {doc.itemsText}
                        </td>
                        <td className="p-3 text-right text-secondary font-mono">
                          {doc.tax_amount > 0 ? `₹${doc.tax_amount.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                        <td className="p-3 text-right font-black text-primary-dark">
                          ₹{doc.grand_total.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-primary/10 text-primary-dark border border-primary/20">
                            {doc.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate('/purchases');
                              }}
                              className="neo-btn !py-1 !px-2.5 text-xs text-primary font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              View <ExternalLink size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm(`Delete purchase record for ${doc.vendorName} (₹${doc.grand_total})?`)) return;
                                try {
                                  const { doc: firestoreDoc, deleteDoc: firestoreDelete } = await import('firebase/firestore');
                                  const { db } = await import('../../lib/firebase');
                                  if (!db) return;
                                  await firestoreDelete(firestoreDoc(db, 'purchases', doc.id));
                                  alert("Purchase record deleted.");
                                  onClose();
                                } catch (e: any) {
                                  alert("Failed to delete purchase: " + e.message);
                                }
                              }}
                              className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                              title="Delete this purchase record"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 3. EXPENSES BREAKDOWN TABLE */}
          {activeTab === 'expenses' && (
            <div className="overflow-x-auto">
              {filteredExpenses.length === 0 ? (
                <div className="py-12 text-center text-secondary space-y-2">
                  <p className="font-semibold text-sm">No expense entries match the selected filters.</p>
                  <p className="text-xs text-secondary/70">Adjust payment mode, tax filter, or log expenses in the Expense Manager.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10 sticky top-0 bg-surface">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Purpose / Description</th>
                      <th className="p-3">Paid To / Member</th>
                      <th className="p-3">Payment Mode</th>
                      <th className="p-3">Tax Status</th>
                      <th className="p-3">Bill / Ref #</th>
                      <th className="p-3 text-right">Amount Paid</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-shadow-darker/5">
                    {filteredExpenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3 text-secondary font-mono text-[11px]">{exp.displayDate}</td>
                        <td className="p-3">
                          <div className="font-bold text-primary-dark">{exp.purpose}</div>
                          {exp.notes && <div className="text-[10px] text-secondary truncate max-w-xs">{exp.notes}</div>}
                        </td>
                        <td className="p-3 font-medium text-primary-dark">{exp.member}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            exp.paymentMode.toLowerCase() === 'cash'
                              ? 'bg-emerald-500/15 text-emerald-900 border-emerald-500/20'
                              : exp.paymentMode.toLowerCase() === 'upi'
                              ? 'bg-primary/10 text-primary-dark border-primary/20'
                              : 'bg-amber-400/20 text-amber-900 border-amber-500/30'
                          }`}>
                            {exp.paymentMode}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-[11px] text-primary-dark">{exp.taxStatus}</div>
                          {exp.gstAmount > 0 && (
                            <div className="text-[10px] text-secondary">GST ₹{exp.gstAmount.toLocaleString('en-IN')} ({exp.gstPercent}%)</div>
                          )}
                        </td>
                        <td className="p-3 font-mono text-secondary text-[11px]">{exp.billNo || '-'}</td>
                        <td className="p-3 text-right font-black text-rose-950">
                          ₹{exp.paid_amount.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate('/expense');
                            }}
                            className="neo-btn !py-1 !px-2.5 text-xs text-primary font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            Open <ExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 4. LEADS & INQUIRIES BREAKDOWN TABLE */}
          {activeTab === 'leads' && (
            <div className="overflow-x-auto">
              {filteredLeads.length === 0 ? (
                <div className="py-12 text-center text-secondary space-y-2">
                  <p className="font-semibold text-sm">No client leads match the current criteria.</p>
                  <p className="text-xs text-secondary/70">Clear the search box or check other pipeline filters.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10 sticky top-0 bg-surface">
                    <tr>
                      <th className="p-3">Client / Name</th>
                      <th className="p-3">Phone / Contact</th>
                      <th className="p-3">Stage / Gate</th>
                      <th className="p-3">Requirement</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-shadow-darker/5">
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-primary-dark">{lead.name || 'Unnamed'}</div>
                          <div className="text-[10px] text-secondary">{lead.company || 'Direct'}</div>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-secondary">
                          {lead.phone || '-'}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary-dark">
                            {STAGE_LABEL_MAP[lead.status] || lead.status}
                          </span>
                        </td>
                        <td className="p-3 text-secondary truncate max-w-xs">
                          {lead.requirement || lead.trophy_type || '-'}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate(`/leads/${lead.id}`);
                            }}
                            className="neo-btn !py-1 !px-2.5 text-xs text-primary font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            Open <ExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

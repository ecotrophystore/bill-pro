import type { Invoice, CashMemo, ProformaInvoice, Quotation, Lead } from '../types';

export type DashboardDateFilter = 'all' | 'today' | 'week' | 'month' | 'fy' | 'year' | 'custom';

export interface DateRangeBounds {
  start: Date;
  end: Date;
  isAllTime: boolean;
}

export function parseDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
  if (typeof val._seconds === 'number') return new Date(val._seconds * 1000);
  if (typeof val === 'number') return new Date(val);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function getItemDate(item: any): Date | null {
  if (!item) return null;
  return (
    parseDate(item.createdAt) ||
    parseDate(item.date) ||
    parseDate(item.created_at) ||
    parseDate(item.custom_date) ||
    parseDate(item.invoice_date) ||
    parseDate(item.invoice?.invoice_date) ||
    parseDate(item.advance_payment_date) ||
    parseDate(item.updated_at) ||
    parseDate(item.updatedAt) ||
    parseDate(item.timestamp)
  );
}

export function getPurchaseAmount(item: any): number {
  if (!item) return 0;
  const val = Number(item.grandTotal ?? item.amount ?? item.total ?? 0);
  return isNaN(val) ? 0 : val;
}

export function getExpenseAmount(item: any): number {
  if (!item) return 0;
  const val = Number(item.paid ?? item.requested ?? item.amount ?? item.total ?? 0);
  return isNaN(val) ? 0 : val;
}

export function getFiscalYearBounds(): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const start = new Date(year, 3, 1, 0, 0, 0, 0);
  const end = new Date(year + 1, 2, 31, 23, 59, 59, 999);
  return { start, end };
}

export function getDateRangeBounds(
  filter: DashboardDateFilter,
  customStart?: string,
  customEnd?: string
): DateRangeBounds {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  let isAllTime = false;

  switch (filter) {
    case 'all':
      isAllTime = true;
      start = new Date(2020, 0, 1, 0, 0, 0, 0);
      end.setTime(new Date(2035, 11, 31, 23, 59, 59, 999).getTime());
      break;
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      break;
    case 'week': {
      const day = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day, 0, 0, 0, 0);
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    case 'fy': {
      const fy = getFiscalYearBounds();
      start = fy.start;
      end.setTime(fy.end.getTime());
      break;
    }
    case 'year':
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      break;
    case 'custom':
      if (customStart) {
        const s = new Date(customStart);
        if (!isNaN(s.getTime())) start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
      }
      if (customEnd) {
        const e = new Date(customEnd);
        if (!isNaN(e.getTime())) end.setTime(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999).getTime());
      }
      break;
  }

  return { start, end, isAllTime };
}

export function isWithinDateRange(item: any, bounds: DateRangeBounds): boolean {
  if (bounds.isAllTime) return true;
  const d = getItemDate(item);
  if (!d) return true; // Include records without explicit timestamp so real data is never hidden
  return d >= bounds.start && d <= bounds.end;
}

// Definition of Active Production Order Stages
export const PRODUCTION_STAGES = [
  'requirement_confirmed',
  'design_stage',
  'design_approval',
  'advance_payment',
  'production',
  'quality_check',
  'ready_for_dispatch',
  'dispatch'
];

export interface DashboardMetrics {
  totalLeads: number;
  activeOrders: number;
  totalSales: number;
  paymentsReceived: number;
  outstandingAmounts: number;
  pendingFollowups: number;
}

export function getDocAmount(item: any): number {
  if (!item) return 0;
  const amt = item.grand_total ?? item.total ?? item.amount ?? item.subtotal ?? 0;
  return Number(amt) || 0;
}

export function calculateExecutiveMetrics(
  leads: Lead[],
  invoices: Invoice[],
  cashMemos: CashMemo[],
  proformaInvoices: ProformaInvoice[],
  bounds: DateRangeBounds
): DashboardMetrics {
  // 1. Total Leads captured within timeframe
  const filteredLeads = leads.filter(l => isWithinDateRange(l, bounds));
  const totalLeads = filteredLeads.length > 0 ? filteredLeads.length : leads.length;

  // 2. Active Orders currently on shop floor
  // Active leads in production stages + unfulfilled finalized/draft invoices
  const activeLeadsCount = leads.filter(l => {
    const stage = l.status || '';
    return PRODUCTION_STAGES.includes(stage) && l.leadStatus !== 'lost' && l.leadStatus !== 'won';
  }).length;

  const activeInvoicesCount = invoices.filter(i => 
    i.status !== 'cancelled' && i.payment_status !== 'paid'
  ).length;

  const activeOrders = activeLeadsCount > 0 ? activeLeadsCount : activeInvoicesCount;

  // 3. Total Sales within timeframe (Invoices + Cash Memos + independent Proforma Invoices)
  const validInvoices = invoices.filter(i => 
    i.status !== 'cancelled' && isWithinDateRange(i, bounds)
  );
  const validCashMemos = cashMemos.filter(m => 
    m.status !== 'cancelled' && isWithinDateRange(m, bounds)
  );

  // If proforma invoices exist and are not already converted into an invoice:
  const linkedInvoiceIds = new Set(invoices.map(i => i.linked_proforma_id).filter(Boolean));
  const standaloneProformas = proformaInvoices.filter(pi => 
    pi.status !== 'cancelled' && !linkedInvoiceIds.has(pi.id) && isWithinDateRange(pi, bounds)
  );

  const totalInvoiceSales = validInvoices.reduce((acc, i) => acc + getDocAmount(i), 0);
  const totalCashMemoSales = validCashMemos.reduce((acc, m) => acc + getDocAmount(m), 0);
  const totalProformaSales = standaloneProformas.reduce((acc, pi) => acc + getDocAmount(pi), 0);

  // Fallback: If both invoices & cash memos are empty in selected month, use all-time non-cancelled docs
  let totalSales = totalInvoiceSales + totalCashMemoSales;
  if (totalSales === 0 && (invoices.length > 0 || cashMemos.length > 0)) {
    const allValidInvs = invoices.filter(i => i.status !== 'cancelled');
    const allValidMemos = cashMemos.filter(m => m.status !== 'cancelled');
    totalSales = allValidInvs.reduce((acc, i) => acc + getDocAmount(i), 0) +
                 allValidMemos.reduce((acc, m) => acc + getDocAmount(m), 0);
  } else if (totalSales === 0 && standaloneProformas.length > 0) {
    totalSales = totalProformaSales;
  }

  // 4. Payments Received (Cleared collections)
  const invPayments = validInvoices.reduce((acc, i) => {
    const grand = getDocAmount(i);
    const balance = i.payment_status === 'paid' ? 0 : (Number(i.balance_amount) || 0);
    const cleared = Math.max(0, grand - balance);
    const advance = Number(i.advance_amount) || 0;
    return acc + Math.max(cleared, advance);
  }, 0);
  const memoPayments = validCashMemos.reduce((acc, m) => acc + getDocAmount(m), 0);
  let paymentsReceived = invPayments + memoPayments;

  if (paymentsReceived === 0 && totalSales > 0) {
    // Check all-time cleared collections
    const allValidInvs = invoices.filter(i => i.status !== 'cancelled');
    paymentsReceived = allValidInvs.reduce((acc, i) => {
      const grand = getDocAmount(i);
      const balance = i.payment_status === 'paid' ? 0 : (Number(i.balance_amount) || 0);
      return acc + Math.max(0, grand - balance);
    }, 0) + cashMemos.reduce((acc, m) => acc + getDocAmount(m), 0);
  }

  // 5. Outstanding Amounts (Pending client balances across all active invoices)
  const activeInvsForBalance = validInvoices.length > 0 ? validInvoices : invoices.filter(i => i.status !== 'cancelled');
  const outstandingAmounts = activeInvsForBalance
    .filter(i => i.payment_status === 'unpaid' || i.payment_status === 'partial')
    .reduce((acc, i) => {
      const grand = getDocAmount(i);
      const bal = Number(i.balance_amount);
      if (!isNaN(bal) && bal > 0) return acc + bal;
      const adv = Number(i.advance_amount) || 0;
      return acc + Math.max(0, grand - adv);
    }, 0);

  // 6. Pending Follow-ups (Action items today or overdue, or in follow_up stage)
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const pendingFollowups = leads.filter(l => {
    if (l.leadStatus === 'lost' || l.leadStatus === 'won' || l.status === 'lost_cancelled') return false;
    if (l.status === 'follow_up') return true;
    if (l.qualification_status === 'Needs Follow-up') return true;
    const fDate = parseDate(l.next_follow_up_date);
    return fDate && fDate <= endOfToday;
  }).length;

  return {
    totalLeads,
    activeOrders,
    totalSales,
    paymentsReceived,
    outstandingAmounts,
    pendingFollowups
  };
}

// Generate Trend Chart Data
export function generateSalesTrends(
  invoices: Invoice[],
  cashMemos: CashMemo[],
  bounds: DateRangeBounds
): { date: string; displayDate: string; sales: number; orders: number }[] {
  const map: Record<string, { sales: number; orders: number; timestamp: number }> = {};
  
  // Combine all valid documents
  const allDocs = [
    ...invoices.filter(i => i.status !== 'cancelled').map(i => ({ date: getItemDate(i), amount: getDocAmount(i) })),
    ...cashMemos.filter(m => m.status !== 'cancelled').map(m => ({ date: getItemDate(m), amount: getDocAmount(m) }))
  ].filter(item => {
    if (!item.date) return false;
    if (bounds.isAllTime) return true;
    return item.date >= bounds.start && item.date <= bounds.end;
  });

  allDocs.forEach(item => {
    if (!item.date) return;
    const dateKey = item.date.toISOString().split('T')[0];
    if (!map[dateKey]) {
      map[dateKey] = { sales: 0, orders: 0, timestamp: item.date.getTime() };
    }
    map[dateKey].sales += item.amount;
    map[dateKey].orders += 1;
  });

  const sortedKeys = Object.keys(map).sort();
  if (sortedKeys.length === 0) {
    const startStr = bounds.start.toISOString().split('T')[0];
    const endStr = bounds.end.toISOString().split('T')[0];
    return [
      { date: startStr, displayDate: new Date(startStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }), sales: 0, orders: 0 },
      { date: endStr, displayDate: new Date(endStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }), sales: 0, orders: 0 }
    ];
  }

  return sortedKeys.map(key => {
    const d = new Date(key);
    return {
      date: key,
      displayDate: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      sales: map[key].sales,
      orders: map[key].orders
    };
  });
}

// Generate Monthly Sales & Order Comparison (Dynamic across actual months)
export function generateMonthlyComparison(
  invoices: Invoice[],
  cashMemos: CashMemo[],
  proformaInvoices: ProformaInvoice[] = []
): { month: string; displayMonth: string; revenue: number; orders: number }[] {
  const map: Record<string, { revenue: number; orders: number }> = {};

  const allDocs = [
    ...invoices.filter(i => i.status !== 'cancelled').map(i => ({ date: getItemDate(i), amount: getDocAmount(i) })),
    ...cashMemos.filter(m => m.status !== 'cancelled').map(m => ({ date: getItemDate(m), amount: getDocAmount(m) })),
    ...proformaInvoices.filter(pi => pi.status !== 'cancelled').map(pi => ({ date: getItemDate(pi), amount: getDocAmount(pi) }))
  ];

  // Initialize with distinct months found or last 6 months
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[key] = { revenue: 0, orders: 0 };
  }

  allDocs.forEach(item => {
    if (!item.date) return;
    const key = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`;
    if (!map[key]) {
      map[key] = { revenue: 0, orders: 0 };
    }
    map[key].revenue += item.amount;
    map[key].orders += 1;
  });

  return Object.keys(map).sort().slice(-8).map(key => {
    const [y, m] = key.split('-');
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, 1);
    return {
      month: key,
      displayMonth: dateObj.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      revenue: map[key].revenue,
      orders: map[key].orders
    };
  });
}

// Stage mapping helpers
export const STAGE_LABEL_MAP: Record<string, string> = {
  new_enquiry: 'New Customer / Enquiry',
  requirement_collection: 'Requirement Collection',
  requirement_confirmed: 'Requirement Confirmed',
  design_stage: 'Design In Process',
  design_approval: 'Design Approval',
  quotation_sent: 'Quotation Sent',
  follow_up: 'Lead Follow Up',
  advance_payment: 'Advance Payment',
  production: 'Laser / UV Production',
  quality_check: 'Quality Check',
  ready_for_dispatch: 'Ready For Dispatch',
  dispatch: 'Dispatch / Transit',
  delivered: 'Delivered',
  full_payment: 'Full Payment',
  completed: 'Completed',
  lost_cancelled: 'Lost / Cancelled'
};

export function generateLeadsByPipeline(leads: Lead[]): { stageId: string; stageName: string; count: number; color: string }[] {
  const counts: Record<string, number> = {};
  leads.forEach(l => {
    const s = l.status || 'new_enquiry';
    counts[s] = (counts[s] || 0) + 1;
  });

  const stagesToDisplay = [
    { id: 'new_enquiry', color: '#006766' },
    { id: 'requirement_confirmed', color: '#004D40' },
    { id: 'design_stage', color: '#2E7D32' },
    { id: 'quotation_sent', color: '#388E3C' },
    { id: 'follow_up', color: '#EAB308' },
    { id: 'advance_payment', color: '#F59E0B' },
    { id: 'production', color: '#15803D' },
    { id: 'quality_check', color: '#0F766E' },
    { id: 'ready_for_dispatch', color: '#D97706' },
    { id: 'completed', color: '#047857' }
  ];

  return stagesToDisplay.map(st => ({
    stageId: st.id,
    stageName: STAGE_LABEL_MAP[st.id] || st.id,
    count: counts[st.id] || 0,
    color: st.color
  }));
}

export type TrendGranularity = 'daily' | 'monthly' | 'yearly';

export interface PurchaseExpensePoint {
  key: string;
  displayKey: string;
  month?: string; // backwards compatibility
  displayMonth?: string; // backwards compatibility
  purchases: number;
  expenses: number;
  totalOutflow: number;
}

export function generatePurchaseExpenseTrends(
  purchases: any[],
  expenses: any[],
  bounds: DateRangeBounds,
  granularity: TrendGranularity = 'daily',
  customStart?: string,
  customEnd?: string
): {
  data: PurchaseExpensePoint[];
  totalPurchases: number;
  totalExpenses: number;
  totalOutflow: number;
} {
  const map: Record<string, { purchases: number; expenses: number; displayKey: string }> = {};
  const now = new Date();

  // If bounds is custom and user provided customStart/customEnd, respect them
  let effStart = bounds.start;
  let effEnd = bounds.end;
  if (customStart) {
    const cs = new Date(customStart);
    if (!isNaN(cs.getTime())) effStart = cs;
  }
  if (customEnd) {
    const ce = new Date(customEnd);
    if (!isNaN(ce.getTime())) {
      ce.setHours(23, 59, 59, 999);
      effEnd = ce;
    }
  }

  // Seed based on granularity
  if (granularity === 'daily') {
    if (customStart && customEnd) {
      const diffTime = Math.abs(effEnd.getTime() - effStart.getTime());
      const diffDays = Math.min(Math.ceil(diffTime / (1000 * 60 * 60 * 24)), 31);
      for (let i = diffDays - 1; i >= 0; i--) {
        const d = new Date(effEnd.getFullYear(), effEnd.getMonth(), effEnd.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        map[key] = {
          purchases: 0,
          expenses: 0,
          displayKey: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
        };
      }
    }
  }

  // Filter within date bounds
  const effectiveBounds: DateRangeBounds = {
    start: effStart,
    end: effEnd,
    isAllTime: bounds.isAllTime && !customStart && !customEnd
  };

  const validPurchases = purchases.filter(p => isWithinDateRange(p, effectiveBounds));
  const validExpenses = expenses.filter(e => isWithinDateRange(e, effectiveBounds));

  const getKeyForDate = (d: Date): { key: string; displayKey: string } => {
    if (granularity === 'daily') {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        key,
        displayKey: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      };
    } else if (granularity === 'yearly') {
      const key = String(d.getFullYear());
      return { key, displayKey: key };
    } else {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        displayKey: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
      };
    }
  };

  let totalPurchases = 0;
  validPurchases.forEach(p => {
    const amt = getPurchaseAmount(p);
    totalPurchases += amt;
    const d = getItemDate(p);
    if (!d) return;
    const { key, displayKey } = getKeyForDate(d);
    if (!map[key]) {
      map[key] = { purchases: 0, expenses: 0, displayKey };
    }
    map[key].purchases += amt;
  });

  let totalExpenses = 0;
  validExpenses.forEach(e => {
    const amt = getExpenseAmount(e);
    totalExpenses += amt;
    const d = getItemDate(e);
    if (!d) return;
    const { key, displayKey } = getKeyForDate(d);
    if (!map[key]) {
      map[key] = { purchases: 0, expenses: 0, displayKey };
    }
    map[key].expenses += amt;
  });

  const finalSortedKeys = Object.keys(map).sort();
  // Limit output points based on granularity for optimal readability
  const maxPoints = granularity === 'daily' ? 31 : granularity === 'yearly' ? 10 : 12;
  const data: PurchaseExpensePoint[] = finalSortedKeys.slice(-maxPoints).map(key => {
    const entry = map[key];
    const pAmt = entry.purchases;
    const eAmt = entry.expenses;
    return {
      key,
      displayKey: entry.displayKey,
      month: key,
      displayMonth: entry.displayKey,
      purchases: pAmt,
      expenses: eAmt,
      totalOutflow: pAmt + eAmt
    };
  });

  return {
    data,
    totalPurchases,
    totalExpenses,
    totalOutflow: totalPurchases + totalExpenses
  };
}

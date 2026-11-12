import type { StatementUploadLog } from '../types';

export type BillKind = 'purchase' | 'expense' | 'invoice';
export type BillPaymentStatus = 'Paid' | 'Partial' | 'Unpaid';

export interface LinkedTransactionSummary {
  id: string;
  bank_transaction_id: string;
  date: Date | null;
  dateStr: string;
  description: string;
  reference_number: string;
  amount: number;
  type: 'credit' | 'debit';
}

export interface ReconciledBill {
  id: string;
  kind: BillKind;
  billNumber: string;
  billDate: Date | null;
  billDateStr: string;
  monthKey: string;
  partyName: string;
  purposeOrNotes?: string;
  totalAmount: number;
  basePaidAmount: number;
  bankPaidAmount: number;
  amountPaidOrReceived: number;
  outstandingBalance: number;
  paymentStatus: BillPaymentStatus;
  linkedTransactions: LinkedTransactionSummary[];
  rawRecord: any;
}

export interface NormalizedTransaction {
  id: string;
  bank_transaction_id: string;
  date: Date | null;
  dateStr: string;
  monthKey: string;
  amount: number;
  description: string;
  reference_number: string;
  type: 'credit' | 'debit';
  match_status: 'matched' | 'unmatched' | 'pending_review' | 'approved_advance' | 'approved_expense' | 'ignored';
  matched_id?: string;
  matched_entity_type?: BillKind;
  matched_amount?: number;
  category?: string;
  confidence_score?: number;
  match_explanation?: string;
  metadata?: {
    suggested_doc_id?: string;
    suggested_doc_type?: BillKind;
    suggestion_reason?: string;
  };
  rawRecord: any;
}

export interface StatementCoverageResult {
  monthKey: string;
  monthLabel: string;
  isCovered: boolean;
  status: 'covered' | 'partial' | 'missing';
  coveragePercent: number;
  coveredDays: number;
  totalDaysInMonth: number;
  matchingLogs: StatementUploadLog[];
  missingMessage: string | null;
}

export interface AutoMatchProposal {
  transactionId: string;
  billId: string;
  billKind: BillKind;
  billNumber: string;
  matchAmount: number;
  confidence: number;
  reason: string;
}

export interface SuggestionProposal {
  transactionId: string;
  billId: string;
  billKind: BillKind;
  confidence: number;
  reason: string;
}

export interface SectionReportSummary {
  count: number;
  totalAmount: number;
  paidOrReceivedAmount: number;
  outstandingBalance: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
}

export interface MonthlyReconciliationReportData {
  monthKey: string;
  monthLabel: string;
  year: number;
  month: number;
  coverage: StatementCoverageResult;
  purchaseBills: ReconciledBill[];
  expenseBills: ReconciledBill[];
  salesInvoices: ReconciledBill[];
  purchaseSummary: SectionReportSummary;
  expenseSummary: SectionReportSummary;
  invoiceSummary: SectionReportSummary;
}

export interface ReconciliationSettings {
  recipientEmail: string;
  reportDeliveryDay: number; // 1..28
  statementReminderDay: number; // 1..28
  updatedAt?: any;
  updatedBy?: string;
}

export const DEFAULT_RECONCILIATION_SETTINGS: ReconciliationSettings = {
  recipientEmail: '',
  reportDeliveryDay: 7,
  statementReminderDay: 5,
};

export function round2(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

export function parseAnyDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  if (typeof val?.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    // Check YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]) - 1;
      const d = Number(isoMatch[3]);
      const parsed = new Date(y, m, d, 12, 0, 0);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    // Check DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      const d = Number(dmyMatch[1]);
      const m = Number(dmyMatch[2]) - 1;
      const y = Number(dmyMatch[3]);
      const parsed = new Date(y, m, d, 12, 0, 0);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    const fallback = new Date(trimmed);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  return null;
}

export function toMonthKey(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function makeMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function formatMonthLabel(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function formatDateShort(date: Date | null): string {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function computePaymentStatus(totalAmount: number, paidAmount: number): BillPaymentStatus {
  const total = round2(totalAmount);
  const paid = round2(paidAmount);
  if (total <= 0) return paid > 0 ? 'Paid' : 'Unpaid';
  const balance = round2(Math.max(0, total - paid));
  if (balance <= 0.01) return 'Paid';
  if (paid > 0.01) return 'Partial';
  return 'Unpaid';
}

export function normalizeTransaction(raw: any): NormalizedTransaction {
  const dateObj = parseAnyDate(raw.date || raw.created_at);
  const rawStatus = raw.match_status || 'pending_review';
  const matchedId = raw.matched_id || raw.linked_document_id || undefined;
  let matchedType: BillKind | undefined = raw.matched_entity_type;
  if (!matchedType && raw.linked_document_type) {
    if (raw.linked_document_type === 'invoice' || raw.linked_document_type === 'purchase' || raw.linked_document_type === 'expense') {
      matchedType = raw.linked_document_type;
    }
  }

  return {
    id: raw.id,
    bank_transaction_id: raw.bank_transaction_id || raw.id,
    date: dateObj,
    dateStr: formatDateShort(dateObj),
    monthKey: toMonthKey(dateObj),
    amount: round2(Number(raw.amount || 0)),
    description: raw.description || '',
    reference_number: raw.reference_number || raw.reference || '',
    type: raw.type === 'debit' ? 'debit' : 'credit',
    match_status: rawStatus,
    matched_id: matchedId,
    matched_entity_type: matchedType,
    matched_amount: raw.matched_amount !== undefined ? round2(Number(raw.matched_amount)) : undefined,
    category: raw.category,
    confidence_score: raw.confidence_score,
    match_explanation: raw.match_explanation,
    metadata: raw.metadata,
    rawRecord: raw,
  };
}

export function buildReconciledBills(
  purchasesRaw: any[],
  expensesRaw: any[],
  invoicesRaw: any[],
  transactions: NormalizedTransaction[]
): {
  purchaseBills: ReconciledBill[];
  expenseBills: ReconciledBill[];
  salesInvoices: ReconciledBill[];
} {
  // Index matched transactions by `${kind}:${billId}`
  const txnsByBill = new Map<string, LinkedTransactionSummary[]>();

  for (const tx of transactions) {
    if (tx.match_status === 'matched' && tx.matched_id) {
      const inferredKind: BillKind =
        tx.matched_entity_type || (tx.type === 'credit' ? 'invoice' : 'purchase');
      const key = `${inferredKind}:${tx.matched_id}`;
      const list = txnsByBill.get(key) || [];
      list.push({
        id: tx.id,
        bank_transaction_id: tx.bank_transaction_id,
        date: tx.date,
        dateStr: tx.dateStr,
        description: tx.description,
        reference_number: tx.reference_number,
        amount: tx.matched_amount !== undefined ? tx.matched_amount : tx.amount,
        type: tx.type,
      });
      txnsByBill.set(key, list);
    }
  }

  // 1. Purchase Bills (strictly from `purchases` collection)
  const purchaseBills: ReconciledBill[] = purchasesRaw.map((p) => {
    const billDate = parseAnyDate(p.invoice?.invoice_date || p.date || p.createdAt || p.created_at);
    const totalAmount = round2(Number(p.grandTotal ?? p.amount ?? 0));
    const linked = txnsByBill.get(`purchase:${p.id}`) || [];
    const bankPaidAmount = round2(linked.reduce((sum, t) => sum + t.amount, 0));

    let basePaidAmount = 0;
    if (p.reconciled_bank_amount !== undefined) {
      basePaidAmount = round2(Number(p.manual_paid_amount || 0));
    } else if (p.paid_amount !== undefined) {
      basePaidAmount = round2(Number(p.paid_amount || 0));
    } else if (linked.length === 0 && (p.status === 'cleared' || p.payment_status === 'paid')) {
      basePaidAmount = totalAmount;
    }

    const amountPaidOrReceived = round2(basePaidAmount + bankPaidAmount);
    const outstandingBalance = round2(Math.max(0, totalAmount - amountPaidOrReceived));
    const paymentStatus = computePaymentStatus(totalAmount, amountPaidOrReceived);

    return {
      id: p.id,
      kind: 'purchase',
      billNumber: p.invoice?.invoice_number || p.reference || p.id.slice(0, 8),
      billDate,
      billDateStr: formatDateShort(billDate),
      monthKey: toMonthKey(billDate),
      partyName: (typeof p.vendor === 'string' ? p.vendor : p.vendor?.name) || 'Unknown Vendor',
      purposeOrNotes: p.category || '',
      totalAmount,
      basePaidAmount,
      bankPaidAmount,
      amountPaidOrReceived,
      outstandingBalance,
      paymentStatus,
      linkedTransactions: linked,
      rawRecord: p,
    };
  });

  // 2. Expense Bills (strictly from `expenses` collection)
  const expenseBills: ReconciledBill[] = expensesRaw.map((e) => {
    const billDate = parseAnyDate(e.date || e.created_at);
    const totalAmount = round2(Number(e.requested || e.paid || e.amount || 0));
    const linked = txnsByBill.get(`expense:${e.id}`) || [];
    const bankPaidAmount = round2(linked.reduce((sum, t) => sum + t.amount, 0));

    let basePaidAmount = 0;
    if (e.reconciled_bank_amount !== undefined) {
      basePaidAmount = round2(Number(e.manual_paid_amount || 0));
    } else if (linked.length > 0) {
      basePaidAmount = round2(Number(e.manual_paid_amount ?? 0));
    } else {
      basePaidAmount = round2(Number(e.paid || 0));
    }

    const amountPaidOrReceived = round2(basePaidAmount + bankPaidAmount);
    const outstandingBalance = round2(Math.max(0, totalAmount - amountPaidOrReceived));
    const paymentStatus = computePaymentStatus(totalAmount, amountPaidOrReceived);

    return {
      id: e.id,
      kind: 'expense',
      billNumber: e.billNo || `EXP-${e.id.slice(0, 6).toUpperCase()}`,
      billDate,
      billDateStr: formatDateShort(billDate),
      monthKey: toMonthKey(billDate),
      partyName: e.member || e.vendor || 'Expense Entry',
      purposeOrNotes: e.purpose || e.notes || '',
      totalAmount,
      basePaidAmount,
      bankPaidAmount,
      amountPaidOrReceived,
      outstandingBalance,
      paymentStatus,
      linkedTransactions: linked,
      rawRecord: e,
    };
  });

  // 3. Sales Invoices (strictly from `invoices` collection, excluding cancelled)
  const salesInvoices: ReconciledBill[] = invoicesRaw
    .filter((inv) => inv.status !== 'cancelled')
    .map((inv) => {
      const billDate = parseAnyDate(inv.custom_date || inv.created_at);
      const totalAmount = round2(Number(inv.grand_total || 0));
      const linked = txnsByBill.get(`invoice:${inv.id}`) || [];
      const bankPaidAmount = round2(linked.reduce((sum, t) => sum + t.amount, 0));

      let basePaidAmount = 0;
      if (inv.reconciled_bank_amount !== undefined) {
        basePaidAmount = round2(Number(inv.manual_paid_amount || 0));
      } else if (linked.length > 0) {
        // Legacy protection: avoid counting an un-split balance_amount if old matchTransaction set payment_status='paid'
        basePaidAmount = round2(Number(inv.advance_amount || 0));
      } else if (inv.balance_amount !== undefined) {
        basePaidAmount = round2(Math.max(0, totalAmount - Number(inv.balance_amount)));
      } else {
        basePaidAmount = round2(Number(inv.advance_amount || 0));
      }

      const amountPaidOrReceived = round2(basePaidAmount + bankPaidAmount);
      const outstandingBalance = round2(Math.max(0, totalAmount - amountPaidOrReceived));
      const paymentStatus = computePaymentStatus(totalAmount, amountPaidOrReceived);

      return {
        id: inv.id,
        kind: 'invoice',
        billNumber: inv.number || inv.id.slice(0, 8),
        billDate,
        billDateStr: formatDateShort(billDate),
        monthKey: toMonthKey(billDate),
        partyName: inv.customer_name || 'Customer',
        purposeOrNotes: '',
        totalAmount,
        basePaidAmount,
        bankPaidAmount,
        amountPaidOrReceived,
        outstandingBalance,
        paymentStatus,
        linkedTransactions: linked,
        rawRecord: inv,
      };
    });

  return { purchaseBills, expenseBills, salesInvoices };
}

/**
 * Checks whether uploaded statements cover the specified year & month.
 * Evaluates explicit month tags (`statement_month`, `covered_months`) and date-range interval coverage.
 */
export function checkMonthlyStatementCoverage(
  logs: any[],
  year: number,
  month: number
): StatementCoverageResult {
  const monthKey = makeMonthKey(year, month);
  const monthLabel = formatMonthLabel(year, month);
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = new Date(year, month - 1, totalDaysInMonth, 23, 59, 59, 999);

  const matchingLogs: StatementUploadLog[] = [];
  let explicitlyCovered = false;
  const coveredDaySet = new Set<number>();

  for (const log of logs) {
    const start = parseAnyDate(log.start_date);
    const end = parseAnyDate(log.end_date);

    const hasExplicitMonth =
      log.statement_month === monthKey ||
      (Array.isArray(log.covered_months) && log.covered_months.includes(monthKey));

    let overlaps = false;
    if (start && end) {
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);

      if (startDay.getTime() <= monthEnd.getTime() && endDay.getTime() >= monthStart.getTime()) {
        overlaps = true;
        // Mark every covered calendar day inside this month
        for (let d = 1; d <= totalDaysInMonth; d++) {
          const dayTime = new Date(year, month - 1, d, 12, 0, 0).getTime();
          if (dayTime >= startDay.getTime() && dayTime <= endDay.getTime()) {
            coveredDaySet.add(d);
          }
        }
      }
    }

    if (hasExplicitMonth || overlaps) {
      matchingLogs.push(log);
      if (hasExplicitMonth) {
        explicitlyCovered = true;
      }
    }
  }

  const coveredDays = explicitlyCovered ? totalDaysInMonth : coveredDaySet.size;
  const coveragePercent = Math.min(100, Math.round((coveredDays / totalDaysInMonth) * 100));

  // Consider covered if explicitly covering the month OR >= 80% of calendar days in that month are spanned
  const isCovered = explicitlyCovered || coveragePercent >= 80;
  const status: 'covered' | 'partial' | 'missing' = isCovered
    ? 'covered'
    : matchingLogs.length > 0
    ? 'partial'
    : 'missing';

  return {
    monthKey,
    monthLabel,
    isCovered,
    status,
    coveragePercent,
    coveredDays,
    totalDaysInMonth,
    matchingLogs,
    missingMessage: isCovered
      ? null
      : `Please upload your bank statement for ${monthLabel} to complete bill reconciliation.`,
  };
}

function normalizeMatchText(str: string): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCompactCode(str: string): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Compares unmatched/pending bank transactions against existing bills WITHOUT forcing uncertain matches.
 */
export function evaluateAutomaticMatches(
  transactions: NormalizedTransaction[],
  purchaseBills: ReconciledBill[],
  expenseBills: ReconciledBill[],
  salesInvoices: ReconciledBill[]
): {
  autoMatches: AutoMatchProposal[];
  suggestions: SuggestionProposal[];
} {
  const autoMatches: AutoMatchProposal[] = [];
  const suggestions: SuggestionProposal[] = [];

  // Track mutable remaining balances across the pass so multi-installment matches don't over-allocate
  const remainingBalanceMap = new Map<string, number>();
  [...purchaseBills, ...expenseBills, ...salesInvoices].forEach((b) => {
    remainingBalanceMap.set(`${b.kind}:${b.id}`, b.outstandingBalance);
  });

  const sortedTxns = [...transactions]
    .filter((tx) => tx.match_status === 'pending_review' || tx.match_status === 'unmatched')
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));

  for (const tx of sortedTxns) {
    if (tx.amount <= 0) continue;

    const candidatesPool: ReconciledBill[] =
      tx.type === 'credit' ? salesInvoices : [...purchaseBills, ...expenseBills];

    const txText = normalizeMatchText(`${tx.description} ${tx.reference_number}`);
    const txCompact = normalizeCompactCode(`${tx.description} ${tx.reference_number}`);

    interface ScoredCandidate {
      bill: ReconciledBill;
      score: number;
      reason: string;
    }

    const scored: ScoredCandidate[] = [];

    for (const bill of candidatesPool) {
      const remBal = remainingBalanceMap.get(`${bill.kind}:${bill.id}`) ?? bill.outstandingBalance;
      if (remBal <= 0.01) continue;

      // Reject if transaction is meaningfully larger than the remaining bill balance
      if (tx.amount > remBal + 1) continue;

      let score = 0;
      const reasons: string[] = [];

      // 1. Bill/Invoice Number exact reference match
      const compactBillNo = normalizeCompactCode(bill.billNumber);
      const hasBillNumberMatch = compactBillNo.length >= 4 && txCompact.includes(compactBillNo);
      if (hasBillNumberMatch) {
        score += 0.6;
        reasons.push(`Bill/Invoice #${bill.billNumber} found in narration/ref`);
      }

      // 2. Party / Customer / Vendor Name match
      const partyTokens = normalizeMatchText(bill.partyName)
        .split(' ')
        .filter((t) => t.length >= 3 && !['ltd', 'pvt', 'inc', 'and', 'the', 'india', 'user'].includes(t));

      let matchedTokens = 0;
      for (const tok of partyTokens) {
        if (txText.includes(tok)) matchedTokens++;
      }
      const hasStrongPartyMatch =
        partyTokens.length > 0 &&
        (matchedTokens === partyTokens.length || (matchedTokens >= 1 && matchedTokens / partyTokens.length >= 0.5));

      if (hasStrongPartyMatch) {
        score += 0.35;
        reasons.push(`Party "${bill.partyName}" matched`);
      } else if (matchedTokens > 0) {
        score += 0.15;
        reasons.push(`Partial name match for "${bill.partyName}"`);
      }

      // 3. Amount Match
      const isExactAmount = Math.abs(tx.amount - remBal) <= 1;
      if (isExactAmount) {
        score += 0.35;
        reasons.push(`Exact balance match (₹${remBal.toLocaleString('en-IN')})`);
      } else if (tx.amount < remBal && (hasBillNumberMatch || hasStrongPartyMatch)) {
        score += 0.15;
        reasons.push(`Partial payment towards ₹${remBal.toLocaleString('en-IN')} balance`);
      }

      // 4. Date Window Check
      if (tx.date && bill.billDate) {
        const diffDays = (tx.date.getTime() - bill.billDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays >= -7 && diffDays <= 90) {
          score += 0.1;
        } else if (diffDays < -14 || diffDays > 180) {
          score -= 0.3;
        }
      }

      // Never allow an anonymous amount-only match without either bill number or strong party name!
      const hasIdentityEvidence = hasBillNumberMatch || hasStrongPartyMatch;
      if (hasIdentityEvidence && score >= 0.5) {
        scored.push({
          bill,
          score: Math.min(1, round2(score)),
          reason: reasons.join(' • '),
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored.length === 0) continue;

    const top = scored[0];
    const second = scored[1];
    const isUnambiguous = !second || top.score - second.score >= 0.2;

    if (top.score >= 0.85 && isUnambiguous) {
      autoMatches.push({
        transactionId: tx.id,
        billId: top.bill.id,
        billKind: top.bill.kind,
        billNumber: top.bill.billNumber,
        matchAmount: tx.amount,
        confidence: top.score,
        reason: top.reason,
      });
      const currentRem = remainingBalanceMap.get(`${top.bill.kind}:${top.bill.id}`) ?? 0;
      remainingBalanceMap.set(`${top.bill.kind}:${top.bill.id}`, round2(Math.max(0, currentRem - tx.amount)));
    } else {
      // Uncertain / ambiguous: record suggestion only, NEVER force a match
      suggestions.push({
        transactionId: tx.id,
        billId: top.bill.id,
        billKind: top.bill.kind,
        confidence: top.score,
        reason: !isUnambiguous
          ? `Multiple potential bill matches found; manual verification required (${top.reason})`
          : top.reason,
      });
    }
  }

  return { autoMatches, suggestions };
}

export function summarizeBills(bills: ReconciledBill[]): SectionReportSummary {
  return bills.reduce<SectionReportSummary>(
    (acc, b) => {
      acc.count += 1;
      acc.totalAmount = round2(acc.totalAmount + b.totalAmount);
      acc.paidOrReceivedAmount = round2(acc.paidOrReceivedAmount + b.amountPaidOrReceived);
      acc.outstandingBalance = round2(acc.outstandingBalance + b.outstandingBalance);
      if (b.paymentStatus === 'Paid') acc.paidCount += 1;
      else if (b.paymentStatus === 'Partial') acc.partialCount += 1;
      else acc.unpaidCount += 1;
      return acc;
    },
    {
      count: 0,
      totalAmount: 0,
      paidOrReceivedAmount: 0,
      outstandingBalance: 0,
      paidCount: 0,
      partialCount: 0,
      unpaidCount: 0,
    }
  );
}

export function buildMonthlyReconciliationReport(
  year: number,
  month: number,
  allPurchases: ReconciledBill[],
  allExpenses: ReconciledBill[],
  allInvoices: ReconciledBill[],
  logs: any[]
): MonthlyReconciliationReportData {
  const monthKey = makeMonthKey(year, month);
  const monthLabel = formatMonthLabel(year, month);
  const coverage = checkMonthlyStatementCoverage(logs, year, month);

  const purchaseBills = allPurchases.filter((b) => b.monthKey === monthKey);
  const expenseBills = allExpenses.filter((b) => b.monthKey === monthKey);
  const salesInvoices = allInvoices.filter((b) => b.monthKey === monthKey);

  return {
    monthKey,
    monthLabel,
    year,
    month,
    coverage,
    purchaseBills,
    expenseBills,
    salesInvoices,
    purchaseSummary: summarizeBills(purchaseBills),
    expenseSummary: summarizeBills(expenseBills),
    invoiceSummary: summarizeBills(salesInvoices),
  };
}

export function renderMonthlyReportEmailHtml(
  report: MonthlyReconciliationReportData,
  companyName = 'EcoTrophy Innovations'
): { subject: string; html: string; text: string } {
  const fmt = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const renderSectionHtml = (title: string, partyCol: string, paidCol: string, bills: ReconciledBill[], summary: SectionReportSummary) => {
    const rowsHtml =
      bills.length === 0
        ? `<tr><td colspan="7" style="padding:12px;text-align:center;color:#607C7B;">No ${title.toLowerCase()} recorded for ${report.monthLabel}.</td></tr>`
        : bills
            .map(
              (b) => `
          <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #e5ded3;font-weight:600;color:#004D40;">${b.billNumber}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5ded3;color:#607C7B;">${b.billDateStr}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5ded3;color:#004D40;">${b.partyName}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5ded3;text-align:right;font-weight:600;">${fmt(b.totalAmount)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5ded3;text-align:right;color:#006766;font-weight:600;">${fmt(b.amountPaidOrReceived)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5ded3;text-align:right;color:#894C2D;font-weight:600;">${fmt(b.outstandingBalance)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5ded3;text-align:center;font-weight:700;">${b.paymentStatus}</td>
          </tr>`
            )
            .join('');

    return `
      <div style="margin-top:24px;">
        <h2 style="color:#004D40;font-size:16px;border-bottom:2px solid #006766;padding-bottom:6px;margin-bottom:10px;">
          ${title} (${summary.count} records)
        </h2>
        <p style="font-size:12px;color:#607C7B;margin:0 0 10px 0;">
          Total: <strong>${fmt(summary.totalAmount)}</strong> | ${paidCol}: <strong>${fmt(summary.paidOrReceivedAmount)}</strong> | Outstanding: <strong>${fmt(summary.outstandingBalance)}</strong> | Paid: ${summary.paidCount}, Partial: ${summary.partialCount}, Unpaid: ${summary.unpaidCount}
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:#ffffff;">
          <thead>
            <tr style="background:#F3E9DD;color:#004D40;text-align:left;">
              <th style="padding:8px 10px;">Bill / Inv #</th>
              <th style="padding:8px 10px;">Date</th>
              <th style="padding:8px 10px;">${partyCol}</th>
              <th style="padding:8px 10px;text-align:right;">Bill Total</th>
              <th style="padding:8px 10px;text-align:right;">${paidCol}</th>
              <th style="padding:8px 10px;text-align:right;">Outstanding</th>
              <th style="padding:8px 10px;text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  };

  const subject = `[${companyName}] Monthly Bank Reconciliation Report — ${report.monthLabel}`;

  const html = `
    <div style="font-family:Manrope,Arial,sans-serif;max-width:860px;margin:0 auto;padding:24px;background:#F3E9DD;color:#004D40;">
      <div style="background:#ffffff;padding:24px;border-radius:14px;">
        <h1 style="margin:0;font-size:20px;color:#006766;">${companyName}</h1>
        <p style="margin:4px 0 0 0;font-size:14px;color:#607C7B;">Monthly Bank Reconciliation Report — <strong>${report.monthLabel}</strong></p>

        ${renderSectionHtml('Purchase Bills', 'Vendor', 'Amount Paid', report.purchaseBills, report.purchaseSummary)}
        ${renderSectionHtml('Expense Bills', 'Payee / Member', 'Amount Paid', report.expenseBills, report.expenseSummary)}
        ${renderSectionHtml('Sales Invoices', 'Customer', 'Amount Received', report.salesInvoices, report.invoiceSummary)}

        <p style="margin-top:24px;font-size:11px;color:#607C7B;">
          Generated automatically by EcoBill Bank Reconciliation. Statement Coverage: ${report.coverage.coveragePercent}% (${report.coverage.status.toUpperCase()}).
        </p>
      </div>
    </div>
  `;

  const renderSectionText = (title: string, paidCol: string, bills: ReconciledBill[], summary: SectionReportSummary) => {
    const lines = bills.map(
      (b) => `  - ${b.billNumber} | ${b.billDateStr} | ${b.partyName} | Total: ${fmt(b.totalAmount)} | ${paidCol}: ${fmt(b.amountPaidOrReceived)} | Balance: ${fmt(b.outstandingBalance)} | ${b.paymentStatus}`
    );
    return `${title} (${summary.count})\n  Total: ${fmt(summary.totalAmount)} | ${paidCol}: ${fmt(summary.paidOrReceivedAmount)} | Outstanding: ${fmt(summary.outstandingBalance)}\n${lines.join('\n') || '  (None)'}`;
  };

  const text = `${companyName} - Monthly Bank Reconciliation Report (${report.monthLabel})\n\n${renderSectionText(
    'PURCHASE BILLS',
    'Paid',
    report.purchaseBills,
    report.purchaseSummary
  )}\n\n${renderSectionText('EXPENSE BILLS', 'Paid', report.expenseBills, report.expenseSummary)}\n\n${renderSectionText(
    'SALES INVOICES',
    'Received',
    report.salesInvoices,
    report.invoiceSummary
  )}`;

  return { subject, html, text };
}


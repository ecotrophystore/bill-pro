import { useEffect, useMemo, useState, useRef } from 'react';
import {
  CheckCircle2,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  Upload,
  Download,
  ChevronDown,
  Settings as SettingsIcon,
  Mail,
  Link2,
  Unlink,
  FileText,
  Receipt,
  Wallet,
  Calendar,
  X,
  Trash2,
  RefreshCw,
  ShoppingCart
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  getDocs,
  doc,
  deleteDoc
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useSettings } from '../contexts/SettingsContext';
import StatementUploadModal, { type StatementUploadResult } from '../components/Reconciliation/StatementUploadModal';
import {
  type NormalizedTransaction,
  type ReconciledBill,
  type ReconciliationSettings,
  DEFAULT_RECONCILIATION_SETTINGS,
  normalizeTransaction,
  buildReconciledBills,
  buildMonthlyReconciliationReport,
  checkMonthlyStatementCoverage,
  makeMonthKey,
  formatMonthLabel,
  renderMonthlyReportEmailHtml
} from '../utils/reconciliationEngine';
import {
  applyBillMatch,
  unlinkTransactionMatch,
  runAutoReconciliationPass,
  syncMissingStatementReminder,
  saveReconciliationSettings,
  dispatchMonthlyReportEmail
} from '../services/reconciliationService';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const formatINR = (val: number) =>
  (Number(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Reconciliation() {
  const { settings: companySettings } = useSettings();

  // Month & Year selection (default to current month/year)
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  // Raw Firestore streams
  const [rawTransactions, setRawTransactions] = useState<any[]>([]);
  const [rawPurchases, setRawPurchases] = useState<any[]>([]);
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);
  const [rawInvoices, setRawInvoices] = useState<any[]>([]);
  const [statementLogs, setStatementLogs] = useState<any[]>([]);
  const [reconSettings, setReconSettings] = useState<ReconciliationSettings>(DEFAULT_RECONCILIATION_SETTINGS);
  const [reportLogs, setReportLogs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // UI filters & modals
  const [txScope, setTxScope] = useState<'month' | 'all'>('month');
  const [txStatusFilter, setTxStatusFilter] = useState<'all' | 'unmatched' | 'matched'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [linkingTx, setLinkingTx] = useState<NormalizedTransaction | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [emailPreviewModal, setEmailPreviewModal] = useState<{ subject: string; html: string } | null>(null);

  // Settings form state
  const [formEmail, setFormEmail] = useState('');
  const [formDeliveryDay, setFormDeliveryDay] = useState(7);
  const [formReminderDay, setFormReminderDay] = useState(5);
  const [savingSettings, setSavingSettings] = useState(false);

  const autoEmailTriggeredRef = useRef<Set<string>>(new Set());

  // Subscribe to all required Firestore collections
  useEffect(() => {
    if (!db) return;

    let loadedFlags = { tx: false, pur: false, exp: false, inv: false };
    const markLoaded = (k: keyof typeof loadedFlags) => {
      loadedFlags[k] = true;
      if (Object.values(loadedFlags).every(Boolean)) setLoading(false);
    };

    const unsubTx = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        setRawTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markLoaded('tx');
      },
      () => markLoaded('tx')
    );

    const unsubPur = onSnapshot(
      collection(db, 'purchases'),
      (snap) => {
        setRawPurchases(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markLoaded('pur');
      },
      () => markLoaded('pur')
    );

    const unsubExp = onSnapshot(
      collection(db, 'expenses'),
      (snap) => {
        setRawExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markLoaded('exp');
      },
      () => markLoaded('exp')
    );

    const unsubInv = onSnapshot(
      collection(db, 'invoices'),
      (snap) => {
        setRawInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markLoaded('inv');
      },
      () => markLoaded('inv')
    );

    const unsubLogs = onSnapshot(collection(db, 'statement_logs'), (snap) => {
      setStatementLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubSettings = onSnapshot(doc(db, 'reconciliation_settings', 'default'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as ReconciliationSettings;
        setReconSettings({
          recipientEmail: data.recipientEmail || '',
          reportDeliveryDay: data.reportDeliveryDay || 7,
          statementReminderDay: data.statementReminderDay || 5,
        });
      }
    });

    const unsubReportLogs = onSnapshot(collection(db, 'reconciliation_report_logs'), (snap) => {
      const map: Record<string, any> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setReportLogs(map);
    });

    return () => {
      unsubTx();
      unsubPur();
      unsubExp();
      unsubInv();
      unsubLogs();
      unsubSettings();
      unsubReportLogs();
    };
  }, []);

  // Normalize transactions & reconcile against actual bills
  const transactions = useMemo(() => {
    return rawTransactions
      .map(normalizeTransaction)
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  }, [rawTransactions]);

  const { purchaseBills, expenseBills, salesInvoices } = useMemo(() => {
    return buildReconciledBills(rawPurchases, rawExpenses, rawInvoices, transactions);
  }, [rawPurchases, rawExpenses, rawInvoices, transactions]);

  const allBillsMap = useMemo(() => {
    const map = new Map<string, ReconciledBill>();
    [...purchaseBills, ...expenseBills, ...salesInvoices].forEach((b) => {
      map.set(`${b.kind}:${b.id}`, b);
    });
    return map;
  }, [purchaseBills, expenseBills, salesInvoices]);

  const selectedMonthKey = makeMonthKey(selectedYear, selectedMonth);
  const selectedMonthLabel = formatMonthLabel(selectedYear, selectedMonth);

  const monthlyReport = useMemo(() => {
    return buildMonthlyReconciliationReport(
      selectedYear,
      selectedMonth,
      purchaseBills,
      expenseBills,
      salesInvoices,
      statementLogs
    );
  }, [selectedYear, selectedMonth, purchaseBills, expenseBills, salesInvoices, statementLogs]);

  // Required reporting month check for automated monthly reminder & delivery (typically previous completed month once reminder day arrives)
  const requiredReportPeriod = useMemo(() => {
    const d = new Date();
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return {
      year: prev.getFullYear(),
      month: prev.getMonth() + 1,
      monthKey: makeMonthKey(prev.getFullYear(), prev.getMonth() + 1),
      monthLabel: formatMonthLabel(prev.getFullYear(), prev.getMonth() + 1),
      dayOfMonth: d.getDate(),
    };
  }, []);

  const requiredCoverage = useMemo(() => {
    return checkMonthlyStatementCoverage(statementLogs, requiredReportPeriod.year, requiredReportPeriod.month);
  }, [statementLogs, requiredReportPeriod]);

  // Sync missing statement reminder notification cleanly
  useEffect(() => {
    if (loading) return;

    // 1. Check selected month coverage reminder
    syncMissingStatementReminder(
      selectedMonthKey,
      selectedMonthLabel,
      monthlyReport.coverage.isCovered
    );

    // 2. Check scheduled reminder for previous completed month if today >= statementReminderDay
    if (requiredReportPeriod.dayOfMonth >= reconSettings.statementReminderDay) {
      syncMissingStatementReminder(
        requiredReportPeriod.monthKey,
        requiredReportPeriod.monthLabel,
        requiredCoverage.isCovered
      );
    }
  }, [
    loading,
    selectedMonthKey,
    selectedMonthLabel,
    monthlyReport.coverage.isCovered,
    requiredReportPeriod,
    requiredCoverage.isCovered,
    reconSettings.statementReminderDay,
  ]);

  // Auto-deliver pending or scheduled monthly report once required statement is uploaded
  useEffect(() => {
    if (loading) return;
    if (!reconSettings.recipientEmail) return;

    const tryAutoReport = async (year: number, month: number) => {
      const mKey = makeMonthKey(year, month);
      if (autoEmailTriggeredRef.current.has(mKey)) return;

      const existingLog = reportLogs[mKey];
      if (existingLog?.status === 'sent') return; // Duplicate protection

      const reportData = buildMonthlyReconciliationReport(
        year,
        month,
        purchaseBills,
        expenseBills,
        salesInvoices,
        statementLogs
      );

      const isDueByDate =
        year === requiredReportPeriod.year &&
        month === requiredReportPeriod.month &&
        requiredReportPeriod.dayOfMonth >= reconSettings.reportDeliveryDay;

      const isPendingStatement = existingLog?.status === 'pending_statement';

      if (!isDueByDate && !isPendingStatement) return;

      autoEmailTriggeredRef.current.add(mKey);
      const outcome = await dispatchMonthlyReportEmail({
        report: reportData,
        recipientEmail: reconSettings.recipientEmail,
        companyName: companySettings?.companyName,
        forceManual: false,
      });

      if (outcome.status === 'sent') {
        toast.success(outcome.message);
      }
    };

    tryAutoReport(requiredReportPeriod.year, requiredReportPeriod.month);
    if (selectedMonthKey !== requiredReportPeriod.monthKey && reportLogs[selectedMonthKey]?.status === 'pending_statement') {
      tryAutoReport(selectedYear, selectedMonth);
    }
  }, [
    loading,
    reconSettings.recipientEmail,
    reconSettings.reportDeliveryDay,
    reportLogs,
    statementLogs,
    purchaseBills,
    expenseBills,
    salesInvoices,
    requiredReportPeriod,
    selectedYear,
    selectedMonth,
    selectedMonthKey,
  ]);

  // Filtered transactions for the Transactions section
  const visibleTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (txScope === 'month' && tx.monthKey !== selectedMonthKey) return false;
      if (txStatusFilter === 'matched' && tx.match_status !== 'matched') return false;
      if (txStatusFilter === 'unmatched' && tx.match_status === 'matched') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const linkedBill = tx.matched_id
          ? allBillsMap.get(`${tx.matched_entity_type || (tx.type === 'credit' ? 'invoice' : 'purchase')}:${tx.matched_id}`)
          : null;
        return (
          tx.description.toLowerCase().includes(q) ||
          tx.reference_number.toLowerCase().includes(q) ||
          tx.bank_transaction_id.toLowerCase().includes(q) ||
          tx.amount.toString().includes(q) ||
          (linkedBill?.billNumber || '').toLowerCase().includes(q) ||
          (linkedBill?.partyName || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [transactions, txScope, txStatusFilter, selectedMonthKey, searchQuery, allBillsMap]);

  // Filter helper for bill sections
  const filterBills = (bills: ReconciledBill[]) => {
    if (!searchQuery.trim()) return bills;
    const q = searchQuery.toLowerCase();
    return bills.filter(
      (b) =>
        b.billNumber.toLowerCase().includes(q) ||
        b.partyName.toLowerCase().includes(q) ||
        (b.purposeOrNotes || '').toLowerCase().includes(q) ||
        b.totalAmount.toString().includes(q)
    );
  };

  const visiblePurchases = useMemo(() => filterBills(monthlyReport.purchaseBills), [monthlyReport.purchaseBills, searchQuery]);
  const visibleExpenses = useMemo(() => filterBills(monthlyReport.expenseBills), [monthlyReport.expenseBills, searchQuery]);
  const visibleInvoices = useMemo(() => filterBills(monthlyReport.salesInvoices), [monthlyReport.salesInvoices, searchQuery]);

  // Automatically execute step 1..5 sequence upon statement upload
  const handleStatementUploaded = async (result: StatementUploadResult) => {
    toast.success(`Imported ${result.rowCount} bank transactions.`);

    // Switch selector to the uploaded month if covered
    if (result.coveredMonths.length > 0) {
      const [y, m] = result.coveredMonths[0].split('-').map(Number);
      if (y && m) {
        setSelectedYear(y);
        setSelectedMonth(m);
      }
    }

    if (!db) return;
    setIsProcessing(true);
    try {
      const [txSnap, purSnap, expSnap, invSnap, logSnap] = await Promise.all([
        getDocs(collection(db, 'transactions')),
        getDocs(collection(db, 'purchases')),
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'invoices')),
        getDocs(collection(db, 'statement_logs')),
      ]);

      const freshTxns = txSnap.docs.map((d) => normalizeTransaction({ id: d.id, ...d.data() }));
      const freshPur = purSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const freshExp = expSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const freshInv = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const freshLogs = logSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const { purchaseBills: pBills, expenseBills: eBills, salesInvoices: iBills } = buildReconciledBills(
        freshPur,
        freshExp,
        freshInv,
        freshTxns
      );

      const res = await runAutoReconciliationPass(freshTxns, pBills, eBills, iBills);
      toast.success(
        `Statement processed: ${res.matchedCount} matched to bills, ${res.unmatchedCount} bank-only transactions.`
      );

      // Re-fetch transactions after matching pass so report email reflects exact newly matched balances
      const postTxSnap = await getDocs(collection(db, 'transactions'));
      const postTxns = postTxSnap.docs.map((d) => normalizeTransaction({ id: d.id, ...d.data() }));
      const postBills = buildReconciledBills(freshPur, freshExp, freshInv, postTxns);

      for (const mKey of result.coveredMonths) {
        const [yr, mo] = mKey.split('-').map(Number);
        if (!yr || !mo) continue;

        const mLabel = formatMonthLabel(yr, mo);
        await syncMissingStatementReminder(mKey, mLabel, true);

        const existingLog = reportLogs[mKey];
        const isPendingOrDue =
          existingLog?.status === 'pending_statement' ||
          (yr === requiredReportPeriod.year &&
            mo === requiredReportPeriod.month &&
            requiredReportPeriod.dayOfMonth >= reconSettings.reportDeliveryDay);

        if (isPendingOrDue && existingLog?.status !== 'sent' && reconSettings.recipientEmail) {
          const freshReport = buildMonthlyReconciliationReport(
            yr,
            mo,
            postBills.purchaseBills,
            postBills.expenseBills,
            postBills.salesInvoices,
            freshLogs
          );
          const emailRes = await dispatchMonthlyReportEmail({
            report: freshReport,
            recipientEmail: reconSettings.recipientEmail,
            companyName: companySettings?.companyName,
            forceManual: false,
          });
          if (emailRes.status === 'sent') {
            toast.success(emailRes.message);
          }
        }
      }
    } catch (err) {
      console.error('Auto reconciliation error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualAutoMatch = async () => {
    setIsProcessing(true);
    try {
      const res = await runAutoReconciliationPass(transactions, purchaseBills, expenseBills, salesInvoices);
      toast.success(
        `Reconciliation complete: ${res.matchedCount} auto-matched, ${res.suggestionCount} uncertain suggestions left for review.`
      );
    } catch (err: any) {
      toast.error(err.message || 'Auto-matching failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualLink = async (bill: ReconciledBill) => {
    if (!linkingTx) return;
    const matchAmt = Math.min(linkingTx.amount, bill.outstandingBalance || linkingTx.amount);
    setIsProcessing(true);
    try {
      await applyBillMatch(linkingTx, bill, matchAmt);
      toast.success(`Linked ₹${formatINR(matchAmt)} to ${bill.billNumber}`);
      setLinkingTx(null);
      setLinkSearch('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to link transaction');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlink = async (tx: NormalizedTransaction) => {
    if (!tx.matched_id) return;
    const kind = tx.matched_entity_type || (tx.type === 'credit' ? 'invoice' : 'purchase');
    const bill = allBillsMap.get(`${kind}:${tx.matched_id}`);
    setIsProcessing(true);
    try {
      await unlinkTransactionMatch(tx, bill);
      toast.success('Transaction unlinked and bill balance recalculated.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to unlink transaction');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDeleteTx = async () => {
    if (!db || selectedTxIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedTxIds.length} selected bank transaction(s)?`)) return;
    try {
      await Promise.all(selectedTxIds.map((id) => deleteDoc(doc(db, 'transactions', id))));
      setSelectedTxIds([]);
      toast.success('Deleted selected transactions.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete transactions');
    }
  };

  const openSettings = () => {
    setFormEmail(reconSettings.recipientEmail);
    setFormDeliveryDay(reconSettings.reportDeliveryDay);
    setFormReminderDay(reconSettings.statementReminderDay);
    setIsSettingsModalOpen(true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await saveReconciliationSettings({
        recipientEmail: formEmail,
        reportDeliveryDay: formDeliveryDay,
        statementReminderDay: formReminderDay,
      });
      toast.success('Reconciliation settings saved.');
      setIsSettingsModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Could not save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendReportNow = async (forceManual = false) => {
    setSendingEmail(true);
    try {
      const res = await dispatchMonthlyReportEmail({
        report: monthlyReport,
        recipientEmail: reconSettings.recipientEmail,
        companyName: companySettings?.companyName,
        forceManual,
      });
      if (res.status === 'sent') toast.success(res.message);
      else if (res.status === 'already_sent') toast(res.message);
      else if (res.status === 'needs_smtp_config') {
        toast.error(res.message);
        const { subject, html } = renderMonthlyReportEmailHtml(monthlyReport, companySettings?.companyName);
        setEmailPreviewModal({ subject, html });
      } else {
        toast.error(res.message);
      }
    } finally {
      setSendingEmail(false);
    }
  };

  const handleExportReport = (format: 'excel' | 'pdf') => {
    const mapBillRow = (section: string, b: ReconciledBill) => ({
      Section: section,
      'Bill / Invoice #': b.billNumber,
      Date: b.billDateStr,
      'Customer / Vendor': b.partyName,
      'Total Amount (₹)': b.totalAmount,
      'Paid / Received (₹)': b.amountPaidOrReceived,
      'Outstanding Balance (₹)': b.outstandingBalance,
      Status: b.paymentStatus,
      'Linked Bank Txns': b.linkedTransactions.map((t) => `${t.dateStr}: ₹${t.amount} (${t.description})`).join(' | ') || 'None',
    });

    if (format === 'excel') {
      const rows = [
        ...monthlyReport.purchaseBills.map((b) => mapBillRow('Purchase Bill', b)),
        ...monthlyReport.expenseBills.map((b) => mapBillRow('Expense Bill', b)),
        ...monthlyReport.salesInvoices.map((b) => mapBillRow('Sales Invoice', b)),
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Bills Summary');
      const txRows = visibleTransactions.map((t) => ({
        Date: t.dateStr,
        Description: t.description,
        Reference: t.reference_number || t.bank_transaction_id,
        Type: t.type.toUpperCase(),
        'Amount (₹)': t.amount,
        Status: t.match_status.toUpperCase(),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), 'Transactions');
      XLSX.writeFile(wb, `Reconciliation_${selectedMonthKey}.xlsx`);
    } else {
      const pdf = new jsPDF();
      pdf.setFontSize(16);
      pdf.text(`Bank Reconciliation Report — ${selectedMonthLabel}`, 14, 18);
      let y = 26;

      const addSection = (title: string, bills: ReconciledBill[]) => {
        pdf.setFontSize(12);
        pdf.text(title, 14, y);
        autoTable(pdf, {
          startY: y + 4,
          head: [['#', 'Date', 'Party', 'Total', 'Paid/Recd', 'Balance', 'Status']],
          body:
            bills.length === 0
              ? [['—', '—', 'No bills for this month', '0.00', '0.00', '0.00', '—']]
              : bills.map((b) => [
                b.billNumber,
                b.billDateStr,
                b.partyName,
                formatINR(b.totalAmount),
                formatINR(b.amountPaidOrReceived),
                formatINR(b.outstandingBalance),
                b.paymentStatus,
              ]),
          theme: 'striped',
        });
        y = (pdf as any).lastAutoTable.finalY + 10;
      };

      addSection('Purchase Bills', monthlyReport.purchaseBills);
      addSection('Expense Bills', monthlyReport.expenseBills);
      addSection('Sales Invoices', monthlyReport.salesInvoices);
      pdf.save(`Reconciliation_${selectedMonthKey}.pdf`);
    }
  };

  const renderStatusPill = (status: 'Paid' | 'Partial' | 'Unpaid') => {
    if (status === 'Paid') {
      return (
        <span className="px-2.5 py-1 rounded-btn bg-surface shadow-neo-surface text-[11px] font-bold text-primary">
          Paid
        </span>
      );
    }
    if (status === 'Partial') {
      return (
        <span className="px-2.5 py-1 rounded-btn bg-surface shadow-neo-surface text-[11px] font-bold text-warning">
          Partial
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-btn bg-surface shadow-neo-surface text-[11px] font-bold text-error">
        Unpaid
      </span>
    );
  };

  const renderBillSection = (
    title: string,
    icon: React.ReactNode,
    partyLabel: string,
    paidLabel: string,
    bills: ReconciledBill[],
    summary: typeof monthlyReport.purchaseSummary
  ) => (
    <section className="neo-card space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-shadow-dark">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-card bg-surface shadow-neo-surface text-primary flex items-center justify-center">
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-bold text-primary-dark flex items-center gap-2">
              {title}
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface shadow-neo-surface text-primary font-bold">
                {bills.length}
              </span>
            </h2>
            <p className="text-xs text-secondary">
              {selectedMonthLabel} • Paid: {summary.paidCount} | Partial: {summary.partialCount} | Unpaid: {summary.unpaidCount}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="text-secondary block">Total</span>
            <strong className="text-primary-dark font-mono">₹ {formatINR(summary.totalAmount)}</strong>
          </div>
          <div>
            <span className="text-secondary block">{paidLabel}</span>
            <strong className="text-primary font-mono">₹ {formatINR(summary.paidOrReceivedAmount)}</strong>
          </div>
          <div>
            <span className="text-secondary block">Outstanding</span>
            <strong className="text-tertiary font-mono">₹ {formatINR(summary.outstandingBalance)}</strong>
          </div>
        </div>
      </div>

      {bills.length === 0 ? (
        <div className="p-8 text-center rounded-card bg-surface shadow-neo-inset text-xs text-secondary">
          No actual {title.toLowerCase()} recorded for {selectedMonthLabel}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-shadow-dark text-left text-secondary uppercase tracking-wider">
                <th className="py-2.5 px-3 font-bold">Bill / Inv # & Date</th>
                <th className="py-2.5 px-3 font-bold">{partyLabel}</th>
                <th className="py-2.5 px-3 font-bold text-right">Total Amount</th>
                <th className="py-2.5 px-3 font-bold">Linked Bank Transaction</th>
                <th className="py-2.5 px-3 font-bold text-right">{paidLabel}</th>
                <th className="py-2.5 px-3 font-bold text-right">Outstanding</th>
                <th className="py-2.5 px-3 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shadow-dark/40">
              {bills.map((bill) => (
                <tr key={bill.id} className="hover:bg-shadow-darker/10 transition-colors">
                  <td className="py-3 px-3 align-top">
                    <div className="font-bold text-primary-dark">{bill.billNumber}</div>
                    <div className="text-[11px] text-secondary mt-0.5">{bill.billDateStr}</div>
                  </td>
                  <td className="py-3 px-3 align-top">
                    <div className="font-semibold text-primary-dark">{bill.partyName}</div>
                    {bill.purposeOrNotes && (
                      <div className="text-[11px] text-secondary line-clamp-1">{bill.purposeOrNotes}</div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-primary-dark align-top">
                    ₹ {formatINR(bill.totalAmount)}
                  </td>
                  <td className="py-3 px-3 align-top max-w-[260px]">
                    {bill.linkedTransactions.length > 0 ? (
                      <div className="space-y-1">
                        {bill.linkedTransactions.map((lt) => (
                          <div key={lt.id} className="p-2 rounded-lg bg-surface shadow-neo-surface text-[11px]">
                            <div className="font-bold text-primary flex items-center justify-between gap-2">
                              <span>{lt.dateStr}</span>
                              <span className="font-mono">₹ {formatINR(lt.amount)}</span>
                            </div>
                            <div className="text-secondary truncate" title={lt.description}>
                              {lt.description}
                            </div>
                            {lt.reference_number && (
                              <div className="text-[10px] text-secondary/80 font-mono">Ref: {lt.reference_number}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : bill.basePaidAmount > 0 ? (
                      <span className="text-[11px] text-secondary italic">
                        Direct/manual payment recorded (₹ {formatINR(bill.basePaidAmount)})
                      </span>
                    ) : (
                      <span className="text-[11px] text-secondary/70 italic">No bank payment linked</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-primary align-top">
                    ₹ {formatINR(bill.amountPaidOrReceived)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-tertiary align-top">
                    ₹ {formatINR(bill.outstandingBalance)}
                  </td>
                  <td className="py-3 px-3 text-center align-top">{renderStatusPill(bill.paymentStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  // Candidates for manual Link-to-Bill modal
  const linkableBills = useMemo(() => {
    if (!linkingTx) return [];
    const pool = linkingTx.type === 'credit' ? salesInvoices : [...purchaseBills, ...expenseBills];
    const q = linkSearch.toLowerCase().trim();
    return pool
      .filter((b) => b.outstandingBalance > 0.01)
      .filter(
        (b) =>
          !q ||
          b.billNumber.toLowerCase().includes(q) ||
          b.partyName.toLowerCase().includes(q) ||
          b.totalAmount.toString().includes(q)
      );
  }, [linkingTx, salesInvoices, purchaseBills, expenseBills, linkSearch]);

  const currentReportLog = reportLogs[selectedMonthKey];
  const yearsList = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-shadow-dark">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary-dark">Bank Reconciliation</h1>
          <p className="text-xs sm:text-sm text-secondary mt-1">
            Compare bank statements against Purchase Bills, Expense Bills, and Sales Invoices by month.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month & Year Selector */}
          <div className="flex items-center gap-2 p-1.5 rounded-card bg-surface shadow-neo-surface">
            <Calendar size={15} className="text-primary ml-1.5" />
            <select
              aria-label="Select month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="neo-input !py-1.5 !px-2.5 text-xs font-bold text-primary-dark"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Select year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="neo-input !py-1.5 !px-2.5 text-xs font-bold text-primary-dark"
            >
              {yearsList.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button onClick={openSettings} className="neo-btn !px-3.5 !py-2 text-xs flex items-center gap-1.5">
            <SettingsIcon size={15} className="text-primary" /> Settings
          </button>

          <div className="relative">
            <button
              onClick={() => setShowReportMenu(!showReportMenu)}
              className="neo-btn !px-3.5 !py-2 text-xs flex items-center gap-1.5"
            >
              <Download size={15} className="text-primary" /> Report <ChevronDown size={13} />
            </button>
            {showReportMenu && (
              <div
                onMouseLeave={() => setShowReportMenu(false)}
                className="absolute right-0 mt-2 w-52 bg-surface rounded-card shadow-neo-raised z-40 py-1.5 border border-shadow-light"
              >
                <button
                  onClick={() => {
                    handleExportReport('excel');
                    setShowReportMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-primary-dark hover:bg-primary/10"
                >
                  Export Excel (.xlsx)
                </button>
                <button
                  onClick={() => {
                    handleExportReport('pdf');
                    setShowReportMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-primary-dark hover:bg-primary/10"
                >
                  Export PDF (.pdf)
                </button>
                <button
                  onClick={() => {
                    handleSendReportNow(true);
                    setShowReportMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/10 flex items-center gap-1.5"
                >
                  <Mail size={13} /> Email Monthly Report
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="neo-btn !px-4 !py-2 text-xs font-bold flex items-center gap-1.5 text-primary"
          >
            <Upload size={15} /> Upload Statement
          </button>

          <button
            onClick={handleManualAutoMatch}
            disabled={isProcessing}
            className="neo-btn-primary !px-4 !py-2 text-xs font-bold flex items-center gap-1.5"
          >
            {isProcessing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Reconcile
          </button>
        </div>
      </div>

      {/* Missing Statement Reminder Banner */}
      {!monthlyReport.coverage.isCovered && (
        <div className="neo-card !p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4 border-warning">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-primary-dark">{monthlyReport.coverage.missingMessage}</p>
              <p className="text-xs text-secondary mt-0.5">
                Current statement coverage for {selectedMonthLabel}: {monthlyReport.coverage.coveredDays}/
                {monthlyReport.coverage.totalDaysInMonth} days ({monthlyReport.coverage.coveragePercent}%).
                {currentReportLog?.status === 'pending_statement' && ' Monthly report email is queued until upload completes.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="neo-btn-primary !py-2 !px-4 text-xs shrink-0 flex items-center gap-1.5"
          >
            <Upload size={14} /> Upload {selectedMonthLabel} Statement
          </button>
        </div>
      )}

      {/* Monthly Email Delivery Status Notice */}
      {currentReportLog && (
        <div className="neo-card !p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-primary shrink-0" />
            {currentReportLog.status === 'sent' ? (
              <span className="text-primary-dark font-semibold">
                Monthly report for <strong>{selectedMonthLabel}</strong> was emailed to{' '}
                <strong>{currentReportLog.recipientEmail}</strong>. Duplicate auto-emails for this month are blocked.
              </span>
            ) : currentReportLog.status === 'pending_smtp_config' ? (
              <span className="text-tertiary font-semibold">
                Email delivery pending SMTP setup in <code className="font-mono">.env</code> ({currentReportLog.error}).
              </span>
            ) : (
              <span className="text-secondary font-semibold">
                Monthly report for <strong>{selectedMonthLabel}</strong> is pending bank statement upload.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const { subject, html } = renderMonthlyReportEmailHtml(monthlyReport, companySettings?.companyName);
              setEmailPreviewModal({ subject, html });
            }}
            className="text-primary font-bold hover:underline"
          >
            Preview Email Report
          </button>
        </div>
      )}

      {/* Summary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="neo-card !p-5 space-y-2">
          <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">Statement Coverage</div>
          <div className="text-2xl font-extrabold text-primary-dark">
            {monthlyReport.coverage.isCovered
              ? 'Covered'
              : monthlyReport.coverage.status === 'partial'
                ? `Partial (${monthlyReport.coverage.coveragePercent}%)`
                : 'Missing'}
          </div>
          <div className="text-xs text-secondary">
            {selectedMonthLabel} • {monthlyReport.coverage.matchingLogs.length} file(s)
          </div>
        </div>

        <div className="neo-card !p-5 space-y-2">
          <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">Purchase Bills</div>
          <div className="text-2xl font-extrabold text-primary-dark font-mono">
            ₹ {formatINR(monthlyReport.purchaseSummary.totalAmount)}
          </div>
          <div className="text-xs text-secondary">
            Paid: ₹ {formatINR(monthlyReport.purchaseSummary.paidOrReceivedAmount)} • Bal: ₹{' '}
            {formatINR(monthlyReport.purchaseSummary.outstandingBalance)}
          </div>
        </div>

        <div className="neo-card !p-5 space-y-2">
          <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">Expense Bills</div>
          <div className="text-2xl font-extrabold text-primary-dark font-mono">
            ₹ {formatINR(monthlyReport.expenseSummary.totalAmount)}
          </div>
          <div className="text-xs text-secondary">
            Paid: ₹ {formatINR(monthlyReport.expenseSummary.paidOrReceivedAmount)} • Bal: ₹{' '}
            {formatINR(monthlyReport.expenseSummary.outstandingBalance)}
          </div>
        </div>

        <div className="neo-card !p-5 space-y-2">
          <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">Sales Invoices</div>
          <div className="text-2xl font-extrabold text-primary font-mono">
            ₹ {formatINR(monthlyReport.invoiceSummary.totalAmount)}
          </div>
          <div className="text-xs text-secondary">
            Recd: ₹ {formatINR(monthlyReport.invoiceSummary.paidOrReceivedAmount)} • Bal: ₹{' '}
            {formatINR(monthlyReport.invoiceSummary.outstandingBalance)}
          </div>
        </div>
      </div>

      {/* Global Search Bar */}
      <div className="neo-card !p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transactions or bills by #, party name, narration, ref, or amount..."
            className="neo-input w-full pl-10 text-xs"
          />
        </div>
        <div className="text-xs text-secondary px-2">
          Showing <strong>{selectedMonthLabel}</strong> bills &amp;{' '}
          <strong>{visibleTransactions.length}</strong> bank transactions
        </div>
      </div>

      {loading ? (
        <div className="neo-card py-16 flex flex-col items-center justify-center gap-2 text-secondary">
          <Loader2 size={28} className="animate-spin text-primary" />
          <span className="text-sm font-semibold">Loading transactions and bills...</span>
        </div>
      ) : (
        <>
          {/* SECTION 1: TRANSACTIONS (ALL IMPORTED BANK TRANSACTIONS) */}
          <section className="neo-card space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-shadow-dark">
              <div>
                <h2 className="text-lg font-bold text-primary-dark flex items-center gap-2">
                  Transactions
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface shadow-neo-surface text-primary font-bold">
                    {visibleTransactions.length}
                  </span>
                </h2>
                <p className="text-xs text-secondary">
                  All imported bank statement transactions, including bank-only entries without a corresponding bill.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Month vs All scope */}
                <div className="flex rounded-btn bg-surface shadow-neo-surface p-0.5 text-[11px]">
                  <button
                    onClick={() => setTxScope('month')}
                    className={`px-3 py-1 rounded-btn font-bold transition-all ${txScope === 'month' ? 'bg-primary text-surface' : 'text-secondary'
                      }`}
                  >
                    {selectedMonthLabel}
                  </button>
                  <button
                    onClick={() => setTxScope('all')}
                    className={`px-3 py-1 rounded-btn font-bold transition-all ${txScope === 'all' ? 'bg-primary text-surface' : 'text-secondary'
                      }`}
                  >
                    All Months
                  </button>
                </div>

                {/* Match status filter */}
                <div className="flex rounded-btn bg-surface shadow-neo-surface p-0.5 text-[11px]">
                  {(['all', 'unmatched', 'matched'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setTxStatusFilter(st)}
                      className={`px-3 py-1 rounded-btn font-bold capitalize transition-all ${txStatusFilter === st ? 'bg-primary text-surface' : 'text-secondary'
                        }`}
                    >
                      {st === 'unmatched' ? 'Without Bill / Unmatched' : st}
                    </button>
                  ))}
                </div>

                {selectedTxIds.length > 0 && (
                  <button
                    onClick={handleBulkDeleteTx}
                    className="neo-btn !py-1.5 !px-3 text-xs text-error flex items-center gap-1"
                  >
                    <Trash2 size={13} /> Delete ({selectedTxIds.length})
                  </button>
                )}
              </div>
            </div>

            {visibleTransactions.length === 0 ? (
              <div className="p-8 text-center rounded-card bg-surface shadow-neo-inset text-xs text-secondary">
                No bank transactions found for this filter. Upload a bank statement to import transactions.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {visibleTransactions.map((tx) => {
                  const isMatched = tx.match_status === 'matched' && tx.matched_id;
                  const linkedBill = isMatched
                    ? allBillsMap.get(
                      `${tx.matched_entity_type || (tx.type === 'credit' ? 'invoice' : 'purchase')}:${tx.matched_id}`
                    )
                    : null;
                  const suggestedBill =
                    !isMatched && tx.metadata?.suggested_doc_id
                      ? allBillsMap.get(
                        `${tx.metadata.suggested_doc_type || (tx.type === 'credit' ? 'invoice' : 'purchase')}:${tx.metadata.suggested_doc_id}`
                      )
                      : null;

                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 rounded-card bg-surface shadow-neo-surface flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedTxIds.includes(tx.id)}
                          onChange={() =>
                            setSelectedTxIds((prev) =>
                              prev.includes(tx.id) ? prev.filter((id) => id !== tx.id) : [...prev, tx.id]
                            )
                          }
                          className="mt-1 accent-primary cursor-pointer"
                        />
                        <div className="w-9 h-9 rounded-card bg-surface shadow-neo-surface flex items-center justify-center shrink-0 text-primary">
                          {tx.type === 'credit' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} className="text-tertiary" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-xs sm:text-sm text-primary-dark break-words">
                            {tx.description}
                          </div>
                          <div className="text-[11px] text-secondary flex flex-wrap items-center gap-2 mt-0.5">
                            <span>{tx.dateStr}</span>
                            <span>•</span>
                            <span className="font-mono">Ref: {tx.reference_number || tx.bank_transaction_id}</span>
                            <span>•</span>
                            <span className="uppercase font-bold">{tx.type}</span>
                          </div>

                          {isMatched && linkedBill && (
                            <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-btn bg-surface shadow-neo-pressed text-[11px] font-bold text-primary">
                              <CheckCircle2 size={12} />
                              Linked to {linkedBill.kind.toUpperCase()} #{linkedBill.billNumber} ({linkedBill.partyName})
                            </div>
                          )}

                          {!isMatched && suggestedBill && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-secondary">
                              <span className="inline-flex items-center gap-1 text-primary font-semibold">
                                <Sparkles size={12} /> Possible match: #{suggestedBill.billNumber} ({suggestedBill.partyName})
                              </span>
                              <button
                                type="button"
                                onClick={() => handleManualLinkCandidate(tx, suggestedBill)}
                                className="text-primary font-bold underline"
                              >
                                Link Now
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                        <div className="text-right">
                          <div className={`text-base font-extrabold font-mono ${tx.type === 'credit' ? 'text-primary' : 'text-primary-dark'}`}>
                            {tx.type === 'credit' ? '+' : '-'} ₹ {formatINR(tx.amount)}
                          </div>
                          <span className="text-[10px] font-bold uppercase text-secondary">
                            {isMatched ? 'Matched' : 'No Bill / Bank Only'}
                          </span>
                        </div>

                        {isMatched ? (
                          <button
                            onClick={() => handleUnlink(tx)}
                            disabled={isProcessing}
                            className="neo-btn !py-1.5 !px-3 text-xs text-error flex items-center gap-1"
                          >
                            <Unlink size={13} /> Unlink
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setLinkingTx(tx);
                              setLinkSearch('');
                            }}
                            disabled={isProcessing}
                            className="neo-btn !py-1.5 !px-3 text-xs text-primary font-bold flex items-center gap-1"
                          >
                            <Link2 size={13} /> Link to Bill
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SECTION 2: PURCHASE BILLS */}
          {renderBillSection(
            'Purchase Bills',
            <ShoppingCart size={20} />,
            'Vendor Name',
            'Amount Paid',
            visiblePurchases,
            monthlyReport.purchaseSummary
          )}

          {/* SECTION 3: EXPENSE BILLS */}
          {renderBillSection(
            'Expense Bills',
            <Wallet size={20} />,
            'Member / Payee',
            'Amount Paid',
            visibleExpenses,
            monthlyReport.expenseSummary
          )}

          {/* SECTION 4: SALES INVOICES */}
          {renderBillSection(
            'Sales Invoices',
            <Receipt size={20} />,
            'Customer Name',
            'Amount Received',
            visibleInvoices,
            monthlyReport.invoiceSummary
          )}
        </>
      )}

      {/* Statement Upload Modal */}
      <StatementUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onComplete={handleStatementUploaded}
        defaultMonthKey={selectedMonthKey}
      />

      {/* Manual Link Transaction to Actual Bill Modal */}
      {linkingTx && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface w-full max-w-lg rounded-card shadow-neo-raised p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-dark pb-3">
              <div>
                <h3 className="text-base font-bold text-primary-dark">Link Transaction to Existing Bill</h3>
                <p className="text-xs text-secondary mt-0.5">
                  {linkingTx.type === 'credit' ? 'Credit' : 'Debit'} • ₹ {formatINR(linkingTx.amount)} • {linkingTx.description}
                </p>
              </div>
              <button onClick={() => setLinkingTx(null)} className="text-secondary hover:text-primary-dark">
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder={`Search open ${linkingTx.type === 'credit' ? 'Sales Invoices' : 'Purchase / Expense Bills'}...`}
              className="neo-input w-full text-xs"
            />

            <div className="max-h-72 overflow-y-auto space-y-2">
              {linkableBills.length === 0 ? (
                <div className="p-6 text-center text-xs text-secondary">
                  No open {linkingTx.type === 'credit' ? 'Sales Invoices' : 'Purchase or Expense Bills'} with outstanding balance found.
                </div>
              ) : (
                linkableBills.map((bill) => (
                  <div
                    key={`${bill.kind}:${bill.id}`}
                    className="p-3 rounded-card bg-surface shadow-neo-surface flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-primary-dark">
                        [{bill.kind.toUpperCase()}] #{bill.billNumber} • {bill.partyName}
                      </div>
                      <div className="text-[11px] text-secondary mt-0.5">
                        {bill.billDateStr} • Total: ₹{formatINR(bill.totalAmount)} • Outstanding: ₹{formatINR(bill.outstandingBalance)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleManualLink(bill)}
                      disabled={isProcessing}
                      className="neo-btn-primary !py-1.5 !px-3 text-xs shrink-0"
                    >
                      Link (₹{formatINR(Math.min(linkingTx.amount, bill.outstandingBalance))})
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reconciliation Report & Reminder Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface w-full max-w-md rounded-card shadow-neo-raised p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-dark pb-3">
              <div>
                <h3 className="text-base font-bold text-primary-dark">Monthly Report & Reminder Settings</h3>
                <p className="text-xs text-secondary mt-0.5">Configure automated statement checks and report emails.</p>
              </div>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-secondary hover:text-primary-dark">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-primary-dark block mb-1">Recipient Email Address</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="accounts@ecotrophy.in"
                  className="neo-input w-full text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-primary-dark block mb-1">Statement Reminder Day</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    required
                    value={formReminderDay}
                    onChange={(e) => setFormReminderDay(Number(e.target.value))}
                    className="neo-input w-full text-xs"
                  />
                  <span className="text-[10px] text-secondary mt-0.5 block">Day of month (1–28)</span>
                </div>

                <div>
                  <label className="text-xs font-bold text-primary-dark block mb-1">Report Delivery Day</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    required
                    value={formDeliveryDay}
                    onChange={(e) => setFormDeliveryDay(Number(e.target.value))}
                    className="neo-input w-full text-xs"
                  />
                  <span className="text-[10px] text-secondary mt-0.5 block">Day of month (1–28)</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button type="button" onClick={() => setIsSettingsModalOpen(false)} className="neo-btn text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={savingSettings} className="neo-btn-primary text-xs flex items-center gap-2">
                  {savingSettings && <Loader2 size={14} className="animate-spin" />}
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email HTML Preview Modal */}
      {emailPreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-3xl max-h-[85vh] rounded-card shadow-neo-raised flex flex-col overflow-hidden">
            <div className="p-4 border-b border-shadow-dark flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-primary-dark">{emailPreviewModal.subject}</h3>
                <p className="text-xs text-secondary">Monthly report email preview</p>
              </div>
              <button onClick={() => setEmailPreviewModal(null)} className="text-secondary hover:text-primary-dark">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-white">
              <div dangerouslySetInnerHTML={{ __html: emailPreviewModal.html }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function handleManualLinkCandidate(tx: NormalizedTransaction, bill: ReconciledBill) {
    const matchAmt = Math.min(tx.amount, bill.outstandingBalance || tx.amount);
    setIsProcessing(true);
    try {
      await applyBillMatch(tx, bill, matchAmt);
      toast.success(`Linked ₹${formatINR(matchAmt)} to #${bill.billNumber}`);
    } catch (err: any) {
      toast.error(err.message || 'Could not link transaction');
    } finally {
      setIsProcessing(false);
    }
  }
}

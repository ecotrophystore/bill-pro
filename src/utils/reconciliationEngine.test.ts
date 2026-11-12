import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTransaction,
  buildReconciledBills,
  checkMonthlyStatementCoverage,
  evaluateAutomaticMatches,
  buildMonthlyReconciliationReport,
  renderMonthlyReportEmailHtml
} from './reconciliationEngine';
import { canAccessRoute } from '../config/roleAccess';

test('Partial payment on ₹10,000 invoice with ₹5,000 payment stays Partial with ₹5,000 outstanding', () => {
  const invoices = [
    {
      id: 'inv-1',
      number: 'ECO/2026/0101',
      customer_name: 'Apex Trophy Mart',
      custom_date: '2026-10-05',
      grand_total: 10000,
      advance_amount: 0,
      balance_amount: 10000,
      payment_status: 'unpaid',
      status: 'finalized',
    },
    {
      id: 'inv-2',
      number: 'ECO/2026/0102',
      customer_name: 'Beacon Academy',
      custom_date: '2026-10-12',
      grand_total: 8000,
      advance_amount: 0,
      balance_amount: 8000,
      payment_status: 'unpaid',
      status: 'finalized',
    },
  ];

  const txns = [
    normalizeTransaction({
      id: 'tx-1',
      bank_transaction_id: 'b_tx_1',
      date: '2026-10-10',
      amount: 5000,
      description: 'NEFT/Apex Trophy Mart/ECO/2026/0101',
      type: 'credit',
      match_status: 'matched',
      matched_id: 'inv-1',
      matched_entity_type: 'invoice',
      matched_amount: 5000,
    }),
    // Bank-only transaction with NO bill
    normalizeTransaction({
      id: 'tx-bank-only',
      bank_transaction_id: 'b_tx_2',
      date: '2026-10-15',
      amount: 1200,
      description: 'BANK SMS CHARGES',
      type: 'debit',
      match_status: 'unmatched',
    }),
  ];

  const { purchaseBills, expenseBills, salesInvoices } = buildReconciledBills([], [], invoices, txns);

  // Only actual bills appear; bank-only tx does not fabricate a bill
  assert.equal(purchaseBills.length, 0);
  assert.equal(expenseBills.length, 0);
  assert.equal(salesInvoices.length, 2);

  const inv1 = salesInvoices.find((i) => i.id === 'inv-1')!;
  assert.equal(inv1.totalAmount, 10000);
  assert.equal(inv1.amountPaidOrReceived, 5000);
  assert.equal(inv1.outstandingBalance, 5000);
  assert.equal(inv1.paymentStatus, 'Partial');
  assert.equal(inv1.linkedTransactions.length, 1);

  // Unpaid invoice without matching payment remains visible as Unpaid
  const inv2 = salesInvoices.find((i) => i.id === 'inv-2')!;
  assert.equal(inv2.amountPaidOrReceived, 0);
  assert.equal(inv2.outstandingBalance, 8000);
  assert.equal(inv2.paymentStatus, 'Unpaid');
  assert.equal(inv2.linkedTransactions.length, 0);
});

test('Auto-matcher separates confident matches from uncertain bank-only transactions', () => {
  const purchases = [
    {
      id: 'pur-1',
      vendor: { name: 'Kaveri Wood Works' },
      invoice: { invoice_number: 'KW-8841', invoice_date: '2026-10-03' },
      grandTotal: 15000,
      status: 'submitted',
    },
  ];
  const expenses = [
    {
      id: 'exp-1',
      billNo: 'EXP-4402',
      date: '2026-10-08',
      member: 'Ramesh Kumar',
      purpose: 'Courier Dispatch',
      requested: 2500,
      paid: 0,
    },
  ];
  const invoices = [
    {
      id: 'inv-1',
      number: 'ECO/2026/0200',
      customer_name: 'St Xaviers College',
      custom_date: '2026-10-02',
      grand_total: 10000,
      advance_amount: 0,
      balance_amount: 10000,
      payment_status: 'unpaid',
      status: 'finalized',
    },
  ];

  const txns = [
    normalizeTransaction({
      id: 'tx-clear-invoice',
      date: '2026-10-06',
      amount: 5000,
      description: 'UPI CR St Xaviers College ECO/2026/0200',
      type: 'credit',
      match_status: 'pending_review',
    }),
    normalizeTransaction({
      id: 'tx-clear-purchase',
      date: '2026-10-07',
      amount: 15000,
      description: 'IMPS Kaveri Wood Works KW-8841',
      type: 'debit',
      match_status: 'pending_review',
    }),
    // Uncertain transaction (same amount as expense, but unknown generic narration — must NOT be forced!)
    normalizeTransaction({
      id: 'tx-uncertain',
      date: '2026-10-09',
      amount: 2500,
      description: 'ATM CASH WITHDRAWAL 9921',
      type: 'debit',
      match_status: 'pending_review',
    }),
  ];

  const reconciled = buildReconciledBills(purchases, expenses, invoices, txns);
  const { autoMatches } = evaluateAutomaticMatches(
    txns,
    reconciled.purchaseBills,
    reconciled.expenseBills,
    reconciled.salesInvoices
  );

  assert.equal(autoMatches.length, 2);
  assert.equal(autoMatches.some((m) => m.transactionId === 'tx-clear-invoice' && m.billId === 'inv-1' && m.matchAmount === 5000), true);
  assert.equal(autoMatches.some((m) => m.transactionId === 'tx-clear-purchase' && m.billId === 'pur-1'), true);
  // Uncertain ATM withdrawal MUST NOT be forced into matching Expense EXP-4402
  assert.equal(autoMatches.some((m) => m.transactionId === 'tx-uncertain'), false);
});

test('Statement coverage checks required month rather than just any uploaded file', () => {
  const septemberLogOnly = [
    {
      id: 'log-sep',
      bank_name: 'HDFC Bank',
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      covered_months: ['2026-09'],
    },
  ];

  const sepCheck = checkMonthlyStatementCoverage(septemberLogOnly, 2026, 9);
  assert.equal(sepCheck.isCovered, true);
  assert.equal(sepCheck.missingMessage, null);

  // October MUST still be reported as missing even though September file exists
  const octCheck = checkMonthlyStatementCoverage(septemberLogOnly, 2026, 10);
  assert.equal(octCheck.isCovered, false);
  assert.equal(octCheck.status, 'missing');
  assert.equal(octCheck.missingMessage, 'Please upload your bank statement for October 2026 to complete bill reconciliation.');

  // Partial October coverage (Oct 1 - Oct 10) is NOT full coverage
  const partialOctLogs = [
    ...septemberLogOnly,
    {
      id: 'log-oct-part',
      bank_name: 'HDFC Bank',
      start_date: '2026-10-01',
      end_date: '2026-10-10',
    },
  ];
  const octPartialCheck = checkMonthlyStatementCoverage(partialOctLogs, 2026, 10);
  assert.equal(octPartialCheck.isCovered, false);
  assert.equal(octPartialCheck.status, 'partial');

  // Full October statement clears the reminder
  const fullOctLogs = [
    ...septemberLogOnly,
    {
      id: 'log-oct-full',
      bank_name: 'HDFC Bank',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      covered_months: ['2026-10'],
    },
  ];
  const octFullCheck = checkMonthlyStatementCoverage(fullOctLogs, 2026, 10);
  assert.equal(octFullCheck.isCovered, true);
  assert.equal(octFullCheck.missingMessage, null);
});

test('Monthly report filters bills by month/year and builds separate sections for email', () => {
  const purchases = [
    { id: 'p-oct', vendor: { name: 'Vendor A' }, invoice: { invoice_number: 'PUR-1', invoice_date: '2026-10-15' }, grandTotal: 4000 },
    { id: 'p-sep', vendor: { name: 'Vendor B' }, invoice: { invoice_number: 'PUR-0', invoice_date: '2026-09-15' }, grandTotal: 9000 },
  ];
  const expenses = [
    { id: 'e-oct', billNo: 'EXP-1', date: '2026-10-18', member: 'Staff A', requested: 1500, paid: 1500 },
  ];
  const invoices = [
    { id: 'i-oct', number: 'ECO-1', customer_name: 'Client A', custom_date: '2026-10-20', grand_total: 12000, balance_amount: 12000 },
  ];

  const reconciled = buildReconciledBills(purchases, expenses, invoices, []);
  const report = buildMonthlyReconciliationReport(
    2026,
    10,
    reconciled.purchaseBills,
    reconciled.expenseBills,
    reconciled.salesInvoices,
    [{ start_date: '2026-10-01', end_date: '2026-10-31', covered_months: ['2026-10'] }]
  );

  assert.equal(report.purchaseBills.length, 1);
  assert.equal(report.purchaseBills[0].billNumber, 'PUR-1');
  assert.equal(report.expenseBills.length, 1);
  assert.equal(report.salesInvoices.length, 1);

  const email = renderMonthlyReportEmailHtml(report, 'EcoTrophy');
  assert.match(email.subject, /October 2026/);
  assert.match(email.html, /Purchase Bills/);
  assert.match(email.html, /Expense Bills/);
  assert.match(email.html, /Sales Invoices/);
  assert.match(email.html, /PUR-1/);
  assert.match(email.html, /EXP-1/);
  assert.match(email.html, /ECO-1/);
});

test('Multi-installment payments settle invoice cleanly and orphan bank transactions do not fabricate bills', () => {
  const invoices = [
    {
      id: 'inv-split',
      number: 'ECO/2026/0501',
      customer_name: 'Delta Sports Club',
      custom_date: '2026-10-10',
      grand_total: 10000,
      advance_amount: 0,
      balance_amount: 10000,
    },
  ];

  const txns = [
    normalizeTransaction({
      id: 'tx-part-1',
      date: '2026-10-11',
      amount: 5000,
      description: 'NEFT Delta Sports Club',
      type: 'credit',
      match_status: 'matched',
      matched_entity_type: 'invoice',
      matched_id: 'inv-split',
      matched_amount: 5000,
    }),
    normalizeTransaction({
      id: 'tx-part-2',
      date: '2026-10-19',
      amount: 5000,
      description: 'IMPS Delta Sports Club final',
      type: 'credit',
      match_status: 'matched',
      matched_entity_type: 'invoice',
      matched_id: 'inv-split',
      matched_amount: 5000,
    }),
    normalizeTransaction({
      id: 'tx-no-bill',
      date: '2026-10-21',
      amount: 450,
      description: 'BANK SMS CHARGE',
      type: 'debit',
      match_status: 'pending_review',
    }),
  ];

  const reconciled = buildReconciledBills([], [], invoices, txns);
  assert.equal(reconciled.salesInvoices.length, 1);
  assert.equal(reconciled.purchaseBills.length, 0);
  assert.equal(reconciled.expenseBills.length, 0);

  const settled = reconciled.salesInvoices[0];
  assert.equal(settled.amountPaidOrReceived, 10000);
  assert.equal(settled.outstandingBalance, 0);
  assert.equal(settled.paymentStatus, 'Paid');
  assert.equal(settled.linkedTransactions.length, 2);
});

test('Bank Reconciliation route remains restricted to Admin and Accounts roles', () => {
  assert.equal(canAccessRoute('admin', '/reconciliation'), true);
  assert.equal(canAccessRoute('accounts', '/reconciliation'), true);
  assert.equal(canAccessRoute('sales', '/reconciliation'), false);
  assert.equal(canAccessRoute('hr', '/reconciliation'), false);
  assert.equal(canAccessRoute('user', '/reconciliation'), false);
});

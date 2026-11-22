import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDoc,
  collection,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { resolveApiUrl } from '../lib/apiBase';
import {
  type BillKind,
  type NormalizedTransaction,
  type ReconciledBill,
  type ReconciliationSettings,
  type MonthlyReconciliationReportData,
  computePaymentStatus,
  evaluateAutomaticMatches,
  renderMonthlyReportEmailHtml,
  round2
} from '../utils/reconciliationEngine';

function getBillCollection(kind: BillKind): 'purchases' | 'expenses' | 'invoices' {
  if (kind === 'purchase') return 'purchases';
  if (kind === 'expense') return 'expenses';
  return 'invoices';
}

export async function applyBillMatch(
  tx: NormalizedTransaction,
  bill: ReconciledBill,
  overrideAmount?: number
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const matchAmount = round2(overrideAmount ?? tx.amount);
  if (matchAmount <= 0) throw new Error('Match amount must be greater than 0');

  const txRef = doc(db, 'transactions', tx.id);
  const billRef = doc(db, getBillCollection(bill.kind), bill.id);

  // Calculate updated bill totals without double-counting
  const newBankPaid = round2(bill.bankPaidAmount + matchAmount);
  const newTotalPaid = round2(bill.basePaidAmount + newBankPaid);
  const newBalance = round2(Math.max(0, bill.totalAmount - newTotalPaid));
  const statusLabel = computePaymentStatus(bill.totalAmount, newTotalPaid);
  const dbPaymentStatus = statusLabel.toLowerCase() as 'paid' | 'partial' | 'unpaid';

  // 1. Update transaction
  await updateDoc(txRef, {
    match_status: 'matched',
    matched_id: bill.id,
    matched_entity_type: bill.kind,
    matched_amount: matchAmount,
    linked_document_id: bill.id,
    linked_document_type: bill.kind,
    matched_at: serverTimestamp(),
    matched_by: auth?.currentUser?.uid || 'system',
    category: bill.kind === 'invoice' ? 'Sales' : bill.kind === 'purchase' ? 'Purchase' : bill.purposeOrNotes || 'General',
  });

  // 2. Update bill record
  const billUpdate: Record<string, any> = {
    manual_paid_amount: bill.basePaidAmount,
    reconciled_bank_amount: newBankPaid,
    paid_amount: newTotalPaid,
    balance_amount: newBalance,
    payment_status: dbPaymentStatus,
  };

  if (bill.kind === 'invoice') {
    billUpdate.updated_at = serverTimestamp();
    if (dbPaymentStatus === 'paid') {
      billUpdate.status = 'finalized';
    }
  } else if (bill.kind === 'purchase') {
    billUpdate.updatedAt = serverTimestamp();
    if (dbPaymentStatus === 'paid') {
      billUpdate.status = 'cleared';
    }
  } else if (bill.kind === 'expense') {
    billUpdate.paid = newTotalPaid;
    billUpdate.updated_at = serverTimestamp();
  }

  await updateDoc(billRef, billUpdate);

  // 3. Audit Log
  await addDoc(collection(db, 'audit_logs'), {
    document_type: bill.kind,
    document_id: bill.id,
    action: 'reconciliation',
    user_id: auth?.currentUser?.uid || 'system',
    timestamp: serverTimestamp(),
    notes: `Matched ₹${matchAmount.toLocaleString('en-IN')} from bank txn (${tx.bank_transaction_id}) to ${bill.kind.toUpperCase()} #${bill.billNumber} -> ${statusLabel} (Balance: ₹${newBalance.toLocaleString('en-IN')})`,
  }).catch(() => {});
}

export async function unlinkTransactionMatch(
  tx: NormalizedTransaction,
  linkedBill?: ReconciledBill
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');

  const txRef = doc(db, 'transactions', tx.id);
  const removedAmount = round2(tx.matched_amount ?? tx.amount);

  await updateDoc(txRef, {
    match_status: 'unmatched',
    matched_id: null,
    matched_entity_type: null,
    matched_amount: null,
    linked_document_id: null,
    linked_document_type: null,
    matched_at: null,
  });

  if (linkedBill) {
    const billRef = doc(db, getBillCollection(linkedBill.kind), linkedBill.id);
    const newBankPaid = round2(Math.max(0, linkedBill.bankPaidAmount - removedAmount));
    const newTotalPaid = round2(linkedBill.basePaidAmount + newBankPaid);
    const newBalance = round2(Math.max(0, linkedBill.totalAmount - newTotalPaid));
    const statusLabel = computePaymentStatus(linkedBill.totalAmount, newTotalPaid);
    const dbPaymentStatus = statusLabel.toLowerCase() as 'paid' | 'partial' | 'unpaid';

    const billUpdate: Record<string, any> = {
      manual_paid_amount: linkedBill.basePaidAmount,
      reconciled_bank_amount: newBankPaid,
      paid_amount: newTotalPaid,
      balance_amount: newBalance,
      payment_status: dbPaymentStatus,
    };

    if (linkedBill.kind === 'expense') {
      billUpdate.paid = newTotalPaid;
      billUpdate.updated_at = serverTimestamp();
    } else if (linkedBill.kind === 'purchase') {
      billUpdate.updatedAt = serverTimestamp();
      if (dbPaymentStatus !== 'paid' && linkedBill.rawRecord?.status === 'cleared') {
        billUpdate.status = 'submitted';
      }
    } else {
      billUpdate.updated_at = serverTimestamp();
    }

    await updateDoc(billRef, billUpdate);

    await addDoc(collection(db, 'audit_logs'), {
      document_type: linkedBill.kind,
      document_id: linkedBill.id,
      action: 'reconciliation',
      user_id: auth?.currentUser?.uid || 'system',
      timestamp: serverTimestamp(),
      notes: `Unlinked ₹${removedAmount.toLocaleString('en-IN')} bank txn (${tx.bank_transaction_id}) from ${linkedBill.kind.toUpperCase()} #${linkedBill.billNumber} -> ${statusLabel}`,
    }).catch(() => {});
  }
}

export async function runAutoReconciliationPass(
  transactions: NormalizedTransaction[],
  purchaseBills: ReconciledBill[],
  expenseBills: ReconciledBill[],
  salesInvoices: ReconciledBill[]
): Promise<{ matchedCount: number; suggestionCount: number; unmatchedCount: number }> {
  if (!db) return { matchedCount: 0, suggestionCount: 0, unmatchedCount: 0 };

  const { autoMatches, suggestions } = evaluateAutomaticMatches(
    transactions,
    purchaseBills,
    expenseBills,
    salesInvoices
  );

  // Clone mutable bill snapshots for sequential accumulation if two txns match the same bill
  const billStateMap = new Map<string, ReconciledBill>();
  [...purchaseBills, ...expenseBills, ...salesInvoices].forEach((b) => {
    billStateMap.set(`${b.kind}:${b.id}`, { ...b });
  });

  const txById = new Map(transactions.map((t) => [t.id, t]));
  let matchedCount = 0;

  for (const proposal of autoMatches) {
    const tx = txById.get(proposal.transactionId);
    const billKey = `${proposal.billKind}:${proposal.billId}`;
    const bill = billStateMap.get(billKey);
    if (!tx || !bill) continue;

    await applyBillMatch(tx, bill, proposal.matchAmount);
    matchedCount++;

    // Advance local snapshot for next match on same bill
    const nextBankPaid = round2(bill.bankPaidAmount + proposal.matchAmount);
    const nextTotalPaid = round2(bill.basePaidAmount + nextBankPaid);
    billStateMap.set(billKey, {
      ...bill,
      bankPaidAmount: nextBankPaid,
      amountPaidOrReceived: nextTotalPaid,
      outstandingBalance: round2(Math.max(0, bill.totalAmount - nextTotalPaid)),
      paymentStatus: computePaymentStatus(bill.totalAmount, nextTotalPaid),
    });
  }

  // Persist uncertain suggestions WITHOUT forcing a match
  const matchedTxIds = new Set(autoMatches.map((m) => m.transactionId));
  const suggestionMap = new Map(suggestions.map((s) => [s.transactionId, s]));

  let unmatchedCount = 0;
  for (const tx of transactions) {
    if (matchedTxIds.has(tx.id)) continue;
    if (tx.match_status === 'pending_review' || tx.match_status === 'unmatched') {
      unmatchedCount++;
      const sug = suggestionMap.get(tx.id);
      if (sug) {
        await updateDoc(doc(db, 'transactions', tx.id), {
          match_status: 'unmatched',
          confidence_score: sug.confidence,
          match_explanation: sug.reason,
          metadata: {
            suggested_doc_id: sug.billId,
            suggested_doc_type: sug.billKind,
            suggestion_reason: sug.reason,
          },
        }).catch(() => {});
      } else if (tx.match_status === 'pending_review') {
        await updateDoc(doc(db, 'transactions', tx.id), {
          match_status: 'unmatched',
        }).catch(() => {});
      }
    }
  }

  return {
    matchedCount,
    suggestionCount: suggestions.length,
    unmatchedCount,
  };
}

export async function syncMissingStatementReminder(
  monthKey: string,
  monthLabel: string,
  isCovered: boolean
): Promise<void> {
  if (!db) return;
  const notifRef = doc(db, 'notifications', `missing_stmt_${monthKey}`);

  try {
    if (isCovered) {
      const existing = await getDoc(notifRef);
      if (existing.exists()) {
        await deleteDoc(notifRef).catch(async () => {
          await updateDoc(notifRef, { is_read: true });
        });
      }
    } else {
      const existing = await getDoc(notifRef);
      if (!existing.exists()) {
        await setDoc(notifRef, {
          title: `Bank Statement Missing — ${monthLabel}`,
          message: `Please upload your bank statement for ${monthLabel} to complete bill reconciliation.`,
          user_id: 'system',
          type: 'reconciliation',
          link: '/reconciliation',
          month_key: monthKey,
          is_read: false,
          created_at: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    console.warn('Could not sync statement reminder notification:', err);
  }
}

export async function saveReconciliationSettings(settings: ReconciliationSettings): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  await setDoc(
    doc(db, 'reconciliation_settings', 'default'),
    {
      recipientEmail: settings.recipientEmail.trim(),
      reportDeliveryDay: Math.min(28, Math.max(1, Number(settings.reportDeliveryDay) || 7)),
      statementReminderDay: Math.min(28, Math.max(1, Number(settings.statementReminderDay) || 5)),
      updatedAt: serverTimestamp(),
      updatedBy: auth?.currentUser?.uid || 'system',
    },
    { merge: true }
  );
}

export interface SendReportEmailOutcome {
  status: 'sent' | 'already_sent' | 'pending_statement' | 'missing_recipient' | 'needs_smtp_config' | 'error';
  message: string;
}

export async function dispatchMonthlyReportEmail(params: {
  report: MonthlyReconciliationReportData;
  recipientEmail: string;
  companyName?: string;
  forceManual?: boolean;
}): Promise<SendReportEmailOutcome> {
  if (!db) return { status: 'error', message: 'Database not initialized' };

  const { report, recipientEmail, companyName, forceManual = false } = params;
  const cleanEmail = (recipientEmail || '').trim();
  if (!cleanEmail) {
    return {
      status: 'missing_recipient',
      message: 'Please configure a recipient email address in Reconciliation Settings.',
    };
  }

  const logRef = doc(db, 'reconciliation_report_logs', report.monthKey);
  const existingLog = await getDoc(logRef);

  // Prevent duplicate automated emails for the same reporting month
  if (!forceManual && existingLog.exists() && existingLog.data()?.status === 'sent') {
    return {
      status: 'already_sent',
      message: `Monthly report for ${report.monthLabel} has already been emailed to ${existingLog.data()?.recipientEmail}.`,
    };
  }

  // Require full statement coverage before emailing
  if (!report.coverage.isCovered) {
    await setDoc(
      logRef,
      {
        monthKey: report.monthKey,
        monthLabel: report.monthLabel,
        status: 'pending_statement',
        recipientEmail: cleanEmail,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await syncMissingStatementReminder(report.monthKey, report.monthLabel, false);
    return {
      status: 'pending_statement',
      message: `Report for ${report.monthLabel} is pending because the bank statement is missing or incomplete.`,
    };
  }

  const { subject, html, text } = renderMonthlyReportEmailHtml(report, companyName);

  try {
    const res = await fetch(resolveApiUrl('/api/reconciliation/send-monthly-report'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: cleanEmail,
        subject,
        html,
        text,
        monthKey: report.monthKey,
        monthLabel: report.monthLabel,
      }),
    });

    const data = await res.json();

    if (res.ok && data.sent) {
      await setDoc(logRef, {
        monthKey: report.monthKey,
        monthLabel: report.monthLabel,
        status: 'sent',
        recipientEmail: cleanEmail,
        sentAt: serverTimestamp(),
        purchaseSummary: report.purchaseSummary,
        expenseSummary: report.expenseSummary,
        invoiceSummary: report.invoiceSummary,
        messageId: data.messageId || '',
      });
      return {
        status: 'sent',
        message: `Monthly report for ${report.monthLabel} emailed to ${cleanEmail}.`,
      };
    }

    if (data.needsConfiguration) {
      await setDoc(
        logRef,
        {
          monthKey: report.monthKey,
          monthLabel: report.monthLabel,
          status: 'pending_smtp_config',
          recipientEmail: cleanEmail,
          error: data.error || 'SMTP credentials not configured',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return {
        status: 'needs_smtp_config',
        message: data.error || 'SMTP email credentials are not configured yet on the backend server.',
      };
    }

    throw new Error(data.error || 'Email delivery failed');
  } catch (err: any) {
    return {
      status: 'error',
      message: err.message || 'Could not reach the email dispatch service.',
    };
  }
}

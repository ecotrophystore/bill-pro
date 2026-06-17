import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp, orderBy } from 'firebase/firestore';
import type { PaymentRecord, Invoice, CashMemo } from '../../types';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Invoice | CashMemo;
  documentType: 'invoice' | 'cash_memo';
  onPaymentUpdated: () => void;
}

export default function PaymentModal({ isOpen, onClose, document, documentType, onPaymentUpdated }: PaymentModalProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<string>(documentType === 'invoice' ? 'Bank Transfer' : 'Cash');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPayments = async () => {
    if (!db) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'payments'),
        where('linked_document_id', '==', document.id)
      );
      const snap = await getDocs(q);
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentRecord));
      fetched.sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));
      setPayments(fetched);
    } catch (err) {
      console.error("Error fetching payments", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPayments();
      setAmount(document.balance_amount || 0);
    }
  }, [isOpen, document.id, document.balance_amount]);

  if (!isOpen) return null;

  const handleAddPayment = async () => {
    if (amount <= 0 || amount > (document.balance_amount || 0)) {
      alert("Invalid payment amount.");
      return;
    }
    // Removed mandatory reference number check for testing

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db!);
      
      const paymentRef = doc(collection(db!, 'payments'));
      const paymentData: Omit<PaymentRecord, 'id'> = {
        linked_document_id: document.id,
        linked_document_type: documentType,
        amount,
        method,
        date,
        reference_number: reference,
        status: 'completed',
        created_at: serverTimestamp() as any,
        created_by: 'admin' // In a real app, use auth.currentUser.uid
      };
      
      batch.set(paymentRef, paymentData);

      const newBalance = (document.balance_amount || 0) - amount;
      const newStatus = newBalance <= 0 ? 'paid' : 'partial';

      const docRef = doc(db!, documentType === 'invoice' ? 'invoices' : 'cash_memos', document.id);
      batch.update(docRef, {
        balance_amount: newBalance,
        payment_status: newStatus
      });

      // For Invoices, create a Transaction record for bank reconciliation
      if (documentType === 'invoice') {
        const txnRef = doc(collection(db!, 'transactions'));
        batch.set(txnRef, {
          date: date,
          description: `Payment for Invoice ${document.number}`,
          reference_number: reference,
          amount: amount,
          type: 'credit',
          source: 'manual_entry',
          match_status: 'pending',
          created_at: serverTimestamp(),
          linked_invoice_id: document.id
        });
      }

      await batch.commit();
      
      setAmount((document.balance_amount || 0) - amount);
      setReference('');
      alert("Payment added successfully!");
      fetchPayments();
      onPaymentUpdated();
    } catch (err: any) {
      console.error("Error adding payment", err);
      alert("Failed to add payment: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoidPayment = async (paymentId: string, paymentAmount: number) => {
    const reason = window.prompt("Enter reason for voiding this payment:");
    if (!reason) return;

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db!);
      
      const paymentRef = doc(db!, 'payments', paymentId);
      batch.update(paymentRef, {
        status: 'voided',
        void_reason: reason,
        voided_at: serverTimestamp(),
        voided_by: 'admin'
      });

      const newBalance = (document.balance_amount || 0) + paymentAmount;
      const newStatus = newBalance >= (document.grand_total || 0) ? 'unpaid' : 'partial';

      const docRef = doc(db!, documentType === 'invoice' ? 'invoices' : 'cash_memos', document.id);
      batch.update(docRef, {
        balance_amount: newBalance,
        payment_status: newStatus
      });

      await batch.commit();
      fetchPayments();
      onPaymentUpdated();
    } catch (err) {
      console.error("Error voiding payment", err);
      alert("Failed to void payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-neo-raised border border-shadow-darker/10 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-shadow-darker/10 flex justify-between items-center bg-primary-light/10">
          <div>
            <h2 className="text-xl font-bold text-primary-dark">Manage Payments</h2>
            <p className="text-sm text-secondary">Document: {document.number} | Balance: ₹{(document.balance_amount || 0).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="p-2 text-secondary hover:text-error transition-colors rounded-full hover:bg-error/10">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {document.balance_amount !== undefined && document.balance_amount > 0 && (
            <div className="bg-shadow-darker/5 p-5 rounded-xl border border-shadow-darker/10 space-y-4">
              <h3 className="font-semibold text-primary-dark">Record New Payment</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-secondary">Amount</label>
                  <input type="number" className="neo-input w-full" value={amount || ''} onChange={e => setAmount(parseFloat(e.target.value) || 0)} max={document.balance_amount} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-secondary">Method</label>
                  <select className="neo-input w-full" value={method} onChange={e => setMethod(e.target.value)}>
                    {documentType === 'invoice' ? (
                      <>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="NEFT">NEFT</option>
                        <option value="RTGS">RTGS</option>
                        <option value="IMPS">IMPS</option>
                      </>
                    ) : (
                      <>
                        <option value="Cash">Cash</option>
                        <option value="GPay">GPay</option>
                        <option value="PhonePe">PhonePe</option>
                        <option value="Paytm">Paytm</option>
                        <option value="UPI">UPI</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-secondary">Date</label>
                  <input type="date" className="neo-input w-full" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-secondary">Reference</label>
                  <input type="text" className="neo-input w-full" placeholder="Optional" value={reference} onChange={e => setReference(e.target.value)} />
                </div>
              </div>
              <button 
                onClick={handleAddPayment}
                disabled={isSubmitting || amount <= 0}
                className="neo-btn-primary w-full flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Add Payment
              </button>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-primary-dark mb-4">Payment History</h3>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="animate-spin text-primary" /></div>
            ) : payments.length === 0 ? (
              <p className="text-secondary text-sm text-center py-4">No payments recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {payments.map(payment => (
                  <div key={payment.id} className={`p-4 rounded-xl border flex justify-between items-center ${payment.status === 'voided' ? 'bg-error/5 border-error/20 opacity-75' : 'bg-surface border-shadow-darker/10'}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary-dark">₹{payment.amount.toLocaleString()}</span>
                        <span className="text-xs bg-shadow-darker/10 px-2 py-0.5 rounded-full text-secondary">{payment.method}</span>
                        {payment.status === 'voided' && <span className="text-xs bg-error/10 text-error px-2 py-0.5 rounded-full font-bold">VOIDED</span>}
                      </div>
                      <div className="text-xs text-secondary mt-1">
                        {payment.date} {payment.reference_number && `• Ref: ${payment.reference_number}`}
                      </div>
                      {payment.status === 'voided' && payment.void_reason && (
                        <div className="text-xs text-error mt-1 flex items-center gap-1">
                          <AlertCircle size={12} /> Reason: {payment.void_reason}
                        </div>
                      )}
                    </div>
                    {payment.status !== 'voided' && (
                      <button 
                        onClick={() => handleVoidPayment(payment.id, payment.amount)}
                        disabled={isSubmitting}
                        className="text-xs text-error hover:underline px-2 py-1 flex items-center gap-1"
                      >
                        <Trash2 size={14} /> Void
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

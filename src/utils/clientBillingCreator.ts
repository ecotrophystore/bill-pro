import { db, auth } from '../lib/firebase';
import { 
  collection, 
  doc, 
  runTransaction, 
  serverTimestamp, 
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';

import { formatDocumentNumber } from './numberGenerator';
import type { Settings } from '../types';

const exactRound = (num: number): number => {
  return Math.round(num * 100) / 100;
};

// Helper to retrieve saved company settings from localStorage
export function getSavedCompanySettings(): Partial<Settings> {
  try {
    const saved = localStorage.getItem('companySettings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error('Error reading companySettings from localStorage:', err);
  }
  return {};
}

// Helper to get the highest existing sequence number from a collection
export async function getHighestExistingNumber(collectionName: string, prefix: string): Promise<number> {
  if (!db) return 0;
  try {
    const q = query(
      collection(db, collectionName),
      where('number', '>=', prefix),
      where('number', '<=', prefix + '\uf8ff'),
      orderBy('number', 'desc'),
      limit(20)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      let maxSeq = 0;
      for (const d of snapshot.docs) {
        const lastNumStr = d.data().number || '';
        const parts = lastNumStr.split(/[-/]/);
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq) && lastSeq > maxSeq) {
          maxSeq = lastSeq;
        }
      }
      if (maxSeq > 0) return maxSeq;
    }

    // Fallback: query without prefix filter in case legacy records used varied format
    const allQ = query(collection(db, collectionName), limit(50));
    const allSnap = await getDocs(allQ);
    let maxSeq = 0;
    for (const d of allSnap.docs) {
      const lastNumStr = d.data().number || '';
      const parts = lastNumStr.split(/[-/]/);
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq) && lastSeq > maxSeq) {
        maxSeq = lastSeq;
      }
    }
    return maxSeq;
  } catch (error) {
    console.error(`Error fetching highest existing number for ${collectionName}:`, error);
    try {
      const allQ = query(collection(db, collectionName), limit(50));
      const allSnap = await getDocs(allQ);
      let maxSeq = 0;
      for (const d of allSnap.docs) {
        const lastNumStr = d.data().number || '';
        const parts = lastNumStr.split(/[-/]/);
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq) && lastSeq > maxSeq) {
          maxSeq = lastSeq;
        }
      }
      return maxSeq;
    } catch {
      return 0;
    }
  }
}

// Helper to sync sequence value in system collection after a deletion
export async function syncSequenceAfterDelete(collectionName: string, seqDocName: string, prefix: string) {
  if (!db) return;
  try {
    const highestVal = await getHighestExistingNumber(collectionName, prefix);
    const sequenceRef = doc(db, "system", seqDocName);
    await setDoc(sequenceRef, {
      last_value: highestVal,
      updated_at: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error(`Error syncing sequence for ${collectionName} after delete:`, error);
  }
}

// Local library sync (products and customers)
async function clientSyncToLibrary(uid: string, items: any[], customerId?: string, customerName?: string) {
  if (!db) return;
  try {
    // 1. Sync Customer
    if (customerId && customerName && customerId.length > 10) {
       const customerRef = doc(db, "customers", customerId);
       const cDoc = await getDoc(customerRef);
       if (!cDoc.exists()) {
         await setDoc(customerRef, {
           name: customerName,
           type: 'individual',
           created_at: serverTimestamp()
         }, { merge: true });
       }
    }
  } catch (error) {
    console.error("Client Library Sync Failure:", error);
  }
}

export async function clientCreateQuotation(rawData: any) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  const highestExisting = await getHighestExistingNumber("quotations", "QTN-");

  return await runTransaction(db, async (transaction) => {
    let subtotal = 0;
    let totalTax = 0;
    const discountPercent = rawData.discount_percent || 0;
    const rawSubtotal = rawData.items.reduce((acc: number, item: any) => acc + exactRound((item.quantity || 0) * (item.rate || 0)), 0);
    const discountAmount = exactRound((rawSubtotal * discountPercent) / 100);

    const validatedItems = rawData.items.map((item: any) => {
      const lineTotalRaw = (item.quantity || 0) * (item.rate || 0);
      const lineTotal = exactRound(lineTotalRaw);
      const discountedLine = exactRound(lineTotal - (lineTotal * discountPercent) / 100);
      const taxAmountRaw = rawData.customer_type === 'non_gst' ? 0 : ((discountedLine * (item.tax_percentage || 0)) / 100);
      const taxAmount = exactRound(taxAmountRaw);
      subtotal += discountedLine;
      totalTax += taxAmount;
      return { ...item, line_total: lineTotal, tax_amount: taxAmount };
    });

    const charge = rawData.charge_amount || rawData.chargeAmount || 0;
    const grandTotalExact = subtotal + totalTax + charge;
    const finalGrandTotal = Math.round(grandTotalExact);
    const roundOff = exactRound(finalGrandTotal - grandTotalExact);

    let quotationNumber = rawData.number;
    if (!quotationNumber) {
      const settings = getSavedCompanySettings();
      const prefix = (settings.quotation_prefix || 'QTN').trim().toUpperCase();
      const format = settings.quotation_format || 'prefix_hyphen_fy';
      const year = settings.quotation_year || '';
      const configuredStart = settings.quotation_next_number || 1;

      const sequenceRef = doc(db, "system", "quotation_sequence");
      const seqDoc = await transaction.get(sequenceRef);
      const currentSeqVal = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
      
      const nextSeq = Math.max(highestExisting + 1, currentSeqVal + 1, configuredStart);
      quotationNumber = formatDocumentNumber(prefix, format, nextSeq, year);

      transaction.set(sequenceRef, { 
        last_value: nextSeq, 
        updated_at: serverTimestamp() 
      }, { merge: true });
    }

    const quotationRef = doc(collection(db, "quotations"));
    const quotationData = {
      ...rawData,
      number: quotationNumber,
      items: validatedItems,
      subtotal: exactRound(rawSubtotal),
      tax_total: exactRound(totalTax),
      cgst: rawData.is_igst ? 0 : exactRound(totalTax / 2),
      sgst_igst: rawData.is_igst ? exactRound(totalTax) : exactRound(totalTax / 2),
      discount_amount: discountAmount,
      charge_amount: charge,
      round_off: roundOff,
      grand_total: finalGrandTotal,
      status: rawData.status || 'draft',
      created_by: uid,
      created_at: serverTimestamp()
    };

    transaction.set(quotationRef, quotationData);

    // Non-blocking library sync
    setTimeout(() => clientSyncToLibrary(uid, validatedItems, rawData.customer_id, rawData.customer_name), 0);

    return { success: true, quotationId: quotationRef.id, quotationNumber };
  });
}

export async function clientCreateInvoice(rawData: any) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  const d = new Date();
  let fyYear = d.getFullYear();
  if (d.getMonth() < 3) fyYear -= 1;

  const highestExisting = await getHighestExistingNumber("invoices", `ECO/${fyYear}/`);

  return await runTransaction(db, async (transaction) => {
    let subtotal = 0;
    let totalTax = 0;

    const validatedItems = rawData.items.map((item: any) => {
      const lineTotalRaw = (item.quantity || 0) * (item.rate || 0);
      const taxAmountRaw = (lineTotalRaw * (item.tax_percentage || 0)) / 100;
      const lineTotal = exactRound(lineTotalRaw);
      const taxAmount = exactRound(taxAmountRaw);
      subtotal += lineTotal;
      totalTax += taxAmount;
      return { ...item, line_total: lineTotal, tax_amount: taxAmount };
    });

    const discountPercent = rawData.discount_percent || 0;
    const discountAmount = exactRound(((subtotal + totalTax) * discountPercent) / 100);
    const charge = rawData.charge_amount || rawData.chargeAmount || 0;
    const grandTotalExact = subtotal + totalTax - discountAmount + charge;
    const finalGrandTotal = Math.round(grandTotalExact);
    const roundOff = exactRound(finalGrandTotal - grandTotalExact);

    let invoiceNumber = rawData.number;
    if (!invoiceNumber) {
      const settings = getSavedCompanySettings();
      const prefix = (settings.invoice_prefix || 'ECO').trim().toUpperCase();
      const format = settings.invoice_format || 'prefix_hyphen_fy';
      const year = settings.invoice_year || '';
      const configuredStart = settings.invoice_next_number || 1;

      const sequenceRef = doc(db, "system", `invoice_sequence_${fyYear}`);
      const seqDoc = await transaction.get(sequenceRef);
      const currentSeqVal = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
      
      const nextSeq = Math.max(highestExisting + 1, currentSeqVal + 1, configuredStart);
      invoiceNumber = formatDocumentNumber(prefix, format, nextSeq, year);

      transaction.set(sequenceRef, { 
        last_value: nextSeq, 
        updated_at: serverTimestamp() 
      }, { merge: true });
    }

    const invoiceRef = doc(collection(db, "invoices"));
    const invoiceData = {
      ...rawData,
      number: invoiceNumber,
      is_locked: true,
      status: "finalized",
      payment_status: "unpaid",
      items: validatedItems,
      subtotal: exactRound(subtotal),
      tax_total: exactRound(totalTax),
      cgst: rawData.is_igst ? 0 : exactRound(totalTax / 2),
      sgst_igst: rawData.is_igst ? exactRound(totalTax) : exactRound(totalTax / 2),
      discount_amount: discountAmount,
      charge_amount: charge,
      round_off: roundOff,
      grand_total: finalGrandTotal,
      advance_amount: rawData.advance_amount || 0,
      balance_amount: rawData.balance_amount || finalGrandTotal,
      payment_history: [],
      created_by: uid,
      created_at: serverTimestamp(),
      audit_trail: [{
        action: "direct_creation",
        user: uid,
        timestamp: new Date().toISOString()
      }]
    };

    transaction.set(invoiceRef, invoiceData);

    const auditLogRef = doc(collection(db, "audit_logs"));
    transaction.set(auditLogRef, {
      document_type: "invoice",
      document_id: invoiceRef.id,
      action: "create",
      user_id: uid,
      timestamp: serverTimestamp(),
      notes: "Directly created tax invoice (client)"
    });

    setTimeout(() => clientSyncToLibrary(uid, validatedItems, rawData.customer_id, rawData.customer_name), 0);

    return { success: true, invoiceId: invoiceRef.id, invoiceNumber };
  });
}

export async function clientCreateProformaInvoice(rawData: any) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  const d = new Date();
  let fyYear = d.getFullYear();
  if (d.getMonth() < 3) fyYear -= 1;

  const highestExisting = await getHighestExistingNumber("proforma_invoices", `PI/${fyYear}/`);

  return await runTransaction(db, async (transaction) => {
    let subtotal = 0;
    let totalTax = 0;

    const validatedItems = rawData.items.map((item: any) => {
      const lineTotalRaw = (item.quantity || 0) * (item.rate || 0);
      const taxAmountRaw = (lineTotalRaw * (item.tax_percentage || 0)) / 100;
      const lineTotal = exactRound(lineTotalRaw);
      const taxAmount = exactRound(taxAmountRaw);
      subtotal += lineTotal;
      totalTax += taxAmount;
      return { ...item, line_total: lineTotal, tax_amount: taxAmount };
    });

    const discountPercent = rawData.discount_percent || 0;
    const discountAmount = exactRound(((subtotal + totalTax) * discountPercent) / 100);
    const charge = rawData.charge_amount || rawData.chargeAmount || 0;
    const grandTotalExact = subtotal + totalTax - discountAmount + charge;
    const finalGrandTotal = Math.round(grandTotalExact);
    const roundOff = exactRound(finalGrandTotal - grandTotalExact);

    let proformaNumber = rawData.number;
    if (!proformaNumber) {
      const settings = getSavedCompanySettings();
      const prefix = (settings.proforma_prefix || 'PI').trim().toUpperCase();
      const format = settings.proforma_format || 'prefix_hyphen_fy';
      const year = settings.proforma_year || '';
      const configuredStart = settings.proforma_next_number || 1;

      const sequenceRef = doc(db, "system", `proforma_sequence_${fyYear}`);
      const seqDoc = await transaction.get(sequenceRef);
      const currentSeqVal = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
      
      const nextSeq = Math.max(highestExisting + 1, currentSeqVal + 1, configuredStart);
      proformaNumber = formatDocumentNumber(prefix, format, nextSeq, year);

      transaction.set(sequenceRef, { 
        last_value: nextSeq, 
        updated_at: serverTimestamp() 
      }, { merge: true });
    }

    const proformaRef = doc(collection(db, "proforma_invoices"));
    const proformaData = {
      ...rawData,
      number: proformaNumber,
      is_locked: false,
      status: "draft",
      payment_status: rawData.payment_status || "unpaid",
      items: validatedItems,
      subtotal: exactRound(subtotal),
      tax_total: exactRound(totalTax),
      cgst: rawData.is_igst ? 0 : exactRound(totalTax / 2),
      sgst_igst: rawData.is_igst ? exactRound(totalTax) : exactRound(totalTax / 2),
      discount_amount: discountAmount,
      charge_amount: charge,
      round_off: roundOff,
      grand_total: finalGrandTotal,
      advance_amount: rawData.advance_amount || 0,
      balance_amount: rawData.balance_amount !== undefined ? rawData.balance_amount : Math.max(0, finalGrandTotal - (rawData.advance_amount || 0)),
      payment_history: [],
      created_by: uid,
      created_at: serverTimestamp(),
      audit_trail: [{
        action: "direct_creation",
        user: uid,
        timestamp: new Date().toISOString()
      }]
    };

    transaction.set(proformaRef, proformaData);

    const auditLogRef = doc(collection(db, "audit_logs"));
    transaction.set(auditLogRef, {
      document_type: "proforma_invoice",
      document_id: proformaRef.id,
      action: "create",
      user_id: uid,
      timestamp: serverTimestamp(),
      notes: "Directly created proforma invoice (client)"
    });

    setTimeout(() => clientSyncToLibrary(uid, validatedItems, rawData.customer_id, rawData.customer_name), 0);

    return { success: true, invoiceId: proformaRef.id, invoiceNumber: proformaNumber };
  });
}

export async function clientCreateCashMemo(rawData: any) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  const d = new Date();
  let fyYear = d.getFullYear();
  if (d.getMonth() < 3) fyYear -= 1;

  const highestExisting = await getHighestExistingNumber("cash_memos", `MEMO/${fyYear}/`);

  return await runTransaction(db, async (transaction) => {
    let subtotal = 0;

    const validatedItems = rawData.items.map((item: any) => {
      const lineTotalRaw = (item.quantity || 0) * (item.rate || 0);
      const lineTotal = exactRound(lineTotalRaw);
      subtotal += lineTotal;
      return {
        ...item,
        tax_percentage: 0,
        tax_amount: 0,
        line_total: lineTotal
      };
    });

    const discountPercent = rawData.discount_percent || 0;
    const discountAmount = exactRound((subtotal * discountPercent) / 100);
    const charge = rawData.charge_amount || rawData.chargeAmount || 0;
    const grandTotalExact = subtotal - discountAmount + charge;
    const finalGrandTotal = Math.round(grandTotalExact);
    const roundOff = exactRound(finalGrandTotal - grandTotalExact);

    let memoNumber = rawData.number;
    if (!memoNumber) {
      const settings = getSavedCompanySettings();
      const prefix = (settings.memo_prefix || 'MEMO').trim().toUpperCase();
      const format = settings.memo_format || 'prefix_hyphen_fy';
      const year = settings.memo_year || '';
      const configuredStart = settings.memo_next_number || 1;

      const sequenceRef = doc(db, "system", `memo_sequence_${fyYear}`);
      const seqDoc = await transaction.get(sequenceRef);
      const currentSeqVal = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
      
      const nextSeq = Math.max(highestExisting + 1, currentSeqVal + 1, configuredStart);
      memoNumber = formatDocumentNumber(prefix, format, nextSeq, year);

      transaction.set(sequenceRef, { 
        last_value: nextSeq, 
        updated_at: serverTimestamp() 
      }, { merge: true });
    }

    const memoRef = doc(collection(db, "cash_memos"));
    const memoData = {
      ...rawData,
      number: memoNumber,
      is_gst: false,
      is_locked: true,
      status: "finalized",
      payment_status: rawData.payment_status || "unpaid",
      payment_date: rawData.payment_status === "paid" ? (rawData.advance_payment_date || new Date().toISOString().split('T')[0]) : null,
      items: validatedItems,
      subtotal: exactRound(subtotal),
      tax_total: 0,
      cgst: 0,
      sgst_igst: 0,
      discount_amount: discountAmount,
      charge_amount: charge,
      round_off: roundOff,
      grand_total: finalGrandTotal,
      advance_amount: rawData.advance_amount || 0,
      balance_amount: rawData.balance_amount || finalGrandTotal,
      payment_history: [],
      created_by: uid,
      created_at: serverTimestamp(),
      audit_trail: [{
        action: "cash_memo_creation",
        user: uid,
        timestamp: new Date().toISOString()
      }]
    };

    transaction.set(memoRef, memoData);

    const auditLogRef = doc(collection(db, "audit_logs"));
    transaction.set(auditLogRef, {
      document_type: "cash_memo",
      document_id: memoRef.id,
      action: "create",
      user_id: uid,
      timestamp: serverTimestamp(),
      notes: "Created non-GST cash memo (client)"
    });

    setTimeout(() => clientSyncToLibrary(uid, validatedItems, rawData.customer_id, rawData.customer_name), 0);

    return { success: true, memoId: memoRef.id, memoNumber };
  });
}

// Helper to derive Proforma number from Quotation number (e.g., QTN/25-26/0002 -> PI/25-26/0002)
export function deriveProformaNumberFromQuotation(quotationNumber?: string, targetPrefix?: string): string {
  const settings = getSavedCompanySettings();
  const prefix = (targetPrefix || settings.proforma_prefix || 'PI').trim().toUpperCase();
  const format = settings.proforma_format || 'prefix_hyphen_fy';
  const year = settings.proforma_year || '';

  if (!quotationNumber) {
    return formatDocumentNumber(prefix, format, 1, year);
  }
  const clean = quotationNumber.trim();
  const parts = clean.split(/[-/]/);
  const lastPart = parseInt(parts[parts.length - 1], 10);
  if (!isNaN(lastPart)) {
    return formatDocumentNumber(prefix, format, lastPart, year);
  }
  if (/^[A-Za-z0-9_]+([/-].*)$/.test(clean)) {
    return clean.replace(/^[A-Za-z0-9_]+([/-].*)$/, `${prefix}$1`);
  }
  return `${prefix}/${clean}`;
}

// Helper to derive Invoice number from Proforma number (e.g., PI/25-26/0002 -> ECO/25-26/0002)
export function deriveInvoiceNumberFromProforma(proformaNumber?: string, targetPrefix?: string): string {
  const settings = getSavedCompanySettings();
  const prefix = (targetPrefix || settings.invoice_prefix || 'ECO').trim().toUpperCase();
  const format = settings.invoice_format || 'prefix_hyphen_fy';
  const year = settings.invoice_year || '';

  if (!proformaNumber) {
    return formatDocumentNumber(prefix, format, 1, year);
  }
  const clean = proformaNumber.trim();
  const parts = clean.split(/[-/]/);
  const lastPart = parseInt(parts[parts.length - 1], 10);
  if (!isNaN(lastPart)) {
    return formatDocumentNumber(prefix, format, lastPart, year);
  }
  if (/^[A-Za-z0-9_]+([/-].*)$/.test(clean)) {
    return clean.replace(/^[A-Za-z0-9_]+([/-].*)$/, `${prefix}$1`);
  }
  return `${prefix}/${clean}`;
}

// Helper to derive Cash Memo number from Quotation number (e.g., QTN/25-26/0001 -> MEMO/25-26/0001)
export function deriveCashMemoNumberFromQuotation(quotationNumber?: string, targetPrefix?: string): string {
  const settings = getSavedCompanySettings();
  const prefix = (targetPrefix || settings.memo_prefix || 'MEMO').trim().toUpperCase();
  const format = settings.memo_format || 'prefix_hyphen_fy';
  const year = settings.memo_year || '';

  if (!quotationNumber) {
    return formatDocumentNumber(prefix, format, 1, year);
  }
  const clean = quotationNumber.trim();
  const parts = clean.split(/[-/]/);
  const lastPart = parseInt(parts[parts.length - 1], 10);
  if (!isNaN(lastPart)) {
    return formatDocumentNumber(prefix, format, lastPart, year);
  }
  if (/^[A-Za-z0-9_]+([/-].*)$/.test(clean)) {
    return clean.replace(/^[A-Za-z0-9_]+([/-].*)$/, `${prefix}$1`);
  }
  return `${prefix}/${clean}`;
}

export async function clientConvertQuotationToProforma(quotationId: string, force: boolean = false) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  try {
    return await runTransaction(db, async (transaction) => {
      const quotationRef = doc(db, "quotations", quotationId);
      const qDoc = await transaction.get(quotationRef);
      if (!qDoc.exists()) throw new Error("Quotation not found");
      const qData = qDoc.data();

      if (qData.conversion_status === "converted" && qData.linked_proforma_id && !force) {
        const piRef = doc(db, "proforma_invoices", qData.linked_proforma_id);
        const piSnap = await transaction.get(piRef);
        if (piSnap.exists()) {
          return {
            success: true,
            proformaId: qData.linked_proforma_id,
            proformaNumber: qData.proformaInvoiceNumber || piSnap.data()?.number || qData.linked_proforma_id
          };
        }
      }

      let subtotal = 0;
      let totalTax = 0;

      const validatedItems = (qData.items || []).map((item: any) => {
        const lineTotalRaw = (item.quantity || 0) * (item.rate || 0);
        const taxPercentage = item.tax_percentage !== undefined ? item.tax_percentage : 18;
        const taxAmountRaw = (lineTotalRaw * taxPercentage) / 100;
        const lineTotal = exactRound(lineTotalRaw);
        const taxAmount = exactRound(taxAmountRaw);
        subtotal += lineTotal;
        totalTax += taxAmount;
        return { 
          ...item, 
          line_total: lineTotal, 
          tax_amount: taxAmount,
          tax_percentage: taxPercentage
        };
      });

      const discountPercent = qData.discount_percent || 0;
      const discountAmount = exactRound(((subtotal + totalTax) * discountPercent) / 100);
      const charge = qData.charge_amount || qData.chargeAmount || 0;
      const grandTotalExact = subtotal + totalTax - discountAmount + charge;
      const finalGrandTotal = Math.round(grandTotalExact);
      const roundOff = exactRound(finalGrandTotal - grandTotalExact);

      // Derived Proforma Number changing QTN -> PI (e.g. QTN/25/26/0002 -> PI/25/26/0002)
      const proformaNumber = deriveProformaNumberFromQuotation(qData.number);

      const advanceAmount = qData.advance_amount || 0;
      const balanceAmount = Math.max(0, finalGrandTotal - advanceAmount);
      const initialPaymentStatus = balanceAmount <= 0 ? "paid" : (advanceAmount > 0 ? "partial" : "unpaid");

      const proformaRef = doc(collection(db, "proforma_invoices"));
      const proformaData = {
        ...qData,
        id: proformaRef.id,
        number: proformaNumber,
        documentType: "proforma_invoice",
        is_locked: false,
        is_gst: true,
        status: "draft",
        conversion_status: null,
        convertedToInvoice: false,
        linked_invoice_id: null,
        payment_status: initialPaymentStatus,
        items: validatedItems,
        subtotal: exactRound(subtotal),
        tax_total: exactRound(totalTax),
        cgst: qData.is_igst ? 0 : exactRound(totalTax / 2),
        sgst_igst: qData.is_igst ? exactRound(totalTax) : exactRound(totalTax / 2),
        discount_amount: discountAmount,
        charge_amount: charge,
        round_off: roundOff,
        grand_total: finalGrandTotal,
        advance_amount: advanceAmount,
        balance_amount: balanceAmount,
        payment_history: [],
        sourceDocumentType: "gst_quotation",
        sourceQuotationId: quotationId,
        sourceQuotationNumber: qData.number || "",
        linked_quotation_id: quotationId,
        created_by: uid,
        created_at: serverTimestamp(),
        proforma_date: serverTimestamp(),
        updated_at: serverTimestamp(),
        audit_trail: [{
          action: "converted_from_quotation",
          user: uid,
          timestamp: new Date().toISOString()
        }]
      };

      transaction.set(proformaRef, proformaData);

      transaction.update(quotationRef, {
        conversion_status: "converted",
        convertedToProforma: true,
        linked_proforma_id: proformaRef.id,
        proformaInvoiceId: proformaRef.id,
        proformaInvoiceNumber: proformaNumber,
        convertedAt: serverTimestamp(),
        status: "converted",
        updated_at: serverTimestamp()
      });

      return { success: true, proformaId: proformaRef.id, proformaNumber };
    });
  } catch (txError) {
    console.warn("Transaction conversion had an issue, attempting direct setDoc fallback:", txError);
    const quotationRef = doc(db, "quotations", quotationId);
    const qDoc = await getDoc(quotationRef);
    if (!qDoc.exists()) throw new Error("Quotation not found");
    const qData = qDoc.data();

    let subtotal = 0;
    let totalTax = 0;

    const validatedItems = (qData.items || []).map((item: any) => {
      const lineTotalRaw = (item.quantity || 0) * (item.rate || 0);
      const taxPercentage = item.tax_percentage !== undefined ? item.tax_percentage : 18;
      const taxAmountRaw = (lineTotalRaw * taxPercentage) / 100;
      const lineTotal = exactRound(lineTotalRaw);
      const taxAmount = exactRound(taxAmountRaw);
      subtotal += lineTotal;
      totalTax += taxAmount;
      return { 
        ...item, 
        line_total: lineTotal, 
        tax_amount: taxAmount,
        tax_percentage: taxPercentage
      };
    });

    const discountPercent = qData.discount_percent || 0;
    const discountAmount = exactRound(((subtotal + totalTax) * discountPercent) / 100);
    const charge = qData.charge_amount || qData.chargeAmount || 0;
    const grandTotalExact = subtotal + totalTax - discountAmount + charge;
    const finalGrandTotal = Math.round(grandTotalExact);
    const roundOff = exactRound(finalGrandTotal - grandTotalExact);

    const proformaNumber = deriveProformaNumberFromQuotation(qData.number);
    const advanceAmount = qData.advance_amount || 0;
    const balanceAmount = Math.max(0, finalGrandTotal - advanceAmount);
    const initialPaymentStatus = balanceAmount <= 0 ? "paid" : (advanceAmount > 0 ? "partial" : "unpaid");

    const proformaRef = doc(collection(db, "proforma_invoices"));
    const proformaData = {
      ...qData,
      id: proformaRef.id,
      number: proformaNumber,
      documentType: "proforma_invoice",
      is_locked: false,
      is_gst: true,
      status: "draft",
      conversion_status: null,
      convertedToInvoice: false,
      linked_invoice_id: null,
      payment_status: initialPaymentStatus,
      items: validatedItems,
      subtotal: exactRound(subtotal),
      tax_total: exactRound(totalTax),
      cgst: qData.is_igst ? 0 : exactRound(totalTax / 2),
      sgst_igst: qData.is_igst ? exactRound(totalTax) : exactRound(totalTax / 2),
      discount_amount: discountAmount,
      charge_amount: charge,
      round_off: roundOff,
      grand_total: finalGrandTotal,
      advance_amount: advanceAmount,
      balance_amount: balanceAmount,
      payment_history: [],
      sourceDocumentType: "gst_quotation",
      sourceQuotationId: quotationId,
      sourceQuotationNumber: qData.number || "",
      linked_quotation_id: quotationId,
      created_by: uid,
      created_at: serverTimestamp(),
      proforma_date: serverTimestamp(),
      updated_at: serverTimestamp(),
      audit_trail: [{
        action: "converted_from_quotation",
        user: uid,
        timestamp: new Date().toISOString()
      }]
    };

    await setDoc(proformaRef, proformaData);
    await updateDoc(quotationRef, {
      conversion_status: "converted",
      convertedToProforma: true,
      linked_proforma_id: proformaRef.id,
      proformaInvoiceId: proformaRef.id,
      proformaInvoiceNumber: proformaNumber,
      convertedAt: serverTimestamp(),
      status: "converted",
      updated_at: serverTimestamp()
    });

    return { success: true, proformaId: proformaRef.id, proformaNumber };
  }
}

export async function clientConvertQuotationToCashMemo(quotationId: string) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  try {
    return await runTransaction(db, async (transaction) => {
      const quotationRef = doc(db, "quotations", quotationId);
      const qDoc = await transaction.get(quotationRef);
      if (!qDoc.exists()) throw new Error("Quotation not found");
      const qData = qDoc.data();

      if (qData.conversion_status === "converted" && qData.linked_memo_id) {
        const memoRef = doc(db, "cash_memos", qData.linked_memo_id);
        const memoSnap = await transaction.get(memoRef);
        if (memoSnap.exists()) {
          return {
            success: true,
            memoId: qData.linked_memo_id,
            memoNumber: memoSnap.data()?.number || qData.linked_memo_id
          };
        }
      }

      let subtotal = 0;

      const validatedItems = (qData.items || []).map((item: any) => {
        const lineTotalRaw = (item.quantity || 0) * (item.rate || 0);
        const lineTotal = exactRound(lineTotalRaw);
        subtotal += lineTotal;
        return {
          ...item,
          tax_percentage: 0,
          tax_amount: 0,
          line_total: lineTotal
        };
      });

      const discountPercent = qData.discount_percent || 0;
      const discountAmount = exactRound((subtotal * discountPercent) / 100);
      const charge = qData.charge_amount || qData.chargeAmount || 0;
      const grandTotalExact = subtotal - discountAmount + charge;
      const finalGrandTotal = Math.round(grandTotalExact);
      const roundOff = exactRound(finalGrandTotal - grandTotalExact);

      // Derived Cash Memo Number changing QTN -> MEMO
      const memoNumber = deriveCashMemoNumberFromQuotation(qData.number);

      const memoRef = doc(collection(db, "cash_memos"));
      const memoData = {
        ...qData,
        id: memoRef.id,
        number: memoNumber,
        documentType: "cash_memo",
        is_gst: false,
        is_locked: true,
        status: "finalized",
        payment_status: "paid",
        items: validatedItems,
        subtotal: exactRound(subtotal),
        tax_total: 0,
        cgst: 0,
        sgst_igst: 0,
        discount_amount: discountAmount,
        charge_amount: charge,
        round_off: roundOff,
        grand_total: finalGrandTotal,
        balance_amount: 0,
        payment_history: [],
        sourceDocumentType: "non_gst_quotation",
        sourceQuotationId: quotationId,
        sourceQuotationNumber: qData.number || "",
        linked_quotation_id: quotationId,
        created_by: uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        audit_trail: [{
          action: "converted_from_quotation",
          user: uid,
          timestamp: new Date().toISOString()
        }]
      };

      transaction.set(memoRef, memoData);

      transaction.update(quotationRef, {
        conversion_status: "converted",
        linked_memo_id: memoRef.id,
        status: "converted",
        updated_at: serverTimestamp()
      });

      return { success: true, memoId: memoRef.id, memoNumber };
    });
  } catch (txError) {
    console.warn("Direct write fallback for Cash Memo conversion:", txError);
    const quotationRef = doc(db, "quotations", quotationId);
    const qDoc = await getDoc(quotationRef);
    if (!qDoc.exists()) throw new Error("Quotation not found");
    const qData = qDoc.data();

    let subtotal = 0;
    const validatedItems = (qData.items || []).map((item: any) => {
      const lineTotalRaw = (item.quantity || 0) * (item.rate || 0);
      const lineTotal = exactRound(lineTotalRaw);
      subtotal += lineTotal;
      return { ...item, tax_percentage: 0, tax_amount: 0, line_total: lineTotal };
    });

    const discountPercent = qData.discount_percent || 0;
    const discountAmount = exactRound((subtotal * discountPercent) / 100);
    const charge = qData.charge_amount || qData.chargeAmount || 0;
    const grandTotalExact = subtotal - discountAmount + charge;
    const finalGrandTotal = Math.round(grandTotalExact);
    const roundOff = exactRound(finalGrandTotal - grandTotalExact);

    const memoNumber = deriveCashMemoNumberFromQuotation(qData.number);
    const memoRef = doc(collection(db, "cash_memos"));
    const memoData = {
      ...qData,
      id: memoRef.id,
      number: memoNumber,
      documentType: "cash_memo",
      is_gst: false,
      is_locked: true,
      status: "finalized",
      payment_status: "paid",
      items: validatedItems,
      subtotal: exactRound(subtotal),
      tax_total: 0,
      cgst: 0,
      sgst_igst: 0,
      discount_amount: discountAmount,
      charge_amount: charge,
      round_off: roundOff,
      grand_total: finalGrandTotal,
      balance_amount: 0,
      payment_history: [],
      sourceDocumentType: "non_gst_quotation",
      sourceQuotationId: quotationId,
      sourceQuotationNumber: qData.number || "",
      linked_quotation_id: quotationId,
      created_by: uid,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      audit_trail: [{
        action: "converted_from_quotation",
        user: uid,
        timestamp: new Date().toISOString()
      }]
    };

    await setDoc(memoRef, memoData);
    await updateDoc(quotationRef, {
      conversion_status: "converted",
      linked_memo_id: memoRef.id,
      status: "converted",
      updated_at: serverTimestamp()
    });

    return { success: true, memoId: memoRef.id, memoNumber };
  }
}

export async function clientConvertProformaToInvoice(proformaId: string) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  try {
    return await runTransaction(db, async (transaction) => {
      const proformaRef = doc(db, "proforma_invoices", proformaId);
      const pDoc = await transaction.get(proformaRef);
      if (!pDoc.exists()) throw new Error("Proforma Invoice not found");
      const pData = pDoc.data();

      if (pData.conversion_status === "converted" && pData.linked_invoice_id) {
        const invRef = doc(db, "invoices", pData.linked_invoice_id);
        const invSnap = await transaction.get(invRef);
        if (invSnap.exists()) {
          return {
            success: true,
            invoiceId: pData.linked_invoice_id,
            invoiceNumber: invSnap.data()?.number || pData.linked_invoice_id
          };
        }
      }

      // Derived Invoice Number changing PI -> INV (e.g. PI/25/26/0002 -> INV/25/26/0002)
      const invoiceNumber = deriveInvoiceNumberFromProforma(pData.number);

      const invoiceRef = doc(collection(db, "invoices"));
      const invoiceData = {
        ...pData,
        id: invoiceRef.id,
        number: invoiceNumber,
        documentType: "invoice",
        is_locked: true,
        status: "finalized",
        payment_status: "paid",
        balance_amount: 0,
        sourceDocumentType: "proforma_invoice",
        sourceProformaId: proformaId,
        sourceProformaNumber: pData.number || "",
        linked_proforma_id: proformaId,
        created_by: uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        audit_trail: [{
          action: "converted_from_proforma",
          user: uid,
          timestamp: new Date().toISOString()
        }]
      };

      transaction.set(invoiceRef, invoiceData);

      transaction.update(proformaRef, {
        conversion_status: "converted",
        linked_invoice_id: invoiceRef.id,
        status: "converted",
        updated_at: serverTimestamp()
      });

      return { success: true, invoiceId: invoiceRef.id, invoiceNumber };
    });
  } catch (txError) {
    console.warn("Direct write fallback for Proforma to Invoice conversion:", txError);
    const proformaRef = doc(db, "proforma_invoices", proformaId);
    const pDoc = await getDoc(proformaRef);
    if (!pDoc.exists()) throw new Error("Proforma Invoice not found");
    const pData = pDoc.data();

    const invoiceNumber = deriveInvoiceNumberFromProforma(pData.number);
    const invoiceRef = doc(collection(db, "invoices"));
    const invoiceData = {
      ...pData,
      id: invoiceRef.id,
      number: invoiceNumber,
      documentType: "invoice",
      is_locked: true,
      status: "finalized",
      payment_status: "paid",
      balance_amount: 0,
      sourceDocumentType: "proforma_invoice",
      sourceProformaId: proformaId,
      sourceProformaNumber: pData.number || "",
      linked_proforma_id: proformaId,
      created_by: uid,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      audit_trail: [{
        action: "converted_from_proforma",
        user: uid,
        timestamp: new Date().toISOString()
      }]
    };

    await setDoc(invoiceRef, invoiceData);
    await updateDoc(proformaRef, {
      conversion_status: "converted",
      linked_invoice_id: invoiceRef.id,
      status: "converted",
      updated_at: serverTimestamp()
    });

    return { success: true, invoiceId: invoiceRef.id, invoiceNumber };
  }
}

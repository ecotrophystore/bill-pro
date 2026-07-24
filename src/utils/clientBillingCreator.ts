import { db, auth } from '../lib/firebase';
import { 
  collection, 
  doc, 
  runTransaction, 
  serverTimestamp, 
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';

const exactRound = (num: number): number => {
  return Math.round(num * 100) / 100;
};

// Helper to get the highest existing sequence number from a collection
export async function getHighestExistingNumber(collectionName: string, prefix: string): Promise<number> {
  if (!db) return 0;
  try {
    const q = query(
      collection(db, collectionName),
      where('number', '>=', prefix),
      where('number', '<=', prefix + '\uf8ff'),
      orderBy('number', 'desc'),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;
    const lastNumStr = snapshot.docs[0].data().number || '';
    const parts = lastNumStr.split(/[-/]/);
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    return isNaN(lastSeq) ? 0 : lastSeq;
  } catch (error) {
    console.error(`Error fetching highest existing number for ${collectionName}:`, error);
    return 0;
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
      const sequenceRef = doc(db, "system", "quotation_sequence");
      const seqDoc = await transaction.get(sequenceRef);
      const currentSeqVal = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
      
      const nextSeq = Math.max(highestExisting + 1, currentSeqVal + 1);
      const paddedSeq = nextSeq.toString().padStart(4, "0");
      quotationNumber = `QTN-${paddedSeq}`;

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
      const sequenceRef = doc(db, "system", `invoice_sequence_${fyYear}`);
      const seqDoc = await transaction.get(sequenceRef);
      const currentSeqVal = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
      
      const nextSeq = Math.max(highestExisting + 1, currentSeqVal + 1);
      const paddedSeq = nextSeq.toString().padStart(4, "0");
      invoiceNumber = `ECO/${fyYear}/${paddedSeq}`;

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
      const sequenceRef = doc(db, "system", `proforma_sequence_${fyYear}`);
      const seqDoc = await transaction.get(sequenceRef);
      const currentSeqVal = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
      
      const nextSeq = Math.max(highestExisting + 1, currentSeqVal + 1);
      const paddedSeq = nextSeq.toString().padStart(4, "0");
      proformaNumber = `PI/${fyYear}/${paddedSeq}`;

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
      const sequenceRef = doc(db, "system", `memo_sequence_${fyYear}`);
      const seqDoc = await transaction.get(sequenceRef);
      const currentSeqVal = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
      
      const nextSeq = Math.max(highestExisting + 1, currentSeqVal + 1);
      const paddedSeq = nextSeq.toString().padStart(4, "0");
      memoNumber = `MEMO/${fyYear}/${paddedSeq}`;

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

export async function clientConvertQuotationToProforma(quotationId: string) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  return await runTransaction(db, async (transaction) => {
    const quotationRef = doc(db, "quotations", quotationId);
    const qDoc = await transaction.get(quotationRef);
    if (!qDoc.exists()) throw new Error("Quotation not found");
    const qData = qDoc.data();

    if (qData.conversion_status === "converted" && qData.linked_proforma_id) {
      const piRef = doc(db, "proforma_invoices", qData.linked_proforma_id);
      const piSnap = await transaction.get(piRef);
      if (piSnap.exists()) {
        throw new Error("This quotation was already converted");
      }
    }

    let subtotal = 0;
    let totalTax = 0;

    const validatedItems = (qData.items || []).map((item: any) => {
      const lineTotalRaw = (item.quantity || 0) * (item.rate || 0);
      const taxAmountRaw = (lineTotalRaw * (item.tax_percentage || 0)) / 100;
      const lineTotal = exactRound(lineTotalRaw);
      const taxAmount = exactRound(taxAmountRaw);
      subtotal += lineTotal;
      totalTax += taxAmount;
      return { ...item, line_total: lineTotal, tax_amount: taxAmount };
    });

    const discountPercent = qData.discount_percent || 0;
    const discountAmount = exactRound(((subtotal + totalTax) * discountPercent) / 100);
    const charge = qData.charge_amount || qData.chargeAmount || 0;
    const grandTotalExact = subtotal + totalTax - discountAmount + charge;
    const finalGrandTotal = Math.round(grandTotalExact);
    const roundOff = exactRound(finalGrandTotal - grandTotalExact);

    const d = new Date();
    let fyYear = d.getFullYear();
    if (d.getMonth() < 3) fyYear -= 1;

    const sequenceRef = doc(db, "system", `proforma_sequence_${fyYear}`);
    const seqDoc = await transaction.get(sequenceRef);
    let currentSeq = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
    
    currentSeq += 1;
    const paddedSeq = currentSeq.toString().padStart(4, "0");
    const proformaNumber = `PI/${fyYear}/${paddedSeq}`;

    transaction.set(sequenceRef, { 
      last_value: currentSeq, 
      updated_at: serverTimestamp() 
    }, { merge: true });

    const advanceAmount = qData.advance_amount || 0;
    const balanceAmount = Math.max(0, finalGrandTotal - advanceAmount);
    const initialPaymentStatus = balanceAmount <= 0 ? "paid" : (advanceAmount > 0 ? "partial" : "unpaid");

    const proformaRef = doc(collection(db, "proforma_invoices"));
    const proformaData = {
      ...qData,
      number: proformaNumber,
      is_locked: false,
      status: "draft",
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
      linked_quotation_id: quotationId,
      created_by: uid,
      created_at: serverTimestamp(),
      audit_trail: [{
        action: "converted_from_quotation",
        user: uid,
        timestamp: new Date().toISOString()
      }]
    };

    transaction.set(proformaRef, proformaData);

    transaction.update(quotationRef, {
      conversion_status: "converted",
      linked_proforma_id: proformaRef.id,
      status: "converted"
    });

    const auditLogRef = doc(collection(db, "audit_logs"));
    transaction.set(auditLogRef, {
      document_type: "proforma_invoice",
      document_id: proformaRef.id,
      action: "create",
      user_id: uid,
      timestamp: serverTimestamp(),
      notes: `Converted from Quotation ${quotationId} (client)`
    });

    return { success: true, proformaId: proformaRef.id, proformaNumber };
  });
}

export async function clientConvertQuotationToCashMemo(quotationId: string) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  return await runTransaction(db, async (transaction) => {
    const quotationRef = doc(db, "quotations", quotationId);
    const qDoc = await transaction.get(quotationRef);
    if (!qDoc.exists()) throw new Error("Quotation not found");
    const qData = qDoc.data();

    if (qData.conversion_status === "converted" && qData.linked_memo_id) {
      const memoRef = doc(db, "cash_memos", qData.linked_memo_id);
      const memoSnap = await transaction.get(memoRef);
      if (memoSnap.exists()) {
        throw new Error("This quotation was already converted");
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

    const d = new Date();
    let fyYear = d.getFullYear();
    if (d.getMonth() < 3) fyYear -= 1;

    const sequenceRef = doc(db, "system", `memo_sequence_${fyYear}`);
    const seqDoc = await transaction.get(sequenceRef);
    let currentSeq = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
    
    currentSeq += 1;
    const paddedSeq = currentSeq.toString().padStart(4, "0");
    const memoNumber = `MEMO/${fyYear}/${paddedSeq}`;

    transaction.set(sequenceRef, { 
      last_value: currentSeq, 
      updated_at: serverTimestamp() 
    }, { merge: true });

    const memoRef = doc(collection(db, "cash_memos"));
    const memoData = {
      ...qData,
      number: memoNumber,
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
      linked_quotation_id: quotationId,
      created_by: uid,
      created_at: serverTimestamp(),
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
      status: "converted"
    });

    const auditLogRef = doc(collection(db, "audit_logs"));
    transaction.set(auditLogRef, {
      document_type: "cash_memo",
      document_id: memoRef.id,
      action: "create",
      user_id: uid,
      timestamp: serverTimestamp(),
      notes: `Converted from Quotation ${quotationId} (client)`
    });

    return { success: true, memoId: memoRef.id, memoNumber };
  });
}

export async function clientConvertProformaToInvoice(proformaId: string) {
  if (!db || !auth?.currentUser) throw new Error("Unauthenticated or Database Offline");
  const uid = auth.currentUser.uid;

  return await runTransaction(db, async (transaction) => {
    const proformaRef = doc(db, "proforma_invoices", proformaId);
    const pDoc = await transaction.get(proformaRef);
    if (!pDoc.exists()) throw new Error("Proforma Invoice not found");
    const pData = pDoc.data();

    if (pData.conversion_status === "converted" && pData.linked_invoice_id) {
      const invRef = doc(db, "invoices", pData.linked_invoice_id);
      const invSnap = await transaction.get(invRef);
      if (invSnap.exists()) {
        throw new Error("This Proforma Invoice was already converted");
      }
    }

    const d = new Date();
    let fyYear = d.getFullYear();
    if (d.getMonth() < 3) fyYear -= 1;

    const sequenceRef = doc(db, "system", `invoice_sequence_${fyYear}`);
    const seqDoc = await transaction.get(sequenceRef);
    let currentSeq = seqDoc.exists() ? seqDoc.data()?.last_value || 0 : 0;
    
    currentSeq += 1;
    const paddedSeq = currentSeq.toString().padStart(4, "0");
    const invoiceNumber = `ECO/${fyYear}/${paddedSeq}`;

    transaction.set(sequenceRef, { 
      last_value: currentSeq, 
      updated_at: serverTimestamp() 
    }, { merge: true });

    const invoiceRef = doc(collection(db, "invoices"));
    const invoiceData = {
      ...pData,
      number: invoiceNumber,
      is_locked: true,
      status: "finalized",
      payment_status: "paid", // auto converted when fully paid
      balance_amount: 0,
      linked_proforma_id: proformaId,
      created_by: uid,
      created_at: serverTimestamp(),
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
      status: "converted"
    });

    const auditLogRef = doc(collection(db, "audit_logs"));
    transaction.set(auditLogRef, {
      document_type: "invoice",
      document_id: invoiceRef.id,
      action: "create",
      user_id: uid,
      timestamp: serverTimestamp(),
      notes: `Converted from Proforma Invoice ${proformaId} (client)`
    });

    return { success: true, invoiceId: invoiceRef.id, invoiceNumber };
  });
}

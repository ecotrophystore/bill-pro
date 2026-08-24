import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Query, Timestamp, type Transaction } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { GoogleGenAI, Type } from "@google/genai";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { defineSecret } from "firebase-functions/params";
import { db } from "./config.js";

const whatsappAccessToken = defineSecret("META_WHATSAPP_ACCESS_TOKEN");

export * from './metaIntegration.js';
export * from './metaWebhookProcessor.js';
export * from './meta/facebook.js';
export * from './meta/instagram.js';


function getAI() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || '';
  return new GoogleGenAI({ apiKey });
}

setGlobalOptions({ 
    region: "asia-south1"
});

// Math utility to round exactly to nearest paise (2 decimals)
function exactRound(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * NEW: Automated Learning Engine
 * Syncs line items and customers to the master libraries.
 */
async function syncToLibrary(uid: string, items: any[], customerId?: string, customerName?: string) {
  try {
    // 1. Sync Customer
    if (customerId && customerName && customerId.length > 10) { // Basic ID check
       const cDoc = await db.collection("customers").doc(customerId).get();
       if (!cDoc.exists) {
         await db.collection("customers").doc(customerId).set({
           name: customerName,
           type: 'individual',
           created_at: FieldValue.serverTimestamp()
         }, { merge: true });
       }
    }

    // 2. Sync Products
    for (const item of items) {
      if (!item.description) continue;
      
      const query = await db.collection("products")
        .where("name", "==", item.description)
        .limit(1)
        .get();

      if (query.empty) {
        // AI Categorization (Rule #2b)
        const prompt = `Categorize this product description for a business inventory system. 
        Product: "${item.description}"
        Return ONLY a JSON object with: 
        { "category": "string", "size": "string", "specifications": ["string"] }`;
        
        const ai = getAI();
        const aiResult = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: prompt,
        });
        const aiText = aiResult.text || "";
        let aiParsed = { category: "General", size: "", specifications: [] };
        try {
          const cleanedText = aiText.replace(/```json|```/g, "").trim();
          aiParsed = JSON.parse(cleanedText);
        } catch (e) {
          console.error("AI Parse Error:", e);
        }

        await db.collection("products").add({
          name: item.description,
          hsn_code: item.hsn_code || "",
          retail_price: item.rate || 0,
          wholesale_price: item.rate || 0,
          tax_percentage: item.tax_percentage || 18,
          category: aiParsed.category,
          size: aiParsed.size,
          specifications: aiParsed.specifications,
          created_at: FieldValue.serverTimestamp()
        });
      }
    }
  } catch (error) {
    console.error("Library Sync Failure (non-blocking):", error);
  }
}

/**
 * 1. Invoice Numbering & 3. Conversion Gate
 * Converts a quotation into a full, locked invoice with absolute atomicity.
 */
export const convertQuotationToInvoice = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.data()?.role !== "accounts" && userDoc.data()?.role !== "admin") {
       throw new HttpsError("permission-denied", "Only Accounts can convert invoices");
    }

    const { quotationId } = request.data;
    if (!quotationId) throw new HttpsError("invalid-argument", "Missing quotationId");

    const quotationRef = db.collection("quotations").doc(quotationId);

    return await db.runTransaction(async (transaction) => {
      const qDoc = await transaction.get(quotationRef);
      if (!qDoc.exists) throw new HttpsError("not-found", "Quotation not found");
      
      const qData = qDoc.data();
      if (!qData) throw new HttpsError("internal", "No data");

      if (qData.conversion_status === "converted") {
        throw new HttpsError("already-exists", "This quotation was already converted");
      }

      let subtotal = 0;
      let totalTax = 0;
      
      const validatedItems = qData.items.map((item: any) => {
        const lineTotalRaw = item.quantity * item.rate;
        const taxAmountRaw = (lineTotalRaw * item.tax_percentage) / 100;
        
        const lineTotal = exactRound(lineTotalRaw);
        const taxAmount = exactRound(taxAmountRaw);
        
        subtotal += lineTotal;
        totalTax += taxAmount;
        
        return {
          ...item,
          line_total: lineTotal,
          tax_amount: taxAmount
        };
      });

      const grandTotalExact = subtotal + totalTax;
      const roundOff = exactRound(Math.round(grandTotalExact) - grandTotalExact);
      const finalGrandTotal = Math.round(grandTotalExact);

      let invoiceNumber: string | undefined;
      if (!invoiceNumber) {
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3) fyYear -= 1;

        const sequenceRef = db.collection("system").doc(`invoice_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        invoiceNumber = `ECO/${fyYear}/${paddedSeq}`;

        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }

      const invoiceRef = db.collection("invoices").doc();
      const advanceAmount = qData.advance_amount || 0;
      const balanceAmount = Math.max(0, finalGrandTotal - advanceAmount);
      const initialPaymentStatus = balanceAmount === 0 ? "paid" : (advanceAmount > 0 ? "partial" : "unpaid");

      const invoiceData = {
        number: invoiceNumber,
        customer_id: qData.customer_id,
        customer_name: qData.customer_name,
        is_gst: true,
        is_locked: true,
        status: "finalized",
        payment_status: initialPaymentStatus,
        items: validatedItems,
        subtotal: exactRound(subtotal),
        tax_total: exactRound(totalTax),
        cgst: exactRound(totalTax / 2),
        sgst_igst: exactRound(totalTax / 2),
        round_off: roundOff,
        grand_total: finalGrandTotal,
        advance_amount: advanceAmount,
        balance_amount: balanceAmount,
        payment_history: [],
        linked_quotation_id: quotationId,
        created_by: uid,
        created_at: FieldValue.serverTimestamp(),
        audit_trail: [{
          action: "converted_from_quotation",
          user: uid,
          timestamp: new Date().toISOString()
        }]
      };

      transaction.set(invoiceRef, invoiceData);

      transaction.update(quotationRef, {
        conversion_status: "converted",
        linked_invoice_id: invoiceRef.id,
        status: "converted"
      });
      
      const auditLogRef = db.collection("audit_logs").doc();
      transaction.set(auditLogRef, {
        document_type: "invoice",
        document_id: invoiceRef.id,
        action: "create",
        user_id: uid,
        timestamp: FieldValue.serverTimestamp(),
        notes: `Converted from Quotation ${quotationId}`
      });

      return { success: true, invoiceId: invoiceRef.id, invoiceNumber };
    });
  });

export const convertQuotationToCashMemo = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.data()?.role !== "accounts" && userDoc.data()?.role !== "admin") {
       throw new HttpsError("permission-denied", "Only Accounts can convert quotes");
    }

    const { quotationId } = request.data;
    if (!quotationId) throw new HttpsError("invalid-argument", "Missing quotationId");

    const quotationRef = db.collection("quotations").doc(quotationId);

    return await db.runTransaction(async (transaction) => {
      const qDoc = await transaction.get(quotationRef);
      if (!qDoc.exists) throw new HttpsError("not-found", "Quotation not found");
      const qData = qDoc.data();
      if (!qData) throw new HttpsError("internal", "No data");

      if (qData.conversion_status === "converted") {
        throw new HttpsError("already-exists", "This quotation was already converted");
      }

      let subtotal = 0;
      const validatedItems = qData.items.map((item: any) => {
        const lineTotalRaw = item.quantity * item.rate;
        const lineTotal = exactRound(lineTotalRaw);
        subtotal += lineTotal;
        return {
          ...item,
          tax_percentage: 0,
          tax_amount: 0,
          line_total: lineTotal
        };
      });

      const finalGrandTotal = Math.round(subtotal);
      const roundOff = exactRound(finalGrandTotal - subtotal);

      const d = new Date();
      let fyYear = d.getFullYear();
      if (d.getMonth() < 3) fyYear -= 1;

      const sequenceRef = db.collection("system").doc(`memo_sequence_${fyYear}`);
      const seqDoc = await transaction.get(sequenceRef);
      let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
      
      currentSeq += 1;
      const paddedSeq = currentSeq.toString().padStart(4, "0");
      const memoNumber = `MEMO/${fyYear}/${paddedSeq}`;

      transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });

      const advanceAmount = qData.advance_amount || 0;
      const balanceAmount = Math.max(0, finalGrandTotal - advanceAmount);
      const initialPaymentStatus = balanceAmount === 0 ? "paid" : (advanceAmount > 0 ? "partial" : "unpaid");

      const memoRef = db.collection("cash_memos").doc();
      const memoData = {
        number: memoNumber,
        customer_id: qData.customer_id,
        customer_name: qData.customer_name,
        is_gst: false,
        is_locked: true,
        status: "finalized",
        payment_status: initialPaymentStatus,
        items: validatedItems,
        subtotal: exactRound(subtotal),
        tax_total: 0,
        cgst: 0,
        sgst_igst: 0,
        round_off: roundOff,
        grand_total: finalGrandTotal,
        advance_amount: advanceAmount,
        balance_amount: balanceAmount,
        payment_history: [],
        linked_quotation_id: quotationId,
        created_by: uid,
        created_at: FieldValue.serverTimestamp(),
        audit_trail: [{
          action: "converted_from_quotation",
          user: uid,
          timestamp: new Date().toISOString()
        }]
      };

      transaction.set(memoRef, memoData);

      transaction.update(quotationRef, {
        conversion_status: "converted",
        linked_invoice_id: memoRef.id, // we use the same field for linking
        status: "converted"
      });
      
      const auditLogRef = db.collection("audit_logs").doc();
      transaction.set(auditLogRef, {
        document_type: "cash_memo",
        document_id: memoRef.id,
        action: "create",
        user_id: uid,
        timestamp: FieldValue.serverTimestamp(),
        notes: `Converted from Quotation ${quotationId}`
      });

      return { success: true, memoId: memoRef.id, memoNumber };
    });
  });

export const convertQuotationToProforma = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.data()?.role !== "accounts" && userDoc.data()?.role !== "admin") {
       throw new HttpsError("permission-denied", "Only Accounts can convert quotes");
    }

    const { quotationId } = request.data;
    if (!quotationId) throw new HttpsError("invalid-argument", "Missing quotationId");

    const quotationRef = db.collection("quotations").doc(quotationId);

    return await db.runTransaction(async (transaction) => {
      const qDoc = await transaction.get(quotationRef);
      if (!qDoc.exists) throw new HttpsError("not-found", "Quotation not found");
      const qData = qDoc.data();
      if (!qData) throw new HttpsError("internal", "No data");

      if (qData.conversion_status === "converted") {
        throw new HttpsError("already-exists", "This quotation was already converted");
      }

      let subtotal = 0;
      let totalTax = 0;
      
      const validatedItems = qData.items.map((item: any) => {
        const lineTotalRaw = item.quantity * item.rate;
        const taxAmountRaw = (lineTotalRaw * item.tax_percentage) / 100;
        
        const lineTotal = exactRound(lineTotalRaw);
        const taxAmount = exactRound(taxAmountRaw);
        
        subtotal += lineTotal;
        totalTax += taxAmount;
        
        return {
          ...item,
          line_total: lineTotal,
          tax_amount: taxAmount
        };
      });

      const grandTotalExact = subtotal + totalTax;
      const roundOff = exactRound(Math.round(grandTotalExact) - grandTotalExact);
      const finalGrandTotal = Math.round(grandTotalExact);

      let proformaNumber: string | undefined;
      if (!proformaNumber) {
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3) fyYear -= 1;

        const sequenceRef = db.collection("system").doc(`proforma_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        proformaNumber = `PI/${fyYear}/${paddedSeq}`;

        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }

      const advanceAmount = qData.advance_amount || 0;
      const balanceAmount = Math.max(0, finalGrandTotal - advanceAmount);
      const initialPaymentStatus = balanceAmount <= 0 ? "paid" : (advanceAmount > 0 ? "partial" : "unpaid");

      const proformaRef = db.collection("proforma_invoices").doc();
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
        round_off: roundOff,
        grand_total: finalGrandTotal,
        advance_amount: advanceAmount,
        balance_amount: balanceAmount,
        payment_history: [],
        linked_quotation_id: quotationId,
        created_by: uid,
        created_at: FieldValue.serverTimestamp(),
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
      
      const auditLogRef = db.collection("audit_logs").doc();
      transaction.set(auditLogRef, {
        document_type: "proforma_invoice",
        document_id: proformaRef.id,
        action: "create",
        user_id: uid,
        timestamp: FieldValue.serverTimestamp(),
        notes: `Converted from Quotation ${quotationId}`
      });

      return { success: true, proformaId: proformaRef.id, proformaNumber };
    });
  });

export const convertProformaToInvoice = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.data()?.role !== "accounts" && userDoc.data()?.role !== "admin") {
       throw new HttpsError("permission-denied", "Only Accounts can convert invoices");
    }

    const { proformaId } = request.data;
    if (!proformaId) throw new HttpsError("invalid-argument", "Missing proformaId");

    const proformaRef = db.collection("proforma_invoices").doc(proformaId);

    return await db.runTransaction(async (transaction) => {
      const pDoc = await transaction.get(proformaRef);
      if (!pDoc.exists) throw new HttpsError("not-found", "Proforma Invoice not found");
      const pData = pDoc.data();
      if (!pData) throw new HttpsError("internal", "No data");

      if (pData.conversion_status === "converted") {
        throw new HttpsError("already-exists", "This Proforma Invoice was already converted");
      }

      let invoiceNumber: string | undefined;
      if (!invoiceNumber) {
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3) fyYear -= 1;

        const sequenceRef = db.collection("system").doc(`invoice_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        invoiceNumber = `ECO/${fyYear}/${paddedSeq}`;

        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }

      const invoiceRef = db.collection("invoices").doc();
      const invoiceData = {
        ...pData,
        number: invoiceNumber,
        is_locked: true,
        status: "finalized",
        payment_status: "paid", // auto converted when fully paid
        balance_amount: 0,
        linked_proforma_id: proformaId,
        created_by: uid,
        created_at: FieldValue.serverTimestamp(),
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
      
      const auditLogRef = db.collection("audit_logs").doc();
      transaction.set(auditLogRef, {
        document_type: "invoice",
        document_id: invoiceRef.id,
        action: "create",
        user_id: uid,
        timestamp: FieldValue.serverTimestamp(),
        notes: `Converted from Proforma Invoice ${proformaId}`
      });

      return { success: true, invoiceId: invoiceRef.id, invoiceNumber };
    });
  });

/**
 * 1. Invoice Numbering & 2. Immutability
 * Creates a direct invoice with atomicity.
 */
export const createInvoice = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.data()?.role !== "accounts" && userDoc.data()?.role !== "admin") {
       throw new HttpsError("permission-denied", "Only Accounts can create invoices");
    }

    const { invoiceData: rawData } = request.data;
    if (!rawData || !rawData.customer_id || !rawData.items) {
        throw new HttpsError("invalid-argument", "Missing required invoice fields");
    }

    return await db.runTransaction(async (transaction) => {
      let subtotal = 0;
      let totalTax = 0;
      
      const validatedItems = rawData.items.map((item: any) => {
        const lineTotalRaw = item.quantity * item.rate;
        const taxAmountRaw = (lineTotalRaw * item.tax_percentage) / 100;
        
        const lineTotal = exactRound(lineTotalRaw);
        const taxAmount = exactRound(taxAmountRaw);
        
        subtotal += lineTotal;
        totalTax += taxAmount;
        
        return {
          ...item,
          line_total: lineTotal,
          tax_amount: taxAmount
        };
      });

      const grandTotalExact = subtotal + totalTax;
      const roundOff = exactRound(Math.round(grandTotalExact) - grandTotalExact);
      const finalGrandTotal = Math.round(grandTotalExact);

      let invoiceNumber = rawData.number;
      if (!invoiceNumber) {
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3) fyYear -= 1;

        const sequenceRef = db.collection("system").doc(`invoice_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        invoiceNumber = `ECO/${fyYear}/${paddedSeq}`;

        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }

      const invoiceRef = db.collection("invoices").doc();
      const invoiceData = {
        ...rawData,
        number: invoiceNumber,
        is_locked: true,
        status: "finalized", // Updated from 'issued'
        payment_status: "unpaid", // New required field
        items: validatedItems,
        subtotal: exactRound(subtotal),
        tax_total: exactRound(totalTax), // New field
        cgst: rawData.is_igst ? 0 : exactRound(totalTax / 2),
        sgst_igst: rawData.is_igst ? exactRound(totalTax) : exactRound(totalTax / 2),
        round_off: roundOff,
        grand_total: finalGrandTotal,
        advance_amount: rawData.advance_amount || 0,
        balance_amount: rawData.balance_amount || finalGrandTotal,
        payment_history: [],
        created_by: uid,
        created_at: FieldValue.serverTimestamp(),
        audit_trail: [{
          action: "direct_creation",
          user: uid,
          timestamp: new Date().toISOString()
        }]
      };

      transaction.set(invoiceRef, invoiceData);

      const auditLogRef = db.collection("audit_logs").doc();
      transaction.set(auditLogRef, {
        document_type: "invoice",
        document_id: invoiceRef.id,
        action: "create",
        user_id: uid,
        timestamp: FieldValue.serverTimestamp(),
        notes: "Directly created tax invoice"
      });

      // Async learning (non-blocking for the transaction itself but part of request)
      // Note: In v2 onCall, we can await it here.
      await syncToLibrary(uid, validatedItems, rawData.customer_id, rawData.customer_name);

      return { success: true, invoiceId: invoiceRef.id, invoiceNumber };
    });
});

export const createProformaInvoice = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.data()?.role !== "accounts" && userDoc.data()?.role !== "admin") {
       throw new HttpsError("permission-denied", "Only Accounts can create proforma invoices");
    }

    const { invoiceData: rawData } = request.data;
    if (!rawData || !rawData.customer_id || !rawData.items) {
        throw new HttpsError("invalid-argument", "Missing required proforma fields");
    }

    return await db.runTransaction(async (transaction) => {
      let subtotal = 0;
      let totalTax = 0;
      
      const validatedItems = rawData.items.map((item: any) => {
        const lineTotalRaw = item.quantity * item.rate;
        const taxAmountRaw = (lineTotalRaw * item.tax_percentage) / 100;
        
        const lineTotal = exactRound(lineTotalRaw);
        const taxAmount = exactRound(taxAmountRaw);
        
        subtotal += lineTotal;
        totalTax += taxAmount;
        
        return {
          ...item,
          line_total: lineTotal,
          tax_amount: taxAmount
        };
      });

      const grandTotalExact = subtotal + totalTax;
      const roundOff = exactRound(Math.round(grandTotalExact) - grandTotalExact);
      const finalGrandTotal = Math.round(grandTotalExact);

      let proformaNumber = rawData.number;
      if (!proformaNumber) {
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3) fyYear -= 1;

        const sequenceRef = db.collection("system").doc(`proforma_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        proformaNumber = `PI/${fyYear}/${paddedSeq}`;

        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }

      const proformaRef = db.collection("proforma_invoices").doc();
      const proformaData = {
        ...rawData,
        number: proformaNumber,
        is_locked: false, // Proforma invoices can be unlocked/edited
        status: "draft",
        payment_status: "unpaid",
        items: validatedItems,
        subtotal: exactRound(subtotal),
        tax_total: exactRound(totalTax),
        cgst: rawData.is_igst ? 0 : exactRound(totalTax / 2),
        sgst_igst: rawData.is_igst ? exactRound(totalTax) : exactRound(totalTax / 2),
        round_off: roundOff,
        grand_total: finalGrandTotal,
        advance_amount: rawData.advance_amount || 0,
        balance_amount: rawData.balance_amount || finalGrandTotal,
        payment_history: [],
        created_by: uid,
        created_at: FieldValue.serverTimestamp(),
        audit_trail: [{
          action: "direct_creation",
          user: uid,
          timestamp: new Date().toISOString()
        }]
      };

      transaction.set(proformaRef, proformaData);

      const auditLogRef = db.collection("audit_logs").doc();
      transaction.set(auditLogRef, {
        document_type: "proforma_invoice",
        document_id: proformaRef.id,
        action: "create",
        user_id: uid,
        timestamp: FieldValue.serverTimestamp(),
        notes: "Directly created proforma invoice"
      });

      await syncToLibrary(uid, validatedItems, rawData.customer_id, rawData.customer_name);

      return { success: true, invoiceId: proformaRef.id, invoiceNumber: proformaNumber };
    });
});

/**
 * NEW: Cash Memo Module (Choice 1a, 2b)
 * Handles non-GST billing with a separate sequence (MEMO/...).
 */
export const createCashMemo = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const role = userDoc.data()?.role;
    if (role !== "accounts" && role !== "admin") {
       throw new HttpsError("permission-denied", "Unauthorized. Admin & Accounts only.");
    }

    const { memoData: rawData } = request.data;
    if (!rawData || !rawData.items) {
        throw new HttpsError("invalid-argument", "Missing required memo fields");
    }

    return await db.runTransaction(async (transaction) => {
      let subtotal = 0;
      
      const validatedItems = rawData.items.map((item: any) => {
        const lineTotalRaw = item.quantity * item.rate;
        const lineTotal = exactRound(lineTotalRaw);
        subtotal += lineTotal;
        
        return {
          ...item,
          tax_percentage: 0,
          tax_amount: 0,
          line_total: lineTotal
        };
      });

      const finalGrandTotal = Math.round(subtotal);
      const roundOff = exactRound(finalGrandTotal - subtotal);

      let memoNumber = rawData.number;
      if (!memoNumber) {
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3) fyYear -= 1;

        const sequenceRef = db.collection("system").doc(`memo_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        memoNumber = `MEMO/${fyYear}/${paddedSeq}`;

        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }

      const memoRef = db.collection("cash_memos").doc();
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
        round_off: roundOff,
        grand_total: finalGrandTotal,
        advance_amount: rawData.advance_amount || 0,
        balance_amount: rawData.balance_amount || finalGrandTotal,
        payment_history: [],
        created_by: uid,
        created_at: FieldValue.serverTimestamp(),
        audit_trail: [{
          action: "cash_memo_creation",
          user: uid,
          timestamp: new Date().toISOString()
        }]
      };

      transaction.set(memoRef, memoData);

      // Audit log (Choice 4c: Separate from main revenue logs if needed, but logging creation for security)
      const auditLogRef = db.collection("audit_logs").doc();
      transaction.set(auditLogRef, {
        document_type: "cash_memo",
        document_id: memoRef.id,
        action: "create",
        user_id: uid,
        timestamp: FieldValue.serverTimestamp(),
        notes: "Created non-GST cash memo"
      });

      await syncToLibrary(uid, validatedItems, rawData.customer_id, rawData.customer_name);

      return { success: true, memoId: memoRef.id, memoNumber };
    });
});

/**
 * 1. Sequential Numbering
 * Creates a quotation with atomic numbering.
 */
export const createQuotation = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const uid = request.auth.uid;
    const { quotationData: rawData } = request.data;
    if (!rawData || !rawData.customer_id || !rawData.items) {
        throw new HttpsError("invalid-argument", "Missing required fields");
    }

    return await db.runTransaction(async (transaction) => {
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

      const grandTotalExact = subtotal + totalTax;
      const finalGrandTotal = Math.round(grandTotalExact);

      let quotationNumber = rawData.number;
      if (!quotationNumber) {
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3) fyYear -= 1;

        const sequenceRef = db.collection("system").doc(`quotation_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        quotationNumber = `QTN/${fyYear}/${paddedSeq}`;

        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }

      const quotationRef = db.collection("quotations").doc();
      const quotationData = {
        ...rawData,
        number: quotationNumber,
        items: validatedItems,
        subtotal: exactRound(subtotal),
        tax_total: exactRound(totalTax),
        grand_total: finalGrandTotal,
        status: rawData.status || 'draft',
        created_by: uid,
        created_at: FieldValue.serverTimestamp()
      };

      transaction.set(quotationRef, quotationData);

      await syncToLibrary(uid, validatedItems, rawData.customer_id, rawData.customer_name);

      return { success: true, quotationId: quotationRef.id, quotationNumber };
    });
});

/**
 * 4. Bank Reconciliation Gate
 * Matches a transaction to a document (Invoice/Purchase) and updates status.
 */
export const matchTransaction = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.data()?.role !== "accounts" && userDoc.data()?.role !== "admin") {
       throw new HttpsError("permission-denied", "Unauthorized action");
    }

    const { transactionId, documentId, documentType } = request.data;
    if (!transactionId || !documentId || !documentType) {
        throw new HttpsError("invalid-argument", "Missing required fields");
    }

    const txnRef = db.collection("transactions").doc(transactionId);
    const docRef = db.collection(documentType === 'invoice' ? 'invoices' : 'purchases').doc(documentId);

    return await db.runTransaction(async (transaction) => {
        const tSnap = await transaction.get(txnRef);
        const dSnap = await transaction.get(docRef);

        if (!tSnap.exists || !dSnap.exists) throw new HttpsError("not-found", "Record not found");

        const tData = tSnap.data()!;
        const dData = dSnap.data()!;

        if (tData.match_status === 'matched') throw new HttpsError("already-exists", "Transaction already matched");

        // 1. Update Transaction
        transaction.update(txnRef, {
            match_status: 'matched',
            linked_document_id: documentId,
            linked_document_type: documentType,
            matched_at: FieldValue.serverTimestamp(),
            matched_by: uid
        });

        // 2. Update Document Payment Status
        // Even if the document is 'locked' from basic editing, payment status transitions are allowed via functions.
        transaction.update(docRef, {
            payment_status: 'paid', // Simple matching for now
            status: documentType === 'invoice' ? 'finalized' : 'cleared'
        });

        // 3. Register Audit Log
        const auditLogRef = db.collection("audit_logs").doc();
        transaction.set(auditLogRef, {
            document_type: documentType,
            document_id: documentId,
            action: "reconciliation",
            user_id: uid,
            timestamp: FieldValue.serverTimestamp(),
            notes: `Matched with Bank Txn ID: ${tData.bank_transaction_id}`
        });

        return { success: true };
    });
});

/**
 * AI Tool: List Invoices
 */
async function listInvoices(args: { status?: string; payment_status?: string; customer_name?: string }) {
    let query: Query = db.collection("invoices");
    if (args.status) query = query.where("status", "==", args.status);
    if (args.payment_status) query = query.where("payment_status", "==", args.payment_status);
    
    const snapshot = await query.limit(5).get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
}

/**
 * AI Tool: Get Quotation Details
 */
async function getQuotationDetails(args: { quotation_id: string }) {
    const doc = await db.collection("quotations").doc(args.quotation_id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : { error: "Not found" };
}

/**
 * AI Tool: Check GST Compliance
 */
async function checkGSTCompliance(args: { hsn_code: string }) {
    const isValid = args.hsn_code.length >= 4 && /^\d+$/.test(args.hsn_code);
    return { 
        hsn: args.hsn_code, 
        is_compliant: isValid, 
        message: isValid ? "Valid HSN format" : "Invalid HSN. Must be numeric and at least 4 digits" 
    };
}

/**
 * 15. AI Auditor Layer (gemini-2.5-flash)
 */
export const aiAuditor = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const { message, history = [] } = request.data;
    if (!message) throw new HttpsError("invalid-argument", "Missing message");

    const tools: any[] = [{
        functionDeclarations: [
            {
                name: "list_invoices",
                description: "List recent invoices, optionally filtered by status, payment_status, or customer.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        status: { type: Type.STRING, description: "Filter by status ('draft', 'finalized', 'cancelled')" },
                        payment_status: { type: Type.STRING, description: "Filter by payment status ('unpaid', 'paid', 'partial')" },
                        customer_name: { type: Type.STRING, description: "Filter by customer name" }
                    }
                }
            },
            {
                name: "get_quotation_details",
                description: "Get full details of a specific quotation by its ID.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        quotation_id: { type: Type.STRING, description: "The unique ID of the quotation" }
                    },
                    required: ["quotation_id"]
                }
            },
            {
                name: "check_gst_compliance",
                description: "Validate an HSN code for GST compliance.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        hsn_code: { type: Type.STRING, description: "The HSN code to check" }
                    },
                    required: ["hsn_code"]
                }
            }
        ]
    }];

    const ai = getAI();
    const chat = ai.chats.create({ 
        model: "gemini-flash-latest",
        config: {
            tools,
            systemInstruction: `You are the EcoBill AI Auditor, an expert financial assistant at Ecotrophy Innovations. 
            Your tone is professional yet conversational and helpful. You analyze invoices, quotations, and compliance.
            Always stay within your toolset. If an action like "Converting a Quotation" is suggested, inform the user they must click the 'Convert' button in the UI for safety (Rule #13).`
        }
    });

    const result = await chat.sendMessage({ message });
    const response = result as any;
    
    const calls = response.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
    if (calls && calls.length > 0) {
        const toolResponses: any[] = [];
        for (const call of calls) {
            if (!call) continue;
            let toolResult: any;
            if (call.name === "list_invoices") toolResult = await listInvoices(call.args as any);
            if (call.name === "get_quotation_details") toolResult = await getQuotationDetails(call.args as any);
            if (call.name === "check_gst_compliance") toolResult = await checkGSTCompliance(call.args as any);
            
            toolResponses.push({ 
                functionResponse: { 
                    name: call.name, 
                    response: { content: toolResult },
                    id: call.id
                } 
            });
        }
        
        const finalResult = await chat.sendMessage({ message: toolResponses });
        return { 
            text: (finalResult as any).candidates?.[0]?.content?.parts?.[0]?.text || "", 
            history: await chat.getHistory() 
        };
    }

    return { 
        text: response.candidates?.[0]?.content?.parts?.[0]?.text || "", 
        history: await chat.getHistory() 
    };
});

/**
 * NEW: Parse Voice Command
 * Uses Vertex AI to parse unstructured voice transcripts into structured JSON
 */
export const parseVoiceCommand = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const { transcript, audio } = request.data;
    if (!transcript && !audio) throw new HttpsError("invalid-argument", "Transcript or audio is required");

    const promptText = `You are a multilingual AI assistant for a billing software. Analyze the user's voice input (either from transcript or direct audio file) and extract the customer name, line items (product descriptions, quantity, rate), and whether GST is wanted.
    
    If the user mentions whether GST is wanted or not (e.g., "GST want", "with GST", "GST inclusive" -> set "customerType" to "gst". If they say "no GST", "without GST", "non GST" -> set "customerType" to "non_gst"). Otherwise set "customerType" to null.
    
    Determine if you have enough information to create a quotation draft. At minimum, we need a customer name (or partial identifier) and at least one line item with a description and quantity. If any of these are missing, or if the request is ambiguous:
    - Set "success" to false.
    - Formulate a friendly follow-up question in the same language as the input (Tamil if input is in Tamil, English otherwise) to ask for the missing details.
    
    Return ONLY a JSON object matching this schema without markdown or backticks:
    {
      "success": true,
      "customerName": "string or null",
      "customerType": "gst" | "non_gst" | null,
      "items": [
        {
          "description": "string (product name)",
          "quantity": 1,
          "priceTier": "wholesale" | "retail",
          "rate": 0,
          "hsn_code": "",
          "tax_percentage": 18
        }
      ],
      "followUpQuestion": "string or null",
      "error": "string or null"
    }
    
    ${transcript ? `Text Transcript: "${transcript}"` : "Please listen to the attached audio file directly."}
    `;

    let contents: any[] = [];
    if (audio && audio.data && audio.mimeType) {
        contents = [
            {
                inlineData: {
                    data: audio.data,
                    mimeType: audio.mimeType
                }
            },
            {
                text: promptText
            }
        ];
    } else {
        contents = [{ text: promptText }];
    }

    try {
        console.log("[API] parseVoiceCommand Request with input:", audio ? "Audio Base64 Input" : transcript);
        const ai = getAI();
        const aiResult = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: contents,
        });
        const aiText = aiResult.text || "";
        console.log("[AI] Gemini Raw Response:", aiText);
        
        const cleanedText = aiText.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanedText);
        console.log("[AI] Parsed Result:", JSON.stringify(parsed));
        console.log("[API] parseVoiceCommand Response:", JSON.stringify(parsed));
        return parsed;
    } catch (e: any) {
        console.error("AI Parse Error:", e);
        return {
            success: false,
            customerName: null,
            customerType: null,
            items: [],
            followUpQuestion: "Failed to parse voice command. Please try again.",
            error: e.message || String(e)
        };
    }
});

/**
 * NEW: Parse Purchase Voice Command
 * Uses Vertex AI to parse unstructured voice transcripts into a purchase record
 */
export const parsePurchaseVoice = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const { transcript, audio } = request.data;
    if (!transcript && !audio) throw new HttpsError("invalid-argument", "Transcript or audio is required");

    const promptText = `You are a multilingual AI assistant for a billing software. Analyze the user's voice input (either from transcript or direct audio file) and extract the vendor name and purchase amount.
    
    Determine if you have enough information to create a purchase record. We need a vendor name and a purchase amount. If any are missing:
    - Set "success" to false.
    - Formulate a friendly follow-up question in the same language as the input (Tamil if input is in Tamil, English otherwise) to ask for the missing details.
    
    Return ONLY a JSON object matching this schema without markdown or backticks:
    {
      "success": true,
      "vendor": "string or null",
      "amount": 0,
      "followUpQuestion": "string or null",
      "error": "string or null"
    }
    
    ${transcript ? `Text Transcript: "${transcript}"` : "Please listen to the attached audio file directly."}
    `;

    let contents: any[] = [];
    if (audio && audio.data && audio.mimeType) {
        contents = [
            {
                inlineData: {
                    data: audio.data,
                    mimeType: audio.mimeType
                }
            },
            {
                text: promptText
            }
        ];
    } else {
        contents = [{ text: promptText }];
    }

    try {
        console.log("[API] parsePurchaseVoice Request with input:", audio ? "Audio Base64 Input" : transcript);
        const ai = getAI();
        const aiResult = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: contents,
        });
        const aiText = aiResult.text || "";
        console.log("[AI] Gemini Raw Response:", aiText);
        
        const cleanedText = aiText.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanedText);
        console.log("[AI] Parsed Result:", JSON.stringify(parsed));
        console.log("[API] parsePurchaseVoice Response:", JSON.stringify(parsed));
        return parsed;
    } catch (e: any) {
        console.error("AI Parse Error:", e);
        return {
            success: false,
            vendor: null,
            amount: 0,
            followUpQuestion: "Failed to parse purchase voice command. Please try again.",
            error: e.message || String(e)
        };
    }
});

export const analyzePendingTransactions = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");

    const pendingTxSnap = await db.collection("transactions").where("match_status", "==", "pending_review").get();
    if (pendingTxSnap.empty) return { success: true, count: 0 };

    const invoicesSnap = await db.collection("invoices").where("payment_status", "in", ["unpaid", "partial"]).get();
    const invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const customersSnap = await db.collection("customers").get();
    const knownCustomers = customersSnap.docs.map(d => d.data().name);

    const purchasesSnap = await db.collection("purchases").get();
    const knownVendors = purchasesSnap.docs.map(d => d.data().vendor?.name).filter(Boolean);
    
    const knownEntities = [...new Set([...knownCustomers, ...knownVendors])];

    let count = 0;
    for (const doc of pendingTxSnap.docs) {
        const tx = doc.data();
        
        const prompt = `You are an AI corporate auditor and accounting assistant. Match this bank transaction against open invoices or categorize it. Cross-reference the description against Known Entities to find hidden vendor/customer names.
        Transaction Description: ${tx.description}
        Amount: ${tx.amount}
        Type: ${tx.type}

        Known Entities (Customers & Vendors):
        ${JSON.stringify(knownEntities)}

        Open Invoices (JSON):
        ${JSON.stringify(invoices.map(i => ({id: i.id, number: i.number, customer: i.customer_name, balance: i.balance_amount})))}

        Return ONLY a JSON object exactly matching this schema without markdown:
        {
          "suggested_action": "partial_payment" | "advance_payment" | "expense" | "unknown",
          "category": "Sales" | "Purchase" | "Maintenance" | "Assets" | "Salary" | "Taxes" | "General",
          "confidence_score": 0.0 to 1.0,
          "match_explanation": "Brief explanation",
          "suggested_doc_id": "invoice id or null"
        }`;

        try {
            const ai = getAI();
            const aiResult = await ai.models.generateContent({
                model: "gemini-flash-latest",
                contents: prompt,
            });
            const aiText = aiResult.text || "";
            const cleanedText = aiText.replace(/```json|```/g, "").trim();
            const result = JSON.parse(cleanedText);

            await doc.ref.update({
                suggested_action: result.suggested_action || 'unknown',
                category: result.category || 'General',
                confidence_score: result.confidence_score || 0,
                match_explanation: result.match_explanation || 'No clear match',
                'metadata.suggested_doc_id': result.suggested_doc_id || null
            });

            if ((result.confidence_score || 0) < 0.6 || result.category === 'General') {
                await db.collection("notifications").add({
                    title: "AI Auditor Question",
                    message: `I found a cryptic transaction for Ã¢â€šÂ¹${tx.amount} (Ref: ${tx.bank_transaction_id || tx.description.substring(0, 20)}). I placed it in ${result.category || 'General'}, but I suspect it might be a new vendor or unmapped entity. Please review it.`,
                    user_id: "system",
                    is_read: false,
                    created_at: new Date()
                });
            }

            count++;
        } catch (e) {
            console.error("AI matching failed for tx", doc.id, e);
        }
    }
    
    return { success: true, count };
});

export const parsePDFStatement = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");

    const { base64Data, mimeType } = request.data;
    if (!base64Data || !mimeType) throw new HttpsError("invalid-argument", "Missing file data");

    const prompt = `Extract all bank transactions from this bank statement.
    Ignore headers, footers, and balances. 
    Return ONLY a JSON array of objects with this EXACT schema without markdown formatting or backticks:
    [
      {
        "date": "YYYY-MM-DD",
        "description": "string (payee/narration)",
        "amount": number (absolute value),
        "type": "credit" | "debit",
        "reference": "string or empty"
      }
    ]`;

    try {
        const requestPayload = {
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { data: base64Data, mimeType } },
                    { text: prompt }
                ]
            }]
        };

        const ai = getAI();
        const aiResult = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: requestPayload.contents,
        });
        const aiText = aiResult.text || "[]";
        const cleanedText = aiText.replace(/```json|```/g, "").trim();
        const transactions = JSON.parse(cleanedText);

        if (!Array.isArray(transactions)) {
            throw new Error("AI did not return an array");
        }

        return { success: true, transactions };
    } catch (e: any) {
        console.error("PDF Parsing failed:", e);
        throw new HttpsError("internal", "Failed to parse PDF statement: " + e.message);
    }
});

/**
 * Phase 4: AI Invoice Extraction & Smart Categorization
 */
export const extractInvoiceData = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const { base64Data, mimeType, userId, purchaseId, fileName } = request.data;
    if (!base64Data || !mimeType || !userId || !purchaseId) {
        throw new HttpsError("invalid-argument", "Missing required fields");
    }

    if (userId !== request.auth.uid) {
        throw new HttpsError("permission-denied", "Unauthorized");
    }

    const prompt = `You are an AI assistant for a billing software. Analyze the provided invoice or receipt image/pdf.
Extract all information and return ONLY a strict JSON object exactly matching this schema. Do not use markdown blocks.
Valid categories are exactly one of: "Asset", "Subscription", "Production", "Maintenance", "Expenses". If you are unsure, use "Expenses".

Schema:
{
  "vendor": {
    "name": "string",
    "address": "string",
    "gst_number": "string",
    "phone": "string"
  },
  "invoice": {
    "invoice_number": "string",
    "invoice_date": "YYYY-MM-DD",
    "payment_method": "string"
  },
  "items": [
    {
      "itemName": "string",
      "quantity": number,
      "unitPrice": number,
      "total": number
    }
  ],
  "taxAmount": number,
  "grandTotal": number,
  "category": "string",
  "confidence": {
    "vendor_name": number,
    "invoice_number": number,
    "category": number
  },
  "overallConfidence": number
}

Classification Rules:
- Asset: Laptop, Computer, Printer, Machinery, Equipment, Furniture, Camera.
- Subscription: Shopify, ChatGPT, Adobe, Google Workspace, Domain, Hosting.
- Production: Trophy Materials, Acrylic Sheets, MDF Boards, Packaging Materials, Printing Supplies.
- Maintenance: Repair Work, Service Charges, AMC, Spare Parts.
- Expenses: Electricity, Fuel, Travel, Food, Courier, Internet.
`;

    try {
        const requestPayload = {
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { data: base64Data, mimeType } },
                    { text: prompt }
                ]
            }]
        };

        const ai = getAI();
        const aiResult = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: requestPayload.contents,
            config: {
                responseMimeType: "application/json"
            }
        });
        const aiText = aiResult.text || "{}";
        const cleanedText = aiText.replace(/```json|```/g, "").trim();
        const extracted = JSON.parse(cleanedText);

        if (!extracted.items || !Array.isArray(extracted.items)) extracted.items = [];
        let validCategory = ["Asset", "Subscription", "Production", "Maintenance", "Expenses"].includes(extracted.category) ? extracted.category : "Expenses";
        extracted.category = validCategory;

        let manualReviewRequired = false;
        if (typeof extracted.grandTotal !== 'number' || isNaN(extracted.grandTotal)) manualReviewRequired = true;
        if (!extracted.invoice?.invoice_date || isNaN(Date.parse(extracted.invoice.invoice_date))) manualReviewRequired = true;
        
        for (const item of extracted.items) {
            if (typeof item.quantity !== 'number' || item.quantity < 0) manualReviewRequired = true;
            if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) manualReviewRequired = true;
        }
        if (extracted.items.length === 0) manualReviewRequired = true;

        extracted.manualReviewRequired = manualReviewRequired;

        await db.collection("ai_extraction_logs").add({
            purchaseId,
            userId,
            uploadFileName: fileName || "direct_upload",
            extractedCategory: extracted.category,
            overallConfidence: extracted.overallConfidence || 0,
            extractionStatus: "success",
            createdAt: FieldValue.serverTimestamp()
        });

        try {
            const bucket = getStorage().bucket();
            const processFile = bucket.file(`purchases/processed/${purchaseId}/extraction.json`);
            await processFile.save(JSON.stringify(extracted, null, 2), { contentType: "application/json" });
        } catch(e) {
            console.error("Failed to save extraction log to storage", e);
        }

        return { success: true, data: extracted };
    } catch (e: any) {
        console.error("Invoice Extraction failed:", e);
        await db.collection("ai_extraction_logs").add({
            purchaseId,
            userId,
            uploadFileName: fileName || "direct_upload",
            extractionStatus: "failed",
            error: e.message,
            createdAt: FieldValue.serverTimestamp()
        });
        throw new HttpsError("internal", "Failed to extract invoice data: " + e.message);
    }
});


export const extractExpenseReceipt = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
    
    const { base64Data, mimeType } = request.data;
    if (!base64Data || !mimeType) {
        throw new HttpsError("invalid-argument", "Missing required fields");
    }

    const prompt = `You are an expert OCR and data extraction system.
Extract the key details from this expense receipt.
Return the output as a JSON object matching this schema exactly:
{
  "date": "YYYY-MM-DD",
  "description": "Short description of what was purchased",
  "amount": 0.00,
  "category": "General",
  "notes": "Any extra details or vendor name"
}
Important: Ensure amount is a number.`;

    try {
        const requestPayload = {
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { data: base64Data, mimeType } },
                    { text: prompt }
                ]
            }]
        };

        const ai = getAI();
        const aiResult = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: requestPayload.contents,
            config: {
                responseMimeType: "application/json"
            }
        });
        
        const aiText = aiResult.text || "{}";
        const cleanedText = aiText.replace(/\`\`\`json|\`\`\`/g, "").trim();
        const extracted = JSON.parse(cleanedText);

        return { data: extracted };
    } catch (error) {
        console.error('Gemini AI Extraction Error:', error);
        throw new HttpsError('internal', 'Failed to extract data');
    }
});


type LeadPlatform = "meta" | "google" | "manual" | "test";

type InboundLead = {
  platform?: LeadPlatform;
  source?: string;
  sourceType?: string;
  event_id?: string;
  eventId?: string;
  name?: string;
  phone?: string;
  email?: string;
  location?: string;
  required_quantity?: string | number;
  event_date?: string;
  delivery_date?: string;
  campaign?: string;
  campaign_id?: string;
  ad_id?: string;
  form_id?: string;
  pipeline_id?: string;
  message?: string;
  payload?: any;
  data?: any;
  lead?: any;
  raw_payload?: any;
  object?: string;
  entry?: any[];
};

function cleanValue(value: any): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizePhone(value: any): string {
  const digits = cleanValue(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function getRawBody(request: any): string {
  if (typeof request.rawBody === "string") return request.rawBody;
  if (request.rawBody && Buffer.isBuffer(request.rawBody)) return request.rawBody.toString("utf8");
  if (request.body && typeof request.body === "string") return request.body;
  return JSON.stringify(request.body || {});
}

function verifyMetaSignature(request: any) {
  const appSecret = cleanValue(process.env.META_APP_SECRET);
  if (!appSecret) return true;

  const header = cleanValue(request.get?.("x-hub-signature-256") || request.headers?.["x-hub-signature-256"]);
  if (!header.startsWith("sha256=")) return false;

  const payload = getRawBody(request);
  const expected = `sha256=${createHmac("sha256", appSecret).update(payload, "utf8").digest("hex")}`;
  const expectedBuf = Buffer.from(expected, "utf8");
  const headerBuf = Buffer.from(header, "utf8");
  if (expectedBuf.length !== headerBuf.length) return false;
  return timingSafeEqual(expectedBuf, headerBuf);
}

function verifyGoogleKey(raw: any) {
  const expectedKey = cleanValue(process.env.GOOGLE_LEAD_WEBHOOK_KEY);
  if (!expectedKey) return true;
  return cleanValue(raw?.google_key || raw?.key) === expectedKey;
}

function sourceLabel(platform: LeadPlatform, sourceType?: string) {
  if (platform === "meta") return sourceType === "dm" ? "Meta DM" : "Meta Lead Ads";
  if (platform === "google") return "Google Ads";
  if (platform === "manual") return "Manual";
  return "Test Ingest";
}

function stableEventId(platform: LeadPlatform, raw: any, explicitId?: string) {
  const explicit = cleanValue(explicitId);
  if (explicit) return explicit;
  const hash = createHash("sha1").update(`${platform}:${JSON.stringify(raw || {})}`).digest("hex");
  return `${platform}_${hash.slice(0, 20)}`;
}

function extractMetaLeadFields(raw: any) {
  const value = raw?.entry?.[0]?.changes?.[0]?.value || raw?.data || raw;
  const fieldData = Array.isArray(value?.field_data) ? value.field_data : [];
  const fieldMap: Record<string, string> = {};
  for (const item of fieldData) {
    const key = cleanValue(item?.name);
    if (!key) continue;
    fieldMap[key] = cleanValue(item?.values?.[0] ?? item?.value);
  }
  return { value, fieldMap };
}

function extractGoogleLeadFields(raw: any) {
  const source = raw?.user_column_data || raw?.lead_form_submission_fields || raw?.custom_lead_form_submission_fields || [];
  const fieldMap: Record<string, string> = {};

  for (const item of Array.isArray(source) ? source : []) {
    const key = cleanValue(item?.column_id || item?.field_id || item?.column_name || item?.name);
    const value = cleanValue(item?.string_value || item?.value || item?.text_value);
    if (!key || !value) continue;
    fieldMap[key] = value;
    fieldMap[key.toLowerCase()] = value;
  }

  const name =
    cleanValue(raw?.full_name) ||
    cleanValue(fieldMap.FULL_NAME) ||
    cleanValue(fieldMap.full_name) ||
    cleanValue(fieldMap.NAME) ||
    cleanValue(fieldMap.name);

  const phone =
    normalizePhone(raw?.phone_number) ||
    normalizePhone(fieldMap.PHONE_NUMBER) ||
    normalizePhone(fieldMap.phone_number) ||
    normalizePhone(fieldMap.PHONE) ||
    normalizePhone(fieldMap.phone);

  const email =
    cleanValue(raw?.email).toLowerCase() ||
    cleanValue(fieldMap.EMAIL).toLowerCase() ||
    cleanValue(fieldMap.email).toLowerCase();

  const campaign_id = cleanValue(raw?.campaign_id);
  const adgroup_id = cleanValue(raw?.adgroup_id);
  const ad_id = cleanValue(raw?.creative_id || raw?.ad_id);
  const form_id = cleanValue(raw?.form_id);
  const eventId = cleanValue(raw?.lead_id);
  const campaign = cleanValue(raw?.campaign_name || raw?.campaign);
  const message = cleanValue(raw?.lead_stage || raw?.lead_source || raw?.api_version);

  return {
    fieldMap,
    name,
    phone,
    email,
    campaign_id,
    adgroup_id,
    ad_id,
    form_id,
    eventId,
    campaign,
    message,
  };
}

function normalizeInboundLead(input: InboundLead, fallbackPlatform: LeadPlatform = "test") {
  const raw = input?.raw_payload ?? input?.payload ?? input?.data ?? input?.lead ?? input;
  let platform = input?.platform || fallbackPlatform;
  let sourceType = cleanValue(input?.sourceType);
  let source = cleanValue(input?.source) || sourceLabel(platform, sourceType || undefined);
  let eventId = cleanValue(input?.event_id || input?.eventId);
  let name = cleanValue(input?.name);
  let phone = normalizePhone(input?.phone);
  let email = cleanValue(input?.email).toLowerCase();
  let location = cleanValue(input?.location);
  let required_quantity = cleanValue(input?.required_quantity);
  let event_date = cleanValue(input?.event_date);
  let delivery_date = cleanValue(input?.delivery_date);
  let campaign = cleanValue(input?.campaign);
  let campaign_id = cleanValue(input?.campaign_id);
  let ad_id = cleanValue(input?.ad_id);
  let form_id = cleanValue(input?.form_id);
  let message = cleanValue(input?.message);

  const isMetaWebhook = Array.isArray(raw?.entry) && raw?.object;
  if (isMetaWebhook) {
    platform = "meta";
    const entry = raw.entry?.[0] || {};
    const change = entry.changes?.[0] || {};
    const value = change.value || {};

    if (value?.field_data) {
      sourceType = "lead_ads";
      const { fieldMap } = extractMetaLeadFields(raw);
      name = name || fieldMap.full_name || fieldMap.name || [fieldMap.first_name, fieldMap.last_name].filter(Boolean).join(" ").trim();
      phone = phone || normalizePhone(fieldMap.phone_number || fieldMap.phone || fieldMap.mobile_number || fieldMap.whatsapp_number || fieldMap.mobile);
      email = email || cleanValue(fieldMap.email).toLowerCase();
      location = location || cleanValue(fieldMap.location || fieldMap.city || fieldMap.address);
      required_quantity = required_quantity || cleanValue(fieldMap.required_quantity || fieldMap.quantity || fieldMap['require quantity'] || fieldMap.require_quantity);
      event_date = event_date || cleanValue(fieldMap.event_date || fieldMap['event date']);
      delivery_date = delivery_date || cleanValue(fieldMap.delivery_date || fieldMap['delivery date'] || fieldMap['when the delivery want'] || fieldMap.when_the_delivery_want);
      campaign = campaign || cleanValue(value.campaign_name || value.campaign || raw.campaign_name);
      campaign_id = campaign_id || cleanValue(value.campaign_id || raw.campaign_id);
      ad_id = ad_id || cleanValue(value.ad_id || raw.ad_id);
      form_id = form_id || cleanValue(value.form_id || raw.form_id);
      eventId = eventId || cleanValue(value.leadgen_id || value.lead_id || entry.id);
      source = source || "Meta Lead Ads";
      message = message || cleanValue(value.custom_disclaimer || "");
    } else if (Array.isArray(entry.messaging) && entry.messaging.length > 0) {
      sourceType = "dm";
      const messaging = entry.messaging[0] || {};
      eventId = eventId || cleanValue(messaging.message?.mid || `${entry.id || "meta"}_${messaging.sender?.id || "sender"}_${messaging.timestamp || Date.now()}`);
      name = name || cleanValue(messaging.sender?.name || messaging.sender?.id || "Meta DM Lead");
      phone = phone || normalizePhone(messaging.sender?.phone_number);
      message = message || cleanValue(messaging.message?.text || messaging.message?.caption || messaging.message?.attachments?.[0]?.payload?.url);
      source = source || (raw.object === "instagram" ? "Instagram DM" : "Facebook DM");
    }
  }

  const googleLead = raw?.leadFormSubmissionData || raw?.lead_form_submission_data || raw?.lead || raw?.payload || raw;
  const looksLikeGoogleWebhook = Array.isArray(raw?.user_column_data) || raw?.google_key || raw?.is_test || raw?.lead_id;
  if (platform === "google" || String(source).toLowerCase().includes("google") || googleLead?.lead_form_submission_data || looksLikeGoogleWebhook) {
    platform = "google";
    sourceType = sourceType || "lead_form";
    const googleFields = extractGoogleLeadFields(raw);
    name = name || googleFields.name || cleanValue(googleLead?.name || googleLead?.full_name || googleLead?.fullName || googleLead?.customer_name || raw?.customer_name);
    phone = phone || googleFields.phone || normalizePhone(googleLead?.phone || googleLead?.phone_number || raw?.phone_number);
    email = email || googleFields.email || cleanValue(googleLead?.email || raw?.email).toLowerCase();
    campaign = campaign || googleFields.campaign || cleanValue(googleLead?.campaign_name || raw?.campaign_name || raw?.campaign);
    campaign_id = campaign_id || googleFields.campaign_id || cleanValue(googleLead?.campaign_id || raw?.campaign_id);
    ad_id = ad_id || googleFields.ad_id || cleanValue(googleLead?.ad_id || raw?.ad_id || raw?.ad_group_id);
    form_id = form_id || googleFields.form_id || cleanValue(googleLead?.form_id || raw?.form_id || googleLead?.lead_form_id);
    eventId = eventId || googleFields.eventId || cleanValue(googleLead?.submission_id || googleLead?.lead_id || raw?.lead_id);
    source = source || "Google Ads";
    message = message || googleFields.message || cleanValue(googleLead?.message || raw?.message);
  }

  if (!eventId) eventId = stableEventId(platform, raw, raw?.eventId || raw?.event_id);
  if (!name) name = cleanValue(raw?.name || raw?.full_name || raw?.fullName || raw?.customer_name || "Unknown Lead");

  return {
    eventId,
    platform,
    source: source || sourceLabel(platform, sourceType || undefined),
    sourceType: sourceType || (platform === "meta" ? "lead_ads" : platform === "google" ? "lead_form" : "manual"),
    name,
    phone,
    email,
    location,
    required_quantity,
    event_date,
    delivery_date,
    campaign,
    campaign_id,
    ad_id,
    form_id,
    message,
    raw,
  };
}

async function findMatchingLead(transaction: Transaction, normalized: ReturnType<typeof normalizeInboundLead>) {
  if (normalized.phone) {
    const phoneSnap = await transaction.get(db.collection("leads").where("normalized_phone", "==", normalized.phone).limit(1));
    if (!phoneSnap.empty) return phoneSnap.docs[0];
  }
  if (normalized.email) {
    const emailSnap = await transaction.get(db.collection("leads").where("normalized_email", "==", normalized.email).limit(1));
    if (!emailSnap.empty) return emailSnap.docs[0];
  }
  return null;
}

function renderTemplateText(template: string, context: Record<string, string>) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => context[key] || "");
}

async function queueTemplateActivity(transaction: Transaction, leadId: string, leadData: Record<string, any>, pipelineId: string, stageId: string) {
  const templateSnap = await transaction.get(db.collection("message_templates").where("pipeline_id", "==", pipelineId));
  if (templateSnap.empty) return null;

  const template = templateSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any)).find((item) => item.is_active !== false && item.trigger_stage_id === stageId);
  if (!template) return null;

  // Idempotency check for automation run
  const idempotencyKey = `${leadId}_stage_change_${stageId}_${template.id}`;
  const runRef = db.collection("automation_runs").doc(idempotencyKey);
  const runSnap = await transaction.get(runRef);

  if (runSnap.exists) {
    const skippedActivityRef = db.collection("activities").doc();
    transaction.create(skippedActivityRef, {
      lead_id: leadId,
      type: "automation.run.skipped",
      message: `Skipped duplicate automation trigger for stage "${stageId}" (Idempotency Active)`,
      actor: "system",
      created_at: FieldValue.serverTimestamp(),
    });
    return null;
  }

  const pipelineSnap = await transaction.get(db.collection("pipelines").doc(pipelineId));
  const pipelineData = pipelineSnap.exists ? (pipelineSnap.data() || {}) : {};
  const stageLabel = Array.isArray((pipelineData as any).stages)
    ? ((pipelineData as any).stages.find((stage: any) => String(stage?.id || "") === stageId)?.label || stageId)
    : stageId;

  const context = {
    name: cleanValue(leadData?.name) || "",
    phone: cleanValue(leadData?.phone) || "",
    email: cleanValue(leadData?.email) || "",
    source: cleanValue(leadData?.source) || "",
    campaign: cleanValue(leadData?.campaign) || "",
    pipeline: cleanValue((pipelineData as any).name) || pipelineId,
    pipeline_id: pipelineId,
    stage: stageLabel,
    status: stageLabel,
    reason: cleanValue(leadData?.reason) || "",
    channel: template.channel || "",
    template_name: template.name || "",
  };

  const subject = template.subject ? renderTemplateText(String(template.subject), context) : "";
  const body = renderTemplateText(String(template.body || ""), context);

  // Write the automation run record
  transaction.create(runRef, {
    lead_id: leadId,
    automation_id: template.id,
    trigger_type: "stage_change",
    stage_id: stageId,
    status: "success",
    run_at: FieldValue.serverTimestamp(),
    idempotency_key: idempotencyKey,
  });

  const activityRef = db.collection("activities").doc();
  transaction.create(activityRef, {
    lead_id: leadId,
    type: "message.template.prepared",
    message: `${template.name}${subject ? ` | ${subject}` : ""}: ${body}`,
    actor: "system",
    created_at: FieldValue.serverTimestamp(),
  });

  // Test WhatsApp action stub & Real WhatsApp Queue
  if (template.channel === 'whatsapp' || template.channel === 'stub') {
    const isStub = template.channel === 'stub';
    const queueRef = db.collection("message_queue").doc();
    transaction.create(queueRef, {
      lead_id: leadId,
      template_id: template.id,
      pipeline_id: pipelineId,
      channel: template.channel,
      subject,
      body,
      status: isStub ? "sent" : "queued",
      created_by: "system",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    if (isStub) {
      const whatsappActivityRef = db.collection("activities").doc();
      transaction.create(whatsappActivityRef, {
        lead_id: leadId,
        type: "message.template.sent",
        message: `WhatsApp stub message successfully sent to ${context.phone || 'unspecified number'}. Status: completed.`,
        actor: "system",
        created_at: FieldValue.serverTimestamp(),
      });
    }
  }

  return { templateId: template.id, rendered: body, subject };
}

async function processInboundLead(input: InboundLead, fallbackPlatform: LeadPlatform = "test") {
  const normalized = normalizeInboundLead(input, fallbackPlatform);
  const pipelineId = cleanValue((input as any)?.pipeline_id || (input as any)?.pipelineId) || "default";
  const eventRef = db.collection("lead_intake_events").doc(normalized.eventId);
  const activityRef = db.collection("activities").doc();

  return await db.runTransaction(async (transaction) => {
    const existingEvent = await transaction.get(eventRef);
    if (existingEvent.exists) {
      return {
        status: "duplicate",
        eventId: normalized.eventId,
        message: "Duplicate event ignored"
      };
    }

    const matchedLead = await findMatchingLead(transaction, normalized);

    if (matchedLead) {
      const leadUpdate: Record<string, any> = {
        updated_at: FieldValue.serverTimestamp(),
        last_event_id: normalized.eventId,
      };
      if (normalized.name) leadUpdate.name = normalized.name;
      if (normalized.phone) {
        leadUpdate.phone = normalized.phone;
        leadUpdate.normalized_phone = normalized.phone;
      }
      if (normalized.email) {
        leadUpdate.email = normalized.email;
        leadUpdate.normalized_email = normalized.email;
      }
      if (normalized.source) leadUpdate.source = normalized.source;
      if (normalized.platform) leadUpdate.platform = normalized.platform;
      if (normalized.campaign) leadUpdate.campaign = normalized.campaign;
      if (normalized.campaign_id) leadUpdate.campaign_id = normalized.campaign_id;
      if (normalized.ad_id) leadUpdate.ad_id = normalized.ad_id;
      if (normalized.form_id) leadUpdate.form_id = normalized.form_id;
      if (normalized.location) leadUpdate.location = normalized.location;
      if (normalized.required_quantity) leadUpdate.required_quantity = normalized.required_quantity;
      if (normalized.event_date) leadUpdate.event_date = normalized.event_date;
      if (normalized.delivery_date) leadUpdate.delivery_date = normalized.delivery_date;
      leadUpdate.pipeline_id = pipelineId;

      transaction.update(matchedLead.ref, leadUpdate);
      transaction.create(eventRef, {
        event_id: normalized.eventId,
        source: normalized.source,
        platform: normalized.platform,
        status: "matched",
        lead_id: matchedLead.id,
        message: "Matched and updated existing lead",
        raw_payload: normalized.raw,
        created_at: FieldValue.serverTimestamp(),
      });
      transaction.create(activityRef, {
        lead_id: matchedLead.id,
        type: "lead.matched",
        message: `${normalized.source} matched existing lead`,
        actor: "system",
        created_at: FieldValue.serverTimestamp(),
      });

      return {
        status: "matched",
        leadId: matchedLead.id,
        eventId: normalized.eventId,
        source: normalized.source,
      };
    }

    const leadRef = db.collection("leads").doc();
    const leadData: Record<string, any> = {
      id: leadRef.id,
      name: normalized.name,
      source: normalized.source,
      platform: normalized.platform,
      pipeline_id: pipelineId,
      status: "new",
      last_event_id: normalized.eventId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    if (normalized.phone) {
      leadData.phone = normalized.phone;
      leadData.normalized_phone = normalized.phone;
    }
    if (normalized.email) {
      leadData.email = normalized.email;
      leadData.normalized_email = normalized.email;
    }
    if (normalized.campaign) leadData.campaign = normalized.campaign;
    if (normalized.campaign_id) leadData.campaign_id = normalized.campaign_id;
    if (normalized.ad_id) leadData.ad_id = normalized.ad_id;
    if (normalized.form_id) leadData.form_id = normalized.form_id;
    if (normalized.location) leadData.location = normalized.location;
    if (normalized.required_quantity) leadData.required_quantity = normalized.required_quantity;
    if (normalized.event_date) leadData.event_date = normalized.event_date;
    if (normalized.delivery_date) leadData.delivery_date = normalized.delivery_date;

    transaction.create(leadRef, leadData);

    const customerRef = db.collection("customers").doc();
    transaction.create(customerRef, {
      id: customerRef.id,
      name: leadData.name || "Unknown",
      phone: leadData.phone || "",
      email: leadData.email || "",
      type: "individual",
      notes: `Created automatically from Lead source: ${normalized.source}`,
      created_at: FieldValue.serverTimestamp()
    });

    transaction.create(eventRef, {
      event_id: normalized.eventId,
      source: normalized.source,
      platform: normalized.platform,
      status: "created",
      lead_id: leadRef.id,
      message: "Created new lead",
      raw_payload: normalized.raw,
      created_at: FieldValue.serverTimestamp(),
    });

    transaction.create(activityRef, {
      lead_id: leadRef.id,
      type: "lead.created",
      message: `${normalized.source} created a new lead`,
      actor: "system",
      created_at: FieldValue.serverTimestamp(),
    });

    await queueTemplateActivity(transaction, leadRef.id, leadData, pipelineId, leadData.status);

    return {
      status: "created",
      leadId: leadRef.id,
      eventId: normalized.eventId,
      source: normalized.source,
    };
  });
}

async function handleWebhook(request: any, response: any, fallbackPlatform: LeadPlatform) {
  if (request.method === "GET" && fallbackPlatform === "meta") {
    const mode = cleanValue(request.query["hub.mode"] || request.query.mode);
    const token = cleanValue(request.query["hub.verify_token"] || request.query.verify_token);
    const challenge = cleanValue(request.query["hub.challenge"] || request.query.challenge);
    const expected = cleanValue(process.env.META_WEBHOOK_VERIFY_TOKEN);

    if (mode === "subscribe" && expected && token !== expected) {
      response.status(403).send("Forbidden");
      return;
    }

    if (mode === "subscribe") {
      response.status(200).send(challenge || "ok");
      return;
    }
  }

  if (request.method !== "POST") {
    response.status(200).json({ ok: true });
    return;
  }

  try {
    if (fallbackPlatform === "meta" && !verifyMetaSignature(request)) {
      response.status(401).json({ ok: false, error: "Invalid Meta signature" });
      return;
    }

    const rawBody = request.body || {};
    if (fallbackPlatform === "google" && !verifyGoogleKey(rawBody)) {
      response.status(403).json({ ok: false, error: "Invalid Google webhook key" });
      return;
    }

    // NEW: Handle WhatsApp Webhook message delivery status updates or inbound customer replies
    const value = rawBody.entry?.[0]?.changes?.[0]?.value;
    if (value && value.messaging_product === "whatsapp") {
      // 1. Process Message Status Updates (delivered/read/failed status updates)
      if (Array.isArray(value.statuses) && value.statuses.length > 0) {
        for (const statusObj of value.statuses) {
          const wamid = statusObj.id;
          const status = statusObj.status; // delivered, read, failed
          const queueQuery = await db.collection("message_queue")
            .where("metaMessageId", "==", wamid)
            .limit(1)
            .get();
          if (!queueQuery.empty && queueQuery.docs[0]) {
            const docRef = queueQuery.docs[0].ref;
            const updateFields: any = { status };
            if (status === "delivered") updateFields.deliveredAt = FieldValue.serverTimestamp();
            if (status === "read") updateFields.readAt = FieldValue.serverTimestamp();
            if (status === "failed") {
              updateFields.failedAt = FieldValue.serverTimestamp();
              updateFields.errorCode = statusObj.errors?.[0]?.code || "";
              updateFields.errorMessage = statusObj.errors?.[0]?.message || "";
            }
            await docRef.update(updateFields);

            // Add activity log
            const qData = queueQuery.docs[0].data();
            await db.collection("activities").add({
              lead_id: qData ? qData.lead_id : "",
              type: `message.${status}`,
              message: `WhatsApp message ${status}. Message ID: ${wamid}`,
              actor: "system",
              created_at: FieldValue.serverTimestamp()
            });
          }
        }
      }

      // 2. Process Inbound Messages (customer replies)
      if (Array.isArray(value.messages) && value.messages.length > 0) {
        for (const msgObj of value.messages) {
          const fromPhone = msgObj.from; // Phone sender
          const leadQuery = await db.collection("leads")
            .where("normalized_phone", "==", fromPhone)
            .limit(1)
            .get();

          if (!leadQuery.empty && leadQuery.docs[0]) {
            const leadDoc = leadQuery.docs[0];
            await leadDoc.ref.update({
              lastCustomerReplyAt: FieldValue.serverTimestamp()
            });

            // Find active enrollments with stopOnReply enabled and cancel them
            const enrollsSnap = await db.collection("automation_enrollments")
              .where("leadId", "==", leadDoc.id)
              .where("status", "==", "scheduled")
              .get();

            if (!enrollsSnap.empty) {
              for (const enrollDoc of enrollsSnap.docs) {
                const enrollData = enrollDoc.data();
                const autoSnap = await db.collection("whatsapp_automations").doc(enrollData.automationId).get();
                if (autoSnap.exists && autoSnap.data()?.stopOnReply) {
                  await enrollDoc.ref.update({
                    status: "cancelled",
                    cancelReason: "Customer replied to WhatsApp message",
                    updatedAt: FieldValue.serverTimestamp()
                  });

                  await db.collection("activities").add({
                    lead_id: leadDoc.id,
                    type: "automation.cancelled",
                    message: `WhatsApp Automation enrollment cancelled due to customer reply.`,
                    actor: "system",
                    created_at: FieldValue.serverTimestamp()
                  });
                }
              }
            }
          }
        }
      }

      response.status(200).json({ ok: true, message: "WhatsApp webhook processed" });
      return;
    }

    const result = await processInboundLead(rawBody, fallbackPlatform);
    response.status(200).json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Lead webhook failed:", error);
    response.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}

export const metaLeadWebhook = onRequest(async (request, response) => {
  await handleWebhook(request, response, "meta");
});

export const googleLeadWebhook = onRequest(async (request, response) => {
  await handleWebhook(request, response, "google");
});

export const testLeadIngest = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");
  const result = await processInboundLead({
    platform: (request.data?.platform || "test") as LeadPlatform,
    source: request.data?.source || "Test Ingest",
    sourceType: request.data?.sourceType || "manual",
    event_id: request.data?.event_id,
    eventId: request.data?.eventId,
    name: request.data?.name,
    phone: request.data?.phone,
    email: request.data?.email,
    campaign: request.data?.campaign,
    campaign_id: request.data?.campaign_id,
    ad_id: request.data?.ad_id,
    form_id: request.data?.form_id,
    pipeline_id: request.data?.pipeline_id,
    message: request.data?.message,
    raw_payload: request.data,
  }, (request.data?.platform || "test") as LeadPlatform);

  return result;
});

export const testLeadIngestHttp = onRequest(async (request, response) => {
  const origin = request.get("origin") || "*";
  response.set("Access-Control-Allow-Origin", origin);
  response.set("Vary", "Origin");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = cleanValue(request.get("authorization") || request.get("Authorization"));
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      response.status(401).json({ ok: false, error: "Missing Authorization token" });
      return;
    }

    const decoded = await getAuth().verifyIdToken(token);
    if (!decoded.uid) {
      response.status(401).json({ ok: false, error: "Invalid token" });
      return;
    }

    const body = typeof request.body === "string"
      ? JSON.parse(request.body)
      : (request.body || {});

    const result = await processInboundLead({
      platform: (body.platform || "test") as LeadPlatform,
      source: body.source || "Test Ingest",
      sourceType: body.sourceType || "manual",
      event_id: body.event_id,
      eventId: body.eventId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      campaign: body.campaign,
      campaign_id: body.campaign_id,
      ad_id: body.ad_id,
      form_id: body.form_id,
      pipeline_id: body.pipeline_id,
      message: body.message,
      raw_payload: body,
    }, (body.platform || "test") as LeadPlatform);

    response.status(200).json({ ok: true, ...result });
  } catch (error: any) {
    console.error("testLeadIngestHttp failed:", error);
    response.status(500).json({ ok: false, error: error?.message || String(error) });
  }
});
export const queueLeadTemplateMessage = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");

  const uid = request.auth.uid;
  const leadId = cleanValue(request.data?.leadId);
  const templateId = cleanValue(request.data?.templateId);
  if (!leadId) throw new HttpsError("invalid-argument", "Missing leadId");
  if (!templateId) throw new HttpsError("invalid-argument", "Missing templateId");

  const leadRef = db.collection("leads").doc(leadId);
  const templateRef = db.collection("message_templates").doc(templateId);

  return await db.runTransaction(async (transaction) => {
    const leadSnap = await transaction.get(leadRef);
    if (!leadSnap.exists) throw new HttpsError("not-found", "Lead not found");

    const templateSnap = await transaction.get(templateRef);
    if (!templateSnap.exists) throw new HttpsError("not-found", "Message template not found");

    const leadData = leadSnap.data() || {};
    const template = templateSnap.data() || {};
    if (template.is_active === false) {
      throw new HttpsError("failed-precondition", "Message template is inactive");
    }

    const pipelineId = cleanValue(leadData.pipeline_id || template.pipeline_id || "default") || "default";
    const pipelineSnap = await transaction.get(db.collection("pipelines").doc(pipelineId));
    const pipelineData = pipelineSnap.exists ? (pipelineSnap.data() || {}) : {};
    const stageId = cleanValue(leadData.status || template.trigger_stage_id || "new");
    const stageLabel = Array.isArray((pipelineData as any).stages)
      ? ((pipelineData as any).stages.find((stage: any) => String(stage?.id || "") === stageId)?.label || stageId)
      : stageId;

    const context = {
      name: cleanValue(leadData.name) || "",
      phone: cleanValue(leadData.phone) || "",
      email: cleanValue(leadData.email) || "",
      source: cleanValue(leadData.source) || "",
      campaign: cleanValue(leadData.campaign) || "",
      pipeline: cleanValue((pipelineData as any).name) || pipelineId,
      stage: stageLabel,
      reason: cleanValue(leadData.reason) || "",
    };

    const subject = template.subject ? renderTemplateText(String(template.subject), context) : "";
    const body = renderTemplateText(String(template.body || ""), context);
    const queueRef = db.collection("message_queue").doc();
    transaction.create(queueRef, {
      lead_id: leadId,
      template_id: templateId,
      pipeline_id: pipelineId,
      channel: template.channel || "note",
      subject,
      body,
      status: "queued",
      created_by: uid,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    const activityRef = db.collection("activities").doc();
    transaction.create(activityRef, {
      lead_id: leadId,
      type: "message.template.queued",
      message: `${template.name}${subject ? ` | ${subject}` : ""}: ${body}`,
      actor: "system",
      created_at: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      queueId: queueRef.id,
      activityId: activityRef.id,
      subject,
      body,
      channel: template.channel || "note",
    };
  });
});

export const updateLeadDetails = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");

  const uid = request.auth.uid;
  const leadId = cleanValue(request.data?.leadId);
  if (!leadId) throw new HttpsError("invalid-argument", "Missing leadId");

  const leadRef = db.collection("leads").doc(leadId);

  return await db.runTransaction(async (transaction) => {
    const leadSnap = await transaction.get(leadRef);
    if (!leadSnap.exists) throw new HttpsError("not-found", "Lead not found");

    const current = leadSnap.data() || {};
    const updates: Record<string, any> = { updated_at: FieldValue.serverTimestamp() };
    const changedFields: string[] = [];

    const applyStringField = (field: string, rawValue: any) => {
      if (rawValue === undefined) return;

      const nextValue = cleanValue(rawValue);
      if (!nextValue) {
        if (current[field] !== undefined && current[field] !== null && current[field] !== "") {
          updates[field] = FieldValue.delete();
          changedFields.push(field);
        }
        return;
      }

      if (current[field] !== nextValue) {
        updates[field] = nextValue;
        changedFields.push(field);
      }
    };

    applyStringField("name", request.data?.name);
    applyStringField("phone", request.data?.phone);
    applyStringField("email", request.data?.email);
    applyStringField("source", request.data?.source);
    applyStringField("campaign", request.data?.campaign);
    applyStringField("owner_id", request.data?.owner_id);
    applyStringField("pipeline_id", request.data?.pipeline_id);
    applyStringField("status", request.data?.status);
    applyStringField("reason", request.data?.reason);

    const nextStatus = updates.status || current.status;
    const reasonValue = typeof updates.reason !== "undefined" ? updates.reason : current.reason;
    if (nextStatus === "lost" && !cleanValue(reasonValue)) {
      throw new HttpsError("invalid-argument", "Reason is required when status is Lost");
    }

    if (request.data?.next_follow_up_date !== undefined) {
      const rawFollowUp = cleanValue(request.data.next_follow_up_date);
      if (!rawFollowUp) {
        if (current.next_follow_up_date) {
          updates.next_follow_up_date = FieldValue.delete();
          changedFields.push("next_follow_up_date");
        }
      } else {
        const parsed = new Date(rawFollowUp);
        if (Number.isNaN(parsed.getTime())) {
          throw new HttpsError("invalid-argument", "Invalid next_follow_up_date");
        }

        const nextFollowUpDate = Timestamp.fromDate(parsed);
        const currentFollowUp = current.next_follow_up_date;
        const currentFollowUpMillis = typeof currentFollowUp?.toMillis === "function" ? currentFollowUp.toMillis() : null;

        if (currentFollowUpMillis !== nextFollowUpDate.toMillis()) {
          updates.next_follow_up_date = nextFollowUpDate;
          changedFields.push("next_follow_up_date");
        }
      }
    }

    if (changedFields.includes("status")) {
      updates.stageEnteredAt = FieldValue.serverTimestamp();
      if (!changedFields.includes("stageEnteredAt")) {
        changedFields.push("stageEnteredAt");
      }
    }

    if (changedFields.length === 0) {
      return { success: true, leadId, changedFields: [] };
    }

    transaction.update(leadRef, updates);

    if (changedFields.includes("status")) {
      const nextLeadData = { ...current, ...updates };
      const nextPipelineId = cleanValue(nextLeadData.pipeline_id || current.pipeline_id || "default") || "default";
      const nextStatus = cleanValue(nextLeadData.status || current.status || "new");
      await queueTemplateActivity(transaction, leadId, nextLeadData, nextPipelineId, nextStatus);
    }

    const activityRef = db.collection("activities").doc();
    transaction.create(activityRef, {
      lead_id: leadId,
      type: "lead.updated",
      message: `Updated lead details: ${changedFields.join(", ")}`,
      actor: uid,
      created_at: FieldValue.serverTimestamp(),
    });

    return { success: true, leadId, changedFields };
  });
});

export const processMessageQueueItem = onDocumentCreated({
  document: "message_queue/{itemId}",
  secrets: [whatsappAccessToken]
}, async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const data = snapshot.data();
  if (!data || data.status !== "queued") return;

  // If this message has a future scheduledAt time, let the scheduler trigger it later
  if (data.scheduledAt) {
    const scheduledMillis = typeof data.scheduledAt.toMillis === "function" ? data.scheduledAt.toMillis() : new Date(data.scheduledAt).getTime();
    if (scheduledMillis > Date.now()) {
      // Keep status as queued, do not process yet
      return;
    }
  }

  const itemId = event.params.itemId;
  const leadId = data.lead_id;
  const channel = data.channel;

  if (channel !== "whatsapp") {
    // Other channels are marked as sent instantly since they are mock stubs
    await snapshot.ref.update({
      status: "sent",
      updated_at: FieldValue.serverTimestamp()
    });
    return;
  }

  const whatsappToken = cleanValue(process.env.META_WHATSAPP_ACCESS_TOKEN);
  let phoneNumberId = cleanValue(process.env.META_WHATSAPP_PHONE_NUMBER_ID);
  let graphApiVersion = "v20.0";

  try {
    const metaConfigDoc = await db.collection("meta_integrations").doc("default").get();
    if (metaConfigDoc.exists) {
      const metaConfig = metaConfigDoc.data();
      if (metaConfig) {
        if (!phoneNumberId && metaConfig.whatsappPhoneNumberId) {
          phoneNumberId = cleanValue(metaConfig.whatsappPhoneNumberId);
        }
        if (metaConfig.graphApiVersion) {
          graphApiVersion = cleanValue(metaConfig.graphApiVersion);
        }
      }
    }
  } catch (err) {
    console.error("Error loading Meta config from Firestore:", err);
  }

  if (!whatsappToken || !phoneNumberId) {
    console.warn(`WhatsApp API credentials missing. token present: ${!!whatsappToken}, phoneId present: ${!!phoneNumberId}. Simulating success fallback.`);
    await snapshot.ref.update({
      status: "sent",
      error: "WhatsApp API credentials not configured; simulated success.",
      updated_at: FieldValue.serverTimestamp()
    });
    return;
  }

  // Fetch lead details for recipient target phone number
  const leadDoc = await db.collection("leads").doc(leadId).get();
  const leadData = leadDoc.data();
  if (!leadData || !leadData.phone) {
    await snapshot.ref.update({
      status: "failed",
      error: "Target lead has no phone number",
      updated_at: FieldValue.serverTimestamp()
    });
    return;
  }

  // Format phone to clean digits (Meta expects code + digits without spaces/symbols)
  const cleanPhone = leadData.phone.replace(/\D/g, "");

  try {
    const templateName = data.meta_template_name || data.templateId || "welcome_lead";
    const languageCode = data.templateLanguage || "en_US";

    // Build template components dynamically if variables mapping exists
    const parameters: any[] = [];
    if (data.variables && typeof data.variables === 'object') {
      // Variables mapped sequentially by key order, or by parameter index
      const keys = Object.keys(data.variables).sort((a, b) => Number(a) - Number(b));
      for (const key of keys) {
        parameters.push({ type: "text", text: String(data.variables[key] || "") });
      }
    } else {
      // Legacy fallback parameters
      parameters.push({ type: "text", text: leadData.name || "Customer" });
      parameters.push({ type: "text", text: leadData.campaign || "Ad Campaign" });
    }

    const response = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${whatsappToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: parameters.length > 0 ? [
            {
              type: "body",
              parameters: parameters
            }
          ] : []
        }
      })
    });

    const resJson: any = await response.json();
    if (!response.ok) {
      throw new Error(resJson.error?.message || "Meta API Error Response");
    }

    const metaMsgId = resJson.messages?.[0]?.id || null;

    await snapshot.ref.update({
      status: "sent",
      metaMessageId: metaMsgId,
      message_id: metaMsgId, // legacy support
      sentAt: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    await db.collection("activities").add({
      lead_id: leadId,
      type: "message.sent",
      message: `WhatsApp message successfully sent via Meta Cloud API. Message ID: ${metaMsgId || "unknown"}. Template: ${templateName}`,
      actor: "system",
      created_at: FieldValue.serverTimestamp()
    });

  } catch (err: any) {
    console.error("Meta WhatsApp Cloud API delivery failed:", err);
    await snapshot.ref.update({
      status: "failed",
      error: err?.message || String(err),
      failedAt: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });

    await db.collection("activities").add({
      lead_id: leadId,
      type: "message.failed",
      message: `WhatsApp message delivery failed: ${err?.message || String(err)}`,
      actor: "system",
      created_at: FieldValue.serverTimestamp()
    });
  }
});
// ─────────────────────────────────────────────────────────────────────────────
// Welcome message auto-send helpers & Firestore triggers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether a welcome message should be sent for the given lead document,
 * and if so, queues it in message_queue + records an activity, then marks the
 * lead as welcome_message_sent = true (so it is never sent twice).
 *
 * Must be called from OUTSIDE a transaction so that it can start its own.
 */
async function checkAndSendWelcomeMessage(
  leadId: string,
  leadData: Record<string, any>,
): Promise<void> {
  // Guard: already sent once for this lead
  if (leadData.welcome_message_sent === true) return;

  const pipelineId = cleanValue(leadData.pipeline_id || "default") || "default";
  const stageId    = cleanValue(leadData.status || "new") || "new";

  // ── 1. Read global welcome config from settings/welcome_config ──────────────
  const configSnap = await db.collection("settings").doc("welcome_config").get();
  if (!configSnap.exists) return;
  const config = configSnap.data() || {};
  if (!config.welcome_enabled) return;

  const templateId = cleanValue(config.welcome_template_id);
  if (!templateId) return;

  // ── 2. Verify the lead is currently in the FIRST stage of its pipeline ──────
  const pipelineSnap = await db.collection("pipelines").doc(pipelineId).get();
  const pipelineData = pipelineSnap.exists ? (pipelineSnap.data() || {}) : {};

  const stages: any[] = Array.isArray(pipelineData.stages) && pipelineData.stages.length > 0
    ? pipelineData.stages
    : [{ id: "new", label: "New" }];   // fallback for default pipeline

  const firstStageId = String(stages[0]?.id || "new");
  if (stageId !== firstStageId) return;  // not the first stage — skip

  // ── 3. Fetch and validate the message template ──────────────────────────────
  const templateSnap = await db.collection("message_templates").doc(templateId).get();
  if (!templateSnap.exists) return;
  const template = templateSnap.data() || {};
  if (template.is_active === false) return;
  if (template.channel !== "whatsapp") return;

  // ── 4. Idempotency key — prevents double-send even under concurrent triggers ─
  const idempotencyKey = `${leadId}_welcome_${templateId}`;
  const runRef = db.collection("automation_runs").doc(idempotencyKey);

  // ── 5. Build message render context ─────────────────────────────────────────
  const stageLabel = stages.find((s: any) => String(s?.id || "") === stageId)?.label || stageId;
  const context: Record<string, string> = {
    name:          cleanValue(leadData.name)     || "",
    phone:         cleanValue(leadData.phone)    || "",
    email:         cleanValue(leadData.email)    || "",
    source:        cleanValue(leadData.source)   || "",
    campaign:      cleanValue(leadData.campaign) || "",
    pipeline:      cleanValue(pipelineData.name) || pipelineId,
    pipeline_id:   pipelineId,
    stage:         stageLabel,
    status:        stageLabel,
    reason:        cleanValue(leadData.reason)   || "",
    channel:       String(template.channel       || ""),
    template_name: String(template.name          || ""),
  };

  const subject = template.subject ? renderTemplateText(String(template.subject), context) : "";
  const body    = renderTemplateText(String(template.body || ""), context);

  // ── 6. Run everything inside a transaction for atomicity ────────────────────
  await db.runTransaction(async (tx) => {
    // Double-check idempotency key inside the transaction
    const runSnap = await tx.get(runRef);
    if (runSnap.exists) return;

    // Double-check the lead still hasn't had a welcome sent
    const leadRef  = db.collection("leads").doc(leadId);
    const leadSnap = await tx.get(leadRef);
    if (!leadSnap.exists) return;
    if (leadSnap.data()?.welcome_message_sent === true) return;

    // Create automation_run record (idempotency fence)
    tx.create(runRef, {
      lead_id:         leadId,
      automation_id:   templateId,
      trigger_type:    "welcome_first_stage",
      stage_id:        stageId,
      pipeline_id:     pipelineId,
      status:          "success",
      run_at:          FieldValue.serverTimestamp(),
      idempotency_key: idempotencyKey,
    });

    // Queue the WhatsApp message → picked up by processMessageQueueItem
    const queueRef = db.collection("message_queue").doc();
    tx.create(queueRef, {
      lead_id:     leadId,
      template_id: templateId,
      pipeline_id: pipelineId,
      channel:     "whatsapp",
      subject,
      body,
      status:      "queued",
      created_by:  "system",
      created_at:  FieldValue.serverTimestamp(),
      updated_at:  FieldValue.serverTimestamp(),
    });

    // Activity record — visible in the lead's activity history
    const activityRef = db.collection("activities").doc();
    tx.create(activityRef, {
      lead_id:    leadId,
      type:       "message.welcome.queued",
      message:    `Auto welcome message queued via global config: "${template.name}"${subject ? ` | ${subject}` : ""}`,
      actor:      "system",
      created_at: FieldValue.serverTimestamp(),
    });

    // Mark the lead — ensures this is sent only once per lead, ever
    tx.update(leadRef, {
      welcome_message_sent: true,
      updated_at: FieldValue.serverTimestamp(),
    });
  });
}

// ── Trigger: new lead document created ────────────────────────────────────────
export const onLeadCreated = onDocumentCreated("leads/{leadId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const leadData = snap.data();
  if (!leadData) return;

  try {
    await checkAndSendWelcomeMessage(event.params.leadId, leadData);
  } catch (err) {
    console.error("onLeadCreated welcome check failed:", err);
  }
});

// ── Trigger: lead document updated (stage change / pipeline move) ─────────────
export const onLeadUpdated = onDocumentUpdated("leads/{leadId}", async (event) => {
  const before = event.data?.before.data();
  const after  = event.data?.after.data();
  if (!before || !after) return;

  const stageChanged    = before.status      !== after.status;
  const pipelineChanged = before.pipeline_id !== after.pipeline_id;
  const optOutChanged   = before.whatsappOptedOut !== after.whatsappOptedOut;

  // Handle stop/cancellation events on lead change
  if (stageChanged || pipelineChanged || optOutChanged || after.leadStatus === 'won' || after.leadStatus === 'lost' || (after.status === 'lost')) {
    try {
      const enrollsQuery = db.collection("automation_enrollments")
        .where("leadId", "==", event.params.leadId)
        .where("status", "==", "scheduled");
      const enrollsSnap = await enrollsQuery.get();
      if (!enrollsSnap.empty) {
        for (const enrollDoc of enrollsSnap.docs) {
          const enrollData = enrollDoc.data();
          const autoSnap = await db.collection("whatsapp_automations").doc(enrollData.automationId).get();
          if (autoSnap.exists) {
            const auto = autoSnap.data() || {};
            let cancel = false;
            let reason = "";

            if (auto.stopOnStageChange && (stageChanged || pipelineChanged)) {
              cancel = true; reason = "Lead moved to a different stage";
            } else if (auto.skipWon && after.leadStatus === 'won') {
              cancel = true; reason = "Lead status marked as Won";
            } else if (auto.skipLost && (after.leadStatus === 'lost' || after.status === 'lost')) {
              cancel = true; reason = "Lead status marked as Lost";
            } else if (auto.skipOptedOut && after.whatsappOptedOut) {
              cancel = true; reason = "Customer opted out of WhatsApp";
            }

            if (cancel) {
              await enrollDoc.ref.update({
                status: "cancelled",
                cancelReason: reason,
                updatedAt: FieldValue.serverTimestamp()
              });
              await db.collection("activities").add({
                lead_id: event.params.leadId,
                type: "automation.cancelled",
                message: `WhatsApp Automation enrollment cancelled. Reason: ${reason}.`,
                actor: "system",
                created_at: FieldValue.serverTimestamp()
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to process enrollments cancellation on lead update:", err);
    }
  }

  // Handle stage change auto enrollments (Future leads only / Current and future)
  if (stageChanged || pipelineChanged) {
    try {
      const activeAutosSnap = await db.collection("whatsapp_automations")
        .where("pipelineId", "==", after.pipeline_id || "default")
        .where("stageId", "==", after.status || "new")
        .where("status", "==", "active")
        .get();

      if (!activeAutosSnap.empty) {
        for (const autoDoc of activeAutosSnap.docs) {
          const auto = autoDoc.data();
          if (auto.audienceMode === "future_leads" || auto.audienceMode === "current_and_future") {
            // Enroll the lead
            const enrollId = `${autoDoc.id}:${event.params.leadId}`;
            const enrollRef = db.collection("automation_enrollments").doc(enrollId);
            const enrollSnap = await enrollRef.get();

            if (!enrollSnap.exists || (auto.preventDuplicate === false)) {
              if (leadEligibleForAutomation(after, auto)) {
                let scheduledAt = new Date();
                const now = new Date();
                
                if (auto.scheduleType === 'fixed_date' && auto.fixedScheduledAt) {
                  scheduledAt = auto.fixedScheduledAt.toDate();
                } else if (auto.scheduleType === 'days_after_stage') {
                  const delay = Number(auto.delayDays || 0);
                  const entryDate = after.stageEnteredAt ? after.stageEnteredAt.toDate() : now;
                  scheduledAt = new Date(entryDate.getTime() + delay * 24 * 60 * 60 * 1000);
                  if (auto.sendTime) {
                    const [h, m] = auto.sendTime.split(':').map(Number);
                    scheduledAt.setHours(h || 10, m || 0, 0, 0);
                  }
                } else if (auto.scheduleType === 'repeat_followup') {
                  const delay = Number(auto.delayDays || 0);
                  const entryDate = after.stageEnteredAt ? after.stageEnteredAt.toDate() : now;
                  scheduledAt = new Date(entryDate.getTime() + delay * 24 * 60 * 60 * 1000);
                  if (auto.sendTime) {
                    const [h, m] = auto.sendTime.split(':').map(Number);
                    scheduledAt.setHours(h || 10, m || 0, 0, 0);
                  }
                }

                // If scheduledAt is in the past, schedule for immediate processing
                if (scheduledAt.getTime() < now.getTime()) {
                  scheduledAt = now;
                }

                await enrollRef.set({
                  automationId: autoDoc.id,
                  leadId: event.params.leadId,
                  enrolledStageId: after.status || "new",
                  enrolledAt: FieldValue.serverTimestamp(),
                  scheduledAt: Timestamp.fromDate(scheduledAt),
                  currentMessageNumber: 1,
                  maxMessages: Number(auto.maxMessagesPerLead || 1),
                  status: "scheduled",
                  idempotencyKey: `${autoDoc.id}:${event.params.leadId}:1`,
                  createdAt: FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp()
                });

                await db.collection("activities").add({
                  lead_id: event.params.leadId,
                  type: "automation.enrolled",
                  message: `Lead enrolled in WhatsApp Automation: "${auto.name}". First message scheduled for ${scheduledAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
                  actor: "system",
                  created_at: FieldValue.serverTimestamp()
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed stage change auto enrollments:", err);
    }
  }

  // Welcome message handler
  if (after.welcome_message_sent === true && !pipelineChanged) return;

  try {
    await checkAndSendWelcomeMessage(event.params.leadId, after);
  } catch (err) {
    console.error("onLeadUpdated welcome check failed:", err);
  }
});

// Helper validation for automation eligibility
function leadEligibleForAutomation(lead: any, auto: any): boolean {
  if (!lead.phone) return false;
  if (auto.skipOptedOut && lead.whatsappOptedOut) return false;
  if (auto.skipWon && lead.leadStatus === 'won') return false;
  if (auto.skipLost && (lead.leadStatus === 'lost' || lead.status === 'lost')) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Automation Callable Cloud Functions
// ─────────────────────────────────────────────────────────────────────────────

export const activateAutomation = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");

  const { automationId } = request.data;
  if (!automationId) throw new HttpsError("invalid-argument", "Missing automationId");

  const autoRef = db.collection("whatsapp_automations").doc(automationId);
  const autoSnap = await autoRef.get();
  if (!autoSnap.exists) throw new HttpsError("not-found", "Automation not found");

  const auto = autoSnap.data() || {};
  if (auto.status === "active") {
    return { success: true, enrolled: 0, skipped: 0, message: "Already active" };
  }

  // Update status to active first
  await autoRef.update({
    status: "active",
    updatedAt: FieldValue.serverTimestamp()
  });

  // If audienceMode is future_leads only, do not enroll current leads
  if (auto.audienceMode === "future_leads") {
    return { success: true, enrolled: 0, skipped: 0, message: "Activated for future leads only" };
  }

  // Query all current leads in the pipeline stage
  const leadsSnap = await db.collection("leads")
    .where("pipeline_id", "==", auto.pipelineId)
    .where("status", "==", auto.stageId)
    .get();

  if (leadsSnap.empty) {
    return { success: true, enrolled: 0, skipped: 0, message: "No leads in this stage" };
  }

  let enrolled = 0;
  let skipped = 0;
  const now = new Date();

  // Retrieve existing enrollments to prevent duplicates
  const existingEnrollSnap = await db.collection("automation_enrollments")
    .where("automationId", "==", automationId)
    .get();
  const enrolledLeadIds = new Set(existingEnrollSnap.docs.map(d => d.data().leadId));

  for (const leadDoc of leadsSnap.docs) {
    const lead = leadDoc.data();
    if (auto.preventDuplicate && enrolledLeadIds.has(leadDoc.id)) {
      skipped++;
      continue;
    }

    if (!leadEligibleForAutomation(lead, auto)) {
      skipped++;
      continue;
    }

    // Calculate scheduledAt
    let scheduledAt = new Date();
    if (auto.scheduleType === "fixed_date" && auto.fixedScheduledAt) {
      scheduledAt = auto.fixedScheduledAt.toDate();
    } else if (auto.scheduleType === "days_after_stage" || auto.scheduleType === "repeat_followup") {
      const delay = Number(auto.delayDays || 0);
      const entryDate = lead.stageEnteredAt ? lead.stageEnteredAt.toDate() : now;
      scheduledAt = new Date(entryDate.getTime() + delay * 24 * 60 * 60 * 1000);
      if (auto.sendTime) {
        const [h, m] = auto.sendTime.split(':').map(Number);
        scheduledAt.setHours(h || 10, m || 0, 0, 0);
      }
    }

    if (scheduledAt.getTime() < now.getTime()) {
      scheduledAt = now;
    }

    const enrollId = `${automationId}:${leadDoc.id}`;
    await db.collection("automation_enrollments").doc(enrollId).set({
      automationId,
      leadId: leadDoc.id,
      enrolledStageId: auto.stageId,
      enrolledAt: FieldValue.serverTimestamp(),
      scheduledAt: Timestamp.fromDate(scheduledAt),
      currentMessageNumber: 1,
      maxMessages: Number(auto.maxMessagesPerLead || 1),
      status: "scheduled",
      idempotencyKey: `${automationId}:${leadDoc.id}:1`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    await db.collection("activities").add({
      lead_id: leadDoc.id,
      type: "automation.enrolled",
      message: `Lead enrolled in WhatsApp Automation: "${auto.name}". Scheduled at: ${scheduledAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      actor: request.auth.uid,
      created_at: FieldValue.serverTimestamp()
    });

    enrolled++;
  }

  return { success: true, enrolled, skipped };
});

export const enrollLeadInAutomation = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");

  const { automationId, leadId, isTest } = request.data;
  if (!automationId || !leadId) throw new HttpsError("invalid-argument", "Missing arguments");

  const autoSnap = await db.collection("whatsapp_automations").doc(automationId).get();
  if (!autoSnap.exists) throw new HttpsError("not-found", "Automation not found");
  const auto = autoSnap.data() || {};

  const leadSnap = await db.collection("leads").doc(leadId).get();
  if (!leadSnap.exists) throw new HttpsError("not-found", "Lead not found");
  const lead = leadSnap.data() || {};

  if (!isTest && !leadEligibleForAutomation(lead, auto)) {
    throw new HttpsError("failed-precondition", "Lead is not eligible for this automation");
  }

  const enrollId = `${automationId}:${leadId}`;
  const now = new Date();
  let scheduledAt = now;

  if (!isTest) {
    if (auto.scheduleType === "fixed_date" && auto.fixedScheduledAt) {
      scheduledAt = auto.fixedScheduledAt.toDate();
    } else if (auto.scheduleType === "days_after_stage" || auto.scheduleType === "repeat_followup") {
      const delay = Number(auto.delayDays || 0);
      const entryDate = lead.stageEnteredAt ? lead.stageEnteredAt.toDate() : now;
      scheduledAt = new Date(entryDate.getTime() + delay * 24 * 60 * 60 * 1000);
      if (auto.sendTime) {
        const [h, m] = auto.sendTime.split(':').map(Number);
        scheduledAt.setHours(h || 10, m || 0, 0, 0);
      }
    }
    if (scheduledAt.getTime() < now.getTime()) {
      scheduledAt = now;
    }
  }

  await db.collection("automation_enrollments").doc(enrollId).set({
    automationId,
    leadId,
    enrolledStageId: lead.status || auto.stageId,
    enrolledAt: FieldValue.serverTimestamp(),
    scheduledAt: Timestamp.fromDate(scheduledAt),
    currentMessageNumber: 1,
    maxMessages: isTest ? 1 : Number(auto.maxMessagesPerLead || 1),
    status: "scheduled",
    idempotencyKey: `${automationId}:${leadId}:1`,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await db.collection("activities").add({
    lead_id: leadId,
    type: "automation.enrolled",
    message: `Lead enrolled in WhatsApp Automation ${isTest ? "(TEST RUN)" : ""}: "${auto.name}". Scheduled at: ${scheduledAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    actor: request.auth.uid,
    created_at: FieldValue.serverTimestamp()
  });

  return { success: true, enrollId };
});

export const cancelAutomationEnrollment = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");

  const { enrollmentId, reason } = request.data;
  if (!enrollmentId) throw new HttpsError("invalid-argument", "Missing enrollmentId");

  const enrollRef = db.collection("automation_enrollments").doc(enrollmentId);
  const snap = await enrollRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Enrollment not found");

  await enrollRef.update({
    status: "cancelled",
    cancelReason: reason || "Manually cancelled by user",
    updatedAt: FieldValue.serverTimestamp()
  });

  await db.collection("activities").add({
    lead_id: snap.data()?.leadId,
    type: "automation.cancelled",
    message: `WhatsApp Automation cancelled manually: ${reason || "No reason provided"}.`,
    actor: request.auth.uid,
    created_at: FieldValue.serverTimestamp()
  });

  return { success: true };
});

export const pauseAutomation = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must log in");

  const { automationId } = request.data;
  if (!automationId) throw new HttpsError("invalid-argument", "Missing automationId");

  await db.collection("whatsapp_automations").doc(automationId).update({
    status: "paused",
    updatedAt: FieldValue.serverTimestamp()
  });

  // Cancel all pending enrollments
  const pendingSnap = await db.collection("automation_enrollments")
    .where("automationId", "==", automationId)
    .where("status", "==", "scheduled")
    .get();

  if (!pendingSnap.empty) {
    for (const enrollDoc of pendingSnap.docs) {
      await enrollDoc.ref.update({
        status: "cancelled",
        cancelReason: "Automation was paused by user",
        updatedAt: FieldValue.serverTimestamp()
      });

      await db.collection("activities").add({
        lead_id: enrollDoc.data().leadId,
        type: "automation.cancelled",
        message: `WhatsApp Automation enrollment cancelled because the sequence was paused.`,
        actor: request.auth.uid,
        created_at: FieldValue.serverTimestamp()
      });
    }
  }

  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled Worker: runs every 5 minutes and processes due enrollments
// ─────────────────────────────────────────────────────────────────────────────

import { onSchedule } from "firebase-functions/v2/scheduler";

export const processAutomationEnrollments = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "Asia/Kolkata",
  memory: "256MiB"
}, async (event) => {
  const now = new Date();
  const dueEnrollmentsSnap = await db.collection("automation_enrollments")
    .where("status", "==", "scheduled")
    .where("scheduledAt", "<=", Timestamp.fromDate(now))
    .limit(50)
    .get();

  if (dueEnrollmentsSnap.empty) {
    console.log("No due automation enrollments to process.");
    return;
  }

  console.log(`Processing ${dueEnrollmentsSnap.size} due automation enrollments.`);

  for (const enrollDoc of dueEnrollmentsSnap.docs) {
    const enrollId = enrollDoc.id;
    const enroll = enrollDoc.data();

    try {
      await db.runTransaction(async (transaction) => {
        // 1. Fetch fresh enrollment
        const freshEnrollDoc = await transaction.get(enrollDoc.ref);
        if (!freshEnrollDoc.exists) return;
        const freshEnroll = freshEnrollDoc.data() || {};
        if (freshEnroll.status !== "scheduled") return;

        // 2. Fetch automation config
        const autoSnap = await transaction.get(db.collection("whatsapp_automations").doc(freshEnroll.automationId));
        if (!autoSnap.exists) {
          transaction.update(enrollDoc.ref, {
            status: "failed",
            cancelReason: "Automation configuration not found",
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }
        const auto = autoSnap.data() || {};
        if (auto.status !== "active") {
          transaction.update(enrollDoc.ref, {
            status: "cancelled",
            cancelReason: "Automation is not active",
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }

        // 3. Fetch lead details
        const leadSnap = await transaction.get(db.collection("leads").doc(freshEnroll.leadId));
        if (!leadSnap.exists) {
          transaction.update(enrollDoc.ref, {
            status: "failed",
            cancelReason: "Target lead not found in database",
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }
        const lead = leadSnap.data() || {};

        // 4. Validate stop conditions / guards
        if (!lead.phone) {
          transaction.update(enrollDoc.ref, {
            status: "failed",
            cancelReason: "Lead is missing phone number",
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }

        if (auto.skipOptedOut && lead.whatsappOptedOut) {
          transaction.update(enrollDoc.ref, {
            status: "cancelled",
            cancelReason: "Customer opted out of WhatsApp messages",
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }

        if (auto.stopOnStageChange && lead.status !== freshEnroll.enrolledStageId) {
          transaction.update(enrollDoc.ref, {
            status: "cancelled",
            cancelReason: "Lead left configured stage",
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }

        if (auto.stopOnReply && lead.lastCustomerReplyAt && freshEnroll.enrolledAt) {
          const replyMillis = lead.lastCustomerReplyAt.toMillis();
          const enrollMillis = freshEnroll.enrolledAt.toMillis();
          if (replyMillis > enrollMillis) {
            transaction.update(enrollDoc.ref, {
              status: "cancelled",
              cancelReason: "Customer replied to messages",
              updatedAt: FieldValue.serverTimestamp()
            });
            return;
          }
        }

        if (auto.skipWon && lead.leadStatus === "won") {
          transaction.update(enrollDoc.ref, {
            status: "cancelled",
            cancelReason: "Lead status became Won",
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }

        if (auto.skipLost && (lead.leadStatus === "lost" || lead.status === "lost")) {
          transaction.update(enrollDoc.ref, {
            status: "cancelled",
            cancelReason: "Lead status became Lost",
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }

        // Check if message limit reached
        if (freshEnroll.currentMessageNumber > freshEnroll.maxMessages) {
          transaction.update(enrollDoc.ref, {
            status: "completed",
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }

        // Idempotency check: key format = automationId:leadId:messageNumber
        const idKey = `${freshEnroll.automationId}:${freshEnroll.leadId}:${freshEnroll.currentMessageNumber}`;
        const prevQueueSnap = await db.collection("message_queue")
          .where("idempotencyKey", "==", idKey)
          .limit(1)
          .get();

        if (!prevQueueSnap.empty) {
          transaction.update(enrollDoc.ref, {
            status: "failed",
            cancelReason: `Duplicate execution trigger prevented for run key: ${idKey}`,
            updatedAt: FieldValue.serverTimestamp()
          });
          return;
        }

        // 5. Build variable values dynamically
        const variables: Record<string, string> = {};
        if (auto.variableMappings && typeof auto.variableMappings === "object") {
          for (const key of Object.keys(auto.variableMappings)) {
            const field = auto.variableMappings[key];
            if (field === "name") variables[key] = lead.name || "";
            else if (field === "phone") variables[key] = lead.phone || "";
            else if (field === "email") variables[key] = lead.email || "";
            else if (field === "source") variables[key] = lead.source || "";
            else if (field === "campaign") variables[key] = lead.campaign || "";
            else if (field === "pipeline") variables[key] = auto.pipelineId;
            else if (field === "stage") variables[key] = auto.stageId;
          }
        }

        // 6. Create message_queue item
        const queueRef = db.collection("message_queue").doc();
        transaction.create(queueRef, {
          lead_id: freshEnroll.leadId,
          template_id: auto.templateId || auto.metaTemplateName,
          meta_template_name: auto.metaTemplateName,
          templateLanguage: auto.templateLanguage || "en_US",
          variables: variables,
          pipeline_id: auto.pipelineId,
          channel: "whatsapp",
          source: "automation",
          automationId: freshEnroll.automationId,
          enrollmentId: enrollId,
          status: "queued",
          idempotencyKey: idKey,
          attemptCount: 1,
          created_by: "system",
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp()
        });

        // 7. Update enrollment state
        const nextMsgNo = freshEnroll.currentMessageNumber + 1;
        const reachedMax = nextMsgNo > freshEnroll.maxMessages;

        const updateFields: any = {
          lastExecutionAt: FieldValue.serverTimestamp(),
          currentMessageNumber: nextMsgNo,
          updatedAt: FieldValue.serverTimestamp()
        };

        if (reachedMax || auto.scheduleType !== "repeat_followup") {
          updateFields.status = "completed";
        } else {
          // Schedule the next repeated follow-up
          const repeatDays = Number(auto.repeatEveryDays || 7);
          const nextScheduled = new Date(now.getTime() + repeatDays * 24 * 60 * 60 * 1000);
          if (auto.sendTime) {
            const [h, m] = auto.sendTime.split(':').map(Number);
            nextScheduled.setHours(h || 10, m || 0, 0, 0);
          }
          updateFields.scheduledAt = Timestamp.fromDate(nextScheduled);
          updateFields.nextExecutionAt = Timestamp.fromDate(nextScheduled);
          updateFields.status = "scheduled";
        }

        transaction.update(enrollDoc.ref, updateFields);

        // 8. Log activity
        const actRef = db.collection("activities").doc();
        transaction.create(actRef, {
          lead_id: freshEnroll.leadId,
          type: "message.queued",
          message: `WhatsApp Automation message #${freshEnroll.currentMessageNumber} queued for delivery: "${auto.name}"`,
          actor: "system",
          created_at: FieldValue.serverTimestamp()
        });
      });
    } catch (err: any) {
      console.error(`Transaction failed processing enrollment ${enrollId}:`, err);
    }
  }
});

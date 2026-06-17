import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Query } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { GoogleGenAI, Type } from "@google/genai";
initializeApp();
const db = getFirestore();
import { defineSecret } from "firebase-functions/params";
const googleGenAIKey = defineSecret("GOOGLE_GENAI_API_KEY");
function getAI() {
    return new GoogleGenAI({ apiKey: googleGenAIKey.value() });
}
setGlobalOptions({
    region: "asia-south1",
    secrets: [googleGenAIKey]
});
// Math utility to round exactly to nearest paise (2 decimals)
function exactRound(num) {
    return Math.round(num * 100) / 100;
}
/**
 * NEW: Automated Learning Engine
 * Syncs line items and customers to the master libraries.
 */
async function syncToLibrary(uid, items, customerId, customerName) {
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
            if (!item.description)
                continue;
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
                    model: "gemini-3.5-flash",
                    contents: prompt,
                });
                const aiText = aiResult.text || "";
                let aiParsed = { category: "General", size: "", specifications: [] };
                try {
                    const cleanedText = aiText.replace(/```json|```/g, "").trim();
                    aiParsed = JSON.parse(cleanedText);
                }
                catch (e) {
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
    }
    catch (error) {
        console.error("Library Sync Failure (non-blocking):", error);
    }
}
/**
 * 1. Invoice Numbering & 3. Conversion Gate
 * Converts a quotation into a full, locked invoice with absolute atomicity.
 */
export const convertQuotationToInvoice = onCall(async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.data()?.role !== "accounts" && userDoc.data()?.role !== "admin") {
        throw new HttpsError("permission-denied", "Only Accounts can convert invoices");
    }
    const { quotationId } = request.data;
    if (!quotationId)
        throw new HttpsError("invalid-argument", "Missing quotationId");
    const quotationRef = db.collection("quotations").doc(quotationId);
    return await db.runTransaction(async (transaction) => {
        const qDoc = await transaction.get(quotationRef);
        if (!qDoc.exists)
            throw new HttpsError("not-found", "Quotation not found");
        const qData = qDoc.data();
        if (!qData)
            throw new HttpsError("internal", "No data");
        if (qData.conversion_status === "converted") {
            throw new HttpsError("already-exists", "This quotation was already converted");
        }
        let subtotal = 0;
        let totalTax = 0;
        const validatedItems = qData.items.map((item) => {
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
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3)
            fyYear -= 1;
        const sequenceRef = db.collection("system").doc(`invoice_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        const invoiceNumber = `ECO/${fyYear}/${paddedSeq}`;
        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
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
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.data()?.role !== "accounts" && userDoc.data()?.role !== "admin") {
        throw new HttpsError("permission-denied", "Only Accounts can convert quotes");
    }
    const { quotationId } = request.data;
    if (!quotationId)
        throw new HttpsError("invalid-argument", "Missing quotationId");
    const quotationRef = db.collection("quotations").doc(quotationId);
    return await db.runTransaction(async (transaction) => {
        const qDoc = await transaction.get(quotationRef);
        if (!qDoc.exists)
            throw new HttpsError("not-found", "Quotation not found");
        const qData = qDoc.data();
        if (!qData)
            throw new HttpsError("internal", "No data");
        if (qData.conversion_status === "converted") {
            throw new HttpsError("already-exists", "This quotation was already converted");
        }
        let subtotal = 0;
        const validatedItems = qData.items.map((item) => {
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
        if (d.getMonth() < 3)
            fyYear -= 1;
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
/**
 * 1. Invoice Numbering & 2. Immutability
 * Creates a direct invoice with atomicity.
 */
export const createInvoice = onCall(async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
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
        const validatedItems = rawData.items.map((item) => {
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
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3)
            fyYear -= 1;
        const sequenceRef = db.collection("system").doc(`invoice_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        const invoiceNumber = `ECO/${fyYear}/${paddedSeq}`;
        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
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
/**
 * NEW: Cash Memo Module (Choice 1a, 2b)
 * Handles non-GST billing with a separate sequence (MEMO/...).
 */
export const createCashMemo = onCall(async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
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
        const validatedItems = rawData.items.map((item) => {
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
        if (d.getMonth() < 3)
            fyYear -= 1;
        const sequenceRef = db.collection("system").doc(`memo_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        const memoNumber = `MEMO/${fyYear}/${paddedSeq}`;
        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
        const memoRef = db.collection("cash_memos").doc();
        const memoData = {
            ...rawData,
            number: memoNumber,
            is_gst: false,
            is_locked: true,
            status: "finalized",
            payment_status: "paid", // Cash memos are assumed paid immediately
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
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const uid = request.auth.uid;
    const { quotationData: rawData } = request.data;
    if (!rawData || !rawData.customer_id || !rawData.items) {
        throw new HttpsError("invalid-argument", "Missing required fields");
    }
    return await db.runTransaction(async (transaction) => {
        let subtotal = 0;
        let totalTax = 0;
        const validatedItems = rawData.items.map((item) => {
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
        const d = new Date();
        let fyYear = d.getFullYear();
        if (d.getMonth() < 3)
            fyYear -= 1;
        const sequenceRef = db.collection("system").doc(`quotation_sequence_${fyYear}`);
        const seqDoc = await transaction.get(sequenceRef);
        let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
        currentSeq += 1;
        const paddedSeq = currentSeq.toString().padStart(4, "0");
        const quotationNumber = `QTN/${fyYear}/${paddedSeq}`;
        transaction.set(sequenceRef, { last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
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
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
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
        if (!tSnap.exists || !dSnap.exists)
            throw new HttpsError("not-found", "Record not found");
        const tData = tSnap.data();
        const dData = dSnap.data();
        if (tData.match_status === 'matched')
            throw new HttpsError("already-exists", "Transaction already matched");
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
async function listInvoices(args) {
    let query = db.collection("invoices");
    if (args.status)
        query = query.where("status", "==", args.status);
    if (args.payment_status)
        query = query.where("payment_status", "==", args.payment_status);
    const snapshot = await query.limit(5).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
async function getQuotationDetails(args) {
    const id = args.quotation_id;
    // 1. Direct ID get
    const doc = await db.collection("quotations").doc(id).get();
    if (doc.exists) {
        return { id: doc.id, ...doc.data() };
    }
    // 2. Exact match on quotation number (e.g. QTN/2026/0005)
    const exactQuery = db.collection("quotations").where("number", "==", id);
    const exactSnap = await exactQuery.get();
    if (!exactSnap.empty && exactSnap.docs[0]) {
        return { id: exactSnap.docs[0].id, ...exactSnap.docs[0].data() };
    }
    // 3. Fallback matching numbers like "5" or "0005"
    const numericMatch = id.match(/\d+/);
    if (numericMatch) {
        const seqNumber = parseInt(numericMatch[0], 10);
        const paddedSeq = seqNumber.toString().padStart(4, "0");
        const allSnap = await db.collection("quotations").get();
        const matched = allSnap.docs.find(d => {
            const num = d.data().number || "";
            return num.endsWith(`/${paddedSeq}`) || num.endsWith(`/${seqNumber}`) || num === id;
        });
        if (matched) {
            return { id: matched.id, ...matched.data() };
        }
    }
    return { error: `Quotation not found for ID or number: ${id}` };
}
/**
 * AI Tool: List Quotations
 */
async function listQuotations(args) {
    let query = db.collection("quotations");
    if (args.status)
        query = query.where("status", "==", args.status);
    const snapshot = await query.limit(20).get();
    let results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    if (args.customer_name) {
        const lowerCust = args.customer_name.toLowerCase();
        results = results.filter((q) => (q.customer_name || "").toLowerCase().includes(lowerCust));
    }
    return results;
}
/**
 * AI Tool: Check GST Compliance
 */
async function checkGSTCompliance(args) {
    const isValid = args.hsn_code.length >= 4 && /^\d+$/.test(args.hsn_code);
    return {
        hsn: args.hsn_code,
        is_compliant: isValid,
        message: isValid ? "Valid HSN format" : "Invalid HSN. Must be numeric and at least 4 digits"
    };
}
async function createCustomer(args) {
    const ref = db.collection("customers").doc();
    const customer = {
        name: args.name,
        gst_number: args.gst_number || "",
        billing_address: args.billing_address || "",
        type: args.type || "individual",
        created_at: FieldValue.serverTimestamp()
    };
    await ref.set(customer);
    return { success: true, customerId: ref.id, name: args.name };
}
async function createPurchaseOrder(args) {
    const d = new Date();
    let fyYear = d.getFullYear();
    if (d.getMonth() < 3)
        fyYear -= 1;
    const sequenceRef = db.collection("system").doc(`po_sequence_${fyYear}`);
    const seqDoc = await sequenceRef.get();
    let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
    currentSeq += 1;
    await sequenceRef.set({ last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    const paddedSeq = currentSeq.toString().padStart(4, "0");
    const poNumber = `PO/${fyYear}/${paddedSeq}`;
    let grandTotal = 0;
    const items = args.items.map(item => {
        const total = (item.quantity || 1) * (item.unitPrice || 0);
        grandTotal += total;
        return {
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total
        };
    });
    const ref = db.collection("purchase_orders").doc();
    const po = {
        number: poNumber,
        status: 'ordered',
        vendor: {
            name: args.vendor_name,
            address: "",
            gst_number: "",
            phone: ""
        },
        items,
        grandTotal,
        purchasingOfficer: args.purchasing_officer || "AI Assistant",
        paymentMethod: args.payment_method || "cash",
        createdAt: FieldValue.serverTimestamp()
    };
    await ref.set(po);
    const auditLogRef = db.collection("audit_logs").doc();
    await auditLogRef.set({
        document_type: "purchase_order",
        document_id: ref.id,
        action: "create",
        user_id: "AI_Agent",
        timestamp: FieldValue.serverTimestamp(),
        notes: `Created Purchase Order ${poNumber} via AI Assistant`
    });
    return { success: true, poId: ref.id, poNumber, grandTotal };
}
async function createPurchaseBill(args) {
    const ref = db.collection("purchases").doc();
    const purchase = {
        vendor: {
            name: args.vendor_name,
            address: "",
            gst_number: "",
            phone: ""
        },
        amount: Number(args.amount) || 0,
        grandTotal: Number(args.amount) || 0,
        reference: `V-${Math.floor(Math.random() * 10000)}`,
        category: args.category || 'General',
        status: args.status || 'pending',
        date: new Date(),
        created_at: FieldValue.serverTimestamp()
    };
    await ref.set(purchase);
    const auditLogRef = db.collection("audit_logs").doc();
    await auditLogRef.set({
        document_type: "purchase",
        document_id: ref.id,
        action: "create",
        user_id: "AI_Agent",
        timestamp: FieldValue.serverTimestamp(),
        notes: `Created Purchase Bill via AI Assistant`
    });
    return { success: true, purchaseId: ref.id, amount: args.amount };
}
async function createQuotationAI(args) {
    const customerSnap = await db.collection("customers").where("name", "==", args.customer_name).limit(1).get();
    let customerId = "walk_in";
    if (customerSnap.docs.length > 0 && customerSnap.docs[0]) {
        customerId = customerSnap.docs[0].id;
    }
    else {
        const newCust = db.collection("customers").doc();
        await newCust.set({ name: args.customer_name, type: "individual", created_at: FieldValue.serverTimestamp() });
        customerId = newCust.id;
    }
    const d = new Date();
    let fyYear = d.getFullYear();
    if (d.getMonth() < 3)
        fyYear -= 1;
    const sequenceRef = db.collection("system").doc(`quotation_sequence_${fyYear}`);
    const seqDoc = await sequenceRef.get();
    let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
    currentSeq += 1;
    await sequenceRef.set({ last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    const paddedSeq = currentSeq.toString().padStart(4, "0");
    const quotationNumber = `QTN/${fyYear}/${paddedSeq}`;
    let subtotal = 0;
    let totalTax = 0;
    const items = args.items.map(item => {
        const lineTotal = (item.quantity || 1) * (item.rate || 0);
        const taxPercentage = item.tax_percentage || 18;
        const taxAmount = (lineTotal * taxPercentage) / 100;
        subtotal += lineTotal;
        totalTax += taxAmount;
        return {
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            tax_percentage: taxPercentage,
            tax_amount: Math.round(taxAmount * 100) / 100,
            line_total: Math.round(lineTotal * 100) / 100
        };
    });
    const ref = db.collection("quotations").doc();
    const quotation = {
        number: quotationNumber,
        customer_id: customerId,
        customer_name: args.customer_name,
        status: 'draft',
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        tax_total: Math.round(totalTax * 100) / 100,
        grand_total: Math.round(subtotal + totalTax),
        created_by: "AI_Agent",
        created_at: FieldValue.serverTimestamp()
    };
    await ref.set(quotation);
    return { success: true, quotationId: ref.id, quotationNumber, grand_total: quotation.grand_total };
}
async function createInvoiceAI(args) {
    const customerSnap = await db.collection("customers").where("name", "==", args.customer_name).limit(1).get();
    let customerId = "walk_in";
    if (customerSnap.docs.length > 0 && customerSnap.docs[0]) {
        customerId = customerSnap.docs[0].id;
    }
    else {
        const newCust = db.collection("customers").doc();
        await newCust.set({ name: args.customer_name, type: "individual", created_at: FieldValue.serverTimestamp() });
        customerId = newCust.id;
    }
    const d = new Date();
    let fyYear = d.getFullYear();
    if (d.getMonth() < 3)
        fyYear -= 1;
    const seqName = args.is_gst ? `invoice_sequence_${fyYear}` : `memo_sequence_${fyYear}`;
    const sequenceRef = db.collection("system").doc(seqName);
    const seqDoc = await sequenceRef.get();
    let currentSeq = seqDoc.exists ? seqDoc.data()?.last_value || 0 : 0;
    currentSeq += 1;
    await sequenceRef.set({ last_value: currentSeq, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    const paddedSeq = currentSeq.toString().padStart(4, "0");
    const number = args.is_gst ? `ECO/${fyYear}/${paddedSeq}` : `MEMO/${fyYear}/${paddedSeq}`;
    let subtotal = 0;
    let totalTax = 0;
    const items = args.items.map(item => {
        const lineTotal = (item.quantity || 1) * (item.rate || 0);
        const taxPercentage = args.is_gst ? (item.tax_percentage || 18) : 0;
        const taxAmount = args.is_gst ? ((lineTotal * taxPercentage) / 100) : 0;
        subtotal += lineTotal;
        totalTax += taxAmount;
        return {
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            tax_percentage: taxPercentage,
            tax_amount: Math.round(taxAmount * 100) / 100,
            line_total: Math.round(lineTotal * 100) / 100
        };
    });
    const grandTotalExact = subtotal + totalTax;
    const roundOff = Math.round(grandTotalExact) - grandTotalExact;
    const finalGrandTotal = Math.round(grandTotalExact);
    const ref = db.collection(args.is_gst ? "invoices" : "cash_memos").doc();
    const invoiceData = {
        number,
        customer_id: customerId,
        customer_name: args.customer_name,
        is_gst: args.is_gst,
        is_locked: true,
        status: "finalized",
        payment_status: args.is_gst ? "unpaid" : "paid",
        items,
        subtotal: Math.round(subtotal * 100) / 100,
        tax_total: Math.round(totalTax * 100) / 100,
        cgst: args.is_gst ? Math.round((totalTax / 2) * 100) / 100 : 0,
        sgst_igst: args.is_gst ? Math.round((totalTax / 2) * 100) / 100 : 0,
        round_off: Math.round(roundOff * 100) / 100,
        grand_total: finalGrandTotal,
        balance_amount: args.is_gst ? finalGrandTotal : 0,
        payment_history: [],
        created_by: "AI_Agent",
        created_at: FieldValue.serverTimestamp()
    };
    await ref.set(invoiceData);
    const auditLogRef = db.collection("audit_logs").doc();
    await auditLogRef.set({
        document_type: args.is_gst ? "invoice" : "cash_memo",
        document_id: ref.id,
        action: "create",
        user_id: "AI_Agent",
        timestamp: FieldValue.serverTimestamp(),
        notes: `Created ${args.is_gst ? 'Invoice' : 'Cash Memo'} ${number} via AI Assistant`
    });
    return { success: true, docId: ref.id, number, grand_total: finalGrandTotal };
}
/**
 * 15. AI Auditor Layer (gemini-3.5-flash)
 */
export const aiAuditor = onCall(async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const { message, history = [] } = request.data;
    if (!message)
        throw new HttpsError("invalid-argument", "Missing message");
    const tools = [{
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
                    name: "list_quotations",
                    description: "List recent quotations, optionally filtered by status or customer name.",
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            status: { type: Type.STRING, description: "Filter by status ('draft', 'converted', 'cancelled')" },
                            customer_name: { type: Type.STRING, description: "Filter by customer name" }
                        }
                    }
                },
                {
                    name: "get_quotation_details",
                    description: "Get full details of a specific quotation by its ID or quotation number (e.g. '5' or 'QTN/2026/0005').",
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            quotation_id: { type: Type.STRING, description: "The unique ID or number of the quotation" }
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
                },
                {
                    name: "create_customer",
                    description: "Create a new customer in the customer base library.",
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING, description: "The customer's name" },
                            gst_number: { type: Type.STRING, description: "Optional GST number of the customer" },
                            billing_address: { type: Type.STRING, description: "Optional billing address" },
                            type: { type: Type.STRING, description: "Customer type ('business' or 'individual')", enum: ["business", "individual"] }
                        },
                        required: ["name"]
                    }
                },
                {
                    name: "create_purchase_order",
                    description: "Create a new Purchase Order for maintenance or buying products.",
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            vendor_name: { type: Type.STRING, description: "Name of the vendor" },
                            purchasing_officer: { type: Type.STRING, description: "Who is making the purchase order (employee name)" },
                            payment_method: { type: Type.STRING, description: "Payment mode ('cash', 'check', 'account')", enum: ["cash", "check", "account"] },
                            items: {
                                type: Type.ARRAY,
                                description: "List of items to purchase",
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        itemName: { type: Type.STRING, description: "Item description" },
                                        quantity: { type: Type.INTEGER, description: "Quantity" },
                                        unitPrice: { type: Type.NUMBER, description: "Unit price" }
                                    },
                                    required: ["itemName", "quantity", "unitPrice"]
                                }
                            }
                        },
                        required: ["vendor_name", "items"]
                    }
                },
                {
                    name: "create_purchase_bill",
                    description: "Create a direct purchase bill/record without PO.",
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            vendor_name: { type: Type.STRING, description: "Vendor name" },
                            amount: { type: Type.NUMBER, description: "Total bill amount" },
                            category: { type: Type.STRING, description: "Category of purchase (e.g. Expenses, Maintenance, Food, Asset)", enum: ["Asset", "Subscription", "Production", "Maintenance", "Expenses"] }
                        },
                        required: ["vendor_name", "amount"]
                    }
                },
                {
                    name: "create_quotation",
                    description: "Create a quotation draft.",
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            customer_name: { type: Type.STRING, description: "Customer name" },
                            items: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        description: { type: Type.STRING, description: "Item description" },
                                        quantity: { type: Type.INTEGER, description: "Quantity" },
                                        rate: { type: Type.NUMBER, description: "Rate / Unit price" },
                                        tax_percentage: { type: Type.INTEGER, description: "Tax % (default 18)" }
                                    },
                                    required: ["description", "quantity", "rate"]
                                }
                            }
                        },
                        required: ["customer_name", "items"]
                    }
                },
                {
                    name: "create_invoice",
                    description: "Create a tax invoice or cash memo.",
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            customer_name: { type: Type.STRING, description: "Customer name" },
                            is_gst: { type: Type.BOOLEAN, description: "True for GST Tax Invoice, False for Cash Memo" },
                            items: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        description: { type: Type.STRING, description: "Item description" },
                                        quantity: { type: Type.INTEGER, description: "Quantity" },
                                        rate: { type: Type.NUMBER, description: "Rate / Unit price" },
                                        tax_percentage: { type: Type.INTEGER, description: "Tax % (default 18)" }
                                    },
                                    required: ["description", "quantity", "rate"]
                                }
                            }
                        },
                        required: ["customer_name", "items", "is_gst"]
                    }
                }
            ]
        }];
    const ai = getAI();
    const chat = ai.chats.create({
        model: "gemini-3.5-flash",
        config: {
            tools,
            systemInstruction: `You are the EcoBill AI Assistant, an interactive voice and text agent.
            Your tone is professional yet helpful and conversational. You can manage, search, and CREATE records.
            You can:
            - Create customers using 'create_customer'.
            - Create purchase orders using 'create_purchase_order'.
            - Create purchase bills using 'create_purchase_bill'.
            - Create quotations using 'create_quotation'.
            - Create tax invoices or cash memos using 'create_invoice'.
            - List quotations using 'list_quotations'.
            - Get details of a quotation using 'get_quotation_details' (supports doc IDs or visible numbers like QTN/2026/0005 or 5).
            - List invoices using 'list_invoices'.
            Explain what you did and confirm to the user.`
        }
    });
    const result = await chat.sendMessage({ message });
    const response = result;
    const calls = response.candidates?.[0]?.content?.parts?.filter((p) => p.functionCall).map((p) => p.functionCall);
    if (calls && calls.length > 0) {
        const toolResponses = [];
        for (const call of calls) {
            if (!call)
                continue;
            let toolResult;
            if (call.name === "list_invoices")
                toolResult = await listInvoices(call.args);
            if (call.name === "list_quotations")
                toolResult = await listQuotations(call.args);
            if (call.name === "get_quotation_details")
                toolResult = await getQuotationDetails(call.args);
            if (call.name === "check_gst_compliance")
                toolResult = await checkGSTCompliance(call.args);
            if (call.name === "create_customer")
                toolResult = await createCustomer(call.args);
            if (call.name === "create_purchase_order")
                toolResult = await createPurchaseOrder(call.args);
            if (call.name === "create_purchase_bill")
                toolResult = await createPurchaseBill(call.args);
            if (call.name === "create_quotation")
                toolResult = await createQuotationAI(call.args);
            if (call.name === "create_invoice")
                toolResult = await createInvoiceAI(call.args);
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
            text: finalResult.candidates?.[0]?.content?.parts?.[0]?.text || "",
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
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const { transcript, audio } = request.data;
    if (!transcript && !audio)
        throw new HttpsError("invalid-argument", "Transcript or audio is required");
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
    let contents = [];
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
    }
    else {
        contents = [{ text: promptText }];
    }
    try {
        console.log("[API] parseVoiceCommand Request with input:", audio ? "Audio Base64 Input" : transcript);
        const ai = getAI();
        const aiResult = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: contents,
        });
        const aiText = aiResult.text || "";
        console.log("[AI] Gemini Raw Response:", aiText);
        const cleanedText = aiText.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanedText);
        console.log("[AI] Parsed Result:", JSON.stringify(parsed));
        console.log("[API] parseVoiceCommand Response:", JSON.stringify(parsed));
        return parsed;
    }
    catch (e) {
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
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const { transcript, audio } = request.data;
    if (!transcript && !audio)
        throw new HttpsError("invalid-argument", "Transcript or audio is required");
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
    let contents = [];
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
    }
    else {
        contents = [{ text: promptText }];
    }
    try {
        console.log("[API] parsePurchaseVoice Request with input:", audio ? "Audio Base64 Input" : transcript);
        const ai = getAI();
        const aiResult = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: contents,
        });
        const aiText = aiResult.text || "";
        console.log("[AI] Gemini Raw Response:", aiText);
        const cleanedText = aiText.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanedText);
        console.log("[AI] Parsed Result:", JSON.stringify(parsed));
        console.log("[API] parsePurchaseVoice Response:", JSON.stringify(parsed));
        return parsed;
    }
    catch (e) {
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
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const pendingTxSnap = await db.collection("transactions").where("match_status", "==", "pending_review").get();
    if (pendingTxSnap.empty)
        return { success: true, count: 0 };
    const invoicesSnap = await db.collection("invoices").where("payment_status", "in", ["unpaid", "partial"]).get();
    const invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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
        ${JSON.stringify(invoices.map(i => ({ id: i.id, number: i.number, customer: i.customer_name, balance: i.balance_amount })))}

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
                model: "gemini-3.5-flash",
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
                    message: `I found a cryptic transaction for ₹${tx.amount} (Ref: ${tx.bank_transaction_id || tx.description.substring(0, 20)}). I placed it in ${result.category || 'General'}, but I suspect it might be a new vendor or unmapped entity. Please review it.`,
                    user_id: "system",
                    is_read: false,
                    created_at: new Date()
                });
            }
            count++;
        }
        catch (e) {
            console.error("AI matching failed for tx", doc.id, e);
        }
    }
    return { success: true, count };
});
export const parsePDFStatement = onCall(async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const { base64Data, mimeType } = request.data;
    if (!base64Data || !mimeType)
        throw new HttpsError("invalid-argument", "Missing file data");
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
            model: "gemini-3.5-flash",
            contents: requestPayload.contents,
        });
        const aiText = aiResult.text || "[]";
        const cleanedText = aiText.replace(/```json|```/g, "").trim();
        const transactions = JSON.parse(cleanedText);
        if (!Array.isArray(transactions)) {
            throw new Error("AI did not return an array");
        }
        return { success: true, transactions };
    }
    catch (e) {
        console.error("PDF Parsing failed:", e);
        throw new HttpsError("internal", "Failed to parse PDF statement: " + e.message);
    }
});
/**
 * Phase 4: AI Invoice Extraction & Smart Categorization
 */
export const extractInvoiceData = onCall(async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
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
            model: "gemini-3.5-flash",
            contents: requestPayload.contents,
            config: {
                responseMimeType: "application/json"
            }
        });
        const aiText = aiResult.text || "{}";
        const cleanedText = aiText.replace(/```json|```/g, "").trim();
        const extracted = JSON.parse(cleanedText);
        if (!extracted.items || !Array.isArray(extracted.items))
            extracted.items = [];
        let validCategory = ["Asset", "Subscription", "Production", "Maintenance", "Expenses"].includes(extracted.category) ? extracted.category : "Expenses";
        extracted.category = validCategory;
        let manualReviewRequired = false;
        if (typeof extracted.grandTotal !== 'number' || isNaN(extracted.grandTotal))
            manualReviewRequired = true;
        if (!extracted.invoice?.invoice_date || isNaN(Date.parse(extracted.invoice.invoice_date)))
            manualReviewRequired = true;
        for (const item of extracted.items) {
            if (typeof item.quantity !== 'number' || item.quantity < 0)
                manualReviewRequired = true;
            if (typeof item.unitPrice !== 'number' || item.unitPrice < 0)
                manualReviewRequired = true;
        }
        if (extracted.items.length === 0)
            manualReviewRequired = true;
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
        }
        catch (e) {
            console.error("Failed to save extraction log to storage", e);
        }
        return { success: true, data: extracted };
    }
    catch (e) {
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
//# sourceMappingURL=index.js.map
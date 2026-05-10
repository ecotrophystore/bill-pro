import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Query } from "firebase-admin/firestore";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
initializeApp();
const db = getFirestore();
// Initialize Gemini lazily to ensure secrets are loaded
let genAI;
let model;
async function getAI() {
    const key = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || "";
    if (!key) {
        console.error("AI Init: API Key is missing from both GOOGLE_GENAI_API_KEY and GEMINI_API_KEY");
        throw new HttpsError("failed-precondition", "AI configuration error: API key missing. Please check Firebase Secrets.");
    }
    if (!genAI) {
        genAI = new GoogleGenerativeAI(key);
        console.log("AI Init: Initialized with key starting with:", key.substring(0, 4) + "...");
        model = genAI.getGenerativeModel({
            model: "gemini-3-flash-preview",
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2000,
            },
        }, { apiVersion: 'v1beta' });
    }
    return { genAI, model };
}
setGlobalOptions({ region: "asia-south1" });
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
                const { model: aiModel } = await getAI();
                const aiResult = await aiModel.generateContent(prompt);
                const aiText = aiResult.response.text();
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
 * Auto-registers a user if they don't have a Firestore user document yet.
 * This ensures any authenticated user can use the system without manual setup.
 */
async function ensureUserRegistered(uid, email) {
    try {
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            await db.collection("users").doc(uid).set({
                id: uid,
                email: email || "unknown",
                name: email ? email.split("@")[0] : "User",
                role: "admin",
                is_active: true,
                created_at: FieldValue.serverTimestamp()
            });
            console.log(`Auto-registered new user: ${email} (${uid})`);
        }
    }
    catch (err) {
        console.error("ensureUserRegistered failed (non-blocking):", err);
    }
}
/**
 * 1. Invoice Numbering & 3. Conversion Gate
 * Converts a quotation into a full, locked invoice with absolute atomicity.
 */
export const convertQuotationToInvoice = onCall({ cors: true }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const uid = request.auth.uid;
    await ensureUserRegistered(uid, request.auth.token.email || "");
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
        const invoiceData = {
            number: invoiceNumber,
            customer_id: qData.customer_id,
            customer_name: qData.customer_name,
            is_gst: true,
            is_locked: true,
            status: "finalized", // Updated from 'issued'
            payment_status: "unpaid", // New required field
            items: validatedItems,
            subtotal: exactRound(subtotal),
            tax_total: exactRound(totalTax), // New first-class field
            cgst: exactRound(totalTax / 2),
            sgst_igst: exactRound(totalTax / 2),
            round_off: roundOff,
            grand_total: finalGrandTotal,
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
/**
 * 1. Invoice Numbering & 2. Immutability
 * Creates a direct invoice with atomicity.
 */
export const createInvoice = onCall({
    region: "asia-south1",
    secrets: ["GOOGLE_GENAI_API_KEY"],
    cors: true
}, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const uid = request.auth.uid;
    await ensureUserRegistered(uid, request.auth.token.email || "");
    const { invoiceData: rawData } = request.data;
    if (!rawData || (!rawData.customer_id && !rawData.customer_name) || !rawData.items) {
        throw new HttpsError("invalid-argument", "Missing required invoice fields (need customer_id or customer_name, and items)");
    }
    const result = await db.runTransaction(async (transaction) => {
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
            status: "finalized",
            payment_status: "unpaid",
            items: validatedItems,
            subtotal: exactRound(subtotal),
            tax_total: exactRound(totalTax),
            cgst: rawData.is_igst ? 0 : exactRound(totalTax / 2),
            sgst_igst: rawData.is_igst ? exactRound(totalTax) : exactRound(totalTax / 2),
            round_off: roundOff,
            grand_total: finalGrandTotal,
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
        return { success: true, invoiceId: invoiceRef.id, invoiceNumber, validatedItems };
    });
    // Library sync happens AFTER the transaction succeeds (non-blocking)
    // This prevents Gemini API failures from crashing invoice creation
    try {
        await syncToLibrary(uid, result.validatedItems, rawData.customer_id, rawData.customer_name);
    }
    catch (syncError) {
        console.error("Library sync failed (invoice was still created):", syncError);
    }
    return { success: true, invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber };
});
/**
 * NEW: Cash Memo Module (Choice 1a, 2b)
 * Handles non-GST billing with a separate sequence (MEMO/...).
 */
export const createCashMemo = onCall({
    region: "asia-south1",
    secrets: ["GOOGLE_GENAI_API_KEY"],
    cors: true
}, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const uid = request.auth.uid;
    await ensureUserRegistered(uid, request.auth.token.email || "");
    const { memoData: rawData } = request.data;
    if (!rawData || !rawData.items) {
        throw new HttpsError("invalid-argument", "Missing required memo fields");
    }
    const result = await db.runTransaction(async (transaction) => {
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
            payment_status: "paid",
            items: validatedItems,
            subtotal: exactRound(subtotal),
            tax_total: 0,
            cgst: 0,
            sgst_igst: 0,
            round_off: roundOff,
            grand_total: finalGrandTotal,
            created_by: uid,
            created_at: FieldValue.serverTimestamp(),
            audit_trail: [{
                    action: "cash_memo_creation",
                    user: uid,
                    timestamp: new Date().toISOString()
                }]
        };
        transaction.set(memoRef, memoData);
        const auditLogRef = db.collection("audit_logs").doc();
        transaction.set(auditLogRef, {
            document_type: "cash_memo",
            document_id: memoRef.id,
            action: "create",
            user_id: uid,
            timestamp: FieldValue.serverTimestamp(),
            notes: "Created non-GST cash memo"
        });
        return { success: true, memoId: memoRef.id, memoNumber, validatedItems };
    });
    // Library sync AFTER transaction (non-blocking)
    try {
        await syncToLibrary(uid, result.validatedItems, rawData.customer_id, rawData.customer_name);
    }
    catch (syncError) {
        console.error("Library sync failed (memo was still created):", syncError);
    }
    return { success: true, memoId: result.memoId, memoNumber: result.memoNumber };
});
/**
 * 1. Sequential Numbering
 * Creates a quotation with atomic numbering.
 */
export const createQuotation = onCall({
    region: "asia-south1",
    secrets: ["GOOGLE_GENAI_API_KEY"],
    cors: true
}, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const uid = request.auth.uid;
    const { quotationData: rawData } = request.data;
    if (!rawData || !rawData.customer_id || !rawData.items) {
        throw new HttpsError("invalid-argument", "Missing required fields");
    }
    const result = await db.runTransaction(async (transaction) => {
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
        return { success: true, quotationId: quotationRef.id, quotationNumber, validatedItems };
    });
    // Library sync AFTER transaction (non-blocking)
    try {
        await syncToLibrary(uid, result.validatedItems, rawData.customer_id, rawData.customer_name);
    }
    catch (syncError) {
        console.error("Library sync failed (quotation was still created):", syncError);
    }
    return { success: true, quotationId: result.quotationId, quotationNumber: result.quotationNumber };
});
/**
 * 4. Bank Reconciliation Gate
 * Matches a transaction to a document (Invoice/Purchase) and updates status.
 */
export const matchTransaction = onCall({ cors: true }, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const uid = request.auth.uid;
    await ensureUserRegistered(uid, request.auth.token.email || "");
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
/**
 * AI Tool: Get Quotation Details
 */
async function getQuotationDetails(args) {
    const doc = await db.collection("quotations").doc(args.quotation_id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : { error: "Not found" };
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
/**
 * 15. AI Auditor Layer (Gemini-1.5-Flash)
 */
export const aiAuditor = onCall({
    region: "asia-south1",
    secrets: ["GOOGLE_GENAI_API_KEY"],
    cors: true
}, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const { message, history: rawHistory = [] } = request.data;
    console.log(`AI Auditor Request from ${request.auth.uid}:`, { message, historyLength: rawHistory.length });
    // GEMINI REQUIREMENT: History MUST start with role 'user'.
    // If the first message is 'model' (e.g. greeting), remove it or skip until the first 'user' message.
    let history = rawHistory;
    const firstUserIndex = history.findIndex((m) => m.role === 'user');
    if (firstUserIndex !== -1) {
        history = history.slice(firstUserIndex);
    }
    else {
        history = []; // No user messages in history, start fresh
    }
    if (!message)
        throw new HttpsError("invalid-argument", "Missing message");
    const { genAI: ai } = await getAI();
    try {
        const auditorModel = ai.getGenerativeModel({
            model: "gemini-3-flash-preview",
            systemInstruction: "You are the EcoBill AI Assistant, a trusted co-founder and friendly business partner at Ecotrophy Innovations. Your tone is very short, warm, and highly conversational. Do NOT use complex words; speak casually like a close friend. You MUST reply in the language the user chooses (English or Tamil). Ask for their language preference if not established. Protect Ecotrophy from financial/legal risks and offer simple strategic advice. Always stay within your toolset. If an action like 'Converting a Quotation' is suggested, friendly inform them to click the 'Convert' button in the UI (Rule #13)."
        }, { apiVersion: 'v1beta' });
        console.log("AI Auditor: Model initialized, starting chat...");
        const tools = [{
                functionDeclarations: [
                    {
                        name: "list_invoices",
                        description: "List recent invoices, optionally filtered by status, payment_status, or customer.",
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {
                                status: { type: SchemaType.STRING, description: "Filter by status ('draft', 'finalized', 'cancelled')" },
                                payment_status: { type: SchemaType.STRING, description: "Filter by payment status ('unpaid', 'paid', 'partial')" },
                                customer_name: { type: SchemaType.STRING, description: "Filter by customer name" }
                            }
                        }
                    },
                    {
                        name: "get_quotation_details",
                        description: "Get full details of a specific quotation by its ID.",
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {
                                quotation_id: { type: SchemaType.STRING, description: "The unique ID of the quotation" }
                            },
                            required: ["quotation_id"]
                        }
                    },
                    {
                        name: "check_gst_compliance",
                        description: "Validate an HSN code for GST compliance.",
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {
                                hsn_code: { type: SchemaType.STRING, description: "The HSN code to check" }
                            },
                            required: ["hsn_code"]
                        }
                    }
                ]
            }];
        const chat = auditorModel.startChat({
            history,
            tools
        });
        const result = await chat.sendMessage(message);
        const response = result.response;
        const calls = response.functionCalls();
        if (calls && calls.length > 0) {
            console.log("AI Auditor: Function calls detected:", calls.map(c => c.name));
            const toolResponses = [];
            for (const call of calls) {
                let toolResult;
                if (call.name === "list_invoices")
                    toolResult = await listInvoices(call.args);
                if (call.name === "get_quotation_details")
                    toolResult = await getQuotationDetails(call.args);
                if (call.name === "check_gst_compliance")
                    toolResult = await checkGSTCompliance(call.args);
                toolResponses.push({
                    functionResponse: { name: call.name, response: { content: toolResult } }
                });
            }
            console.log("AI Auditor: Sending tool responses back to Gemini...");
            const finalResult = await chat.sendMessage(toolResponses);
            console.log("AI Auditor: Received final response");
            return {
                text: finalResult.response.text(),
                history: await chat.getHistory()
            };
        }
        return {
            text: response.text(),
            history: await chat.getHistory()
        };
    }
    catch (error) {
        console.error("AI Auditor Error:", error);
        throw new HttpsError("internal", error.message || "AI Auditor failed");
    }
});
// ─── AI Tool Functions for Voice Commander ───────────────────────────────
async function getRevenueData() {
    const invSnap = await db.collection("invoices").get();
    const memoSnap = await db.collection("cash_memos").get();
    let invRevenue = 0, invGst = 0, invCount = 0, memoRevenue = 0, memoGst = 0, memoCount = 0;
    invSnap.forEach(d => {
        const data = d.data();
        if (data.status !== "cancelled") {
            invRevenue += data.subtotal || 0;
            invGst += data.tax_total || 0;
            invCount++;
        }
    });
    memoSnap.forEach(d => {
        const data = d.data();
        memoRevenue += data.subtotal || 0;
        memoGst += data.tax_total || 0;
        memoCount++;
    });
    return { invoice_revenue: invRevenue, invoice_gst: invGst, invoice_count: invCount, memo_revenue: memoRevenue, memo_gst: memoGst, memo_count: memoCount, total_revenue: invRevenue + memoRevenue, total_gst: invGst + memoGst };
}
async function getPendingInvoices() {
    const snap = await db.collection("invoices").where("payment_status", "in", ["unpaid", "partial"]).get();
    const results = snap.docs.map(d => ({ id: d.id, number: d.data().number, customer: d.data().customer_name || d.data().customer_id, amount: d.data().grand_total, status: d.data().payment_status }));
    return { count: results.length, total_pending: results.reduce((s, r) => s + (r.amount || 0), 0), invoices: results.slice(0, 10) };
}
async function getProfitData() {
    const invSnap = await db.collection("invoices").get();
    const memoSnap = await db.collection("cash_memos").get();
    const purSnap = await db.collection("purchases").get();
    let revenue = 0, expenses = 0;
    invSnap.forEach(d => { if (d.data().status !== "cancelled")
        revenue += d.data().subtotal || 0; });
    memoSnap.forEach(d => { revenue += d.data().subtotal || 0; });
    purSnap.forEach(d => { expenses += d.data().amount || 0; });
    const profit = revenue - expenses;
    return { revenue, expenses, profit, margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) + "%" : "0%", purchase_count: purSnap.size };
}
async function countDocuments(args) {
    const validCollections = ["invoices", "cash_memos", "quotations", "products", "customers", "purchases"];
    const col = args.collection_name;
    if (!validCollections.includes(col))
        return { error: `Invalid collection. Valid: ${validCollections.join(", ")}` };
    const snap = await db.collection(col).get();
    return { collection: col, count: snap.size };
}
async function searchInvoicesByCustomer(args) {
    const snap = await db.collection("invoices").limit(50).get();
    const results = snap.docs
        .filter(d => (d.data().customer_name || "").toLowerCase().includes(args.customer_name.toLowerCase()))
        .map(d => ({ id: d.id, number: d.data().number, customer: d.data().customer_name, amount: d.data().grand_total, status: d.data().status, payment: d.data().payment_status }));
    return { count: results.length, invoices: results.slice(0, 10) };
}
async function getBusinessSummary() {
    const [invSnap, memoSnap, purSnap, prodSnap, custSnap, quoteSnap] = await Promise.all([
        db.collection("invoices").get(), db.collection("cash_memos").get(), db.collection("purchases").get(),
        db.collection("products").get(), db.collection("customers").get(), db.collection("quotations").get()
    ]);
    let revenue = 0, expenses = 0, gst = 0, unpaid = 0;
    invSnap.forEach(d => {
        const data = d.data();
        if (data.status !== "cancelled") {
            revenue += data.subtotal || 0;
            gst += data.tax_total || 0;
        }
        if (data.payment_status === "unpaid" || data.payment_status === "partial")
            unpaid += data.grand_total || 0;
    });
    memoSnap.forEach(d => { revenue += d.data().subtotal || 0; gst += d.data().tax_total || 0; });
    purSnap.forEach(d => { expenses += d.data().amount || 0; });
    return {
        invoices: invSnap.size, cash_memos: memoSnap.size, quotations: quoteSnap.size,
        products: prodSnap.size, customers: custSnap.size, purchases: purSnap.size,
        total_revenue: revenue, total_expenses: expenses, net_profit: revenue - expenses,
        total_gst: gst, unpaid_amount: unpaid,
        margin: revenue > 0 ? ((((revenue - expenses) / revenue) * 100).toFixed(1) + "%") : "0%"
    };
}
/**
 * Voice Commander — Gemini 2.0 Flash with Tool Calling
 * Processes natural language voice/text commands in English, Tamil, or Hindi.
 */
export const voiceCommander = onCall({
    region: "asia-south1",
    secrets: ["GOOGLE_GENAI_API_KEY"],
    cors: true
}, async (request) => {
    if (!request.auth)
        throw new HttpsError("unauthenticated", "Must log in");
    const { message, language = "en", history: rawHistory = [] } = request.data;
    if (!message)
        throw new HttpsError("invalid-argument", "Missing message");
    let history = rawHistory;
    const firstUserIndex = history.findIndex((m) => m.role === 'user');
    if (firstUserIndex !== -1) {
        history = history.slice(firstUserIndex);
    }
    else {
        history = []; // No user messages in history, start fresh
    }
    const voiceTools = [{
            functionDeclarations: [
                {
                    name: "navigate",
                    description: "Navigate to a specific page in the EcoBill app. Use this when the user wants to go to, open, or see a page.",
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            page: { type: SchemaType.STRING, description: "Page to navigate to. One of: dashboard, invoices, quotations, cash-memos, products, customers, purchases, reconciliation, reports, auditor, settings, create-invoice, create-quotation, create-cashmemo" },
                            reason: { type: SchemaType.STRING, description: "Brief reason for navigation" }
                        },
                        required: ["page"]
                    }
                },
                {
                    name: "update_form_field",
                    description: "Update a field in the current form (e.g. invoice form) in real-time.",
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            fieldName: { type: SchemaType.STRING, description: "Name of the field (e.g., customerName, productName, quantity, price, discount, hsn, gst)" },
                            value: { type: SchemaType.STRING, description: "Value to set for the field" }
                        },
                        required: ["fieldName", "value"]
                    }
                },
                {
                    name: "open_overlay",
                    description: "Open a Picture-in-Picture modal overlay to create a new customer or product without leaving the current page.",
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            overlayType: { type: SchemaType.STRING, description: "Type of overlay to open. One of: 'customer', 'product'" },
                            reason: { type: SchemaType.STRING, description: "Why the overlay is being opened" }
                        },
                        required: ["overlayType"]
                    }
                },
                {
                    name: "request_confirmation",
                    description: "Call this when the form is completely filled and ready to be saved. Wait for the user to confirm.",
                    parameters: { type: SchemaType.OBJECT, properties: {} }
                },
                {
                    name: "get_revenue",
                    description: "Get detailed revenue data including invoice revenue, cash memo revenue, GST collected, and transaction counts.",
                    parameters: { type: SchemaType.OBJECT, properties: {} }
                },
                {
                    name: "get_pending_invoices",
                    description: "Get list of unpaid or partially paid invoices with amounts and customer details.",
                    parameters: { type: SchemaType.OBJECT, properties: {} }
                },
                {
                    name: "get_profit",
                    description: "Get profit and loss data including revenue, expenses, net profit, and margin percentage.",
                    parameters: { type: SchemaType.OBJECT, properties: {} }
                },
                {
                    name: "count_documents",
                    description: "Count documents in a collection (invoices, cash_memos, quotations, products, customers, purchases).",
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            collection_name: { type: SchemaType.STRING, description: "Name of the Firestore collection to count" }
                        },
                        required: ["collection_name"]
                    }
                },
                {
                    name: "search_invoices_by_customer",
                    description: "Search invoices by customer name.",
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            customer_name: { type: SchemaType.STRING, description: "Customer name to search for" }
                        },
                        required: ["customer_name"]
                    }
                },
                {
                    name: "get_business_summary",
                    description: "Get a complete business summary including all counts, revenue, expenses, profit, GST, and unpaid amounts.",
                    parameters: { type: SchemaType.OBJECT, properties: {} }
                }
            ]
        }];
    const { genAI: ai } = await getAI();
    const voiceModel = ai.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: { temperature: 0.6, maxOutputTokens: 500 },
        systemInstruction: `You are the EcoBill AI Assistant, a friendly, casual, and highly helpful co-founder for Ecotrophy Innovations.

RULES:
1. When you FIRST start a chat, ask the user if they want to speak in English or Tamil. Once they choose, ALWAYS reply in that language. (If they speak to you in Tamil first, just answer in Tamil).
2. Your tone must be very short, friendly, and casual (like a co-founder). Do NOT use complex words. Avoid formal robotic phrases like "Yes sir" or "I will do that". Use natural phrases like "Got it!", "Sure thing", "What's the customer's name?".
3. Your main job is to FILL FORMS magically. When a user asks to create an invoice/quotation/cash-memo, first use 'navigate' to go to the page. 
4. Then, ask for missing details ONE BY ONE (e.g., Customer Name, Product Name, Quantity).
5. As the user speaks, use the 'update_form_field' tool to visually type the data into the form. 
    - Valid fieldNames: "customerName", "productName", "quantity", "price", "hsn", "gst"
6. If the user mentions a product/customer that doesn't exist, use 'open_overlay' to open a Picture-in-Picture window. Guess standard defaults (like HSN and GST%) and use 'update_form_field' to fill them, telling the user you guessed them.
7. NEVER save to the database directly. Once all form fields are filled, call 'request_confirmation' and verbally summarize it: "Invoice for Ramesh is ready. Should I save it?"
8. Use other tools to answer business queries if asked.

AVAILABLE PAGES: dashboard, invoices, quotations, cash-memos, products, customers, purchases, reconciliation, reports, auditor, settings`
    }, { apiVersion: 'v1beta' });
    const chat = voiceModel.startChat({
        history,
        tools: voiceTools,
    });
    const result = await chat.sendMessage(message);
    const response = result.response;
    const calls = response.functionCalls();
    if (calls && calls.length > 0) {
        const toolResponses = [];
        let navigationAction = null;
        let frontendActions = [];
        for (const call of calls) {
            let toolResult;
            if (call.name === "navigate") {
                navigationAction = call.args;
                frontendActions.push({ type: "navigate", ...call.args });
                toolResult = { success: true, navigated_to: call.args.page };
            }
            else if (call.name === "update_form_field") {
                frontendActions.push({ type: "update_form_field", ...call.args });
                toolResult = { success: true, field_updated: true };
            }
            else if (call.name === "open_overlay") {
                frontendActions.push({ type: "open_overlay", ...call.args });
                toolResult = { success: true, overlay_opened: true };
            }
            else if (call.name === "request_confirmation") {
                frontendActions.push({ type: "request_confirmation", ...call.args });
                toolResult = { success: true, confirmation_requested: true };
            }
            else if (call.name === "get_revenue")
                toolResult = await getRevenueData();
            else if (call.name === "get_pending_invoices")
                toolResult = await getPendingInvoices();
            else if (call.name === "get_profit")
                toolResult = await getProfitData();
            else if (call.name === "count_documents")
                toolResult = await countDocuments(call.args);
            else if (call.name === "search_invoices_by_customer")
                toolResult = await searchInvoicesByCustomer(call.args);
            else if (call.name === "get_business_summary")
                toolResult = await getBusinessSummary();
            else
                toolResult = { error: "Unknown tool" };
            toolResponses.push({
                functionResponse: { name: call.name, response: { content: toolResult } }
            });
        }
        const finalResult = await chat.sendMessage(toolResponses);
        return {
            text: finalResult.response.text(),
            action: navigationAction ? { type: "navigate", page: navigationAction.page } : null,
            frontendActions: frontendActions.length > 0 ? frontendActions : null
        };
    }
    return {
        text: response.text(),
        action: null,
    };
});
/**
 * NEW: Vision OCR for Bill Uploads
 * Parses an image (base64) of a purchase bill and returns structured data.
 */
export const processBillPhoto = onCall({
    region: "asia-south1",
    secrets: ["GOOGLE_GENAI_API_KEY"],
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    const { imageBase64 } = request.data;
    if (!imageBase64) {
        throw new HttpsError("invalid-argument", "Missing image data.");
    }
    try {
        const { genAI: ai } = await getAI();
        const visionModel = ai.getGenerativeModel({ model: "gemini-3-flash-preview" }, { apiVersion: 'v1beta' });
        const prompt = `
      You are an expert accountant for EcoBill 2050. 
      Analyze this purchase bill/invoice image.
      Extract the following information in JSON format:
      {
        "vendorName": "string",
        "date": "string (ISO)",
        "invoiceNumber": "string",
        "items": [
          {
            "description": "string",
            "quantity": number,
            "unitPrice": number,
            "totalPrice": number
          }
        ],
        "subtotal": number,
        "tax": number,
        "totalAmount": number
      }
      If you can't find a field, leave it null.
      Be precise with quantities and prices.
    `;
        const result = await visionModel.generateContent([
            prompt,
            {
                inlineData: {
                    data: imageBase64,
                    mimeType: "image/jpeg",
                },
            },
        ]);
        const response = await result.response;
        const text = response.text();
        // Extract JSON from response (handling potential markdown blocks)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        return {
            success: true,
            data: jsonData,
            rawResponse: text
        };
    }
    catch (error) {
        console.error("Vision OCR Error:", error);
        throw new HttpsError("internal", error.message);
    }
});
//# sourceMappingURL=index.js.map
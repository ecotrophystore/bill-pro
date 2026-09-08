export * from './metaIntegration.js';
export * from './metaWebhookProcessor.js';
export * from './meta/facebook.js';
export * from './meta/instagram.js';
/**
 * 1. Invoice Numbering & 3. Conversion Gate
 * Converts a quotation into a full, locked invoice with absolute atomicity.
 */
export declare const convertQuotationToInvoice: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    invoiceId: string;
    invoiceNumber: string;
}>, unknown>;
export declare const convertQuotationToCashMemo: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    memoId: string;
    memoNumber: any;
}>, unknown>;
export declare const convertQuotationToProforma: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    proformaId: string;
    proformaNumber: any;
}>, unknown>;
export declare const convertProformaToInvoice: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    invoiceId: string;
    invoiceNumber: any;
}>, unknown>;
/**
 * 1. Invoice Numbering & 2. Immutability
 * Creates a direct invoice with atomicity.
 */
export declare const createInvoice: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    invoiceId: string;
    invoiceNumber: any;
}>, unknown>;
export declare const createProformaInvoice: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    invoiceId: string;
    invoiceNumber: any;
}>, unknown>;
/**
 * NEW: Cash Memo Module (Choice 1a, 2b)
 * Handles non-GST billing with a separate sequence (MEMO/...).
 */
export declare const createCashMemo: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    memoId: string;
    memoNumber: any;
}>, unknown>;
/**
 * 1. Sequential Numbering
 * Creates a quotation with atomic numbering.
 */
export declare const createQuotation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    quotationId: string;
    quotationNumber: any;
}>, unknown>;
/**
 * 4. Bank Reconciliation Gate
 * Matches a transaction to a document (Invoice/Purchase) and updates status.
 */
export declare const matchTransaction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
/**
 * 15. AI Auditor Layer (gemini-2.5-flash)
 */
export declare const aiAuditor: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    text: any;
    history: import("@google/genai").Content[];
}>, unknown>;
/**
 * NEW: Parse Voice Command
 * Uses Vertex AI to parse unstructured voice transcripts into structured JSON
 */
export declare const parseVoiceCommand: import("firebase-functions/v2/https").CallableFunction<any, Promise<any>, unknown>;
/**
 * NEW: Parse Purchase Voice Command
 * Uses Vertex AI to parse unstructured voice transcripts into a purchase record
 */
export declare const parsePurchaseVoice: import("firebase-functions/v2/https").CallableFunction<any, Promise<any>, unknown>;
export declare const analyzePendingTransactions: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    count: number;
}>, unknown>;
export declare const parsePDFStatement: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    transactions: any[];
}>, unknown>;
/**
 * Phase 4: AI Invoice Extraction & Smart Categorization
 */
export declare const extractInvoiceData: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    data: any;
}>, unknown>;
export declare const extractExpenseReceipt: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    data: any;
}>, unknown>;
export declare const googleLeadWebhook: import("firebase-functions/v2/https").HttpsFunction;
export declare const testLeadIngest: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    status: string;
    eventId: string;
    message: string;
    leadId?: never;
    source?: never;
} | {
    status: string;
    leadId: string;
    eventId: string;
    source: string;
    message?: never;
}>, unknown>;
export declare const testLeadIngestHttp: import("firebase-functions/v2/https").HttpsFunction;
export declare const queueLeadTemplateMessage: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    queueId: string;
    activityId: string;
    subject: string;
    body: string;
    channel: any;
}>, unknown>;
export declare const updateLeadDetails: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    leadId: string;
    changedFields: string[];
}>, unknown>;
export declare const processMessageQueueItem: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    itemId: string;
}>>;
export declare const onLeadCreated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    leadId: string;
}>>;
export declare const onLeadUpdated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2").Change<import("firebase-functions/v2/firestore").QueryDocumentSnapshot> | undefined, {
    leadId: string;
}>>;
export declare const activateAutomation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    enrolled: number;
    skipped: number;
    message: string;
} | {
    success: boolean;
    enrolled: number;
    skipped: number;
    message?: never;
}>, unknown>;
export declare const enrollLeadInAutomation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    enrollId: string;
}>, unknown>;
export declare const cancelAutomationEnrollment: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const pauseAutomation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const processAutomationEnrollments: import("firebase-functions/v2/scheduler").ScheduleFunction;
//# sourceMappingURL=index.d.ts.map
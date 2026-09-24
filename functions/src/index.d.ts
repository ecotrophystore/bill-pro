export * from './metaIntegration.js';
export * from './metaWebhookProcessor.js';
export * from './meta/facebook.js';
export * from './meta/instagram.js';
/**
 * 1. Invoice Numbering & 3. Conversion Gate
 * Converts a quotation into a full, locked invoice with absolute atomicity.
 */
export declare const convertQuotationToInvoice: any;
export declare const convertQuotationToCashMemo: any;
export declare const convertQuotationToProforma: any;
export declare const convertProformaToInvoice: any;
/**
 * 1. Invoice Numbering & 2. Immutability
 * Creates a direct invoice with atomicity.
 */
export declare const createInvoice: any;
export declare const createProformaInvoice: any;
/**
 * NEW: Cash Memo Module (Choice 1a, 2b)
 * Handles non-GST billing with a separate sequence (MEMO/...).
 */
export declare const createCashMemo: any;
/**
 * 1. Sequential Numbering
 * Creates a quotation with atomic numbering.
 */
export declare const createQuotation: any;
/**
 * 4. Bank Reconciliation Gate
 * Matches a transaction to a document (Invoice/Purchase) and updates status.
 */
export declare const matchTransaction: any;
/**
 * 15. AI Auditor Layer (gemini-2.5-flash)
 */
export declare const aiAuditor: any;
/**
 * NEW: Parse Voice Command
 * Uses Vertex AI to parse unstructured voice transcripts into structured JSON
 */
export declare const parseVoiceCommand: any;
/**
 * NEW: Parse Purchase Voice Command
 * Uses Vertex AI to parse unstructured voice transcripts into a purchase record
 */
export declare const parsePurchaseVoice: any;
export declare const analyzePendingTransactions: any;
export declare const parsePDFStatement: any;
/**
 * Phase 4: AI Invoice Extraction & Smart Categorization
 */
export declare const extractInvoiceData: any;
export declare const extractExpenseReceipt: any;
export declare const googleLeadWebhook: any;
export declare const testLeadIngest: any;
export declare const testLeadIngestHttp: any;
export declare const queueLeadTemplateMessage: any;
export declare const updateLeadDetails: any;
export declare const sendStageWhatsApp: any;
export declare const sendWhatsAppChatMessage: any;
export declare const processMessageQueueItem: any;
export declare const onLeadCreated: any;
export declare const onLeadUpdated: any;
export declare const activateAutomation: any;
export declare const enrollLeadInAutomation: any;
export declare const cancelAutomationEnrollment: any;
export declare const pauseAutomation: any;
export declare const processAutomationEnrollments: any;
//# sourceMappingURL=index.d.ts.map
/**
 * 1. Invoice Numbering & 3. Conversion Gate
 * Converts a quotation into a full, locked invoice with absolute atomicity.
 */
export declare const convertQuotationToInvoice: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    invoiceId: string;
    invoiceNumber: string;
}>, unknown>;
/**
 * 1. Invoice Numbering & 2. Immutability
 * Creates a direct invoice with atomicity.
 */
export declare const createInvoice: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    invoiceId: string;
    invoiceNumber: string;
}>, unknown>;
/**
 * NEW: Cash Memo Module (Choice 1a, 2b)
 * Handles non-GST billing with a separate sequence (MEMO/...).
 */
export declare const createCashMemo: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    memoId: string;
    memoNumber: string;
}>, unknown>;
/**
 * 1. Sequential Numbering
 * Creates a quotation with atomic numbering.
 */
export declare const createQuotation: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    quotationId: string;
    quotationNumber: string;
}>, unknown>;
/**
 * 4. Bank Reconciliation Gate
 * Matches a transaction to a document (Invoice/Purchase) and updates status.
 */
export declare const matchTransaction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
/**
 * 15. AI Auditor Layer (Gemini-1.5-Flash)
 */
export declare const aiAuditor: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    text: string;
    history: import("@google/generative-ai").Content[];
}>, unknown>;
/**
 * Voice Commander — Gemini 2.0 Flash with Tool Calling
 * Processes natural language voice/text commands in English, Tamil, or Hindi.
 */
export declare const voiceCommander: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    text: string;
    action: {
        type: string;
        page: any;
    } | null;
    frontendActions: any[] | null;
} | {
    text: string;
    action: null;
    frontendActions?: never;
}>, unknown>;
/**
 * NEW: Vision OCR for Bill Uploads
 * Parses an image (base64) of a purchase bill and returns structured data.
 */
export declare const processBillPhoto: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    data: any;
    rawResponse: string;
}>, unknown>;
//# sourceMappingURL=index.d.ts.map
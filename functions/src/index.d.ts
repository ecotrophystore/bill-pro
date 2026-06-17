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
    memoNumber: string;
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
 * 15. AI Auditor Layer (gemini-3.5-flash)
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
//# sourceMappingURL=index.d.ts.map
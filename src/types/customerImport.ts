/**
 * TypeScript interfaces and types for the Bulk Customer Import feature.
 * These are separate from the core Customer type to keep concerns isolated.
 */

// ─── Step Enumeration ────────────────────────────────────────────────────────

export type ImportStep = 1 | 2 | 3 | 4 | 5;

// ─── Customer Fields ──────────────────────────────────────────────────────────

/**
 * All writable fields on the Customer model (excluding system fields).
 * This must exactly match the fields in the Customer interface in src/types/index.ts.
 */
export type CustomerField =
  | 'name'
  | 'gst_number'
  | 'phone'
  | 'email'
  | 'billing_address'
  | 'shipping_address'
  | 'notes';

export const CUSTOMER_FIELD_LABELS: Record<CustomerField, string> = {
  name: 'Customer Name',
  gst_number: 'GST Number',
  phone: 'Phone',
  email: 'Email',
  billing_address: 'Billing Address',
  shipping_address: 'Shipping Address',
  notes: 'Notes',
};

/** Ordered list for display in dropdowns and sample template */
export const CUSTOMER_FIELDS_ORDERED: CustomerField[] = [
  'name',
  'gst_number',
  'phone',
  'email',
  'billing_address',
  'shipping_address',
  'notes',
];

// ─── Column Mapping ───────────────────────────────────────────────────────────

/**
 * Maps a source column header (from the uploaded file) to a destination
 * Customer field. If `field` is null, the column is unmapped / ignored.
 */
export interface ColumnMapping {
  /** Original header from the uploaded file */
  sourceHeader: string;
  /** Index of this column in the parsed data */
  sourceIndex: number;
  /** Mapped customer field, or null if unmapped */
  field: CustomerField | null;
  /** Whether the mapping was done automatically or by the user */
  mappedBy: 'auto' | 'manual' | 'ignored';
}

// ─── Parsed Row ───────────────────────────────────────────────────────────────

/**
 * Raw data from one row of the uploaded file, keyed by column index.
 */
export type RawRow = Record<number, string>;

/**
 * Mapped customer data extracted from one row using the column mappings.
 */
export type MappedCustomerData = Partial<Record<CustomerField, string>>;

// ─── Validation ───────────────────────────────────────────────────────────────

export interface FieldValidationError {
  field: CustomerField | string;
  message: string;
}

// ─── Duplicate Detection ──────────────────────────────────────────────────────

export type DuplicateAction = 'skip' | 'update' | 'new';

export interface DuplicateMatch {
  /** Firestore document ID of the existing customer */
  existingId: string;
  /** Human-readable reason why this is a duplicate */
  matchReason: string;
}

// ─── Import Row ───────────────────────────────────────────────────────────────

/**
 * Represents one row in the import preview table, with validation and
 * duplicate information attached.
 */
export interface ImportRow {
  /** 1-based row number (as shown in the file, excluding header) */
  rowNumber: number;
  /** Raw string values keyed by source column index */
  rawData: RawRow;
  /** Customer data after applying column mappings */
  mappedData: MappedCustomerData;
  /** Whether the row passed all validation checks */
  isValid: boolean;
  /** List of field-level validation errors */
  errors: FieldValidationError[];
  /** Duplicate match information, if a duplicate was detected */
  duplicate: DuplicateMatch | null;
  /** Action to take for this row when a duplicate is detected */
  duplicateAction: DuplicateAction;
}

// ─── Import Result ────────────────────────────────────────────────────────────

/**
 * Detailed record of a single row that failed to import.
 */
export interface ImportFailedRow {
  rowNumber: number;
  customerName: string;
  failedField: string;
  errorReason: string;
  rowData: MappedCustomerData;
}

/**
 * Final summary after the import process completes.
 */
export interface ImportResult {
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  failedRows: ImportFailedRow[];
  fileName: string;
}

// ─── Parsed File ─────────────────────────────────────────────────────────────

/**
 * Output of parsing a CSV or Excel file.
 */
export interface ParsedFile {
  /** Column headers extracted from the first row */
  headers: string[];
  /** Data rows (array of arrays of strings), not including the header row */
  rows: string[][];
  /** Original file name */
  fileName: string;
}

// ─── Audit Log Payload ────────────────────────────────────────────────────────

export interface BulkImportAuditPayload {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  fileName: string;
}

/**
 * Core utilities for the Bulk Customer Import feature.
 * Handles: file parsing, column mapping, duplicate detection,
 * Firestore batch writes, and error report generation.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Customer } from '../types';
import type {
  ColumnMapping,
  CustomerField,
  DuplicateAction,
  DuplicateMatch,
  ImportFailedRow,
  ImportRow,
  MappedCustomerData,
  ParsedFile,
} from '../types/customerImport';
import { CUSTOMER_FIELDS_ORDERED, CUSTOMER_FIELD_LABELS } from '../types/customerImport';
import { validateCustomerRow, normalizePhone, validateGSTNumber } from './customerValidation';

// ─── File Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a CSV file using PapaParse.
 * Returns headers and data rows (strings only).
 */
export function parseCSV(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          reject(new Error('The CSV file is empty or could not be read.'));
          return;
        }
        const [headerRow, ...dataRows] = results.data;
        resolve({
          headers: headerRow.map((h) => String(h ?? '').trim()),
          rows: dataRows.map((row) => row.map((cell) => String(cell ?? '').trim())),
          fileName: file.name,
        });
      },
      error: (err) => reject(new Error(`CSV parse error: ${err.message}`)),
    });
  });
}

/**
 * Parse an XLS/XLSX file using the xlsx library.
 * Reads the first sheet, treats row 1 as headers.
 */
export function parseExcel(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          reject(new Error('No sheets found in the Excel file.'));
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        // header: 1 returns an array-of-arrays (raw strings)
        const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: false,
        }) as string[][];

        if (!rawRows || rawRows.length === 0) {
          reject(new Error('The Excel sheet is empty or could not be read.'));
          return;
        }

        const [headerRow, ...dataRows] = rawRows;
        resolve({
          headers: headerRow.map((h) => String(h ?? '').trim()),
          rows: dataRows
            .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
            .map((row) => row.map((cell) => String(cell ?? '').trim())),
          fileName: file.name,
        });
      } catch (err) {
        reject(new Error(`Excel parse error: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Dispatch to CSV or Excel parser based on file extension.
 */
export async function parseImportFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return parseCSV(file);
  if (ext === 'xls' || ext === 'xlsx') return parseExcel(file);
  throw new Error(`Unsupported file type: .${ext}. Please upload CSV, XLS, or XLSX.`);
}

// ─── Header Normalization ─────────────────────────────────────────────────────

/**
 * Normalize a column header for alias matching:
 * lowercase, remove spaces, underscores, and special characters.
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[\s_\-./\\()[\]{}&*^%$#@!~`'"]+/g, '');
}

// ─── Column Alias Dictionary ──────────────────────────────────────────────────

/**
 * Known aliases for each customer field.
 * Keys are normalized header strings; values are the destination CustomerField.
 */
const HEADER_ALIAS_MAP: Record<string, CustomerField> = {
  // name
  name: 'name',
  customername: 'name',
  clientname: 'name',
  customer: 'name',
  client: 'name',
  fullname: 'name',
  buyername: 'name',
  contactname: 'name',

  // phone
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  mobilenumber: 'phone',
  contact: 'phone',
  contactnumber: 'phone',
  cell: 'phone',
  cellphone: 'phone',
  telephone: 'phone',
  tel: 'phone',
  whatsapp: 'phone',

  // email
  email: 'email',
  emailid: 'email',
  emailaddress: 'email',
  mail: 'email',
  mailaddress: 'email',
  emailid1: 'email',

  // gst_number
  gstnumber: 'gst_number',
  gst: 'gst_number',
  gstin: 'gst_number',
  gstno: 'gst_number',
  gstnno: 'gst_number',
  taxid: 'gst_number',
  taxnumber: 'gst_number',
  vatnumber: 'gst_number',

  // billing_address
  billingaddress: 'billing_address',
  billing: 'billing_address',
  address: 'billing_address',
  addr: 'billing_address',
  mailingaddress: 'billing_address',
  registeredaddress: 'billing_address',
  officeaddress: 'billing_address',

  // shipping_address
  shippingaddress: 'shipping_address',
  shipping: 'shipping_address',
  deliveryaddress: 'shipping_address',
  dispatchaddress: 'shipping_address',

  // notes
  notes: 'notes',
  note: 'notes',
  remarks: 'notes',
  comment: 'notes',
  comments: 'notes',
  description: 'notes',
  additionalinfo: 'notes',
};

// ─── Auto Column Mapping ──────────────────────────────────────────────────────

/**
 * Automatically map source column headers to Customer fields using the
 * alias dictionary. Returns an array of ColumnMapping objects.
 * Ensures no field is mapped to more than one column (first match wins).
 */
export function autoMapColumns(headers: string[]): ColumnMapping[] {
  const usedFields = new Set<CustomerField>();

  return headers.map((header, index) => {
    const normalized = normalizeHeader(header);
    const field = HEADER_ALIAS_MAP[normalized] ?? null;

    if (field && !usedFields.has(field)) {
      usedFields.add(field);
      return { sourceHeader: header, sourceIndex: index, field, mappedBy: 'auto' as const };
    }
    return { sourceHeader: header, sourceIndex: index, field: null, mappedBy: 'ignored' as const };
  });
}

// ─── Build Import Rows ────────────────────────────────────────────────────────

/**
 * Convert parsed file rows + column mappings into ImportRow objects
 * with validation and duplicate detection already applied.
 */
export function buildImportRows(
  parsedRows: string[][],
  mappings: ColumnMapping[],
  existingCustomers: Customer[]
): ImportRow[] {
  return parsedRows.map((row, idx) => {
    // Build mapped data from column mappings
    const mappedData: MappedCustomerData = {};
    for (const mapping of mappings) {
      if (!mapping.field || mapping.mappedBy === 'ignored') continue;
      const value = (row[mapping.sourceIndex] ?? '').trim();
      if (value !== '') {
        mappedData[mapping.field] = value;
      }
    }

    // Build rawData keyed by index
    const rawData: Record<number, string> = {};
    row.forEach((cell, i) => {
      rawData[i] = cell;
    });

    // Validate
    const { isValid, errors } = validateCustomerRow(mappedData as Record<string, string>);

    // Duplicate detection
    const duplicate = detectDuplicate(mappedData, existingCustomers);

    return {
      rowNumber: idx + 1,
      rawData,
      mappedData,
      isValid,
      errors,
      duplicate,
      duplicateAction: 'skip' as DuplicateAction,
    };
  });
}

// ─── Duplicate Detection ──────────────────────────────────────────────────────

/**
 * Check if a mapped customer row is a duplicate of any existing customer.
 * Matching priority: phone → email → gst_number.
 * Returns a DuplicateMatch if found, or null.
 */
export function detectDuplicate(
  data: MappedCustomerData,
  existingCustomers: Customer[]
): DuplicateMatch | null {
  const incomingPhone = data.phone ? normalizePhone(data.phone) : null;
  const incomingEmail = data.email ? data.email.trim().toLowerCase() : null;
  const incomingGST = data.gst_number ? data.gst_number.trim().toUpperCase() : null;

  for (const existing of existingCustomers) {
    // Match by phone
    if (incomingPhone && existing.phone) {
      const existingPhone = normalizePhone(existing.phone);
      if (incomingPhone === existingPhone && incomingPhone.length >= 10) {
        return { existingId: existing.id, matchReason: `Phone matches: ${existing.phone}` };
      }
    }

    // Match by email
    if (incomingEmail && existing.email) {
      if (incomingEmail === existing.email.trim().toLowerCase()) {
        return { existingId: existing.id, matchReason: `Email matches: ${existing.email}` };
      }
    }

    // Match by GST number
    if (incomingGST && existing.gst_number) {
      const gstErr = validateGSTNumber(incomingGST);
      if (!gstErr && incomingGST === existing.gst_number.trim().toUpperCase()) {
        return { existingId: existing.id, matchReason: `GST matches: ${existing.gst_number}` };
      }
    }
  }

  return null;
}

// ─── Data Cleaning ────────────────────────────────────────────────────────────

/**
 * Clean a customer data object before writing to Firestore:
 * - Trim all string values
 * - Remove keys with empty string or undefined values
 * - Normalize GST to uppercase
 * - Normalize phone (keep original human-readable value, not digits-only)
 */
export function cleanCustomerData(
  data: MappedCustomerData
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const trimmed = String(value).trim();
    if (key === 'gst_number') {
      result[key] = trimmed.toUpperCase();
    } else {
      result[key] = trimmed;
    }
  }

  return result;
}

// ─── Firestore Batch Import ───────────────────────────────────────────────────

export interface BatchImportOptions {
  rows: ImportRow[];
  userId: string;
  fileName: string;
  onProgress?: (imported: number, total: number) => void;
}

export interface BatchImportResult {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedRows: ImportFailedRow[];
}

const BATCH_SIZE = 400;

/**
 * Import customer rows to Firestore using safe batch writes.
 * Splits into chunks of BATCH_SIZE to stay within Firestore limits.
 * Handles duplicates per the row's duplicateAction setting.
 */
export async function batchImportCustomers(
  options: BatchImportOptions
): Promise<BatchImportResult> {
  const { rows, userId, onProgress } = options;

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const failedRows: ImportFailedRow[] = [];

  // Separate rows into: skip (duplicate + skip action), update, create
  const rowsToProcess = rows.filter((r) => r.isValid);
  let processed = 0;

  // Process in chunks
  for (let start = 0; start < rowsToProcess.length; start += BATCH_SIZE) {
    const chunk = rowsToProcess.slice(start, start + BATCH_SIZE);
    const batch = writeBatch(db);
    const updateActions: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (const row of chunk) {
      try {
        // Handle skipped duplicates
        if (row.duplicate && row.duplicateAction === 'skip') {
          skippedCount++;
          processed++;
          onProgress?.(processed, rowsToProcess.length);
          continue;
        }

        const cleaned = cleanCustomerData(row.mappedData);
        const derivedType = cleaned['gst_number'] ? 'business' : 'individual';

        if (row.duplicate && row.duplicateAction === 'update') {
          // Queue update — can't use batch for updateDoc when doc id is needed
          updateActions.push({
            id: row.duplicate.existingId,
            data: {
              ...cleaned,
              type: derivedType,
              updated_at: new Date(),
              updated_by: userId,
            },
          });
        } else {
          // New customer (either no duplicate, or duplicateAction === 'new')
          const newDocRef = doc(collection(db, 'customers'));
          batch.set(newDocRef, {
            ...cleaned,
            type: derivedType,
            created_at: serverTimestamp(),
            created_by: userId,
            source: 'bulk_import',
          });
          importedCount++;
        }

        processed++;
        onProgress?.(processed, rowsToProcess.length);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        failedRows.push({
          rowNumber: row.rowNumber,
          customerName: row.mappedData.name ?? '(no name)',
          failedField: 'write',
          errorReason: errMsg,
          rowData: row.mappedData,
        });
        processed++;
        onProgress?.(processed, rowsToProcess.length);
      }
    }

    // Commit the batch (new customers)
    try {
      await batch.commit();
    } catch (err) {
      // If batch fails, mark all its new creates as failed
      const errMsg = err instanceof Error ? err.message : 'Batch write failed';
      for (const row of chunk) {
        if (!row.duplicate || row.duplicateAction === 'new') {
          failedRows.push({
            rowNumber: row.rowNumber,
            customerName: row.mappedData.name ?? '(no name)',
            failedField: 'batch_write',
            errorReason: errMsg,
            rowData: row.mappedData,
          });
          importedCount = Math.max(0, importedCount - 1);
        }
      }
    }

    // Process updates (individually, outside batch)
    for (const upd of updateActions) {
      try {
        const ref = doc(db, 'customers', upd.id);
        await updateDoc(ref, upd.data);
        updatedCount++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Update failed';
        // Find the original row for error details
        const origRow = chunk.find((r) => r.duplicate?.existingId === upd.id);
        failedRows.push({
          rowNumber: origRow?.rowNumber ?? 0,
          customerName: (upd.data['name'] as string) ?? '(no name)',
          failedField: 'update',
          errorReason: errMsg,
          rowData: (origRow?.mappedData ?? {}) as MappedCustomerData,
        });
      }
    }
  }

  // Add invalid rows to failed list
  for (const row of rows.filter((r) => !r.isValid)) {
    failedRows.push({
      rowNumber: row.rowNumber,
      customerName: row.mappedData.name ?? '(no name)',
      failedField: row.errors[0]?.field ?? 'validation',
      errorReason: row.errors.map((e) => e.message).join('; '),
      rowData: row.mappedData,
    });
  }

  return { importedCount, updatedCount, skippedCount, failedRows };
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

/**
 * Write an audit log entry to the audit_logs collection.
 * Matches the existing AuditLog schema used by other features.
 */
export async function writeImportAuditLog(
  userId: string,
  payload: {
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    fileName: string;
  }
): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      document_type: 'customer',
      document_id: 'bulk_import',
      action: 'create',
      user_id: userId,
      timestamp: serverTimestamp(),
      notes: `Bulk import: ${payload.importedCount} imported, ${payload.updatedCount} updated, ${payload.skippedCount} skipped, ${payload.failedCount} failed. File: ${payload.fileName}`,
    });
  } catch (err) {
    // Audit log failure should not block the user
    console.error('Failed to write audit log:', err);
  }
}

// ─── Sample Template ──────────────────────────────────────────────────────────

/**
 * Generate and download a sample XLSX template with the correct column headers.
 */
export function downloadSampleTemplate(): void {
  const headers = CUSTOMER_FIELDS_ORDERED.map((f) => CUSTOMER_FIELD_LABELS[f]);
  const exampleRow = [
    'Acme Pvt Ltd',
    '22AAAAA0000A1Z5',
    '9876543210',
    'contact@acme.com',
    '123, MG Road, Bangalore',
    '456, Whitefield, Bangalore',
    'Priority customer',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

  // Style header row width
  ws['!cols'] = headers.map(() => ({ wch: 22 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  XLSX.writeFile(wb, 'customer_import_template.xlsx');
}

// ─── Error Report ─────────────────────────────────────────────────────────────

/**
 * Generate and trigger download of an Excel error report.
 */
export function downloadErrorReport(failedRows: ImportFailedRow[], fileName: string): void {
  const headers = [
    'Row Number',
    'Customer Name',
    'GST Number',
    'Phone',
    'Email',
    'Billing Address',
    'Failed Field',
    'Error Reason',
  ];

  const rows = failedRows.map((r) => [
    r.rowNumber,
    r.rowData.name ?? '',
    r.rowData.gst_number ?? '',
    r.rowData.phone ?? '',
    r.rowData.email ?? '',
    r.rowData.billing_address ?? '',
    r.failedField,
    r.errorReason,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
  const baseName = fileName.replace(/\.[^.]+$/, '');
  XLSX.writeFile(wb, `${baseName}_errors.xlsx`);
}

// ─── addDoc re-export helper (for single adds, used in tests) ────────────────

export { addDoc };

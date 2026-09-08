import { db } from '../lib/firebase';
import { collection, getDocs, limit, query, updateDoc } from 'firebase/firestore';
import type { Settings } from '../types';

export interface FYInfo {
  startYear2Digit: string;
  endYear2Digit: string;
  fullYear: number;
  fySlash: string; // e.g. "26/27"
  fyHyphen: string; // e.g. "26-27"
}

export function getFinancialYearInfo(referenceDate?: Date | string): FYInfo {
  const d = referenceDate ? new Date(referenceDate) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  let startYear = validDate.getFullYear();
  if (validDate.getMonth() < 3) {
    // Jan - Mar falls in previous calendar year for Indian FY (April 1 to March 31)
    startYear -= 1;
  }
  const endYear = startYear + 1;
  const startYear2Digit = (startYear % 100).toString().padStart(2, '0');
  const endYear2Digit = (endYear % 100).toString().padStart(2, '0');

  return {
    startYear2Digit,
    endYear2Digit,
    fullYear: startYear,
    fySlash: `${startYear2Digit}/${endYear2Digit}`,
    fyHyphen: `${startYear2Digit}-${endYear2Digit}`
  };
}

export function formatDocumentNumber(
  prefix: string,
  formatStyle: string = 'prefix_hyphen_fy',
  seqNumber: number = 1,
  manualYear?: string,
  referenceDate?: Date | string
): string {
  const cleanPrefix = (prefix || 'DOC').trim().toUpperCase();
  const paddedSeq = Math.max(1, seqNumber).toString().padStart(4, '0');
  const fy = getFinancialYearInfo(referenceDate);

  // If manual year is provided and non-empty (e.g. "25-26", "26-27", "2026", "25/26"), use it
  const activeYear = (manualYear && manualYear.trim().length > 0) ? manualYear.trim() : fy.fyHyphen;

  // Derive slash version if needed (e.g. "25-26" -> "25/26" or "26-27" -> "26/27")
  const activeYearSlash = activeYear.replace(/-/g, '/');
  // Derive hyphen version if needed (e.g. "25/26" -> "25-26")
  const activeYearHyphen = activeYear.replace(/\//g, '-');

  switch (formatStyle) {
    case 'prefix_hyphen_fy':
      return `${cleanPrefix}/${activeYearHyphen}/${paddedSeq}`; // e.g. QTN/25-26/0001 or QTN/26-27/0001
    case 'prefix_slash_fy':
      return `${cleanPrefix}/${activeYearSlash}/${paddedSeq}`; // e.g. QTN/25/26/0001 or QTN/26/27/0001
    case 'prefix_dash_fy':
      return `${cleanPrefix}-${activeYearHyphen}-${paddedSeq}`; // e.g. QTN-25-26-0001 or QTN-26-27-0001
    case 'prefix_year':
      const yr = (manualYear && manualYear.trim().length > 0) ? manualYear.trim() : fy.fullYear.toString();
      return `${cleanPrefix}/${yr}/${paddedSeq}`; // e.g. QTN/2026/0001
    case 'prefix_simple':
      return `${cleanPrefix}-${paddedSeq}`; // e.g. QTN-0001
    case 'prefix_simple_slash':
      return `${cleanPrefix}/${paddedSeq}`; // e.g. QTN/0001
    default:
      return `${cleanPrefix}/${activeYearHyphen}/${paddedSeq}`;
  }
}

export function getDocumentPreview(
  docType: 'quotation' | 'proforma' | 'invoice' | 'memo',
  settings?: Partial<Settings>,
  overrideSeq?: number,
  referenceDate?: Date | string
): string {
  let prefix = 'DOC';
  let format = 'prefix_hyphen_fy';
  let manualYear = '';
  let seq = overrideSeq || 1;

  if (docType === 'quotation') {
    prefix = settings?.quotation_prefix || 'QTN';
    format = settings?.quotation_format || 'prefix_hyphen_fy';
    manualYear = settings?.quotation_year || '';
    seq = overrideSeq ?? (settings?.quotation_next_number || 1);
  } else if (docType === 'proforma') {
    prefix = settings?.proforma_prefix || 'PI';
    format = settings?.proforma_format || 'prefix_hyphen_fy';
    manualYear = settings?.proforma_year || '';
    seq = overrideSeq ?? (settings?.proforma_next_number || 1);
  } else if (docType === 'invoice') {
    prefix = settings?.invoice_prefix || 'INV';
    format = settings?.invoice_format || 'prefix_hyphen_fy';
    manualYear = settings?.invoice_year || '';
    seq = overrideSeq ?? (settings?.invoice_next_number || 1);
  } else if (docType === 'memo') {
    prefix = settings?.memo_prefix || 'MEMO';
    format = settings?.memo_format || 'prefix_hyphen_fy';
    manualYear = settings?.memo_year || '';
    seq = overrideSeq ?? (settings?.memo_next_number || 1);
  }

  return formatDocumentNumber(prefix, format, seq, manualYear, referenceDate);
}

export async function getNextProposedNumber(
  collectionName: 'quotations' | 'proforma_invoices' | 'invoices' | 'cash_memos',
  docType: 'quotation' | 'proforma' | 'invoice' | 'memo',
  settings?: Partial<Settings>,
  referenceDate?: Date | string
): Promise<string> {
  let configuredSeq = 1;
  let prefix = 'DOC';
  let format = 'prefix_hyphen_fy';
  let manualYear = '';

  if (docType === 'quotation') {
    prefix = settings?.quotation_prefix || 'QTN';
    format = settings?.quotation_format || 'prefix_hyphen_fy';
    manualYear = settings?.quotation_year || '';
    configuredSeq = settings?.quotation_next_number || 1;
  } else if (docType === 'proforma') {
    prefix = settings?.proforma_prefix || 'PI';
    format = settings?.proforma_format || 'prefix_hyphen_fy';
    manualYear = settings?.proforma_year || '';
    configuredSeq = settings?.proforma_next_number || 1;
  } else if (docType === 'invoice') {
    prefix = settings?.invoice_prefix || 'INV';
    format = settings?.invoice_format || 'prefix_hyphen_fy';
    manualYear = settings?.invoice_year || '';
    configuredSeq = settings?.invoice_next_number || 1;
  } else if (docType === 'memo') {
    prefix = settings?.memo_prefix || 'MEMO';
    format = settings?.memo_format || 'prefix_hyphen_fy';
    manualYear = settings?.memo_year || '';
    configuredSeq = settings?.memo_next_number || 1;
  }

  let maxExistingSeq = 0;
  if (db) {
    try {
      const snap = await getDocs(query(collection(db, collectionName), limit(150)));
      for (const d of snap.docs) {
        const numStr = ((d.data().number || '') as string).trim();
        const match = numStr.match(/(\d+)(?!.*\d)/);
        if (match) {
          const lastPart = parseInt(match[1], 10);
          if (!isNaN(lastPart) && lastPart > maxExistingSeq) {
            maxExistingSeq = lastPart;
          }
        }
      }
    } catch (err) {
      console.warn(`Could not inspect ${collectionName} for latest sequence:`, err);
    }
  }

  const finalSeq = Math.max(configuredSeq, maxExistingSeq + 1);
  return formatDocumentNumber(prefix, format, finalSeq, manualYear, referenceDate);
}

// Helper to batch-update existing documents to match the current Document Numbering settings
export async function syncExistingDocumentNumbers(settings: Partial<Settings>): Promise<{ updatedCount: number; details: string[] }> {
  if (!db) return { updatedCount: 0, details: [] };
  let count = 0;
  const details: string[] = [];

  try {
    // 1. Quotations
    const qSnap = await getDocs(collection(db, 'quotations'));
    for (const docSnap of qSnap.docs) {
      const data = docSnap.data();
      const currentNum = (data.number || '').trim();
      const match = currentNum.match(/(\d+)(?!.*\d)/);
      if (match) {
        const seq = parseInt(match[1], 10);
        const newNum = formatDocumentNumber(
          settings.quotation_prefix || 'QTN',
          settings.quotation_format || 'prefix_hyphen_fy',
          seq,
          settings.quotation_year || ''
        );
        if (newNum !== currentNum) {
          await updateDoc(docSnap.ref, { number: newNum });
          count++;
          details.push(`Quotation: ${currentNum} -> ${newNum}`);
        }
      }
    }

    // 2. Proformas
    const pSnap = await getDocs(collection(db, 'proforma_invoices'));
    for (const docSnap of pSnap.docs) {
      const data = docSnap.data();
      const currentNum = (data.number || '').trim();
      const match = currentNum.match(/(\d+)(?!.*\d)/);
      if (match) {
        const seq = parseInt(match[1], 10);
        const newNum = formatDocumentNumber(
          settings.proforma_prefix || 'PI',
          settings.proforma_format || 'prefix_hyphen_fy',
          seq,
          settings.proforma_year || ''
        );
        if (newNum !== currentNum) {
          await updateDoc(docSnap.ref, { number: newNum });
          count++;
          details.push(`Proforma: ${currentNum} -> ${newNum}`);
        }
      }
    }

    // 3. Invoices
    const invSnap = await getDocs(collection(db, 'invoices'));
    for (const docSnap of invSnap.docs) {
      const data = docSnap.data();
      const currentNum = (data.number || '').trim();
      const match = currentNum.match(/(\d+)(?!.*\d)/);
      if (match) {
        const seq = parseInt(match[1], 10);
        const newNum = formatDocumentNumber(
          settings.invoice_prefix || 'ECO',
          settings.invoice_format || 'prefix_hyphen_fy',
          seq,
          settings.invoice_year || ''
        );
        if (newNum !== currentNum) {
          await updateDoc(docSnap.ref, { number: newNum });
          count++;
          details.push(`Invoice: ${currentNum} -> ${newNum}`);
        }
      }
    }

    // 4. Cash Memos
    const mSnap = await getDocs(collection(db, 'cash_memos'));
    for (const docSnap of mSnap.docs) {
      const data = docSnap.data();
      const currentNum = (data.number || '').trim();
      const match = currentNum.match(/(\d+)(?!.*\d)/);
      if (match) {
        const seq = parseInt(match[1], 10);
        const newNum = formatDocumentNumber(
          settings.memo_prefix || 'MEMO',
          settings.memo_format || 'prefix_hyphen_fy',
          seq,
          settings.memo_year || ''
        );
        if (newNum !== currentNum) {
          await updateDoc(docSnap.ref, { number: newNum });
          count++;
          details.push(`Cash Memo: ${currentNum} -> ${newNum}`);
        }
      }
    }
  } catch (err) {
    console.error("Error syncing existing document numbers:", err);
  }

  return { updatedCount: count, details };
}

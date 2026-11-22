import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { parseAnyDate } from './reconciliationEngine';

// Configure worker URL for Vite bundling
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

export interface ExtractedBankTxn {
  date: Date;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  reference: string;
}

/**
 * Extracts line rows from a vector/digital PDF statement while preserving horizontal column alignment.
 */
export async function extractLinesFromPdf(arrayBuffer: ArrayBuffer): Promise<string[]> {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const allLines: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Group text items by Y-coordinate with a 4px tolerance to reconstruct table rows
      const items = textContent.items as Array<{ str: string; transform: number[] }>;
      const rowsMap = new Map<number, Array<{ x: number; text: string }>>();

      for (const item of items) {
        if (!item.str || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 4) * 4;
        const x = item.transform[4];
        if (!rowsMap.has(y)) rowsMap.set(y, []);
        rowsMap.get(y)!.push({ x, text: item.str });
      }

      // Sort rows top-to-bottom (in PDF coordinates, highest Y is at the top)
      const sortedYs = Array.from(rowsMap.keys()).sort((a, b) => b - a);
      for (const y of sortedYs) {
        const rowItems = rowsMap.get(y)!;
        rowItems.sort((a, b) => a.x - b.x);
        const line = rowItems.map((it) => it.text.trim()).join('   ');
        if (line.trim()) {
          allLines.push(line);
        }
      }
    }

    return allLines;
  } catch (err) {
    console.warn('[PDF Parser] Direct PDF text extraction failed:', err);
    return [];
  }
}

/**
 * Parses raw text lines from Indian bank statements (HDFC, ICICI, SBI, Axis, Kotak, Canara, etc.)
 */
export function parseBankStatementTextLines(lines: string[]): ExtractedBankTxn[] {
  const transactions: ExtractedBankTxn[] = [];
  const dateRegex = /\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/;
  const amountRegex = /\b(\d{1,3}(?:,\d{2,3})*(?:\.\d{2}))\b/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip generic header lines
    if (
      /Narration|Particulars|Withdrawal|Deposit|Chq\/Ref|Closing Balance|Account Statement|Branch Name|Statement Period|Opening Balance/i.test(
        line
      ) &&
      !dateRegex.test(line)
    ) {
      continue;
    }

    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

    const rawDateStr = dateMatch[1];
    const parsedDate = parseAnyDate(rawDateStr);
    if (!parsedDate || isNaN(parsedDate.getTime())) continue;

    // Extract all numbers that look like currency amounts
    const amounts: number[] = [];
    const re = new RegExp(amountRegex);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const num = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 0) {
        amounts.push(num);
      }
    }

    if (amounts.length === 0) continue;

    let amount = 0;
    let type: 'credit' | 'debit' = 'credit';

    const isExplicitDebit = /\b(DR|Debit|WDL|Withdrawal|TO TRANSFER|NEFT DR|IMPS DR|UPI DR|ATM|POS)\b/i.test(line);
    const isExplicitCredit = /\b(CR|Credit|DEP|Deposit|BY TRANSFER|NEFT CR|IMPS CR|UPI CR|SALARY)\b/i.test(line);

    if (amounts.length === 1) {
      amount = amounts[0];
      type = isExplicitDebit ? 'debit' : 'credit';
    } else if (amounts.length === 2) {
      // Typically [Txn Amount, Balance]
      amount = amounts[0];
      type = isExplicitDebit ? 'debit' : 'credit';
    } else if (amounts.length >= 3) {
      // In HDFC / ICICI statements: [ChqNo (if numeric), Debit / Withdrawal, Credit / Deposit, Balance]
      // Or: [Withdrawal, Deposit, Balance]
      const last = amounts[amounts.length - 1]; // Closing balance
      const secondLast = amounts[amounts.length - 2];
      const thirdLast = amounts[amounts.length - 3];

      if (isExplicitDebit && !isExplicitCredit) {
        amount = thirdLast || secondLast;
        type = 'debit';
      } else if (isExplicitCredit && !isExplicitDebit) {
        amount = secondLast;
        type = 'credit';
      } else {
        amount = amounts[0];
        type = isExplicitDebit ? 'debit' : 'credit';
      }
    }

    // Clean narration description
    const desc = line
      .replace(rawDateStr, '')
      .replace(amountRegex, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (amount > 0 && desc.length > 0) {
      transactions.push({
        date: parsedDate,
        description: desc,
        amount,
        type,
        reference: '',
      });
    }
  }

  return transactions;
}

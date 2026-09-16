import type { CashMemo, Customer, Invoice, ProformaInvoice, Quotation, Settings } from '../../types';

export type DocumentKind = 'Invoice' | 'Quotation' | 'Cash Memo' | 'Proforma Invoice';

export type DocumentData = Invoice | Quotation | CashMemo | ProformaInvoice;

export type DocumentCustomer = string | Customer;

export interface PdfTheme {
  primary: string;
  primaryDark: string;
  text: string;
  muted: string;
  border: string;
  softBg: string;
  paperWidthMm: number;
  paperMinHeightMm: number;
  paddingMm: number;
  fontFamily: string;
}

export interface PdfRenderContext {
  docData: DocumentData;
  customer: DocumentCustomer;
  docType: DocumentKind;
  settings?: Settings;
}


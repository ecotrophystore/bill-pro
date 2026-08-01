import type { DocumentKind, PdfRenderContext } from './types';
import { pdfTheme } from './theme';
import { renderDocumentPdf } from './renderer';

export async function renderQuotationPdf(ctx: PdfRenderContext, action: 'download' | 'view') {
  return renderDocumentPdf(pdfTheme, { ...ctx, docType: 'Quotation' }, action);
}

export async function renderInvoicePdf(ctx: PdfRenderContext, action: 'download' | 'view') {
  return renderDocumentPdf(pdfTheme, { ...ctx, docType: 'Invoice' }, action);
}

export async function renderCashMemoPdf(ctx: PdfRenderContext, action: 'download' | 'view') {
  return renderDocumentPdf(pdfTheme, { ...ctx, docType: 'Cash Memo' }, action);
}

export async function renderProformaInvoicePdf(ctx: PdfRenderContext, action: 'download' | 'view') {
  return renderDocumentPdf(pdfTheme, { ...ctx, docType: 'Proforma Invoice' }, action);
}

export function isDocumentKind(kind: string): kind is DocumentKind {
  return kind === 'Invoice' || kind === 'Quotation' || kind === 'Cash Memo' || kind === 'Proforma Invoice';
}


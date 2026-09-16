import type { CashMemo, Customer, Invoice, ProformaInvoice, Quotation, Settings } from '../types';
import { renderCashMemoPdf, renderInvoicePdf, renderProformaInvoicePdf, renderQuotationPdf } from './pdf/documents';
import type { DocumentData, DocumentCustomer, DocumentKind, PdfRenderContext } from './pdf/types';

export async function downloadPDF(
  docData: Invoice | Quotation | CashMemo | ProformaInvoice,
  customer: string | Customer,
  docType: DocumentKind,
  action: 'download' | 'view' = 'download',
  settings?: Settings
) {
  const baseCtx = {
    docData: docData as DocumentData,
    customer: customer as DocumentCustomer,
    settings,
  };

  if (docType === 'Invoice') return renderInvoicePdf({ ...baseCtx, docType }, action);
  if (docType === 'Quotation') return renderQuotationPdf({ ...baseCtx, docType }, action);
  if (docType === 'Cash Memo') return renderCashMemoPdf({ ...baseCtx, docType }, action);
  if (docType === 'Proforma Invoice') return renderProformaInvoicePdf({ ...baseCtx, docType }, action);
}

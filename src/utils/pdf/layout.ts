import type { DocumentKind, DocumentData, DocumentCustomer, PdfRenderContext } from './types';

export function getDocumentNumber(docData: DocumentData) {
  return 'number' in docData ? docData.number : 'Draft';
}

export function getDocumentDate(docData: DocumentData) {
  return docData.created_at?.toDate ? docData.created_at.toDate().toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
}

export function getDocumentPrefix(docType: DocumentKind) {
  if (docType.includes('Quotation')) return 'Quotation';
  if (docType.includes('Invoice')) return 'Invoice';
  if (docType.includes('Memo')) return 'CashMemo';
  return 'Doc';
}

export function getBuyerName(customer: DocumentCustomer) {
  return typeof customer === 'object' && customer !== null ? customer.name : (customer || 'Unknown Customer');
}

export function getBuyerAddress(customer: DocumentCustomer, docData: DocumentData) {
  if (typeof customer !== 'object' || customer === null) return docData.customer_id ? '' : '';

  const addrParts: string[] = [];
  if (customer.billing_address) addrParts.push(customer.billing_address);
  if (customer.phone) addrParts.push(`Phone: ${customer.phone}`);
  if (customer.email) addrParts.push(`Email: ${customer.email}`);
  if (customer.gst_number) addrParts.push(`GSTIN: ${customer.gst_number}`);
  return addrParts.join('\n');
}

export function getDocumentMode(ctx: PdfRenderContext) {
  return {
    buyerName: getBuyerName(ctx.customer),
    buyerAddr: getBuyerAddress(ctx.customer, ctx.docData),
    docNumber: getDocumentNumber(ctx.docData),
    dateStr: getDocumentDate(ctx.docData),
    prefix: getDocumentPrefix(ctx.docType),
  };
}


import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Invoice, Quotation, CashMemo } from '../types';

export function downloadPDF(
  docData: Invoice | Quotation | CashMemo,
  customerName: string,
  docType: 'Invoice' | 'Quotation' | 'Cash Memo',
  action: 'download' | 'view' = 'download'
) {
  const doc = new jsPDF();
  
  // Document Title
  doc.setFontSize(22);
  doc.setTextColor(40, 40, 40);
  doc.text(docType.toUpperCase(), 14, 22);
  
  // Document Info
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Number: ${docData.number}`, 14, 32);
  const dateStr = docData.created_at?.toDate ? docData.created_at.toDate().toLocaleDateString() : new Date().toLocaleDateString();
  doc.text(`Date: ${dateStr}`, 14, 38);
  
  // Bill To
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text(`Bill To:`, 14, 50);
  doc.setFont('helvetica', 'bold');
  doc.text(customerName || 'Unknown Customer', 14, 56);
  doc.setFont('helvetica', 'normal');

  // Items Table
  const tableData = docData.items.map((item, index) => [
    index + 1,
    item.description || '-',
    item.hsn_code || '-',
    item.quantity || 0,
    item.rate?.toFixed(2) || '0.00',
    `${item.tax_percentage || 0}%`,
    item.line_total?.toFixed(2) || '0.00'
  ]);

  autoTable(doc, {
    startY: 65,
    head: [['#', 'Product & Description', 'HSN', 'Qty', 'Rate', 'Tax %', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255] },
    styles: { fontSize: 9, cellPadding: 4 },
  });

  const finalY = (doc as any).lastAutoTable.finalY || 65;

  // Totals Section
  const totalsStartY = finalY + 20; // Increased gap for negative space
  
  doc.setFontSize(10);
  doc.text(`Subtotal:`, 150, totalsStartY, { align: 'right' });
  doc.text(`Rs. ${docData.subtotal?.toFixed(2) || '0.00'}`, 190, totalsStartY, { align: 'right' });
  
  doc.text(`Tax Total:`, 150, totalsStartY + 8, { align: 'right' });
  doc.text(`Rs. ${docData.tax_total?.toFixed(2) || '0.00'}`, 190, totalsStartY + 8, { align: 'right' });
  
  let grandTotalY = totalsStartY + 16;
  if ('round_off' in docData && docData.round_off) {
    doc.text(`Round Off:`, 150, totalsStartY + 16, { align: 'right' });
    doc.text(`Rs. ${docData.round_off?.toFixed(2) || '0.00'}`, 190, totalsStartY + 16, { align: 'right' });
    grandTotalY += 8;
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Grand Total:`, 150, grandTotalY + 4, { align: 'right' });
  doc.text(`Rs. ${docData.grand_total?.toFixed(2) || '0.00'}`, 190, grandTotalY + 4, { align: 'right' });

  // Status Badge
  const statusStr = docData.status.toUpperCase();
  doc.setFontSize(10);
  doc.setTextColor(15, 118, 110);
  doc.text(`Status: ${statusStr}`, 14, totalsStartY);

  // Footer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('This is a computer generated document.', 105, 285, { align: 'center' });

  if (action === 'view') {
    window.open(doc.output('bloburl'), '_blank');
  } else {
    // Save the PDF
    doc.save(`${docType.replace(' ', '_')}_${docData.number}.pdf`);
  }
}

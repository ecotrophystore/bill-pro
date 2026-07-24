import html2pdf from 'html2pdf.js';
import type { Invoice, Quotation, CashMemo, ProformaInvoice, Settings, Customer } from '../types';
import { calculateBillingTotals } from './billingCalculator';

function numToWords(n: number) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function inWords(num: string | number) {
    let numStr = num.toString();
    if (numStr.length > 9) return 'overflow';
    let nArray = ('000000000' + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!nArray) return ''; 
    var str = '';
    str += (parseInt(nArray[1]) != 0) ? (a[Number(nArray[1])] || b[parseInt(nArray[1][0])] + ' ' + a[parseInt(nArray[1][1])]) + ' Crore ' : '';
    str += (parseInt(nArray[2]) != 0) ? (a[Number(nArray[2])] || b[parseInt(nArray[2][0])] + ' ' + a[parseInt(nArray[2][1])]) + ' Lakh ' : '';
    str += (parseInt(nArray[3]) != 0) ? (a[Number(nArray[3])] || b[parseInt(nArray[3][0])] + ' ' + a[parseInt(nArray[3][1])]) + ' Thousand ' : '';
    str += (parseInt(nArray[4]) != 0) ? (a[Number(nArray[4])] || b[parseInt(nArray[4][0])] + ' ' + a[parseInt(nArray[4][1])]) + ' Hundred ' : '';
    str += (parseInt(nArray[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(nArray[5])] || b[parseInt(nArray[5][0])] + ' ' + a[parseInt(nArray[5][1])]) : '';
    return str;
  }
  let parts = n.toString().split(".");
  let rupees = Number(parts[0]);
  let paise = parts.length > 1 ? Number(parts[1].padEnd(2, '0').substring(0, 2)) : 0;
  let res = "Rupees " + inWords(rupees);
  if (paise > 0) { res += " and " + inWords(paise) + " Paise"; }
  return res + " Only";
}

function formatCurrency(num: number) {
  return "₹ " + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function downloadPDF(
  docData: Invoice | Quotation | CashMemo | ProformaInvoice,
  customer: string | Customer,
  docType: 'Invoice' | 'Quotation' | 'Cash Memo' | 'Proforma Invoice',
  action: 'download' | 'view' = 'download',
  settings?: Settings
) {
  if (docType === 'Cash Memo' && (docData as any).payment_status !== 'paid') {
    alert("Mark this Cash Memo as Paid to enable PDF download.");
    return;
  }
  const isCustomerObj = typeof customer === 'object' && customer !== null;
  const buyerName = isCustomerObj ? customer.name : (customer || 'Unknown Customer');
  
  let buyerAddr = '';
  if (isCustomerObj) {
    const addrParts: string[] = [];
    if (customer.billing_address) addrParts.push(customer.billing_address);
    if (customer.phone) addrParts.push(`Phone: ${customer.phone}`);
    if (customer.email) addrParts.push(`Email: ${customer.email}`);
    if (customer.gst_number) addrParts.push(`GSTIN: ${customer.gst_number}`);
    buyerAddr = addrParts.join('\n');
  } else {
    buyerAddr = docData.customer_id ? '' : ''; // fallback if string
  }
  const docNumber = 'number' in docData ? docData.number : 'Draft';
  const dateStr = docData.created_at?.toDate ? docData.created_at.toDate().toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

  let docNoLabel = "Quote No:";
  if (docType.includes("Invoice")) docNoLabel = "Invoice No:";
  if (docType.includes("Memo")) docNoLabel = "Memo No:";

  const showHSN = (settings as any)?.gst_enabled;

  const calc = calculateBillingTotals({
    items: docData.items,
    customerType: (docData as any).customer_type,
    isIgst: (docData as any).is_igst || (docData as any).tax_type === 'IGST' || (docData as any).is_igst === true || ((docData as any).igstTotal && (docData as any).igstTotal > 0),
    discountPercent: (docData as any).discount_percent,
    chargeAmount: (docData as any).charge_amount || (docData as any).chargeAmount
  });

  const subTotal = calc.subtotal;
  const discountAmt = calc.discountAmount;
  const designCharge = calc.chargeAmount;
  const taxTotal = calc.taxTotal;
  const cgst = calc.cgst;
  const sgst = calc.sgst;
  const igst = calc.igst;
  const grandTotal = calc.grandTotal;
  const isIgst = calc.igst > 0;

  let itemsHtml = '';

  calc.enrichedItems.forEach((item: any, index: number) => {
    const qty = item.quantity || 0;
    const rate = item.rate || 0;
    const total = item.line_total || (qty * rate);
    
    itemsHtml += `
      <tr>
          <td class="col-sno">${index + 1}</td>
          <td class="col-desc">
              <span class="item-title">${item.description || item.name || 'Item'}</span>
              ${item.desc ? `<span class="item-desc">${item.desc}</span>` : ''}
          </td>
          ${showHSN ? `<td class="col-sno">${item.hsn_code || '3926'}</td>` : ''}
          <td class="col-qty">${qty}${item.unit ? ` ${item.unit}` : ''}</td>
          <td class="col-rate">${formatCurrency(rate).replace('₹ ', '')}</td>
          <td class="col-amt">${formatCurrency(total).replace('₹ ', '')}</td>
      </tr>
    `;
  });

  const advance = 0; // if available from docData
  const balance = grandTotal - advance;

  let paymentHtml = '';
  let pMethod = docData.payment_method_to_show || 'Bank Details'; // fallback if not set
  
  // Legacy support: Older documents mapped GPay to 'UPI Details'
  if (pMethod === 'UPI Details' && (docData as any).advance_payment_method === 'GPay') {
    pMethod = 'GPay Details';
  }

  if (settings && pMethod !== 'None') {
    let detailsList = '';
    
    if (pMethod === 'Bank Details' || pMethod === 'All Payment Details') {
      if (settings.bankName) detailsList += `<li><strong>Bank:</strong> ${settings.bankName}</li>`;
      if (settings.accountHolderName) detailsList += `<li><strong>A/c Name:</strong> ${settings.accountHolderName}</li>`;
      if (settings.accountNumber) detailsList += `<li><strong>A/c No:</strong> ${settings.accountNumber}</li>`;
      if (settings.ifscCode) detailsList += `<li><strong>IFSC:</strong> ${settings.ifscCode}</li>`;
      if (settings.branchName) detailsList += `<li><strong>Branch:</strong> ${settings.branchName}</li>`;
    }
    
    if (pMethod === 'UPI Details' || pMethod === 'All Payment Details') {
      if (settings.upiId) detailsList += `<li><strong>UPI ID:</strong> ${settings.upiId}</li>`;
      if (pMethod === 'UPI Details' && settings.accountHolderName) {
         detailsList += `<li><strong>Name:</strong> ${settings.accountHolderName}</li>`;
      }
    }
    
    if (pMethod === 'GPay Details' || pMethod === 'All Payment Details') {
      if (settings.gpayNumber) detailsList += `<li><strong>GPay No:</strong> ${settings.gpayNumber}</li>`;
      if (pMethod === 'GPay Details' && settings.gpayHolderName) {
         detailsList += `<li><strong>Name:</strong> ${settings.gpayHolderName}</li>`;
      }
    }

    if (detailsList) {
      paymentHtml = `
      <div class="footer-col">
          <h4>Payment Details</h4>
          <ul class="footer-list">
              ${detailsList}
          </ul>
      </div>`;
    }
  }

  const html = `
    <div id="quotation-paper-wrapper">
      <style>
        #quotation-paper {
            width: 210mm;
            min-height: 297mm;
            background: white;
            padding: 12mm;
            box-sizing: border-box;
            color: #333;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        }

        .header { display: flex; justify-content: space-between; gap: 30px; border-bottom: 3px solid #2E7D32; padding-bottom: 10px; margin-bottom: 20px; }
        .company-name { color: #2E7D32; font-size: 22px; font-weight: 900; text-transform: uppercase; margin: 0; }
        .company-details { font-size: 11px; line-height: 1.3; margin-top: 5px; color: #555; }
        
        .quote-meta { text-align: right; }
        .quote-label { color: #2E7D32; font-size: 30px; font-weight: 800; letter-spacing: 1px; margin: 0; line-height: 1; text-transform: uppercase; }
        .meta-table { margin-top: 5px; border-collapse: collapse; float: right; }
        .meta-table td { padding: 1px 0 1px 15px; font-size: 12px; text-align: right; white-space: nowrap; }
        .meta-label { font-weight: bold; color: #666; }

        .address-section { display: flex; gap: 20px; margin-bottom: 20px; }
        .address-box { 
            flex: 1; 
            background: #f8f9fa; 
            border-left: 4px solid #2E7D32; 
            padding: 10px; 
            border-radius: 0 4px 4px 0;
        }
        .address-title { color: #2E7D32; font-size: 11px; text-transform: uppercase; font-weight: bold; margin-bottom: 3px; }
        .client-name { font-weight: bold; font-size: 13px; margin-bottom: 2px; display: block; }
        .client-address { font-size: 12px; line-height: 1.3; color: #444; white-space: pre-line; }

        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        .items-table th { background: #2E7D32; color: white; padding: 6px 8px; font-size: 11px; text-align: left; font-weight: 600; text-transform: uppercase; }
        .items-table td { border-bottom: 1px solid #eee; padding: 6px 8px; font-size: 12px; vertical-align: top; }
        .col-sno { width: 30px; text-align: center; }
        .col-qty { width: 50px; text-align: center; }
        .col-rate { width: 80px; text-align: right; }
        .col-amt { width: 90px; text-align: right; font-weight: 600; }
        
        .item-title { font-weight: 600; font-size: 12px; color: #000; }
        .item-desc { font-size: 11px; color: #666; margin-top: 2px; display: block; line-height: 1.2; }

        .totals-container { display: flex; justify-content: flex-end; margin-bottom: 15px; }
        .totals-table { width: 220px; border-collapse: collapse; }
        .totals-table td { padding: 4px 8px; text-align: right; font-size: 12px; }
        .total-label { color: #666; }
        .total-value { font-weight: 600; }
        .grand-total-row { background: #2E7D32; color: white; }
        .grand-total-row td { padding: 8px; font-size: 13px; font-weight: bold; }

        .amount-words { border-top: 1px solid #ddd; padding-top: 8px; font-size: 12px; margin-bottom: 20px; font-style: italic; color: #555; }
        .amount-words span { font-weight: 700; color: #333; font-style: normal; }

        .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: auto; border-top: 2px solid #2E7D32; padding-top: 15px; }
        .footer-col h4 { color: #2E7D32; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; }
        .footer-list { list-style: none; padding: 0; margin: 0; font-size: 11px; line-height: 1.4; color: #444; }
        .footer-list li { margin-bottom: 2px; }
        
        .signature-box { text-align: right; padding-top: 5px; }
        .signature-wrapper { display: inline-block; width: 180px; text-align: center; }
        .sign-area { height: 65px; display: flex; align-items: center; justify-content: center; padding-bottom: 5px; }
        .auth-sign { border-top: 1px solid #333; padding-top: 5px; font-weight: bold; font-size: 12px; width: 100%; }

        tr, .totals-container, .amount-words, .footer-grid, .signature-box, .address-section {
            page-break-inside: avoid;
        }
      </style>
      <div id="quotation-paper">
          <div class="header">
              <div>
                  ${docType === 'Cash Memo' ? '' : `
                      ${settings?.companyLogo ? `<img src="${settings.companyLogo}" style="max-height: 50px; margin-bottom: 10px;" />` : ''}
                      <h1 class="company-name">${settings?.companyName || 'Company Name'}</h1>
                      <div class="company-details">
                          ${settings?.companyAddress ? settings.companyAddress.replace(/\\n/g, '<br>') : ''}<br>
                          ${settings?.companyGstin ? `<strong>GSTIN:</strong> ${settings.companyGstin}<br>` : ''}
                          ${settings?.companyEmail ? `<strong>Email:</strong> ${settings.companyEmail}` : ''}
                      </div>
                  `}
              </div>
              <div class="quote-meta">
                  <h2 class="quote-label">${docType}</h2>
                  <table class="meta-table">
                      <tr><td class="meta-label">Date:</td><td>${dateStr}</td></tr>
                      <tr><td class="meta-label">${docNoLabel}</td><td>${docNumber}</td></tr>
                      <tr><td class="meta-label">Valid Until:</td><td>30 Days</td></tr>
                  </table>
              </div>
          </div>

          <div class="address-section">
              <div class="address-box">
                  <div class="address-title">Billing To</div>
                  <span class="client-name">${buyerName}</span>
                  <span class="client-address">${buyerAddr}</span>
              </div>
          </div>

          <table class="items-table">
              <thead>
                  <tr>
                      <th class="col-sno">#</th>
                      <th class="col-desc">Description</th>
                      ${showHSN ? '<th class="col-sno">HSN/SAC</th>' : ''}
                      <th class="col-qty">Qty</th>
                      <th class="col-rate">Rate</th>
                      <th class="col-amt">Amount</th>
                  </tr>
              </thead>
              <tbody>
                  ${itemsHtml}
              </tbody>
          </table>

          <div class="totals-container">
              <table class="totals-table">
                  <tr>
                      <td class="total-label">Sub Total</td>
                      <td class="total-value">${formatCurrency(subTotal)}</td>
                  </tr>
                  ${discountAmt > 0 ? `
                  <tr>
                      <td class="total-label">Discount (${(docData as any).discount_percent || 0}%)</td>
                      <td class="total-value">-${formatCurrency(discountAmt)}</td>
                  </tr>
                  ` : ''}
                  ${designCharge > 0 ? `
                  <tr>
                      <td class="total-label">Design Charge</td>
                      <td class="total-value">${formatCurrency(designCharge)}</td>
                  </tr>
                  ` : ''}
                  ${(docData as any).customer_type === 'non_gst' ? '' : (taxTotal > 0 ? (isIgst ? `
                  <tr>
                      <td class="total-label">IGST</td>
                      <td class="total-value">${formatCurrency(igst)}</td>
                  </tr>
                  ` : `
                  <tr>
                      <td class="total-label">CGST (9%)</td>
                      <td class="total-value">${formatCurrency(cgst)}</td>
                  </tr>
                  <tr>
                      <td class="total-label">SGST (9%)</td>
                      <td class="total-value">${formatCurrency(sgst)}</td>
                  </tr>
                  `) : '')}
                  <tr class="grand-total-row">
                      <td>Grand Total</td>
                      <td>${formatCurrency(grandTotal)}</td>
                  </tr>
              </table>
          </div>

          <div class="amount-words">
              Amount in Words:<br>
              <span>${numToWords(parseFloat(grandTotal.toFixed(2)))}</span>
          </div>

          <div class="footer-grid">
              ${paymentHtml}
              <div class="footer-col">
                  <h4>Terms & Conditions</h4>
                  <ul class="footer-list">
                      ${settings?.termsAndConditions ? settings.termsAndConditions.split('\\n').map((t: string) => `<li>${t}</li>`).join('') : ''}
                  </ul>
              </div>
              <div class="signature-box" style="grid-column: 1 / -1;">
                  <div class="signature-wrapper">
                      <div class="sign-area">
                          ${settings?.authorizedSignature ? `<img src="${settings.authorizedSignature}" alt="Signature" style="max-height: 60px; max-width: 160px; object-fit: contain;">` : ''}
                      </div>
                      <div class="auth-sign">
                          <span style="font-weight:400; font-size:11px;">Authorised Signatory</span>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
  `;

  // Create temporary container
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  document.body.appendChild(container);

  const element = container.querySelector('#quotation-paper');
  
  let prefix = "Doc";
  if (docType.includes("Quotation")) prefix = "Quotation";
  else if (docType.includes("Invoice")) prefix = "Invoice";
  else if (docType.includes("Memo")) prefix = "CashMemo";

  const opt = {
      margin: [5, 0, 10, 0] as [number, number, number, number],
      filename: `${prefix}_${buyerName.replace(/\\s+/g, '_')}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
      pagebreak: { mode: 'css', avoid: ['tr', '.totals-container', '.amount-words', '.footer-grid', '.signature-box'] }
  };

  if (action === 'view') {
    html2pdf().set(opt).from(element as HTMLElement).toPdf().get('pdf').then((pdf: any) => {
      window.open(pdf.output('bloburl'), '_blank');
      document.body.removeChild(container);
    });
  } else {
    html2pdf().set(opt).from(element as HTMLElement).save().then(() => {
      document.body.removeChild(container);
    });
  }
}

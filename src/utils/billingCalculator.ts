const exactRound = (num: number) => Math.round(num * 100) / 100;

export function calculateBillingTotals(input: {
  items: any[];
  customerType?: 'gst' | 'non_gst';
  isIgst?: boolean;
  discountPercent?: number;
  chargeAmount?: number;
}) {
  const customerType = input.customerType || 'gst';
  const isIgst = !!input.isIgst;
  const discountPercent = input.discountPercent || 0;
  const chargeAmount = input.chargeAmount || 0;

  let rawSubtotal = 0;
  let taxTotal = 0;
  let subtotalAfterDiscount = 0;

  const enrichedItems = (input.items || []).map(item => {
    const lineTotal = exactRound((item.quantity || 0) * (item.rate || 0));
    rawSubtotal += lineTotal;
    
    // Apply discount per item to get taxable value
    const discountedLine = exactRound(lineTotal - (lineTotal * discountPercent) / 100);
    subtotalAfterDiscount += discountedLine;
    
    const taxAmount = customerType === 'non_gst' ? 0 : exactRound((discountedLine * (item.tax_percentage || 0)) / 100);
    taxTotal += taxAmount;

    return {
      ...item,
      line_total: lineTotal,
      taxableAmount: discountedLine,
      taxAmount,
      totalAmount: exactRound(discountedLine + taxAmount)
    };
  });

  const discountAmount = exactRound((rawSubtotal * discountPercent) / 100);
  const charge = exactRound(chargeAmount);
  const grandTotalExact = subtotalAfterDiscount + taxTotal + charge;
  const finalGrandTotal = Math.round(grandTotalExact);
  const roundOff = exactRound(finalGrandTotal - grandTotalExact);

  let cgst = 0, sgst = 0, igst = 0;
  if (customerType !== 'non_gst') {
    if (isIgst) {
      igst = taxTotal;
    } else {
      cgst = exactRound(taxTotal / 2);
      sgst = exactRound(taxTotal / 2);
    }
  }

  return {
    enrichedItems,
    subtotal: exactRound(rawSubtotal),
    discountAmount,
    taxTotal: exactRound(taxTotal),
    cgst,
    sgst,
    igst,
    chargeAmount: charge,
    roundOff,
    grandTotal: finalGrandTotal
  };
}

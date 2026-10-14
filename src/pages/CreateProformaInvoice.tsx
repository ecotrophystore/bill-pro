import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Calculator, Sparkles, Loader2, ShieldCheck } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth, functions } from '../lib/firebase';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Customer, Product, LineItem } from '../types';
import SearchableAutocomplete from '../components/Billing/SearchableAutocomplete';
import SpeechInput from '../components/Shared/SpeechInput';
import { useSettings } from '../contexts/SettingsContext';
import { getNextProposedNumber } from '../utils/numberGenerator';


const exactRound = (num: number) => Math.round(num * 100) / 100;
const formatINR = (val: number) => (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CreateProformaInvoice() {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings: companySettings } = useSettings();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [items, setItems] = useState<(Partial<LineItem> & { priceTier?: 'retail' | 'wholesale' })[]>([
    { description: '', desc: '', hsn_code: '', quantity: 1, rate: 0, tax_percentage: 18, priceTier: 'retail', unit: 'Pcs' }
  ]);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState('Bank Transfer');
  const [advancePaymentDate, setAdvancePaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [advanceReferenceNumber, setAdvanceReferenceNumber] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [documentNumber, setDocumentNumber] = useState('');

  const [isGstInfo, setIsGstInfo] = useState({ isIgst: false });
  const [applyGst, setApplyGst] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { id } = useParams();
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!db) return;
      try {
        const [custSnap, prodSnap] = await Promise.all([
          getDocs(collection(db, 'customers')),
          getDocs(collection(db, 'products'))
        ]);
        
        const loadedCustomers = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        setCustomers(loadedCustomers);
        const allProducts = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
        setProducts(allProducts.filter(p => !(p.source === 'purchase' || (p.priceHistory && p.priceHistory.length > 0))));

        if (id) {
          const invDoc = await getDoc(doc(db, 'proforma_invoices', id));
          if (invDoc.exists()) {
            const data = invDoc.data();
            setSelectedCustomerId(data.customer_id);
            setSelectedCustomerName(data.customer_name);
            setItems(data.items || []);
            const hasGst = (data.items || []).some((item: any) => (item.tax_percentage || 0) > 0);
            setApplyGst(hasGst);
            setIsGstInfo({ isIgst: data.is_igst || false });
            setAdvanceAmount(data.advance_amount || 0);
            setAdvancePaymentMethod(data.advance_payment_method || 'Bank Transfer');
            setAdvancePaymentDate(data.advance_payment_date || new Date().toISOString().split('T')[0]);
            setAdvanceReferenceNumber(data.advance_reference_number || '');
            setDiscountPercent(data.discount_percent || 0);
            setChargeAmount(data.charge_amount || 0);
            setDocumentNumber(data.number || '');
          }
        } else {
          try {
            const proposed = await getNextProposedNumber('proforma_invoices', 'proforma', companySettings);
            setDocumentNumber(proposed);
          } catch (numErr) {
            console.warn("Could not generate proposed proforma number:", numErr);
          }
        }
      } catch (error) {
        console.error("Error fetching library data:", error);
      } finally {
        setLoadingData(false);
      }
    }
    fetchData();
  }, [id, companySettings?.proforma_prefix, companySettings?.proforma_format, companySettings?.proforma_year, companySettings?.proforma_next_number]);

  const addItem = () => setItems([...items, { description: '', desc: '', hsn_code: '', quantity: 1, rate: 0, tax_percentage: 18, priceTier: 'retail', unit: 'Pcs' }]);
  
  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };
  
  const calculateTotals = () => {
    let subtotal = 0;
    let taxTotal = 0;
    
    items.forEach(item => {
      const lineTotal = (item.quantity || 0) * (item.rate || 0);
      const discountedLine = exactRound(lineTotal - (lineTotal * discountPercent) / 100);
      const taxAmount = (discountedLine * (applyGst ? 18 : 0)) / 100;
      subtotal += exactRound(discountedLine);
      taxTotal += exactRound(taxAmount);
    });

    const rawSubtotal = items.reduce((acc, item) => acc + exactRound((item.quantity || 0) * (item.rate || 0)), 0);
    const discountAmount = exactRound((rawSubtotal * discountPercent) / 100);
    const charge = exactRound(chargeAmount || 0);
    const grandTotalExact = exactRound(subtotal + taxTotal + charge);
    const finalGrandTotal = grandTotalExact;

    return {
      subtotal: exactRound(rawSubtotal),
      discountAmount,
      taxTotal: exactRound(taxTotal),
      chargeAmount: charge,
      roundOff: 0,
      grandTotal: finalGrandTotal
    };
  };

  const totals = calculateTotals();

  const handleGenerateInvoice = async () => {
    if (!selectedCustomerId || !auth?.currentUser || !functions) {
      alert("Please select a customer and ensure you are logged in.");
      return;
    }

    const mappedItems = items.map(item => ({
      ...item,
      tax_percentage: applyGst ? 18 : 0
    }));

    if (id) {
      const confirm = window.confirm("Are you sure you want to update this proforma invoice?");
      if (!confirm) return;
      setIsSaving(true);
      try {
        await updateDoc(doc(db, 'proforma_invoices', id), {
          number: documentNumber || undefined,
          customer_id: selectedCustomerId || `new_${Date.now()}`,
          customer_name: selectedCustomerName,
          is_igst: isGstInfo.isIgst,
          items: mappedItems,
          discount_percent: discountPercent,
          advance_amount: advanceAmount,
          advance_payment_method: advancePaymentMethod,
          advance_payment_date: advancePaymentDate,
          advance_reference_number: advanceReferenceNumber,
          payment_method_to_show: advanceAmount > 0 ? (advancePaymentMethod === 'Cash' ? 'None' : (advancePaymentMethod === 'GPay' ? 'GPay Details' : (['UPI', 'PhonePe', 'Paytm'].includes(advancePaymentMethod) ? 'UPI Details' : 'Bank Details'))) : 'Bank Details',
          balance_amount: Math.max(0, totals.grandTotal - advanceAmount),
          subtotal: totals.subtotal,
          tax_total: totals.taxTotal,
          cgst: isGstInfo.isIgst ? 0 : exactRound(totals.taxTotal / 2),
          sgst_igst: isGstInfo.isIgst ? exactRound(totals.taxTotal) : exactRound(totals.taxTotal / 2),
          discount_amount: totals.discountAmount,
          charge_amount: totals.chargeAmount,
          round_off: totals.roundOff,
          grand_total: totals.grandTotal
        });
        navigate('/proforma-invoices');
      } catch (error) {
        console.error("Error updating proforma invoice:", error);
        alert("Failed to update proforma invoice.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const confirm = window.confirm("Create this Proforma Invoice draft?");
    if (!confirm) return;

    setIsSaving(true);
    try {
      const createProformaInvoiceFn = httpsCallable(functions, 'createProformaInvoice');
      const invoiceData = {
        number: documentNumber || undefined,
        customer_id: selectedCustomerId || `new_${Date.now()}`,
        customer_name: selectedCustomerName,
        is_igst: isGstInfo.isIgst,
        items: mappedItems,
        discount_percent: discountPercent,
        charge_amount: chargeAmount,
        advance_amount: advanceAmount,
        advance_payment_method: advanceAmount > 0 ? advancePaymentMethod : '',
        advance_payment_date: advanceAmount > 0 ? advancePaymentDate : '',
        advance_reference_number: advanceAmount > 0 ? advanceReferenceNumber : '',
        payment_method_to_show: advanceAmount > 0 ? (advancePaymentMethod === 'Cash' ? 'None' : (advancePaymentMethod === 'GPay' ? 'GPay Details' : (['UPI', 'PhonePe', 'Paytm'].includes(advancePaymentMethod) ? 'UPI Details' : 'Bank Details'))) : 'Bank Details',
        balance_amount: Math.max(0, totals.grandTotal - advanceAmount),
        ...totals
      };

      await createProformaInvoiceFn({ invoiceData });
      navigate('/proforma-invoices');
    } catch (error) {
      console.warn("Cloud function failed, attempting client-side save fallback:", error);
      try {
        const invoiceData: any = {
          number: documentNumber || undefined,
          customer_id: selectedCustomerId || `new_${Date.now()}`,
          customer_name: selectedCustomerName,
          is_igst: isGstInfo.isIgst,
          items: mappedItems,
          discount_percent: discountPercent,
          charge_amount: chargeAmount,
          advance_amount: advanceAmount,
          advance_payment_method: advancePaymentMethod,
          advance_payment_date: advancePaymentDate,
          advance_reference_number: advanceReferenceNumber,
          payment_method_to_show: advancePaymentMethod === 'Cash' ? 'None' : (advancePaymentMethod === 'GPay' ? 'GPay Details' : (['UPI', 'PhonePe', 'Paytm'].includes(advancePaymentMethod) ? 'UPI Details' : 'Bank Details')),
          balance_amount: Math.max(0, totals.grandTotal - advanceAmount),
          ...totals
        };
        const { clientCreateProformaInvoice } = await import('../utils/clientBillingCreator');
        await clientCreateProformaInvoice(invoiceData);
        navigate('/proforma-invoices');
      } catch (clientError) {
        console.error("Client-side fallback also failed:", clientError);
        alert("Failed to create proforma invoice. Connection or Permission issue.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={40} className="animate-spin text-primary" />
        <p className="text-secondary animate-pulse">Syncing with EcoBill Library...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-[1440px] mx-auto px-2 sm:px-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/proforma-invoices')} className="p-2 neo-btn !px-3 !py-2">
          <ArrowLeft size={18} className="text-secondary" />
        </button>
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-primary-dark">
              {id ? 'Edit Proforma Invoice' : 'Create Proforma Invoice'}
            </h1>
          </div>
          <p className="text-xs text-secondary mt-0.5">
            {id ? 'Update the details of the selected proforma invoice.' : 'Generate a Proforma Invoice draft. Can be edited or converted later.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-4">
          <div className="neo-card p-4 sm:p-5">
            <h3 className="mb-3 text-base font-bold">Customer Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <SearchableAutocomplete
                  label="Select Customer"
                  items={customers.map(c => ({ id: c.id, label: c.name, subLabel: c.gst_number || 'No GST' }))}
                  value={selectedCustomerName}
                  onSelect={(id: string, label: string) => {
                    setSelectedCustomerId(id);
                    setSelectedCustomerName(label);
                  }}
                  onCustomChange={(val) => {
                    setSelectedCustomerId('');
                    setSelectedCustomerName(val);
                  }}
                  placeholder="Search customers..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-primary-dark px-1 flex items-center justify-between">
                  <span>Proforma No</span>
                  <span className="text-xs text-primary font-normal">Editable</span>
                </label>
                <SpeechInput 
                  type="text" 
                  className="neo-input w-full font-mono text-primary-dark font-bold text-sm bg-transparent" 
                  placeholder="e.g. PI/25/26/0001" 
                  value={documentNumber} 
                  onChange={(e: any) => setDocumentNumber(e.target.value)} 
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-primary-dark px-1">Proforma Date</label>
                <input type="date" className="neo-input w-full" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <div className="flex items-center gap-2">
                 <input 
                   type="checkbox" 
                   id="applyGst" 
                   className="rounded text-primary focus:ring-primary border-shadow-darker/20" 
                   checked={applyGst && !isGstInfo.isIgst} 
                   onChange={e => {
                     if (e.target.checked) {
                       setApplyGst(true);
                       setIsGstInfo({ isIgst: false });
                     } else {
                       setApplyGst(false);
                     }
                   }} 
                 />
                 <label htmlFor="applyGst" className="text-sm font-medium text-secondary">Apply GST (18%)</label>
              </div>
              <div className="flex items-center gap-2">
                 <input 
                   type="checkbox" 
                   id="igst" 
                   className="rounded text-primary focus:ring-primary border-shadow-darker/20" 
                   checked={applyGst && isGstInfo.isIgst} 
                   onChange={e => {
                     if (e.target.checked) {
                       setApplyGst(true);
                       setIsGstInfo({ isIgst: true });
                     } else {
                       setApplyGst(false);
                     }
                   }} 
                 />
                 <label htmlFor="igst" className="text-sm font-medium text-secondary">Apply IGST (Inter-state)</label>
              </div>
            </div>
          </div>

          <div className="neo-card p-4 sm:p-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="mb-0 text-base font-bold flex items-center gap-2">
                <span>Line Items</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </h3>
            </div>

            <div className="space-y-2.5">
              {items.map((item, index) => {
                const itemTotal = (item.quantity || 0) * (item.rate || 0);
                return (
                  <div
                    key={index}
                    className="p-3 sm:p-3.5 rounded-xl bg-[#EDE1D1]/60 border border-shadow-darker/15 shadow-sm space-y-2 transition-all hover:border-primary/40"
                  >
                    {/* Top Row: Badge, Product Search, Tier, Total, Delete */}
                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
                      <span className="w-5 h-5 shrink-0 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-[200px]">
                        <SearchableAutocomplete
                          items={products.map(p => ({
                            id: p.id,
                            label: p.sku ? `${p.name} (${p.sku})` : p.name,
                            subLabel: `${p.category || ''} | ${p.size || ''}`
                          }))}
                          value={item.description || ''}
                          onSelect={(id: string, label: string) => {
                            const product = products.find(p => p.id === id);
                            const newItems = [...items];
                            newItems[index] = {
                              ...newItems[index],
                              description: label,
                              hsn_code: product?.hsn_code || newItems[index].hsn_code || '',
                              tax_percentage: product?.tax_percentage || newItems[index].tax_percentage || 18,
                              rate: item.priceTier === 'wholesale'
                                ? (product?.wholesale_price || 0)
                                : (product?.retail_price || 0)
                            };
                            setItems(newItems);
                          }}
                          onCustomChange={(val: string) => {
                            const newItems = [...items];
                            newItems[index].description = val;
                            setItems(newItems);
                          }}
                          placeholder="Select product from catalog or enter name..."
                        />
                      </div>
                      <div className="w-28 shrink-0">
                        <select
                          className="neo-input w-full text-xs font-semibold py-1.5 px-2"
                          value={item.priceTier}
                          onChange={(e) => {
                            const tier = e.target.value as 'retail' | 'wholesale';
                            const newItems = [...items];
                            newItems[index].priceTier = tier;
                            const product = products.find(p => p.name === item.description);
                            if (product) {
                              newItems[index].rate = tier === 'wholesale' ? product.wholesale_price : product.retail_price;
                            }
                            setItems(newItems);
                          }}
                        >
                          <option value="retail">Retail Tier</option>
                          <option value="wholesale">Wholesale</option>
                        </select>
                      </div>
                      <div className="shrink-0 text-right min-w-[100px] px-2.5 py-1 rounded-lg bg-bg-surface/50 border border-shadow-darker/10">
                        <span className="text-[10px] text-secondary block font-medium uppercase leading-tight">Total</span>
                        <span className="text-xs font-bold text-primary font-mono leading-tight">
                          ₹ {formatINR(itemTotal)}
                        </span>
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="p-1 rounded-lg text-error hover:bg-error/10 transition-colors shrink-0"
                          title="Delete Item"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {/* Bottom Row: HSN, Qty, Unit, Rate, Notes */}
                    <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center pt-1 border-t border-shadow-darker/10 text-xs">
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          className="neo-input w-full text-xs font-mono py-1 px-2"
                          placeholder="HSN Code"
                          value={item.hsn_code}
                          onChange={(e) => {
                            const newItems = [...items];
                            newItems[index].hsn_code = e.target.value;
                            setItems(newItems);
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-semibold text-secondary uppercase shrink-0">Qty:</span>
                          <input
                            type="number"
                            className="neo-input w-full font-bold text-xs py-1 px-1.5"
                            placeholder="1"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => {
                              const newItems = [...items];
                              newItems[index].quantity = parseFloat(e.target.value) || 0;
                              setItems(newItems);
                            }}
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          list="units-list"
                          className="neo-input w-full text-xs py-1 px-2"
                          placeholder="Unit"
                          value={item.unit || 'Pcs'}
                          onChange={(e) => {
                            const newItems = [...items];
                            newItems[index].unit = e.target.value;
                            setItems(newItems);
                          }}
                        />
                        <datalist id="units-list">
                          <option value="Pcs" />
                          <option value="Sq Ft" />
                          <option value="Kg" />
                          <option value="Ltr" />
                          <option value="Mtr" />
                          <option value="Nos" />
                        </datalist>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-semibold text-secondary uppercase shrink-0">Rate:</span>
                          <input
                            type="number"
                            className="neo-input w-full font-mono font-semibold text-xs py-1 px-1.5 text-primary-dark"
                            placeholder="0.00"
                            min="0"
                            step="any"
                            value={item.rate || ''}
                            onChange={(e) => {
                              const newItems = [...items];
                              newItems[index].rate = parseFloat(e.target.value) || 0;
                              setItems(newItems);
                            }}
                          />
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-4">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b border-shadow-darker/20 focus:border-primary outline-none text-xs text-secondary py-0.5 px-1 placeholder:text-secondary/50 placeholder:italic transition-colors"
                          placeholder="Item notes (optional)..."
                          value={item.desc || ''}
                          onChange={(e: any) => {
                            const newItems = [...items];
                            newItems[index].desc = e.target.value;
                            setItems(newItems);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="neo-btn mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary-dark hover:text-primary w-full sm:w-auto py-2 px-4 border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all"
            >
              <Plus size={15} /> Add Another Item
            </button>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-3 lg:sticky lg:top-4 self-start">
          <div className="neo-card p-4 sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 text-base font-bold"><Calculator size={16}/> Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-secondary">
                <span>Subtotal</span>
                <span className="font-semibold text-primary-dark font-mono">₹ {formatINR(totals.subtotal)}</span>
              </div>

              {/* Discount */}
              <div className="flex justify-between items-center gap-2">
                <label className="text-secondary shrink-0">Discount</label>
                <select
                  className="neo-input text-xs py-1 w-28"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                >
                  <option value={0}>None (0%)</option>
                  <option value={5}>5%</option>
                  <option value={10}>10%</option>
                  <option value={20}>20%</option>
                  <option value={30}>30%</option>
                  <option value={50}>50%</option>
                </select>
              </div>
              {discountPercent > 0 && (
                <div className="flex justify-between text-green-600 text-xs">
                  <span className="flex items-center gap-1.5">
                    Discount ({discountPercent}%)
                    <span className="bg-green-100 text-green-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                      You save ₹ {formatINR(totals.discountAmount)}
                    </span>
                  </span>
                  <span className="font-semibold font-mono">- ₹ {formatINR(totals.discountAmount)}</span>
                </div>
              )}

              {isGstInfo.isIgst ? (
                <div className="flex justify-between text-secondary">
                  <span>IGST</span>
                  <span className="font-semibold text-primary-dark font-mono">₹ {formatINR(totals.taxTotal)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-secondary">
                    <span>CGST (9%)</span>
                    <span className="font-semibold text-primary-dark font-mono">₹ {formatINR(totals.taxTotal / 2)}</span>
                  </div>
                  <div className="flex justify-between text-secondary">
                    <span>SGST (9%)</span>
                    <span className="font-semibold text-primary-dark font-mono">₹ {formatINR(totals.taxTotal / 2)}</span>
                  </div>
                </>
              )}

              {/* Charge */}
              <div className="flex justify-between items-center gap-2">
                <label className="text-secondary shrink-0">Design Charge</label>
                <input
                  type="number"
                  className="neo-input text-xs py-1 w-28 font-mono"
                  placeholder="0.00"
                  value={chargeAmount || ''}
                  onChange={(e) => setChargeAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
              {chargeAmount > 0 && (
                <div className="flex justify-between text-orange-600 text-xs">
                  <span>Design Charge</span>
                  <span className="font-semibold font-mono">+ ₹ {formatINR(totals.chargeAmount)}</span>
                </div>
              )}

              <div className="flex justify-between text-secondary">
                <span>Round-off</span>
                <span className="font-semibold text-primary-dark font-mono">₹ {formatINR(totals.roundOff)}</span>
              </div>
              <div className="h-px bg-shadow-darker/20 my-2"></div>
              <div className="flex justify-between items-baseline text-lg pt-1">
                <span className="font-bold text-primary-dark">Grand Total</span>
                <span className="text-xl font-extrabold text-primary font-mono">₹ {formatINR(totals.grandTotal)}</span>
              </div>
              <div className="h-px bg-shadow-darker/20 my-4"></div>
              <h4 className="font-semibold text-primary-dark mb-4 text-sm mt-4">Advance Payment</h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-secondary px-1">Amount</label>
                  <input
                    type="number"
                    className="neo-input w-full font-mono font-semibold"
                    value={advanceAmount || ''}
                    onChange={(e) => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                    max={totals.grandTotal}
                  />
                </div>
                <div className="animate-fade-in space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-secondary px-1">Method</label>
                      <select className="neo-input w-full text-xs" value={advancePaymentMethod} onChange={(e) => setAdvancePaymentMethod(e.target.value)}>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Cash">Cash</option>
                        <option value="GPay">GPay</option>
                        <option value="PhonePe">PhonePe</option>
                        <option value="Paytm">Paytm</option>
                        <option value="UPI">UPI</option>
                        <option value="NEFT">NEFT</option>
                        <option value="RTGS">RTGS</option>
                        <option value="IMPS">IMPS</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-secondary px-1">Date</label>
                      <input type="date" className="neo-input w-full text-xs" value={advancePaymentDate} onChange={(e) => setAdvancePaymentDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-secondary px-1">Ref Number (Optional)</label>
                    <input
                      type="text"
                      className="neo-input w-full text-xs"
                      placeholder="Transaction ID, Cheque No..."
                      value={advanceReferenceNumber}
                      onChange={(e) => setAdvanceReferenceNumber(e.target.value)}
                    />
                  </div>
                  <div className="h-px bg-shadow-darker/20 my-4"></div>
                  <div className="flex justify-between items-baseline text-lg mt-4">
                    <span className="font-bold text-primary-dark">Balance</span>
                    <span className="font-bold text-error font-mono">₹ {formatINR(Math.max(0, totals.grandTotal - advanceAmount))}</span>
                  </div>
                </div>
              </div>


              <div className="pt-6">
                <button 
                  onClick={handleGenerateInvoice} 
                  disabled={isSaving}
                  className="w-full neo-btn-primary flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  {id ? 'Update Proforma' : 'Generate Proforma'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

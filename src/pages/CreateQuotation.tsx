import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Calculator, Sparkles, Loader2 } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth, functions } from '../lib/firebase';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Customer, Product, LineItem } from '../types';
import SearchableAutocomplete from '../components/Billing/SearchableAutocomplete';
import SpeechInput from '../components/Shared/SpeechInput';
import { useSettings } from '../contexts/SettingsContext';


const exactRound = (num: number) => Math.round(num * 100) / 100;

export default function CreateQuotation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [customerType, setCustomerType] = useState<'gst' | 'non_gst'>('gst');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerState, setCustomerState] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const { settings: companySettings } = useSettings();
  const [hasAdvance, setHasAdvance] = useState(false);

  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState('Cash');
  const [advancePaymentDate, setAdvancePaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [advanceReferenceNumber, setAdvanceReferenceNumber] = useState('');
  const [items, setItems] = useState<any[]>([
    { description: '', hsn_code: '', quantity: 1, rate: 0, discount: 0, tax_percentage: 18, priceTier: 'retail' }
  ]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [chargeAmount, setChargeAmount] = useState(0);
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
        setProducts(prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));



        if (id) {
          const qDoc = await getDoc(doc(db, 'quotations', id));
          if (qDoc.exists()) {
            const data = qDoc.data();
            setSelectedCustomerId(data.customer_id);
            setSelectedCustomerName(data.customer_name);
            setCustomerType(data.customer_type || 'gst');
            setCustomerAddress(data.customer_address || '');
            setCustomerState(data.customer_state || '');
            setCustomerGstin(data.customer_gstin || '');
            setItems(data.items || []);
            const advAmt = data.advance_amount || 0;
            setAdvanceAmount(advAmt);
            setHasAdvance(advAmt > 0);
            setAdvancePaymentMethod(data.advance_payment_method || 'Cash');
            setAdvancePaymentDate(data.advance_payment_date || new Date().toISOString().split('T')[0]);
            setAdvanceReferenceNumber(data.advance_reference_number || '');
            setDiscountPercent(data.discount_percent || 0);
            setChargeAmount(data.charge_amount || 0);
          }
        }
      } catch (error) {
        console.error("Error fetching library data:", error);
      } finally {
        setLoadingData(false);
      }
    }
    fetchData();
  }, [id]);

  const autoSaveDraft = async (customerName: string | null, voiceItems: any[], voiceCustomerType?: 'gst' | 'non_gst') => {
    if (!auth?.currentUser || !functions || !db) {
      console.error("[QUOTATION] Draft Creation Failed - auth/functions/db not loaded");
      return;
    }
    
    try {
      console.log("[QUOTATION] Auto-creating draft quotation...");
      
      let finalCustomerId = '';
      let finalCustomerName = customerName || 'Unnamed Customer';
      
      if (customerName) {
        const matched = customers.find(c => c.name.toLowerCase().includes(customerName.toLowerCase()));
        if (matched) {
          finalCustomerId = matched.id;
          finalCustomerName = matched.name;
          console.log(`[QUOTATION] Auto-matched to customer: ${finalCustomerName} (${finalCustomerId})`);
        } else {
          // Auto-create new customer
          const newCustRef = await addDoc(collection(db, 'customers'), {
            name: customerName,
            type: voiceCustomerType === 'gst' ? 'business' : 'individual',
            gst_number: '',
            phone: '',
            email: '',
            billing_address: '',
            created_at: serverTimestamp()
          });
          finalCustomerId = newCustRef.id;
          console.log(`[QUOTATION] Auto-created new customer in Firestore: ${customerName} (${finalCustomerId})`);
        }
      } else {
        // Fallback placeholder customer
        finalCustomerId = `new_${Date.now()}`;
      }

      // Format items
      const formattedLines = (voiceItems || []).map(pItem => {
        const matchedProduct = products.find(prod => prod.name.toLowerCase().includes((pItem.description || '').toLowerCase()));
        return {
          description: pItem.description || matchedProduct?.name || 'Standard Product',
          quantity: pItem.quantity || 1,
          priceTier: (pItem.priceTier as 'retail'|'wholesale') || 'retail',
          rate: pItem.rate || (pItem.priceTier === 'wholesale' ? matchedProduct?.wholesale_price : matchedProduct?.retail_price) || 150,
          hsn_code: pItem.hsn_code || matchedProduct?.hsn_code || '',
          tax_percentage: pItem.tax_percentage || matchedProduct?.tax_percentage || 18,
        };
      });

      if (formattedLines.length === 0) {
        formattedLines.push({
          description: 'Standard Product',
          quantity: 1,
          priceTier: 'retail',
          rate: 150,
          hsn_code: '',
          tax_percentage: 18
        });
      }

      const createQuotationFn = httpsCallable(functions, 'createQuotation');
      const quotationData = {
        customer_id: finalCustomerId,
        customer_name: finalCustomerName,
        customer_type: voiceCustomerType || 'gst',
        status: 'draft',
        items: formattedLines,
        advance_amount: 0,
        advance_payment_method: '',
        advance_payment_date: '',
        advance_reference_number: '',
        payment_method_to_show: 'Bank Details',
      };

      console.log("[QUOTATION] Calling createQuotation function with payload:", quotationData);
      await createQuotationFn({ quotationData });
      console.log("[QUOTATION] Draft Creation Success");
      navigate('/quotations');
    } catch (error: any) {
      console.error("[QUOTATION] Draft Creation Failed", error);
      alert("Auto-creation of quotation draft failed: " + (error.message || String(error)));
    }
  };

  useEffect(() => {
    if (location.state?.voiceData && !loadingData && !id && customers.length > 0) {
      const { customerName, items: voiceItems, customerType: voiceCustomerType } = location.state.voiceData;
      console.log("[CreateQuotation] Received voice data for quotation draft creation:", { customerName, items: voiceItems, customerType: voiceCustomerType });
      
      // First, update the visual form state so the user sees it
      handleVoiceParsed(customerName, voiceItems, voiceCustomerType);
      
      // Auto-save the draft and navigate back
      autoSaveDraft(customerName, voiceItems, voiceCustomerType);
      
      // Clear state
      window.history.replaceState({}, '');
    }
  }, [location.state, loadingData, customers, products]);

  const addItem = () => setItems([...items, { description: '', hsn_code: '', quantity: 1, rate: 0, discount: 0, tax_percentage: companySettings?.defaultGst ?? 18, priceTier: 'retail' }]);
  
  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleVoiceParsed = (customerName: string | null, parsedItems: any[], voiceCustomerType?: 'gst' | 'non_gst') => {
    console.log("[QUOTATION] Form Autofill Started");
    console.log("[CreateQuotation] Auto-filling quotation fields from voice parsed data...");
    
    if (customerName && !selectedCustomerId && !selectedCustomerName) {
      const matched = customers.find(c => c.name.toLowerCase().includes(customerName.toLowerCase()));
      if (matched) {
        setSelectedCustomerId(matched.id);
        setSelectedCustomerName(matched.name);
        console.log(`[CreateQuotation] Customer auto-matched to: ${matched.name} (${matched.id})`);
      } else {
        setSelectedCustomerName(customerName);
        console.log(`[CreateQuotation] Customer name set to unmatched text: ${customerName}`);
      }
    }

    if (voiceCustomerType === 'gst' || voiceCustomerType === 'non_gst') {
      setCustomerType(voiceCustomerType);
      console.log(`[CreateQuotation] Customer type auto-set to: ${voiceCustomerType}`);
    }
    
    if (parsedItems && parsedItems.length > 0) {
      const newLines = parsedItems.map(pItem => {
        const matchedProduct = products.find(prod => prod.name.toLowerCase().includes((pItem.description || '').toLowerCase()));
        const rate = pItem.rate || (pItem.priceTier === 'wholesale' ? matchedProduct?.wholesale_price : matchedProduct?.retail_price) || 0;
        console.log(`[CreateQuotation] Processing line item: "${pItem.description}", matched product: "${matchedProduct?.name || 'none'}", quantity: ${pItem.quantity || 1}, rate: ${rate}`);
        
        return {
          description: pItem.description || matchedProduct?.name || '',
          quantity: pItem.quantity || 1,
          priceTier: (pItem.priceTier as 'retail'|'wholesale') || 'retail',
          rate: rate,
          hsn_code: pItem.hsn_code || matchedProduct?.hsn_code || '',
          tax_percentage: pItem.tax_percentage || matchedProduct?.tax_percentage || 18,
        };
      });
      
      if (items.length === 1 && !items[0].description) {
        setItems(newLines);
      } else {
        setItems([...items, ...newLines]);
      }
      console.log("[CreateQuotation] Added line items to draft:", newLines);
    }
    console.log("[QUOTATION] Form Autofill Complete");
  };

  const isIntraState = !customerState || !companySettings?.companyState || customerState.toLowerCase() === companySettings.companyState.toLowerCase();

  const calculateTotals = () => {
    let subtotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    let taxTotal = 0;
    let rawSubtotal = 0;
    
    const enrichedItems = items.map(item => {
      const lineTotal = (item.quantity || 0) * (item.rate || 0);
      rawSubtotal += lineTotal;
      const discountedLine = exactRound(lineTotal - (lineTotal * discountPercent) / 100);
      const taxAmount = customerType === 'non_gst' ? 0 : ((discountedLine * (item.tax_percentage || 0)) / 100);
      
      let cgst = 0, sgst = 0, igst = 0;
      if (customerType !== 'non_gst') {
        if (isIntraState) {
          cgst = exactRound(taxAmount / 2);
          sgst = exactRound(taxAmount / 2);
        } else {
          igst = exactRound(taxAmount);
        }
      }
      
      subtotal += discountedLine;
      cgstTotal += cgst;
      sgstTotal += sgst;
      igstTotal += igst;
      taxTotal += (cgst + sgst + igst);
      
      return {
        ...item,
        taxableAmount: exactRound(discountedLine),
        cgst,
        sgst,
        igst,
        taxAmount: exactRound(taxAmount),
        totalAmount: exactRound(discountedLine + taxAmount)
      };
    });

    const docDiscountAmount = exactRound((rawSubtotal * discountPercent) / 100);
    const charge = exactRound(chargeAmount || 0);
    const grandTotalExact = subtotal + taxTotal + charge;
    const finalGrandTotal = Math.round(grandTotalExact);

    return {
      enrichedItems,
      subtotal: exactRound(rawSubtotal),
      taxTotal: exactRound(taxTotal),
      cgstTotal: exactRound(cgstTotal),
      sgstTotal: exactRound(sgstTotal),
      igstTotal: exactRound(igstTotal),
      discountAmount: docDiscountAmount,
      chargeAmount: charge,
      roundOff: exactRound(finalGrandTotal - grandTotalExact),
      grandTotal: finalGrandTotal
    };
  };

  const { enrichedItems, ...totals } = calculateTotals();

  const handleSave = async (status: 'draft' | 'convert_requested' = 'draft') => {
    if (!selectedCustomerId || !auth?.currentUser || !functions) {
      alert("Please select a customer and ensure you are logged in.");
      return;
    }

    if (id) {
      const confirm = window.confirm("Are you sure you want to update this quotation?");
      if (!confirm) return;
      setIsSaving(true);
      try {
        await updateDoc(doc(db, 'quotations', id), {
          customer_id: selectedCustomerId || `new_${Date.now()}`,
          customer_name: selectedCustomerName,
          customer_address: customerAddress,
          customer_state: customerState,
          customer_gstin: customerGstin,
          customer_type: customerType,
          status: status,
          items: items,
          discount_percent: discountPercent,
          advance_amount: hasAdvance ? advanceAmount : 0,
          advance_payment_method: hasAdvance ? advancePaymentMethod : '',
          advance_payment_date: hasAdvance ? advancePaymentDate : '',
          advance_reference_number: hasAdvance ? advanceReferenceNumber : '',
          payment_method_to_show: hasAdvance ? (advancePaymentMethod === 'Cash' ? 'None' : (advancePaymentMethod === 'GPay' ? 'GPay Details' : (['UPI', 'PhonePe', 'Paytm'].includes(advancePaymentMethod) ? 'UPI Details' : 'Bank Details'))) : 'Bank Details',
          is_igst: !isIntraState,
          subtotal: totals.subtotal,
          tax_total: totals.taxTotal,
          cgst: totals.cgstTotal,
          sgst_igst: !isIntraState ? totals.igstTotal : (totals.cgstTotal + totals.sgstTotal),
          discount_amount: totals.discountAmount,
          charge_amount: totals.chargeAmount,
          round_off: totals.roundOff,
          grand_total: totals.grandTotal
        });
        navigate('/quotations');
      } catch (error) {
        console.error("Error updating quotation:", error);
        alert("Failed to update quotation.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    setIsSaving(true);
    try {
      const createQuotationFn = httpsCallable(functions, 'createQuotation');
      const quotationData = {
        customer_id: selectedCustomerId || `new_${Date.now()}`,
        customer_name: selectedCustomerName,
        customer_address: customerAddress,
        customer_state: customerState,
        customer_gstin: customerGstin,
        customer_type: customerType,
        status: status,
        items: items,
        discount_percent: discountPercent,
        charge_amount: chargeAmount,
        advance_amount: hasAdvance ? advanceAmount : 0,
        advance_payment_method: hasAdvance ? advancePaymentMethod : '',
        advance_payment_date: hasAdvance ? advancePaymentDate : '',
        advance_reference_number: hasAdvance ? advanceReferenceNumber : '',
        payment_method_to_show: hasAdvance ? (advancePaymentMethod === 'Cash' ? 'None' : (advancePaymentMethod === 'GPay' ? 'GPay Details' : (['UPI', 'PhonePe', 'Paytm'].includes(advancePaymentMethod) ? 'UPI Details' : 'Bank Details'))) : 'Bank Details',
        is_igst: !isIntraState,
      };

      await createQuotationFn({ quotationData });
      navigate('/quotations');
    } catch (error) {
      console.warn("Cloud function failed, attempting client-side save fallback:", error);
      try {
        const quotationData = {
          customer_id: selectedCustomerId || `new_${Date.now()}`,
          customer_name: selectedCustomerName,
          customer_address: customerAddress,
          customer_state: customerState,
          customer_gstin: customerGstin,
          customer_type: customerType,
          status: status,
          items: items,
          discount_percent: discountPercent,
          charge_amount: chargeAmount,
          advance_amount: hasAdvance ? advanceAmount : 0,
          advance_payment_method: hasAdvance ? advancePaymentMethod : '',
          advance_payment_date: hasAdvance ? advancePaymentDate : '',
          advance_reference_number: hasAdvance ? advanceReferenceNumber : '',
          payment_method_to_show: hasAdvance ? (advancePaymentMethod === 'Cash' ? 'None' : (advancePaymentMethod === 'GPay' ? 'GPay Details' : (['UPI', 'PhonePe', 'Paytm'].includes(advancePaymentMethod) ? 'UPI Details' : 'Bank Details'))) : 'Bank Details',
          is_igst: !isIntraState,
        };
        const { clientCreateQuotation } = await import('../utils/clientBillingCreator');
        await clientCreateQuotation(quotationData);
        navigate('/quotations');
      } catch (clientError) {
        console.error("Client-side fallback also failed:", clientError);
        alert("Failed to save quotation. Connection or Permission issue.");
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
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/quotations')} className="p-2 neo-btn !px-3 !py-2">
          <ArrowLeft size={20} className="text-secondary" />
        </button>
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">
              {id ? 'Edit Quotation' : 'Create Quotation'}
            </h1>
          </div>
          <p className="text-secondary mt-1">
            {id ? 'Update the details of the selected quotation.' : 'Draft a new quotation bound by FY sequencing rules.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="md:col-span-2 space-y-10">
          <div className="neo-card p-8 sm:p-10">
            <h3 className="mb-6">Customer Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <SearchableAutocomplete
                  label="Select Customer"
                  items={customers.map(c => ({ id: c.id, label: c.name, subLabel: c.gst_number || 'No GST' }))}
                  value={selectedCustomerName}
                  onSelect={(id: string, label: string) => {
                    setSelectedCustomerId(id);
                    setSelectedCustomerName(label);
                    const c = customers.find(x => x.id === id);
                    if (c) {
                      setCustomerAddress(c.billing_address || '');
                      setCustomerGstin(c.gst_number || '');
                    }
                  }}
                  onCustomChange={(val) => {
                    setSelectedCustomerId('');
                    setSelectedCustomerName(val);
                  }}
                  placeholder="Search customers..."
                />
                
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-secondary px-1">Customer Address</label>
                  <SpeechInput type="text" className="neo-input w-full text-sm" value={customerAddress} onChange={(e: any) => setCustomerAddress(e.target.value)} placeholder="Billing Address" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-secondary px-1">State</label>
                    <SpeechInput type="text" className="neo-input w-full text-sm" value={customerState} onChange={(e: any) => setCustomerState(e.target.value)} placeholder="e.g. Maharashtra" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-secondary px-1">GSTIN</label>
                    <SpeechInput type="text" className="neo-input w-full text-sm" value={customerGstin} onChange={(e: any) => setCustomerGstin(e.target.value)} placeholder="GST Number" />
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-primary-dark px-1">Customer Type</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="custType" checked={customerType === 'gst'} onChange={() => setCustomerType('gst')} className="accent-primary" />
                    GST Customer (Invoice)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="custType" checked={customerType === 'non_gst'} onChange={() => setCustomerType('non_gst')} className="accent-primary" />
                    Non-GST (Cash Memo)
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="neo-card p-8 sm:p-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h3 className="mb-0">Line Items</h3>
              <div className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary-dark font-medium border border-primary/20">
                {isIntraState ? "Intra-state sale: CGST + SGST applied" : "Inter-state sale: IGST applied"}
              </div>
            </div>
            <div className="overflow-x-auto pb-4">
              <div className="min-w-[700px] space-y-4">
                <div className="flex gap-4 px-4 text-xs font-semibold text-primary-dark uppercase tracking-wide">
                  <div className="flex-1 min-w-[200px]">Product & Description</div>
                  <div className="w-[100px]">HSN/SAC</div>
                  <div className="w-[80px]">Qty</div>
                  <div className="w-[100px]">Rate</div>
                  <div className="w-[100px]">Total</div>
                  <div className="w-[42px]"></div>
                </div>

                {enrichedItems.map((item, index) => (
                  <div key={index} className="flex gap-4 items-center bg-surface border border-shadow-darker/10 p-4 rounded-xl shadow-sm relative group transition-all hover:shadow-md">
                    <div className="flex-1 min-w-[200px] space-y-2">
                      <SearchableAutocomplete
                        items={products.map(p => ({ 
                          id: p.id, 
                          label: p.name, 
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
                            tax_percentage: product?.tax_percentage || newItems[index].tax_percentage || companySettings?.defaultGst || 18,
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
                        placeholder="Product description..."
                      />
                    </div>
                    
                    <div className="w-[100px]">
                      <input 
                        type="text" 
                        className="neo-input w-full text-sm" 
                        placeholder="HSN" 
                        value={item.hsn_code}
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[index].hsn_code = e.target.value;
                          setItems(newItems);
                        }}
                      />
                    </div>

                    <div className="w-[80px]">
                      <input 
                        type="number" 
                        className="neo-input w-full font-bold text-sm" 
                        placeholder="1" 
                        value={item.quantity} 
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[index].quantity = parseInt(e.target.value) || 0;
                          setItems(newItems);
                        }} 
                      />
                    </div>

                    <div className="w-[100px]">
                      <input 
                        type="number" 
                        className="neo-input w-full font-mono text-primary-dark text-sm" 
                        placeholder="0.00" 
                        value={item.rate || ''} 
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[index].rate = parseFloat(e.target.value) || 0;
                          setItems(newItems);
                        }} 
                      />
                    </div>



                    <div className="w-[100px] font-mono font-bold text-sm text-primary-dark bg-primary/5 p-2 rounded-lg border border-primary/20">
                      ₹{((item.quantity || 0) * (item.rate || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    <div className="w-[42px]">
                      <button onClick={() => removeItem(index)} className="p-2 neo-btn !px-3 !py-2 text-error h-[42px] hover:bg-error/10">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <button onClick={addItem} className="neo-btn mt-6 flex items-center gap-2 text-sm text-secondary hover:text-primary-dark">
              <Plus size={16} /> Add Item
            </button>
          </div>
        </div>

        <div className="space-y-10">
          <div className="neo-card p-8 sm:p-10">
            <div className="flex items-center gap-2 mb-8"><Calculator size={18}/> Summary</div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-secondary">
                <span>Subtotal</span>
                <span className="font-semibold text-primary-dark">₹ {totals.subtotal.toLocaleString()}</span>
              </div>

              {/* Document-level Discount */}
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
                  <span>Discount ({discountPercent}%)</span>
                  <span className="font-semibold">- ₹ {totals.discountAmount.toLocaleString()}</span>
                </div>
              )}

              {customerType !== 'non_gst' && (
                isIntraState ? (
                  <>
                    <div className="flex justify-between text-secondary">
                      <span>CGST</span>
                      <span className="font-semibold text-primary-dark">₹ {totals.cgstTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-secondary">
                      <span>SGST</span>
                      <span className="font-semibold text-primary-dark">₹ {totals.sgstTotal.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-secondary">
                    <span>IGST</span>
                    <span className="font-semibold text-primary-dark">₹ {totals.igstTotal.toLocaleString()}</span>
                  </div>
                )
              )}

              {/* Charge */}
              <div className="flex justify-between items-center gap-2">
                <label className="text-secondary shrink-0">Design Charge</label>
                <SpeechInput
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
                  <span className="font-semibold">+ ₹ {totals.chargeAmount.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between text-secondary">
                <span>Round-off</span>
                <span className="font-semibold text-primary-dark">₹ {totals.roundOff.toFixed(2)}</span>
              </div>
              <div className="h-px bg-shadow-darker/20 my-2"></div>
              <div className="flex justify-between text-lg">
                <span className="font-bold text-primary-dark">Grand Total</span>
                <span className="font-bold text-primary-dark">₹ {totals.grandTotal.toLocaleString()}</span>
              </div>
              <div className="h-px bg-shadow-darker/20 my-4"></div>
              <div className="flex items-center justify-between mt-4 mb-2">
                <h4 className="font-semibold text-primary-dark text-sm">Advance Payment</h4>
                <button 
                  type="button"
                  onClick={() => {
                    if (hasAdvance) {
                      setAdvanceAmount(0);
                    }
                    setHasAdvance(!hasAdvance);
                  }}
                  className={`w-12 h-6 rounded-full transition-all relative ${hasAdvance ? 'bg-primary shadow-neo-inset' : 'bg-shadow-darker/20'}`}
                >
                  <div className={`absolute top-1 bottom-1 w-4 bg-surface rounded-full transition-all ${hasAdvance ? 'right-1' : 'left-1 shadow-neo-raised'}`} />
                </button>
              </div>

              {hasAdvance && (
                <div className="space-y-3 animate-fade-in">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-secondary px-1">Amount</label>
                    <SpeechInput 
                      type="number" 
                      className="neo-input w-full" 
                      value={advanceAmount === 0 ? '0' : (advanceAmount || '')} 
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setAdvanceAmount(isNaN(val) ? 0 : val);
                      }} 
                      max={totals.grandTotal} 
                    />
                  </div>
                  <div className="space-y-3 mt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-secondary px-1">Method</label>
                        <select 
                          className="neo-input w-full text-xs" 
                          value={advancePaymentMethod} 
                          onChange={(e) => setAdvancePaymentMethod(e.target.value)}
                        >
                          <option value="Cash">Cash</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="UPI">UPI</option>
                          <option value="GPay">GPay</option>
                          <option value="PhonePe">PhonePe</option>
                          <option value="Paytm">Paytm</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-secondary px-1">Date</label>
                        <input 
                          type="date" 
                          className="neo-input w-full text-xs" 
                          value={advancePaymentDate} 
                          onChange={(e) => setAdvancePaymentDate(e.target.value)} 
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-secondary px-1">Ref Number (Optional)</label>
                      <SpeechInput 
                        type="text" 
                        className="neo-input w-full" 
                        placeholder="Transaction ID, Cheque No..." 
                        value={advanceReferenceNumber} 
                        onChange={(e) => setAdvanceReferenceNumber(e.target.value)} 
                      />
                    </div>
                    <div className="h-px bg-shadow-darker/20 my-4"></div>
                    <div className="flex justify-between text-lg mt-4">
                      <span className="font-bold text-primary-dark">Balance</span>
                      <span className="font-bold text-error">₹ {Math.max(0, totals.grandTotal - advanceAmount).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>



          <div className="neo-card p-4 space-y-3">
            <button 
              disabled={isSaving}
              onClick={() => handleSave('draft')}
              className="neo-btn w-full py-3 flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : "Save Draft"}
            </button>
            <button 
              disabled={isSaving}
              onClick={() => handleSave('convert_requested')}
              className="neo-btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : (id ? 'Update Quotation' : 'Request Conversion')}
              {!isSaving && <Sparkles size={18}/>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

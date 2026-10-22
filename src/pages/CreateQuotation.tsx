import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Calculator, Sparkles, Loader2 } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth, functions } from '../lib/firebase';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Customer, Product, LineItem } from '../types';
import SearchableAutocomplete from '../components/Billing/SearchableAutocomplete';
import { DiscountSelector } from '../components/Billing/DiscountSelector';
import SpeechInput from '../components/Shared/SpeechInput';
import { useSettings } from '../contexts/SettingsContext';
import { getNextProposedNumber } from '../utils/numberGenerator';


const exactRound = (num: number) => Math.round(num * 100) / 100;
const formatINR = (val: number) => (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    { description: '', desc: '', hsn_code: '', quantity: 1, rate: 0, discount: 0, tax_percentage: 18, priceTier: 'retail', unit: 'Pcs' }
  ]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [documentNumber, setDocumentNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0]);
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
            setDocumentNumber(data.number || '');
            setQuotationDate(data.custom_date || data.date || new Date().toISOString().split('T')[0]);
          }
        } else {
          // Auto-generate proposed quotation number based on settings
          try {
            const proposed = await getNextProposedNumber('quotations', 'quotation', companySettings, quotationDate);
            setDocumentNumber(proposed);
          } catch (numErr) {
            console.warn("Could not generate proposed quotation number:", numErr);
          }

          // Check if prefilled from lead URL query parameters
          const searchParams = new URLSearchParams(location.search);
          const urlName = searchParams.get('name');
          const urlPhone = searchParams.get('phone');
          const urlCompany = searchParams.get('company');
          
          const prefillData = location.state?.prefillData;

          if (prefillData) {
            if (prefillData.customerSearch) {
              const matched = loadedCustomers.find(c => c.name.toLowerCase().includes(prefillData.customerSearch.toLowerCase()));
              if (matched) {
                setSelectedCustomerId(matched.id);
                setSelectedCustomerName(matched.name);
                setCustomerType(matched.type === 'business' ? 'gst' : 'non_gst');
                setCustomerAddress(matched.billing_address || '');
                setCustomerState((matched as any).state || '');
                setCustomerGstin(matched.gst_number || '');
              }
            }
            if (prefillData.items && prefillData.items.length > 0) {
              const newItems = prefillData.items.map((pi: any) => {
                const matchedItem = allProducts.find(p => p.name.toLowerCase().includes(pi.productSearch.toLowerCase()));
                if (matchedItem) {
                  return {
                    description: matchedItem.name,
                    desc: matchedItem.name,
                    hsn_code: matchedItem.hsn_code || '',
                    quantity: pi.quantity || 1,
                    rate: matchedItem.retail_price || 0,
                    discount: 0,
                    tax_percentage: matchedItem.tax_percentage || 18,
                    priceTier: 'retail',
                    unit: matchedItem.unit || 'Pcs'
                  };
                }
                return { description: pi.productSearch, desc: pi.productSearch, hsn_code: '', quantity: pi.quantity || 1, rate: 0, discount: 0, tax_percentage: 18, priceTier: 'retail', unit: 'Pcs' };
              });
              setItems(newItems);
            }
          } else if (urlName) {
            const matched = loadedCustomers.find(
              c => c.name.toLowerCase() === urlName.toLowerCase() || (urlPhone && c.phone === urlPhone)
            );
            if (matched) {
              setSelectedCustomerId(matched.id);
              setSelectedCustomerName(matched.name);
              if (matched.billing_address) setCustomerAddress(matched.billing_address);
              if (matched.gst_number) setCustomerGstin(matched.gst_number);
            } else {
              setSelectedCustomerName(urlName);
              if (urlCompany) setCustomerAddress(urlCompany);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching library data:", error);
      } finally {
        setLoadingData(false);
      }
    }
    fetchData();
  }, [id, location.search, companySettings?.quotation_prefix, companySettings?.quotation_format, companySettings?.quotation_year, companySettings?.quotation_next_number]);

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
          unit: pItem.unit || matchedProduct?.unit || 'Pcs'
        };
      });

      if (formattedLines.length === 0) {
        formattedLines.push({
          description: 'Standard Product',
          quantity: 1,
          priceTier: 'retail',
          rate: 150,
          hsn_code: '',
          tax_percentage: 18,
          unit: 'Pcs'
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

  const addItem = () => setItems([...items, { description: '', desc: '', hsn_code: '', quantity: 1, rate: 0, discount: 0, tax_percentage: companySettings?.defaultGst ?? 18, priceTier: 'retail', unit: 'Pcs' }]);
  
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
          unit: pItem.unit || matchedProduct?.unit || 'Pcs'
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
    const grandTotalExact = exactRound(subtotal + taxTotal + charge);
    const finalGrandTotal = grandTotalExact;

    return {
      enrichedItems,
      subtotal: exactRound(rawSubtotal),
      taxTotal: exactRound(taxTotal),
      cgstTotal: exactRound(cgstTotal),
      sgstTotal: exactRound(sgstTotal),
      igstTotal: exactRound(igstTotal),
      discountAmount: docDiscountAmount,
      chargeAmount: charge,
      roundOff: 0,
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
          number: documentNumber || undefined,
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
          grand_total: totals.grandTotal,
          custom_date: quotationDate
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
        number: documentNumber || undefined,
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
        custom_date: quotationDate,
      };

      await createQuotationFn({ quotationData });
      navigate('/quotations');
    } catch (error) {
      console.warn("Cloud function failed, attempting client-side save fallback:", error);
      try {
        const quotationData = {
          number: documentNumber || undefined,
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
          custom_date: quotationDate,
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
    <div className="space-y-4 animate-fade-in w-full max-w-[1440px] mx-auto px-2 sm:px-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/quotations')} className="p-2 neo-btn !px-3 !py-2">
          <ArrowLeft size={18} className="text-secondary" />
        </button>
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-primary-dark">
              {id ? 'Edit Quotation' : 'Create Quotation'}
            </h1>
          </div>
          <p className="text-xs text-secondary mt-0.5">
            {id ? 'Update the details of the selected quotation.' : 'Draft a new quotation bound by FY sequencing rules.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-4">
          <div className="neo-card p-4 sm:p-5">
            <h3 className="mb-3 text-base font-bold">Customer Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="space-y-1">
                <label className="text-sm font-semibold text-primary-dark px-1 flex items-center justify-between">
                  <span>Quotation No</span>
                  <span className="text-xs text-primary font-normal">Editable</span>
                </label>
                <SpeechInput 
                  type="text" 
                  className="neo-input w-full font-mono text-primary-dark font-bold text-sm bg-transparent" 
                  placeholder="e.g. QTN/25/26/0001" 
                  value={documentNumber} 
                  onChange={(e: any) => setDocumentNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-primary-dark px-1">Quotation Date</label>
                <input type="date" className="neo-input w-full" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="neo-card p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
              <h3 className="mb-0 text-base font-bold flex items-center gap-2">
                <span>Line Items</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {enrichedItems.length} {enrichedItems.length === 1 ? 'item' : 'items'}
                </span>
              </h3>
              <div className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary-dark font-medium border border-primary/20">
                {isIntraState ? "Intra-state sale: CGST + SGST applied" : "Inter-state sale: IGST applied"}
              </div>
            </div>
            <div className="space-y-2.5">

              {enrichedItems.map((item, index) => {
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
                          placeholder="Search product from catalog or enter name..."
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
            <div className="flex items-center gap-2 mb-3 text-base font-bold"><Calculator size={16}/> Summary</div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-secondary">
                <span>Subtotal</span>
                <span className="font-semibold text-primary-dark font-mono">₹ {formatINR(totals.subtotal)}</span>
              </div>

              {/* Document-level Discount */}
              <div className="flex justify-between items-start gap-2">
                <label className="text-secondary shrink-0 pt-1">Discount</label>
                <DiscountSelector
                  discountPercent={discountPercent}
                  onChange={setDiscountPercent}
                  subtotal={totals.subtotal}
                />
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

              {customerType !== 'non_gst' && (
                isIntraState ? (
                  <>
                    <div className="flex justify-between text-secondary">
                      <span>CGST</span>
                      <span className="font-semibold text-primary-dark font-mono">₹ {formatINR(totals.cgstTotal)}</span>
                    </div>
                    <div className="flex justify-between text-secondary">
                      <span>SGST</span>
                      <span className="font-semibold text-primary-dark font-mono">₹ {formatINR(totals.sgstTotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-secondary">
                    <span>IGST</span>
                    <span className="font-semibold text-primary-dark font-mono">₹ {formatINR(totals.igstTotal)}</span>
                  </div>
                )
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
                  <div className={`absolute top-1 bottom-1 w-4 bg-transparent rounded-full transition-all ${hasAdvance ? 'right-1' : 'left-1 shadow-neo-raised'}`} />
                </button>
              </div>

              {hasAdvance && (
                <div className="space-y-3 animate-fade-in">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-secondary px-1">Amount</label>
                    <input 
                      type="number" 
                      className="neo-input w-full font-mono font-semibold" 
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
              )}
            </div>
          </div>



          <div className="neo-card p-3 space-y-2.5">
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


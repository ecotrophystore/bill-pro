import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Calculator, Sparkles, Loader2, ShieldCheck, User } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, auth, functions } from '../lib/firebase';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Customer, Product, LineItem } from '../types';
import SearchableAutocomplete from '../components/Billing/SearchableAutocomplete';
import VoiceDictation from '../components/VoiceDictation';

const exactRound = (num: number) => Math.round(num * 100) / 100;

export default function CreateCashMemo() {
  const navigate = useNavigate();
  const location = useLocation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [isWalkIn, setIsWalkIn] = useState(true);
  const [walkInName, setWalkInName] = useState('Walk-in Customer');
  const [items, setItems] = useState<(Partial<LineItem> & { priceTier?: 'retail' | 'wholesale' })[]>([
    { description: '', hsn_code: '', quantity: 1, rate: 0, tax_percentage: 0, priceTier: 'retail' }
  ]);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState('Cash');
  const [advancePaymentDate, setAdvancePaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [advanceReferenceNumber, setAdvanceReferenceNumber] = useState('');
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
          const cmDoc = await getDoc(doc(db, 'cash_memos', id));
          if (cmDoc.exists()) {
            const data = cmDoc.data();
            setIsWalkIn(data.customer_id === null || data.customer_id === undefined || data.customer_id === 'walk_in');
            setSelectedCustomerId(data.customer_id || '');
            setSelectedCustomerName(data.customer_name);
            setItems(data.items || []);
            setAdvanceAmount(data.advance_amount || 0);
            setAdvancePaymentMethod(data.advance_payment_method || 'Cash');
            setAdvancePaymentDate(data.advance_payment_date || new Date().toISOString().split('T')[0]);
            setAdvanceReferenceNumber(data.advance_reference_number || '');
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

  useEffect(() => {
    if (location.state?.voiceData && !loadingData && !id && customers.length > 0) {
      const { customerName, items: voiceItems } = location.state.voiceData;
      handleVoiceParsed(customerName, voiceItems);
      // Clear state
      window.history.replaceState({}, '');
    }
  }, [location.state, loadingData, customers, products]);

  const addItem = () => setItems([...items, { description: '', hsn_code: '', quantity: 1, rate: 0, tax_percentage: 0, priceTier: 'retail' }]);
  
  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleVoiceParsed = (customerName: string | null, parsedItems: any[]) => {
    if (customerName && !selectedCustomerId && !selectedCustomerName && !isWalkIn) {
      const matched = customers.find(c => c.name.toLowerCase().includes(customerName.toLowerCase()));
      if (matched) {
        setSelectedCustomerId(matched.id);
        setSelectedCustomerName(matched.name);
      } else {
        setSelectedCustomerName(customerName);
      }
    } else if (customerName && isWalkIn) {
      setWalkInName(customerName);
    }
    
    if (parsedItems && parsedItems.length > 0) {
      const newLines = parsedItems.map(pItem => {
        const matchedProduct = products.find(prod => prod.name.toLowerCase().includes((pItem.description || '').toLowerCase()));
        return {
          description: pItem.description || matchedProduct?.name || '',
          quantity: pItem.quantity || 1,
          priceTier: (pItem.priceTier as 'retail'|'wholesale') || 'retail',
          rate: pItem.rate || (pItem.priceTier === 'wholesale' ? matchedProduct?.wholesale_price : matchedProduct?.retail_price) || 0,
          hsn_code: pItem.hsn_code || matchedProduct?.hsn_code || '',
          tax_percentage: 0, // Cash Memo enforces 0
        };
      });
      
      if (items.length === 1 && !items[0].description) {
        setItems(newLines);
      } else {
        setItems([...items, ...newLines]);
      }
    }
  };

  const calculateTotals = () => {
    let subtotal = 0;
    items.forEach(item => {
      const lineTotal = (item.quantity || 0) * (item.rate || 0);
      subtotal += exactRound(lineTotal);
    });

    const finalGrandTotal = Math.round(subtotal);
    return {
      subtotal: exactRound(subtotal),
      roundOff: exactRound(finalGrandTotal - subtotal),
      grandTotal: finalGrandTotal
    };
  };

  const totals = calculateTotals();

  const handleGenerateMemo = async () => {
    if (!isWalkIn && !selectedCustomerId && !selectedCustomerName) {
      alert("Please select a customer.");
      return;
    }
    if (!auth?.currentUser || !functions) {
      alert("System connectivity error. Please refresh.");
      return;
    }

    if (id) {
      const confirm = window.confirm("Are you sure you want to update this cash memo?");
      if (!confirm) return;
      setIsSaving(true);
      try {
        await updateDoc(doc(db, 'cash_memos', id), {
          customer_id: isWalkIn ? null : selectedCustomerId,
          customer_name: selectedCustomerName,
          items: items,
          advance_amount: advanceAmount,
          advance_payment_method: advancePaymentMethod,
          advance_payment_date: advancePaymentDate,
          advance_reference_number: advanceReferenceNumber,
          balance_amount: Math.max(0, totals.grandTotal - advanceAmount),
          ...totals
        });
        navigate('/cash-memos');
      } catch (error) {
        console.error("Error updating cash memo:", error);
        alert("Failed to update cash memo.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const confirm = window.confirm("Final check: Generate non-GST Cash Memo? This will be locked immediately.");
    if (!confirm) return;

    setIsSaving(true);
    try {
      const createCashMemoFn = httpsCallable(functions, 'createCashMemo');
      const memoData = {
        customer_id: isWalkIn ? 'walk_in' : (selectedCustomerId || null),
        customer_name: isWalkIn ? walkInName : selectedCustomerName,
        walk_in_customer: isWalkIn,
        items: items.map(it => ({ ...it, tax_percentage: 0 })),
        advance_amount: advanceAmount,
        advance_payment_method: advancePaymentMethod,
        advance_payment_date: advancePaymentDate,
        advance_reference_number: advanceReferenceNumber,
        balance_amount: Math.max(0, totals.grandTotal - advanceAmount),
      };

      await createCashMemoFn({ memoData });
      navigate('/cash-memos');
    } catch (error) {
      console.error("Error creating memo:", error);
      alert("Failed to create memo. Unauthorized or sequence error.");
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
        <button onClick={() => navigate('/cash-memos')} className="p-2 neo-btn !px-3 !py-2">
          <ArrowLeft size={20} className="text-secondary" />
        </button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">
            {id ? 'Edit Cash Memo' : 'New Cash Memo'}
          </h1>
          <p className="text-secondary mt-1">
            {id ? 'Update the details of the selected cash memo.' : 'Choice 1a: Generating memo with MEMO/ sequence. Choice 3b: GST set to 0%.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="md:col-span-2 space-y-10">
          <div className="neo-card p-8 sm:p-10">
            <h3 className="mb-6 flex items-center gap-2 text-primary-dark"><User size={18}/> Profile Details</h3>
            <div className="flex items-center gap-2 mb-6 bg-primary-light/30 p-3 rounded-xl border border-primary/10">
               <input 
                 type="checkbox" 
                 id="walkin" 
                 className="rounded text-primary focus:ring-primary h-5 w-5 border-shadow-darker/20" 
                 checked={isWalkIn} 
                 onChange={e => setIsWalkIn(e.target.checked)} 
               />
               <label htmlFor="walkin" className="text-sm font-bold text-primary-dark cursor-pointer">Walk-in Customer</label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {isWalkIn ? (
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-primary-dark px-1">Customer Display Name</label>
                  <input 
                    type="text" 
                    className="neo-input w-full" 
                    placeholder="Enter name for memo..."
                    value={walkInName}
                    onChange={e => setWalkInName(e.target.value)}
                  />
                </div>
              ) : (
                <SearchableAutocomplete
                  label="Select Profile"
                  items={customers.map(c => ({ id: c.id, label: c.name, subLabel: c.phone || 'No Phone' }))}
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
              )}
              <div className="space-y-1">
                <label className="text-sm font-semibold text-primary-dark px-1">Date</label>
                <input type="date" className="neo-input w-full" defaultValue={new Date().toISOString().split('T')[0]} readOnly />
              </div>
            </div>
          </div>

          <div className="neo-card p-8 sm:p-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h3 className="mb-0">Line Items</h3>
              <VoiceDictation onParsedItems={handleVoiceParsed} />
            </div>
            <div className="space-y-8">
              {items.map((item: any, index: number) => (
                <div key={index} className="flex flex-col sm:flex-row gap-4 items-end bg-surface border border-shadow-darker/10 p-6 rounded-2xl shadow-sm relative group transition-all hover:shadow-md">
                  <div className="flex-[2] space-y-1 w-full">
                    {index === 0 && <label className="text-sm font-semibold text-primary-dark px-1 hidden sm:block">Description</label>}
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
                      placeholder="Product or Service..."
                    />
                  </div>
                  <div className="w-full sm:w-28 space-y-1">
                    {index === 0 && <label className="text-sm font-semibold text-primary-dark px-1 hidden sm:block">Price Tier</label>}
                    <select 
                      className="neo-input w-full bg-surface text-xs"
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
                      <option value="retail">Retail</option>
                      <option value="wholesale">Wholesale</option>
                    </select>
                  </div>
                  <div className="w-full sm:w-20 space-y-1">
                    {index === 0 && <label className="text-sm font-semibold text-primary-dark px-1 hidden sm:block">Qty</label>}
                    <input 
                      type="number" 
                      className="neo-input w-full font-bold" 
                      placeholder="1" 
                      value={item.quantity} 
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[index].quantity = parseInt(e.target.value) || 0;
                        setItems(newItems);
                      }} 
                    />
                  </div>
                  <div className="w-full sm:w-28 space-y-1">
                    {index === 0 && <label className="text-sm font-semibold text-primary-dark px-1 hidden sm:block">Rate</label>}
                    <input 
                      type="number" 
                      className="neo-input w-full font-mono text-primary-dark" 
                      placeholder="0.00" 
                      value={item.rate || ''} 
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[index].rate = parseFloat(e.target.value) || 0;
                        setItems(newItems);
                      }} 
                    />
                  </div>
                  <div className="w-full sm:w-28 space-y-1">
                    {index === 0 && <label className="text-sm font-semibold text-primary-dark px-1 hidden sm:block">Total</label>}
                    <div className="neo-input w-full bg-shadow-darker/5 text-right font-semibold">
                       ₹ {((item.quantity || 0) * (item.rate || 0)).toLocaleString()}
                    </div>
                  </div>
                  <button onClick={() => removeItem(index)} className="p-2 neo-btn !px-3 !py-2 text-error h-[42px] mb-[2px]">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
            
            <button onClick={addItem} className="neo-btn mt-6 flex items-center gap-2 text-sm text-secondary hover:text-primary-dark">
              <Plus size={16} /> Add New Row
            </button>
          </div>
        </div>

        <div className="space-y-10">
          <div className="neo-card p-8 sm:p-10">
            <h3 className="mb-8 flex items-center gap-2"><Calculator size={18}/> Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-secondary">
                <span>Subtotal</span>
                <span className="font-semibold text-primary-dark">₹ {totals.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-secondary italic">
                <span>Tax (GST 0%)</span>
                <span className="text-secondary/50">₹ 0.00</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Round-off</span>
                <span className="font-semibold text-primary-dark">₹ {totals.roundOff.toFixed(2)}</span>
              </div>
              <div className="h-px bg-shadow-darker/20 my-2"></div>
              <div className="flex justify-between text-xl">
                <span className="font-bold text-primary-dark">Grand Total</span>
                <span className="font-bold text-primary-dark text-primary">₹ {totals.grandTotal.toLocaleString()}</span>
              </div>
              <div className="h-px bg-shadow-darker/20 my-4"></div>
              <h4 className="font-semibold text-primary-dark mb-4 text-sm mt-4">Advance Payment</h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-secondary px-1">Amount</label>
                  <input type="number" className="neo-input w-full" value={advanceAmount || ''} onChange={(e) => setAdvanceAmount(parseFloat(e.target.value) || 0)} max={totals.grandTotal} />
                </div>
                <div className="animate-fade-in space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-secondary px-1">Method</label>
                      <select className="neo-input w-full text-xs" value={advancePaymentMethod} onChange={(e) => setAdvancePaymentMethod(e.target.value)}>
                        <option value="Cash">Cash</option>
                        <option value="GPay">GPay</option>
                        <option value="PhonePe">PhonePe</option>
                        <option value="Paytm">Paytm</option>
                        <option value="UPI">UPI</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-secondary px-1">Date</label>
                      <input type="date" className="neo-input w-full text-xs" value={advancePaymentDate} onChange={(e) => setAdvancePaymentDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-secondary px-1">Ref Number</label>
                    <input type="text" className="neo-input w-full" placeholder="Optional" value={advanceReferenceNumber} onChange={(e) => setAdvanceReferenceNumber(e.target.value)} />
                  </div>
                  <div className="h-px bg-shadow-darker/20 my-4"></div>
                  <div className="flex justify-between text-lg mt-4">
                    <span className="font-bold text-primary-dark">Balance</span>
                    <span className="font-bold text-error">₹ {Math.max(0, totals.grandTotal - advanceAmount).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="neo-card p-4 space-y-3 shadow-neo-raised border border-primary/10">
            <div className="bg-primary/5 text-primary-dark px-3 py-2 rounded-lg text-sm border border-primary/10 mb-4 flex gap-2 items-start">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
              <span>{id ? 'Editing existing document.' : 'Choice 1a enabled. This document will utilize the <strong>MEMO/</strong> sequence.'}</span>
            </div>
            <button 
                className="w-full neo-btn-primary flex justify-center items-center gap-2"
                onClick={handleGenerateMemo}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {isSaving ? (id ? 'Updating...' : 'Generating...') : (id ? 'Update Cash Memo' : 'Generate Cash Memo')}
              </button>
          </div>
        </div>
      </div>
    </div>
  );
}

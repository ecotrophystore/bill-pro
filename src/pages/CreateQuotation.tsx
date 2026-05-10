import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Calculator, Sparkles, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, auth, functions } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Customer, Product, LineItem } from '../types';
import SearchableAutocomplete from '../components/Billing/SearchableAutocomplete';
import { useToast } from '../components/Shared/Toast';
import { useVoiceForm } from '../contexts/VoiceFormContext';

const exactRound = (num: number) => Math.round(num * 100) / 100;

export default function CreateQuotation() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [items, setItems] = useState<(Partial<LineItem> & { priceTier?: 'retail' | 'wholesale' })[]>([
    { description: '', hsn_code: '', quantity: 1, rate: 0, tax_percentage: 18, priceTier: 'retail' }
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!db) return;
      try {
        const [custSnap, prodSnap] = await Promise.all([
          getDocs(collection(db, 'customers')),
          getDocs(collection(db, 'products'))
        ]);
        setCustomers(custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
        setProducts(prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      } catch (error) {
        console.error("Error fetching library data:", error);
      } finally {
        setLoadingData(false);
      }
    }
    fetchData();
  }, []);

  const addItem = () => setItems([...items, { description: '', hsn_code: '', quantity: 1, rate: 0, tax_percentage: 18, priceTier: 'retail' }]);
  
  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };
  const { lastAction, clearLastAction, confirmationRequested, setConfirmationRequested } = useVoiceForm();

  // Listen to Magic Form Fill from Voice AI
  useEffect(() => {
    if (lastAction && window.location.pathname.includes('/quotations/new')) {
      const { fieldName, value } = lastAction;
      
      if (fieldName === 'customerName') {
        setSelectedCustomerName(value);
        const customer = customers.find(c => c.name.toLowerCase() === value.toLowerCase());
        if (customer) setSelectedCustomerId(customer.id);
      } else if (fieldName === 'productName') {
        const newItems = [...items];
        newItems[newItems.length - 1].description = value;
        const product = products.find(p => p.name.toLowerCase() === value.toLowerCase());
        if (product) {
          newItems[newItems.length - 1].hsn_code = product.hsn_code;
          newItems[newItems.length - 1].tax_percentage = product.tax_percentage || 18;
          newItems[newItems.length - 1].rate = product.retail_price;
        }
        setItems(newItems);
      } else if (fieldName === 'quantity') {
        const newItems = [...items];
        newItems[newItems.length - 1].quantity = Number(value) || 1;
        setItems(newItems);
      } else if (fieldName === 'price') {
        const newItems = [...items];
        newItems[newItems.length - 1].rate = Number(value) || 0;
        setItems(newItems);
      } else if (fieldName === 'hsn') {
        const newItems = [...items];
        newItems[newItems.length - 1].hsn_code = value;
        setItems(newItems);
      } else if (fieldName === 'gst') {
        const newItems = [...items];
        newItems[newItems.length - 1].tax_percentage = Number(value) || 18;
        setItems(newItems);
      }

      clearLastAction();
    }
  }, [lastAction, customers, products, items]);

  // Clean up confirmation on unmount
  useEffect(() => {
    return () => setConfirmationRequested(false);
  }, []);

  const calculateTotals = () => {
    let subtotal = 0;
    let taxTotal = 0;
    
    items.forEach(item => {
      const lineTotal = (item.quantity || 0) * (item.rate || 0);
      const taxAmount = (lineTotal * (item.tax_percentage || 0)) / 100;
      subtotal += exactRound(lineTotal);
      taxTotal += exactRound(taxAmount);
    });

    const grandTotalExact = subtotal + taxTotal;
    const finalGrandTotal = Math.round(grandTotalExact);

    return {
      subtotal: exactRound(subtotal),
      taxTotal: exactRound(taxTotal),
      roundOff: exactRound(finalGrandTotal - grandTotalExact),
      grandTotal: finalGrandTotal
    };
  };

  const totals = calculateTotals();

  const handleSave = async (_status: 'draft' | 'convert_requested' = 'draft') => {
    if (!selectedCustomerId || !auth?.currentUser || !functions) {
      showToast('Please select a customer and ensure you are logged in.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const createQuotationFn = httpsCallable(functions, 'createQuotation');
      const quotationData = {
        customer_id: selectedCustomerId || `new_${Date.now()}`,
        customer_name: selectedCustomerName,
        items: items,
        status: 'draft'
      };

      await createQuotationFn({ quotationData });
      navigate('/quotations');
    } catch (error) {
      console.error("Error saving quotation:", error);
      showToast('Failed to save quotation.', 'error');
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
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Create Quotation</h1>
          <p className="text-secondary mt-1">Draft a new quotation bound by FY sequencing rules.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="neo-card">
            <h3 className="mb-4">Customer Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <SearchableAutocomplete
                  label="Select Customer"
                  items={customers.map(c => ({ id: c.id, label: c.name, subLabel: c.gst_number || 'No GST' }))}
                  value={selectedCustomerId}
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
                <label className="text-sm font-semibold text-primary-dark px-1">Date</label>
                <input type="date" className="neo-input w-full" defaultValue={new Date().toISOString().split('T')[0]} />
              </div>
            </div>
          </div>

          <div className="neo-card">
            <h3 className="mb-4">Line Items</h3>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="flex flex-col sm:flex-row gap-3 items-end border-b sm:border-0 border-shadow-darker/10 pb-4 sm:pb-0">
                  <div className="flex-[2] space-y-1 w-full">
                    {index === 0 && <label className="text-sm font-semibold text-primary-dark px-1 hidden sm:block">Product & Description</label>}
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
                      placeholder="Product description..."
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
                  <div className="w-full sm:w-24 space-y-1">
                    {index === 0 && <label className="text-sm font-semibold text-primary-dark px-1 hidden sm:block">HSN</label>}
                    <input 
                      type="text" 
                      className="neo-input w-full" 
                      placeholder="HSN" 
                      value={item.hsn_code}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[index].hsn_code = e.target.value;
                        setItems(newItems);
                      }}
                    />
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
                  <div className="w-full sm:w-24 space-y-1">
                    {index === 0 && <label className="text-sm font-semibold text-primary-dark px-1 hidden sm:block">GST %</label>}
                    <select 
                      className="neo-input w-full bg-surface" 
                      value={item.tax_percentage} 
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[index].tax_percentage = parseFloat(e.target.value) || 0;
                        setItems(newItems);
                      }}
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                  <button onClick={() => removeItem(index)} className="p-2 neo-btn !px-3 !py-2 text-error h-[42px] mb-[2px]">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
            
            <button onClick={addItem} className="neo-btn mt-6 flex items-center gap-2 text-sm text-secondary hover:text-primary-dark">
              <Plus size={16} /> Add Item
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="neo-card bg-surface">
            <h3 className="mb-4 flex items-center gap-2"><Calculator size={18}/> Summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-secondary">
                <span>Subtotal</span>
                <span className="font-semibold text-primary-dark">₹ {totals.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Tax (GST)</span>
                <span className="font-semibold text-primary-dark">₹ {totals.taxTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Round-off</span>
                <span className="font-semibold text-primary-dark">₹ {totals.roundOff.toFixed(2)}</span>
              </div>
              <div className="h-px bg-shadow-darker/20 my-2"></div>
              <div className="flex justify-between text-lg">
                <span className="font-bold text-primary-dark">Grand Total</span>
                <span className="font-bold text-primary-dark">₹ {totals.grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="neo-card p-4 space-y-3">
            <button 
              disabled={isSaving}
              onClick={() => handleSave('draft')}
              className={`w-full py-3 flex items-center justify-center gap-2 transition-all ${
                confirmationRequested ? 'neo-btn-primary animate-pulse shadow-[0_0_15px_rgba(45,212,191,0.5)]' : 'neo-btn'
              }`}
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : "Save Draft"}
            </button>
            <button 
              disabled={isSaving}
              onClick={() => handleSave('convert_requested')}
              className="neo-btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <>Request Conversion <Sparkles size={18}/></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useVoiceForm } from '../../contexts/VoiceFormContext';
import { useToast } from '../Shared/Toast';

export function VoiceOverlayManager() {
  const { overlayType, setOverlayType } = useVoiceForm();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);

  // Customer State
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    billing_address: '',
    gst_number: '',
    type: 'business'
  });

  // Product State
  const [newProduct, setNewProduct] = useState({
    name: '',
    category: '',
    retail_price: 0,
    wholesale_price: 0,
    description: '',
    size: '',
    hsn_code: '',
    tax_percentage: 18
  });

  if (!overlayType) return null;

  const handleClose = () => {
    setOverlayType(null);
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!db) return;
      await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        created_at: serverTimestamp()
      });
      showToast('Customer created successfully.', 'success');
      handleClose();
    } catch (err) {
      console.error("Error adding customer:", err);
      showToast('Failed to add customer.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!db) return;
      await addDoc(collection(db, 'products'), {
        ...newProduct,
        specifications: [],
        created_at: new Date()
      });
      showToast('Product created successfully.', 'success');
      handleClose();
    } catch (err) {
      console.error("Error adding product:", err);
      showToast('Failed to add product.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="neo-card w-full max-w-lg animate-scale-in border-2 border-primary/30 shadow-[0_0_30px_rgba(45,212,191,0.2)]">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6 border-b border-shadow-darker/10 pb-4">
          <h2 className="text-2xl font-bold text-primary-dark">
            {overlayType === 'customer' ? 'AI Auto-Create: Customer' : 'AI Auto-Create: Product'}
          </h2>
          <button onClick={handleClose} className="neo-btn !p-2 !rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Customer Form */}
        {overlayType === 'customer' && (
          <form onSubmit={handleAddCustomer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-bold text-primary-dark">Customer Name / Company</label>
                <input 
                  required
                  className="neo-input w-full bg-primary/5 border-primary/20"
                  value={newCustomer.name}
                  onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                  placeholder="e.g. Acme Corp"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">Type</label>
                <select 
                  className="neo-input w-full"
                  value={newCustomer.type}
                  onChange={e => setNewCustomer({...newCustomer, type: e.target.value as 'business' | 'individual'})}
                >
                  <option value="business">Business</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">GST Number</label>
                <input 
                  className="neo-input w-full"
                  value={newCustomer.gst_number}
                  onChange={e => setNewCustomer({...newCustomer, gst_number: e.target.value})}
                  placeholder="29AAAAA0000A1Z5"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">Phone</label>
                <input 
                  className="neo-input w-full"
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">Email</label>
                <input 
                  type="email"
                  className="neo-input w-full"
                  value={newCustomer.email}
                  onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                  placeholder="contact@acme.com"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={handleClose} className="neo-btn flex-1 py-3" disabled={loading}>Cancel</button>
              <button type="submit" className="neo-btn-primary flex-1 py-3 flex justify-center items-center gap-2" disabled={loading}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : "Save Customer"}
              </button>
            </div>
          </form>
        )}

        {/* Product Form */}
        {overlayType === 'product' && (
          <form onSubmit={handleAddProduct} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-bold text-primary-dark">Product Name</label>
                <input 
                  required
                  className="neo-input w-full bg-primary/5 border-primary/20"
                  value={newProduct.name}
                  onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                  placeholder="e.g. EcoBoard Pro"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">Category</label>
                <input 
                  className="neo-input w-full"
                  value={newProduct.category}
                  onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                  placeholder="e.g. Boards"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">HSN Code</label>
                <input 
                  className="neo-input w-full"
                  value={newProduct.hsn_code}
                  onChange={e => setNewProduct({...newProduct, hsn_code: e.target.value})}
                  placeholder="e.g. 4410"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">Retail Price (₹)</label>
                <input 
                  type="number"
                  className="neo-input w-full"
                  value={newProduct.retail_price}
                  onChange={e => setNewProduct({...newProduct, retail_price: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">GST (%)</label>
                <select 
                  className="neo-input w-full"
                  value={newProduct.tax_percentage}
                  onChange={e => setNewProduct({...newProduct, tax_percentage: Number(e.target.value)})}
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={handleClose} className="neo-btn flex-1 py-3" disabled={loading}>Cancel</button>
              <button type="submit" className="neo-btn-primary flex-1 py-3 flex justify-center items-center gap-2" disabled={loading}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : "Save Product"}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}

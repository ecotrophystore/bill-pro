import { useEffect, useState } from 'react';
import { Users, Search, Plus, ExternalLink, Mail, Phone, MapPin, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import type { Customer } from '../types';
import { useToast } from '../components/Shared/Toast';

export default function CustomerLibrary() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { showToast } = useToast();
  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({
    name: '',
    email: '',
    phone: '',
    billing_address: '',
    gst_number: '',
    type: 'business'
  });

  async function fetchCustomers() {
    setLoading(true);
    try {
      if (!db) return;
      const querySnapshot = await getDocs(collection(db, 'customers'));
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Error fetching customers:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!db) return;
      await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        created_at: serverTimestamp()
      });
      setIsAddModalOpen(false);
      setNewCustomer({ name: '', email: '', phone: '', billing_address: '', gst_number: '', type: 'business' });
      fetchCustomers();
    } catch (err) {
      console.error("Error adding customer:", err);
      showToast('Failed to add customer. Check console for permissions.', 'error');
    }
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.gst_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Customer Library</h1>
          <p className="text-secondary mt-1">Professional directory of all billed entities and walk-ins.</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="neo-btn-primary flex items-center gap-2"
        >
          <Plus size={20} /> Add New Customer
        </button>
      </div>

      <div className="neo-card flex items-center gap-3 !py-3">
        <Search className="text-secondary" size={20} />
        <input 
          type="text" 
          placeholder="Search by name or GSTIN..." 
          className="bg-transparent border-none outline-none w-full text-primary-dark"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="neo-card h-48 animate-pulse bg-shadow-darker/5"></div>)
        ) : filtered.length > 0 ? (
          filtered.map(customer => (
            <div key={customer.id} className="neo-card group hover:scale-[1.02] transition-transform duration-300">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                  <Users size={24} />
                </div>
                <div className={clsx(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  customer.type === 'business' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                )}>
                  {customer.type || 'Standard'}
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-primary-dark truncate capitalize">{customer.name}</h3>
              <p className="text-xs font-mono text-secondary mb-4">{customer.gst_number || 'NO GSTIN'}</p>

              <div className="space-y-2 mt-4">
                {customer.phone && (
                  <div className="flex items-center gap-2 text-sm text-secondary">
                    <Phone size={14} /> <span>{customer.phone}</span>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2 text-sm text-secondary">
                    <Mail size={14} /> <span className="truncate">{customer.email}</span>
                  </div>
                )}
                {customer.billing_address && (
                  <div className="flex items-center gap-2 text-sm text-secondary">
                    <MapPin size={14} className="shrink-0" /> <span className="truncate">{customer.billing_address}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-shadow-darker/10 flex justify-between items-center">
                <span className="text-[10px] text-secondary/50 uppercase font-bold tracking-tight">
                  Active since {customer.created_at?.toDate ? new Date(customer.created_at.toDate()).toLocaleDateString() : 'New'}
                </span>
                <button 
                  onClick={() => navigate(`/invoices?customer=${customer.id}`)}
                  className="text-primary hover:underline flex items-center gap-1 text-sm font-semibold"
                >
                  View Bills <ExternalLink size={14} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="md:col-span-3 py-20 text-center">
            <div className="text-secondary text-lg">No customers found in your library.</div>
            <p className="text-sm text-secondary/60 mt-2">Start billing to automatically build your directory.</p>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="neo-card w-full max-w-lg animate-scale-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-primary-dark">Add New Customer</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="neo-btn !p-2 !rounded-full">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Customer Name / Company</label>
                  <input 
                    required
                    className="neo-input w-full"
                    value={newCustomer.name}
                    onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                    placeholder="e.g. Acme Corp"
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
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">Billing Address</label>
                <textarea 
                  className="neo-input w-full h-24 resize-none"
                  value={newCustomer.billing_address}
                  onChange={e => setNewCustomer({...newCustomer, billing_address: e.target.value})}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="neo-btn flex-1 py-3">Cancel</button>
                <button type="submit" className="neo-btn-primary flex-1 py-3">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

import { useEffect, useState } from 'react';
import { Users, Search, Plus, ExternalLink, Mail, Phone, MapPin, X, Edit, Trash2, Download, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { Customer } from '../types';
import VoiceDictation from '../components/VoiceDictation';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function CustomerLibrary() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showReportDropdown, setShowReportDropdown] = useState(false);

  // Form states for adding/editing customer
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');

  useEffect(() => {
    async function fetchCustomers() {
      try {
        if (!db) return;
        const querySnapshot = await getDocs(collection(db, 'customers'));
        const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        setCustomers(list.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchCustomers();
  }, []);

  const handleEditCustomerClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name || '');
    setGstNumber(customer.gst_number || '');
    setPhone(customer.phone || '');
    setEmail(customer.email || '');
    setBillingAddress(customer.billing_address || '');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    setName('');
    setGstNumber('');
    setPhone('');
    setEmail('');
    setBillingAddress('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (editingCustomer) {
        // Edit existing customer
        const customerRef = doc(db, 'customers', editingCustomer.id);
        await updateDoc(customerRef, {
          name: name.trim(),
          gst_number: gstNumber.trim(),
          phone: phone.trim(),
          email: email.trim(),
          billing_address: billingAddress.trim(),
          type: (gstNumber.trim() ? 'business' : 'individual') as 'business' | 'individual',
        });

        setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? {
          ...c,
          name: name.trim(),
          gst_number: gstNumber.trim(),
          phone: phone.trim(),
          email: email.trim(),
          billing_address: billingAddress.trim(),
          type: (gstNumber.trim() ? 'business' : 'individual') as 'business' | 'individual',
        } : c).sort((a, b) => a.name.localeCompare(b.name)));

        handleCloseModal();
      } else {
        // Add new customer
        const docRef = await addDoc(collection(db, 'customers'), {
          name: name.trim(),
          gst_number: gstNumber.trim(),
          phone: phone.trim(),
          email: email.trim(),
          billing_address: billingAddress.trim(),
          type: (gstNumber.trim() ? 'business' : 'individual') as 'business' | 'individual',
          created_at: new Date()
        });

        const newCust: Customer = {
          id: docRef.id,
          name: name.trim(),
          gst_number: gstNumber.trim(),
          phone: phone.trim(),
          email: email.trim(),
          billing_address: billingAddress.trim(),
          type: (gstNumber.trim() ? 'business' : 'individual') as 'business' | 'individual',
          created_at: {
            toDate: () => new Date()
          } as any
        };

        setCustomers(prev => [newCust, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
        handleCloseModal();
      }
    } catch (err) {
      console.error(err);
      alert(`Failed to ${editingCustomer ? 'update' : 'add'} customer.`);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this customer?")) return;
    try {
      const customerRef = doc(db, 'customers', id);
      await deleteDoc(customerRef);
      setCustomers(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error("Error deleting customer:", err);
      alert("Failed to delete customer.");
    }
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.gst_number && c.gst_number.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleVoiceCustomer = (customerName: string | null, _items: any[], customerType?: string | null) => {
    if (!customerName) {
      alert("Could not extract customer name from voice.");
      return;
    }
    setName(customerName);
    setGstNumber(customerType === 'gst' ? '22AAAAA0000A1Z5' : '');
    setEditingCustomer(null);
    setIsModalOpen(true);
  };

  const handleDownloadReport = (format: 'excel' | 'pdf') => {
    if (format === 'excel') {
      const reportData = filtered.map(c => ({
        'Customer Name': c.name,
        'GSTIN': c.gst_number || 'N/A',
        'Phone': c.phone || 'N/A',
        'Email': c.email || 'N/A',
        'Billing Address': c.billing_address || 'N/A',
        'Customer Type': c.type ? c.type.toUpperCase() : 'INDIVIDUAL'
      }));

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      XLSX.writeFile(wb, "Customers_Report.xlsx");
    } else {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Customers Library Report", 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

      autoTable(doc, {
        startY: 40,
        head: [['Customer Name', 'GSTIN', 'Phone', 'Email', 'Type']],
        body: filtered.map(c => [
          c.name,
          c.gst_number || 'N/A',
          c.phone || 'N/A',
          c.email || 'N/A',
          c.type ? c.type.toUpperCase() : 'INDIVIDUAL'
        ]),
        theme: 'striped',
      });
      doc.save("Customers_Report.pdf");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Customer Library</h1>
          <p className="text-secondary mt-1">Professional directory of all billed entities and walk-ins.</p>
        </div>
        <div className="flex gap-4 items-center w-full sm:w-auto">
          <VoiceDictation 
            onParsedItems={handleVoiceCustomer} 
            functionName="parseVoiceCommand" 
            label="Voice Customer" 
          />
          <div className="relative">
            <button 
              onClick={() => setShowReportDropdown(!showReportDropdown)} 
              className="neo-btn flex items-center gap-2"
            >
              <Download size={18} /> Report <ChevronDown size={14} />
            </button>
            {showReportDropdown && (
              <div 
                className="absolute right-0 mt-2 w-40 bg-surface border border-shadow-darker/20 rounded-xl shadow-neo-raised z-50 py-1"
                onMouseLeave={() => setShowReportDropdown(false)}
              >
                <button 
                  onClick={() => { handleDownloadReport('excel'); setShowReportDropdown(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-shadow-darker/5 transition-colors text-sm font-semibold text-secondary"
                >
                  Excel (.xlsx)
                </button>
                <button 
                  onClick={() => { handleDownloadReport('pdf'); setShowReportDropdown(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-shadow-darker/5 transition-colors text-sm font-semibold text-secondary"
                >
                  PDF (.pdf)
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setIsModalOpen(true)} className="neo-btn-primary flex items-center gap-2">
            <Plus size={20} /> Add New Customer
          </button>
        </div>
      </div>

      <div className="neo-card flex items-center gap-3">
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
                <div className="flex flex-col items-end gap-2">
                  <div className={clsx(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    customer.type === 'business' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  )}>
                    {customer.type || 'Standard'}
                  </div>
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button 
                      onClick={() => handleEditCustomerClick(customer)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit Customer"
                    >
                      <Edit size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteCustomer(customer.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Customer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-primary-dark truncate">{customer.name}</h3>
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
                <span className="text-[10px] text-secondary/50 uppercase font-bold tracking-tight">Active since {customer.created_at?.toDate ? new Date(customer.created_at.toDate()).toLocaleDateString() : 'N/A'}</span>
                <button 
                  onClick={() => navigate(`/invoices?customer=${encodeURIComponent(customer.name)}`)}
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

      {/* Modern Modal Dialog for Adding/Editing Customer */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-surface w-full max-w-lg rounded-card shadow-neo-hover p-6 border border-shadow-darker/10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-primary-dark">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h2>
              <button 
                onClick={handleCloseModal}
                className="p-1 rounded-lg text-secondary hover:text-primary transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Enter name"
                  className="neo-input w-full"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1">
                  GST Number (Optional)
                </label>
                <input 
                  type="text" 
                  placeholder="Enter 15-digit GSTIN"
                  className="neo-input w-full"
                  value={gstNumber}
                  onChange={e => setGstNumber(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-primary-dark mb-1">
                    Phone Number
                  </label>
                  <input 
                    type="tel" 
                    placeholder="Enter phone number"
                    className="neo-input w-full"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-primary-dark mb-1">
                    Email ID (Optional)
                  </label>
                  <input 
                    type="email" 
                    placeholder="Enter email address"
                    className="neo-input w-full"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1">
                  Billing Address
                </label>
                <textarea 
                  placeholder="Enter billing address"
                  className="neo-input w-full min-h-[80px] resize-none"
                  value={billingAddress}
                  onChange={e => setBillingAddress(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-shadow-darker/10">
                <button 
                  type="button" 
                  onClick={handleCloseModal}
                  className="neo-btn px-6 py-2"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="neo-btn-primary px-6 py-2"
                >
                  {editingCustomer ? 'Update Customer' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper for conditional classes if clsx is not globally available in scope elsewhere
function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

import { useEffect, useState } from 'react';
import { Plus, Search, FileText, Download, Filter, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import DigitalReceipt from '../components/Shared/DigitalReceipt';
import { useToast } from '../components/Shared/Toast';
import type { Invoice, Customer } from '../types';

export default function Invoices() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const handleDownloadInvoice = (inv: Invoice) => {
    const content = `INVOICE: ${inv.number}\nCustomer: ${customers[inv.customer_id] || 'N/A'}\nDate: ${inv.created_at?.toDate().toLocaleDateString('en-IN') || 'N/A'}\nSubtotal: ₹${inv.subtotal}\nTax: ₹${inv.tax_total}\nGrand Total: ₹${inv.grand_total}\nPayment: ${inv.payment_status}\n\nItems:\n${inv.items?.map((item, i) => `${i+1}. ${item.description} - Qty: ${item.quantity} x ₹${item.rate} = ₹${item.line_total}`).join('\n') || 'No items'}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${inv.number.replace(/\//g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`Invoice ${inv.number} downloaded!`, 'success');
  };

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'invoices'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const invs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        setInvoices(invs);
        
        // Fetch missing customer names
        const newCustomerIds = invs
          .map(i => i.customer_id)
          .filter(id => id && !customers[id]);
        
        if (newCustomerIds.length > 0 && db) {
          const names = { ...customers };
          for (const id of newCustomerIds) {
            try {
              const cDoc = await getDoc(doc(db, 'customers', id));
              names[id] = cDoc.exists() ? (cDoc.data() as Customer).name : 'Unknown Customer';
            } catch (err) {
              names[id] = 'Customer (Access Denied)';
            }
          }
          setCustomers(names);
        }
      } catch (err) {
        console.error("Firestore Mapping Error:", err);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error("Invoices onSnapshot error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [customers]);

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Invoices</h1>
          <p className="text-secondary mt-1">Manage official tax invoices, tracked by FY sequence.</p>
        </div>
        <button onClick={() => navigate('/invoices/new')} className="neo-btn-primary flex items-center gap-2">
          <Plus size={18} /> New Invoice
        </button>
      </div>

      <div className="neo-card p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
          <input 
            type="text" 
            placeholder="Search by invoice number or customer..." 
            className="neo-input w-full pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="neo-btn flex items-center gap-2 w-full sm:w-auto">
          <Filter size={18} /> Filter
        </button>
      </div>

      <div className="neo-card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface border-b border-shadow-darker/10">
                <th className="p-4 font-semibold text-primary-dark">Invoice #</th>
                <th className="p-4 font-semibold text-primary-dark">Customer</th>
                <th className="p-4 font-semibold text-primary-dark">Date</th>
                <th className="p-4 font-semibold text-primary-dark text-right">Total</th>
                <th className="p-4 font-semibold text-primary-dark text-center">Status</th>
                <th className="p-4 font-semibold text-primary-dark text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shadow-darker/5">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-secondary">
                  <Loader2 className="animate-spin mx-auto mb-2" /> Loading invoices...
                </td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-secondary">No invoices found.</td></tr>
              ) : invoices
                  .filter(inv => inv.number.toLowerCase().includes(searchTerm.toLowerCase()) || (customers[inv.customer_id] || '').toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((inv) => (
                <tr key={inv.id} className="hover:bg-shadow-darker/5 transition-colors group">
                  <td className="p-4 font-medium text-primary-dark">{inv.number}</td>
                  <td className="p-4 text-secondary">{customers[inv.customer_id] || 'Loading...'}</td>
                  <td className="p-4 text-secondary">{inv.created_at ? inv.created_at.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Syncing...'}</td>
                  <td className="p-4 text-right font-medium text-primary-dark">₹ {inv.grand_total?.toLocaleString() || '0'}</td>
                  <td className="p-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      inv.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-primary-light text-primary-dark shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05)]'
                    }`}>
                      {inv.payment_status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => setSelectedInvoice(inv)}
                        className="p-2 text-secondary hover:text-primary-dark transition-colors" 
                        title="View PDF"
                      >
                        <FileText size={18} />
                      </button>
                      <button 
                        onClick={() => handleDownloadInvoice(inv)}
                        className="p-2 text-secondary hover:text-primary-dark transition-colors" 
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Digital Receipt Modal */}
      {selectedInvoice && (
        <DigitalReceipt 
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          data={{
            number: selectedInvoice.number,
            customer_name: customers[selectedInvoice.customer_id] || 'Valued Customer',
            date: selectedInvoice.created_at?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) || '',
            items: selectedInvoice.items,
            subtotal: selectedInvoice.subtotal,
            tax_total: selectedInvoice.tax_total,
            grand_total: selectedInvoice.grand_total,
            type: 'Invoice'
          }}
        />
      )}
    </div>
  );
}

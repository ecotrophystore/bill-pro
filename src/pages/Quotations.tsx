import { useEffect, useState } from 'react';
import { Plus, Search, Filter, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, functions } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import DigitalReceipt from '../components/Shared/DigitalReceipt';
import { useToast } from '../components/Shared/Toast';
import type { Quotation, Customer } from '../types';

export default function Quotations() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'quotations'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const qts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quotation));
        setQuotations(qts);
        
        // Fetch missing customer names
        const newCustomerIds = qts
          .map(q => q.customer_id)
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
      console.error("Quotations onSnapshot error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [customers]);

  const handleConvert = async (quotationId: string) => {
    if (!functions) return;
    const confirm = window.confirm("This will generate a LOCKED Tax Invoice. Rule #3: Admin/Accounts role required. Proceed?");
    if (!confirm) return;

    setConvertingId(quotationId);
    try {
      const convertFn = httpsCallable(functions, 'convertQuotationToInvoice');
      const result = await convertFn({ quotationId });
      showToast(`Successfully converted! Invoice: ${(result.data as any).invoiceNumber}`, 'success');
      navigate('/invoices');
    } catch (error) {
      console.error("Conversion failed:", error);
      showToast('Failed to convert. Check permissions or if already converted.', 'error');
    } finally {
      setConvertingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'converted': return <span className="neo-badge-success bg-surface">Converted</span>;
      case 'convert_requested': return <span className="neo-badge-warning bg-surface shadow-[inset_2px_2px_5px_#D1C4B2,_inset_-2px_-2px_5px_#FFFFFF]">Convert Requested</span>;
      case 'sent': return <span className="neo-badge text-primary-dark bg-surface shadow-neo-surface">Sent</span>;
      default: return <span className="neo-badge text-secondary bg-surface shadow-neo-inset">Draft</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Quotations</h1>
          <p className="text-secondary mt-1">Manage standard quotes and conversion requests.</p>
        </div>
        <button 
          onClick={() => navigate('/quotations/new')}
          className="neo-btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          <span>New Quotation</span>
        </button>
      </div>

      <div className="neo-card">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
          <div className="flex-1 flex gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
              <input 
                type="text" 
                placeholder="Search by ID or Customer..." 
                className="neo-input w-full pl-10"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="neo-btn !px-4 flex items-center gap-2 text-secondary">
              <Filter size={18} />
              <span className="hidden sm:inline">Filter</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-shadow-darker/20 text-sm font-semibold text-secondary">
                <th className="pb-3 px-4 pl-0 w-32">Quotation ID</th>
                <th className="pb-3 px-4">Customer</th>
                <th className="pb-3 px-4 w-32">Date</th>
                <th className="pb-3 px-4 w-32 text-right">Amount (₹)</th>
                <th className="pb-3 px-4 w-40 text-center">Status</th>
                <th className="pb-3 px-4 pr-0 w-16"></th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-secondary">
                  <Loader2 className="animate-spin mx-auto mb-2" /> Loading quotations...
                </td></tr>
              ) : quotations.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-secondary">No quotations found.</td></tr>
              ) : quotations
                  .filter(q => q.number.toLowerCase().includes(searchTerm.toLowerCase()) || (customers[q.customer_id] || '').toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((q) => (
                <tr key={q.id} className="border-b border-shadow-darker/10 hover:bg-shadow-darker/5 transition-colors group">
                  <td className="py-4 px-4 pl-0 font-medium text-primary-dark">{q.number}</td>
                  <td className="py-4 px-4 font-semibold text-secondary">{customers[q.customer_id] || 'Loading...'}</td>
                  <td className="py-4 px-4 text-secondary">{q.created_at ? q.created_at.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Syncing...'}</td>
                  <td className="py-4 px-4 font-bold text-primary-dark text-right">{q.grand_total?.toLocaleString() || '0'}</td>
                  <td className="py-4 px-4 text-center">{getStatusBadge(q.status)}</td>
                  <td className="py-4 px-4 pr-0 text-right">
                    <div className="flex items-center justify-end gap-2">
                       {q.status === 'convert_requested' && (
                         <button 
                           onClick={() => handleConvert(q.id)}
                           disabled={convertingId === q.id}
                           className="neo-btn !p-2 text-primary-dark hover:text-white hover:bg-primary-dark transition-all flex items-center gap-1 text-xs font-bold"
                         >
                           {convertingId === q.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                           Convert
                         </button>
                       )}
                       <button 
                         onClick={() => setSelectedQuotation(q)}
                         className="p-2 text-secondary hover:text-primary-dark transition-colors opacity-0 group-hover:opacity-100"
                       >
                         <ArrowRight size={18} />
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
      {selectedQuotation && (
        <DigitalReceipt 
          isOpen={!!selectedQuotation}
          onClose={() => setSelectedQuotation(null)}
          data={{
            number: selectedQuotation.number,
            customer_name: customers[selectedQuotation.customer_id] || 'Valued Customer',
            date: selectedQuotation.created_at?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) || '',
            items: selectedQuotation.items,
            subtotal: selectedQuotation.subtotal,
            tax_total: selectedQuotation.tax_total,
            grand_total: selectedQuotation.grand_total,
            type: 'Quotation'
          }}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Plus, Search, FileText, Download, Filter, Loader2, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import DigitalReceipt from '../components/Shared/DigitalReceipt';
import { useToast } from '../components/Shared/Toast';
import type { CashMemo, Customer } from '../types';

export default function CashMemos() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [memos, setMemos] = useState<CashMemo[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedMemo, setSelectedMemo] = useState<CashMemo | null>(null);

  const handleDownloadMemo = (memo: CashMemo) => {
    const content = `CASH MEMO: ${memo.number}\nCustomer: ${memo.customer_name || customers[memo.customer_id] || 'Walk-in'}\nDate: ${memo.created_at?.toDate().toLocaleDateString('en-IN') || 'N/A'}\nGrand Total: ₹${memo.grand_total}\n\nItems:\n${memo.items?.map((item, i) => `${i+1}. ${item.description} - Qty: ${item.quantity} x ₹${item.rate} = ₹${item.line_total}`).join('\n') || 'No items'}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${memo.number.replace(/\//g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`Cash Memo ${memo.number} downloaded!`, 'success');
  };

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'cash_memos'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashMemo));
        setMemos(docs);
        
        const newCustomerIds = docs
          .map(m => m.customer_id)
          .filter(id => id && id !== 'walk_in' && !customers[id]);
        
        if (newCustomerIds.length > 0 && db) {
          const names = { ...customers };
          for (const id of newCustomerIds) {
            try {
              const cDoc = await getDoc(doc(db, 'customers', id));
              names[id] = cDoc.exists() ? (cDoc.data() as Customer).name : 'Walk-in / Private';
            } catch (err) {
              names[id] = 'Customer Data Protected';
            }
          }
          setCustomers(names);
        }
      } catch (err) {
        console.error("Cash Memos Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error("Cash Memos onSnapshot error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [customers]);

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Cash Memos</h1>
          <p className="text-secondary mt-1">Non-GST quick billing with separate sequential numbering.</p>
        </div>
        <button onClick={() => navigate('/cash-memos/new')} className="neo-btn-primary flex items-center gap-2">
          <Plus size={18} /> New Cash Memo
        </button>
      </div>

      <div className="neo-card p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
          <input 
            type="text" 
            placeholder="Search by memo number or walk-in customer..." 
            className="neo-input w-full pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="neo-btn flex items-center gap-2 w-full sm:w-auto">
          <Filter size={18} /> FY Filter
        </button>
      </div>

      <div className="neo-card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface border-b border-shadow-darker/10">
                <th className="p-4 font-semibold text-primary-dark">Memo #</th>
                <th className="p-4 font-semibold text-primary-dark">Customer / Type</th>
                <th className="p-4 font-semibold text-primary-dark">Date</th>
                <th className="p-4 font-semibold text-primary-dark text-right">Amount</th>
                <th className="p-4 font-semibold text-primary-dark text-center">Status</th>
                <th className="p-4 font-semibold text-primary-dark text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shadow-darker/5">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-secondary">
                  <Loader2 className="animate-spin mx-auto mb-2" /> Indexing memos...
                </td></tr>
              ) : memos.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-secondary">No cash memos found.</td></tr>
              ) : memos
                  .filter(m => m.number.toLowerCase().includes(searchTerm.toLowerCase()) || (m.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((memo) => (
                <tr key={memo.id} className="hover:bg-shadow-darker/5 transition-colors group">
                  <td className="p-4 font-medium text-primary-dark">{memo.number}</td>
                  <td className="p-4 text-secondary">
                    {memo.customer_id === 'walk_in' ? (
                      <span className="flex items-center gap-2 italic text-secondary/70">
                        <User size={14} /> {memo.customer_name || 'Walk-in Customer'}
                      </span>
                    ) : (
                      customers[memo.customer_id] || 'Loading Profile...'
                    )}
                  </td>
                  <td className="p-4 text-secondary">{memo.created_at?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="p-4 text-right font-medium text-primary-dark">₹ {memo.grand_total?.toLocaleString()}</td>
                  <td className="p-4 text-center">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                      PAID
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => setSelectedMemo(memo)}
                        className="p-2 text-secondary hover:text-primary-dark transition-colors" 
                      >
                        <FileText size={18} />
                      </button>
                      <button 
                        onClick={() => handleDownloadMemo(memo)}
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
      {selectedMemo && (
        <DigitalReceipt 
          isOpen={!!selectedMemo}
          onClose={() => setSelectedMemo(null)}
          data={{
            number: selectedMemo.number,
            customer_name: selectedMemo.customer_name || customers[selectedMemo.customer_id] || 'Walk-in Customer',
            date: selectedMemo.created_at?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) || '',
            items: selectedMemo.items,
            subtotal: selectedMemo.subtotal,
            tax_total: 0,
            grand_total: selectedMemo.grand_total,
            type: 'Cash Memo'
          }}
        />
      )}
    </div>
  );
}

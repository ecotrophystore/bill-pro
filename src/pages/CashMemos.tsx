import { useEffect, useState } from 'react';
import { Plus, Search, FileText, Download, Filter, Loader2, User, Trash2, Edit, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, deleteDoc } from 'firebase/firestore';
import type { CashMemo, Customer } from '../types';
import { downloadPDF } from '../utils/pdfGenerator';
import PaymentModal from '../components/Billing/PaymentModal';
import VoiceDictation from '../components/VoiceDictation';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function CashMemos() {
  const navigate = useNavigate();
  const [memos, setMemos] = useState<CashMemo[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedMemo, setSelectedMemo] = useState<CashMemo | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showReportDropdown, setShowReportDropdown] = useState(false);

  useEffect(() => {
    if (!db) return;
    // Listening to the new dedicated cash_memos collection (Choice 2b)
    const q = query(collection(db, 'cash_memos'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashMemo));
        setMemos(docs);
        
        // Fetch missing customer names (skipping walk-in customers)
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

  const deleteCashMemo = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this cash memo?")) {
      try {
        await deleteDoc(doc(db, 'cash_memos', id));
      } catch (err) {
        console.error("Error deleting cash memo", err);
        alert("Failed to delete cash memo.");
      }
    }
  };

  const openPaymentModal = (memo: CashMemo) => {
    setSelectedMemo(memo);
    setIsPaymentModalOpen(true);
  };

  const handleVoiceCashMemo = (customerName: string | null, items: any[], customerType?: string | null) => {
    navigate('/cash-memos/new', { state: { voiceData: { customerName, items, customerType } } });
  };

  const handleDownloadReport = (format: 'excel' | 'pdf') => {
    const filteredMemos = memos
      .filter(memo => memo.number.toLowerCase().includes(searchTerm.toLowerCase()) || (customers[memo.customer_id] || '').toLowerCase().includes(searchTerm.toLowerCase()) || (memo.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
      .filter(memo => statusFilter === 'all' || (memo.payment_status || 'unpaid') === statusFilter);

    if (format === 'excel') {
      const reportData = filteredMemos.map(memo => ({
        'Memo Number': memo.number,
        'Customer': memo.walk_in_customer ? (memo.customer_name || 'Walk-in Customer') : (customers[memo.customer_id] || 'Unknown Customer'),
        'Date': memo.created_at ? memo.created_at.toDate().toLocaleDateString('en-IN') : 'Syncing...',
        'Subtotal (₹)': memo.subtotal || 0,
        'Grand Total (₹)': memo.grand_total || 0,
        'Payment Status': (memo.payment_status || 'unpaid').toUpperCase()
      }));

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cash Memos");
      XLSX.writeFile(wb, "Cash_Memos_Report.xlsx");
    } else {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Cash Memos Report", 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

      autoTable(doc, {
        startY: 40,
        head: [['Memo #', 'Customer', 'Date', 'Grand Total', 'Status']],
        body: filteredMemos.map(memo => [
          memo.number,
          memo.walk_in_customer ? (memo.customer_name || 'Walk-in Customer') : (customers[memo.customer_id] || 'Unknown Customer'),
          memo.created_at ? memo.created_at.toDate().toLocaleDateString('en-IN') : 'Syncing...',
          `Rs. ${memo.grand_total?.toLocaleString() || '0'}`,
          (memo.payment_status || 'unpaid').toUpperCase()
        ]),
        theme: 'striped',
      });
      doc.save("Cash_Memos_Report.pdf");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Cash Memos</h1>
          <p className="text-secondary mt-1">Non-GST quick billing with separate sequential numbering.</p>
        </div>
        <div className="flex gap-4 items-center w-full sm:w-auto">
          <VoiceDictation 
            onParsedItems={handleVoiceCashMemo} 
            functionName="parseVoiceCommand" 
            label="Voice Cash Memo" 
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
          <button onClick={() => navigate('/cash-memos/new')} className="neo-btn-primary flex items-center gap-2">
            <Plus size={18} /> New Cash Memo
          </button>
        </div>
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
        <div className="relative">
          <select 
            className="neo-btn w-full sm:w-auto !px-4 !pl-10 flex items-center gap-2 text-secondary appearance-none cursor-pointer bg-surface"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
        </div>
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
                  .filter(m => statusFilter === 'all' || (m.payment_status || 'unpaid') === statusFilter)
                  .map((memo) => (
                <tr key={memo.id} className="hover:bg-shadow-darker/5 transition-colors">
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
                    <button 
                      onClick={() => openPaymentModal(memo)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                      memo.payment_status === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-200' : memo.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}>
                      {memo.payment_status?.toUpperCase() || 'PAID'}
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => navigate(`/cash-memos/edit/${memo.id}`)}
                        className="p-2 text-secondary hover:text-primary transition-colors" 
                        title="Edit Cash Memo"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => downloadPDF(memo, customers[memo.customer_id] || memo.customer_name || 'Walk-in Customer', 'Cash Memo', 'view')}
                        className="p-2 text-secondary hover:text-primary-dark transition-colors" 
                        title="View PDF"
                      >
                        <FileText size={18} />
                      </button>
                      <button 
                        onClick={() => downloadPDF(memo, customers[memo.customer_id] || memo.customer_name || 'Walk-in Customer', 'Cash Memo', 'download')}
                        className="p-2 text-secondary hover:text-primary-dark transition-colors"
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                      <button 
                        onClick={() => deleteCashMemo(memo.id)}
                        className="p-2 text-secondary hover:text-red-600 transition-colors" 
                        title="Delete Cash Memo"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMemo && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedMemo(null);
          }}
          document={selectedMemo}
          documentType="cash_memo"
          onPaymentUpdated={() => {}}
        />
      )}
    </div>
  );
}

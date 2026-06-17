import { useEffect, useState } from 'react';
import { Plus, Search, FileText, Download, Filter, Loader2, Trash2, Edit, ChevronDown } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, deleteDoc } from 'firebase/firestore';
import type { Invoice, Customer } from '../types';
import { downloadPDF } from '../utils/pdfGenerator';
import PaymentModal from '../components/Billing/PaymentModal';
import VoiceDictation from '../components/VoiceDictation';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Invoices() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialSearch = queryParams.get('customer') || '';
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showReportDropdown, setShowReportDropdown] = useState(false);

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

  const openPaymentModal = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setIsPaymentModalOpen(true);
  };

  const deleteInvoice = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this invoice?")) {
      try {
        await deleteDoc(doc(db, 'invoices', id));
      } catch (err) {
        console.error("Error deleting invoice", err);
        alert("Failed to delete invoice.");
      }
    }
  };

  const handleVoiceInvoice = (customerName: string | null, items: any[], customerType?: string | null) => {
    navigate('/invoices/new', { state: { voiceData: { customerName, items, customerType } } });
  };

  const handleDownloadReport = (format: 'excel' | 'pdf') => {
    const filteredInvoices = invoices
      .filter(inv => inv.number.toLowerCase().includes(searchTerm.toLowerCase()) || (customers[inv.customer_id] || '').toLowerCase().includes(searchTerm.toLowerCase()))
      .filter(inv => statusFilter === 'all' || (inv.payment_status || 'unpaid') === statusFilter);

    if (format === 'excel') {
      const reportData = filteredInvoices.map(inv => ({
        'Invoice Number': inv.number,
        'Customer': customers[inv.customer_id] || 'Unknown Customer',
        'Date': inv.created_at ? inv.created_at.toDate().toLocaleDateString('en-IN') : 'Syncing...',
        'Subtotal (₹)': inv.subtotal || 0,
        'Tax Amount (₹)': inv.tax_total || 0,
        'Grand Total (₹)': inv.grand_total || 0,
        'Payment Status': (inv.payment_status || 'unpaid').toUpperCase()
      }));

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Invoices");
      XLSX.writeFile(wb, "Invoices_Report.xlsx");
    } else {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Invoices Report", 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

      autoTable(doc, {
        startY: 40,
        head: [['Invoice #', 'Customer', 'Date', 'Grand Total', 'Status']],
        body: filteredInvoices.map(inv => [
          inv.number,
          customers[inv.customer_id] || 'Unknown Customer',
          inv.created_at ? inv.created_at.toDate().toLocaleDateString('en-IN') : 'Syncing...',
          `Rs. ${inv.grand_total?.toLocaleString() || '0'}`,
          (inv.payment_status || 'unpaid').toUpperCase()
        ]),
        theme: 'striped',
      });
      doc.save("Invoices_Report.pdf");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Invoices</h1>
          <p className="text-secondary mt-1">Manage official tax invoices, tracked by FY sequence.</p>
        </div>
        <div className="flex gap-4 items-center w-full sm:w-auto">
          <VoiceDictation 
            onParsedItems={handleVoiceInvoice} 
            functionName="parseVoiceCommand" 
            label="Voice Invoice" 
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
          <button onClick={() => navigate('/invoices/new')} className="neo-btn-primary flex items-center gap-2">
            <Plus size={18} /> New Invoice
          </button>
        </div>
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
                  .filter(inv => statusFilter === 'all' || (inv.payment_status || 'unpaid') === statusFilter)
                  .map((inv) => (
                <tr key={inv.id} className="hover:bg-shadow-darker/5 transition-colors">
                  <td className="p-4 font-medium text-primary-dark">{inv.number}</td>
                  <td className="p-4 text-secondary">{customers[inv.customer_id] || 'Loading...'}</td>
                  <td className="p-4 text-secondary">{inv.created_at ? inv.created_at.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Syncing...'}</td>
                  <td className="p-4 text-right font-medium text-primary-dark">₹ {inv.grand_total?.toLocaleString() || '0'}</td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => openPaymentModal(inv)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                      inv.payment_status === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-200' : inv.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}>
                      {inv.payment_status?.toUpperCase() || 'UNPAID'}
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => navigate(`/invoices/edit/${inv.id}`)}
                        className="p-2 text-secondary hover:text-primary transition-colors" 
                        title="Edit Invoice"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => downloadPDF(inv, customers[inv.customer_id] || 'Unknown Customer', 'Invoice', 'view')}
                        className="p-2 text-secondary hover:text-primary-dark transition-colors" 
                        title="View PDF"
                      >
                        <FileText size={18} />
                      </button>
                      <button 
                        onClick={() => downloadPDF(inv, customers[inv.customer_id] || 'Unknown Customer', 'Invoice', 'download')}
                        className="p-2 text-secondary hover:text-primary-dark transition-colors" 
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                      <button 
                        onClick={() => deleteInvoice(inv.id)}
                        className="p-2 text-secondary hover:text-red-600 transition-colors" 
                        title="Delete Invoice"
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

      {selectedInvoice && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedInvoice(null);
          }}
          document={selectedInvoice}
          documentType="invoice"
          onPaymentUpdated={() => {}}
        />
      )}
    </div>
  );
}

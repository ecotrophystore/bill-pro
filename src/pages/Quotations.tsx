import { useEffect, useState } from 'react';
import { Plus, Search, Filter, Loader2, Sparkles, FileText, Download, Trash2, Edit, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, functions } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { Quotation, Customer } from '../types';
import { downloadPDF } from '../utils/pdfGenerator';
import VoiceDictation from '../components/VoiceDictation';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Quotations() {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [showReportDropdown, setShowReportDropdown] = useState(false);

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

  const handleConvert = async (quotation: Quotation) => {
    if (!functions) return;
    
    const isGST = quotation.customer_type === 'gst' || !quotation.customer_type;
    const targetDoc = isGST ? 'Tax Invoice' : 'Cash Memo';
    
    const confirm = window.confirm(`This will generate a LOCKED ${targetDoc}. Proceed?`);
    if (!confirm) return;

    setConvertingId(quotation.id);
    try {
      const fnName = isGST ? 'convertQuotationToInvoice' : 'convertQuotationToCashMemo';
      const convertFn = httpsCallable(functions, fnName);
      const result = await convertFn({ quotationId: quotation.id });
      
      const docNum = (result.data as any).invoiceNumber || (result.data as any).memoNumber;
      alert(`Successfully converted! Document: ${docNum}`);
      navigate(isGST ? '/invoices' : '/cash-memos');
    } catch (error) {
      console.error("Conversion failed:", error);
      alert("Failed to convert. Check permissions or if already converted.");
    } finally {
      setConvertingId(null);
    }
  };

  const updateStatus = async (q: Quotation, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'quotations', q.id), { status: newStatus });
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Failed to update status.");
    }
  };

  const deleteQuotation = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this quotation?")) {
      try {
        await deleteDoc(doc(db, 'quotations', id));
      } catch (err) {
        console.error("Error deleting quotation", err);
        alert("Failed to delete quotation.");
      }
    }
  };

  const getStatusBadge = (q: Quotation) => {
    const status = q.status;
    if (status === 'converted') {
      return <span className="neo-badge text-success bg-surface shadow-neo-surface">Converted</span>;
    }
    
    return (
      <select 
        value={status} 
        onChange={(e) => updateStatus(q, e.target.value)}
        className="neo-input py-1 px-2 text-xs bg-surface cursor-pointer min-w-[100px]"
      >
        <option value="draft">Draft</option>
        <option value="sent">Sent</option>
        <option value="accepted">Accepted</option>
        <option value="rejected">Rejected</option>
        <option value="expired">Expired</option>
        <option value="convert_requested">Convert Requested</option>
      </select>
    );
  };

  const handleVoiceQuotation = (customerName: string | null, items: any[], customerType?: string | null) => {
    navigate('/quotations/new', { state: { voiceData: { customerName, items, customerType } } });
  };

  const handleDownloadReport = (format: 'excel' | 'pdf') => {
    const filteredQuotations = quotations
      .filter(q => q.number.toLowerCase().includes(searchTerm.toLowerCase()) || (customers[q.customer_id] || '').toLowerCase().includes(searchTerm.toLowerCase()))
      .filter(q => statusFilter === 'all' || q.status === statusFilter);

    if (format === 'excel') {
      const reportData = filteredQuotations.map(q => ({
        'Quotation Number': q.number,
        'Customer': customers[q.customer_id] || 'Unknown Customer',
        'Date': q.created_at ? q.created_at.toDate().toLocaleDateString('en-IN') : 'Syncing...',
        'Subtotal (₹)': q.subtotal || 0,
        'Tax Amount (₹)': q.tax_total || 0,
        'Grand Total (₹)': q.grand_total || 0,
        'Status': q.status.toUpperCase()
      }));

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Quotations");
      XLSX.writeFile(wb, "Quotations_Report.xlsx");
    } else {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Quotations Report", 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

      autoTable(doc, {
        startY: 40,
        head: [['Quotation #', 'Customer', 'Date', 'Grand Total', 'Status']],
        body: filteredQuotations.map(q => [
          q.number,
          customers[q.customer_id] || 'Unknown Customer',
          q.created_at ? q.created_at.toDate().toLocaleDateString('en-IN') : 'Syncing...',
          `Rs. ${q.grand_total?.toLocaleString() || '0'}`,
          q.status.toUpperCase()
        ]),
        theme: 'striped',
      });
      doc.save("Quotations_Report.pdf");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Quotations</h1>
          <p className="text-secondary mt-1">Manage standard quotes and conversion requests.</p>
        </div>
        <div className="flex gap-4 items-center">
          <VoiceDictation 
            onParsedItems={handleVoiceQuotation} 
            functionName="parseVoiceCommand" 
            label="Voice Quotation" 
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
          <button 
            onClick={() => navigate('/quotations/new')}
            className="neo-btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            <span>New Quotation</span>
          </button>
        </div>
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
            <div className="relative">
              <select 
                className="neo-btn !px-4 !pl-10 flex items-center gap-2 text-secondary appearance-none cursor-pointer bg-surface"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
                <option value="convert_requested">Convert Requested</option>
                <option value="converted">Converted</option>
              </select>
              <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
            </div>
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
                  .filter(q => statusFilter === 'all' || q.status === statusFilter)
                  .map((q) => (
                <tr key={q.id} className="border-b border-shadow-darker/10 hover:bg-shadow-darker/5 transition-colors group">
                  <td className="py-4 px-4 pl-0 font-medium text-primary-dark">{q.number}</td>
                  <td className="py-4 px-4 font-semibold text-secondary">{customers[q.customer_id] || 'Loading...'}</td>
                  <td className="py-4 px-4 text-secondary">{q.created_at ? q.created_at.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Syncing...'}</td>
                  <td className="py-4 px-4 font-bold text-primary-dark text-right">{q.grand_total?.toLocaleString() || '0'}</td>
                  <td className="py-4 px-4 text-center">{getStatusBadge(q)}</td>
                  <td className="py-4 px-4 pr-0 text-right">
                    <div className="flex items-center justify-end gap-2">
                       {q.status === 'convert_requested' && (
                         <button 
                           onClick={() => handleConvert(q)}
                           disabled={convertingId === q.id}
                           className="neo-btn !p-2 text-primary-dark hover:text-white hover:bg-primary-dark transition-all flex items-center gap-1 text-xs font-bold"
                         >
                           {convertingId === q.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                           Convert
                         </button>
                       )}
                       <button 
                         onClick={() => navigate(`/quotations/edit/${q.id}`)}
                         className="p-2 text-secondary hover:text-primary transition-colors"
                         title="Edit Quotation"
                       >
                         <Edit size={18} />
                       </button>
                       <button 
                         onClick={() => downloadPDF(q, customers[q.customer_id] || 'Unknown Customer', 'Quotation', 'view')}
                         className="p-2 text-secondary hover:text-primary-dark transition-colors"
                         title="View PDF"
                       >
                         <FileText size={18} />
                       </button>
                       <button 
                         onClick={() => downloadPDF(q, customers[q.customer_id] || 'Unknown Customer', 'Quotation', 'download')}
                         className="p-2 text-secondary hover:text-primary-dark transition-colors"
                         title="Download"
                       >
                         <Download size={18} />
                       </button>
                       <button 
                         onClick={() => deleteQuotation(q.id)}
                         className="p-2 text-secondary hover:text-red-600 transition-colors"
                         title="Delete Quotation"
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
    </div>
  );
}

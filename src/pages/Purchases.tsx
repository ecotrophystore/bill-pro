import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Calendar, Filter, Loader2, Edit, Trash2, Download, ChevronDown } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Purchase } from '../types';
import VoiceDictation from '../components/VoiceDictation';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Purchases() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showReportDropdown, setShowReportDropdown] = useState(false);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'purchases'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setPurchases(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Purchase)));
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching purchases:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleAddPurchase = async () => {
    navigate('/purchases/new');
  };

  const handleVoicePurchase = async (data: any) => {
    if (!data || !data.vendor || !data.amount) {
      alert("Could not detect vendor or amount from voice.");
      return;
    }
    try {
      await addDoc(collection(db, 'purchases'), {
        vendor: data.vendor,
        amount: Number(data.amount) || 0,
        reference: `V-${Math.floor(Math.random() * 10000)}`,
        category: 'General',
        status: 'pending',
        date: new Date(),
        created_at: new Date()
      });
    } catch (err) {
      console.error(err);
      alert("Failed to add purchase from voice.");
    }
  };

  const handleEditPurchase = async (purchase: Purchase) => {
    const vendor = window.prompt("Enter new vendor name:", purchase.vendor);
    if (!vendor) return;
    const amountStr = window.prompt("Enter new purchase amount (₹):", purchase.amount.toString());
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return;
    
    try {
      await updateDoc(doc(db, 'purchases', purchase.id), { vendor, amount });
    } catch (err) {
      console.error(err);
      alert("Failed to update purchase.");
    }
  };

  const deletePurchase = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this purchase?")) {
      try {
        await deleteDoc(doc(db, 'purchases', id));
      } catch (err) {
        console.error("Error deleting purchase", err);
        alert("Failed to delete purchase.");
      }
    }
  };

  const toggleStatus = async (purchase: Purchase) => {
    try {
      // Toggle logic: pending -> cleared -> flagged -> pending
      let newStatus = 'pending';
      if (purchase.status === 'pending' || purchase.status === 'submitted') {
        newStatus = 'bank_transfer';
        
        // Move to Reconciliation by creating a transaction
        await addDoc(collection(db, 'transactions'), {
          amount: purchase.grandTotal || purchase.amount || 0,
          date: new Date(),
          type: 'debit',
          description: `Payment to ${typeof purchase.vendor === 'string' ? purchase.vendor : purchase.vendor?.name || 'Vendor'}`,
          category: 'Purchase',
          match_status: 'pending_review',
          reference_number: purchase.invoice?.invoice_number || purchase.reference || purchase.id,
          metadata: { suggested_doc_id: purchase.id }
        });
        alert("Payment initiated! Moved to Bank Reconciliation.");
      }
      else if (purchase.status === 'bank_transfer') newStatus = 'cleared';
      else if (purchase.status === 'cleared') newStatus = 'flagged';
      else if (purchase.status === 'flagged') newStatus = 'pending';
      
      await updateDoc(doc(db, 'purchases', purchase.id), { status: newStatus });
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Failed to update status.");
    }
  };

  const filteredPurchases = purchases.filter(p => {
    const vendorName = typeof p.vendor === 'string' ? p.vendor : p.vendor?.name || '';
    const matchesSearch = vendorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           (p.reference && p.reference.toLowerCase().includes(searchTerm.toLowerCase())) ||
           (p.invoice?.invoice_number && p.invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDownloadReport = (format: 'excel' | 'pdf') => {
    if (format === 'excel') {
      const reportData = filteredPurchases.map(p => {
        const vendorName = typeof p.vendor === 'string' ? p.vendor : p.vendor?.name || '';
        const invoiceNum = p.invoice?.invoice_number || p.reference || 'N/A';
        const purchaseDate = p.date ? (p.date as any).toDate ? (p.date as any).toDate().toLocaleDateString('en-IN') : new Date(p.date as any).toLocaleDateString('en-IN') : 'N/A';
        return {
          'Purchase Reference/Invoice': invoiceNum,
          'Vendor': vendorName,
          'Date': purchaseDate,
          'Grand Total (₹)': p.grandTotal || p.amount || 0,
          'Category': p.category || 'General',
          'Status': p.status.toUpperCase()
        };
      });

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Purchases");
      XLSX.writeFile(wb, "Purchases_Report.xlsx");
    } else {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Purchases Report", 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

      autoTable(doc, {
        startY: 40,
        head: [['Invoice/Ref #', 'Vendor', 'Date', 'Grand Total', 'Category', 'Status']],
        body: filteredPurchases.map(p => {
          const vendorName = typeof p.vendor === 'string' ? p.vendor : p.vendor?.name || '';
          const invoiceNum = p.invoice?.invoice_number || p.reference || 'N/A';
          const purchaseDate = p.date ? (p.date as any).toDate ? (p.date as any).toDate().toLocaleDateString('en-IN') : new Date(p.date as any).toLocaleDateString('en-IN') : 'N/A';
          return [
            invoiceNum,
            vendorName,
            purchaseDate,
            `Rs. ${(p.grandTotal || p.amount || 0).toLocaleString()}`,
            p.category || 'General',
            p.status.toUpperCase()
          ];
        }),
        theme: 'striped',
      });
      doc.save("Purchases_Report.pdf");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark uppercase">Purchases</h1>
          <p className="text-secondary mt-1">Track and reconcile incoming inventory / services.</p>
        </div>
        <div className="flex gap-4 items-center">
          <VoiceDictation 
            onParsedItems={handleVoicePurchase} 
            functionName="parsePurchaseVoice" 
            label="Voice Purchase" 
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
          <button onClick={handleAddPurchase} className="neo-btn-primary flex items-center gap-2">
            <Plus size={20} />
            New Purchase
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
          <input 
            type="text"
            placeholder="Search vendors or reference numbers..."
            className="w-full neo-input !pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="neo-btn flex items-center justify-center gap-2">
          <Calendar size={18} />
          This Month
        </button>
        <div className="relative">
          <select 
            className="neo-btn !px-4 !pl-10 flex items-center justify-center gap-2 appearance-none cursor-pointer bg-surface"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cleared">Cleared</option>
            <option value="flagged">Flagged</option>
          </select>
          <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
        </div>
      </div>

      <div className="neo-card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-shadow-darker/5 border-b border-shadow-darker/10">
                <th className="p-4 font-bold text-secondary text-sm uppercase tracking-wider">Date</th>
                <th className="p-4 font-bold text-secondary text-sm uppercase tracking-wider">Vendor</th>
                <th className="p-4 font-bold text-secondary text-sm uppercase tracking-wider">Reference</th>
                <th className="p-4 font-bold text-secondary text-sm uppercase tracking-wider text-right">Amount</th>
                <th className="p-4 font-bold text-secondary text-sm uppercase tracking-wider text-center">Status</th>
                <th className="p-4 font-bold text-secondary text-sm uppercase tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shadow-darker/5">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="animate-spin mx-auto mb-2" /> Loading...</td></tr>
              ) : filteredPurchases.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-secondary py-12">No purchase records found.</td></tr>
              ) : filteredPurchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-shadow-darker/5 transition-colors">
                  <td className="p-4 text-secondary font-medium">
                    {purchase.createdAt?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) || purchase.date?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) || '-'}
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-primary-dark">{typeof purchase.vendor === 'string' ? purchase.vendor : purchase.vendor?.name || 'Unknown'}</div>
                    <div className="text-xs text-secondary">{purchase.category || 'General'}</div>
                  </td>
                  <td className="p-4 font-mono text-xs text-secondary">{purchase.invoice?.invoice_number || purchase.reference || 'N/A'}</td>
                  <td className="p-4 text-right font-black text-primary-dark">₹ {(purchase.grandTotal || purchase.amount || 0).toLocaleString()}</td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => toggleStatus(purchase)}
                      className={`cursor-pointer transition-colors px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        purchase.status === 'cleared' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 
                        purchase.status === 'bank_transfer' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                        purchase.status === 'flagged' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      }`}>
                      {purchase.status}
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => handleEditPurchase(purchase)}
                        className="p-2 text-secondary hover:text-primary transition-colors" 
                        title="Edit Purchase"
                      >
                         <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => deletePurchase(purchase.id)}
                        className="p-2 text-secondary hover:text-red-600 transition-colors" 
                        title="Delete Purchase"
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

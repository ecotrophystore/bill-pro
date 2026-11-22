import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Calendar, Filter, Loader2, Edit, Trash2, Download, ChevronDown, Eye } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Purchase } from '../types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExportReportModal from '../components/Shared/ExportReportModal';

export default function Purchases() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [previewPurchase, setPreviewPurchase] = useState<Purchase | null>(null);

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
    const vendorName = purchase.vendor?.name || '';
    const vendor = window.prompt("Enter new vendor name:", vendorName);
    if (!vendor) return;
    const amountVal = purchase.amount || purchase.grandTotal || 0;
    const amountStr = window.prompt("Enter new purchase amount (₹):", amountVal.toString());
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return;

    try {
      const updatedVendor = { ...purchase.vendor, name: vendor };
      await updateDoc(doc(db, 'purchases', purchase.id), { vendor: updatedVendor, amount });
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
          description: `Payment to ${purchase.vendor?.name || 'Vendor'}`,
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

  const handleDownloadReport = (options: { type: 'month' | 'fy' | 'custom', format: 'excel' | 'pdf' | 'bulk_pdf', startDate?: Date, endDate?: Date }) => {
    let filtered = filteredPurchases;

    const now = new Date();
    filtered = filtered.filter(p => {
      const pDate = p.date || p.createdAt;
      const date = pDate ? (pDate as any).toDate ? (pDate as any).toDate() : new Date(pDate as any) : new Date();
      if (options.type === 'month') {
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      } else if (options.type === 'fy') {
        const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const fyStart = new Date(startYear, 3, 1);
        const fyEnd = new Date(startYear + 1, 2, 31, 23, 59, 59);
        return date >= fyStart && date <= fyEnd;
      } else if (options.type === 'custom' && options.startDate && options.endDate) {
        const endOfDay = new Date(options.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        return date >= options.startDate && date <= endOfDay;
      }
      return true;
    });

    if (filtered.length === 0) {
      alert("No data found for the selected period.");
      return;
    }

    const format = options.format;

    if (format === 'bulk_pdf') {
      import('react-hot-toast').then(({ toast }) => {
        const toastId = toast.loading('Generating bulk PDFs... This may take a while.');
        import('jszip').then(async (JSZipModule) => {
          const JSZip = JSZipModule.default;
          import('file-saver').then(async (FileSaver) => {
            try {
              const zip = new JSZip();
              for (const purchase of filtered) {
                const doc = new jsPDF();
                doc.setFontSize(20);
                doc.text("Purchase Record", 14, 22);
                
                doc.setFontSize(12);
                doc.setTextColor(50);
                const vendorName = purchase.vendor?.name || 'Unknown Vendor';
                doc.text(`Vendor: ${vendorName}`, 14, 34);
                doc.text(`Category: ${purchase.category || 'General'}`, 14, 42);
                
                const pDate = purchase.date || purchase.createdAt;
                const dateStr = pDate ? (pDate as any).toDate ? (pDate as any).toDate().toLocaleDateString('en-IN') : new Date(pDate as any).toLocaleDateString('en-IN') : 'N/A';
                doc.text(`Date: ${dateStr}`, 130, 34);
                
                const ref = purchase.invoice?.invoice_number || purchase.reference || 'N/A';
                doc.text(`Reference: ${ref}`, 130, 42);
                
                doc.text(`Status: ${purchase.status.toUpperCase()}`, 130, 50);

                if (purchase.items && purchase.items.length > 0) {
                  autoTable(doc, {
                    startY: 60,
                    head: [['Item', 'Quantity', 'Unit Price', 'Total']],
                    body: purchase.items.map(item => [
                      item.itemName || 'Item',
                      (item.quantity || 1).toString(),
                      `Rs. ${(item.unitPrice || 0).toLocaleString()}`,
                      `Rs. ${(item.total || 0).toLocaleString()}`
                    ]),
                    theme: 'striped',
                  });
                  const finalY = (doc as any).lastAutoTable.finalY || 60;
                  doc.setFontSize(14);
                  doc.setTextColor(0);
                  doc.text(`Grand Total: Rs. ${(purchase.grandTotal || purchase.amount || 0).toLocaleString()}`, 130, finalY + 20);
                } else {
                  doc.setFontSize(14);
                  doc.setTextColor(0);
                  doc.text(`Grand Total: Rs. ${(purchase.grandTotal || purchase.amount || 0).toLocaleString()}`, 14, 60);
                }
                
                const blob = doc.output('blob');
                const filename = `Purchase_${ref}_${vendorName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
                zip.file(filename, blob);
              }
              const content = await zip.generateAsync({ type: 'blob' });
              FileSaver.saveAs(content, 'Purchases_Bulk.zip');
              toast.success('Bulk download complete!', { id: toastId });
            } catch (err) {
              console.error(err);
              toast.error('Failed to generate bulk PDFs', { id: toastId });
            }
          });
        });
      });
      return;
    }

    if (format === 'excel') {
      const reportData = filtered.map(p => {
        const vendorName = typeof p.vendor === 'string' ? p.vendor : p.vendor?.name || '';
        const invoiceNum = p.invoice?.invoice_number || p.reference || 'N/A';
        const pDate = p.date || p.createdAt;
        const purchaseDate = pDate ? (pDate as any).toDate ? (pDate as any).toDate().toLocaleDateString('en-IN') : new Date(pDate as any).toLocaleDateString('en-IN') : 'N/A';
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
        body: filtered.map(p => {
          const vendorName = typeof p.vendor === 'string' ? p.vendor : p.vendor?.name || '';
          const invoiceNum = p.invoice?.invoice_number || p.reference || 'N/A';
          const pDate = p.date || p.createdAt;
          const purchaseDate = pDate ? (pDate as any).toDate ? (pDate as any).toDate().toLocaleDateString('en-IN') : new Date(pDate as any).toLocaleDateString('en-IN') : 'N/A';
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
          <button 
            onClick={() => setIsExportModalOpen(true)} 
            className="neo-btn flex items-center gap-2"
          >
            <Download size={18} /> Export Report
          </button>
          <ExportReportModal 
            isOpen={isExportModalOpen} 
            onClose={() => setIsExportModalOpen(false)} 
            onExport={handleDownloadReport} 
          />
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
            className="neo-btn !px-4 !pl-10 flex items-center justify-center gap-2 appearance-none cursor-pointer bg-transparent"
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
          {/* Desktop Table View */}
          <table className="w-full text-left border-collapse hidden md:table">
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
                    <div className="font-bold text-primary-dark">{purchase.vendor?.name || 'Unknown'}</div>
                    <div className="text-xs text-secondary">{purchase.category || 'General'}</div>
                  </td>
                  <td className="p-4 font-mono text-xs text-secondary">{purchase.invoice?.invoice_number || purchase.reference || 'N/A'}</td>
                  <td className="p-4 text-right font-black text-primary-dark">₹ {(purchase.grandTotal || purchase.amount || 0).toLocaleString()}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => toggleStatus(purchase)}
                      className={`cursor-pointer transition-colors px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${purchase.status === 'cleared' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                          purchase.status === 'bank_transfer' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                            purchase.status === 'flagged' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        }`}>
                      {purchase.status}
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => setPreviewPurchase(purchase)}
                        className="p-2 text-secondary hover:text-primary transition-colors" 
                        title="Preview Purchase"
                      >
                         <Eye size={18} />
                      </button>
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

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-shadow-darker/10">
            {loading ? (
              <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto mb-2" /> Loading...</div>
            ) : filteredPurchases.length === 0 ? (
              <div className="p-8 text-center text-secondary py-12">No purchase records found.</div>
            ) : filteredPurchases.map((purchase) => (
              <div key={purchase.id} className="p-4 space-y-3 bg-transparent hover:bg-shadow-darker/5 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-primary-dark text-lg leading-tight">{purchase.vendor?.name || 'Unknown'}</div>
                    <div className="text-xs text-secondary mt-0.5">{purchase.category || 'General'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-primary-dark text-sm">₹ {(purchase.grandTotal || purchase.amount || 0).toLocaleString()}</div>
                    <div className="text-secondary font-medium text-xs mt-0.5">
                      {purchase.createdAt?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) || purchase.date?.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) || '-'}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <div className="font-mono text-[11px] text-secondary">
                    Ref: {purchase.invoice?.invoice_number || purchase.reference || 'N/A'}
                  </div>
                  <button
                    onClick={() => toggleStatus(purchase)}
                    className={`cursor-pointer transition-colors px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${purchase.status === 'cleared' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                        purchase.status === 'bank_transfer' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                          purchase.status === 'flagged' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      }`}>
                    {purchase.status}
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-shadow-darker/10">
                  <button 
                    onClick={() => setPreviewPurchase(purchase)}
                    className="flex-1 neo-btn flex justify-center items-center gap-2 py-2 text-secondary hover:text-primary transition-colors text-xs font-bold" 
                  >
                     <Eye size={14} /> Preview
                  </button>
                  <button
                    onClick={() => handleEditPurchase(purchase)}
                    className="flex-1 neo-btn flex justify-center items-center gap-2 py-2 text-secondary hover:text-primary transition-colors text-xs font-bold"
                  >
                    <Edit size={14} /> Edit
                  </button>
                  <button
                    onClick={() => deletePurchase(purchase.id)}
                    className="neo-btn flex justify-center items-center p-2 text-secondary hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {previewPurchase && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface rounded-card w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-neo-raised relative animate-slide-up p-8">
            <button
              onClick={() => setPreviewPurchase(null)}
              className="absolute top-4 right-4 p-2 text-secondary hover:text-primary transition-colors bg-shadow-darker/5 rounded-full"
            >
              ✕
            </button>
            <h2 className="text-2xl font-bold text-primary-dark mb-6">Purchase Details</h2>
            
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <p className="text-sm text-secondary font-semibold uppercase tracking-wider mb-1">Vendor</p>
                <p className="font-bold text-primary-dark text-lg">{previewPurchase.vendor?.name || 'Unknown'}</p>
                <p className="text-sm text-secondary">{previewPurchase.category || 'General'}</p>
              </div>
              <div>
                <p className="text-sm text-secondary font-semibold uppercase tracking-wider mb-1">Date</p>
                <p className="font-bold text-primary-dark text-lg">
                  {previewPurchase.createdAt?.toDate().toLocaleDateString('en-IN') || previewPurchase.date?.toDate().toLocaleDateString('en-IN') || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-secondary font-semibold uppercase tracking-wider mb-1">Reference / Invoice #</p>
                <p className="font-bold text-primary-dark text-lg">{previewPurchase.invoice?.invoice_number || previewPurchase.reference || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-secondary font-semibold uppercase tracking-wider mb-1">Total Amount</p>
                <p className="font-bold text-primary-dark text-lg">₹ {(previewPurchase.grandTotal || previewPurchase.amount || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-secondary font-semibold uppercase tracking-wider mb-1">Status</p>
                <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        previewPurchase.status === 'cleared' ? 'bg-green-100 text-green-700' : 
                        previewPurchase.status === 'bank_transfer' ? 'bg-blue-100 text-blue-700' :
                        previewPurchase.status === 'flagged' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                  {previewPurchase.status}
                </span>
              </div>
            </div>

            {previewPurchase.items && previewPurchase.items.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-primary-dark mb-4">Line Items</h3>
                <div className="border border-shadow-darker/10 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-shadow-darker/5 border-b border-shadow-darker/10">
                      <tr>
                        <th className="p-3 text-sm font-semibold text-secondary">Item</th>
                        <th className="p-3 text-sm font-semibold text-secondary text-right">Qty</th>
                        <th className="p-3 text-sm font-semibold text-secondary text-right">Price</th>
                        <th className="p-3 text-sm font-semibold text-secondary text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-shadow-darker/5">
                      {previewPurchase.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-3 font-medium text-primary-dark">{item.itemName || 'Item'}</td>
                          <td className="p-3 text-right">{item.quantity || 1}</td>
                          <td className="p-3 text-right">₹ {(item.unitPrice || 0).toLocaleString()}</td>
                          <td className="p-3 text-right font-bold text-primary-dark">₹ {(item.total || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


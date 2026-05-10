import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Calendar, Filter, Loader2, X, Eye, ChevronDown, Camera, Sparkles } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '../components/Shared/Toast';
import type { Purchase } from '../types';

type DateFilter = 'all' | 'this_month' | 'last_month' | 'this_quarter';
type StatusFilter = 'all' | 'pending' | 'cleared' | 'flagged';

export default function Purchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const { showToast } = useToast();
  const [newPurchase, setNewPurchase] = useState<Partial<Purchase>>({
    vendor: '',
    amount: 0,
    category: '',
    reference: '',
    status: 'pending'
  });
  const [isScanning, setIsScanning] = useState(false);

  const handleScanBill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const funcs = functions;
    if (!file || !funcs) return;

    setIsScanning(true);
    showToast('AI is analyzing your bill...', 'info');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const processFn = httpsCallable<{ imageBase64: string }, any>(funcs, 'processBillPhoto');
        const result = await processFn({ imageBase64: base64 });
        
        if (result.data.success && result.data.data) {
          const info = result.data.data;
          setNewPurchase({
            vendor: info.vendorName || '',
            amount: info.totalAmount || info.subtotal || 0,
            reference: info.invoiceNumber || '',
            category: 'Inventory', // Default for AI scan
            status: 'pending'
          });
          setIsAddModalOpen(true); // Open modal with parsed data
          showToast('AI successfully parsed the bill!', 'success');
        } else {
          showToast('AI couldn\'t extract clear data. Please enter manually.', 'warning');
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Scan error:', err);
      showToast('AI analysis failed. Try again.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'purchases'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setPurchases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Purchase)));
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching purchases:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!db) return;
      await addDoc(collection(db, 'purchases'), {
        ...newPurchase,
        date: serverTimestamp()
      });
      setIsAddModalOpen(false);
      setNewPurchase({ vendor: '', amount: 0, category: '', reference: '', status: 'pending' });
      showToast('Purchase recorded successfully!', 'success');
    } catch (err) {
      console.error("Error adding purchase:", err);
      showToast('Failed to add purchase. Check permissions.', 'error');
    }
  };

  const filteredPurchases = useMemo(() => {
    let result = purchases;

    // Search filter
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.vendor.toLowerCase().includes(q) ||
        p.reference?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      result = result.filter(p => {
        if (!p.date?.toDate) return false;
        const pDate = p.date.toDate();
        const pMonth = pDate.getMonth();
        const pYear = pDate.getFullYear();

        switch (dateFilter) {
          case 'this_month':
            return pMonth === currentMonth && pYear === currentYear;
          case 'last_month': {
            const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            return pMonth === lastMonth && pYear === lastMonthYear;
          }
          case 'this_quarter': {
            const quarterStart = Math.floor(currentMonth / 3) * 3;
            return pMonth >= quarterStart && pMonth <= currentMonth && pYear === currentYear;
          }
          default: return true;
        }
      });
    }

    return result;
  }, [purchases, searchTerm, statusFilter, dateFilter]);

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark uppercase">Purchases</h1>
          <p className="text-secondary mt-1">Track and reconcile incoming inventory / services.</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="neo-btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          New Purchase
        </button>
      </div>

      {/* AI Vision Promo Card */}
      <div className="neo-card bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-2xl text-primary shadow-neo-inset">
            <Sparkles size={24} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-black text-primary-dark uppercase tracking-tight italic">EcoBill Vision OCR</h3>
            <p className="text-xs text-secondary font-medium">Upload a photo of your purchase bill. EcoBill 2050 AI will extract vendor, amount, and items automatically.</p>
          </div>
        </div>
        <label className="neo-btn-primary !bg-tertiary hover:!bg-tertiary-dark !border-tertiary flex items-center gap-2 cursor-pointer shadow-neo-raised hover:translate-y-[-2px] transition-all">
          {isScanning ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
          <span>{isScanning ? 'Processing...' : 'Scan Bill'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleScanBill} disabled={isScanning} />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
          <input 
            type="text"
            placeholder="Search vendors, reference numbers, or categories..."
            className="w-full neo-input !pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {/* Date Filter Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setDateFilter(dateFilter === 'this_month' ? 'all' : 'this_month')}
            className={`neo-btn flex items-center justify-center gap-2 w-full transition-all ${
              dateFilter === 'this_month' ? 'bg-primary text-surface shadow-neo-pressed' : ''
            }`}
          >
            <Calendar size={18} />
            {dateFilter === 'all' ? 'All Time' : dateFilter === 'this_month' ? 'This Month' : dateFilter === 'last_month' ? 'Last Month' : 'This Quarter'}
          </button>
        </div>
        {/* Status Filter */}
        <button 
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className={`neo-btn flex items-center justify-center gap-2 transition-all ${
            statusFilter !== 'all' ? 'bg-primary text-surface shadow-neo-pressed' : ''
          }`}
        >
          <Filter size={18} />
          Filter {statusFilter !== 'all' && `(${statusFilter})`}
          <ChevronDown size={14} className={showFilterPanel ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (
        <div className="neo-card !py-3 flex flex-wrap gap-3 items-center animate-fade-in">
          <span className="text-xs font-bold text-secondary uppercase tracking-wider">Date:</span>
          {(['all', 'this_month', 'last_month', 'this_quarter'] as DateFilter[]).map(d => (
            <button 
              key={d}
              onClick={() => setDateFilter(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                dateFilter === d ? 'bg-primary text-surface' : 'bg-shadow-darker/5 text-secondary hover:bg-primary/10'
              }`}
            >
              {d === 'all' ? 'All Time' : d === 'this_month' ? 'This Month' : d === 'last_month' ? 'Last Month' : 'This Quarter'}
            </button>
          ))}
          <div className="w-px h-6 bg-shadow-darker/20 mx-2"></div>
          <span className="text-xs font-bold text-secondary uppercase tracking-wider">Status:</span>
          {(['all', 'pending', 'cleared', 'flagged'] as StatusFilter[]).map(s => (
            <button 
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === s ? 'bg-primary text-surface' : 'bg-shadow-darker/5 text-secondary hover:bg-primary/10'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          {(statusFilter !== 'all' || dateFilter !== 'all') && (
            <button
              onClick={() => { setStatusFilter('all'); setDateFilter('all'); setShowFilterPanel(false); }}
              className="ml-auto text-xs font-bold text-error hover:underline"
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}

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
                <tr><td colSpan={6} className="p-8 text-center text-secondary py-12">
                  {searchTerm || statusFilter !== 'all' || dateFilter !== 'all' 
                    ? 'No purchases match your filters.' 
                    : 'No purchase records found.'}
                </td></tr>
              ) : filteredPurchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-shadow-darker/5 transition-colors">
                  <td className="p-4 text-secondary font-medium">
                    {purchase.date?.toDate ? purchase.date.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Pending'}
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-primary-dark">{purchase.vendor}</div>
                    <div className="text-xs text-secondary">{purchase.category}</div>
                  </td>
                  <td className="p-4 font-mono text-xs text-secondary">{purchase.reference || 'N/A'}</td>
                  <td className="p-4 text-right font-black text-primary-dark">₹ {purchase.amount.toLocaleString()}</td>
                  <td className="p-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      purchase.status === 'cleared' ? 'bg-green-100 text-green-700' : 
                      purchase.status === 'flagged' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => setSelectedPurchase(purchase)}
                      className="p-2 text-secondary hover:text-primary-dark transition-colors" 
                      title="View Details"
                    >
                       <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purchase Detail Modal */}
      {selectedPurchase && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="neo-card w-full max-w-md animate-scale-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-primary-dark">Purchase Details</h2>
              <button onClick={() => setSelectedPurchase(null)} className="neo-btn !p-2 !rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-secondary uppercase tracking-wider">Vendor</label>
                  <p className="text-sm font-bold text-primary-dark">{selectedPurchase.vendor}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-secondary uppercase tracking-wider">Category</label>
                  <p className="text-sm font-bold text-primary-dark">{selectedPurchase.category || 'Uncategorized'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-secondary uppercase tracking-wider">Reference</label>
                  <p className="text-sm font-mono text-primary-dark">{selectedPurchase.reference || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-secondary uppercase tracking-wider">Date</label>
                  <p className="text-sm font-bold text-primary-dark">
                    {selectedPurchase.date?.toDate ? selectedPurchase.date.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Pending'}
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t border-shadow-darker/10 flex justify-between items-center">
                <div>
                  <label className="text-[10px] font-black text-secondary uppercase tracking-wider">Amount</label>
                  <p className="text-2xl font-black text-primary-dark">₹ {selectedPurchase.amount.toLocaleString()}</p>
                </div>
                <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase ${
                  selectedPurchase.status === 'cleared' ? 'bg-green-100 text-green-700' : 
                  selectedPurchase.status === 'flagged' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {selectedPurchase.status}
                </span>
              </div>
            </div>
            <button onClick={() => setSelectedPurchase(null)} className="neo-btn w-full mt-6 py-3">Close</button>
          </div>
        </div>
      )}

      {/* Add Purchase Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="neo-card w-full max-w-lg animate-scale-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-primary-dark">Record New Purchase</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="neo-btn !p-2 !rounded-full">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddPurchase} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Vendor / Supplier Name</label>
                  <input 
                    required
                    className="neo-input w-full"
                    value={newPurchase.vendor}
                    onChange={e => setNewPurchase({...newPurchase, vendor: e.target.value})}
                    placeholder="e.g. Raw Material Co."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Category</label>
                  <input 
                    className="neo-input w-full"
                    value={newPurchase.category}
                    onChange={e => setNewPurchase({...newPurchase, category: e.target.value})}
                    placeholder="e.g. Inventory"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Reference #</label>
                  <input 
                    className="neo-input w-full"
                    value={newPurchase.reference}
                    onChange={e => setNewPurchase({...newPurchase, reference: e.target.value})}
                    placeholder="Bill No or PO #"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Total Amount (₹)</label>
                  <input 
                    type="number"
                    required
                    className="neo-input w-full"
                    value={newPurchase.amount}
                    onChange={e => setNewPurchase({...newPurchase, amount: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Initial Status</label>
                  <select 
                    className="neo-input w-full"
                    value={newPurchase.status}
                    onChange={e => setNewPurchase({...newPurchase, status: e.target.value as any})}
                  >
                    <option value="pending">Pending</option>
                    <option value="cleared">Cleared</option>
                    <option value="flagged">Flagged</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="neo-btn flex-1 py-3">Cancel</button>
                <button type="submit" className="neo-btn-primary flex-1 py-3">Save Purchase</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

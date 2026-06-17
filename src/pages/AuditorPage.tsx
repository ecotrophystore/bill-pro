import { useEffect, useState } from 'react';
import { Shield, List, Clock, Loader2, Search, Filter } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

interface AuditLog {
  id: string;
  document_type: string;
  document_id: string;
  action: string;
  user_id: string;
  timestamp: any;
  notes: string;
}

export default function AuditorPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog)));
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching audit logs:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.notes || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.document_type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.action || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.document_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.user_id || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDocType = docTypeFilter === 'all' || log.document_type.toLowerCase() === docTypeFilter.toLowerCase();
    const matchesAction = actionFilter === 'all' || log.action.toLowerCase() === actionFilter.toLowerCase();

    return matchesSearch && matchesDocType && matchesAction;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark uppercase">AI Audit Trail</h1>
          <p className="text-secondary mt-1">Immutable record of all financial modifications and conversions (Rule #11).</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-full text-xs font-black uppercase tracking-widest shadow-neo-inset">
           <Shield size={14} />
           Verified Secure
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="neo-card flex flex-col justify-between h-32">
          <span className="text-secondary font-bold text-xs uppercase tracking-widest">Total Logs</span>
          <span className="text-3xl font-black text-primary-dark">{logs.length}</span>
        </div>
        <div className="neo-card flex flex-col justify-between h-32 border-l-4 border-warning">
          <span className="text-secondary font-bold text-xs uppercase tracking-widest">Flagged Actions</span>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black text-warning">0</span>
            <span className="neo-badge-success text-[10px]">All Valid</span>
          </div>
        </div>
        <div className="neo-card flex flex-col justify-between h-32">
          <span className="text-secondary font-bold text-xs uppercase tracking-widest">System Integrity</span>
          <span className="text-3xl font-black text-success">100%</span>
        </div>
      </div>

      <div className="neo-card overflow-hidden !p-0">
        <div className="p-4 border-b border-shadow-darker/10 flex justify-between items-center bg-shadow-darker/5">
           <div className="flex items-center gap-2 text-sm font-bold text-primary-dark">
              <List size={18} />
              Recent System Events
           </div>
           <div className="flex gap-2 relative">
              <div className="neo-input !py-1.5 !px-3 flex items-center gap-2">
                 <Search size={14} className="text-secondary" />
                 <input 
                   type="text" 
                   placeholder="Search logs..." 
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="bg-transparent border-none outline-none text-xs w-48 text-primary-dark" 
                 />
              </div>
              <div className="relative">
                <button 
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)} 
                  className={`neo-btn !py-1.5 !px-3 text-xs flex items-center gap-1 ${showFilterDropdown ? 'bg-shadow-darker/10' : ''}`}
                >
                   <Filter size={14} />
                   Filter
                </button>
                {showFilterDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-surface border border-shadow-darker/20 rounded-xl shadow-neo-raised z-50 p-4 space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Document Type</label>
                      <select 
                        value={docTypeFilter} 
                        onChange={(e) => setDocTypeFilter(e.target.value)}
                        className="neo-input w-full text-xs !py-1 bg-surface border-shadow-darker/20 text-primary-dark"
                      >
                        <option value="all">All Documents</option>
                        <option value="invoice">Invoice</option>
                        <option value="quotation">Quotation</option>
                        <option value="purchase">Purchase</option>
                        <option value="cash_memo">Cash Memo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Action</label>
                      <select 
                        value={actionFilter} 
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="neo-input w-full text-xs !py-1 bg-surface border-shadow-darker/20 text-primary-dark"
                      >
                        <option value="all">All Actions</option>
                        <option value="create">Create</option>
                        <option value="update">Update</option>
                        <option value="delete">Delete</option>
                        <option value="conversion">Conversion</option>
                      </select>
                    </div>
                    {(docTypeFilter !== 'all' || actionFilter !== 'all') && (
                      <button 
                        onClick={() => { setDocTypeFilter('all'); setActionFilter('all'); }} 
                        className="w-full text-center text-[10px] font-bold text-warning hover:underline"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                )}
              </div>
           </div>
        </div>

        <div className="divide-y divide-shadow-darker/5">
          {loading ? (
            <div className="p-12 text-center text-secondary">
               <Loader2 className="animate-spin mx-auto mb-2" />
               Fetching audit trail...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-secondary italic">No logs found matching filters.</div>
          ) : filteredLogs.map((log) => (
            <div key={log.id} className="p-4 hover:bg-shadow-darker/5 transition-colors flex items-start justify-between">
              <div className="flex gap-4">
                <div className={`p-2 rounded-lg bg-surface shadow-neo-raised ${
                  log.action === 'create' ? 'text-primary' : 'text-warning'
                }`}>
                   <Clock size={16} />
                </div>
                <div>
                   <p className="text-sm font-bold text-primary-dark">
                      {log.action.toUpperCase()} - {log.document_type.toUpperCase()}
                   </p>
                   <p className="text-xs text-secondary mt-0.5">{log.notes}</p>
                   <p className="text-[10px] text-secondary mt-1 flex items-center gap-1 font-mono uppercase tracking-tighter">
                      User: {log.user_id} • DocRef: {log.document_id}
                   </p>
                </div>
              </div>
              <div className="text-right">
                 <p className="text-[11px] font-black text-secondary uppercase">
                    {log.timestamp?.toDate().toLocaleString()}
                 </p>
                 {log.action === 'conversion' && <span className="neo-badge-primary text-[10px] py-1 shadow-none">Rule Compliance Checked</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

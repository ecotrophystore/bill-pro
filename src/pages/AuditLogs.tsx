import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot, startAfter, getDocs } from "firebase/firestore";
import { ShieldAlert, Loader2, XCircle, ChevronDown, Filter } from "lucide-react";
import { db } from "../lib/firebase";
import type { AuditLog } from "../types";
import { useCRMPermission } from "../hooks/useCRMPermission";

function formatDate(value: any) {
  if (!value) return "-";
  if (typeof value.toDate === "function") return value.toDate().toLocaleString();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toLocaleString();
  const d = new Date(value);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

const ACTION_BADGE: Record<string, string> = {
  create: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  update: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  delete: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  permission_change: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  price_change: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  reconciliation: "bg-teal-500/15 text-teal-700 border-teal-500/30",
  automation_edit: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
};

const DOC_TYPE_LABEL: Record<string, string> = {
  lead: "Lead",
  invoice: "Invoice",
  cash_memo: "Cash Memo",
  proforma_invoice: "Proforma Invoice",
  quotation: "Quotation",
  permission: "Permission",
  settings: "Settings",
};

const PAGE_SIZE = 25;

export default function AuditLogs() {
  const { hasPermission } = useCRMPermission();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    if (!db) return;
    setLoading(true);
    const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(PAGE_SIZE + 1));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.slice(0, PAGE_SIZE).map((d) => ({ id: d.id, ...d.data() } as AuditLog));
      setLogs(items);
      setLastDoc(snap.docs[PAGE_SIZE - 1] || null);
      setHasMore(snap.docs.length > PAGE_SIZE);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const loadMore = async () => {
    if (!db || !lastDoc) return;
    setLoadingMore(true);
    const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), startAfter(lastDoc), limit(PAGE_SIZE + 1));
    const snap = await getDocs(q);
    const items = snap.docs.slice(0, PAGE_SIZE).map((d) => ({ id: d.id, ...d.data() } as AuditLog));
    setLogs((prev) => [...prev, ...items]);
    setLastDoc(snap.docs[PAGE_SIZE - 1] || null);
    setHasMore(snap.docs.length > PAGE_SIZE);
    setLoadingMore(false);
  };

  const filtered = logs.filter((log) => {
    const matchDocType = docTypeFilter === "all" || log.document_type === docTypeFilter;
    const matchAction = actionFilter === "all" || log.action === actionFilter;
    return matchDocType && matchAction;
  });

  if (!hasPermission("view_audit_logs")) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
        <XCircle size={48} className="text-error opacity-40" />
        <p className="text-secondary font-semibold">You do not have permission to view audit logs.</p>
        <p className="text-xs text-secondary opacity-60">Only admins can access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark flex items-center gap-2">
            <ShieldAlert size={28} className="text-primary" />
            Audit Logs
          </h1>
          <p className="text-secondary mt-1">Append-only trail of all changes across leads, billing, and permissions.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="neo-card flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2 neo-input">
          <Filter size={15} className="text-secondary" />
          <select
            className="bg-transparent border-none outline-none text-sm"
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="lead">Lead</option>
            <option value="invoice">Invoice</option>
            <option value="cash_memo">Cash Memo</option>
            <option value="proforma_invoice">Proforma Invoice</option>
            <option value="quotation">Quotation</option>
            <option value="permission">Permission</option>
            <option value="settings">Settings</option>
          </select>
        </div>
        <div className="flex items-center gap-2 neo-input">
          <Filter size={15} className="text-secondary" />
          <select
            className="bg-transparent border-none outline-none text-sm"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="all">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="permission_change">Permission Change</option>
            <option value="price_change">Price Change</option>
            <option value="reconciliation">Reconciliation</option>
            <option value="automation_edit">Automation Edit</option>
          </select>
        </div>
        <span className="text-xs text-secondary ml-auto">{filtered.length} entries shown</span>
      </div>

      {/* Log table */}
      <div className="neo-card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-primary-dark" size={36} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-secondary opacity-50">
            <ShieldAlert size={36} className="mx-auto mb-3 opacity-20" />
            No audit log entries found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-secondary text-xs uppercase tracking-widest border-b border-shadow-darker/10 bg-surface/80">
                    <th className="px-5 py-3 font-semibold">Timestamp</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Document ID</th>
                    <th className="px-5 py-3 font-semibold">User</th>
                    <th className="px-5 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-b border-shadow-darker/5 hover:bg-shadow-darker/3 transition-colors">
                      <td className="px-5 py-3.5 text-secondary whitespace-nowrap text-xs">{formatDate(log.timestamp)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${ACTION_BADGE[log.action] || "bg-secondary/10 text-secondary border-secondary/20"}`}>
                          {log.action.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-primary-dark capitalize">
                        {DOC_TYPE_LABEL[log.document_type] || log.document_type}
                      </td>
                      <td className="px-5 py-3.5 text-secondary font-mono text-xs truncate max-w-[140px]">{log.document_id}</td>
                      <td className="px-5 py-3.5 text-secondary text-xs truncate max-w-[120px]">{log.user_id || "—"}</td>
                      <td className="px-5 py-3.5 text-secondary text-xs truncate max-w-[200px]">{log.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex justify-center py-5 border-t border-shadow-darker/10">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="neo-btn inline-flex items-center gap-2 text-sm"
                >
                  {loadingMore ? <Loader2 size={15} className="animate-spin" /> : <ChevronDown size={15} />}
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

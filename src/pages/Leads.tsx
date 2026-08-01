import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';
import { ArrowRight, Filter, Search, UserPlus, Trash2 } from 'lucide-react';
import { db } from '../lib/firebase';
import type { Lead } from '../types';
import { useCRMPermission } from '../hooks/useCRMPermission';

function formatDate(value: any) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toLocaleString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [platform, setPlatform] = useState('all');
  const { hasPermission } = useCRMPermission();

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!hasPermission('edit_lead')) {
      alert("You do not have permission to delete leads.");
      return;
    }
    if (window.confirm("Are you sure you want to delete this lead?")) {
      try {
        await deleteDoc(doc(db, 'leads', id));
      } catch (error) {
        console.error('Failed to delete lead', error);
        alert('Failed to delete lead.');
      }
    }
  };

  useEffect(() => {
    if (!db) return;

    const q = query(collection(db, 'leads'));
    const unsub = onSnapshot(q, (snapshot) => {
      setLeads(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Lead)));
      setLoading(false);
    }, (error) => {
      console.error('Leads load failed', error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesText = !text || [lead.name, lead.phone, lead.email, lead.source, lead.campaign, lead.id].some((value) => String(value || '').toLowerCase().includes(text));
      const matchesStatus = status === 'all' || lead.status === status;
      const matchesPlatform = platform === 'all' || lead.platform === platform;
      return matchesText && matchesStatus && matchesPlatform;
    });
  }, [leads, search, status, platform]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Leads</h1>
          <p className="text-secondary mt-1">Browse all CRM leads in one place.</p>
        </div>
        {hasPermission('create_lead') && (
          <Link to="/leads/new" className="neo-btn-primary inline-flex items-center gap-2">
            <UserPlus size={16} /> Add Lead
          </Link>
        )}
      </div>


      <div className="neo-card space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 neo-input w-full lg:max-w-xl">
            <Search size={18} className="text-secondary" />
            <input
              className="bg-transparent border-none outline-none w-full"
              placeholder="Search name, phone, email, source, campaign, lead id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="neo-input flex items-center gap-2">
              <Filter size={16} className="text-secondary" />
              <select className="bg-transparent border-none outline-none" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div className="neo-input flex items-center gap-2">
              <Filter size={16} className="text-secondary" />
              <select className="bg-transparent border-none outline-none" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="all">All Platforms</option>
                <option value="manual">Manual</option>
                <option value="meta">Meta</option>
                <option value="google">Google</option>
                <option value="test">Test</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-secondary">Loading leads...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-secondary border border-dashed border-shadow-darker/20 rounded-xl">
            No leads found. Add one or use the manual lead form.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-secondary border-b border-shadow-darker/10">
                  <th className="py-3 pr-4 font-semibold">Lead</th>
                  <th className="py-3 pr-4 font-semibold">Source</th>
                  <th className="py-3 pr-4 font-semibold">Platform</th>
                  <th className="py-3 pr-4 font-semibold">Status</th>
                  <th className="py-3 pr-4 font-semibold">Created</th>
                  <th className="py-3 pr-4 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id} className="border-b border-shadow-darker/5">
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-primary-dark">{lead.name}</div>
                      <div className="text-xs text-secondary">{lead.phone || '-'} {lead.email ? `• ${lead.email}` : ''}</div>
                    </td>
                    <td className="py-4 pr-4 text-secondary">{lead.source}</td>
                    <td className="py-4 pr-4 capitalize">{lead.platform}</td>
                    <td className="py-4 pr-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest ${
                        lead.status === 'new' ? 'bg-secondary/10 text-secondary' : lead.status === 'contacted' ? 'bg-warning/10 text-warning' : lead.status === 'qualified' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-secondary whitespace-nowrap">{formatDate(lead.created_at)}</td>
                    <td className="py-4 pr-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link to={`/leads/${lead.id}`} className="inline-flex items-center gap-1 text-primary-dark font-semibold hover:underline">
                          Open <ArrowRight size={14} />
                        </Link>
                        {hasPermission('edit_lead') && (
                          <button
                            onClick={(e) => handleDelete(lead.id, e)}
                            className="p-1 text-error hover:bg-error/10 rounded transition-colors"
                            title="Delete Lead"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


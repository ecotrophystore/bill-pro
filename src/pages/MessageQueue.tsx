import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { AlertCircle, Loader2, RefreshCw, Send } from 'lucide-react';
import { db } from '../lib/firebase';
import type { MessageQueueItem } from '../types';

function formatTs(value: any) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toLocaleString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

export default function MessageQueue() {
  const [items, setItems] = useState<MessageQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db) return;

    const q = query(collection(db, 'message_queue'), orderBy('created_at', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as MessageQueueItem)));
      setLoading(false);
      setError('');
    }, (err) => {
      console.error('Message queue load failed', err);
      setError(err?.message || 'Could not load message queue.');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    const queued = items.filter((item) => item.status === 'queued').length;
    const sent = items.filter((item) => item.status === 'sent').length;
    const failed = items.filter((item) => item.status === 'failed').length;
    return { queued, sent, failed };
  }, [items]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Message Queue</h1>
          <p className="text-secondary mt-1">Queued template messages and their delivery status.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="neo-card !p-3 min-w-28">
            <div className="text-[10px] uppercase tracking-[0.2em] text-secondary">Queued</div>
            <div className="text-2xl font-black text-warning">{stats.queued}</div>
          </div>
          <div className="neo-card !p-3 min-w-28">
            <div className="text-[10px] uppercase tracking-[0.2em] text-secondary">Sent</div>
            <div className="text-2xl font-black text-success">{stats.sent}</div>
          </div>
          <div className="neo-card !p-3 min-w-28">
            <div className="text-[10px] uppercase tracking-[0.2em] text-secondary">Failed</div>
            <div className="text-2xl font-black text-error">{stats.failed}</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="neo-card !p-3 bg-warning/5 border border-warning/20 text-sm text-primary-dark flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 text-warning" />
          <span>{error}</span>
        </div>
      )}

      <div className="neo-card space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-primary-dark flex items-center gap-2"><Send size={18} /> Queue log</h2>
            <p className="text-sm text-secondary">Every queued message stays visible here for quick review.</p>
          </div>
          <button onClick={() => window.location.reload()} className="neo-btn !px-3 !py-2 flex items-center gap-2 text-sm">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center text-secondary">
            <Loader2 className="animate-spin mr-2" size={18} /> Loading message queue...
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-secondary border border-dashed border-shadow-darker/20 rounded-xl">
            No queued messages yet. Queue one from a lead detail page.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-secondary border-b border-shadow-darker/10">
                  <th className="py-3 pr-4 font-semibold">Time</th>
                  <th className="py-3 pr-4 font-semibold">Lead</th>
                  <th className="py-3 pr-4 font-semibold">Template</th>
                  <th className="py-3 pr-4 font-semibold">Channel</th>
                  <th className="py-3 pr-4 font-semibold">Status</th>
                  <th className="py-3 pr-4 font-semibold">Message</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-shadow-darker/5 align-top">
                    <td className="py-3 pr-4 whitespace-nowrap text-secondary">{formatTs(item.created_at)}</td>
                    <td className="py-3 pr-4">
                      <Link to={`/leads/${item.lead_id}`} className="font-semibold text-primary-dark hover:underline">
                        {item.lead_id}
                      </Link>
                      <div className="text-xs text-secondary">Pipeline: {item.pipeline_id}</div>
                    </td>
                    <td className="py-3 pr-4">{item.template_id}</td>
                    <td className="py-3 pr-4 capitalize">{item.channel}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest ${
                        item.status === 'queued'
                          ? 'bg-warning/10 text-warning'
                          : item.status === 'sent'
                            ? 'bg-success/10 text-success'
                            : item.status === 'failed'
                              ? 'bg-error/10 text-error'
                              : 'bg-secondary/10 text-secondary'
                      }`}>
                        {item.status}
                      </span>
                      {item.error && <div className="text-xs text-error mt-1">{item.error}</div>}
                    </td>
                    <td className="py-3 pr-4 max-w-[420px]">
                      <div className="font-semibold text-primary-dark">{item.subject || 'No subject'}</div>
                      <div className="text-xs text-secondary mt-1 whitespace-pre-wrap line-clamp-3">{item.body}</div>
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
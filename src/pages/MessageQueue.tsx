import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { AlertCircle, Loader2, RefreshCw, Send, CheckCircle2 } from 'lucide-react';
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
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState('');

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

  const handleDispatchQueue = async () => {
    if (!db) return;
    const queuedItems = items.filter(i => i.status === 'queued');
    if (queuedItems.length === 0) return;

    setDispatching(true);
    setDispatchResult('');
    let successCount = 0;
    let failCount = 0;

    const token = "EAAP5CXj9PZA0BSZArJ0rvk8MMj0L90vBkzBNs6lhFeYwCEFv4ko0dj49kmqxRKwTZBsWhO18Ecsk4ZCQ4V6xLJtZCD2h2NAb3U9eakgQZCYELZAkQqPY300LngHx9DmeoOE3WBGTtASRr5XfjfBp1x0vmjKS6sf8dsKdDGIOvbtTM2QZBccvuBxS6hZCdg5QmhAZDZD";
    const phoneId = "1292217613971980";

    for (const item of queuedItems) {
      try {
        let recipientPhone = item.recipient || (item as any).phone;
        if (!recipientPhone && item.lead_id) {
          try {
            const leadSnap = await getDoc(doc(db, 'leads', item.lead_id));
            if (leadSnap.exists()) {
              recipientPhone = leadSnap.data()?.phone;
            }
          } catch (e) {
            console.warn('Could not fetch lead doc:', e);
          }
        }

        if (!recipientPhone) {
          recipientPhone = '918148936699';
        }

        const cleanDigits = String(recipientPhone).replace(/\D/g, '');
        const finalPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

        const templateName = 'hello_world';

        const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: finalPhone,
            type: 'template',
            template: {
              name: templateName,
              language: { code: 'en_US' }
            }
          })
        });

        const data = await res.json();
        if (data.messages && data.messages[0]?.id) {
          await updateDoc(doc(db, 'message_queue', item.id), {
            status: 'sent',
            metaMessageId: data.messages[0].id,
            sent_at: serverTimestamp(),
            updated_at: serverTimestamp()
          });
          successCount++;
        } else {
          await updateDoc(doc(db, 'message_queue', item.id), {
            status: 'failed',
            error: data.error?.message || 'Meta API delivery error',
            updated_at: serverTimestamp()
          });
          failCount++;
        }
      } catch (err: any) {
        console.error('Failed to dispatch item:', item.id, err);
        failCount++;
      }
    }

    setDispatching(false);
    setDispatchResult(`Processed: ${successCount} sent successfully, ${failCount} failed.`);
  };

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

      {dispatchResult && (
        <div className="neo-card !p-3 bg-success/5 border border-success/20 text-sm text-success flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{dispatchResult}</span>
        </div>
      )}

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
          <div className="flex items-center gap-2">
            {stats.queued > 0 && (
              <button 
                onClick={handleDispatchQueue} 
                disabled={dispatching}
                className="neo-btn-primary !px-4 !py-2 flex items-center gap-2 text-sm"
              >
                {dispatching ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Dispatch Pending ({stats.queued})
              </button>
            )}
            <button onClick={() => window.location.reload()} className="neo-btn !px-3 !py-2 flex items-center gap-2 text-sm">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
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
            <table className="w-full text-sm hidden md:table">
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

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-shadow-darker/10">
              {items.map((item) => (
                <div key={item.id} className="py-4 space-y-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <Link to={`/leads/${item.lead_id}`} className="font-bold text-primary-dark hover:underline truncate block">
                        {item.lead_id}
                      </Link>
                      <div className="text-[10px] text-secondary mt-0.5">{item.pipeline_id}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
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
                      <div className="text-[10px] text-secondary mt-1">{formatTs(item.created_at)}</div>
                    </div>
                  </div>

                  <div className="bg-shadow-darker/5 p-2 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-secondary font-medium">Template:</span>
                      <span className="font-semibold text-primary-dark">{item.template_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary font-medium">Channel:</span>
                      <span className="text-secondary capitalize">{item.channel}</span>
                    </div>
                  </div>

                  {item.error && (
                    <div className="text-[10px] text-error font-semibold bg-error/5 p-2 rounded-lg border border-error/10">
                      Error: {item.error}
                    </div>
                  )}

                  <div className="text-xs text-secondary bg-white p-2 border border-shadow-darker/10 rounded-lg">
                    <div className="font-semibold text-primary-dark pb-1 border-b border-shadow-darker/5 mb-1">{item.subject || 'No subject'}</div>
                    <div className="whitespace-pre-wrap line-clamp-3">{item.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

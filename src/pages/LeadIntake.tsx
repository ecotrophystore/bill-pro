import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { AlertCircle, ArrowRight, Loader2, RefreshCw, Send } from 'lucide-react';
import { db } from '../lib/firebase';
import { testLeadIngestHttp } from '../lib/testLeadIngest';
import type { Lead, LeadIntakeEvent, LeadPlatform, Pipeline } from '../types';

function formatTs(value: any) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toLocaleString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function sourceLabel(platform: LeadPlatform) {
  if (platform === 'meta') return 'Meta';
  if (platform === 'google') return 'Google';
  if (platform === 'manual') return 'Manual';
  return 'Test';
}

export default function LeadIntake() {
  const [platform, setPlatform] = useState<LeadPlatform>('meta');
  const [pipelineId, setPipelineId] = useState('default');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [name, setName] = useState('Aarav Sharma');
  const [phone, setPhone] = useState('9876543210');
  const [email, setEmail] = useState('aarav@example.com');
  const [campaign, setCampaign] = useState('July Demo Campaign');
  const [formId, setFormId] = useState('form_123');
  const [adId, setAdId] = useState('ad_456');
  const [eventId, setEventId] = useState('');
  const [message, setMessage] = useState('Need trophies for a school event next month.');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string>('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [events, setEvents] = useState<LeadIntakeEvent[]>([]);
  const [eventsError, setEventsError] = useState('');
  const [loading, setLoading] = useState(true);

  const stats = useMemo(() => {
    const created = events.filter((event) => event.status === 'created' || event.status === 'matched').length;
    const duplicates = events.filter((event) => event.status === 'duplicate').length;
    const failed = events.filter((event) => event.status === 'failed').length;
    return { created, duplicates, failed };
  }, [events]);

  useEffect(() => {
    if (!db) return;

    const pipelinesQuery = query(collection(db, 'pipelines'));
    const unsubPipelines = onSnapshot(pipelinesQuery, (snapshot) => {
      const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Pipeline));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setPipelines(rows);
    }, (error) => {
      console.error('Pipeline query failed', error);
    });

    const leadsQuery = query(collection(db, 'leads'), orderBy('created_at', 'desc'));
    const eventsQuery = query(collection(db, 'lead_intake_events'), orderBy('created_at', 'desc'));

    const unsubLeads = onSnapshot(leadsQuery, (snapshot) => {
      setLeads(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Lead)));
      setLoading(false);
    }, (error) => {
      console.error('Lead query failed', error);
      setLoading(false);
    });

    const unsubEvents = onSnapshot(eventsQuery, (snapshot) => {
      setEventsError('');
      setEvents(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as LeadIntakeEvent)));
    }, (error) => {
      console.error('Lead intake log failed', error);
      setEventsError(error?.message || 'Could not load intake log.');
    });

    return () => {
      unsubPipelines();
      unsubLeads();
      unsubEvents();
    };
  }, []);

  useEffect(() => {
    if (!pipelines.length) return;
    if (!pipelines.some((pipeline) => pipeline.id === pipelineId)) {
      setPipelineId(pipelines[0].id);
    }
  }, [pipelines, pipelineId]);

  const pipelineOptions = useMemo(() => {
    return [{ id: 'default', name: 'Default pipeline', scenario: 'General' }, ...pipelines.filter((item) => item.id !== 'default')];
  }, [pipelines]);

  const handleTestIngest = async () => {
    setSending(true);
    setFeedback('');
    try {
      const result = await testLeadIngestHttp({
        platform,
        source: sourceLabel(platform),
        name,
        phone,
        email,
        campaign,
        form_id: formId,
        ad_id: adId,
        pipeline_id: pipelineId,
        event_id: eventId || undefined,
        message,
      });
      const data = result as { status?: string; leadId?: string; eventId?: string; message?: string };
      setFeedback(`${data.status || 'done'}${data.leadId ? ` | lead ${data.leadId}` : ''}${data.eventId ? ` | event ${data.eventId}` : ''}`);
      setEventId('');
    } catch (error: any) {
      setFeedback(error?.message || 'Test ingest failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Lead Intake</h1>
          <p className="text-secondary mt-1">Lightweight intake test bed for Meta and Google lead sourcing.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="neo-card !p-3 min-w-28">
            <div className="text-[10px] uppercase tracking-[0.2em] text-secondary">Leads</div>
            <div className="text-2xl font-black text-primary-dark">{leads.length}</div>
          </div>
          <div className="neo-card !p-3 min-w-28">
            <div className="text-[10px] uppercase tracking-[0.2em] text-secondary">Created</div>
            <div className="text-2xl font-black text-success">{stats.created}</div>
          </div>
          <div className="neo-card !p-3 min-w-28">
            <div className="text-[10px] uppercase tracking-[0.2em] text-secondary">Dupes</div>
            <div className="text-2xl font-black text-warning">{stats.duplicates}</div>
          </div>
          <div className="neo-card !p-3 min-w-28">
            <div className="text-[10px] uppercase tracking-[0.2em] text-secondary">Failed</div>
            <div className="text-2xl font-black text-error">{stats.failed}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="neo-card xl:col-span-1 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-primary-dark">Test ingest</h2>
            <p className="text-sm text-secondary">Use this to verify the full write path while the live webhooks are wired.</p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-primary-dark">Source</label>
            <select className="neo-input w-full" value={platform} onChange={(e) => setPlatform(e.target.value as LeadPlatform)}>
              <option value="meta">Meta</option>
              <option value="google">Google</option>
              <option value="manual">Manual</option>
              <option value="test">Test</option>
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-primary-dark">Pipeline</label>
            <select className="neo-input w-full" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
              {pipelineOptions.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}{pipeline.scenario ? ` - ${pipeline.scenario}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <input className="neo-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lead name" />
            <input className="neo-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
            <input className="neo-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <input className="neo-input" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Campaign" />
            <input className="neo-input" value={formId} onChange={(e) => setFormId(e.target.value)} placeholder="Form ID" />
            <input className="neo-input" value={adId} onChange={(e) => setAdId(e.target.value)} placeholder="Ad ID" />
            <input className="neo-input" value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="Optional event ID" />
            <textarea className="neo-input min-h-28 resize-y" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Lead message or DM text" />
          </div>

          <button disabled={sending} onClick={handleTestIngest} className="neo-btn-primary w-full flex items-center justify-center gap-2">
            {sending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
            Send Test Lead
          </button>

          <div className="text-xs text-secondary flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>
              Live webhook handlers are exposed from Firebase Functions as <span className="font-semibold text-primary-dark">metaLeadWebhook</span> and <span className="font-semibold text-primary-dark">googleLeadWebhook</span>.
            </span>
          </div>

          {feedback && (
            <div className="neo-card !p-3 bg-success/5 border border-success/20 text-sm text-primary-dark flex items-start gap-2">
              <ArrowRight size={16} className="mt-0.5 text-success" />
              <span>{feedback}</span>
            </div>
          )}
        </div>

        <div className="neo-card xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Recent intake log</h2>
              <p className="text-sm text-secondary">Showing the latest lead ingestion attempts and their status.</p>
            </div>
            <button onClick={() => window.location.reload()} className="neo-btn !px-3 !py-2 flex items-center gap-2 text-sm">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {eventsError && (
            <div className="neo-card !p-3 bg-warning/5 border border-warning/20 text-sm text-primary-dark">
              {eventsError}
            </div>
          )}

          {loading ? (
            <div className="py-16 flex items-center justify-center text-secondary">
              <Loader2 className="animate-spin mr-2" size={18} /> Loading lead intake data...
            </div>
          ) : events.length === 0 ? (
            <div className="py-16 text-center text-secondary border border-dashed border-shadow-darker/20 rounded-xl">
              No intake events yet. Send a test lead to verify the pipeline.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-secondary border-b border-shadow-darker/10">
                    <th className="py-3 pr-4 font-semibold">Time</th>
                    <th className="py-3 pr-4 font-semibold">Platform</th>
                    <th className="py-3 pr-4 font-semibold">Source</th>
                    <th className="py-3 pr-4 font-semibold">Status</th>
                    <th className="py-3 pr-4 font-semibold">Lead</th>
                    <th className="py-3 pr-4 font-semibold">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-shadow-darker/5 align-top">
                      <td className="py-3 pr-4 whitespace-nowrap text-secondary">{formatTs(event.created_at)}</td>
                      <td className="py-3 pr-4 font-semibold text-primary-dark">{event.platform}</td>
                      <td className="py-3 pr-4">{event.source}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest ${
                          event.status === 'created' || event.status === 'matched'
                            ? 'bg-success/10 text-success'
                            : event.status === 'duplicate'
                              ? 'bg-warning/10 text-warning'
                              : event.status === 'failed'
                                ? 'bg-error/10 text-error'
                                : 'bg-secondary/10 text-secondary'
                        }`}>
                          {event.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-primary-dark">{event.lead_id || '-'}</div>
                        <div className="text-xs text-secondary">Event: {event.event_id}</div>
                      </td>
                      <td className="py-3 pr-4 text-secondary max-w-[280px]">{event.message || event.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}




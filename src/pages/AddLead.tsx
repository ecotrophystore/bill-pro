import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { ArrowRight, Loader2, Save } from 'lucide-react';
import { db } from '../lib/firebase';
import { testLeadIngestHttp } from '../lib/testLeadIngest';
import type { LeadPlatform, Pipeline } from '../types';
import { useCRMPermission } from '../hooks/useCRMPermission';

export default function AddLead() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [campaign, setCampaign] = useState('');
  const [formId, setFormId] = useState('');
  const [adId, setAdId] = useState('');
  const [source, setSource] = useState('Manual');
  const [platform, setPlatform] = useState<LeadPlatform>('manual');
  const [pipelineId, setPipelineId] = useState('default');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const { hasPermission } = useCRMPermission();

  useEffect(() => {
    if (!db) return;

    const unsub = onSnapshot(query(collection(db, 'pipelines')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Pipeline));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setPipelines(rows);
    }, (error) => {
      console.error('Pipeline load failed', error);
    });

    return () => unsub();
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

  const canSave = useMemo(() => hasPermission('create_lead') && (name.trim().length > 0 || phone.trim().length > 0 || email.trim().length > 0), [name, phone, email, hasPermission]);

  const handleSave = async () => {
    if (!hasPermission('create_lead')) {
      setFeedback('Error: You do not have permission to create leads.');
      return;
    }
    setSaving(true);
    setFeedback('');
    try {
      const result = await testLeadIngestHttp({
        platform,
        source: source || 'Manual',
        sourceType: 'manual',
        name,
        phone,
        email,
        campaign,
        form_id: formId,
        ad_id: adId,
        pipeline_id: pipelineId,
        event_id: `manual_${Date.now()}`,
        message,
      });
      const data = result as { status?: string; leadId?: string; eventId?: string };
      setFeedback(`Saved ${data.status || 'done'}${data.leadId ? ` | lead ${data.leadId}` : ''}`);
      setName('');
      setPhone('');
      setEmail('');
      setCampaign('');
      setFormId('');
      setAdId('');
      setMessage('');
      setSource('Manual');
      setPlatform('manual');
      setPipelineId('default');
    } catch (error: any) {
      setFeedback(error?.message || 'Failed to save lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Add Lead</h1>
          <p className="text-secondary mt-1">Create a lead manually and send it through the same CRM intake path.</p>
        </div>
      </div>

      <div className="neo-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Name</label>
            <input className="neo-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Phone</label>
            <input className="neo-input w-full" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Email</label>
            <input className="neo-input w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Source</label>
            <input className="neo-input w-full" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Manual / Referral / Walk-in" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Platform</label>
            <select className="neo-input w-full" value={platform} onChange={(e) => setPlatform(e.target.value as LeadPlatform)}>
              <option value="manual">Manual</option>
              <option value="meta">Meta</option>
              <option value="google">Google</option>
              <option value="test">Test</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Pipeline</label>
            <select className="neo-input w-full" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
              {pipelineOptions.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}{pipeline.scenario ? ` - ${pipeline.scenario}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Campaign</label>
            <input className="neo-input w-full" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Campaign or referral name" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Form ID</label>
            <input className="neo-input w-full" value={formId} onChange={(e) => setFormId(e.target.value)} placeholder="Optional form id" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-primary-dark mb-2">Ad ID</label>
            <input className="neo-input w-full" value={adId} onChange={(e) => setAdId(e.target.value)} placeholder="Optional ad id" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-primary-dark mb-2">Lead note</label>
          <textarea className="neo-input w-full min-h-32 resize-y" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Requirement, event, or any note" />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button disabled={saving || !canSave} onClick={handleSave} className="neo-btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Save Lead
          </button>
          <span className="text-sm text-secondary">This creates the same Firestore lead record used by webhook intake.</span>
        </div>

        {feedback && (
          <div className="neo-card !p-3 bg-success/5 border border-success/20 text-sm text-primary-dark flex items-start gap-2">
            <ArrowRight size={16} className="mt-0.5 text-success" />
            <span>{feedback}</span>
          </div>
        )}
      </div>
    </div>
  );
}



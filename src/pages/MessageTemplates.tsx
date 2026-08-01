import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { AlertCircle, Loader2, Pencil, Plus, Save, Trash2, MessageSquare, X } from 'lucide-react';
import { db } from '../lib/firebase';
import type { MessageTemplate, MessageTemplateChannel, Pipeline } from '../types';

type TemplateDraft = {
  name: string;
  channel: MessageTemplateChannel;
  subject: string;
  body: string;
  is_active: boolean;
};

const EMPTY_DRAFT: TemplateDraft = {
  name: '',
  channel: 'whatsapp',
  subject: '',
  body: 'Hi {name}, thanks for reaching out from {source}. We will follow up shortly.',
  is_active: true,
};

function renderTemplate(text: string, values: Record<string, string>) {
  return String(text || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => values[key] || '');
}

export default function MessageTemplates() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const editorRef = useRef<HTMLDivElement>(null);



  useEffect(() => {
    if (!db) return;

    const unsubTemplates = onSnapshot(query(collection(db, 'message_templates')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as MessageTemplate));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setTemplates(rows);
      setLoading(false);
    }, (error) => {
      console.error('Message templates load failed', error);
      setLoading(false);
    });

    return () => {
      unsubTemplates();
    };
  }, []);

  const previewContext = {
    name: 'Aarav Sharma',
    phone: '9876543210',
    email: 'aarav@example.com',
    source: 'Meta Lead Ads',
    campaign: 'July Demo Campaign',
    pipeline: 'Demo Pipeline',
    stage: 'Demo Stage',
    reason: 'Need trophies for a school event',
  };

  const previewSubject = draft.subject ? renderTemplate(draft.subject, previewContext) : 'No subject';
  const previewBody = renderTemplate(draft.body, previewContext);

  const openTemplate = (template: MessageTemplate) => {
    setEditingId(template.id);
    setDraft({
      name: template.name,
      channel: template.channel,
      subject: template.subject || '',
      body: template.body || '',
      is_active: template.is_active !== false,
    });
    setMessage('');
    // Scroll editor into view so user can see the form was populated
    setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const resetDraft = () => {
    setEditingId('');
    setDraft({ ...EMPTY_DRAFT });
    setMessage('');
  };

  const saveTemplate = async () => {
    if (!db) return;

    const name = draft.name.trim();
    const body = draft.body.trim();
    if (!name) {
      setMessage('Enter a template name.');
      return;
    }
    if (!body) {
      setMessage('Enter a template body.');
      return;
    }

    const payload = {
      name,
      channel: draft.channel,
      subject: draft.subject.trim(),
      body,
      is_active: draft.is_active,
      updated_at: serverTimestamp(),
    };

    setSaving(true);
    setMessage('');
    try {
      if (editingId) {
        await setDoc(doc(db, 'message_templates', editingId), payload, { merge: true });
        setMessage(`Updated template ${name}.`);
      } else {
        await addDoc(collection(db, 'message_templates'), {
          ...payload,
          created_at: serverTimestamp(),
        });
        setMessage(`Created template ${name}.`);
      }
      resetDraft();
    } catch (error: any) {
      console.error('Template save failed', error);
      setMessage(error?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (templateId: string, templateName: string) => {
    if (!db) return;
    const confirmed = window.confirm(`Delete template ${templateName}?`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'message_templates', templateId));
      if (editingId === templateId) resetDraft();
      setMessage(`Deleted template ${templateName}.`);
    } catch (error: any) {
      console.error('Template delete failed', error);
      setMessage(error?.message || 'Failed to delete template');
    }
  };



  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Message Templates</h1>
          <p className="text-secondary mt-1">Create lightweight auto-message templates for lead stages.</p>
        </div>
        <button onClick={resetDraft} className="neo-btn-primary inline-flex items-center gap-2">
          <Plus size={16} /> New Template
        </button>
      </div>

      {message && (
        <div className="neo-card !p-3 bg-primary/5 border border-primary/20 text-sm text-primary-dark flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 text-primary-dark" />
          <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div ref={editorRef} className="neo-card xl:col-span-1 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">
                {editingId ? `Editing: ${draft.name || 'template'}` : 'Template editor'}
              </h2>
              <p className="text-sm text-secondary">
                {editingId ? 'Make changes and click Save to update.' : 'Saved templates can auto-prepare on matching stage changes.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editingId && (
                <button onClick={resetDraft} className="neo-btn !px-3 !py-2 flex items-center gap-1 text-sm text-secondary">
                  <X size={14} /> Cancel
                </button>
              )}
              <button onClick={saveTemplate} disabled={saving} className="neo-btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                {editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-primary-dark mb-2">Template name</label>
              <input className="neo-input w-full" value={draft.name} onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))} placeholder="New lead follow-up" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-primary-dark mb-2">Channel</label>
              <select className="neo-input w-full" value={draft.channel} onChange={(e) => setDraft((current) => ({ ...current, channel: e.target.value as MessageTemplateChannel }))}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="note">Internal note</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-primary-dark mb-2">Subject</label>
              <input className="neo-input w-full" value={draft.subject} onChange={(e) => setDraft((current) => ({ ...current, subject: e.target.value }))} placeholder="Optional subject" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-primary-dark mb-2">Body</label>
              <textarea className="neo-input w-full min-h-40 resize-y" value={draft.body} onChange={(e) => setDraft((current) => ({ ...current, body: e.target.value }))} placeholder="Hi {name}, thanks for contacting us..." />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-primary-dark">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((current) => ({ ...current, is_active: e.target.checked }))} />
              Active template
            </label>
          </div>
        </div>

        <div className="neo-card xl:col-span-1 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-primary-dark">Preview</h2>
            <p className="text-sm text-secondary">Rendered with a sample lead so you can verify the output fast.</p>
          </div>
          <div className="rounded-2xl border border-shadow-darker/10 bg-surface p-4 space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-secondary">Subject</div>
            <div className="font-semibold text-primary-dark">{previewSubject}</div>
            <div className="text-xs uppercase tracking-[0.2em] text-secondary pt-2">Message</div>
            <pre className="whitespace-pre-wrap text-sm text-primary-dark leading-6">{previewBody}</pre>
          </div>
          <div className="text-xs text-secondary">
            Placeholders supported: {`{name}, {phone}, {email}, {source}, {campaign}, {pipeline}, {stage}, {reason}`}
          </div>
        </div>

        <div className="neo-card xl:col-span-1 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-primary-dark">Saved templates</h2>
              <p className="text-sm text-secondary">Edit or delete the templates you�ve already created.</p>
            </div>
            <MessageSquare size={18} className="text-secondary" />
          </div>

          {loading ? (
            <div className="py-12 text-center text-secondary">
              <Loader2 className="animate-spin mx-auto mb-3" size={20} />
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="py-12 text-center text-secondary border border-dashed border-shadow-darker/20 rounded-xl">
              No templates yet. Create the first one above.
            </div>
          ) : (
            <div className="space-y-3 max-h-[820px] overflow-y-auto pr-1">
              {templates.map((template) => {
                return (
                  <div key={template.id} className={`rounded-2xl border p-4 transition-all ${
                    editingId === template.id
                      ? 'ring-2 ring-primary border-primary bg-primary/5'
                      : template.is_active
                        ? 'bg-success/5 border-success/20'
                        : 'bg-shadow-darker/5 border-shadow-darker/10'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-primary-dark">{template.name}</div>
                        <div className="text-xs text-secondary mt-1">{template.channel}</div>
                      </div>
                      <span className={`text-[10px] uppercase tracking-widest font-bold ${template.is_active ? 'text-success' : 'text-secondary'}`}>{template.is_active ? 'Active' : 'Paused'}</span>
                    </div>
                    <div className="mt-3 text-sm text-secondary line-clamp-3">{template.body}</div>
                    <div className="mt-4 flex items-center gap-2">
                      <button onClick={() => openTemplate(template)} className="neo-btn !px-3 !py-2 inline-flex items-center gap-2 text-sm"><Pencil size={14} /> Edit</button>
                      <button onClick={() => removeTemplate(template.id, template.name)} className="neo-btn !px-3 !py-2 inline-flex items-center gap-2 text-sm text-error"><Trash2 size={14} /> Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>


    </div>
  );
}

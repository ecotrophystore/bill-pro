import React, { useState } from 'react';
import { RefreshCw, Save, Loader2, CheckCircle, AlertCircle, ChevronDown, ExternalLink, Unplug, MessageSquare } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import clsx from 'clsx';

export type FbStatus =
  | 'not_configured' | 'configured' | 'fetching' | 'testing'
  | 'connected' | 'disconnected' | 'invalid_token' | 'token_expired'
  | 'permission_missing' | 'no_page_access' | 'webhook_not_subscribed' | 'error';

interface FacebookPage { id: string; name: string; category?: string; }
interface FacebookLeadForm { id: string; name: string; status?: string; }

interface Props {
  isAdmin: boolean;
  facebookTokenConfigured: boolean;
  initialConfig: {
    facebookPageId: string;
    facebookPageName: string;
    facebookPageCategory: string;
    facebookLeadFormId: string;
    defaultPipelineId: string;
    defaultStageId: string;
    defaultLeadOwnerId: string;
  };
  initialStatus: {
    facebookConnectionStatus: FbStatus;
    facebookLeadAdsSubscribed: boolean;
    facebookMessagesSubscribed: boolean;
    lastFacebookTestAt: string;
    lastFacebookLeadAt: string;
    lastFacebookMessageAt: string;
    facebookLastErrorCode: string;
    facebookLastErrorMessage: string;
  };
  onRefresh: () => void;
}

function StatusBadge({ status }: { status: FbStatus }) {
  const map: Record<FbStatus, { label: string; cls: string }> = {
    connected:           { label: 'Connected',            cls: 'text-green-700 bg-green-50 border-green-200' },
    configured:          { label: 'Configured',           cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
    fetching:            { label: 'Fetching…',            cls: 'text-blue-700 bg-blue-50 border-blue-200' },
    testing:             { label: 'Testing…',             cls: 'text-blue-700 bg-blue-50 border-blue-200' },
    disconnected:        { label: 'Disconnected',         cls: 'text-gray-700 bg-gray-50 border-gray-200' },
    not_configured:      { label: 'Not Configured',       cls: 'text-gray-600 bg-gray-50 border-gray-200' },
    invalid_token:       { label: 'Invalid Token',        cls: 'text-red-700 bg-red-50 border-red-200' },
    token_expired:       { label: 'Token Expired',        cls: 'text-red-700 bg-red-50 border-red-200' },
    permission_missing:  { label: 'Permission Missing',   cls: 'text-red-700 bg-red-50 border-red-200' },
    no_page_access:      { label: 'No Page Access',       cls: 'text-red-700 bg-red-50 border-red-200' },
    webhook_not_subscribed: { label: 'Not Subscribed',   cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
    error:               { label: 'Error',                cls: 'text-red-700 bg-red-50 border-red-200' },
  };
  const s = map[status] || map.not_configured;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border', s.cls)}>
      {status === 'connected' && <CheckCircle size={10} />}
      {['error','invalid_token','token_expired','permission_missing','no_page_access'].includes(status) && <AlertCircle size={10} />}
      {s.label}
    </span>
  );
}

export function FacebookIntegrationCard({ isAdmin, facebookTokenConfigured, initialConfig, initialStatus, onRefresh }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [forms, setForms] = useState<FacebookLeadForm[]>([]);
  const [showPageDropdown, setShowPageDropdown] = useState(false);
  const [showFormDropdown, setShowFormDropdown] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [cfg, setCfg] = useState(initialConfig);

  const fn = (name: string) => httpsCallable(getFunctions(), name);

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function call(name: string, data?: unknown): Promise<any> {
    setBusy(name);
    try {
      const res = await fn(name)(data || {});
      return (res.data as any);
    } catch (e: any) {
      showToast('err', e?.message || 'Error occurred');
      return null;
    } finally {
      setBusy(null);
    }
  }

  // ── Fetch Pages ──────────────────────────────────────────────────────────────
  async function handleFetchPages() {
    const res = await call('fetchAvailableFacebookPages');
    if (!res) return;
    setPages(res.pages || []);
    if ((res.pages || []).length === 0) {
      showToast('err', 'No Facebook Pages found. Ensure token has Pages access and pages_show_list permission.');
    } else {
      setShowPageDropdown(true);
    }
  }

  // ── Select Page ──────────────────────────────────────────────────────────────
  async function handleSelectPage(page: FacebookPage) {
    setShowPageDropdown(false);
    const newCfg = { ...cfg, facebookPageId: page.id, facebookPageName: page.name, facebookPageCategory: page.category || '' };
    setCfg(newCfg);
    const res = await call('saveFacebookConfig', { config: newCfg });
    if (res?.success) showToast('ok', `Facebook Page "${page.name}" selected and saved.`);
    onRefresh();
  }

  // ── Fetch Lead Forms ─────────────────────────────────────────────────────────
  async function handleFetchForms() {
    const res = await call('fetchFacebookLeadForms');
    if (!res) return;
    setForms(res.forms || []);
    if ((res.forms || []).length === 0) {
      showToast('err', 'No Lead Forms found for this Page. Create an active lead form in Meta Ads Manager first.');
    } else {
      setShowFormDropdown(true);
    }
  }

  async function handleSelectForm(form: FacebookLeadForm) {
    setShowFormDropdown(false);
    const newCfg = { ...cfg, facebookLeadFormId: form.id };
    setCfg(newCfg);
    await call('saveFacebookConfig', { config: newCfg });
    showToast('ok', `Lead Form "${form.name}" selected.`);
  }

  // ── Test Connection ──────────────────────────────────────────────────────────
  async function handleTest() {
    const res = await call('testFacebookConnection');
    if (!res) return;
    setStatus(s => ({ ...s, facebookConnectionStatus: 'connected', lastFacebookTestAt: res.testedAt || '' }));
    showToast('ok', `Connected to Facebook Page: ${res.pageName}`);
    onRefresh();
  }

  // ── Subscribe / Unsubscribe ──────────────────────────────────────────────────
  async function handleSubscribeLeadAds() {
    const res = await call('subscribeFacebookLeadAds');
    if (res?.success) {
      setStatus(s => ({ ...s, facebookLeadAdsSubscribed: true }));
      showToast('ok', 'Facebook Lead Ads webhook subscribed.');
      onRefresh();
    }
  }
  async function handleUnsubscribeLeadAds() {
    if (!confirm('Unsubscribe Facebook Lead Ads? New leads will stop arriving.')) return;
    const res = await call('unsubscribeFacebookLeadAds');
    if (res?.success) { setStatus(s => ({ ...s, facebookLeadAdsSubscribed: false })); showToast('ok', 'Unsubscribed Lead Ads.'); onRefresh(); }
  }
  async function handleSubscribeMessages() {
    const res = await call('subscribeFacebookPageMessages');
    if (res?.success) { setStatus(s => ({ ...s, facebookMessagesSubscribed: true })); showToast('ok', 'Facebook Page Messages subscribed.'); onRefresh(); }
  }
  async function handleUnsubscribeMessages() {
    if (!confirm('Unsubscribe Facebook Page Messages?')) return;
    const res = await call('unsubscribeFacebookPageMessages');
    if (res?.success) { setStatus(s => ({ ...s, facebookMessagesSubscribed: false })); showToast('ok', 'Unsubscribed.'); onRefresh(); }
  }

  const maskId = (id: string) => id ? `****${id.slice(-4)}` : '—';
  const fmtTime = (t: string) => t ? new Date(t).toLocaleString() : 'Never';

  return (
    <div className="neo-card p-6 space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start border-b border-shadow-darker/10 pb-3">
        <div>
          <h4 className="font-bold text-primary-dark text-base flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-600" /> Facebook Integration
          </h4>
          <StatusBadge status={status.facebookConnectionStatus} />
        </div>
        {!facebookTokenConfigured && (
          <span className="text-[10px] text-red-600 font-semibold flex items-center gap-1 mt-1">
            <AlertCircle size={11} /> META_FACEBOOK_SYSTEM_USER_TOKEN missing
          </span>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={clsx('px-3 py-2 rounded text-xs font-medium flex items-center gap-2', toast.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
          {toast.type === 'ok' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
          {toast.msg}
        </div>
      )}

      {/* Page Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black text-secondary tracking-widest uppercase">Facebook Page</label>
          {isAdmin && (
            <button onClick={handleFetchPages} disabled={!facebookTokenConfigured || busy === 'fetchAvailableFacebookPages'}
              className="neo-btn text-xs py-1 px-3 flex items-center gap-1.5">
              {busy === 'fetchAvailableFacebookPages' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Fetch Pages
            </button>
          )}
        </div>

        {cfg.facebookPageId ? (
          <div className="neo-input text-sm bg-shadow-darker/5 flex items-center justify-between">
            <span className="font-medium text-primary-dark">{cfg.facebookPageName}</span>
            <span className="text-[10px] text-secondary font-mono">{maskId(cfg.facebookPageId)}</span>
          </div>
        ) : (
          <div className="neo-input text-sm text-secondary">No page selected — click Fetch Pages</div>
        )}

        {showPageDropdown && pages.length > 0 && (
          <div className="border border-shadow-darker/20 rounded-lg overflow-hidden shadow-md bg-surface z-10">
            {pages.map(p => (
              <button key={p.id} onClick={() => handleSelectPage(p)}
                className="w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors text-sm border-b border-shadow-darker/5 last:border-0">
                <span className="font-medium text-primary-dark">{p.name}</span>
                <span className="ml-2 text-[10px] text-secondary">{p.category}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lead Form Selection */}
      {cfg.facebookPageId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-secondary tracking-widest uppercase">Lead Form</label>
            {isAdmin && (
              <button onClick={handleFetchForms} disabled={busy === 'fetchFacebookLeadForms'}
                className="neo-btn text-xs py-1 px-3 flex items-center gap-1.5">
                {busy === 'fetchFacebookLeadForms' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Fetch Forms
              </button>
            )}
          </div>
          <div className="neo-input text-sm bg-shadow-darker/5">
            {cfg.facebookLeadFormId ? (
              <span className="text-primary-dark font-medium">
                {forms.find(f => f.id === cfg.facebookLeadFormId)?.name || `Form ID: ****${cfg.facebookLeadFormId.slice(-4)}`}
              </span>
            ) : <span className="text-secondary">No form selected</span>}
          </div>
          {showFormDropdown && forms.length > 0 && (
            <div className="border border-shadow-darker/20 rounded-lg overflow-hidden shadow-md bg-surface z-10">
              {forms.map(f => (
                <button key={f.id} onClick={() => handleSelectForm(f)}
                  className="w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors text-sm border-b border-shadow-darker/5 last:border-0">
                  <span className="font-medium text-primary-dark">{f.name}</span>
                  <span className={clsx('ml-2 text-[10px] px-1 rounded', f.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>{f.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Status Row */}
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs border-t border-shadow-darker/10 pt-3">
        <span className="text-secondary">Page ID</span>
        <span className="font-mono text-primary-dark">{maskId(cfg.facebookPageId)}</span>
        <span className="text-secondary">Category</span>
        <span className="text-primary-dark">{cfg.facebookPageCategory || '—'}</span>
        <span className="text-secondary">Token</span>
        <span className={facebookTokenConfigured ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
          {facebookTokenConfigured ? 'Configured' : 'Missing'}
        </span>
        <span className="text-secondary">Lead Ads Webhook</span>
        <span className={status.facebookLeadAdsSubscribed ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}>
          {status.facebookLeadAdsSubscribed ? 'Active' : 'Inactive'}
        </span>
        <span className="text-secondary">Page Msg Webhook</span>
        <span className={status.facebookMessagesSubscribed ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}>
          {status.facebookMessagesSubscribed ? 'Active' : 'Inactive'}
        </span>
        <span className="text-secondary">Last Test</span>
        <span className="text-primary-dark">{fmtTime(status.lastFacebookTestAt)}</span>
        <span className="text-secondary">Last Lead</span>
        <span className="text-primary-dark">{fmtTime(status.lastFacebookLeadAt)}</span>
        <span className="text-secondary">Last Message</span>
        <span className="text-primary-dark">{fmtTime(status.lastFacebookMessageAt)}</span>
      </div>

      {status.facebookLastErrorMessage && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex gap-2">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          {status.facebookLastErrorCode && <span className="font-mono">[{status.facebookLastErrorCode}]</span>}
          {status.facebookLastErrorMessage}
        </div>
      )}

      {/* Actions */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-shadow-darker/10">
          <button onClick={handleTest}
            disabled={!cfg.facebookPageId || !facebookTokenConfigured || busy === 'testFacebookConnection'}
            className="neo-btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
            {busy === 'testFacebookConnection' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Test Connection
          </button>

          {status.facebookLeadAdsSubscribed
            ? <button onClick={handleUnsubscribeLeadAds} disabled={!!busy} className="neo-btn text-xs py-1.5 px-3 text-yellow-700">Unsubscribe Lead Ads</button>
            : <button onClick={handleSubscribeLeadAds} disabled={status.facebookConnectionStatus !== 'connected' || !!busy}
                className="neo-btn text-xs py-1.5 px-3">Subscribe Lead Ads</button>}

          {status.facebookMessagesSubscribed
            ? <button onClick={handleUnsubscribeMessages} disabled={!!busy} className="neo-btn text-xs py-1.5 px-3 text-yellow-700">Unsubscribe Messages</button>
            : <button onClick={handleSubscribeMessages} disabled={status.facebookConnectionStatus !== 'connected' || !!busy}
                className="neo-btn text-xs py-1.5 px-3">Subscribe Page Messages</button>}

          <button
            disabled={status.facebookConnectionStatus === 'not_configured' || !!busy}
            onClick={() => { if (confirm('Disconnect Facebook? Config will be cleared.')) showToast('err', 'Manual disconnect: clear facebookPageId from Firestore console.'); }}
            className="neo-btn text-xs py-1.5 px-3 text-error border-error/20 hover:bg-error/5 ml-auto flex items-center gap-1">
            <Unplug size={12} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

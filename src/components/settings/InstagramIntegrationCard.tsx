import React, { useState } from 'react';
import { RefreshCw, Loader2, CheckCircle, AlertCircle, Unplug, Camera } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import clsx from 'clsx';
import type { FbStatus } from './FacebookIntegrationCard';

interface Props {
  isAdmin: boolean;
  facebookTokenConfigured: boolean;
  facebookPageId: string;
  initialConfig: {
    instagramAccountId: string;
    instagramUsername: string;
    instagramName: string;
    instagramConnectedPageId: string;
  };
  initialStatus: {
    instagramConnectionStatus: FbStatus;
    instagramMessagesSubscribed: boolean;
    lastInstagramTestAt: string;
    lastInstagramMessageAt: string;
    instagramLastErrorCode: string;
    instagramLastErrorMessage: string;
  };
  onRefresh: () => void;
}

export function InstagramIntegrationCard({ isAdmin, facebookTokenConfigured, facebookPageId, initialConfig, initialStatus, onRefresh }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [cfg, setCfg] = useState(initialConfig);

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function call(name: string, data?: unknown): Promise<any> {
    setBusy(name);
    try {
      const fn = httpsCallable(functions, name);
      const res = await fn(data || {});
      return res.data as any;
    } catch (e: any) {
      showToast('err', e?.message || 'Error occurred');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleFetchInstagram() {
    const res = await call('fetchConnectedInstagramAccount');
    if (!res) return;
    if (!res.connected) {
      showToast('err', res.message || 'No Instagram Professional Account connected to this Facebook Page.');
      return;
    }
    const acc = res.instagramAccount;
    const newCfg = {
      instagramAccountId: acc.id,
      instagramUsername: acc.username || '',
      instagramName: acc.name || '',
      instagramConnectedPageId: facebookPageId,
    };
    setCfg(newCfg);
    await call('saveInstagramConfig', { config: newCfg });
    showToast('ok', `Instagram account @${acc.username} fetched and saved.`);
    onRefresh();
  }

  async function handleTest() {
    const res = await call('testInstagramConnection');
    if (!res) return;
    setStatus(s => ({ ...s, instagramConnectionStatus: 'connected', lastInstagramTestAt: res.testedAt || '' }));
    showToast('ok', `Connected to Instagram: @${res.username}`);
    onRefresh();
  }

  async function handleSubscribe() {
    const res = await call('subscribeInstagramMessages');
    if (res?.success) { setStatus(s => ({ ...s, instagramMessagesSubscribed: true })); showToast('ok', 'Instagram Messages subscribed.'); onRefresh(); }
  }

  async function handleUnsubscribe() {
    if (!confirm('Unsubscribe Instagram Messages? DMs will stop arriving.')) return;
    const res = await call('unsubscribeInstagramMessages');
    if (res?.success) { setStatus(s => ({ ...s, instagramMessagesSubscribed: false })); showToast('ok', 'Unsubscribed.'); onRefresh(); }
  }

  const maskId = (id: string) => id ? `****${id.slice(-4)}` : '—';
  const fmtTime = (t: string) => t ? new Date(t).toLocaleString() : 'Never';

  const statusMap: Record<string, { label: string; cls: string }> = {
    connected:           { label: 'Connected',            cls: 'text-green-700 bg-green-50 border-green-200' },
    configured:          { label: 'Configured',           cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
    not_configured:      { label: 'Not Configured',       cls: 'text-gray-600 bg-gray-50 border-gray-200' },
    error:               { label: 'Error',                cls: 'text-red-700 bg-red-50 border-red-200' },
    invalid_token:       { label: 'Invalid Token',        cls: 'text-red-700 bg-red-50 border-red-200' },
    no_instagram_account:{ label: 'No Account Linked',    cls: 'text-red-700 bg-red-50 border-red-200' },
    disconnected:        { label: 'Disconnected',         cls: 'text-gray-700 bg-gray-50 border-gray-200' },
  };
  const s = statusMap[status.instagramConnectionStatus] || statusMap.not_configured;

  return (
    <div className="neo-card p-6 space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start border-b border-shadow-darker/10 pb-3">
        <div>
          <h4 className="font-bold text-primary-dark text-base flex items-center gap-2">
            <Camera size={18} className="text-pink-500" /> Instagram Integration
          </h4>
          <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border mt-1', s.cls)}>
            {status.instagramConnectionStatus === 'connected' && <CheckCircle size={10} />}
            {['error','invalid_token','no_instagram_account'].includes(status.instagramConnectionStatus) && <AlertCircle size={10} />}
            {s.label}
          </span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={clsx('px-3 py-2 rounded text-xs font-medium flex items-center gap-2', toast.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
          {toast.type === 'ok' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
          {toast.msg}
        </div>
      )}

      {/* No Facebook page warning */}
      {!facebookPageId && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-500" />
          Select and configure a Facebook Page first. Instagram accounts are fetched via the connected Facebook Page.
        </div>
      )}

      {/* Account info */}
      {cfg.instagramAccountId ? (
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
          <span className="text-secondary">Username</span>
          <span className="font-medium text-primary-dark">@{cfg.instagramUsername || '—'}</span>
          <span className="text-secondary">Name</span>
          <span className="text-primary-dark">{cfg.instagramName || '—'}</span>
          <span className="text-secondary">Account ID</span>
          <span className="font-mono text-primary-dark">{maskId(cfg.instagramAccountId)}</span>
          <span className="text-secondary">Via Page</span>
          <span className="font-mono text-primary-dark">{maskId(cfg.instagramConnectedPageId)}</span>
        </div>
      ) : (
        <p className="text-sm text-secondary text-center py-4">
          No Instagram account fetched yet.
          {facebookPageId ? ' Click "Fetch Instagram Account" to begin.' : ''}
        </p>
      )}

      {/* Status Row */}
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs border-t border-shadow-darker/10 pt-3">
        <span className="text-secondary">Token</span>
        <span className={facebookTokenConfigured ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
          {facebookTokenConfigured ? 'Configured' : 'Missing'}
        </span>
        <span className="text-secondary">DM Webhook</span>
        <span className={status.instagramMessagesSubscribed ? 'text-green-600 font-bold' : 'text-yellow-600 font-bold'}>
          {status.instagramMessagesSubscribed ? 'Active' : 'Inactive'}
        </span>
        <span className="text-secondary">Last Test</span>
        <span className="text-primary-dark">{fmtTime(status.lastInstagramTestAt)}</span>
        <span className="text-secondary">Last DM</span>
        <span className="text-primary-dark">{fmtTime(status.lastInstagramMessageAt)}</span>
      </div>

      {status.instagramLastErrorMessage && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex gap-2">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          {status.instagramLastErrorCode && <span className="font-mono">[{status.instagramLastErrorCode}]</span>}
          {status.instagramLastErrorMessage}
        </div>
      )}

      {/* Actions */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-shadow-darker/10">
          <button onClick={handleFetchInstagram}
            disabled={!facebookPageId || !facebookTokenConfigured || busy === 'fetchConnectedInstagramAccount'}
            className="neo-btn text-xs py-1.5 px-3 flex items-center gap-1.5">
            {busy === 'fetchConnectedInstagramAccount' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Fetch Instagram Account
          </button>

          <button onClick={handleTest}
            disabled={!cfg.instagramAccountId || !facebookTokenConfigured || busy === 'testInstagramConnection'}
            className="neo-btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
            {busy === 'testInstagramConnection' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Test Connection
          </button>

          {status.instagramMessagesSubscribed
            ? <button onClick={handleUnsubscribe} disabled={!!busy} className="neo-btn text-xs py-1.5 px-3 text-yellow-700">Unsubscribe DMs</button>
            : <button onClick={handleSubscribe} disabled={status.instagramConnectionStatus !== 'connected' || !!busy} className="neo-btn text-xs py-1.5 px-3">Subscribe DMs</button>}

          <button
            disabled={status.instagramConnectionStatus === 'not_configured' || !!busy}
            onClick={() => { if (confirm('Disconnect Instagram?')) showToast('err', 'Manual disconnect: clear instagramAccountId from Firestore console.'); }}
            className="neo-btn text-xs py-1.5 px-3 text-error border-error/20 hover:bg-error/5 ml-auto flex items-center gap-1">
            <Unplug size={12} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

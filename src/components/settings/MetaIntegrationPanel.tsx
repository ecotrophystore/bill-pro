import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Database, Save, Loader2, Copy, Check, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react';
import { MetaStatusCard, type ConnectionStatus } from './MetaStatusCard';
import { MetaSecretSetupModal } from './MetaSecretSetupModal';
import { SendTestMessageModal } from './SendTestMessageModal';
import { useAuth } from '../../contexts/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

const FacebookIntegrationCard = lazy(() => import('./FacebookIntegrationCard').then(m => ({ default: m.FacebookIntegrationCard })));
const InstagramIntegrationCard = lazy(() => import('./InstagramIntegrationCard').then(m => ({ default: m.InstagramIntegrationCard })));

// ── Types ──────────────────────────────────────────────────────────────────────
interface FieldErrors {
  metaAppId?: string;
  metaBusinessPortfolioId?: string;
  graphApiVersion?: string;
  environment?: string;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappDisplayPhoneNumber?: string;
  whatsappDisplayName?: string;
  defaultTemplateLanguage?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function FieldWrapper({
  label, helper, error, required, children
}: { label: string; helper: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className={`text-xs font-black tracking-widest uppercase ${error ? 'text-red-600' : 'text-secondary'}`}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error
        ? <p className="text-[10px] text-red-600 font-semibold flex items-center gap-1"><AlertCircle size={10} />{error}</p>
        : <p className="text-[10px] text-secondary">{helper}</p>}
    </div>
  );
}

function inputCls(error?: string) {
  return `w-full neo-input text-sm transition-all ${error ? 'border-red-400 bg-red-50/30 ring-1 ring-red-300 focus:ring-red-400' : ''}`;
}

// ── Validation ─────────────────────────────────────────────────────────────────
const REQUIRED_META_FIELDS: (keyof FieldErrors)[] = ['metaAppId', 'graphApiVersion', 'environment'];
const REQUIRED_WA_FIELDS: (keyof FieldErrors)[] = [
  'whatsappPhoneNumberId', 'whatsappBusinessAccountId',
  'whatsappDisplayPhoneNumber', 'whatsappDisplayName', 'defaultTemplateLanguage'
];

type ConfigKey = keyof typeof defaultConfig;
const defaultConfig = {
  metaAppId: '',
  metaBusinessPortfolioId: '',
  graphApiVersion: 'v18.0',
  environment: 'Test',
  whatsappPhoneNumberId: '',
  whatsappBusinessAccountId: '',
  whatsappDisplayPhoneNumber: '',
  whatsappDisplayName: '',
  defaultTemplateLanguage: 'en_US'
};

function validateAll(config: typeof defaultConfig): FieldErrors {
  const errs: FieldErrors = {};

  if (!config.metaAppId) errs.metaAppId = 'Meta App ID is required.';
  else if (!/^\d+$/.test(config.metaAppId)) errs.metaAppId = 'Must be numeric only.';

  if (config.metaBusinessPortfolioId && !/^\d+$/.test(config.metaBusinessPortfolioId))
    errs.metaBusinessPortfolioId = 'Must be numeric only.';

  if (!config.graphApiVersion) errs.graphApiVersion = 'Graph API Version is required.';
  else if (!/^v\d+\.\d+$/.test(config.graphApiVersion)) errs.graphApiVersion = 'Format must be like v18.0';

  if (!config.environment) errs.environment = 'Environment must be selected.';

  if (!config.whatsappPhoneNumberId) errs.whatsappPhoneNumberId = 'Phone Number ID is required.';
  else if (!/^\d+$/.test(config.whatsappPhoneNumberId)) errs.whatsappPhoneNumberId = 'Must be numeric only.';

  if (!config.whatsappBusinessAccountId) errs.whatsappBusinessAccountId = 'WABA ID is required.';
  else if (!/^\d+$/.test(config.whatsappBusinessAccountId)) errs.whatsappBusinessAccountId = 'Must be numeric only.';

  if (!config.whatsappDisplayPhoneNumber) errs.whatsappDisplayPhoneNumber = 'Display phone number is required.';
  else if (!/^\+?\d[\d\s\-]{7,}$/.test(config.whatsappDisplayPhoneNumber))
    errs.whatsappDisplayPhoneNumber = 'Enter a valid phone number with country code.';

  if (!config.whatsappDisplayName) errs.whatsappDisplayName = 'Display name is required.';

  if (!config.defaultTemplateLanguage) errs.defaultTemplateLanguage = 'Template language is required.';

  return errs;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function MetaIntegrationPanel() {
  const { dbUser } = useAuth();
  const isAdmin = dbUser?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validated, setValidated] = useState(false);          // only show errors after first save attempt
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [config, setConfig] = useState<typeof defaultConfig>(defaultConfig);

  const [status, setStatus] = useState({
    connectionStatus: 'not_configured' as ConnectionStatus,
    appSecretConfigured: false,
    webhookVerifyTokenConfigured: false,
    whatsappTokenConfigured: false,
    facebookTokenConfigured: false,
    whatsappWebhookVerified: false,
    whatsappWebhookSubscribed: false,
    lastConnectionTestAt: '',
    lastWebhookReceivedAt: '',
    lastSuccessfulMessageAt: '',
    lastErrorCode: '',
    lastErrorMessage: '',
    // Facebook
    facebookConnectionStatus: 'not_configured' as ConnectionStatus,
    facebookLeadAdsSubscribed: false,
    facebookMessagesSubscribed: false,
    lastFacebookTestAt: '',
    lastFacebookLeadAt: '',
    lastFacebookMessageAt: '',
    facebookLastErrorCode: '',
    facebookLastErrorMessage: '',
    // Instagram
    instagramConnectionStatus: 'not_configured' as ConnectionStatus,
    instagramMessagesSubscribed: false,
    lastInstagramTestAt: '',
    lastInstagramMessageAt: '',
    instagramLastErrorCode: '',
    instagramLastErrorMessage: '',
  });

  const webhookUrl = window.location.hostname === 'localhost'
    ? 'Meta cannot verify a localhost webhook. Deploy functions first.'
    : `https://asia-south1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ecotrophy-inventory'}.cloudfunctions.net/metaWebhook`;

  // ── Live validate on change after first attempt ────────────────────────────
  const handleChange = (key: ConfigKey, value: string) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    if (validated) setFieldErrors(validateAll(next));
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const getMetaSecretStatus = httpsCallable(functions, 'getMetaSecretStatus');
      const response = await getMetaSecretStatus();
      const data = response.data as any;
      setConfig(prev => ({ ...prev, ...data.config }));
      setStatus(prev => ({ ...prev, ...data.status }));
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSaveConfig = async () => {
    if (!isAdmin) return alert('Only Admins can save Meta Integration configurations.');

    setValidated(true);
    const errs = validateAll(config);
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) return; // stop — show inline errors

    setSaving(true);
    setSaveSuccess(false);
    try {
      const saveMetaIntegrationConfig = httpsCallable(functions, 'saveMetaIntegrationConfig');
      await saveMetaIntegrationConfig({ config });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (error: any) {
      alert(`Failed to save configuration: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleTestWhatsApp = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const fn = httpsCallable(functions, 'testWhatsAppConnection');
      await fn();
      await fetchStatus();
    } catch (e: any) { alert(`Test failed: ${e.message}`); }
    finally { setLoading(false); }
  };

  const handleSubscribe = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      await httpsCallable(functions, 'subscribeWhatsAppWebhook')();
      await fetchStatus();
    } catch (e: any) { alert(`Subscribe failed: ${e.message}`); }
    finally { setLoading(false); }
  };

  const handleUnsubscribe = async () => {
    if (!isAdmin) return;
    if (!window.confirm('Unsubscribe webhook? Incoming messages will stop.')) return;
    setLoading(true);
    try {
      await httpsCallable(functions, 'unsubscribeWhatsAppWebhook')();
      await fetchStatus();
    } catch (e: any) { alert(`Unsubscribe failed: ${e.message}`); }
    finally { setLoading(false); }
  };

  const handleDisconnect = async () => {
    if (!isAdmin) return;
    if (!window.confirm('Disconnect WhatsApp? This will clear credentials.')) return;
    alert('Placeholder: disconnect logic to be implemented');
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // ── Error summary list (only after validated) ──────────────────────────────
  const errorList = Object.values(fieldErrors).filter(Boolean);

  // ── States ─────────────────────────────────────────────────────────────────
  if (loading && !config.metaAppId) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-secondary" size={32} />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="space-y-6 max-w-[1400px] mx-auto pb-20">
      {/* Header */}
      <div className="flex justify-between items-center bg-surface p-4 rounded-lg border border-shadow-darker/10 shadow-sm">
        <div>
          <h3 className="flex items-center gap-2 text-primary-dark font-bold text-lg">
            <Database size={20} className="text-primary" />
            Meta Integration System
          </h3>
          <p className="text-xs text-secondary mt-1 max-w-2xl">
            Configure WhatsApp Cloud API and Webhooks. Secret credentials must be configured securely via Firebase CLI.
          </p>
        </div>
        <button onClick={() => setShowSecretModal(true)} className="neo-btn px-4 py-2 text-sm flex items-center gap-2">
          <ExternalLink size={16} /> Secret Setup Instructions
        </button>
      </div>

      {/* Functions not yet deployed — small notice only */}
      {fetchError && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <AlertCircle size={14} className="flex-shrink-0 text-amber-500" />
          <span>
            Firebase Functions not yet deployed — fill in your configuration below and save once deployed.{' '}
            <button onClick={() => setShowSecretModal(true)} className="underline font-semibold hover:text-amber-900">
              View setup commands
            </button>
          </span>
        </div>
      )}


      {validated && errorList.length > 0 && (
        <div className="border border-red-300 bg-red-50 rounded-lg p-4 flex gap-3">
          <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 mb-1">Please complete the following required fields before saving:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {Object.entries(fieldErrors).map(([key, msg]) => msg && (
                <li key={key} className="text-xs text-red-600">{msg}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Save success banner */}
      {saveSuccess && (
        <div className="border border-green-300 bg-green-50 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
          <p className="text-sm font-bold text-green-700">Configuration saved successfully.</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Left: Config (65%) ─────────────────────────────────────────────── */}
        <div className="lg:w-[65%] space-y-6">

          {/* Meta Core */}
          <div className="neo-card p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-shadow-darker/10 pb-3">
              <div>
                <h4 className="font-bold text-primary-dark text-base">Meta Core Configuration</h4>
                {validated && (fieldErrors.metaAppId || fieldErrors.graphApiVersion || fieldErrors.environment) && (
                  <p className="text-[10px] text-red-600 font-semibold mt-0.5 flex items-center gap-1">
                    <AlertCircle size={10} /> Some fields require attention
                  </p>
                )}
              </div>
              {isAdmin && (
                <button onClick={handleSaveConfig} disabled={saving} className="neo-btn-primary text-xs py-1.5 px-4 flex items-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Config
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FieldWrapper label="Meta App ID" required helper="Get this from Meta Developer Dashboard → App Settings → Basic." error={fieldErrors.metaAppId}>
                <input
                  type="text" value={config.metaAppId}
                  onChange={e => handleChange('metaAppId', e.target.value)}
                  className={inputCls(fieldErrors.metaAppId)}
                  placeholder="e.g. 123456789012345" disabled={!isAdmin}
                />
              </FieldWrapper>

              <FieldWrapper label="Business Portfolio ID" helper="Get this from Meta Business Settings → Business Info." error={fieldErrors.metaBusinessPortfolioId}>
                <input
                  type="text" value={config.metaBusinessPortfolioId}
                  onChange={e => handleChange('metaBusinessPortfolioId', e.target.value)}
                  className={inputCls(fieldErrors.metaBusinessPortfolioId)}
                  placeholder="e.g. 987654321098765" disabled={!isAdmin}
                />
              </FieldWrapper>

              <FieldWrapper label="Graph API Version" required helper="Use format v18.0, v19.0 etc." error={fieldErrors.graphApiVersion}>
                <input
                  type="text" value={config.graphApiVersion}
                  onChange={e => handleChange('graphApiVersion', e.target.value)}
                  className={inputCls(fieldErrors.graphApiVersion)}
                  placeholder="v18.0" disabled={!isAdmin}
                />
              </FieldWrapper>

              <FieldWrapper label="Environment" required helper="Use Test for sandbox, Production for live traffic." error={fieldErrors.environment}>
                <select
                  value={config.environment}
                  onChange={e => handleChange('environment', e.target.value)}
                  className={`appearance-none bg-surface ${inputCls(fieldErrors.environment)}`}
                  disabled={!isAdmin}
                >
                  <option value="">-- Select Environment --</option>
                  <option value="Test">Test (Sandbox)</option>
                  <option value="Production">Production</option>
                </select>
              </FieldWrapper>

              <div className="col-span-1 md:col-span-2 space-y-1 pt-2">
                <label className="text-xs font-black text-secondary tracking-widest uppercase">Webhook Callback URL</label>
                <div className="flex items-center gap-2">
                  <input type="text" value={webhookUrl} readOnly className="w-full neo-input text-sm bg-shadow-darker/5 text-secondary" />
                  <button onClick={copyUrl} className="neo-btn p-2" title="Copy URL">
                    {copiedUrl ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                  </button>
                </div>
                {window.location.hostname === 'localhost' && (
                  <p className="text-[10px] text-orange-600 font-medium">
                    Meta cannot verify a localhost webhook. Deploy the Firebase Function before verification.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* WhatsApp Config */}
          <div className="neo-card p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-shadow-darker/10 pb-3">
              <div>
                <h4 className="font-bold text-primary-dark text-base">WhatsApp Cloud API Configuration</h4>
                {validated && REQUIRED_WA_FIELDS.some(f => fieldErrors[f]) && (
                  <p className="text-[10px] text-red-600 font-semibold mt-0.5 flex items-center gap-1">
                    <AlertCircle size={10} /> Some WhatsApp fields require attention
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FieldWrapper label="Phone Number ID" required
                helper="Get this from Meta Developer Dashboard → WhatsApp → API Setup. This is not your mobile number."
                error={fieldErrors.whatsappPhoneNumberId}>
                <input
                  type="text" value={config.whatsappPhoneNumberId}
                  onChange={e => handleChange('whatsappPhoneNumberId', e.target.value)}
                  className={inputCls(fieldErrors.whatsappPhoneNumberId)}
                  placeholder="e.g. 109876543210987" disabled={!isAdmin}
                />
              </FieldWrapper>

              <FieldWrapper label="Business Account ID (WABA)" required
                helper="Get this from Meta Developer Dashboard → WhatsApp → API Setup."
                error={fieldErrors.whatsappBusinessAccountId}>
                <input
                  type="text" value={config.whatsappBusinessAccountId}
                  onChange={e => handleChange('whatsappBusinessAccountId', e.target.value)}
                  className={inputCls(fieldErrors.whatsappBusinessAccountId)}
                  placeholder="e.g. 209876543210987" disabled={!isAdmin}
                />
              </FieldWrapper>

              <FieldWrapper label="Display Phone Number" required
                helper="The customer-facing number shown in WhatsApp. Include country code, e.g. +91 98765 43210."
                error={fieldErrors.whatsappDisplayPhoneNumber}>
                <input
                  type="text" value={config.whatsappDisplayPhoneNumber}
                  onChange={e => handleChange('whatsappDisplayPhoneNumber', e.target.value)}
                  className={inputCls(fieldErrors.whatsappDisplayPhoneNumber)}
                  placeholder="+91 98765 43210" disabled={!isAdmin}
                />
              </FieldWrapper>

              <FieldWrapper label="Display Name" required
                helper="Your business name as shown to WhatsApp users."
                error={fieldErrors.whatsappDisplayName}>
                <input
                  type="text" value={config.whatsappDisplayName}
                  onChange={e => handleChange('whatsappDisplayName', e.target.value)}
                  className={inputCls(fieldErrors.whatsappDisplayName)}
                  placeholder="Company Name" disabled={!isAdmin}
                />
              </FieldWrapper>

              <FieldWrapper label="Default Template Language" required
                helper="BCP-47 language code for approved templates, e.g. en_US, en_IN, hi."
                error={fieldErrors.defaultTemplateLanguage}>
                <input
                  type="text" value={config.defaultTemplateLanguage}
                  onChange={e => handleChange('defaultTemplateLanguage', e.target.value)}
                  className={inputCls(fieldErrors.defaultTemplateLanguage)}
                  placeholder="en_US" disabled={!isAdmin}
                />
              </FieldWrapper>
            </div>
          </div>

          {/* Phase 2A — Facebook & Instagram (real implementation) */}
          <Suspense fallback={
            <div className="neo-card p-6 flex items-center gap-3 text-secondary text-sm">
              <Loader2 size={18} className="animate-spin" /> Loading Facebook integration…
            </div>
          }>
            <FacebookIntegrationCard
              isAdmin={isAdmin}
              facebookTokenConfigured={status.facebookTokenConfigured}
              initialConfig={{
                facebookPageId: (config as any).facebookPageId || '',
                facebookPageName: (config as any).facebookPageName || '',
                facebookPageCategory: (config as any).facebookPageCategory || '',
                facebookLeadFormId: (config as any).facebookLeadFormId || '',
                defaultPipelineId: (config as any).defaultPipelineId || '',
                defaultStageId: (config as any).defaultStageId || '',
                defaultLeadOwnerId: (config as any).defaultLeadOwnerId || '',
              }}
              initialStatus={{
                facebookConnectionStatus: status.facebookConnectionStatus as any,
                facebookLeadAdsSubscribed: status.facebookLeadAdsSubscribed,
                facebookMessagesSubscribed: status.facebookMessagesSubscribed,
                lastFacebookTestAt: status.lastFacebookTestAt,
                lastFacebookLeadAt: status.lastFacebookLeadAt,
                lastFacebookMessageAt: status.lastFacebookMessageAt,
                facebookLastErrorCode: status.facebookLastErrorCode,
                facebookLastErrorMessage: status.facebookLastErrorMessage,
              }}
              onRefresh={fetchStatus}
            />
          </Suspense>

          <Suspense fallback={
            <div className="neo-card p-6 flex items-center gap-3 text-secondary text-sm">
              <Loader2 size={18} className="animate-spin" /> Loading Instagram integration…
            </div>
          }>
            <InstagramIntegrationCard
              isAdmin={isAdmin}
              facebookTokenConfigured={status.facebookTokenConfigured}
              facebookPageId={(config as any).facebookPageId || ''}
              initialConfig={{
                instagramAccountId: (config as any).instagramAccountId || '',
                instagramUsername: (config as any).instagramUsername || '',
                instagramName: (config as any).instagramName || '',
                instagramConnectedPageId: (config as any).instagramConnectedPageId || '',
              }}
              initialStatus={{
                instagramConnectionStatus: status.instagramConnectionStatus as any,
                instagramMessagesSubscribed: status.instagramMessagesSubscribed,
                lastInstagramTestAt: status.lastInstagramTestAt,
                lastInstagramMessageAt: status.lastInstagramMessageAt,
                instagramLastErrorCode: status.instagramLastErrorCode,
                instagramLastErrorMessage: status.instagramLastErrorMessage,
              }}
              onRefresh={fetchStatus}
            />
          </Suspense>
        </div>

        {/* ── Right: Status (35%) ────────────────────────────────────────────── */}
        <div className="lg:w-[35%] space-y-6">
          <MetaStatusCard
            platformName="WhatsApp Cloud API"
            status={status.connectionStatus}
            accountName={config.whatsappDisplayName}
            displayPhoneNumber={config.whatsappDisplayPhoneNumber}
            phoneNumberId={config.whatsappPhoneNumberId}
            wabaId={config.whatsappBusinessAccountId}
            tokenConfigured={status.whatsappTokenConfigured}
            webhookVerified={status.whatsappWebhookVerified}
            webhookSubscribed={status.whatsappWebhookSubscribed}
            lastTestTime={status.lastConnectionTestAt}
            lastWebhookTime={status.lastWebhookReceivedAt}
            lastSuccessfulMessage={status.lastSuccessfulMessageAt}
            lastErrorCode={status.lastErrorCode}
            lastError={status.lastErrorMessage}
            onTest={handleTestWhatsApp}
            onSubscribe={handleSubscribe}
            onUnsubscribe={handleUnsubscribe}
            onSendTest={() => setShowTestModal(true)}
            onDisconnect={handleDisconnect}
            isLoading={loading}
          />

          <div className="neo-card p-5 space-y-3">
            <h4 className="font-bold text-primary-dark text-sm border-b border-shadow-darker/10 pb-2">Secrets Status</h4>
            <div className="space-y-2 text-xs">
              {[
                { label: 'App Secret', ok: status.appSecretConfigured },
                { label: 'Verify Token', ok: status.webhookVerifyTokenConfigured },
                { label: 'WhatsApp Token', ok: status.whatsappTokenConfigured },
                { label: 'Facebook Token', ok: status.facebookTokenConfigured },
              ].map(({ label, ok }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-secondary">{label}</span>
                  {ok
                    ? <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle size={12} />Configured</span>
                    : <span className="text-red-600 font-bold flex items-center gap-1"><AlertCircle size={12} />Missing</span>}
                </div>
              ))}
            </div>
            {(!status.appSecretConfigured || !status.webhookVerifyTokenConfigured || !status.whatsappTokenConfigured || !status.facebookTokenConfigured) && (
              <button onClick={() => setShowSecretModal(true)} className="neo-btn w-full text-xs py-1.5 mt-1 flex items-center justify-center gap-2 text-primary">
                <ExternalLink size={14} /> View Setup Commands
              </button>
            )}
          </div>
        </div>
      </div>

      {showSecretModal && <MetaSecretSetupModal onClose={() => setShowSecretModal(false)} />}
      {showTestModal && <SendTestMessageModal onClose={() => setShowTestModal(false)} onSuccess={() => { setShowTestModal(false); fetchStatus(); }} />}
    </section>
  );
}

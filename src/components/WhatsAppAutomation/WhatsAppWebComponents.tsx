import React from 'react';
import {
  Bot,
  Check,
  CircleDot,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Phone,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  Sparkles,
  User,
  Users,
  Video,
  X,
  Zap,
  Plus
} from 'lucide-react';
import type {
  AiLeadInsight,
  ChatMessage,
  ConversationSummary,
  SessionInfo,
  WhatsAppStatusItem
} from '../../services/whatsappMultiSessionService';

export function formatConversationTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function getDateDividerLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return 'Yesterday';

  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

export function extractFirstUrl(text: string): string | null {
  const match = (text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export function renderLinkifiedText(text: string, isOutbound: boolean) {
  const parts = (text || '').split(/(https?:\/\/[^\s]+)/gi);
  return parts.map((part, idx) => {
    if (/^https?:\/\/[^\s]+$/i.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline break-all font-medium ${
            isOutbound ? 'text-surface hover:opacity-85' : 'text-primary hover:text-primary-dark'
          }`}
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function ContactAvatar({
  name,
  avatarUrl,
  isGroup,
  hasStatusRing = false,
  onImageError,
  sizeClass = 'w-11 h-11 text-sm'
}: {
  name: string;
  avatarUrl?: string;
  isGroup?: boolean;
  hasStatusRing?: boolean;
  onImageError?: () => void;
  sizeClass?: string;
}) {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  const showImg = Boolean(avatarUrl) && avatarUrl !== failedUrl;
  const ringClass = hasStatusRing ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : '';

  if (showImg && avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => {
          setFailedUrl(avatarUrl);
          onImageError?.();
        }}
        className={`${sizeClass} ${ringClass} rounded-full object-cover shadow-neo-surface shrink-0 bg-surface`}
      />
    );
  }
  const initial = (name || 'W').replace(/^\+\d+\s*/, '')[0]?.toUpperCase() || 'W';
  return (
    <div
      className={`${sizeClass} ${ringClass} rounded-full bg-surface shadow-neo-surface text-primary flex items-center justify-center font-bold shrink-0`}
    >
      {isGroup ? <Users size={16} /> : initial}
    </div>
  );
}

export function formatPresenceSubtitle(
  presence?: string | null,
  lastSeen?: number | null,
  fallback = ''
): { label: string; isLive: boolean } {
  if (presence === 'composing') return { label: 'typing...', isLive: true };
  if (presence === 'recording') return { label: 'recording audio...', isLive: true };
  if (presence === 'available') return { label: 'online', isLive: true };
  if (lastSeen) {
    const d = new Date(lastSeen);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      label: sameDay
        ? `last seen today at ${timeStr}`
        : `last seen ${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} at ${timeStr}`,
      isLive: false
    };
  }
  return { label: fallback, isLive: false };
}

export function MessagePreviewIcon({ mediaType }: { mediaType?: string }) {
  if (mediaType === 'image') return <ImageIcon size={12} className="shrink-0 text-primary" />;
  if (mediaType === 'video') return <Video size={12} className="shrink-0 text-primary" />;
  if (mediaType === 'audio') return <Mic size={12} className="shrink-0 text-primary" />;
  if (mediaType === 'document') return <FileText size={12} className="shrink-0 text-primary" />;
  return null;
}

export function MessageBubble({
  message,
  onPreviewImage
}: {
  message: ChatMessage;
  onPreviewImage: (url: string) => void;
}) {
  const firstUrl = extractFirstUrl(message.text);
  const urlDomain = (() => {
    if (!firstUrl) return null;
    try {
      return new URL(firstUrl).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  })();

  const isOutbound = Boolean(message.fromMe);

  return (
    <div className={`flex flex-col max-w-[78%] sm:max-w-[68%] ${isOutbound ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
      <div
        className={`rounded-card px-3.5 py-2.5 text-xs leading-relaxed break-words ${
          isOutbound
            ? 'bg-primary text-surface shadow-neo-raised rounded-tr-sm'
            : 'bg-surface text-primary-dark shadow-neo-raised rounded-tl-sm border border-shadow-darker/60'
        }`}
      >
        {!isOutbound && message.senderName && message.remoteJid?.endsWith('@g.us') && (
          <div className="text-[11px] font-bold text-primary mb-1">{message.senderName}</div>
        )}

        {/* Inline Image Attachment */}
        {message.mediaUrl && message.mediaType === 'image' && (
          <div className="mb-2 overflow-hidden rounded-input">
            <img
              src={message.mediaUrl}
              alt={message.fileName || 'WhatsApp image'}
              onClick={() => onPreviewImage(message.mediaUrl!)}
              className="max-h-72 w-auto rounded-input cursor-pointer object-cover hover:opacity-95 transition-opacity"
            />
          </div>
        )}

        {/* Inline Video Attachment */}
        {message.mediaUrl && message.mediaType === 'video' && (
          <div className="mb-2 overflow-hidden rounded-input">
            <video src={message.mediaUrl} controls className="max-h-72 rounded-input w-full" />
          </div>
        )}

        {/* Inline Voice / Audio Player */}
        {message.mediaUrl && message.mediaType === 'audio' && (
          <div className="mb-2">
            <audio src={message.mediaUrl} controls className="h-8 max-w-[240px]" />
          </div>
        )}

        {/* Inline Document Card */}
        {message.mediaUrl && message.mediaType === 'document' && (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={message.fileName || undefined}
            className={`mb-2 flex items-center gap-2.5 p-2.5 rounded-input transition-opacity hover:opacity-90 ${
              isOutbound ? 'bg-primary-dark/40 text-surface' : 'bg-surface shadow-neo-inset text-primary-dark'
            }`}
          >
            <FileText size={18} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate text-[11px]">{message.fileName || 'Document'}</div>
              <div className="text-[10px] opacity-80">Click to open or download</div>
            </div>
            <Download size={14} className="shrink-0" />
          </a>
        )}

        {/* Compact URL Link Card */}
        {firstUrl && urlDomain && (
          <a
            href={firstUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`mb-1.5 flex items-center justify-between gap-2 px-2.5 py-2 rounded-input text-[11px] ${
              isOutbound ? 'bg-primary-dark/35 text-surface' : 'bg-surface shadow-neo-inset text-primary-dark'
            }`}
          >
            <div className="min-w-0">
              <div className="font-bold truncate">{urlDomain}</div>
              <div className="text-[10px] opacity-80 truncate">{firstUrl}</div>
            </div>
            <ExternalLink size={13} className="shrink-0" />
          </a>
        )}

        {/* Message Text */}
        {!(
          message.mediaUrl &&
          (message.text === 'Photo' ||
            message.text === 'Video' ||
            message.text === 'Voice message' ||
            message.text === message.fileName)
        ) && (
          <p className="whitespace-pre-wrap text-xs leading-relaxed">
            {renderLinkifiedText(message.text, isOutbound)}
          </p>
        )}

        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            isOutbound ? 'text-surface/80' : 'text-secondary'
          }`}
        >
          <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          {isOutbound && <Check size={11} />}
        </div>
      </div>
    </div>
  );
}

export function InlineQrSetupView({
  session,
  newAccountLabel,
  onLabelChange,
  onCreateNewTab,
  onRescanSession,
  onRequestPairingCode,
  creating,
  rescanning
}: {
  session: SessionInfo | null;
  newAccountLabel: string;
  onLabelChange: (val: string) => void;
  onCreateNewTab: () => void;
  onRescanSession: (id: string) => void;
  onRequestPairingCode?: (sessionId: string, phone: string) => Promise<{ pairingCode?: string; error?: string }>;
  creating: boolean;
  rescanning: boolean;
}) {
  const [pairPhone, setPairPhone] = React.useState('');
  const [pairingCode, setPairingCode] = React.useState<string | null>(null);
  const [pairingError, setPairingError] = React.useState<string | null>(null);
  const [requestingCode, setRequestingCode] = React.useState(false);

  React.useEffect(() => {
    setPairingCode(null);
    setPairingError(null);
  }, [session?.id]);

  const handleGetCode = async () => {
    if (!session || !onRequestPairingCode || !pairPhone.trim()) return;
    setRequestingCode(true);
    setPairingError(null);
    const res = await onRequestPairingCode(session.id, pairPhone.trim());
    setRequestingCode(false);
    if (res.pairingCode) {
      setPairingCode(res.pairingCode);
    } else {
      setPairingError(res.error || 'Could not request pairing code.');
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto bg-surface">
      <div className="w-full max-w-4xl neo-card !p-6 sm:!p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-7 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface shadow-neo-surface text-[11px] font-bold text-primary">
            <Smartphone size={14} /> WhatsApp Web Multi-Account Session
          </div>
          <h3 className="text-xl font-extrabold text-primary-dark leading-tight">
            {session ? `Link "${session.label}" via QR Code` : 'Open a WhatsApp Web Tab in EcoBill'}
          </h3>
          <ol className="space-y-2 text-xs text-primary-dark list-decimal pl-4 leading-relaxed">
            <li>Open <strong>WhatsApp</strong> on your phone and ensure less than 4 devices are currently linked.</li>
            <li>Tap <strong>Menu (⋮)</strong> or <strong>Settings</strong> &rarr; <strong>Linked Devices</strong> &rarr; <strong>Link a Device</strong>.</li>
            <li>Point your phone camera steadily at the white QR card (or link via phone number below).</li>
            <li>Once linked, chats sync directly into this workspace.</li>
          </ol>

          {!session && (
            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={newAccountLabel}
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="Account name (e.g. Sales Desk)"
                className="neo-input flex-1 text-xs !py-2.5"
              />
              <button
                onClick={onCreateNewTab}
                disabled={creating || !newAccountLabel.trim()}
                className="neo-btn-primary text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Open QR Scanner
              </button>
            </div>
          )}

          {session && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => onRescanSession(session.id)}
                  disabled={rescanning}
                  className="neo-btn text-xs font-bold flex items-center gap-1.5 text-primary"
                >
                  <RefreshCw size={13} className={rescanning ? 'animate-spin' : ''} />
                  {session.status === 'qr_ready' ? 'Refresh QR Code' : 'Generate Fresh QR Code'}
                </button>
                <span className="text-[11px] text-secondary">
                  {session.status === 'qr_ready'
                    ? 'QR expires every ~20s automatically.'
                    : session.status === 'disconnected'
                    ? 'QR expired or disconnected — click Refresh to try again.'
                    : 'Preparing WhatsApp connection...'}
                </span>
              </div>

              {onRequestPairingCode && (
                <div className="p-3.5 rounded-card bg-surface shadow-neo-surface space-y-2.5">
                  <p className="text-[11px] font-bold text-primary-dark">
                    Camera not scanning? Link with Phone Number instead:
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={pairPhone}
                      onChange={(e) => setPairPhone(e.target.value)}
                      placeholder="WhatsApp number (e.g. 918148936699)"
                      className="neo-input flex-1 text-xs !py-2"
                    />
                    <button
                      type="button"
                      onClick={handleGetCode}
                      disabled={requestingCode || !pairPhone.trim()}
                      className="neo-btn-primary !px-4 !py-2 text-xs font-bold shrink-0 disabled:opacity-50"
                    >
                      {requestingCode ? 'Requesting...' : 'Get 8-Digit Code'}
                    </button>
                  </div>
                  {pairingCode && (
                    <div className="p-2.5 rounded-input bg-surface shadow-neo-inset text-center space-y-1">
                      <span className="text-[10px] text-secondary block">
                        Enter this code under Linked Devices &rarr; Link with phone number instead:
                      </span>
                      <span className="text-lg font-extrabold tracking-widest text-primary font-mono select-all">
                        {pairingCode}
                      </span>
                    </div>
                  )}
                  {pairingError && <p className="text-[11px] text-tertiary font-semibold">{pairingError}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="md:col-span-5 flex flex-col items-center justify-center">
          <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-card bg-shadow-light shadow-neo-raised flex items-center justify-center p-2.5">
            {session?.status === 'qr_ready' && session.qrCodeDataUrl ? (
              <img
                src={session.qrCodeDataUrl}
                alt="WhatsApp Web QR Code"
                className="w-full h-full object-contain"
              />
            ) : session?.status === 'disconnected' ? (
              <div className="text-center space-y-2 p-4 text-secondary">
                <QrCode size={40} className="mx-auto text-primary opacity-60" />
                <p className="text-xs font-bold text-primary-dark">QR Session Timed Out</p>
                <p className="text-[11px]">Click &ldquo;Generate Fresh QR Code&rdquo; to load a new QR.</p>
              </div>
            ) : session ? (
              <div className="text-center space-y-2 p-4 text-secondary">
                <Loader2 size={28} className="mx-auto text-primary animate-spin" />
                <p className="text-xs font-semibold text-primary-dark">Generating WhatsApp QR...</p>
                <p className="text-[11px]">QR code will appear automatically.</p>
              </div>
            ) : (
              <div className="text-center space-y-2 p-4 text-secondary">
                <QrCode size={42} className="mx-auto text-primary opacity-60" />
                <p className="text-xs font-semibold text-primary-dark">Ready to Scan</p>
                <p className="text-[11px]">Start a session on the left to generate a live QR code.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiCopilotDrawer({
  insight,
  crmPreview,
  analyzing,
  sending,
  saveSuccess,
  onClose,
  onReanalyze,
  onDraftQuotation,
  onSaveToCrm,
  onSendSuggestedReply
}: {
  insight: AiLeadInsight | null;
  crmPreview?: { pipelineName: string; stageLabel: string } | null;
  analyzing: boolean;
  sending: boolean;
  saveSuccess: boolean;
  onClose: () => void;
  onReanalyze: () => void;
  onDraftQuotation: () => void;
  onSaveToCrm: () => void;
  onSendSuggestedReply: (reply: string) => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 top-14 z-50 lg:static lg:inset-auto w-full lg:w-[340px] shrink-0 bg-surface border-t lg:border-t-0 lg:border-l border-shadow-dark flex flex-col min-h-0 overflow-hidden animate-fade-in rounded-t-card lg:rounded-none shadow-neo-raised lg:shadow-none">
      <div className="px-4 py-3 border-b border-shadow-dark flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h3 className="text-xs font-bold text-primary-dark">AI Agent Copilot</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReanalyze}
            disabled={analyzing}
            title="Analyze recent chat messages"
            className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary"
          >
            <RefreshCw size={13} className={analyzing ? 'animate-spin text-primary' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark"
            title="Close AI Copilot"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-sidebar-scrollbar">
        {analyzing ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-secondary">
            <Loader2 size={24} className="animate-spin text-primary" />
            <span className="text-xs font-semibold">Analyzing conversation...</span>
          </div>
        ) : insight ? (
          <>
            <div className="p-4 rounded-card bg-surface shadow-neo-surface space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">Lead Specs</span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-surface shadow-neo-surface text-primary font-bold">
                  {crmPreview?.stageLabel || insight.pipelineStage || insight.stage}
                </span>
              </div>

              {crmPreview && (
                <div className="px-2.5 py-1.5 rounded-card bg-surface shadow-neo-inset text-[11px] flex items-center justify-between gap-2">
                  <span className="text-secondary font-medium">Pipeline</span>
                  <span className="font-bold text-primary-dark truncate">{crmPreview.pipelineName}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-card bg-surface shadow-neo-surface">
                  <span className="text-[10px] text-secondary block">Name</span>
                  <strong className="text-primary-dark truncate block mt-0.5">{insight.leadName || 'Inquiry'}</strong>
                </div>
                <div className="p-2.5 rounded-card bg-surface shadow-neo-surface">
                  <span className="text-[10px] text-secondary block">Phone</span>
                  <strong className="text-primary-dark truncate block mt-0.5">
                    {insight.phone ? `+${insight.phone}` : 'Private ID'}
                  </strong>
                </div>
                <div className="col-span-2 p-2.5 rounded-card bg-surface shadow-neo-surface">
                  <span className="text-[10px] text-secondary block">Requirement</span>
                  <strong className="text-primary-dark text-[11px] leading-snug block mt-0.5">
                    {insight.requirement}
                  </strong>
                </div>
                {insight.quantity && (
                  <div className="p-2.5 rounded-card bg-surface shadow-neo-surface">
                    <span className="text-[10px] text-secondary block">Quantity</span>
                    <strong className="text-primary-dark mt-0.5 block">{insight.quantity}</strong>
                  </div>
                )}
                {insight.budget && (
                  <div className="p-2.5 rounded-card bg-surface shadow-neo-surface">
                    <span className="text-[10px] text-secondary block">Budget</span>
                    <strong className="text-primary font-bold mt-0.5 block">{insight.budget}</strong>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-card bg-surface shadow-neo-surface space-y-2.5">
              <div className="flex items-start gap-2">
                <Zap size={15} className="text-primary mt-0.5 shrink-0" />
                <div>
                  <h5 className="text-xs font-bold text-primary-dark">{insight.suggestedAction}</h5>
                  <p className="text-[11px] text-secondary mt-0.5">Derived from conversation by AI Agent.</p>
                </div>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={onDraftQuotation}
                  className="neo-btn-primary w-full flex items-center justify-center gap-2 text-xs"
                >
                  <FileText size={14} /> Draft Quotation in Bill-Pro
                </button>
                <button
                  onClick={onSaveToCrm}
                  disabled={saveSuccess}
                  className="neo-btn w-full flex items-center justify-center gap-1.5 text-xs text-primary-dark"
                >
                  {saveSuccess ? (
                    <span className="text-primary flex items-center gap-1 font-bold">
                      <Check size={14} /> Saved to CRM!
                    </span>
                  ) : (
                    <>
                      <Plus size={14} /> Save to CRM Pipeline
                    </>
                  )}
                </button>
              </div>
            </div>

            {insight.suggestedReply && (
              <div className="p-4 rounded-card bg-surface shadow-neo-surface space-y-2.5">
                <span className="text-[11px] font-bold text-secondary uppercase flex items-center gap-1">
                  <Bot size={13} className="text-primary" /> AI Suggested Reply
                </span>
                <p className="text-xs text-primary-dark bg-surface shadow-neo-inset p-3 rounded-card leading-relaxed italic">
                  "{insight.suggestedReply}"
                </p>
                <button
                  onClick={() => onSendSuggestedReply(insight.suggestedReply)}
                  disabled={sending}
                  className="neo-btn-primary w-full flex items-center justify-center gap-2 text-xs"
                >
                  <Send size={13} /> 1-Click Send via WhatsApp
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center text-secondary space-y-3">
            <Sparkles size={28} className="mx-auto text-primary opacity-40" />
            <p className="text-xs font-semibold text-primary-dark">AI Copilot Ready</p>
            <p className="text-[11px] leading-relaxed">
              Click analyze above or receive a customer message to extract quotation specs and draft replies.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ContactProfileDrawer({
  thread,
  avatarUrl,
  about,
  presence,
  lastSeen,
  onClose,
  onOpenCopilot
}: {
  thread: ConversationSummary;
  avatarUrl?: string;
  about?: string | null;
  presence?: string | null;
  lastSeen?: number | null;
  onClose: () => void;
  onOpenCopilot: () => void;
}) {
  const statusInfo = formatPresenceSubtitle(presence, lastSeen, thread.isSelfChat ? 'Message yourself' : '');

  return (
    <div className="w-full lg:w-[320px] shrink-0 bg-surface border-l border-shadow-dark flex flex-col min-h-0 overflow-hidden animate-fade-in">
      <div className="px-4 py-3 border-b border-shadow-dark flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User size={15} className="text-primary" />
          <h3 className="text-xs font-bold text-primary-dark">Contact Info</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark"
          title="Close Contact Info"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-sidebar-scrollbar">
        <div className="flex flex-col items-center text-center space-y-2.5 p-4 rounded-card bg-surface shadow-neo-surface">
          <ContactAvatar
            name={thread.name}
            avatarUrl={avatarUrl}
            isGroup={Boolean(thread.isGroup || thread.remoteJid?.endsWith('@g.us'))}
            sizeClass="w-24 h-24 text-2xl"
          />
          <div>
            <h4 className="text-sm font-extrabold text-primary-dark">{thread.name}</h4>
            <p className="text-xs text-secondary mt-0.5 flex items-center justify-center gap-1">
              <Phone size={11} className="text-primary" />
              {thread.phone ? `+${thread.phone}` : 'WhatsApp Account'}
            </p>
            {statusInfo.label && (
              <p className={`text-[11px] mt-1 font-semibold ${statusInfo.isLive ? 'text-primary' : 'text-secondary'}`}>
                {statusInfo.label}
              </p>
            )}
          </div>
        </div>

        <div className="p-4 rounded-card bg-surface shadow-neo-surface space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">About</span>
          <p className="text-xs text-primary-dark leading-relaxed">
            {about || 'Hey there! I am using WhatsApp.'}
          </p>
        </div>

        <div className="p-4 rounded-card bg-surface shadow-neo-surface space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">Linked Account</span>
          <p className="text-xs font-bold text-primary">{thread.sessionLabel}</p>
        </div>

        <button
          onClick={onOpenCopilot}
          className="neo-btn-primary w-full flex items-center justify-center gap-2 text-xs font-bold"
        >
          <Sparkles size={14} /> Open AI Lead Copilot
        </button>
      </div>
    </div>
  );
}

export function StatusFeedView({
  statuses,
  sessions,
  onSelectChatFromStatus
}: {
  statuses: WhatsAppStatusItem[];
  sessions: SessionInfo[];
  onSelectChatFromStatus?: (status: WhatsAppStatusItem) => void;
}) {
  const [selectedStatus, setSelectedStatus] = React.useState<WhatsAppStatusItem | null>(statuses[0] || null);

  React.useEffect(() => {
    if (!selectedStatus && statuses.length > 0) {
      setSelectedStatus(statuses[0]);
    }
  }, [statuses.length]);

  const activeAccount = sessions.find((s) => s.status === 'connected') || sessions[0];

  return (
    <div className="flex-1 flex min-w-0 min-h-0 bg-surface">
      {/* Left Status List */}
      <div className="w-full md:w-[340px] lg:w-[370px] shrink-0 border-r border-shadow-dark flex flex-col min-h-0 bg-surface">
        <div className="px-4 py-3.5 border-b border-shadow-dark space-y-3">
          <h2 className="text-lg font-extrabold text-primary-dark tracking-tight flex items-center gap-2">
            <CircleDot size={18} className="text-primary" /> Status Updates
          </h2>

          {/* My Status Card */}
          <div className="p-3 rounded-card bg-surface shadow-neo-surface flex items-center gap-3">
            <ContactAvatar
              name={activeAccount?.pushName || activeAccount?.label || 'My Status'}
              avatarUrl={activeAccount?.avatarUrl}
              sizeClass="w-11 h-11 text-sm"
            />
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-primary-dark truncate">
                {activeAccount?.pushName || activeAccount?.label || 'My Status'}
              </h4>
              <p className="text-[11px] text-secondary truncate">
                {activeAccount?.aboutStatus || (activeAccount?.phoneNumber ? `+${activeAccount.phoneNumber}` : 'Connected account')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-shadow-darker/60 custom-sidebar-scrollbar">
          {statuses.length === 0 ? (
            <div className="p-8 text-center text-xs text-secondary space-y-2.5">
              <CircleDot size={30} className="mx-auto text-primary opacity-50" />
              <p className="font-bold text-primary-dark">No Recent Status Updates</p>
              <p className="text-[11px] leading-relaxed">
                Live WhatsApp Status updates posted by your contacts while connected will appear here automatically.
              </p>
            </div>
          ) : (
            statuses.map((st) => {
              const isSelected = selectedStatus?.id === st.id;
              return (
                <div
                  key={`${st.sessionId}:${st.id}`}
                  onClick={() => setSelectedStatus(st)}
                  className={`px-3.5 py-3 cursor-pointer flex items-center gap-3 transition-all ${
                    isSelected ? 'bg-surface shadow-neo-pressed' : 'hover:bg-shadow-darker/25'
                  }`}
                >
                  <ContactAvatar
                    name={st.senderName}
                    avatarUrl={st.avatarUrl}
                    hasStatusRing
                    sizeClass="w-11 h-11 text-sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-primary-dark truncate">{st.senderName}</h4>
                      <span className="text-[10px] text-secondary shrink-0">
                        {formatConversationTime(st.timestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] text-secondary truncate mt-0.5">{st.text}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Status Viewer */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center p-6 bg-surface">
        {selectedStatus ? (
          <div className="w-full max-w-md neo-card space-y-4 text-center">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-shadow-dark text-left">
              <div className="flex items-center gap-3 min-w-0">
                <ContactAvatar
                  name={selectedStatus.senderName}
                  avatarUrl={selectedStatus.avatarUrl}
                  hasStatusRing
                  sizeClass="w-10 h-10 text-xs"
                />
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-primary-dark truncate">{selectedStatus.senderName}</h4>
                  <p className="text-[10px] text-secondary">
                    {formatConversationTime(selectedStatus.timestamp)} &bull; {selectedStatus.sessionLabel}
                  </p>
                </div>
              </div>
              {onSelectChatFromStatus && selectedStatus.senderPhone && (
                <button
                  onClick={() => onSelectChatFromStatus(selectedStatus)}
                  className="neo-btn !px-3 !py-1.5 text-[11px] font-bold text-primary"
                >
                  Reply in Chat
                </button>
              )}
            </div>

            {selectedStatus.mediaUrl && selectedStatus.mediaType === 'image' && (
              <img
                src={selectedStatus.mediaUrl}
                alt={selectedStatus.senderName}
                className="max-h-96 mx-auto rounded-card object-contain shadow-neo-surface"
              />
            )}
            {selectedStatus.mediaUrl && selectedStatus.mediaType === 'video' && (
              <video src={selectedStatus.mediaUrl} controls className="max-h-96 mx-auto rounded-card w-full" />
            )}
            <p className="text-sm font-medium text-primary-dark whitespace-pre-wrap p-3 rounded-card bg-surface shadow-neo-inset">
              {selectedStatus.text}
            </p>
          </div>
        ) : (
          <div className="text-center space-y-2 text-secondary">
            <CircleDot size={36} className="mx-auto text-primary opacity-40" />
            <p className="text-sm font-bold text-primary-dark">Click a contact on the left to view Status</p>
          </div>
        )}
      </div>
    </div>
  );
}



import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Plus,
  Trash2,
  RefreshCw,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  User,
  ShieldCheck,
  X
} from 'lucide-react';
import {
  type SessionInfo,
  fetchAllSessions,
  createNewSession,
  deleteSession,
  fetchSessionQr,
  subscribeToWhatsAppEvents
} from '../../services/whatsappMultiSessionService';

interface MultiAccountManagerProps {
  activeSessionId?: string;
  onSelectSession?: (sessionId: string) => void;
}

export function MultiAccountManager({ activeSessionId, onSelectSession }: MultiAccountManagerProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccountLabel, setNewAccountLabel] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [activeQrSession, setActiveQrSession] = useState<SessionInfo | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    const data = await fetchAllSessions();
    setSessions(data);
    if (data.length > 0 && !activeSessionId && onSelectSession) {
      onSelectSession(data[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSessions();

    const unsubscribe = subscribeToWhatsAppEvents({
      onSessionUpdate: (updatedSession) => {
        setSessions((prev) => {
          const index = prev.findIndex((s) => s.id === updatedSession.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = updatedSession;
            return next;
          }
          return [...prev, updatedSession];
        });

        if (activeQrSession && activeQrSession.id === updatedSession.id) {
          setActiveQrSession(updatedSession);
          if (updatedSession.status === 'connected') {
            setStatusMessage({
              type: 'success',
              text: `✓ Account "${updatedSession.label}" linked successfully!`
            });
            setTimeout(() => {
              setIsModalOpen(false);
              setActiveQrSession(null);
            }, 1800);
          }
        }
      },
      onSessionDeleted: ({ id }) => {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (activeSessionId === id && onSelectSession) {
          const remaining = sessions.filter((s) => s.id !== id);
          if (remaining.length > 0) onSelectSession(remaining[0].id);
        }
      }
    });

    return () => unsubscribe();
  }, [activeQrSession?.id, activeSessionId]);

  useEffect(() => {
    if (!isModalOpen || !activeQrSession || activeQrSession.status === 'connected') return;

    const interval = setInterval(async () => {
      const fresh = await fetchSessionQr(activeQrSession.id);
      if (fresh) {
        setActiveQrSession(fresh);
        if (fresh.status === 'connected') {
          setStatusMessage({
            type: 'success',
            text: `✓ Account "${fresh.label}" linked successfully!`
          });
          setTimeout(() => {
            setIsModalOpen(false);
            setActiveQrSession(null);
          }, 1800);
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isModalOpen, activeQrSession?.id, activeQrSession?.status]);

  const handleOpenAddAccount = () => {
    setNewAccountLabel(`WhatsApp Account ${sessions.length + 1}`);
    setActiveQrSession(null);
    setStatusMessage(null);
    setIsModalOpen(true);
  };

  const handleStartLinking = async () => {
    if (!newAccountLabel.trim()) return;
    setCreatingSession(true);
    setStatusMessage(null);

    const res = await createNewSession(newAccountLabel.trim());
    setCreatingSession(false);

    if (res.success && res.session) {
      setActiveQrSession(res.session);
    } else {
      setStatusMessage({
        type: 'error',
        text: res.error || 'Failed to initialize session. Ensure WhatsApp service is running.'
      });
    }
  };

  const handleDeleteSession = async (id: string, label: string) => {
    if (!window.confirm(`Are you sure you want to disconnect and remove "${label}"?`)) return;
    setDeletingId(id);
    const success = await deleteSession(id);
    setDeletingId(null);
    if (success) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setStatusMessage({ type: 'success', text: `Disconnected "${label}".` });
    } else {
      setStatusMessage({ type: 'error', text: 'Failed to disconnect session.' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 bg-surface rounded-card shadow-neo-raised">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-card bg-surface shadow-neo-raised text-primary flex items-center justify-center font-bold">
            <Smartphone size={22} />
          </div>
          <div>
            <h3 className="text-base font-bold text-primary-dark flex items-center gap-2">
              Multi-Device WhatsApp Accounts
              <span className="text-xs px-3 py-0.5 rounded-full bg-surface shadow-neo-surface text-primary font-bold">
                {sessions.filter((s) => s.status === 'connected').length} Connected
              </span>
            </h3>
            <p className="text-xs text-secondary mt-0.5">
              Link multiple WhatsApp numbers via QR scan. Inbound chats auto-extract leads with AI recommendations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSessions}
            disabled={loading}
            className="w-10 h-10 rounded-full bg-surface shadow-neo-raised text-secondary hover:text-primary flex items-center justify-center transition-all hover:shadow-neo-hover active:shadow-neo-pressed"
            title="Refresh accounts"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleOpenAddAccount}
            className="neo-btn-primary flex items-center gap-2 text-xs font-semibold"
          >
            <Plus size={16} /> Link New WhatsApp
          </button>
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-card text-xs font-semibold flex items-center gap-2 shadow-neo-surface animate-fade-in ${
            statusMessage.type === 'success' ? 'text-primary bg-surface' : 'text-primary-dark bg-surface border border-secondary/20'
          }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 size={16} className="text-primary" /> : <AlertCircle size={16} />}
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="ml-auto text-secondary hover:text-primary-dark">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Accounts List */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-secondary gap-2">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="text-xs">Checking WhatsApp sessions...</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-8 text-center bg-surface shadow-neo-inset rounded-card space-y-3">
          <QrCode size={36} className="mx-auto text-secondary opacity-60" />
          <h4 className="text-sm font-bold text-primary-dark">No WhatsApp Accounts Linked Yet</h4>
          <p className="text-xs text-secondary max-w-md mx-auto">
            Click <strong>"Link New WhatsApp"</strong> above to scan a QR code with your phone. You can add as many sales and support numbers as needed.
          </p>
          <button
            onClick={handleOpenAddAccount}
            className="neo-btn-primary mx-auto inline-flex items-center gap-2 text-xs"
          >
            <Plus size={15} /> Add First Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((s) => {
            const isSelected = activeSessionId === s.id;
            const isConnected = s.status === 'connected';

            return (
              <div
                key={s.id}
                onClick={() => onSelectSession?.(s.id)}
                className={`p-5 rounded-card transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-surface shadow-neo-pressed border border-primary/40'
                    : 'bg-surface shadow-neo-raised hover:shadow-neo-hover'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-card flex items-center justify-center font-bold text-sm shrink-0 shadow-neo-surface ${
                        isConnected ? 'text-primary' : 'text-secondary'
                      }`}
                    >
                      <Phone size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-primary-dark truncate">{s.label}</h4>
                        {isSelected && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-surface font-bold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-secondary truncate mt-0.5">
                        {s.phoneNumber ? `+${s.phoneNumber}` : 'Pending QR Scan'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(s.id, s.label);
                    }}
                    disabled={deletingId === s.id}
                    className="p-1.5 text-secondary hover:text-primary-dark rounded-lg transition-colors"
                    title="Disconnect account"
                  >
                    {deletingId === s.id ? <Loader2 size={15} className="animate-spin text-primary" /> : <Trash2 size={15} />}
                  </button>
                </div>

                {/* Footer status row */}
                <div className="mt-4 pt-3 border-t border-shadow-dark flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isConnected ? 'bg-primary animate-pulse' : 'bg-secondary'
                      }`}
                    />
                    <span className="font-semibold text-primary-dark capitalize">
                      {isConnected ? 'Online & Linked' : s.status === 'qr_ready' ? 'Awaiting Scan' : 'Connecting...'}
                    </span>
                  </div>

                  {!isConnected && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveQrSession(s);
                        setIsModalOpen(true);
                      }}
                      className="text-primary font-bold hover:underline flex items-center gap-1"
                    >
                      <QrCode size={13} /> View QR
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR Code Linking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface w-full max-w-md rounded-card shadow-neo-raised p-6 relative space-y-4 border border-shadow-light">
            <div className="flex items-center justify-between border-b border-shadow-dark pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-card bg-surface shadow-neo-surface text-primary">
                  <QrCode size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-primary-dark">Link WhatsApp Account</h3>
                  <p className="text-xs text-secondary">Scan QR code using WhatsApp on your phone</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setActiveQrSession(null);
                }}
                className="p-1.5 rounded-lg text-secondary hover:text-primary-dark"
              >
                <X size={18} />
              </button>
            </div>

            {!activeQrSession ? (
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-bold text-primary-dark block mb-1.5">
                    Account Label / Nickname
                  </label>
                  <input
                    type="text"
                    value={newAccountLabel}
                    onChange={(e) => setNewAccountLabel(e.target.value)}
                    placeholder="e.g. Sales Team - Chennai, Support Official"
                    className="neo-input w-full text-xs"
                  />
                  <span className="text-[11px] text-secondary mt-1 block">
                    Use this to identify which sales rep or desk this number belongs to.
                  </span>
                </div>

                <button
                  onClick={handleStartLinking}
                  disabled={creatingSession || !newAccountLabel.trim()}
                  className="neo-btn-primary w-full flex items-center justify-center gap-2 text-xs"
                >
                  {creatingSession ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                  Generate QR Code
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-center py-2">
                {activeQrSession.status === 'connected' ? (
                  <div className="py-8 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-surface shadow-neo-raised text-primary flex items-center justify-center mx-auto">
                      <CheckCircle2 size={36} />
                    </div>
                    <h4 className="text-base font-bold text-primary-dark">
                      Successfully Connected!
                    </h4>
                    <p className="text-xs text-secondary">
                      Phone Number: <strong className="text-primary-dark">+{activeQrSession.phoneNumber}</strong>
                    </p>
                  </div>
                ) : activeQrSession.qrCodeDataUrl ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-surface rounded-card shadow-neo-inset inline-block mx-auto">
                      <img
                        src={activeQrSession.qrCodeDataUrl}
                        alt="WhatsApp QR Code"
                        className="w-56 h-56 mx-auto rounded-lg"
                      />
                    </div>

                    <div className="text-xs text-left text-secondary bg-surface p-4 rounded-card shadow-neo-surface space-y-1.5">
                      <p className="font-bold text-primary-dark flex items-center gap-1.5">
                        <Smartphone size={14} className="text-primary" /> Instructions to Link:
                      </p>
                      <ol className="list-decimal pl-4 space-y-1 text-[11px] leading-relaxed">
                        <li>Open <strong>WhatsApp</strong> on your mobile phone.</li>
                        <li>Tap <strong>Settings</strong> (iPhone) or <strong>⋮ Menu</strong> (Android).</li>
                        <li>Select <strong>Linked Devices</strong> &rarr; <strong>Link a Device</strong>.</li>
                        <li>Scan the QR code displayed above.</li>
                      </ol>
                    </div>

                    <p className="text-[11px] text-secondary flex items-center justify-center gap-1.5">
                      <RefreshCw size={12} className="animate-spin text-primary" /> Waiting for scan... QR refreshes automatically.
                    </p>
                  </div>
                ) : (
                  <div className="py-12 space-y-3">
                    <Loader2 size={32} className="animate-spin text-primary mx-auto" />
                    <p className="text-xs text-secondary">Connecting to WhatsApp service and generating QR...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

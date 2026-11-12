import { useEffect, useState } from 'react';
import { Bot, Maximize2, Minus, Monitor, RefreshCw, X } from 'lucide-react';
import { WhatsAppAiAgentHub } from '../components/WhatsAppAutomation/WhatsAppAiAgentHub';
import {
  getDesktopAppStatus,
  triggerDesktopAction,
  type DesktopAppStatus
} from '../services/desktopControlService';

export default function WhatsAppAutomation() {
  const isElectronDesktop = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);
  const [desktopStatus, setDesktopStatus] = useState<DesktopAppStatus | null>(null);
  const [desktopBusy, setDesktopBusy] = useState(false);

  const refreshStatus = async () => {
    const st = await getDesktopAppStatus();
    setDesktopStatus(st);
  };

  useEffect(() => {
    if (isElectronDesktop) return;
    refreshStatus();
    const timer = setInterval(refreshStatus, 5000);
    return () => clearInterval(timer);
  }, [isElectronDesktop]);

  // In EcoBill Desktop, AppLayout keeps WhatsAppWebBrowserView persistently mounted in background & reveals it full-page here
  if (isElectronDesktop) {
    return null;
  }

  const isRunning = Boolean(desktopStatus?.running);

  const handleDesktopAction = async (action: 'open' | 'minimize' | 'close') => {
    setDesktopBusy(true);
    await triggerDesktopAction(action);
    // After open, wait a moment then refresh status
    if (action === 'open') {
      setTimeout(refreshStatus, 2000);
    } else {
      await refreshStatus();
    }
    setDesktopBusy(false);
  };

  return (
    <div className="space-y-4 animate-fade-in w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-1 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-neo-surface shrink-0">
            <Bot size={18} className="text-surface" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-primary-dark">WhatsApp Command Center</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-surface shadow-neo-surface text-primary">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                WhatsApp Active
              </span>
            </div>
            <p className="text-secondary text-xs hidden sm:block">
              Multi-account WhatsApp Web workspace with automated AI lead qualification & CRM actions.
            </p>
          </div>
        </div>

        <div className="flex items-center p-1 bg-surface rounded-card shadow-neo-surface">
          <span className="flex items-center gap-2 px-4 py-2 rounded-btn text-xs font-bold shadow-neo-pressed text-primary bg-surface">
            <Monitor size={14} className="text-primary" /> Multi-Account Agent Hub
          </span>
        </div>
      </div>

      {/* Mobile-First EcoBill Desktop Launcher & Window Controls */}
      <div className="p-3.5 sm:p-4 rounded-card bg-surface shadow-neo-surface border border-shadow-dark flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-extrabold text-primary-dark">
              Official <span className="text-primary">web.whatsapp.com</span> Internal Chrome Desktop App
            </p>
            <span
              className={`px-2 py-0.5 rounded-full bg-surface shadow-neo-inset text-[10px] font-bold ${
                isRunning ? 'text-primary' : 'text-secondary'
              }`}
            >
              {isRunning ? '● Running' : 'Ready to Launch'}
            </span>
          </div>
          {isRunning ? (
            <p className="text-[11px] text-secondary leading-relaxed">
              EcoBill Desktop is open. Use <strong>Focus</strong>, <strong>Minimize</strong>, or{' '}
              <strong>Close</strong> to control the window.
            </p>
          ) : (
            <p className="text-[11px] text-secondary leading-relaxed">
              Click <strong>Open Desktop</strong> — launches instantly via the{' '}
              <code className="px-1 py-0.5 rounded bg-surface shadow-neo-inset text-primary-dark font-mono">ecobill://</code>{' '}
              protocol. No terminal, no commands needed.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto">
          <button
            onClick={() => handleDesktopAction('open')}
            disabled={desktopBusy}
            className="flex-1 sm:flex-none neo-btn-primary !px-3.5 !py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 min-h-[40px] disabled:opacity-60"
          >
            <Maximize2 size={14} /> <span>{isRunning ? 'Focus Desktop' : 'Open Desktop'}</span>
          </button>
          <button
            onClick={refreshStatus}
            title="Refresh Desktop status"
            className="neo-btn !px-3 !py-2.5 text-xs font-bold text-primary-dark flex items-center justify-center gap-1.5 min-h-[40px]"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={() => handleDesktopAction('minimize')}
            disabled={desktopBusy || !isRunning}
            className="neo-btn !px-3.5 !py-2.5 text-xs font-bold text-primary-dark flex items-center justify-center gap-1.5 min-h-[40px] disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Minus size={14} /> <span>Minimize</span>
          </button>
          <button
            onClick={() => handleDesktopAction('close')}
            disabled={desktopBusy || !isRunning}
            className="neo-btn !px-3.5 !py-2.5 text-xs font-bold text-error flex items-center justify-center gap-1.5 min-h-[40px] disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <X size={14} /> <span>Close</span>
          </button>
        </div>
      </div>

      <WhatsAppAiAgentHub />
    </div>
  );
}

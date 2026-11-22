import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Play,
  RotateCcw,
  Check,
  Users,
  MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  subscribeFollowupAutomationConfig,
  updateFollowupAutomationConfig,
  executeFollowupMorningDispatch,
  formatFollowupMessage,
  type WhatsAppFollowupAutomationConfig,
  DEFAULT_FOLLOWUP_CONFIG
} from '../../services/whatsappFollowupAutomationService';
import type { Lead } from '../../types';

interface FollowupAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FollowupAutomationModal({ isOpen, onClose }: FollowupAutomationModalProps) {
  const [config, setConfig] = useState<WhatsAppFollowupAutomationConfig>(DEFAULT_FOLLOWUP_CONFIG);
  const [templateInput, setTemplateInput] = useState(DEFAULT_FOLLOWUP_CONFIG.messageTemplate);
  const [followupLeads, setFollowupLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [runResult, setRunResult] = useState<{
    totalLeads: number;
    sentCount: number;
    failedCount: number;
  } | null>(null);

  // Subscribe to config
  useEffect(() => {
    return subscribeFollowupAutomationConfig((freshConfig) => {
      setConfig(freshConfig);
      setTemplateInput(freshConfig.messageTemplate || 'Hi {{name}}!');
    });
  }, []);

  // Fetch count and sample of leads currently in Follow Up stage
  const fetchFollowupLeads = async () => {
    if (!db) return;
    setLoadingLeads(true);
    try {
      const q = query(collection(db, 'leads'), where('status', '==', config.targetStageId || 'follow_up'));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
      setFollowupLeads(list);
    } catch (err) {
      console.warn('Error fetching followup leads:', err);
    } finally {
      setLoadingLeads(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFollowupLeads();
      setRunResult(null);
    }
  }, [isOpen, config.targetStageId]);

  if (!isOpen) return null;

  const handleToggle = async (enabled: boolean) => {
    setIsToggling(true);
    setConfig((prev) => ({ ...prev, enabled }));
    try {
      await updateFollowupAutomationConfig({ enabled });
      toast.success(enabled ? '7:30 AM Follow-Up Automation turned ON!' : 'Follow-Up Automation turned OFF.');
    } catch (err) {
      console.warn('Could not update cloud config:', err);
      toast.success(enabled ? '7:30 AM Follow-Up Automation turned ON!' : 'Follow-Up Automation turned OFF.');
    } finally {
      setIsToggling(false);
    }
  };

  const handleSaveTemplate = async () => {
    try {
      await updateFollowupAutomationConfig({ messageTemplate: templateInput.trim() || 'Hi {{name}}!' });
      toast.success('Message greeting template saved!');
    } catch (err) {
      toast.error('Failed to save template.');
    }
  };

  const handleRunNow = async () => {
    const confirmRun = window.confirm(
      `Send "${formatFollowupMessage(templateInput, followupLeads[0] || { name: 'Customer' } as any)}" now to all ${
        followupLeads.length
      } leads currently in the Follow-up stage?`
    );
    if (!confirmRun) return;

    setIsRunningNow(true);
    setRunResult(null);
    try {
      const res = await executeFollowupMorningDispatch({ force: true, userInitiated: true });
      setRunResult({
        totalLeads: res.totalLeads,
        sentCount: res.sentCount,
        failedCount: res.failedCount
      });
      if (res.sentCount > 0) {
        toast.success(`Successfully sent "Hi" message to ${res.sentCount} leads!`);
      } else {
        toast(`Completed dispatch (0 messages sent).`);
      }
      fetchFollowupLeads();
    } catch (err: any) {
      toast.error('Error during dispatch: ' + err.message);
    } finally {
      setIsRunningNow(false);
    }
  };

  // Preview sample message
  const sampleLead = followupLeads[0] || ({ name: 'Karthik Raja', phone: '+91 98765 43210' } as any);
  const previewMessage = formatFollowupMessage(templateInput, sampleLead);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-surface border border-shadow-dark rounded-2xl shadow-neo-raised overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-shadow-dark flex items-center justify-between bg-surface/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-neo-inset">
              <Clock size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-primary-dark">Daily 7:30 AM Follow-Up Automation</h3>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    config.enabled
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {config.enabled ? '● Active' : '○ Off'}
                </span>
              </div>
              <p className="text-[11px] text-secondary mt-0.5">
                Automatically sends a "Hi" WhatsApp message every morning.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto custom-sidebar-scrollbar flex-1">
          {/* Main ON / OFF Toggle Card */}
          <div className="p-4 rounded-xl bg-surface shadow-neo-surface flex items-center justify-between gap-4 border border-shadow-dark">
            <div className="space-y-1">
              <span className="text-xs font-bold text-primary-dark block">Automation Status</span>
              <p className="text-[11px] text-secondary leading-snug">
                When enabled, system queries everyone in <strong>Follow-up</strong> stage at <strong>7:30 AM IST</strong> and dispatches the greeting.
              </p>
            </div>
            {/* Toggle switch */}
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={config.enabled}
                disabled={isToggling}
                onChange={(e) => handleToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Schedule & Target Stage Specs */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-surface shadow-neo-inset space-y-1">
              <span className="text-[10px] text-secondary font-bold uppercase tracking-wider block">Scheduled Time</span>
              <div className="flex items-center gap-1.5 font-extrabold text-primary-dark text-sm">
                <Clock size={14} className="text-primary" />
                <span>7:30 AM</span>
                <span className="text-[10px] text-secondary font-medium">(IST)</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface shadow-neo-inset space-y-1">
              <span className="text-[10px] text-secondary font-bold uppercase tracking-wider block">Target Stage</span>
              <div className="flex items-center justify-between">
                <strong className="text-primary-dark text-xs">Follow-up</strong>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                  {loadingLeads ? '...' : `${followupLeads.length} leads`}
                </span>
              </div>
            </div>
          </div>

          {/* Message Template Editor */}
          <div className="p-4 rounded-xl bg-surface shadow-neo-surface space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary-dark flex items-center gap-1.5">
                <MessageSquare size={14} className="text-primary" /> Greeting Message
              </span>
              <span className="text-[10px] text-secondary">Supports {'{{name}}'}</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={templateInput}
                onChange={(e) => setTemplateInput(e.target.value)}
                placeholder="Hi {{name}}!"
                className="flex-1 text-xs font-semibold text-primary-dark bg-surface shadow-neo-inset py-2 px-3 rounded-lg border-none outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="text-xs font-bold px-3 py-2 rounded-lg bg-surface shadow-neo-surface text-primary hover:text-primary-dark transition-colors"
              >
                Save
              </button>
            </div>

            {/* Live Preview */}
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold block uppercase tracking-wider">
                Live Customer Preview
              </span>
              <p className="text-xs text-primary-dark font-medium italic">
                "{previewMessage}"
              </p>
            </div>
          </div>

          {/* Immediate Run / Test Dispatch Button */}
          <div className="p-4 rounded-xl bg-surface shadow-neo-surface space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-xs text-primary-dark block">Immediate Test Run</strong>
                <p className="text-[11px] text-secondary mt-0.5">
                  Test and dispatch the "Hi" message right now to all {followupLeads.length} leads in Follow-up.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunNow}
                disabled={isRunningNow || followupLeads.length === 0}
                className="neo-btn-primary px-3 py-2 text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {isRunningNow ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Dispatching...
                  </>
                ) : (
                  <>
                    <Send size={13} /> Run Follow-up Now
                  </>
                )}
              </button>
            </div>

            {runResult && (
              <div className="p-3 rounded-lg bg-surface shadow-neo-inset text-xs space-y-1">
                <div className="flex items-center justify-between text-primary-dark font-bold">
                  <span>Run Completed</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {runResult.sentCount} of {runResult.totalLeads} sent
                  </span>
                </div>
                {runResult.failedCount > 0 && (
                  <p className="text-[10px] text-rose-500 font-medium">
                    {runResult.failedCount} messages failed or had invalid numbers.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Last Run Info */}
          {config.lastRunDate && (
            <div className="text-[11px] text-secondary flex items-center justify-between px-1">
              <span>Last automatic run date:</span>
              <strong className="text-primary-dark">{config.lastRunDate}</strong>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-shadow-dark flex items-center justify-between bg-surface/90">
          <span className="text-[11px] text-secondary">
            Settings saved in cloud database
          </span>
          <button
            onClick={onClose}
            className="neo-btn text-xs font-bold px-4 py-1.5 text-primary-dark"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}


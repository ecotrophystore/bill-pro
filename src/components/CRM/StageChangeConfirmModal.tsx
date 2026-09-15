import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Send,
  CheckCircle2,
  X,
  MessageSquare,
  Sparkles,
  Phone,
  Mail,
  Loader2,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import type { Lead, PipelineStage, StageMessageConfig } from '../../types';
import {
  checkDuplicateStageNotification,
  getStageMessageConfig,
  executeManualStageMove,
  type StageMoveResult,
} from '../../services/stageNotificationService';
import { buildTemplateContext, renderTemplateText } from '../../utils/templateVariables';

interface StageChangeConfirmModalProps {
  isOpen: boolean;
  lead: Lead | null;
  fromStage: PipelineStage;
  toStage: PipelineStage;
  pipelineId: string;
  pipelineName: string;
  onClose: () => void;
  onSuccess: (result: StageMoveResult) => void;
}

export function StageChangeConfirmModal({
  isOpen,
  lead,
  fromStage,
  toStage,
  pipelineId,
  pipelineName,
  onClose,
  onSuccess,
}: StageChangeConfirmModalProps) {
  const [config, setConfig] = useState<StageMessageConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [duplicateInfo, setDuplicateInfo] = useState<{ isDuplicate: boolean; lastSentAt?: string }>({
    isDuplicate: false,
  });

  const requiresReason = (toStage.required_fields || []).includes('reason') || toStage.id === 'lost_cancelled';

  useEffect(() => {
    if (!isOpen || !lead || !toStage) return;

    setLoadingConfig(true);
    setErrorMessage('');
    setCustomReason(lead.reason || '');

    // 1. Check Duplicate Status
    const dup = checkDuplicateStageNotification(lead, toStage.id);
    setDuplicateInfo(dup);

    // 2. Load Message Config
    getStageMessageConfig(toStage.id, toStage.label, pipelineId)
      .then((cfg) => {
        setConfig(cfg);
        setLoadingConfig(false);
      })
      .catch((err) => {
        console.error('Failed to load stage message config:', err);
        setLoadingConfig(false);
      });
  }, [isOpen, lead?.id, toStage?.id, pipelineId]);

  if (!isOpen || !lead) return null;

  const context = buildTemplateContext(lead, toStage.label, fromStage.label);
  const renderedWhatsApp = config?.whatsapp_template ? renderTemplateText(config.whatsapp_template, context) : '';
  const renderedSms = config?.sms_template ? renderTemplateText(config.sms_template, context) : '';
  const renderedEmail = config?.email_template ? renderTemplateText(config.email_template, context) : '';

  const hasAnyNotification = Boolean(
    (config?.whatsapp_enabled && renderedWhatsApp) ||
      (config?.sms_enabled && renderedSms) ||
      (config?.email_enabled && renderedEmail)
  );

  const handleConfirmMove = async (sendMessage: boolean) => {
    if (requiresReason && !customReason.trim()) {
      setErrorMessage('Please enter a reason before moving to this stage.');
      return;
    }

    setProcessing(true);
    setErrorMessage('');

    try {
      const result = await executeManualStageMove({
        lead,
        fromStage,
        toStage,
        pipelineId,
        pipelineName,
        sendMessage,
        customReason: requiresReason ? customReason.trim() : undefined,
      });

      setProcessing(false);
      onSuccess(result);
      onClose();
    } catch (err: any) {
      console.error('Stage move execution error:', err);
      setErrorMessage(err?.message || 'Failed to move lead stage.');
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface neo-card max-w-xl w-full my-8 space-y-5 animate-scale-up border border-shadow-darker/20 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-shadow-darker/10 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary tracking-wide uppercase">
              <span>{pipelineName}</span>
              <span>•</span>
              <span className="text-secondary font-medium">Stage Transition</span>
            </div>
            <h2 className="text-xl font-bold text-primary-dark mt-1">
              Move Customer Stage
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="p-1.5 rounded-lg text-secondary hover:text-primary-dark hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stage Change Breadcrumb */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-shadow-darker/10">
          <div className="flex-1">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block">From Stage</span>
            <span className="text-sm font-bold text-slate-700">{fromStage.label}</span>
          </div>
          <div className="px-3 text-primary">
            <ArrowRight size={18} className="animate-pulse" />
          </div>
          <div className="flex-1 text-right">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">To Stage</span>
            <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              {toStage.label}
            </span>
          </div>
        </div>

        {/* Customer Summary Card */}
        <div className="flex items-center justify-between gap-3 text-xs bg-slate-50/50 p-2.5 rounded-lg border border-shadow-darker/5">
          <div>
            <span className="font-bold text-primary-dark">{lead.name}</span>
            {lead.company && <span className="text-secondary"> ({lead.company})</span>}
          </div>
          <div className="flex items-center gap-3 text-secondary">
            {lead.phone && <span>📞 {lead.phone}</span>}
            {lead.required_quantity && <span>🎯 {lead.required_quantity} pcs</span>}
          </div>
        </div>

        {/* Duplicate Notification Warning */}
        {duplicateInfo.isDuplicate && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-amber-900">
            <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <span className="font-bold block text-amber-950">Duplicate Notification Alert</span>
              A notification for <strong>"{toStage.label}"</strong> was already sent to this customer on{' '}
              <strong>{duplicateInfo.lastSentAt}</strong>.
            </div>
          </div>
        )}

        {/* Reason Input if Required */}
        {requiresReason && (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-primary-dark">
              Reason for this Stage <span className="text-rose-500">*</span>
            </label>
            <textarea
              className="neo-input w-full text-xs min-h-[70px] resize-y"
              placeholder="e.g. Budget mismatch / Selected alternate vendor / Event cancelled"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              required
            />
          </div>
        )}

        {/* Stage Notification Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-primary-dark flex items-center gap-1.5">
              <MessageSquare size={14} className="text-primary" />
              Automated Customer Notification Preview
            </label>
            {hasAnyNotification ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-300">
                Ready to Send
              </span>
            ) : (
              <span className="text-[10px] font-medium text-secondary">No notification enabled for this stage</span>
            )}
          </div>

          {loadingConfig ? (
            <div className="p-6 text-center text-xs text-secondary bg-slate-50 rounded-xl border border-shadow-darker/10">
              <Loader2 size={16} className="animate-spin mx-auto mb-1 text-primary" />
              Loading template preview...
            </div>
          ) : (
            <div className="space-y-3">
              {/* WhatsApp Bubble Preview */}
              {config?.whatsapp_enabled && renderedWhatsApp ? (
                <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs relative">
                  <div className="flex items-center justify-between mb-1.5 text-emerald-800 font-bold">
                    <span className="flex items-center gap-1">
                      <Phone size={12} /> WhatsApp Message
                    </span>
                    <span className="text-[10px] text-emerald-600 font-normal">
                      To: {lead.phone || 'No phone'}
                    </span>
                  </div>
                  <p className="text-slate-800 font-sans leading-relaxed whitespace-pre-wrap">
                    {renderedWhatsApp}
                  </p>
                </div>
              ) : null}

              {/* SMS Preview */}
              {config?.sms_enabled && renderedSms ? (
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs">
                  <div className="flex items-center justify-between mb-1 text-sky-800 font-bold">
                    <span>📱 SMS Notification</span>
                    <span className="text-[10px] text-sky-600 font-normal">To: {lead.phone}</span>
                  </div>
                  <p className="text-slate-800 font-sans leading-relaxed">{renderedSms}</p>
                </div>
              ) : null}

              {/* Email Preview */}
              {config?.email_enabled && renderedEmail ? (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs">
                  <div className="flex items-center justify-between mb-1 text-indigo-800 font-bold">
                    <span className="flex items-center gap-1">
                      <Mail size={12} /> Email ({config.email_subject || 'Order Status'})
                    </span>
                    <span className="text-[10px] text-indigo-600 font-normal">To: {lead.email}</span>
                  </div>
                  <p className="text-slate-800 font-sans leading-relaxed whitespace-pre-wrap">{renderedEmail}</p>
                </div>
              ) : null}

              {!hasAnyNotification && (
                <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-shadow-darker/20 text-center text-xs text-secondary">
                  No automated customer message configured for this stage. Stage will be updated without sending a message.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-700">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-shadow-darker/10 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="neo-btn text-xs px-3.5 py-2 font-semibold"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => handleConfirmMove(false)}
            disabled={processing || (requiresReason && !customReason.trim())}
            className="neo-btn text-xs px-3.5 py-2 font-semibold text-secondary hover:text-primary-dark"
          >
            {duplicateInfo.isDuplicate ? 'Change Stage Without Sending' : 'Confirm Without Message'}
          </button>

          <button
            type="button"
            onClick={() => handleConfirmMove(true)}
            disabled={processing || (requiresReason && !customReason.trim())}
            className="neo-btn-primary text-xs px-4 py-2 font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md hover:shadow-lg"
          >
            {processing ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Moving...
              </>
            ) : duplicateInfo.isDuplicate ? (
              <>
                <Send size={14} /> Send Again & Move
              </>
            ) : (
              <>
                <Send size={14} /> Confirm & Send Message
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

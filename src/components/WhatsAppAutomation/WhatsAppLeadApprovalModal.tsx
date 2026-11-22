import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  UserPlus,
  X,
  Check,
  Building,
  Phone,
  Clock,
  Sparkles,
  Loader2,
  ChevronRight,
  User,
  BookmarkPlus
} from 'lucide-react';
import toast from 'react-hot-toast';
import { syncWhatsAppLeadToCrm, type CrmSyncOutcome } from '../../services/whatsappCrmSyncService';
import { formatWhatsAppNumberDisplay } from '../../utils/whatsappNumberUtils';
import { isRealContactName } from '../../utils/whatsappEnquiryQualifier';
import type { AiLeadInsight } from '../../services/whatsappMultiSessionService';

export interface WhatsAppLeadPromptPayload {
  sessionId?: string;
  remoteJid: string;
  phone?: string;
  name?: string;
  sessionLabel?: string;
  messageText?: string;
  insight?: AiLeadInsight;
  messageTimestamp?: number;
}

const dismissedPhones = new Set<string>();

export function WhatsAppLeadApprovalModal() {
  const [queue, setQueue] = useState<WhatsAppLeadPromptPayload[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [enteredName, setEnteredName] = useState('');
  const [enteredCompany, setEnteredCompany] = useState('');

  useEffect(() => {
    const handlePrompt = (e: Event) => {
      const custom = e as CustomEvent<WhatsAppLeadPromptPayload>;
      const payload = custom.detail;
      if (!payload) return;

      const phoneKey = (payload.phone || payload.remoteJid || '').replace(/\D/g, '').slice(-10);
      if (phoneKey && dismissedPhones.has(phoneKey)) return;

      setQueue((prev) => {
        // Prevent duplicate queue entries for the same contact
        const exists = prev.some((item) => {
          const itemKey = (item.phone || item.remoteJid || '').replace(/\D/g, '').slice(-10);
          return itemKey && itemKey === phoneKey;
        });
        if (exists) return prev;
        return [...prev, payload];
      });
    };

    window.addEventListener('ecobill:whatsapp-confirm-lead', handlePrompt);
    return () => window.removeEventListener('ecobill:whatsapp-confirm-lead', handlePrompt);
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (current) {
      const rawName = current.name && isRealContactName(current.name) ? current.name : '';
      setEnteredName(rawName);
      setEnteredCompany(current.insight?.company || '');
    }
  }, [current]);

  if (queue.length === 0) return null;

  const formattedPhone = formatWhatsAppNumberDisplay(current.phone || current.remoteJid);
  const displayName = current.name || formattedPhone || 'WhatsApp User';
  const previewText = (current.messageText || current.insight?.requirement || '').trim();

  const handleDismiss = () => {
    const phoneKey = (current.phone || current.remoteJid || '').replace(/\D/g, '').slice(-10);
    if (phoneKey) dismissedPhones.add(phoneKey);
    setQueue((prev) => prev.slice(1));
  };

  const handleConfirmAddLead = async () => {
    setIsSubmitting(true);
    try {
      const finalName = enteredName.trim() || current.name || formattedPhone || 'New Customer';
      const finalCompany = enteredCompany.trim() || current.insight?.company || '';

      const fallbackInsight: AiLeadInsight = {
        leadName: finalName,
        company: finalCompany,
        phone: current.phone || '',
        requirement: current.messageText || '',
        quantity: '',
        budget: '',
        urgency: 'medium',
        stage: 'new',
        isBusinessLead: true,
        suggestedAction: 'Customer confirmed and saved to CRM',
        suggestedReply: '',
        analyzedAt: Date.now()
      };

      const outcome = await syncWhatsAppLeadToCrm({
        sessionId: current.sessionId,
        sessionLabel: current.sessionLabel,
        remoteJid: current.remoteJid,
        phone: current.phone,
        name: finalName,
        messageText: current.messageText,
        insight: current.insight ? { ...current.insight, leadName: finalName, company: finalCompany, isBusinessLead: true } : fallbackInsight,
        forceCreate: true, // User explicitly clicked "Save Contact"
        triggeredBy: 'manual'
      });

      if (outcome.action === 'created' || outcome.action === 'updated') {
        toast.success(
          `Contact saved & added to CRM: ${outcome.leadName} → ${outcome.pipelineName} (${outcome.stageLabel})`,
          { duration: 5000 }
        );
      } else {
        toast.success(`Contact saved to CRM!`);
      }

      const phoneKey = (current.phone || current.remoteJid || '').replace(/\D/g, '').slice(-10);
      if (phoneKey) dismissedPhones.add(phoneKey);
      setQueue((prev) => prev.slice(1));
    } catch (err: any) {
      console.error('[WhatsAppApproval] Failed to add lead:', err);
      toast.error('Failed to add lead: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] max-w-md w-full animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-emerald-500/20 p-5 backdrop-blur-md bg-white/95">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <MessageSquare size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                  New WhatsApp Inquiry
                </span>
                {queue.length > 1 && (
                  <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                    +{queue.length - 1} more
                  </span>
                )}
              </div>
              <h4 className="text-base font-bold text-slate-900 leading-tight mt-0.5">
                {displayName}
              </h4>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            title="Dismiss"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contact Info & Number */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-3 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
          <Phone size={14} className="text-emerald-500 shrink-0" />
          <span>{formattedPhone}</span>
          {current.sessionLabel && (
            <span className="ml-auto text-[11px] text-slate-600 font-medium bg-slate-200/60 px-2 py-0.5 rounded-md">
              {current.sessionLabel}
            </span>
          )}
        </div>

        {/* Inbound Message Bubble */}
        {previewText ? (
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 mb-4 text-xs text-slate-700">
            <span className="text-[10px] font-bold uppercase text-emerald-700 block mb-1">
              Customer Message:
            </span>
            <p className="italic font-medium leading-relaxed">
              "{previewText.length > 160 ? `${previewText.slice(0, 160)}...` : previewText}"
            </p>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 text-xs text-slate-600 italic">
            Customer started a chat without order specifications.
          </div>
        )}

        {/* Option to Save Contact in CRM & Pipeline */}
        <div className="space-y-2 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
          <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1 text-emerald-700">
              <BookmarkPlus size={13} />
              <span>Save this Contact to CRM:</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal">
              Not yet saved in contacts
            </span>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">
              Contact / Customer Name
            </label>
            <div className="relative">
              <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={enteredName}
                onChange={(e) => setEnteredName(e.target.value)}
                placeholder="e.g. Ramesh Kumar or Organization"
                className="w-full text-xs pl-7 pr-3 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-0.5">
              Company / Institution <span className="font-normal text-slate-400 lowercase">(optional)</span>
            </label>
            <div className="relative">
              <Building size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={enteredCompany}
                onChange={(e) => setEnteredCompany(e.target.value)}
                placeholder="e.g. Loyola College, ABC Tech"
                className="w-full text-xs pl-7 pr-3 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-medium text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirmAddLead}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <UserPlus size={15} />
            )}
            {isSubmitting ? 'Saving Contact...' : 'Save Contact & Add to Pipeline'}
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleDismiss}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors active:scale-95"
          >
            Just Chat
          </button>
        </div>
      </div>
    </div>
  );
}

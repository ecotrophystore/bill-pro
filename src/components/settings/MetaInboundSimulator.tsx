import React, { useState } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  User,
  Layers,
  Phone,
  MessageSquare,
  Building,
  Target,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  processMetaInboundEnquiry,
  type MetaInboundOutcome,
  type MetaLeadChannel,
} from '../../lib/metaOmnichannelProcessor';

export function MetaInboundSimulator() {
  const [channel, setChannel] = useState<MetaLeadChannel>('whatsapp');
  const [senderName, setSenderName] = useState('ABC Public School');
  const [senderPhone, setSenderPhone] = useState('9876543210');
  const [senderEmail, setSenderEmail] = useState('contact@abcschool.org');
  const [campaignName, setCampaignName] = useState('Meta Sports Trophy Campaign 2026');
  const [messageText, setMessageText] = useState(
    'Hi, we need 150 trophies for our annual sports day on October 20. Budget around ₹500 per trophy.'
  );

  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<MetaInboundOutcome | null>(null);
  const [error, setError] = useState('');

  const PRESETS = [
    {
      label: '🏆 WhatsApp: 150 Bulk Trophies',
      channel: 'whatsapp' as MetaLeadChannel,
      name: 'St. Xavier High School',
      phone: '9876543210',
      email: 'sports@stxaviers.edu',
      campaign: 'WhatsApp Direct Outreach',
      text: 'Hi, we need 150 trophies for our annual sports day on October 20. Budget around ₹500 per trophy.',
    },
    {
      label: '🏢 FB Lead Ad: 25 Regular Order',
      channel: 'facebook_lead_ad' as MetaLeadChannel,
      name: 'Infosys Sports Club',
      phone: '9123456780',
      email: 'club@infosys.com',
      campaign: 'Corporate Mementoes Lead Gen Ad',
      text: 'Requirement for 25 crystal trophies for our quarterly corporate award meet in Bangalore.',
    },
    {
      label: '🎨 Instagram: 5 Small Order',
      channel: 'instagram' as MetaLeadChannel,
      name: 'Ananya Boutique',
      phone: '9988776655',
      email: 'ananya@boutique.in',
      campaign: 'Instagram Stories Brand Campaign',
      text: 'Need 5 custom wooden plaques for our boutique opening next week.',
    },
    {
      label: '❓ WhatsApp: "Hi" (Unclassified)',
      channel: 'whatsapp' as MetaLeadChannel,
      name: 'Ramesh Kumar',
      phone: '9840123456',
      email: '',
      campaign: 'Direct Inbound',
      text: 'Hi, I need trophies.',
    },
    {
      label: '🔁 Repeat Customer Enquiry',
      channel: 'whatsapp' as MetaLeadChannel,
      name: 'St. Xavier High School',
      phone: '9876543210',
      email: 'sports@stxaviers.edu',
      campaign: 'WhatsApp Inbound',
      text: 'Hello EcoTrophy team! We need 50 mementoes for our Science Olympiad next month.',
    },
  ];

  const handleApplyPreset = (preset: (typeof PRESETS)[0]) => {
    setChannel(preset.channel);
    setSenderName(preset.name);
    setSenderPhone(preset.phone);
    setSenderEmail(preset.email);
    setCampaignName(preset.campaign);
    setMessageText(preset.text);
    setOutcome(null);
    setError('');
  };

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    setLoading(true);
    setOutcome(null);
    setError('');

    try {
      const result = await processMetaInboundEnquiry({
        channel,
        senderName: senderName.trim(),
        senderPhone: senderPhone.trim(),
        senderEmail: senderEmail.trim(),
        campaignName: campaignName.trim(),
        messageText: messageText.trim(),
        metaMessageId: `sim_${Date.now()}`,
      });

      setOutcome(result);
    } catch (err: any) {
      console.error('Simulation failed:', err);
      setError(err?.message || 'Failed to simulate Meta lead ingestion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="neo-card p-6 space-y-6 border border-shadow-darker/15 shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-shadow-darker/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Live Webhook Simulator</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
              Omnichannel Ready
            </span>
          </div>
          <h3 className="text-lg font-bold text-primary-dark mt-1 flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            Meta Inbound Lead Auto-Capture Simulator
          </h3>
          <p className="text-xs text-secondary mt-0.5">
            Test the end-to-end workflow: Customer Deduplication ➔ AI Requirement Extraction ➔ Automatic Pipeline Assignment ➔ Initial Stage placement.
          </p>
        </div>
      </div>

      {/* Preset Scenarios */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-secondary uppercase tracking-wider block">
          Quick Preset Scenarios:
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleApplyPreset(p)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-primary-dark border border-slate-200 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Simulation Form */}
      <form onSubmit={handleSimulate} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-primary-dark block">Enquiry Channel</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as MetaLeadChannel)}
              className="neo-input w-full font-semibold"
            >
              <option value="whatsapp">WhatsApp (Cloud API / Webhook)</option>
              <option value="facebook_messenger">Facebook Messenger</option>
              <option value="facebook_lead_ad">Facebook Lead Ad Form</option>
              <option value="instagram">Instagram Direct Message</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-primary-dark block">Sender / Customer Name</label>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="e.g. ABC Public School"
              className="neo-input w-full"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-primary-dark block">Phone / WhatsApp Number</label>
            <input
              type="text"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="neo-input w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-primary-dark block">Email (Optional)</label>
            <input
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="e.g. info@customer.com"
              className="neo-input w-full"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-primary-dark block">Campaign / Ad Source</label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g. Sports Trophy Lead Ad 2026"
              className="neo-input w-full"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="font-bold text-primary-dark block text-xs">
            Inbound Customer Message / Requirement Text
          </label>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={3}
            placeholder="Type customer enquiry message..."
            className="neo-input w-full text-xs font-sans"
            required
          />
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={loading || !messageText.trim()}
            className="neo-btn-primary text-xs px-5 py-2.5 font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md hover:shadow-lg disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Processing Inbound Ingestion...
              </>
            ) : (
              <>
                <Send size={14} /> Simulate Inbound Lead Ingestion
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2 animate-fade-in">
          <AlertTriangle size={16} className="shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Outcome Inspection Card */}
      {outcome && (
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-300 space-y-4 animate-scale-up text-xs">
          <div className="flex items-center justify-between border-b border-emerald-200 pb-2.5 flex-wrap gap-2">
            <div className="flex items-center gap-2 text-emerald-900 font-bold">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <span>Inbound Ingestion Successful</span>
            </div>

            <Link
              to={`/leads/${outcome.leadId}`}
              className="neo-btn-primary text-[11px] px-3 py-1 font-bold bg-emerald-700 text-white flex items-center gap-1 shadow-sm hover:bg-emerald-800"
            >
              Open Lead ➔
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Customer Identification */}
            <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-1">
              <span className="text-[10px] font-bold text-secondary uppercase block">Customer Identification</span>
              <span
                className={`font-extrabold px-2 py-0.5 rounded-full inline-block text-[11px] ${
                  outcome.isRepeatCustomer
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {outcome.isRepeatCustomer ? 'Existing / Repeat Customer' : 'New Customer'}
              </span>
              <div className="text-[11px] text-slate-700 font-medium truncate mt-1">
                {outcome.leadName}
              </div>
            </div>

            {/* Pipeline Assigned */}
            <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-1">
              <span className="text-[10px] font-bold text-secondary uppercase block">Assigned Pipeline</span>
              <span className="font-extrabold text-primary-dark block text-xs">
                {outcome.pipelineName}
              </span>
              <span className="text-[10px] text-secondary block">{outcome.classification.reason}</span>
            </div>

            {/* Initial Stage */}
            <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-1">
              <span className="text-[10px] font-bold text-secondary uppercase block">Initial Stage</span>
              <span className="font-extrabold text-emerald-700 block text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-max">
                {outcome.stageName}
              </span>
              <span className="text-[10px] text-secondary block">Manual stage movement active</span>
            </div>

            {/* Extracted Specs */}
            <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-1">
              <span className="text-[10px] font-bold text-secondary uppercase block">Extracted Details</span>
              <div className="text-[11px] space-y-0.5 text-slate-700 font-medium">
                <div>🎯 Qty: {outcome.extractedRequirements.required_quantity || 'Not specified'}</div>
                {outcome.extractedRequirements.event_name && (
                  <div>🏆 Event: {outcome.extractedRequirements.event_name}</div>
                )}
                {outcome.extractedRequirements.budget && (
                  <div>💰 Budget: {outcome.extractedRequirements.budget}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

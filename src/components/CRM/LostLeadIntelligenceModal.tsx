import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  RotateCcw,
  DollarSign,
  Clock,
  UserX,
  FileQuestion,
  Calendar,
  Check,
  ShieldAlert,
} from 'lucide-react';
import type { Lead, LostLeadIntelligence } from '../../types';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface LostLeadIntelligenceModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: LostLeadIntelligence) => void;
}

export function LostLeadIntelligenceModal({ lead, isOpen, onClose, onSave }: LostLeadIntelligenceModalProps) {
  if (!isOpen) return null;

  const [primaryReason, setPrimaryReason] = useState<LostLeadIntelligence['primary_reason']>(
    lead.lost_intelligence?.primary_reason || 'price_budget'
  );
  const [subReason, setSubReason] = useState(lead.lost_intelligence?.sub_reason || '');
  const [lostToCompetitor, setLostToCompetitor] = useState(lead.lost_intelligence?.lost_to_competitor || '');
  const [competitorPrice, setCompetitorPrice] = useState(lead.lost_intelligence?.competitor_price ? String(lead.lost_intelligence.competitor_price) : '');
  const [salespersonMistake, setSalespersonMistake] = useState(lead.lost_intelligence?.salesperson_mistake || 'None Identified');
  const [winbackEligible, setWinbackEligible] = useState(lead.lost_intelligence?.winback_eligible ?? true);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!db) return;
    setSaving(true);
    try {
      // Calculate 330-day cyclical re-engagement date (11 months from now for repeating annual events)
      const winbackDate = new Date();
      winbackDate.setDate(winbackDate.getDate() + 330);

      const lostData: LostLeadIntelligence = {
        primary_reason: primaryReason,
        sub_reason: subReason,
        lost_to_competitor: lostToCompetitor || undefined,
        competitor_price: competitorPrice ? parseFloat(competitorPrice) : undefined,
        salesperson_mistake: salespersonMistake,
        recovery_strategy: winbackEligible ? 'Annual 330-day Cyclical Event Re-engagement' : 'Archived',
        winback_eligible: winbackEligible,
        winback_scheduled_date: winbackEligible ? winbackDate : null,
        manager_reviewed: false,
        logged_at: new Date(),
      };

      await updateDoc(doc(db, 'leads', lead.id), {
        status: 'lost_cancelled',
        reason: `${primaryReason}: ${subReason || 'Order dropped'}`,
        lost_intelligence: lostData,
        updated_at: serverTimestamp(),
      });

      if (onSave) onSave(lostData);
      onClose();
    } catch (err) {
      console.error('Failed to log lost lead intelligence:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface0 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Lost Lead Intelligence & Audit
              </h2>
              <p className="text-xs text-slate-500">
                Diagnose root cause to prevent revenue leakage for EcoTrophy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* 1. Primary Reason Category */}
        <div className="space-y-1.5 text-xs">
          <label className="font-bold text-slate-700 dark:text-slate-300">
            Primary Root Cause *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'price_budget', label: 'Price & Budget Mismatch', icon: DollarSign },
              { id: 'timeline_delivery', label: 'Timeline & Delivery Cutoff', icon: Clock },
              { id: 'sales_mistake', label: 'Sales Execution Mistake', icon: UserX },
              { id: 'process_bottleneck', label: 'Demanded Sample / Credit', icon: FileQuestion },
              { id: 'external_cancelled', label: 'Event Cancelled / Postponed', icon: Calendar },
              { id: 'ghosted_unresponsive', label: 'Customer Unresponsive', icon: AlertTriangle },
            ].map((cat) => {
              const Icon = cat.icon;
              const isSelected = primaryReason === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setPrimaryReason(cat.id as any)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all ${
                    isSelected
                      ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 font-bold'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Icon size={14} className={`shrink-0 mt-0.5 ${isSelected ? 'text-rose-500' : 'text-slate-400'}`} />
                  <span className="text-[11px] leading-tight">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-reason notes */}
        <div className="space-y-1 text-xs">
          <label className="font-semibold text-slate-700 dark:text-slate-300">
            Specific Reason Details / Customer Feedback
          </label>
          <textarea
            value={subReason}
            onChange={(e) => setSubReason(e.target.value)}
            placeholder="e.g. Client purchased unbranded hollow plastic trophies for ₹280 vs our solid wood model at ₹380."
            rows={2}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        {/* Competitor & Price (optional) */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Competitor (if known)</label>
            <input
              type="text"
              value={lostToCompetitor}
              onChange={(e) => setLostToCompetitor(e.target.value)}
              placeholder="e.g. Local vendor / Competitor X"
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Competitor Rate (₹)</label>
            <input
              type="number"
              value={competitorPrice}
              onChange={(e) => setCompetitorPrice(e.target.value)}
              placeholder="e.g. 280"
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
        </div>

        {/* Salesperson Mistake Audit */}
        <div className="space-y-1 text-xs">
          <label className="font-bold text-slate-700 dark:text-slate-300">
            Salesperson Execution Review (Self-Audit)
          </label>
          <select
            value={salespersonMistake}
            onChange={(e) => setSalespersonMistake(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100"
          >
            <option value="None Identified">None (Clean execution; lost to genuine budget/timeline)</option>
            <option value="SLA Breach">SLA Breach: First response took &gt; 2 hours</option>
            <option value="Quotation Dumper">Quotation Dumper: Sent price PDF without consultative call</option>
            <option value="Price Dropper">Price Dropper: Cut price immediately without explaining wood/crystal quality</option>
            <option value="Follow-up Delay">Follow-up Delay: Missed Day 1 / Day 3 follow-up window</option>
            <option value="Design Proof Lag">Design Proof Lag: Mockup took &gt; 24 hours to deliver</option>
          </select>
        </div>

        {/* Annual Win-Back Toggle */}
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
          <div>
            <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <RotateCcw size={14} />
              Annual Cyclical Win-Back (Day 330)
            </div>
            <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
              Auto-schedules re-engagement in 11 months before their next annual event cycle.
            </p>
          </div>
          <input
            type="checkbox"
            checked={winbackEligible}
            onChange={(e) => setWinbackEligible(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/20"
          >
            {saving ? 'Saving...' : 'Confirm Lost Status & Save Intelligence'}
          </button>
        </div>
      </div>
    </div>
  );
}


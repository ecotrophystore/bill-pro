import React, { useState } from 'react';
import {
  X,
  Award,
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  BarChart3,
  TrendingUp,
  ShieldAlert,
  HelpCircle,
  FileText,
  Phone,
} from 'lucide-react';
import type { Lead, SalesQualityAudit } from '../../types';
import { computeSalesQualityAudit, evaluateFitsQualification } from '../../utils/salesIntelligenceEngine';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface SalesQualityAuditModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onAuditUpdated?: (updatedAudit: SalesQualityAudit) => void;
}

export function SalesQualityAuditModal({ lead, isOpen, onClose, onAuditUpdated }: SalesQualityAuditModalProps) {
  if (!isOpen) return null;

  const [isAuditing, setIsAuditing] = useState(false);
  const audit = lead.sales_audit || computeSalesQualityAudit(lead);
  const prosper = lead.prosper_breakdown;
  const fits = lead.fits_data;
  const fitsEval = evaluateFitsQualification(fits);

  const getScoreGrade = (score: number) => {
    if (score >= 85) return { label: 'Outstanding (A+)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (score >= 70) return { label: 'Proficient (B)', color: 'text-sky-700 bg-sky-50 border-sky-200' };
    if (score >= 55) return { label: 'Needs Coaching (C)', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    return { label: 'Critical Action Needed (D)', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  };

  const grade = getScoreGrade(audit.total_score);

  const handleReAudit = async () => {
    if (!db) return;
    setIsAuditing(true);
    try {
      const refreshedAudit = computeSalesQualityAudit(lead, lead.last_message || '');
      await updateDoc(doc(db, 'leads', lead.id), {
        sales_audit: refreshedAudit,
      });
      if (onAuditUpdated) onAuditUpdated(refreshedAudit);
    } catch (err) {
      console.error('Failed to update audit:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface0 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <Award size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                100-Mark Sales Quality Audit
              </h2>
              <p className="text-xs text-slate-500">
                Lead: <span className="font-semibold text-slate-700 dark:text-slate-300">{lead.name}</span>
                {lead.company && ` • ${lead.company}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Summary Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/50 to-sky-50/50 dark:from-slate-900/40 dark:to-slate-800/40 border border-indigo-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Overall Quality Score
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-900 dark:text-white">
                {audit.total_score}
              </span>
              <span className="text-sm text-slate-400 font-semibold">/ 100 Marks</span>
            </div>
          </div>
          <div className="text-right">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${grade.color}`}>
              {grade.label}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">
              Evaluated: {audit.last_audited_at ? new Date(audit.last_audited_at.toDate ? audit.last_audited_at.toDate() : audit.last_audited_at).toLocaleDateString() : 'Just now'}
            </p>
          </div>
        </div>

        {/* 6 Category Breakdown */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Audit Rubric Breakdown
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. SLA Compliance */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-sky-500" />
                  1. SLA Compliance
                </span>
                <span className="text-indigo-600 font-black">{audit.sla_score} / 10 M</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div className="bg-sky-500 h-full rounded-full" style={{ width: `${(audit.sla_score / 10) * 100}%` }} />
              </div>
              <p className="text-[10px] text-slate-500">First response speed & customer query latency</p>
            </div>

            {/* 2. Follow-up Discipline */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-amber-500" />
                  2. Follow-up Discipline
                </span>
                <span className="text-indigo-600 font-black">{audit.followup_score} / 15 M</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: `${(audit.followup_score / 15) * 100}%` }} />
              </div>
              <p className="text-[10px] text-slate-500">Scheduled cadences & future follow-up date adherence</p>
            </div>

            {/* 3. Appointment / Design Finalization */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <FileText size={14} className="text-indigo-500" />
                  3. Design Finalization
                </span>
                <span className="text-indigo-600 font-black">{audit.appointment_design_score} / 10 M</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${(audit.appointment_design_score / 10) * 100}%` }} />
              </div>
              <p className="text-[10px] text-slate-500">Mockup proof turnaround & written client approval</p>
            </div>

            {/* 4. FITS Qualification */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  4. FITS Qualification
                </span>
                <span className="text-indigo-600 font-black">{audit.fits_score} / 15 M</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(audit.fits_score / 15) * 100}%` }} />
              </div>
              <p className="text-[10px] text-slate-500">Fit (3), Intent (4), Timeline (4), Scope/Spend (4)</p>
            </div>

            {/* 5. PROSPER Framework Execution (Exact 7-Step Methodology) */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={14} className="text-purple-500" />
                  5. PROSPER Sales Execution (7 Steps)
                </span>
                <span className="text-indigo-600 font-black">{audit.prosper_score} / 40 M</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full" style={{ width: `${(audit.prosper_score / 40) * 100}%` }} />
              </div>

              {/* Exact 7-Step PROSPER Score Grid */}
              {prosper && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[10px]">
                  <div className="bg-surface0 dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400">P – Pitch</span>: <strong>{prosper.pitch ?? 3}/5</strong>
                  </div>
                  <div className="bg-surface0 dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400">R – Rapport</span>: <strong>{prosper.rapport ?? 3.5}/5</strong>
                  </div>
                  <div className="bg-surface0 dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400">O – Open Qs</span>: <strong>{prosper.open_questions ?? 3.5}/6</strong>
                  </div>
                  <div className="bg-surface0 dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400">S – Story</span>: <strong>{prosper.story ?? 1.5}/5</strong>
                  </div>
                  <div className="bg-surface0 dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400">P – Proposal</span>: <strong>{prosper.proposal ?? 4.5}/7</strong>
                  </div>
                  <div className="bg-surface0 dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400">E – Eliminate Obj</span>: <strong>{prosper.eliminate_objections ?? 3.5}/6</strong>
                  </div>
                  <div className="bg-surface0 dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700 sm:col-span-2">
                    <span className="text-slate-400">R – Reserve & Close</span>: <strong>{prosper.reserve_close ?? 2.5}/6</strong>
                  </div>
                </div>
              )}
            </div>

            {/* 6. Call & WhatsApp Comms Quality */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <Phone size={14} className="text-teal-500" />
                  6. Call & WhatsApp Comms Quality
                </span>
                <span className="text-indigo-600 font-black">{audit.call_whatsapp_quality_score} / 10 M</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div className="bg-teal-500 h-full rounded-full" style={{ width: `${(audit.call_whatsapp_quality_score / 10) * 100}%` }} />
              </div>
              <p className="text-[10px] text-slate-500">Tone, grammar, respectful etiquette, and catalog formatting</p>
            </div>
          </div>
        </div>

        {/* FITS Insights */}
        {fitsEval.insights.length > 0 && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
            <span className="font-bold text-slate-700 dark:text-slate-200">FITS Qualification Highlights:</span>
            <ul className="list-disc pl-4 text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
              {fitsEval.insights.map((ins, idx) => (
                <li key={idx}>{ins}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleReAudit}
            disabled={isAuditing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800"
          >
            <Sparkles size={14} />
            {isAuditing ? 'Auditing with AI...' : 'Re-Audit Lead with AI'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90"
          >
            Close Scorecard
          </button>
        </div>
      </div>
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  HelpCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  Flame,
  Award,
  Send,
  MessageSquare,
  CheckCircle2,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Lead, ProsperStepStatus } from '../../types';
import {
  getStagePlaybook,
  generateContextualProbingQuestions,
  generateSemanticFallbackQuestions,
  isGenericPlaceholderQuestions,
} from '../../utils/salesIntelligenceEngine';

interface ContextualSalesGuideProps {
  lead: Lead;
  messages?: any[];
  onApplyReply?: (text: string) => void;
  compact?: boolean;
}

export function ContextualSalesGuide({ lead, messages, onApplyReply, compact = false }: ContextualSalesGuideProps) {
  const currentStage = lead.status || 'new_enquiry';
  const playbook = getStagePlaybook(currentStage, lead);

  const [expandedSection, setExpandedSection] = useState<'prosper' | 'questions' | 'objections' | 'pitch'>('prosper');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const isStale = isGenericPlaceholderQuestions(lead.contextual_probing_questions);

  const [probingQuestions, setProbingQuestions] = useState<Array<{ english: string; tanglish: string; purpose: string }>>(() => {
    if (lead.contextual_probing_questions && lead.contextual_probing_questions.length > 0 && !isStale) {
      return lead.contextual_probing_questions;
    }
    const dynamicFallback = generateSemanticFallbackQuestions(lead, undefined, messages);
    return dynamicFallback.length > 0 ? dynamicFallback : playbook.questions;
  });
  const [isLoadingAiQuestions, setIsLoadingAiQuestions] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    if (lead.contextual_probing_questions && lead.contextual_probing_questions.length > 0 && !isStale) {
      setProbingQuestions(lead.contextual_probing_questions);
      return;
    }

    // Trigger AI contextual question generation analyzing actual chat and requirement
    const fetchQuestions = async () => {
      setIsLoadingAiQuestions(true);
      try {
        const generated = await generateContextualProbingQuestions(lead, messages);
        if (isMounted && generated && generated.length > 0) {
          setProbingQuestions(generated);
          if (lead.id) {
            updateDoc(doc(db, 'leads', lead.id), {
              contextual_probing_questions: generated,
            }).catch(() => { });
          }
        }
      } catch (err) {
        console.warn('Could not generate contextual questions', err);
      } finally {
        if (isMounted) setIsLoadingAiQuestions(false);
      }
    };

    fetchQuestions();
    return () => {
      isMounted = false;
    };
  }, [lead.id, lead.requirement, lead.notes, messages?.length]);

  const handleRegenerateQuestions = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoadingAiQuestions(true);
    try {
      const generated = await generateContextualProbingQuestions(lead, messages);
      if (generated && generated.length > 0) {
        setProbingQuestions(generated);
        if (lead.id) {
          await updateDoc(doc(db, 'leads', lead.id), {
            contextual_probing_questions: generated,
          }).catch(() => { });
        }
      }
    } catch (err) {
      console.error('Failed to regenerate questions', err);
    } finally {
      setIsLoadingAiQuestions(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
    if (onApplyReply) {
      onApplyReply(text);
    }
  };

  const prosper = lead.prosper_breakdown;
  const audit = lead.sales_audit;

  const prosperSteps = [
    { key: 'pitch', label: 'P – Pitch', max: 5, score: prosper?.pitch ?? 3, status: prosper?.step_status?.pitch ?? 'weak', desc: 'Value hook & craft' },
    { key: 'rapport', label: 'R – Rapport', max: 5, score: prosper?.rapport ?? 3.5, status: prosper?.step_status?.rapport ?? 'weak', desc: 'Empathy & language' },
    { key: 'open_questions', label: 'O – Open Questions', max: 6, score: prosper?.open_questions ?? 3.5, status: prosper?.step_status?.open_questions ?? 'weak', desc: 'Discovery' },
    { key: 'story', label: 'S – Story', max: 5, score: prosper?.story ?? 1.5, status: prosper?.step_status?.story ?? 'missing', desc: 'Proof & case study' },
    { key: 'proposal', label: 'P – Proposal', max: 7, score: prosper?.proposal ?? 4.5, status: prosper?.step_status?.proposal ?? 'weak', desc: 'Tiered mockup quote' },
    { key: 'eliminate_objections', label: 'E – Eliminate Objections', max: 6, score: prosper?.eliminate_objections ?? 3.5, status: prosper?.step_status?.eliminate_objections ?? 'weak', desc: 'Reframing price' },
    { key: 'reserve_close', label: 'R – Reserve & Close', max: 6, score: prosper?.reserve_close ?? 2.5, status: prosper?.step_status?.reserve_close ?? 'missing', desc: 'Cutoff urgency & 50%' },
  ];

  const getStatusBadge = (status: ProsperStepStatus) => {
    switch (status) {
      case 'completed':
        return <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">✓ Done</span>;
      case 'weak':
        return <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">⚠️ Weak</span>;
      case 'missing':
        return <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300">✗ Missing</span>;
    }
  };

  return (
    <div className="bg-surface0 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <BookOpen size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                EcoTrophy Sales Guide
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {playbook.stageName}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {playbook.objective}
            </p>
          </div>
        </div>

        {lead.intent_tier && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${lead.intent_tier === 'HIGH'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : lead.intent_tier === 'MEDIUM'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
          >
            {lead.intent_tier === 'HIGH' && <Flame size={12} className="text-rose-500 fill-rose-500" />}
            {lead.intent_tier} INTENT ({lead.intent_score ?? 50}/100)
          </span>
        )}
      </div>

      {/* NEXT BEST SALES ACTION & READY DRAFT BANNER */}
      {prosper && (
        <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:from-slate-900/40 dark:to-slate-800/40 border border-emerald-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
              <Sparkles size={14} className="text-emerald-600" />
              Next Best Sales Action
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              PROSPER Score: <strong className="text-emerald-700 dark:text-emerald-300">{audit?.prosper_score ?? 28}</strong> / 40 M
            </span>
          </div>

          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
            👉 {prosper.next_best_action || 'Execute consultative follow-up on design mockup.'}
          </p>

          {prosper.suggested_whatsapp_draft && (
            <div className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-emerald-100 dark:border-slate-700 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">
                <span>Ready-to-Use WhatsApp Draft</span>
                <button
                  onClick={() => handleCopy(prosper.suggested_whatsapp_draft!, 'suggested-draft')}
                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold"
                >
                  {copiedIndex === 'suggested-draft' ? <Check size={11} /> : <Copy size={11} />}
                  {copiedIndex === 'suggested-draft' ? 'Copied & Applied' : 'Copy Draft'}
                </button>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 italic font-sans leading-relaxed">
                "{prosper.suggested_whatsapp_draft}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* 7-STEP PROSPER CONVERSATION TRACKER */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setExpandedSection(expandedSection === 'prosper' ? '' as any : 'prosper')}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="flex items-center gap-2">
            <Award size={14} className="text-purple-600" />
            7-Step PROSPER Conversation Status ({audit?.prosper_score ?? 28}/40 M)
          </span>
          {expandedSection === 'prosper' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {expandedSection === 'prosper' && (
          <div className="p-3 space-y-2.5 bg-surface0 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {prosperSteps.map((step) => (
                <div
                  key={step.key}
                  className="p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate">
                      <span>{step.label}</span>
                      <span className="text-[10px] text-slate-400 font-normal">({step.desc})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                      {step.score}/{step.max}
                    </span>
                    {getStatusBadge(step.status)}
                  </div>
                </div>
              ))}
            </div>

            {prosper?.coaching_tips && prosper.coaching_tips.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                  AI Conversation Improvement Tips:
                </span>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                  {prosper.coaching_tips.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs / Sections */}
      <div className="space-y-3">
        {/* 1. Probing Questions */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'questions' ? '' as any : 'questions')}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <HelpCircle size={14} className="text-sky-500" />
              <span>Recommended Probing Questions ({probingQuestions.length})</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-800 flex items-center gap-1 font-semibold">
                <Sparkles size={11} className="text-sky-600" />
                AI Analyzed from Chat
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isLoadingAiQuestions}
                onClick={handleRegenerateQuestions}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 dark:bg-sky-900/40 dark:hover:bg-sky-900/70 border border-sky-200 dark:border-sky-800 px-2 py-0.5 rounded transition-all disabled:opacity-50"
                title="Re-analyze customer chat and generate fresh probing questions"
              >
                <RotateCcw size={11} className={isLoadingAiQuestions ? 'animate-spin' : ''} />
                {isLoadingAiQuestions ? 'Analyzing...' : 'Regenerate'}
              </button>
              {expandedSection === 'questions' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>

          {expandedSection === 'questions' && (
            <div className="p-3 space-y-2.5 bg-surface0 text-xs">
              {isLoadingAiQuestions && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 animate-pulse text-[11px]">
                  <Sparkles size={14} className="animate-spin text-sky-500 shrink-0" />
                  <span>Gemini AI is analyzing customer chat, requirements & design updates to generate precision questions...</span>
                </div>
              )}
              {probingQuestions.map((q, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Purpose: {q.purpose}</span>
                    <button
                      onClick={() => handleCopy(q.english, `q-en-${idx}`)}
                      className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold"
                    >
                      {copiedIndex === `q-en-${idx}` ? <Check size={11} /> : <Copy size={11} />}
                      {copiedIndex === `q-en-${idx}` ? 'Copied' : 'Copy English'}
                    </button>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 font-medium">
                    🇬🇧 "{q.english}"
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 italic font-sans text-[11px] flex items-center justify-between">
                    <span>🇮🇳 "{q.tanglish}"</span>
                    <button
                      onClick={() => handleCopy(q.tanglish, `q-ta-${idx}`)}
                      className="text-sky-600 hover:text-sky-700 text-[10px] font-semibold ml-2 shrink-0"
                    >
                      {copiedIndex === `q-ta-${idx}` ? 'Copied Tanglish' : 'Copy Tanglish'}
                    </button>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Objection Handling */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'objections' ? '' as any : 'objections')}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-indigo-500" />
              Objection Handling Scripts ({playbook.objections.length})
            </span>
            {expandedSection === 'objections' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expandedSection === 'objections' && (
            <div className="p-3 space-y-2.5 bg-surface0 text-xs">
              {playbook.objections.map((obj, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-rose-600 text-[11px]">
                    <AlertTriangle size={12} />
                    Objection: "{obj.objection}"
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-semibold text-emerald-600">Response: </span>
                    {obj.handlingScript}
                  </div>
                  {obj.tanglishScript && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                      <span className="font-semibold text-sky-600">Tanglish: </span>
                      {obj.tanglishScript}
                    </div>
                  )}
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => handleCopy(obj.handlingScript, `obj-${idx}`)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                    >
                      {copiedIndex === `obj-${idx}` ? <Check size={10} /> : <Copy size={10} />}
                      {copiedIndex === `obj-${idx}` ? 'Copied Response' : 'Copy Response'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Pitch Techniques */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'pitch' ? '' as any : 'pitch')}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span className="flex items-center gap-2">
              <Award size={14} className="text-amber-500" />
              EcoTrophy Value Pitch Techniques ({playbook.pitchTechniques.length})
            </span>
            {expandedSection === 'pitch' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expandedSection === 'pitch' && (
            <div className="p-3 space-y-2 bg-surface0 text-xs">
              {playbook.pitchTechniques.map((pitch, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                  <ArrowRight size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span>{pitch}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stage Checklist */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          Stage Advancement Checklist
        </h4>
        <div className="space-y-1.5">
          {playbook.checklist.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="w-3.5 h-3.5 rounded border border-slate-300 dark:border-slate-600 flex items-center justify-center shrink-0">
                <Check size={10} className="text-emerald-600" />
              </div>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

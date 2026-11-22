import React, { useMemo } from 'react';
import {
  Award,
  TrendingUp,
  AlertTriangle,
  Clock,
  Sparkles,
  DollarSign,
  ShieldAlert,
  RotateCcw,
  UserX,
  Target,
  ArrowRight,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import type { Lead } from '../../types';
import { ECOTROPHY_SALES_STAGES } from '../../types';

interface ManagerSalesIntelligenceViewProps {
  leads: Lead[];
}

export function ManagerSalesIntelligenceView({ leads }: ManagerSalesIntelligenceViewProps) {
  // 1. Salesperson Leaderboard & Coaching Needs
  const repStats = useMemo(() => {
    const map: Record<
      string,
      {
        total: number;
        won: number;
        auditScores: number[];
        slaScores: number[];
        prosperScores: number[];
        totalValue: number;
      }
    > = {};

    leads.forEach((l) => {
      const rep = l.sales_person || 'Unassigned';
      if (!map[rep]) {
        map[rep] = {
          total: 0,
          won: 0,
          auditScores: [],
          slaScores: [],
          prosperScores: [],
          totalValue: 0,
        };
      }
      map[rep].total += 1;
      if (['completed', 'delivered', 'full_payment', 'qualified', 'won'].includes(l.status || '')) {
        map[rep].won += 1;
      }
      if (l.value) {
        map[rep].totalValue += Number(l.value) || 0;
      }

      if (l.sales_audit?.total_score) {
        map[rep].auditScores.push(l.sales_audit.total_score);
        map[rep].slaScores.push(l.sales_audit.sla_score);
        map[rep].prosperScores.push(l.sales_audit.prosper_score);
      } else {
        // Fallback default audit score
        map[rep].auditScores.push(74);
        map[rep].slaScores.push(7);
        map[rep].prosperScores.push(28);
      }
    });

    return Object.entries(map)
      .map(([name, data]) => {
        const avgAudit = Math.round(data.auditScores.reduce((a, b) => a + b, 0) / (data.auditScores.length || 1));
        const avgSla = Number((data.slaScores.reduce((a, b) => a + b, 0) / (data.slaScores.length || 1)).toFixed(1));
        const avgProsper = Math.round(data.prosperScores.reduce((a, b) => a + b, 0) / (data.prosperScores.length || 1));
        const winRate = data.total > 0 ? Math.round((data.won / data.total) * 100) : 0;

        let primaryCoaching = 'Closing Master (High Performer)';
        if (avgSla < 6.5) primaryCoaching = 'SLA Speed: First response delayed';
        else if (avgProsper < 26) primaryCoaching = 'PROSPER: Probe & Urgency Closing';
        else if (winRate < 25) primaryCoaching = 'Objection Handling: Overcoming price';
        else if (avgAudit < 70) primaryCoaching = 'Follow-up Cadence & Note Logging';

        return {
          name,
          total: data.total,
          won: data.won,
          winRate,
          avgAudit,
          avgSla,
          avgProsper,
          totalValue: data.totalValue,
          primaryCoaching,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [leads]);

  // 2. Focused 8-Stage Conversion Funnel
  const funnelStages = useMemo(() => {
    const stageMap: Record<string, number> = {};
    leads.forEach((l) => {
      const st = l.status || 'new_enquiry';
      stageMap[st] = (stageMap[st] || 0) + 1;
    });

    const definitions = [
      { id: 'new_enquiry', label: '1. New Enquiry', count: (stageMap['new_enquiry'] || 0) + (stageMap['unclassified'] || 0) },
      { id: 'fits_qualification', label: '2. FITS Qualification', count: (stageMap['requirement_collection'] || 0) + (stageMap['fits_qualification'] || 0) },
      { id: 'design_finalization', label: '3. Req & Design Finalization', count: (stageMap['design_stage'] || 0) + (stageMap['design_approval'] || 0) + (stageMap['requirement_confirmed'] || 0) },
      { id: 'quotation', label: '4. Quotation Issued', count: (stageMap['quotation_sent'] || 0) + (stageMap['quotation'] || 0) },
      { id: 'follow_up', label: '5. Consultative Follow-up', count: stageMap['follow_up'] || 0 },
      { id: 'payment', label: '6. Payment Reconciled', count: (stageMap['advance_payment'] || 0) + (stageMap['payment'] || 0) },
      { id: 'order_confirmation', label: '7. Order in Production', count: (stageMap['production'] || 0) + (stageMap['quality_check'] || 0) + (stageMap['order_confirmation'] || 0) },
      { id: 'won', label: '8. Won & Delivered', count: (stageMap['delivered'] || 0) + (stageMap['completed'] || 0) + (stageMap['full_payment'] || 0) },
    ];

    const maxCount = Math.max(1, ...definitions.map((d) => d.count));

    return definitions.map((def) => ({
      ...def,
      pct: Math.round((def.count / maxCount) * 100),
    }));
  }, [leads]);

  // 3. Team PROSPER Competency Matrix (Exact 7-Step Methodology)
  const teamProsperAvg = useMemo(() => {
    let pitch = 0, rapport = 0, open_questions = 0, story = 0, proposal = 0, eliminate_objections = 0, reserve_close = 0;
    let count = 0;

    leads.forEach((l) => {
      if (l.prosper_breakdown) {
        pitch += l.prosper_breakdown.pitch ?? (l.prosper_breakdown.outline_options ? (l.prosper_breakdown.outline_options / 6) * 5 : 3.5);
        rapport += l.prosper_breakdown.rapport ?? l.prosper_breakdown.rapport_receptivity ?? 3.5;
        open_questions += l.prosper_breakdown.open_questions ?? l.prosper_breakdown.prepare_probe ?? 4.0;
        story += l.prosper_breakdown.story ?? (l.prosper_breakdown.reengage_reinforce ? (l.prosper_breakdown.reengage_reinforce / 6) * 5 : 2.5);
        proposal += l.prosper_breakdown.proposal ?? (l.prosper_breakdown.execute_terms ? (l.prosper_breakdown.execute_terms / 5) * 7 : 5.0);
        eliminate_objections += l.prosper_breakdown.eliminate_objections ?? l.prosper_breakdown.solve_objections ?? 4.0;
        reserve_close += l.prosper_breakdown.reserve_close ?? l.prosper_breakdown.propose_next_steps ?? 3.5;
        count++;
      }
    });

    if (count === 0) {
      return { pitch: 3.8, rapport: 4.1, open_questions: 4.2, story: 2.8, proposal: 5.2, eliminate_objections: 3.9, reserve_close: 3.2 };
    }

    return {
      pitch: Number((pitch / count).toFixed(1)),
      rapport: Number((rapport / count).toFixed(1)),
      open_questions: Number((open_questions / count).toFixed(1)),
      story: Number((story / count).toFixed(1)),
      proposal: Number((proposal / count).toFixed(1)),
      eliminate_objections: Number((eliminate_objections / count).toFixed(1)),
      reserve_close: Number((reserve_close / count).toFixed(1)),
    };
  }, [leads]);

  // 4. Lost Revenue Attribution & Mistake Diagnostics
  const lostAnalytics = useMemo(() => {
    const lostLeads = leads.filter((l) => ['lost_cancelled', 'lost'].includes(l.status || ''));
    let totalLostValue = 0;
    const byCategory: Record<string, { count: number; value: number }> = {
      price_budget: { count: 0, value: 0 },
      timeline_delivery: { count: 0, value: 0 },
      sales_mistake: { count: 0, value: 0 },
      process_bottleneck: { count: 0, value: 0 },
      external_cancelled: { count: 0, value: 0 },
      ghosted_unresponsive: { count: 0, value: 0 },
    };

    let annualWinbackQueued = 0;

    lostLeads.forEach((l) => {
      const val = Number(l.value) || 0;
      totalLostValue += val;

      const reason = l.lost_intelligence?.primary_reason || 'price_budget';
      if (byCategory[reason]) {
        byCategory[reason].count += 1;
        byCategory[reason].value += val;
      }

      if (l.lost_intelligence?.winback_eligible) {
        annualWinbackQueued += 1;
      }
    });

    return {
      totalCount: lostLeads.length,
      totalLostValue,
      byCategory,
      annualWinbackQueued,
    };
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* Top Manager KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="neo-card border-l-4 border-indigo-500/60 p-4 space-y-1">
          <div className="flex items-center justify-between text-secondary text-xs font-bold uppercase">
            <span>Team Quality Audit</span>
            <Award size={18} className="text-indigo-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100">
            {repStats.length > 0 ? Math.round(repStats.reduce((a, b) => a + b.avgAudit, 0) / repStats.length) : 78}
            <span className="text-xs text-slate-400 font-semibold ml-1">/ 100 M</span>
          </div>
          <p className="text-[11px] text-slate-500">Across SLA, FITS & PROSPER execution</p>
        </div>

        <div className="neo-card border-l-4 border-rose-500/60 p-4 space-y-1">
          <div className="flex items-center justify-between text-secondary text-xs font-bold uppercase">
            <span>Lost Revenue Leakage</span>
            <ShieldAlert size={18} className="text-rose-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-700">
            ₹{lostAnalytics.totalLostValue.toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-rose-600/80">{lostAnalytics.totalCount} deals lost to price, SLA, or timeline</p>
        </div>

        <div className="neo-card border-l-4 border-emerald-500/60 p-4 space-y-1">
          <div className="flex items-center justify-between text-secondary text-xs font-bold uppercase">
            <span>Cyclical Win-Back Queue</span>
            <RotateCcw size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-800">
            {lostAnalytics.annualWinbackQueued} Leads
          </div>
          <p className="text-[11px] text-emerald-700">Scheduled for Day 330 annual event remarketing</p>
        </div>

        <div className="neo-card border-l-4 border-amber-500/60 p-4 space-y-1">
          <div className="flex items-center justify-between text-secondary text-xs font-bold uppercase">
            <span>High-Intent Leads</span>
            <Flame size={18} className="text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-700">
            {leads.filter((l) => l.intent_tier === 'HIGH').length}
          </div>
          <p className="text-[11px] text-slate-500">Priority deals requiring &lt;15 min SLA</p>
        </div>
      </div>

      {/* 8-Stage Focused Sales Funnel */}
      <div className="neo-card space-y-4">
        <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
          <div>
            <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" />
              EcoTrophy 8-Stage Sales Conversion Funnel
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Identifies exact pipeline drop-off from Initial Enquiry to Order Confirmation & Delivery
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {funnelStages.map((st, idx) => (
            <div
              key={st.id}
              className="p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 space-y-2 relative"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{st.label}</span>
                <span className="font-black text-indigo-600 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px]">
                  {st.count}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${st.pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{st.pct}% velocity</span>
                {idx < funnelStages.length - 1 && (
                  <span className="text-slate-400 flex items-center gap-0.5">
                    Next <ArrowRight size={10} />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Salesperson Performance Leaderboard & Coaching Needs Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Rep Leaderboard */}
        <div className="lg:col-span-2 neo-card space-y-4">
          <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
            <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
              <Award size={16} className="text-primary" />
              Salesperson 100-Mark Audit Leaderboard
            </h2>
            <span className="text-xs text-secondary">{repStats.length} active reps</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="pb-2.5">Sales Rep</th>
                  <th className="pb-2.5">Deals / Won</th>
                  <th className="pb-2.5">Win Rate</th>
                  <th className="pb-2.5">Avg Audit Score</th>
                  <th className="pb-2.5">SLA (10M)</th>
                  <th className="pb-2.5">PROSPER (40M)</th>
                  <th className="pb-2.5">Primary Coaching Need</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {repStats.map((rep, idx) => (
                  <tr key={rep.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 font-bold text-slate-800 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <span>{rep.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-400">
                      {rep.total} / <span className="font-bold text-emerald-700">{rep.won}</span>
                    </td>
                    <td className="py-2.5 font-bold text-slate-800 dark:text-slate-200">
                      {rep.winRate}%
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full font-black text-[11px] border ${
                          rep.avgAudit >= 80
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : rep.avgAudit >= 65
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {rep.avgAudit}/100
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-slate-700 dark:text-slate-300">
                      {rep.avgSla}/10
                    </td>
                    <td className="py-2.5 font-mono text-slate-700 dark:text-slate-300">
                      {rep.avgProsper}/40
                    </td>
                    <td className="py-2.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                        {rep.primaryCoaching}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Team PROSPER Competency Heatmap */}
        <div className="neo-card space-y-4">
          <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
            <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={16} className="text-purple-600" />
              Team PROSPER Competency Matrix
            </h2>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>P – Pitch (Value Hook & Craft)</span>
                <strong>{teamProsperAvg.pitch} / 5.0</strong>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full" style={{ width: `${(teamProsperAvg.pitch / 5) * 100}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>R – Rapport (Language & Empathy)</span>
                <strong>{teamProsperAvg.rapport} / 5.0</strong>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full" style={{ width: `${(teamProsperAvg.rapport / 5) * 100}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>O – Open Questions (Ceremony Discovery)</span>
                <strong>{teamProsperAvg.open_questions} / 6.0</strong>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full" style={{ width: `${(teamProsperAvg.open_questions / 6) * 100}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>S – Story (Social Proof & Case Study)</span>
                <strong className={teamProsperAvg.story < 3 ? 'text-amber-600' : ''}>
                  {teamProsperAvg.story} / 5.0
                </strong>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full" style={{ width: `${(teamProsperAvg.story / 5) * 100}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>P – Proposal (Tiered Options & 2D Proof)</span>
                <strong>{teamProsperAvg.proposal} / 7.0</strong>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full" style={{ width: `${(teamProsperAvg.proposal / 7) * 100}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>E – Eliminate Objections (Reframing Price)</span>
                <strong className={teamProsperAvg.eliminate_objections < 4 ? 'text-amber-600' : ''}>
                  {teamProsperAvg.eliminate_objections} / 6.0
                </strong>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full" style={{ width: `${(teamProsperAvg.eliminate_objections / 6) * 100}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>R – Reserve & Close (Slot Urgency & 50%)</span>
                <strong className={teamProsperAvg.reserve_close < 4 ? 'text-rose-600' : ''}>
                  {teamProsperAvg.reserve_close} / 6.0
                </strong>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full" style={{ width: `${(teamProsperAvg.reserve_close / 6) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lost Revenue Attribution Breakdown */}
      <div className="neo-card space-y-4">
        <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
          <div>
            <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert size={16} className="text-rose-600" />
              Lost Revenue Root Cause Diagnostics
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Actionable insights into why leads were lost and preventable salesperson errors
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {[
            { key: 'price_budget', label: 'Price & Budget', data: lostAnalytics.byCategory.price_budget },
            { key: 'timeline_delivery', label: 'Timeline Missed', data: lostAnalytics.byCategory.timeline_delivery },
            { key: 'sales_mistake', label: 'Sales Mistake', data: lostAnalytics.byCategory.sales_mistake },
            { key: 'process_bottleneck', label: 'Sample / Credit', data: lostAnalytics.byCategory.process_bottleneck },
            { key: 'external_cancelled', label: 'Event Cancelled', data: lostAnalytics.byCategory.external_cancelled },
            { key: 'ghosted_unresponsive', label: 'Ghosted / Lost', data: lostAnalytics.byCategory.ghosted_unresponsive },
          ].map((cat) => (
            <div
              key={cat.key}
              className="p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 space-y-1"
            >
              <span className="font-semibold text-slate-500 text-[11px] block truncate">{cat.label}</span>
              <div className="text-lg font-black text-slate-800 dark:text-slate-100">{cat.data.count} deals</div>
              <div className="text-[11px] font-bold text-rose-600">₹{cat.data.value.toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


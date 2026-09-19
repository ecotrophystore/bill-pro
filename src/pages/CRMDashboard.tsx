import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Phone,
  Clock,
  BarChart3,
  Activity,
  ArrowRight,
  Loader2,
  Target,
  Zap,
  Layers,
  Award,
  DollarSign,
  User,
  Building,
  Check,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { db } from "../lib/firebase";
import type { Lead, LeadActivity, Pipeline } from "../types";
import { STANDARD_CRM_STAGES, DEFAULT_QUANTITY_PIPELINES } from "../types";
import { useCRMPermission } from "../hooks/useCRMPermission";
import { STAGE_PHASES } from "./PipelineBoard";

function formatDate(value: any) {
  if (!value) return "-";
  if (typeof value.toDate === "function") return value.toDate().toLocaleDateString("en-IN");
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toLocaleDateString("en-IN");
  const d = new Date(value);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-IN");
}

function isOverdue(value: any): boolean {
  if (!value) return false;
  let date: Date;
  if (typeof value.toDate === "function") date = value.toDate();
  else if (value.seconds) date = new Date(value.seconds * 1000);
  else date = new Date(value);
  return !isNaN(date.getTime()) && date < new Date();
}

export default function CRMDashboard() {
  const navigate = useNavigate();
  const { hasPermission } = useCRMPermission();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>(DEFAULT_QUANTITY_PIPELINES);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("all");
  const [recentActivities, setRecentActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;

    const leadsUnsub = onSnapshot(
      collection(db, "leads"),
      (snap) => {
        setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
        setLoading(false);
      },
      () => setLoading(false)
    );

    const pipelinesUnsub = onSnapshot(collection(db, "pipelines"), (snap) => {
      if (!snap.empty) {
        setPipelines(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pipeline)));
      }
    });

    const activityQ = query(collection(db, "activities"), orderBy("created_at", "desc"), limit(20));
    const activityUnsub = onSnapshot(
      activityQ,
      (snap) => {
        setRecentActivities(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadActivity)));
      },
      () => {}
    );

    return () => {
      leadsUnsub();
      pipelinesUnsub();
      activityUnsub();
    };
  }, []);

  // Filter leads by selected pipeline
  const filteredLeads = useMemo(() => {
    if (selectedPipelineId === "all") return leads;
    return leads.filter((l) => {
      const pId = l.pipeline_id || "regular_order";
      return pId === selectedPipelineId || (selectedPipelineId === "regular_order" && (pId === "default" || !pId));
    });
  }, [leads, selectedPipelineId]);

  // Overall KPI Stats
  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const byStatus = filteredLeads.reduce<Record<string, number>>((acc, l) => {
      const st = l.status || "new_enquiry";
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    }, {});

    const overdue = filteredLeads.filter(
      (l) => l.next_follow_up_date && isOverdue(l.next_follow_up_date) && l.status !== "lost_cancelled" && l.status !== "lost"
    ).length;

    // Won = completed, delivered, full_payment, qualified
    const won = filteredLeads.filter((l) =>
      ["completed", "delivered", "full_payment", "qualified"].includes(l.status || "")
    ).length;

    // Lost = lost_cancelled, lost
    const lost = filteredLeads.filter((l) =>
      ["lost_cancelled", "lost"].includes(l.status || "")
    ).length;

    const inProgress = Math.max(0, total - won - lost);
    const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;

    // Pipeline Value: accurately sum lead.value
    const pipelineValue = filteredLeads
      .filter((l) => l.status !== "lost_cancelled" && l.status !== "lost")
      .reduce((sum, l) => sum + (Number(l.value) || 0), 0);

    const totalPieces = filteredLeads
      .filter((l) => l.status !== "lost_cancelled" && l.status !== "lost")
      .reduce((sum, l) => sum + (Number(l.required_quantity) || 0), 0);

    return { total, byStatus, overdue, won, lost, inProgress, conversionRate, pipelineValue, totalPieces };
  }, [filteredLeads]);

  // Phase-wise breakdown
  const phaseBreakdown = useMemo(() => {
    return STAGE_PHASES.map((phase) => {
      let count = 0;
      let val = 0;
      phase.stageIds.forEach((sId) => {
        const matchingLeads = filteredLeads.filter((l) => (l.status || "new_enquiry") === sId);
        count += matchingLeads.length;
        val += matchingLeads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
      });
      return {
        ...phase,
        count,
        value: val,
      };
    });
  }, [filteredLeads]);

  // Active stages for the selected pipeline
  const activeStages = useMemo(() => {
    if (selectedPipelineId !== "all") {
      const pipe = pipelines.find((p) => p.id === selectedPipelineId);
      if (pipe?.stages?.length) return pipe.stages;
    }
    return STANDARD_CRM_STAGES;
  }, [selectedPipelineId, pipelines]);

  // Granular Stage breakdown
  const stageBreakdown = useMemo(() => {
    return activeStages.map((stage, idx) => {
      const matching = filteredLeads.filter((l) => (l.status || "new_enquiry") === stage.id);
      const val = matching.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
      return {
        id: stage.id,
        label: stage.label,
        index: idx + 1,
        count: matching.length,
        value: val,
      };
    });
  }, [activeStages, filteredLeads]);

  const maxStageCount = Math.max(...stageBreakdown.map((s) => s.count), 1);

  // Sales Rep Performance Matrix
  const salesRepStats = useMemo(() => {
    const map: Record<string, { total: number; value: number; won: number }> = {};
    filteredLeads.forEach((l) => {
      const rep = l.sales_person?.trim() || "Unassigned";
      if (!map[rep]) map[rep] = { total: 0, value: 0, won: 0 };
      map[rep].total += 1;
      map[rep].value += Number(l.value) || 0;
      if (["completed", "delivered", "full_payment", "qualified"].includes(l.status || "")) {
        map[rep].won += 1;
      }
    });

    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        ...data,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredLeads]);

  // Overdue follow-ups list
  const overdueLeads = useMemo(
    () =>
      filteredLeads
        .filter((l) => l.next_follow_up_date && isOverdue(l.next_follow_up_date) && l.status !== "lost_cancelled" && l.status !== "lost")
        .slice(0, 6),
    [filteredLeads]
  );

  // Recent leads list
  const recentLeads = useMemo(() => {
    const getMs = (v: any) => {
      if (!v) return 0;
      if (typeof v.toDate === "function") return v.toDate().getTime();
      if (v.seconds) return v.seconds * 1000;
      return new Date(v).getTime() || 0;
    };
    return [...filteredLeads]
      .sort((a, b) => getMs((b as any).updated_at || b.created_at) - getMs((a as any).updated_at || a.created_at))
      .slice(0, 6);
  }, [filteredLeads]);

  if (!hasPermission("view_lead")) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
        <XCircle size={48} className="text-error opacity-40" />
        <p className="text-secondary font-semibold">You do not have permission to view the CRM dashboard.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-primary-dark" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-full">
      {/* Header & Global Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Intelligence & Reporting</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary-dark mt-1 flex items-center gap-2">
            <Target size={28} className="text-primary" />
            CRM Analytics & Performance
          </h1>
          <p className="text-secondary text-xs sm:text-sm mt-0.5">
            Full visibility across order pipelines, milestone conversion rates, production queues & sales reps.
          </p>
        </div>

        <div className="flex gap-2.5 flex-wrap">
          <Link to="/pipeline" className="neo-btn inline-flex items-center gap-2 text-xs font-bold px-3.5 py-2">
            <BarChart3 size={14} /> Pipeline Board
          </Link>
          <Link
            to="/leads/new"
            className="neo-btn-primary inline-flex items-center gap-2 text-xs font-bold px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
          >
            <Users size={14} /> Add Customer Lead
          </Link>
        </div>
      </div>

      {/* Pipeline Selector Tab Bar */}
      <div className="flex items-center gap-2 overflow-x-auto p-1.5 bg-slate-100 rounded-2xl border border-shadow-darker/10">
        <button
          type="button"
          onClick={() => setSelectedPipelineId("all")}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            selectedPipelineId === "all"
              ? "bg-white text-primary-dark shadow-sm border border-shadow-darker/15 scale-[1.02]"
              : "text-secondary hover:text-primary-dark hover:bg-white/60"
          }`}
        >
          All Pipelines ({leads.length} leads)
        </button>

        {pipelines.map((p) => {
          const isSelected = selectedPipelineId === p.id;
          const count = leads.filter((l) => (l.pipeline_id || "regular_order") === p.id).length;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPipelineId(p.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isSelected
                  ? "bg-white text-primary-dark shadow-sm border border-shadow-darker/15 scale-[1.02]"
                  : "text-secondary hover:text-primary-dark hover:bg-white/60"
              }`}
            >
              <span>{p.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isSelected ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-700"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* KPI Highlight Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Pipeline Value */}
        <div className="neo-card flex flex-col justify-between gap-2 border-l-4 border-emerald-500/40">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Active Pipeline Value</span>
            <DollarSign size={18} className="text-emerald-600 opacity-60" />
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black text-emerald-800">
              ₹{stats.pipelineValue.toLocaleString("en-IN")}
            </span>
            <span className="text-xs text-secondary block mt-0.5">
              {stats.totalPieces.toLocaleString("en-IN")} trophies in active pipeline
            </span>
          </div>
        </div>

        {/* Total Leads */}
        <div className="neo-card flex flex-col justify-between gap-2">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Total Customers</span>
            <Users size={18} className="text-primary opacity-60" />
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black text-primary-dark">{stats.total}</span>
            <span className="text-xs text-secondary block mt-0.5">
              {stats.inProgress} active · {stats.won} completed
            </span>
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="neo-card flex flex-col justify-between gap-2 border-l-4 border-indigo-500/40">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Completion Rate</span>
            <TrendingUp size={18} className="text-indigo-600 opacity-60" />
          </div>
          <div>
            <span className="text-2xl sm:text-3xl font-black text-indigo-700">{stats.conversionRate}%</span>
            <span className="text-xs text-secondary block mt-0.5">
              {stats.won} delivered / {stats.lost} cancelled
            </span>
          </div>
        </div>

        {/* Overdue Follow-ups */}
        <div
          className="neo-card flex flex-col justify-between gap-2 border-l-4 border-amber-500/40 cursor-pointer hover:shadow-md transition-all"
          onClick={() => navigate("/pipeline")}
          title="Click to view in Pipeline"
        >
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Overdue Follow-ups</span>
            <AlertTriangle size={18} className="text-amber-600 opacity-60" />
          </div>
          <div>
            <span className={`text-2xl sm:text-3xl font-black ${stats.overdue > 0 ? "text-amber-600" : "text-slate-600"}`}>
              {stats.overdue}
            </span>
            <span className="text-xs text-secondary block mt-0.5">require sales rep action</span>
          </div>
        </div>
      </div>

      {/* 5 PHASES PIPELINE CONVERSION MATRIX */}
      <div className="neo-card space-y-3">
        <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-2.5">
          <h2 className="text-xs font-bold text-primary-dark flex items-center gap-2 uppercase tracking-wider">
            <Layers size={16} className="text-primary" />
            5-Phase Lifecycle Distribution
          </h2>
          <span className="text-xs text-secondary">Active customers categorized by milestone phase</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {phaseBreakdown.map((p) => {
            const pct = stats.total > 0 ? Math.round((p.count / stats.total) * 100) : 0;
            return (
              <div key={p.id} className="p-3 rounded-2xl bg-slate-50 border border-shadow-darker/10 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-primary-dark truncate">{p.shortLabel}</span>
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-white border border-shadow-darker/15 text-primary-dark">
                    {p.count}
                  </span>
                </div>

                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>

                <div className="flex items-center justify-between text-[11px] text-secondary">
                  <span>{pct}% of pipeline</span>
                  {p.value > 0 && <span className="font-bold text-emerald-800">₹{(p.value / 1000).toFixed(0)}k</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DETAILED 16-STAGE BREAKDOWN & SALES REP PERFORMANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Granular 16 Stages Bar Chart */}
        <div className="lg:col-span-2 neo-card space-y-4">
          <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
            <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
              <BarChart3 size={16} className="text-primary" />
              Granular Milestone Stage Volume
            </h2>
            <span className="text-xs text-secondary">{activeStages.length} stages monitored</span>
          </div>

          <div className="space-y-3">
            {stageBreakdown.map((stage) => {
              const pct = Math.round((stage.count / maxStageCount) * 100);
              return (
                <div key={stage.id} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary-dark truncate">
                      {stage.index}. {stage.label}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      {stage.value > 0 && (
                        <span className="font-bold text-emerald-700 text-[11px]">
                          ₹{stage.value.toLocaleString("en-IN")}
                        </span>
                      )}
                      <span className="font-black text-slate-800 min-w-[24px] text-right">{stage.count}</span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-shadow-darker/5">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Top Sales Reps Portfolio */}
        <div className="neo-card space-y-4">
          <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
            <h2 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
              <User size={16} className="text-primary" />
              Sales Rep Performance
            </h2>
            <span className="text-xs text-secondary">{salesRepStats.length} reps</span>
          </div>

          {salesRepStats.length === 0 ? (
            <div className="py-12 text-center text-xs text-secondary">No assigned reps found.</div>
          ) : (
            <div className="space-y-3">
              {salesRepStats.map((rep, idx) => (
                <div
                  key={rep.name}
                  className="p-3 rounded-2xl bg-slate-50 border border-shadow-darker/10 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-primary-dark truncate">
                      <span className="text-secondary font-mono">{idx + 1}.</span>
                      <span className="truncate">{rep.name}</span>
                    </div>
                    <span className="font-black text-emerald-800 shrink-0">
                      ₹{rep.value.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-secondary pt-1">
                    <span>{rep.total} total leads</span>
                    <span className="font-semibold text-indigo-700">{rep.won} completed</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM WIDGETS: OVERDUE ALERTS & RECENT LEADS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Overdue Leads Widget */}
        <div className="neo-card space-y-3">
          <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-2.5">
            <h3 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-600" />
              Overdue Follow-ups Attention List
            </h3>
            <Link to="/pipeline" className="text-xs text-primary font-bold hover:underline">
              Open Board
            </Link>
          </div>

          {overdueLeads.length === 0 ? (
            <div className="py-8 text-center text-xs text-secondary border border-dashed border-shadow-darker/15 rounded-xl">
              All client follow-ups are up to date! 🎉
            </div>
          ) : (
            <div className="space-y-2">
              {overdueLeads.map((l) => (
                <div
                  key={l.id}
                  className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs flex items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <Link
                      to={`/leads/${l.id}`}
                      className="font-bold text-primary-dark hover:text-primary transition-colors block truncate max-w-[200px]"
                    >
                      {l.name}
                    </Link>
                    <div className="text-[11px] text-secondary">
                      Stage: {l.status} {l.phone ? `• ${l.phone}` : ""}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-rose-700 block">
                      Due: {formatDate(l.next_follow_up_date)}
                    </span>
                    <Link
                      to={`/leads/${l.id}`}
                      className="text-[10px] font-bold text-primary hover:underline inline-flex items-center gap-0.5 mt-0.5"
                    >
                      View 360° <ChevronRight size={10} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activities Feed */}
        <div className="neo-card space-y-3">
          <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-2.5">
            <h3 className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-2">
              <Activity size={15} className="text-primary" />
              Recent CRM Audit Feed
            </h3>
            <span className="text-xs text-secondary">{recentActivities.length} events</span>
          </div>

          {recentActivities.length === 0 ? (
            <div className="py-8 text-center text-xs text-secondary border border-dashed border-shadow-darker/15 rounded-xl">
              No recent activity entries recorded.
            </div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {recentActivities.map((act, i) => (
                <div
                  key={act.id || i}
                  className="p-2.5 rounded-xl bg-slate-50 border border-shadow-darker/5 text-xs flex items-start justify-between gap-3"
                >
                  <p className="text-slate-800 leading-snug">{act.message}</p>
                  <span className="text-[10px] text-secondary shrink-0">{formatDate(act.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import {
  Users, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Phone, Clock,
  BarChart3, Activity, ArrowRight, Loader2, Target, Zap,
} from "lucide-react";
import { db } from "../lib/firebase";
import type { Lead, LeadActivity, Pipeline } from "../types";
import { useCRMPermission } from "../hooks/useCRMPermission";

function formatDate(value: any) {
  if (!value) return "-";
  if (typeof value.toDate === "function") return value.toDate().toLocaleString();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toLocaleDateString();
  const d = new Date(value);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
}

function isOverdue(value: any): boolean {
  if (!value) return false;
  let date: Date;
  if (typeof value.toDate === "function") date = value.toDate();
  else if (value.seconds) date = new Date(value.seconds * 1000);
  else date = new Date(value);
  return !isNaN(date.getTime()) && date < new Date();
}

const STAGE_COLORS: Record<string, string> = {
  new: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  contacted: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  qualified: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  lost: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

const STAGE_BAR: Record<string, string> = {
  new: "bg-sky-400",
  contacted: "bg-amber-400",
  qualified: "bg-emerald-400",
  lost: "bg-rose-400",
};

export default function CRMDashboard() {
  const navigate = useNavigate();
  const { hasPermission } = useCRMPermission();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [recentActivities, setRecentActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const leadsUnsub = onSnapshot(collection(db, "leads"), (snap) => {
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    }, () => setLoading(false));

    const activityQ = query(collection(db, "lead_activities"), orderBy("created_at", "desc"), limit(20));
    const activityUnsub = onSnapshot(activityQ, (snap) => {
      setRecentActivities(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadActivity)));
    }, () => {});

    return () => { leadsUnsub(); activityUnsub(); };
  }, []);

  const stats = useMemo(() => {
    const total = leads.length;
    const byStatus = leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    }, {});
    const overdue = leads.filter((l) => l.next_follow_up_date && isOverdue(l.next_follow_up_date) && l.status !== "lost").length;
    const won = byStatus["qualified"] || 0;
    const lost = byStatus["lost"] || 0;
    const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;
    const pipelineValue = leads.filter((l) => l.status !== "lost").reduce((sum, l) => sum + ((l as any).deal_value || 0), 0);
    return { total, byStatus, overdue, won, lost, conversionRate, pipelineValue };
  }, [leads]);

  const stageBreakdown = useMemo(() => {
    return ["new", "contacted", "qualified", "lost"].map((s) => ({
      id: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
      count: stats.byStatus[s] || 0,
    }));
  }, [stats.byStatus]);

  const maxCount = Math.max(...stageBreakdown.map((s) => s.count), 1);

  const overdueLeads = useMemo(() =>
    leads.filter((l) => l.next_follow_up_date && isOverdue(l.next_follow_up_date) && l.status !== "lost").slice(0, 5),
    [leads]
  );

  const recentLeads = useMemo(() => {
    const getMs = (v: any) => {
      if (!v) return 0;
      if (typeof v.toDate === "function") return v.toDate().getTime();
      if (v.seconds) return v.seconds * 1000;
      return new Date(v).getTime() || 0;
    };
    return [...leads].sort((a, b) => getMs((b as any).updated_at || b.created_at) - getMs((a as any).updated_at || a.created_at)).slice(0, 5);
  }, [leads]);

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
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary-dark" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark flex items-center gap-2">
            <Target size={28} className="text-primary" />
            CRM Dashboard
          </h1>
          <p className="text-secondary mt-1">Pipeline health, stage breakdown &amp; lead activity overview.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/leads/new" className="neo-btn-primary inline-flex items-center gap-2 text-sm">
            <Users size={15} /> Add Lead
          </Link>
          <Link to="/pipeline" className="neo-btn inline-flex items-center gap-2 text-sm">
            <BarChart3 size={15} /> Pipeline Board
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="neo-card flex flex-col gap-3 group hover:shadow-neo-inset transition-all cursor-default">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-widest text-secondary">Total Leads</span>
            <Users size={18} className="text-secondary opacity-40 group-hover:opacity-80 transition-opacity" />
          </div>
          <span className="text-3xl font-black text-primary-dark">{stats.total}</span>
          <span className="text-xs text-secondary">{stats.won} qualified · {stats.lost} lost</span>
        </div>

        <div className="neo-card flex flex-col gap-3 group hover:shadow-neo-inset transition-all cursor-default border-l-4 border-emerald-500/30">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-widest text-secondary">Conversion</span>
            <TrendingUp size={18} className="text-emerald-600 opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-3xl font-black text-emerald-600">{stats.conversionRate}%</span>
          <span className="text-xs text-secondary">{stats.won} won from {stats.total}</span>
        </div>

        <div
          className="neo-card flex flex-col gap-3 group hover:shadow-neo-inset transition-all cursor-pointer border-l-4 border-amber-500/30"
          onClick={() => navigate("/leads")}
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-widest text-secondary">Overdue Follow-ups</span>
            <AlertTriangle size={18} className="text-amber-600 opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className={`text-3xl font-black ${stats.overdue > 0 ? "text-amber-600" : "text-secondary"}`}>
            {stats.overdue}
          </span>
          <span className="text-xs text-secondary">requires immediate attention</span>
        </div>

        <div className="neo-card flex flex-col gap-3 group hover:shadow-neo-inset transition-all cursor-default border-l-4 border-sky-500/30">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-widest text-secondary">Pipeline Value</span>
            <Zap size={18} className="text-sky-600 opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-3xl font-black text-sky-700">
            {stats.pipelineValue > 0 ? `Rs.${stats.pipelineValue.toLocaleString()}` : "—"}
          </span>
          <span className="text-xs text-secondary">active (non-lost) leads</span>
        </div>
      </div>

      {/* Stage Funnel + Overdue leads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="neo-card">
          <h2 className="font-bold text-primary-dark mb-5 flex items-center gap-2">
            <BarChart3 size={18} className="text-primary" />
            Stage Breakdown
          </h2>
          <div className="space-y-4">
            {stageBreakdown.map((stage) => (
              <div key={stage.id}>
                <div className="flex justify-between mb-1.5 text-sm">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${STAGE_COLORS[stage.id] || "bg-secondary/10 text-secondary border-secondary/20"}`}>
                    {stage.label}
                  </span>
                  <span className="font-bold text-primary-dark">{stage.count}</span>
                </div>
                <div className="h-2 rounded-full bg-shadow-darker/10 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-700 ${STAGE_BAR[stage.id] || "bg-secondary/40"}`}
                    style={{ width: `${Math.round((stage.count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="neo-card">
          <h2 className="font-bold text-primary-dark mb-5 flex items-center gap-2">
            <Clock size={18} className="text-amber-600" />
            Overdue Follow-ups
          </h2>
          {overdueLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3 opacity-50">
              <CheckCircle2 size={32} className="text-emerald-600" />
              <p className="text-sm text-secondary">No overdue follow-ups. Great work!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {overdueLeads.map((lead) => (
                <Link
                  key={lead.id}
                  to={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-shadow-darker/5 transition-colors group border border-transparent hover:border-shadow-darker/10"
                >
                  <div>
                    <p className="font-semibold text-primary-dark text-sm">{lead.name}</p>
                    <p className="text-xs text-secondary flex items-center gap-1 mt-0.5">
                      <Phone size={11} />
                      {lead.phone || "No phone"} · Due: {formatDate(lead.next_follow_up_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${STAGE_COLORS[lead.status] || "bg-secondary/10 text-secondary border-secondary/20"}`}>
                      {lead.status}
                    </span>
                    <ArrowRight size={14} className="text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Leads + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="neo-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-primary-dark flex items-center gap-2">
              <Users size={18} className="text-primary" /> Recent Leads
            </h2>
            <Link to="/leads" className="text-xs text-secondary hover:text-primary-dark font-semibold transition-colors flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {recentLeads.length === 0 ? (
              <p className="text-secondary text-sm text-center py-8 opacity-50">No leads yet.</p>
            ) : recentLeads.map((lead) => (
              <Link
                key={lead.id}
                to={`/leads/${lead.id}`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-shadow-darker/5 transition-colors group border border-transparent hover:border-shadow-darker/10"
              >
                <div>
                  <p className="font-semibold text-primary-dark text-sm">{lead.name}</p>
                  <p className="text-xs text-secondary mt-0.5">{lead.source} · {lead.platform}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${STAGE_COLORS[lead.status] || "bg-secondary/10 text-secondary border-secondary/20"}`}>
                    {lead.status}
                  </span>
                  <ArrowRight size={14} className="text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="neo-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-primary-dark flex items-center gap-2">
              <Activity size={18} className="text-primary" /> Activity Feed
            </h2>
          </div>
          <div className="space-y-3">
            {recentActivities.length === 0 ? (
              <p className="text-secondary text-sm text-center py-8 opacity-50">No recent activity.</p>
            ) : recentActivities.slice(0, 8).map((act) => (
              <div key={act.id} className="flex items-start gap-3 py-2 border-b border-shadow-darker/5 last:border-0">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Activity size={13} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary-dark capitalize">{(act.type || "activity").replace(/_/g, " ")}</p>
                  <p className="text-xs text-secondary mt-0.5 truncate">{(act as any).notes || (act as any).body || "—"}</p>
                  <p className="text-[10px] text-secondary/60 mt-0.5">{formatDate(act.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

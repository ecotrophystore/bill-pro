import React, { useMemo, useState } from 'react';
import {
  Boxes,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  TrendingUp,
  Filter,
  CheckCircle2,
  Clock,
  Zap,
  Info,
} from 'lucide-react';
import type { Lead, PipelineStage } from '../../types';

export type OrderCategory = 'bulk' | 'regular' | 'small' | 'other';

export interface StageOrderStats {
  stageId: string;
  stageLabel: string;
  bulkCount: number;
  bulkValue: number;
  regularCount: number;
  regularValue: number;
  smallCount: number;
  smallValue: number;
  otherCount: number;
  totalCount: number;
  totalValue: number;
}

interface OrderTypeStageSummaryProps {
  leads: Lead[];
  stages: PipelineStage[];
  activePipelineId: string;
  onSelectPipeline: (pipelineId: string) => void;
  onScrollToStage: (stageId: string) => void;
  isDesignPipeline?: boolean;
  isProductionPipeline?: boolean;
  searchQuery?: string;
  salesPersonFilter?: string;
  dbUser?: any;
}

/**
 * Extracts normalized numeric quantity from lead
 */
export function extractQuantity(lead: Lead): number | null {
  const val =
    lead.required_quantity ??
    (lead as any).quantity ??
    (lead as any).scope_quantity ??
    (lead as any).qty;
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

/**
 * Classifies lead into order category:
 * - Bulk: 100+ pcs or assigned to 'bulk_order' pipeline
 * - Regular: 10–99 pcs or assigned to 'regular_order' pipeline (or default unassigned)
 * - Small: 1–9 pcs or assigned to 'small_order' pipeline
 * - Other: Unclassified / Requirement Pending without quantity
 */
export function classifyLeadOrder(lead: Lead): OrderCategory {
  if (lead.pipeline_id === 'bulk_order') return 'bulk';
  if (lead.pipeline_id === 'regular_order') return 'regular';
  if (lead.pipeline_id === 'small_order') return 'small';
  if (lead.pipeline_id === 'unclassified') return 'other';

  const qty = extractQuantity(lead);
  if (qty !== null && qty > 0) {
    if (qty >= 100) return 'bulk';
    if (qty >= 10) return 'regular';
    return 'small';
  }

  // General leads in CRM default to regular order if not specifically designated
  return 'regular';
}

/**
 * Resolves current stage ID for lead based on active pipeline mode
 */
export function getLeadActiveStageId(
  lead: Lead,
  isDesign: boolean,
  isProd: boolean
): string {
  if (isDesign) {
    return (lead as any).design_stage_id || 'concept_creation';
  }
  if (isProd) {
    return (lead as any).production_stage_id || 'material_prep';
  }
  return lead.status || 'new_enquiry';
}

export const OrderTypeStageSummary: React.FC<OrderTypeStageSummaryProps> = ({
  leads,
  stages,
  activePipelineId,
  onSelectPipeline,
  onScrollToStage,
  isDesignPipeline = false,
  isProductionPipeline = false,
  searchQuery = '',
  salesPersonFilter = 'all',
  dbUser,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('billpro.orderSummaryCollapsed') === 'true';
  });
  const [filterActiveOnly, setFilterActiveOnly] = useState<boolean>(false);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('billpro.orderSummaryCollapsed', String(next));
      return next;
    });
  };

  // Compute metrics across relevant leads
  const {
    stageStatsList,
    totalBulk,
    totalRegular,
    totalSmall,
    totalBulkValue,
    totalRegularValue,
    totalSmallValue,
    grandTotal,
    grandTotalValue,
    activeStagesCount,
  } = useMemo(() => {
    // Apply search and assignee filters if present
    const filteredLeads = leads.filter((lead) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (lead.name || '').toLowerCase().includes(q) ||
          (lead.phone || '').includes(q) ||
          (lead.company || '').toLowerCase().includes(q) ||
          (lead.event_name || '').toLowerCase().includes(q) ||
          ((lead.sales_person || '').toLowerCase().includes(q));
        if (!match) return false;
      }

      if (salesPersonFilter !== 'all') {
        if (salesPersonFilter === 'my_leads') {
          const myName = (dbUser?.name || '').trim().toLowerCase();
          const myEmail = (dbUser?.email || '').trim().toLowerCase();
          const matchesRep =
            ((lead.sales_person || '').trim().toLowerCase() === myName && myName !== '') ||
            ((lead.sales_person || '').trim().toLowerCase() === myEmail && myEmail !== '');
          if (!matchesRep) return false;
        } else {
          if ((lead.sales_person || '').trim() !== salesPersonFilter) return false;
        }
      }
      return true;
    });

    // Map stages
    const stageMap: Record<string, StageOrderStats> = {};
    stages.forEach((s) => {
      stageMap[s.id] = {
        stageId: s.id,
        stageLabel: s.label,
        bulkCount: 0,
        bulkValue: 0,
        regularCount: 0,
        regularValue: 0,
        smallCount: 0,
        smallValue: 0,
        otherCount: 0,
        totalCount: 0,
        totalValue: 0,
      };
    });

    let bulkCount = 0;
    let bulkVal = 0;
    let regularCount = 0;
    let regularVal = 0;
    let smallCount = 0;
    let smallVal = 0;
    let totalCount = 0;
    let totalVal = 0;

    filteredLeads.forEach((lead) => {
      const stageId = getLeadActiveStageId(lead, isDesignPipeline, isProductionPipeline);
      const cat = classifyLeadOrder(lead);
      const val = Number(lead.value) || 0;

      if (cat === 'bulk') {
        bulkCount++;
        bulkVal += val;
      } else if (cat === 'regular') {
        regularCount++;
        regularVal += val;
      } else if (cat === 'small') {
        smallCount++;
        smallVal += val;
      }

      totalCount++;
      totalVal += val;

      if (stageMap[stageId]) {
        if (cat === 'bulk') {
          stageMap[stageId].bulkCount++;
          stageMap[stageId].bulkValue += val;
        } else if (cat === 'regular') {
          stageMap[stageId].regularCount++;
          stageMap[stageId].regularValue += val;
        } else if (cat === 'small') {
          stageMap[stageId].smallCount++;
          stageMap[stageId].smallValue += val;
        } else {
          stageMap[stageId].otherCount++;
        }
        stageMap[stageId].totalCount++;
        stageMap[stageId].totalValue += val;
      }
    });

    const statsList = stages.map((s) => stageMap[s.id]);
    const withOrders = statsList.filter((s) => s.totalCount > 0).length;

    return {
      stageStatsList: statsList,
      totalBulk: bulkCount,
      totalRegular: regularCount,
      totalSmall: smallCount,
      totalBulkValue: bulkVal,
      totalRegularValue: regularVal,
      totalSmallValue: smallVal,
      grandTotal: totalCount,
      grandTotalValue: totalVal,
      activeStagesCount: withOrders,
    };
  }, [
    leads,
    stages,
    isDesignPipeline,
    isProductionPipeline,
    searchQuery,
    salesPersonFilter,
    dbUser,
  ]);

  const displayedStats = useMemo(() => {
    if (!filterActiveOnly) return stageStatsList;
    return stageStatsList.filter((s) => s.totalCount > 0);
  }, [stageStatsList, filterActiveOnly]);

  const isBulkPipelineSelected = activePipelineId === 'bulk_order';
  const isRegularPipelineSelected =
    activePipelineId === 'regular_order' || activePipelineId === 'default';

  return (
    <div className="bg-surface rounded-2xl border border-shadow-darker/20 shadow-neo-surface p-3 sm:p-4 space-y-3.5 transition-all w-full min-w-0">
      {/* Top Header & Quick Action Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-primary to-teal-700 text-white flex items-center justify-center font-black shadow-sm shrink-0">
            <Boxes size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-black text-primary-dark tracking-wide flex items-center gap-1.5">
                <span>Orders by Stage Summary</span>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-200">
                  Bulk (100+)
                </span>
                <span className="text-secondary font-bold text-xs">vs</span>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                  Regular (10–99)
                </span>
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 text-[10px] font-extrabold border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Stage Matrix
              </span>
            </div>
            <p className="text-[11px] text-secondary mt-0.5">
              Instant breakdown of order volumes sitting at every pipeline stage. Click any stage to jump directly to its board column.
            </p>
          </div>
        </div>

        {/* View Controls & Collapse Toggle */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setFilterActiveOnly((prev) => !prev)}
            className={`text-xs px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 border transition-all ${
              filterActiveOnly
                ? 'bg-primary text-surface border-primary shadow-xs'
                : 'bg-surface text-secondary hover:text-primary-dark border-shadow-darker/20 hover:bg-shadow-darker/10'
            }`}
            title="Filter to only stages that currently have orders"
          >
            <Filter size={12} />
            <span>
              {filterActiveOnly
                ? `Active Only (${activeStagesCount})`
                : `All Stages (${stages.length})`}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleCollapse}
            className="p-1.5 rounded-xl border border-shadow-darker/20 hover:bg-shadow-darker/10 text-secondary hover:text-primary-dark transition-colors"
            title={isCollapsed ? 'Expand Order Stage Summary' : 'Collapse Order Stage Summary'}
            aria-label={isCollapsed ? 'Expand Summary' : 'Collapse Summary'}
          >
            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Aggregate KPI Summary Strip (Always Visible or Compacted) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Bulk Orders Card */}
        <div
          onClick={() => onSelectPipeline('bulk_order')}
          className={`group cursor-pointer p-2.5 sm:p-3 rounded-xl border transition-all flex flex-col justify-between ${
            isBulkPipelineSelected
              ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-400/20 shadow-sm'
              : 'bg-indigo-50/30 hover:bg-indigo-50/60 border-indigo-200/80 hover:border-indigo-300'
          }`}
          title="Click to view Bulk Order Pipeline (100+ Pieces)"
        >
          <div className="flex items-center justify-between gap-1.5 mb-1">
            <span className="text-[11px] font-black uppercase text-indigo-950 flex items-center gap-1.5">
              <Package size={13} className="text-indigo-600 shrink-0" />
              <span>Bulk Orders (100+)</span>
            </span>
            {isBulkPipelineSelected && (
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-indigo-600 text-white uppercase">
                Active Tab
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-indigo-900 tracking-tight">
                {totalBulk}
              </span>
              <span className="text-xs font-bold text-indigo-700/80">orders</span>
            </div>
            {totalBulkValue > 0 && (
              <span className="text-xs font-black text-indigo-800">
                ₹{totalBulkValue.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-indigo-700 font-bold group-hover:underline">
            <span>Filter bulk deals</span>
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>

        {/* Regular Orders Card */}
        <div
          onClick={() => onSelectPipeline('regular_order')}
          className={`group cursor-pointer p-2.5 sm:p-3 rounded-xl border transition-all flex flex-col justify-between ${
            isRegularPipelineSelected
              ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-400/20 shadow-sm'
              : 'bg-emerald-50/30 hover:bg-emerald-50/60 border-emerald-200/80 hover:border-emerald-300'
          }`}
          title="Click to view Regular Order Pipeline (10–99 Pieces)"
        >
          <div className="flex items-center justify-between gap-1.5 mb-1">
            <span className="text-[11px] font-black uppercase text-emerald-950 flex items-center gap-1.5">
              <Layers size={13} className="text-emerald-600 shrink-0" />
              <span>Regular Orders (10–99)</span>
            </span>
            {isRegularPipelineSelected && (
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-600 text-white uppercase">
                Active Tab
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-emerald-900 tracking-tight">
                {totalRegular}
              </span>
              <span className="text-xs font-bold text-emerald-700/80">orders</span>
            </div>
            {totalRegularValue > 0 && (
              <span className="text-xs font-black text-emerald-800">
                ₹{totalRegularValue.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-emerald-700 font-bold group-hover:underline">
            <span>Filter regular deals</span>
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>

        {/* Small Orders Card */}
        <div
          onClick={() => onSelectPipeline('small_order')}
          className="group cursor-pointer p-2.5 sm:p-3 rounded-xl border border-amber-200/80 bg-amber-50/30 hover:bg-amber-50/60 transition-all flex flex-col justify-between"
          title="Click to view Small Order Pipeline (1–9 Pieces)"
        >
          <div className="flex items-center justify-between gap-1.5 mb-1">
            <span className="text-[11px] font-black uppercase text-amber-950 flex items-center gap-1.5">
              <Zap size={13} className="text-amber-600 shrink-0" />
              <span>Small Orders (1–9)</span>
            </span>
            {activePipelineId === 'small_order' && (
              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-600 text-white uppercase">
                Active Tab
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-amber-900 tracking-tight">
                {totalSmall}
              </span>
              <span className="text-xs font-bold text-amber-700/80">orders</span>
            </div>
            {totalSmallValue > 0 && (
              <span className="text-xs font-black text-amber-800">
                ₹{totalSmallValue.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-amber-700 font-bold group-hover:underline">
            <span>Filter small deals</span>
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>

        {/* Total Pipeline Pipeline Health Card */}
        <div className="p-2.5 sm:p-3 rounded-xl border border-shadow-darker/20 bg-surface shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1.5 mb-1">
            <span className="text-[11px] font-black uppercase text-primary-dark flex items-center gap-1.5">
              <TrendingUp size={13} className="text-primary shrink-0" />
              <span>All Active Deals</span>
            </span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
              {activeStagesCount} active stages
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-primary-dark tracking-tight">
                {grandTotal}
              </span>
              <span className="text-xs font-bold text-secondary">total</span>
            </div>
            {grandTotalValue > 0 && (
              <span className="text-xs font-black text-primary">
                ₹{grandTotalValue.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-secondary font-bold">
            <span>Stage volume &amp; velocity</span>
            <span className="font-mono text-primary-dark font-extrabold">100% tracked</span>
          </div>
        </div>
      </div>

      {/* Stage-by-Stage Matrix Strip */}
      {!isCollapsed && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px] font-extrabold text-secondary px-0.5">
            <span className="flex items-center gap-1 text-primary-dark">
              <span>Stage Distribution Matrix</span>
              <span className="text-secondary font-normal">(Click any card to jump to board column)</span>
            </span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block" />
                <strong className="text-indigo-950">Bulk</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" />
                <strong className="text-emerald-950">Regular</strong>
              </span>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5 custom-sidebar-scrollbar snap-x">
            {displayedStats.map((stat, idx) => {
              const hasOrders = stat.totalCount > 0;
              const bulkPct =
                stat.totalCount > 0 ? Math.round((stat.bulkCount / stat.totalCount) * 100) : 0;
              const regularPct =
                stat.totalCount > 0
                  ? Math.round((stat.regularCount / stat.totalCount) * 100)
                  : 0;

              return (
                <div
                  key={stat.stageId}
                  onClick={() => onScrollToStage(stat.stageId)}
                  className={`p-2.5 rounded-xl border transition-all text-xs flex flex-col justify-between shrink-0 snap-start cursor-pointer group min-w-[170px] sm:min-w-[190px] ${
                    hasOrders
                      ? 'bg-surface hover:bg-surface/90 border-shadow-darker/30 hover:border-primary/50 shadow-neo-surface hover:shadow-md'
                      : 'bg-surface/40 border-shadow-darker/10 opacity-60 hover:opacity-100 hover:border-shadow-darker/25'
                  }`}
                  title={`Click to jump to ${stat.stageLabel} column on the board`}
                >
                  {/* Stage Label & Index */}
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="font-extrabold text-primary-dark truncate text-[11px] max-w-[130px] group-hover:text-primary transition-colors">
                      <span className="text-secondary/60 text-[10px] mr-1 font-mono">
                        {idx + 1}.
                      </span>
                      {stat.stageLabel}
                    </span>
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.2 rounded-full border ${
                        hasOrders
                          ? 'bg-primary/10 text-primary border-primary/25 font-mono'
                          : 'bg-shadow-darker/10 text-secondary border-shadow-darker/15 font-mono'
                      }`}
                    >
                      {stat.totalCount}
                    </span>
                  </div>

                  {/* Bulk vs Regular Dual Badges */}
                  <div className="grid grid-cols-2 gap-1.5 my-1">
                    {/* Bulk Pill */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPipeline('bulk_order');
                        onScrollToStage(stat.stageId);
                      }}
                      className={`py-1 px-1.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                        stat.bulkCount > 0
                          ? 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-950 font-black shadow-xs'
                          : 'bg-shadow-darker/5 border-shadow-darker/10 text-secondary/60 font-semibold'
                      }`}
                      title={`${stat.bulkCount} Bulk orders at ${stat.stageLabel}. Click to filter bulk.`}
                    >
                      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-indigo-800">
                        <span>Bulk</span>
                        <Package size={10} className="shrink-0 text-indigo-600" />
                      </div>
                      <span className="text-sm font-black mt-0.5 text-indigo-900 font-mono">
                        {stat.bulkCount}
                      </span>
                    </button>

                    {/* Regular Pill */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPipeline('regular_order');
                        onScrollToStage(stat.stageId);
                      }}
                      className={`py-1 px-1.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                        stat.regularCount > 0
                          ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-950 font-black shadow-xs'
                          : 'bg-shadow-darker/5 border-shadow-darker/10 text-secondary/60 font-semibold'
                      }`}
                      title={`${stat.regularCount} Regular orders at ${stat.stageLabel}. Click to filter regular.`}
                    >
                      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-emerald-800">
                        <span>Regular</span>
                        <Layers size={10} className="shrink-0 text-emerald-600" />
                      </div>
                      <span className="text-sm font-black mt-0.5 text-emerald-900 font-mono">
                        {stat.regularCount}
                      </span>
                    </button>
                  </div>

                  {/* Visual Proportion Bar (Ratio of Bulk vs Regular) */}
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1.5 w-full bg-shadow-darker/15 rounded-full overflow-hidden flex">
                      {bulkPct > 0 && (
                        <div
                          style={{ width: `${bulkPct}%` }}
                          className="h-full bg-indigo-600"
                          title={`Bulk: ${bulkPct}%`}
                        />
                      )}
                      {regularPct > 0 && (
                        <div
                          style={{ width: `${regularPct}%` }}
                          className="h-full bg-emerald-500"
                          title={`Regular: ${regularPct}%`}
                        />
                      )}
                      {stat.smallCount > 0 && (
                        <div
                          style={{
                            width: `${Math.round((stat.smallCount / stat.totalCount) * 100)}%`,
                          }}
                          className="h-full bg-amber-400"
                          title={`Small: ${stat.smallCount}`}
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[9px] font-bold text-secondary">
                      <span>{hasOrders ? `₹${stat.totalValue.toLocaleString('en-IN')}` : 'Idle'}</span>
                      <span className="text-primary font-extrabold group-hover:underline flex items-center gap-0.5">
                        <span>View</span>
                        <ArrowRight size={9} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

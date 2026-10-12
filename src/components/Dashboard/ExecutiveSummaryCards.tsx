import React from 'react';
import { 
  Users, 
  Layers, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle, 
  PhoneCall,
  ArrowUpRight,
  IndianRupee
} from 'lucide-react';
import type { DashboardMetrics } from '../../utils/dashboardMetrics';

export type DrillDownType = 
  | 'total_leads' 
  | 'active_orders' 
  | 'total_sales' 
  | 'payments_received' 
  | 'outstanding_amounts' 
  | 'pending_followups';

interface ExecutiveSummaryCardsProps {
  metrics: DashboardMetrics;
  onCardClick: (type: DrillDownType) => void;
}

export const ExecutiveSummaryCards: React.FC<ExecutiveSummaryCardsProps> = ({
  metrics,
  onCardClick
}) => {
  const cards = [
    {
      type: 'total_leads' as DrillDownType,
      title: 'Total Leads',
      description: 'Captured inquiries across channels',
      value: metrics.totalLeads.toLocaleString('en-IN'),
      icon: Users,
      accent: 'border-sky-500/30 text-sky-700 bg-sky-500/10',
      badge: 'All Channels',
      isCurrency: false
    },
    {
      type: 'active_orders' as DrillDownType,
      title: 'Active Orders',
      description: 'Shop floor production underway',
      value: metrics.activeOrders.toLocaleString('en-IN'),
      icon: Layers,
      accent: 'border-amber-500/30 text-amber-700 bg-amber-500/10',
      badge: 'In Production',
      isCurrency: false
    },
    {
      type: 'total_sales' as DrillDownType,
      title: 'Total Sales',
      description: 'Gross revenue for selected timeframe',
      value: `₹${metrics.totalSales.toLocaleString('en-IN')}`,
      icon: TrendingUp,
      accent: 'border-emerald-500/30 text-[#004D40] bg-emerald-500/10',
      badge: 'Gross Revenue',
      isCurrency: true
    },
    {
      type: 'payments_received' as DrillDownType,
      title: 'Payments Received',
      description: 'Cleared collections & realized cash flow',
      value: `₹${metrics.paymentsReceived.toLocaleString('en-IN')}`,
      icon: CheckCircle2,
      accent: 'border-teal-500/30 text-teal-800 bg-teal-500/10',
      badge: 'Cleared Cash',
      isCurrency: true
    },
    {
      type: 'outstanding_amounts' as DrillDownType,
      title: 'Outstanding Amounts',
      description: 'Pending client balances requiring follow-up',
      value: `₹${metrics.outstandingAmounts.toLocaleString('en-IN')}`,
      icon: AlertCircle,
      accent: 'border-rose-500/30 text-rose-700 bg-rose-500/10',
      badge: 'Pending Dues',
      isCurrency: true
    },
    {
      type: 'pending_followups' as DrillDownType,
      title: 'Pending Follow-ups',
      description: "Today's action items & urgent leads",
      value: metrics.pendingFollowups.toLocaleString('en-IN'),
      icon: PhoneCall,
      accent: 'border-purple-500/30 text-purple-700 bg-purple-500/10',
      badge: 'Action Needed',
      isCurrency: false
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.type}
            onClick={() => onCardClick(card.type)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onCardClick(card.type);
              }
            }}
            title={`Click to view underlying records for ${card.title}`}
            className="neo-card p-4 flex flex-col justify-between group cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-neo-raised relative overflow-hidden border border-shadow-darker/10"
          >
            {/* Header / Icon */}
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-wider line-clamp-1">
                {card.title}
              </span>
              <div className={`p-1.5 rounded-lg border transition-transform duration-200 group-hover:scale-110 ${card.accent}`}>
                <Icon size={16} />
              </div>
            </div>

            {/* Value */}
            <div className="my-2.5">
              <div className="text-xl font-black text-primary-dark tracking-tight break-words">
                {card.value}
              </div>
              <p className="text-[10px] text-secondary line-clamp-1 mt-0.5">
                {card.description}
              </p>
            </div>

            {/* Footer / Drill-down cue */}
            <div className="pt-2 border-t border-shadow-darker/10 flex items-center justify-between text-[10px]">
              <span className="font-semibold text-secondary">
                {card.badge}
              </span>
              <span className="text-primary font-bold inline-flex items-center gap-0.5 group-hover:underline">
                View <ArrowUpRight size={11} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

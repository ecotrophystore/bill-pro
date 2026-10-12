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
      accent: 'border-primary/20 text-primary-dark bg-primary/10',
      badge: 'All Channels',
      badgeStyle: 'bg-primary/10 text-primary-dark border-primary/20',
      isHighlight: false,
      isCurrency: false
    },
    {
      type: 'active_orders' as DrillDownType,
      title: 'Active Orders',
      description: 'Shop floor production underway',
      value: metrics.activeOrders.toLocaleString('en-IN'),
      icon: Layers,
      accent: 'border-amber-500/40 text-amber-900 bg-amber-400/20',
      badge: 'In Production',
      badgeStyle: 'bg-amber-400/20 text-amber-900 border-amber-500/30',
      isHighlight: true,
      isCurrency: false
    },
    {
      type: 'total_sales' as DrillDownType,
      title: 'Total Sales',
      description: 'Gross revenue for selected timeframe',
      value: `₹${metrics.totalSales.toLocaleString('en-IN')}`,
      icon: TrendingUp,
      accent: 'border-primary/30 text-primary-dark bg-primary/15',
      badge: 'Gross Revenue',
      badgeStyle: 'bg-primary/10 text-primary-dark border-primary/20',
      isHighlight: false,
      isCurrency: true
    },
    {
      type: 'payments_received' as DrillDownType,
      title: 'Payments Received',
      description: 'Cleared collections & realized cash flow',
      value: `₹${metrics.paymentsReceived.toLocaleString('en-IN')}`,
      icon: CheckCircle2,
      accent: 'border-emerald-600/30 text-emerald-900 bg-emerald-500/15',
      badge: 'Cleared Cash',
      badgeStyle: 'bg-emerald-500/10 text-emerald-900 border-emerald-600/20',
      isHighlight: false,
      isCurrency: true
    },
    {
      type: 'outstanding_amounts' as DrillDownType,
      title: 'Outstanding Amounts',
      description: 'Pending client balances requiring follow-up',
      value: `₹${metrics.outstandingAmounts.toLocaleString('en-IN')}`,
      icon: AlertCircle,
      accent: 'border-amber-500/40 text-amber-900 bg-amber-400/20',
      badge: 'Pending Dues',
      badgeStyle: 'bg-amber-400/20 text-amber-900 border-amber-500/30',
      isHighlight: true,
      isCurrency: true
    },
    {
      type: 'pending_followups' as DrillDownType,
      title: 'Pending Follow-ups',
      description: "Today's action items & urgent leads",
      value: metrics.pendingFollowups.toLocaleString('en-IN'),
      icon: PhoneCall,
      accent: 'border-primary/20 text-primary-dark bg-primary/10',
      badge: 'Action Needed',
      badgeStyle: 'bg-primary/10 text-primary-dark border-primary/20',
      isHighlight: false,
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
              <span className={`px-2 py-0.5 rounded-md font-semibold border ${card.badgeStyle}`}>
                {card.badge}
              </span>
              <span className={`font-bold inline-flex items-center gap-0.5 group-hover:underline ${card.isHighlight ? 'text-amber-800' : 'text-primary'}`}>
                View <ArrowUpRight size={11} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

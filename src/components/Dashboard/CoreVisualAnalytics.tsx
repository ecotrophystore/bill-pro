import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line
} from 'recharts';
import { 
  TrendingUp, 
  BarChart3, 
  Layers, 
  PieChart as PieChartIcon,
  ExternalLink,
  ShoppingBag,
  Receipt,
  ArrowDownRight
} from 'lucide-react';
import type { PurchaseExpensePoint, TrendGranularity, DateRangeBounds } from '../../utils/dashboardMetrics';
import { generatePurchaseExpenseTrends, getDateRangeBounds } from '../../utils/dashboardMetrics';

interface SalesTrendPoint {
  date: string;
  displayDate: string;
  sales: number;
  orders: number;
}

interface MonthlyPoint {
  month: string;
  displayMonth: string;
  revenue: number;
  orders: number;
}

interface PipelineStagePoint {
  stageId: string;
  stageName: string;
  count: number;
  color: string;
}

interface CoreVisualAnalyticsProps {
  salesTrends: SalesTrendPoint[];
  monthlyComparison: MonthlyPoint[];
  pipelineDistribution: PipelineStagePoint[];
  collectionsReceived: number;
  outstandingBalance: number;
  purchaseExpenseTrends?: PurchaseExpensePoint[];
  totalPurchases?: number;
  totalExpenses?: number;
  totalOutflow?: number;
  // Raw items for direct interactive granularity recalculation
  purchases?: any[];
  expenses?: any[];
  globalBounds?: DateRangeBounds;
  onStageClick?: (stageId: string) => void;
  onCollectionsClick?: () => void;
  onOutstandingClick?: () => void;
  onPurchasesClick?: () => void;
  onExpensesClick?: () => void;
}

const formatCurrency = (val: number) => {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
  return `₹${val}`;
};

export const CoreVisualAnalytics: React.FC<CoreVisualAnalyticsProps> = ({
  salesTrends,
  monthlyComparison,
  pipelineDistribution,
  collectionsReceived,
  outstandingBalance,
  purchaseExpenseTrends = [],
  totalPurchases = 0,
  totalExpenses = 0,
  totalOutflow = 0,
  purchases = [],
  expenses = [],
  globalBounds,
  onStageClick,
  onCollectionsClick,
  onOutstandingClick,
  onPurchasesClick,
  onExpensesClick
}) => {
  const navigate = useNavigate();

  // Separate granularity and custom range states for Purchases Graph
  const [purchaseGranularity, setPurchaseGranularity] = React.useState<TrendGranularity>('daily');
  const [purchaseCustomStart, setPurchaseCustomStart] = React.useState('');
  const [purchaseCustomEnd, setPurchaseCustomEnd] = React.useState('');
  const [showPurchaseCustom, setShowPurchaseCustom] = React.useState(false);

  // Separate granularity and custom range states for Expenses Graph
  const [expenseGranularity, setExpenseGranularity] = React.useState<TrendGranularity>('daily');
  const [expenseCustomStart, setExpenseCustomStart] = React.useState('');
  const [expenseCustomEnd, setExpenseCustomEnd] = React.useState('');
  const [showExpenseCustom, setShowExpenseCustom] = React.useState(false);

  // Compute reactive Purchase trends if raw data provided, else fallback to passed trends
  const effectiveBounds = React.useMemo(() => {
    return globalBounds || getDateRangeBounds('all');
  }, [globalBounds]);

  const computedPurchaseResult = React.useMemo(() => {
    if (purchases && purchases.length > 0) {
      return generatePurchaseExpenseTrends(
        purchases,
        [],
        effectiveBounds,
        purchaseGranularity,
        showPurchaseCustom ? purchaseCustomStart : undefined,
        showPurchaseCustom ? purchaseCustomEnd : undefined
      );
    }
    return { data: purchaseExpenseTrends, totalPurchases, totalExpenses: 0, totalOutflow: totalPurchases };
  }, [purchases, effectiveBounds, purchaseGranularity, showPurchaseCustom, purchaseCustomStart, purchaseCustomEnd, purchaseExpenseTrends, totalPurchases]);

  const computedExpenseResult = React.useMemo(() => {
    if (expenses && expenses.length > 0) {
      return generatePurchaseExpenseTrends(
        [],
        expenses,
        effectiveBounds,
        expenseGranularity,
        showExpenseCustom ? expenseCustomStart : undefined,
        showExpenseCustom ? expenseCustomEnd : undefined
      );
    }
    return { data: purchaseExpenseTrends, totalPurchases: 0, totalExpenses, totalOutflow: totalExpenses };
  }, [expenses, effectiveBounds, expenseGranularity, showExpenseCustom, expenseCustomStart, expenseCustomEnd, purchaseExpenseTrends, totalExpenses]);

  // Collections vs Outstanding Data
  const totalFinancials = collectionsReceived + outstandingBalance;
  const collectionPercentage = totalFinancials > 0 ? Math.round((collectionsReceived / totalFinancials) * 100) : 0;
  const outstandingPercentage = 100 - collectionPercentage;

  const ratioData = [
    { name: 'Cleared Collections', value: collectionsReceived, color: '#006766' },
    { name: 'Pending Balance', value: outstandingBalance, color: '#F59E0B' }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      {/* 1. Sales Trends Over Time */}
      <div className="neo-card p-5 border border-shadow-darker/10 flex flex-col justify-between">
        <div className="flex items-center justify-between pb-3 border-b border-shadow-darker/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary-dark">
              <TrendingUp size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-primary-dark">Sales Trends Over Time</h3>
              <p className="text-[11px] text-secondary">Daily revenue velocity & volume fluctuations</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark border border-primary/20">
            Revenue Curve
          </span>
        </div>

        <div className="h-64 w-full">
          {salesTrends.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-secondary">
              No sales data recorded in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#006766" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#006766" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2D9CD" />
                <XAxis 
                  dataKey="displayDate" 
                  tick={{ fontSize: 10, fill: '#607C7B' }} 
                  axisLine={{ stroke: '#D1C4B2' }}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 10, fill: '#607C7B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Revenue']}
                  labelFormatter={(lbl) => `Date: ${lbl}`}
                  contentStyle={{ backgroundColor: '#F3E9DD', borderRadius: '12px', border: '1px solid #D1C4B2', fontSize: '11px', boxShadow: '2px 2px 5px #D1C4B2' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#006766" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#salesGrad)" 
                  dot={{ r: 4, strokeWidth: 2, fill: '#F59E0B', stroke: '#006766' }}
                  activeDot={{ r: 6, stroke: '#004D40', strokeWidth: 2, fill: '#F59E0B' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 2. Monthly Sales & Orders (Dual-Axis Chart) */}
      <div className="neo-card p-5 border border-shadow-darker/10 flex flex-col justify-between">
        <div className="flex items-center justify-between pb-3 border-b border-shadow-darker/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary-dark">
              <BarChart3 size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-primary-dark">Monthly Sales & Orders</h3>
              <p className="text-[11px] text-secondary">Comparing revenue against order volume month-over-month</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-900 border border-amber-500/30">
            Dual-Axis
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyComparison} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2D9CD" />
              <XAxis 
                dataKey="displayMonth" 
                tick={{ fontSize: 10, fill: '#607C7B' }} 
                axisLine={{ stroke: '#D1C4B2' }}
                tickLine={false}
              />
              <YAxis 
                yAxisId="left" 
                tickFormatter={formatCurrency}
                tick={{ fontSize: 10, fill: '#607C7B' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                tick={{ fontSize: 10, fill: '#607C7B' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip 
                formatter={(val: any, name: any) => [
                  name === 'revenue' ? `₹${Number(val).toLocaleString('en-IN')}` : val,
                  name === 'revenue' ? 'Revenue' : 'Order Volume'
                ]}
                contentStyle={{ backgroundColor: '#F3E9DD', borderRadius: '12px', border: '1px solid #D1C4B2', fontSize: '11px', boxShadow: '2px 2px 5px #D1C4B2' }}
              />
              <Legend 
                verticalAlign="top" 
                align="right" 
                wrapperStyle={{ fontSize: '11px', paddingBottom: '6px' }}
                formatter={(val) => val === 'revenue' ? 'Sales (₹)' : 'Order Volume'}
              />
              <Bar 
                yAxisId="left" 
                dataKey="revenue" 
                fill="#006766" 
                radius={[6, 6, 0, 0]} 
                maxBarSize={36} 
              />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="orders" 
                stroke="#F59E0B" 
                strokeWidth={2.5} 
                dot={{ r: 3, fill: '#F59E0B' }} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Leads by Pipeline Stage */}
      <div className="neo-card p-5 border border-shadow-darker/10 flex flex-col justify-between">
        <div className="flex items-center justify-between pb-3 border-b border-shadow-darker/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary-dark">
              <Layers size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-primary-dark">Leads by Pipeline Stage</h3>
              <p className="text-[11px] text-secondary">Volume distributed across workflow & production gates</p>
            </div>
          </div>
          <span className="text-[10px] text-primary-dark font-medium px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">Click bar to drill down</span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={pipelineDistribution} 
              layout="vertical"
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2D9CD" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#607C7B' }} axisLine={false} tickLine={false} />
              <YAxis 
                type="category" 
                dataKey="stageName" 
                width={120} 
                tick={{ fontSize: 9.5, fill: '#004D40', fontWeight: 600 }} 
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                formatter={(val: any) => [`${val} lead(s)`, 'In Stage']}
                contentStyle={{ backgroundColor: '#F3E9DD', borderRadius: '12px', border: '1px solid #D1C4B2', fontSize: '11px', boxShadow: '2px 2px 5px #D1C4B2' }}
              />
              <Bar 
                dataKey="count" 
                radius={[0, 6, 6, 0]}
                onClick={(entry: any) => {
                  const targetId = entry?.stageId || entry?.payload?.stageId;
                  if (targetId && onStageClick) {
                    onStageClick(targetId);
                  }
                }}
                cursor="pointer"
              >
                {pipelineDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Collections vs. Outstanding (Ratio Chart) */}
      <div className="neo-card p-5 border border-shadow-darker/10 flex flex-col justify-between">
        <div className="flex items-center justify-between pb-3 border-b border-shadow-darker/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary-dark">
              <PieChartIcon size={16} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-primary-dark">Collections vs. Outstanding</h3>
              <p className="text-[11px] text-secondary">Collected revenue vs. pending client balance ratio</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary-dark border border-primary/20">
            {collectionPercentage}% Realized
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4 h-64">
          <div className="h-full w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ratioData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {ratioData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Amount']}
                  contentStyle={{ backgroundColor: '#F3E9DD', borderRadius: '12px', border: '1px solid #D1C4B2', fontSize: '11px', boxShadow: '2px 2px 5px #D1C4B2' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-primary-dark">{collectionPercentage}%</span>
              <span className="text-[9px] font-semibold text-secondary uppercase">Collected</span>
            </div>
          </div>

          <div className="space-y-3.5 pr-2">
            {/* Cleared Collections Tile (30% Green) */}
            <div 
              onClick={onCollectionsClick}
              role="button"
              className="p-3 rounded-xl bg-primary/10 border border-primary/20 cursor-pointer hover:bg-primary/15 transition-all shadow-xs"
            >
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-primary-dark flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block"></span>
                  Cleared Collections
                </span>
                <span className="text-[11px] font-bold text-primary">{collectionPercentage}%</span>
              </div>
              <div className="text-base font-black text-primary-dark mt-1">
                ₹{collectionsReceived.toLocaleString('en-IN')}
              </div>
            </div>

            {/* Pending Balance Tile (10% Yellow Accent) */}
            <div 
              onClick={onOutstandingClick}
              role="button"
              className="p-3 rounded-xl bg-amber-400/20 border border-amber-500/30 cursor-pointer hover:bg-amber-400/25 transition-all shadow-xs"
            >
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-amber-950 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                  Pending Balances
                </span>
                <span className="text-[11px] font-bold text-amber-800">{outstandingPercentage}%</span>
              </div>
              <div className="text-base font-black text-amber-950 mt-1">
                ₹{outstandingBalance.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Separate Vendor Purchases Graph with Daily / Monthly / Yearly / Custom Switch */}
      <div className="neo-card p-5 border border-shadow-darker/10 flex flex-col justify-between">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-shadow-darker/10 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary-dark">
                <ShoppingBag size={16} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-primary-dark">Vendor Purchases Trend</h3>
                <p className="text-[11px] text-secondary">Procurement spending ({purchaseGranularity} view)</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* Granularity Selector */}
              <div className="inline-flex bg-surface p-0.5 rounded-lg border border-shadow-darker/10">
                {(['daily', 'monthly', 'yearly'] as TrendGranularity[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setPurchaseGranularity(g);
                      setShowPurchaseCustom(false);
                    }}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md capitalize transition-all ${
                      purchaseGranularity === g && !showPurchaseCustom
                        ? 'bg-primary text-white shadow-xs'
                        : 'text-secondary hover:text-primary-dark'
                    }`}
                  >
                    {g}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowPurchaseCustom(!showPurchaseCustom)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                    showPurchaseCustom
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-secondary hover:text-primary-dark'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Total Summary Badge (Yellow 10% Accent) */}
              <div 
                onClick={() => onPurchasesClick ? onPurchasesClick() : navigate('/purchases')}
                role="button"
                className="px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-900 border border-amber-500/30 text-xs font-bold hover:bg-amber-400/30 cursor-pointer transition-colors"
                title="Click to view underlying purchase records"
              >
                ₹{computedPurchaseResult.totalPurchases.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          {/* Custom Date Filter Row if active */}
          {showPurchaseCustom && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-surface rounded-lg border border-shadow-darker/10 animate-fade-in text-xs">
              <span className="font-bold text-primary-dark text-[11px]">Range:</span>
              <input 
                type="date" 
                value={purchaseCustomStart}
                onChange={e => setPurchaseCustomStart(e.target.value)}
                className="neo-input text-xs !py-1 !px-2 bg-white"
                title="Purchase Start Date"
              />
              <span className="text-secondary font-bold text-xs">to</span>
              <input 
                type="date"
                value={purchaseCustomEnd}
                onChange={e => setPurchaseCustomEnd(e.target.value)}
                className="neo-input text-xs !py-1 !px-2 bg-white"
                title="Purchase End Date"
              />
            </div>
          )}
        </div>

        <div className="h-64 w-full">
          {computedPurchaseResult.data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-secondary">
              No purchase data recorded in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={computedPurchaseResult.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="purchasesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#006766" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#006766" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2D9CD" />
                <XAxis 
                  dataKey="displayKey" 
                  tick={{ fontSize: 10, fill: '#607C7B' }} 
                  axisLine={{ stroke: '#D1C4B2' }}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 10, fill: '#607C7B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Vendor Purchases']}
                  labelFormatter={(lbl) => `Time: ${lbl}`}
                  contentStyle={{ backgroundColor: '#F3E9DD', borderRadius: '12px', border: '1px solid #D1C4B2', fontSize: '11px', boxShadow: '2px 2px 5px #D1C4B2' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="purchases" 
                  stroke="#006766" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#purchasesGrad)" 
                  dot={{ r: 4, strokeWidth: 2, fill: '#F59E0B', stroke: '#006766' }}
                  activeDot={{ r: 6, stroke: '#004D40', strokeWidth: 2, fill: '#F59E0B' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 6. Separate Operational Expenses Graph with Daily / Monthly / Yearly / Custom Switch */}
      <div className="neo-card p-5 border border-shadow-darker/10 flex flex-col justify-between">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-shadow-darker/10 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary-dark">
                <Receipt size={16} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-primary-dark">Operational Expenses Trend</h3>
                <p className="text-[11px] text-secondary">Shop running costs ({expenseGranularity} view)</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Granularity Selector */}
              <div className="inline-flex bg-surface p-0.5 rounded-lg border border-shadow-darker/10">
                {(['daily', 'monthly', 'yearly'] as TrendGranularity[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setExpenseGranularity(g);
                      setShowExpenseCustom(false);
                    }}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md capitalize transition-all ${
                      expenseGranularity === g && !showExpenseCustom
                        ? 'bg-primary text-white shadow-xs'
                        : 'text-secondary hover:text-primary-dark'
                    }`}
                  >
                    {g}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowExpenseCustom(!showExpenseCustom)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                    showExpenseCustom
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-secondary hover:text-primary-dark'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Total Summary Badge (Yellow 10% Accent) */}
              <div 
                onClick={() => navigate('/expense')}
                role="button"
                className="px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-900 border border-amber-500/30 text-xs font-bold hover:bg-amber-400/30 cursor-pointer transition-colors"
                title="View Expense Ledger"
              >
                ₹{computedExpenseResult.totalExpenses.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          {/* Custom Date Filter Row if active */}
          {showExpenseCustom && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-surface rounded-lg border border-shadow-darker/10 animate-fade-in text-xs">
              <span className="font-bold text-primary-dark text-[11px]">Range:</span>
              <input 
                type="date"
                value={expenseCustomStart}
                onChange={e => setExpenseCustomStart(e.target.value)}
                className="neo-input text-xs !py-1 !px-2 bg-white"
                title="Expense Start Date"
              />
              <span className="text-secondary font-bold text-xs">to</span>
              <input 
                type="date"
                value={expenseCustomEnd}
                onChange={e => setExpenseCustomEnd(e.target.value)}
                className="neo-input text-xs !py-1 !px-2 bg-white"
                title="Expense End Date"
              />
            </div>
          )}
        </div>

        <div className="h-64 w-full">
          {computedExpenseResult.data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-secondary">
              No expense data recorded in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={computedExpenseResult.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="expensesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#006766" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#006766" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2D9CD" />
                <XAxis 
                  dataKey="displayKey" 
                  tick={{ fontSize: 10, fill: '#607C7B' }} 
                  axisLine={{ stroke: '#D1C4B2' }}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 10, fill: '#607C7B' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Operating Expenses']}
                  labelFormatter={(lbl) => `Time: ${lbl}`}
                  contentStyle={{ backgroundColor: '#F3E9DD', borderRadius: '12px', border: '1px solid #D1C4B2', fontSize: '11px', boxShadow: '2px 2px 5px #D1C4B2' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="expenses" 
                  stroke="#006766" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#expensesGrad)" 
                  dot={{ r: 4, strokeWidth: 2, fill: '#F59E0B', stroke: '#006766' }}
                  activeDot={{ r: 6, stroke: '#004D40', strokeWidth: 2, fill: '#F59E0B' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { 
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  LineChart, Line 
} from 'recharts';
import { Loader2, TrendingUp, DollarSign, ShoppingCart } from 'lucide-react';
import type { Purchase } from '../types';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658'];

export default function PurchaseAnalytics() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'purchases'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Purchase));
      setPurchases(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-primary-dark" size={48} />
      </div>
    );
  }

  // --- Calculate Analytics ---
  
  // 1. Total Spend
  const totalSpend = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);

  // 2. Spend by Category
  const categoryMap: Record<string, number> = {};
  purchases.forEach(p => {
    const cat = p.category || 'Uncategorized';
    categoryMap[cat] = (categoryMap[cat] || 0) + (p.grandTotal || 0);
  });
  const categoryData = Object.keys(categoryMap).map(key => ({
    name: key,
    value: categoryMap[key]
  }));

  // 3. Top Vendors
  const vendorMap: Record<string, number> = {};
  purchases.forEach(p => {
    const vendorName = p.vendor?.name || 'Unknown Vendor';
    vendorMap[vendorName] = (vendorMap[vendorName] || 0) + (p.grandTotal || 0);
  });
  const vendorData = Object.keys(vendorMap)
    .map(key => ({ name: key, total: vendorMap[key] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5); // Top 5

  // 4. Monthly Trends (Last 6 Months)
  const monthMap: Record<string, number> = {};
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  // Initialize last 6 months to 0
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthMap[`${monthNames[d.getMonth()]} ${d.getFullYear()}`] = 0;
  }

  purchases.forEach(p => {
    if (!p.createdAt) return;
    const date = new Date((p.createdAt as any).seconds ? (p.createdAt as any).seconds * 1000 : p.createdAt);
    const monthKey = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    if (monthMap[monthKey] !== undefined) {
      monthMap[monthKey] += (p.grandTotal || 0);
    }
  });

  const trendData = Object.keys(monthMap).map(key => ({
    month: key,
    spend: monthMap[key]
  }));

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12 p-4">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Purchase Analytics</h1>
        <p className="text-secondary mt-1">Deep dive into your company spending patterns.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="neo-card flex flex-col justify-between h-32 bg-transparent">
          <div className="flex justify-between items-start">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Total Lifetime Spend</span>
            <DollarSign size={18} className="text-primary" />
          </div>
          <span className="text-3xl font-black text-primary-dark tracking-tight">
            ₹ {totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="neo-card flex flex-col justify-between h-32 bg-transparent">
          <div className="flex justify-between items-start">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Total Purchases</span>
            <ShoppingCart size={18} className="text-primary" />
          </div>
          <span className="text-3xl font-black text-primary-dark tracking-tight">
            {purchases.length}
          </span>
        </div>

        <div className="neo-card flex flex-col justify-between h-32 bg-transparent">
          <div className="flex justify-between items-start">
            <span className="text-secondary font-semibold text-sm uppercase tracking-wider">Avg Spend / Purchase</span>
            <TrendingUp size={18} className="text-primary" />
          </div>
          <span className="text-3xl font-black text-primary-dark tracking-tight">
            ₹ {purchases.length > 0 ? (totalSpend / purchases.length).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}
          </span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Spend By Category (Pie Chart) */}
        <div className="neo-card flex flex-col h-[400px]">
          <h3 className="font-bold text-lg text-primary-dark mb-4 border-b pb-2">Spend by Category</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `₹ ${value.toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Vendors (Bar Chart) */}
        <div className="neo-card flex flex-col h-[400px]">
          <h3 className="font-bold text-lg text-primary-dark mb-4 border-b pb-2">Top 5 Vendors</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendorData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{fontSize: 12}} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tickFormatter={(val) => `₹${val/1000}k`} />
                <Tooltip formatter={(value: number) => `₹ ${value.toLocaleString()}`} cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                <Bar dataKey="total" fill="#00C49F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Trend (Line Chart) */}
        <div className="neo-card lg:col-span-2 flex flex-col h-[400px]">
          <h3 className="font-bold text-lg text-primary-dark mb-4 border-b pb-2">Monthly Spend Trend (Last 6 Months)</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(val) => `₹${val/1000}k`} />
                <Tooltip formatter={(value: number) => `₹ ${value.toLocaleString()}`} />
                <Line type="monotone" dataKey="spend" stroke="#0088FE" strokeWidth={3} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

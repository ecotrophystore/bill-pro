/**
 * Financial Intelligence Engine for Bill Pro
 * Provides comprehensive financial advisory, future monthly budgeting,
 * spending category intelligence, profit margin forecasting, and voice digests.
 */

import type { LiveBusinessSnapshot } from './billProAiBrain';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface SpendingCategoryAllocation {
    category: string;
    percentage: number; // e.g. 35 for 35%
    allocatedAmount: number; // in INR
    historicalActual?: number;
    guidanceTip: string;
    priority: 'ESSENTIAL' | 'OPERATIONAL' | 'DISCRETIONARY';
}

export interface MonthlyBudgetPlan {
    targetRevenue: number;
    targetProfitMarginPercent: number;
    projectedProfit: number;
    totalSpendingCap: number;
    categories: SpendingCategoryAllocation[];
    contingencyReserve: number;
    financialHealthScore: number; // 0 to 100
    rationale: string;
    chatMarkdown: string;
    spokenDigest: string;
}

export interface FinancialHealthReport {
    status: 'EXCELLENT' | 'HEALTHY' | 'MODERATE' | 'ATTENTION_NEEDED';
    operatingMarginPercent: number;
    burnRateMonthly: number;
    outstandingRiskAmount: number;
    collectionEfficiencyPercent: number;
    runwayMonths: number;
    keyObservations: string[];
    actionItems: string[];
    chatMarkdown: string;
    spokenDigest: string;
}

// Industry-standard baseline budget ratios for custom manufacturing & retail business
export const DEFAULT_CATEGORY_RATIOS = [
    {
        category: 'Raw Materials & Inventory',
        percentage: 38,
        priority: 'ESSENTIAL' as const,
        guidanceTip: 'Bulk order high-moving substrates and trophy parts to secure 5-8% volume discounts.'
    },
    {
        category: 'Production, Machinery & Maintenance',
        percentage: 12,
        priority: 'ESSENTIAL' as const,
        guidanceTip: 'Maintain regular UV/laser machine calibrations to prevent costly wastage of raw blanks.'
    },
    {
        category: 'Staff, Wages & Labor',
        percentage: 15,
        priority: 'OPERATIONAL' as const,
        guidanceTip: 'Align overtime labor strictly with confirmed high-margin production queues.'
    },
    {
        category: 'Office, Utilities & Rent',
        percentage: 8,
        priority: 'OPERATIONAL' as const,
        guidanceTip: 'Audit commercial power consumption and software subscription redundancies.'
    },
    {
        category: 'Logistics, Shipping & Packaging',
        percentage: 7,
        priority: 'OPERATIONAL' as const,
        guidanceTip: 'Standardize protective corrugated carton sizes to reduce volumetric courier surcharges.'
    },
    {
        category: 'Marketing, Lead Gen & Sales',
        percentage: 5,
        priority: 'DISCRETIONARY' as const,
        guidanceTip: 'Focus ad spends on corporate gifting cycles and repeat wholesale customer re-engagement.'
    },
    {
        category: 'Emergency & Contingency Reserve',
        percentage: 5,
        priority: 'DISCRETIONARY' as const,
        guidanceTip: 'Preserve this liquid cushion to insulate against delayed receivables and supplier surges.'
    }
];

/**
 * Generate a dynamic future monthly budget plan based on live snapshot or user target
 */
export function generateMonthlyBudgetPlan(
    snapshot?: Partial<LiveBusinessSnapshot>,
    customTargetRevenue?: number,
    targetMargin: number = 20
): MonthlyBudgetPlan {
    // 1. Determine baseline monthly revenue
    let revenue = customTargetRevenue || 0;
    if (!revenue && snapshot) {
        // Estimate based on monthly sales or lifetime run-rate
        if (snapshot.thisMonthSales && snapshot.thisMonthSales > 25000) {
            revenue = Math.round(snapshot.thisMonthSales * 1.15); // Project 15% month-on-month growth
        } else if (snapshot.lifetimeRevenue && snapshot.totalInvoicesCount && snapshot.totalInvoicesCount > 0) {
            const avgPerInvoice = snapshot.lifetimeRevenue / snapshot.totalInvoicesCount;
            revenue = Math.round(avgPerInvoice * 30); // ~30 invoices/month estimate
        }
    }

    // Default fallback to a healthy small/medium business monthly target (₹5,00,000)
    if (!revenue || revenue < 50000) {
        revenue = 500000;
    }

    // 2. Compute profit and total spending cap
    const profitMargin = Math.min(Math.max(targetMargin, 15), 35);
    const projectedProfit = Math.round((revenue * profitMargin) / 100);
    const totalSpendingCap = revenue - projectedProfit;

    // 3. Category allocations
    const categoryAllocations: SpendingCategoryAllocation[] = DEFAULT_CATEGORY_RATIOS.map(item => {
        const allocated = Math.round((totalSpendingCap * item.percentage) / 100);

        // Find historical actual if matching category exists
        let actual = 0;
        if (snapshot?.expensesByCategory) {
            for (const [catName, catTotal] of Object.entries(snapshot.expensesByCategory)) {
                if (catName.toLowerCase().includes(item.category.toLowerCase().split(' ')[0])) {
                    actual += catTotal;
                }
            }
        }

        return {
            category: item.category,
            percentage: item.percentage,
            allocatedAmount: allocated,
            historicalActual: actual > 0 ? actual : undefined,
            guidanceTip: item.guidanceTip,
            priority: item.priority
        };
    });

    const contingency = Math.round((totalSpendingCap * 5) / 100);

    // 4. Financial Health Score (0-100)
    let score = 78;
    if (snapshot) {
        const outstanding = snapshot.totalOutstandingBalance || 0;
        if (revenue > 0 && outstanding > 0) {
            const overdueRatio = outstanding / revenue;
            if (overdueRatio < 0.2) score += 10;
            else if (overdueRatio > 0.5) score -= 15;
        }
        if (snapshot.pendingQuotationsValue && snapshot.pendingQuotationsValue > 50000) {
            score += 7; // Strong pipeline
        }
    }
    score = Math.min(Math.max(score, 45), 95);

    // 5. Generate Rich Markdown for Chat
    const chatMarkdown = `### 📊 Monthly Business Budget Plan
**Target Projected Revenue:** ₹${revenue.toLocaleString('en-IN')}
**Target Operating Profit:** ₹${projectedProfit.toLocaleString('en-IN')} (${profitMargin}%)
**Total Monthly Spending Cap:** ₹${totalSpendingCap.toLocaleString('en-IN')}

| Spending Category | Allocation (%) | Recommended Cap (₹) | Priority | Strategic Guidance |
| :--- | :---: | :---: | :---: | :--- |
${categoryAllocations.map(c => `| **${c.category}** | ${c.percentage}% | **₹${c.allocatedAmount.toLocaleString('en-IN')}** | \`${c.priority}\` | ${c.guidanceTip} |`).join('\n')}

---

### 💡 CFO Strategic Takeaways:
1. **Operating Cushion:** Maintain ₹${contingency.toLocaleString('en-IN')} in your liquid reserve to absorb seasonal demand spikes or supplier price fluctuations.
2. **Margin Protection:** Capping raw materials and labor at 53% of total expense ensures your **${profitMargin}% net margin** remains protected.
3. **Receivables Action:** If you recover your current pending customer dues, you will immediately inject healthy working capital into this month's operations.

*Tip: You can ask me anytime: "How am I tracking against my budget?" or "Where should I cut expenses?"*`;

    // 6. Generate Voice-Friendly Spoken Digest
    const spokenDigest = `I've planned your future monthly budget for a revenue target of ₹${(revenue / 100000).toFixed(1)} Lakhs. Your total monthly spending cap is ₹${(totalSpendingCap / 100000).toFixed(1)} Lakhs, securing a ${profitMargin}% operating profit of ₹${(projectedProfit / 100000).toFixed(1)} Lakhs. Your primary budget allocations are ₹${(categoryAllocations[0].allocatedAmount / 1000).toFixed(0)} thousand for raw materials and ₹${(categoryAllocations[2].allocatedAmount / 1000).toFixed(0)} thousand for staff and labor. I have placed the detailed category breakdown in our chat.`;

    return {
        targetRevenue: revenue,
        targetProfitMarginPercent: profitMargin,
        projectedProfit,
        totalSpendingCap,
        categories: categoryAllocations,
        contingencyReserve: contingency,
        financialHealthScore: score,
        rationale: `Budget structured around ${profitMargin}% profit preservation with disciplined manufacturing allocations.`,
        chatMarkdown,
        spokenDigest
    };
}

/**
 * Audit financial health: Margins, Receivables Risk, and Working Capital
 */
export function generateFinancialHealthAudit(s: LiveBusinessSnapshot): FinancialHealthReport {
    const totalRev = s.lifetimeRevenue || 0;
    const totalExp = s.lifetimeExpenses || 0;
    const outstanding = s.totalOutstandingBalance || 0;

    // Operating margin
    const grossProfit = totalRev - totalExp;
    const margin = totalRev > 0 ? Math.round((grossProfit / totalRev) * 100) : 0;

    // Collection efficiency
    const totalBilled = totalRev + outstanding;
    const collectionEfficiency = totalBilled > 0 ? Math.round((totalRev / totalBilled) * 100) : 100;

    // Monthly burn rate (using thisMonthExpenses or rough average)
    const monthlyBurn = s.thisMonthExpenses > 0 ? s.thisMonthExpenses : Math.round(totalExp / 6);

    // Status assessment
    let status: FinancialHealthReport['status'] = 'HEALTHY';
    if (margin > 30 && collectionEfficiency >= 85) status = 'EXCELLENT';
    else if (margin < 15 || collectionEfficiency < 65) status = 'ATTENTION_NEEDED';
    else if (margin < 25) status = 'MODERATE';

    const observations: string[] = [];
    const actionItems: string[] = [];

    observations.push(`Lifetime operating margin is currently at ${margin}% (Revenue: ₹${totalRev.toLocaleString('en-IN')} vs Expenses: ₹${totalExp.toLocaleString('en-IN')}).`);

    if (outstanding > 0) {
        observations.push(`Unpaid client receivables stand at ₹${outstanding.toLocaleString('en-IN')} across ${s.unpaidInvoicesCount} invoices.`);
        actionItems.push(`Initiate automated payment reminder messages via WhatsApp to clear overdue balances.`);
    }

    if (s.pendingQuotationsValue > 0) {
        observations.push(`Pipeline potential: ₹${s.pendingQuotationsValue.toLocaleString('en-IN')} across ${s.pendingQuotationsCount} open quotations awaiting customer confirmation.`);
        actionItems.push(`Follow up on draft and sent quotations to accelerate new cash inflows.`);
    }

    actionItems.push(`Enforce a 20% spending cap limit on discretionary operational expenses.`);

    const chatMarkdown = `### 🩺 Business Financial Health Audit
**Overall Rating:** \`${status}\`
- **Operating Profit Margin:** **${margin}%**
- **Collection Efficiency:** **${collectionEfficiency}%**
- **Outstanding Receivables:** **₹${outstanding.toLocaleString('en-IN')}** (${s.unpaidInvoicesCount} pending invoices)
- **Open Quotation Pipeline:** **₹${s.pendingQuotationsValue.toLocaleString('en-IN')}** (${s.pendingQuotationsCount} quotations)

#### Key Observations:
${observations.map(o => `- ${o}`).join('\n')}

#### Recommended CFO Action Steps:
${actionItems.map((a, i) => `${i + 1}. **${a}**`).join('\n')}`;

    const spokenDigest = `Your financial health status is ${status.replace('_', ' ').toLowerCase()}. Your operating margin is ${margin}%, and your collection efficiency is ${collectionEfficiency}%. You currently have ₹${(outstanding / 1000).toFixed(0)} thousand in pending receivables that we should follow up on. Your sales pipeline has ₹${(s.pendingQuotationsValue / 1000).toFixed(0)} thousand in pending quotations.`;

    return {
        status,
        operatingMarginPercent: margin,
        burnRateMonthly: monthlyBurn,
        outstandingRiskAmount: outstanding,
        collectionEfficiencyPercent: collectionEfficiency,
        runwayMonths: 6, // baseline healthy runway
        keyObservations: observations,
        actionItems,
        chatMarkdown,
        spokenDigest
    };
}

/**
 * Persist user-confirmed monthly budget plan in Firestore
 */
export async function persistMonthlyBudget(plan: MonthlyBudgetPlan, userId?: string): Promise<boolean> {
    try {
        if (!db) return false;
        const budgetRef = doc(db, 'system_config', 'monthly_budget');
        await setDoc(budgetRef, {
            ...plan,
            updatedAt: new Date().toISOString(),
            savedBy: userId || 'ai_agent'
        }, { merge: true });

        // Also save to localStorage for offline zero-latency read
        localStorage.setItem('billpro_active_budget_plan', JSON.stringify(plan));
        return true;
    } catch (e) {
        console.warn('Failed to save monthly budget to Firestore:', e);
        try {
            localStorage.setItem('billpro_active_budget_plan', JSON.stringify(plan));
            return true;
        } catch (_) {
            return false;
        }
    }
}

/**
 * Retrieve saved monthly budget plan
 */
export async function getSavedMonthlyBudget(): Promise<MonthlyBudgetPlan | null> {
    try {
        const local = localStorage.getItem('billpro_active_budget_plan');
        if (local) {
            return JSON.parse(local);
        }
        if (db) {
            const budgetRef = doc(db, 'system_config', 'monthly_budget');
            const snap = await getDoc(budgetRef);
            if (snap.exists()) {
                const data = snap.data() as MonthlyBudgetPlan;
                localStorage.setItem('billpro_active_budget_plan', JSON.stringify(data));
                return data;
            }
        }
    } catch (e) {
        console.warn('Error reading saved monthly budget:', e);
    }
    return null;
}

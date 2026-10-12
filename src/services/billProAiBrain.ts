import { collection, getDocs, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getApiKey } from './ai';

function getTimestampMs(val: any): number {
    if (!val) return 0;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (typeof val.seconds === 'number') return val.seconds * 1000;
    if (val instanceof Date) return val.getTime();
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const parsed = Date.parse(val);
        if (!isNaN(parsed)) return parsed;
    }
    return 0;
}

export interface LiveBusinessSnapshot {
    // Sales & Invoices
    yesterdaySales: number;
    yesterdayInvoicesCount: number;
    todaySales: number;
    todayInvoicesCount: number;
    thisMonthSales: number;
    thisMonthInvoicesCount: number;
    lifetimeRevenue: number;
    totalInvoicesCount: number;
    unpaidInvoicesCount: number;
    totalOutstandingBalance: number;
    recentInvoices: Array<{ number: string; customer: string; amount: number; status: string; date: string }>;

    // Quotations
    totalQuotationsCount: number;
    yesterdayQuotationsCount: number;
    todayQuotationsCount: number;
    pendingQuotationsCount: number;
    pendingQuotationsValue: number;
    acceptedQuotationsCount: number;
    recentQuotations: Array<{ number: string; customer: string; amount: number; status: string; date: string }>;

    // Leads & CRM
    totalLeadsCount: number;
    yesterdayLeadsCount: number;
    todayLeadsCount: number;
    highPriorityLeadsCount: number;
    leadsByStage: Record<string, number>;
    recentLeads: Array<{ name: string; company?: string; stage: string; phone?: string }>;

    // Expenses
    yesterdayExpenses: number;
    todayExpenses: number;
    thisMonthExpenses: number;
    lifetimeExpenses: number;
    recentExpenses: Array<{ amount: number; category: string; description: string; date: string }>;

    // Products & Stock
    totalProductsCount: number;
    lowStockProductsCount: number;
    lowStockProducts: Array<{ name: string; stock: number }>;
    topSellingProduct: string;

    // Customers
    totalCustomersCount: number;
    recentCustomers: string[];

    // Cash Memos
    totalCashMemosCount: number;
    todayCashMemosCount: number;
}

/**
 * Collect live business metrics across all Firestore collections
 */
export async function getLiveBusinessSnapshot(): Promise<LiveBusinessSnapshot> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const snapshot: LiveBusinessSnapshot = {
        yesterdaySales: 0,
        yesterdayInvoicesCount: 0,
        todaySales: 0,
        todayInvoicesCount: 0,
        thisMonthSales: 0,
        thisMonthInvoicesCount: 0,
        lifetimeRevenue: 0,
        totalInvoicesCount: 0,
        unpaidInvoicesCount: 0,
        totalOutstandingBalance: 0,
        recentInvoices: [],

        totalQuotationsCount: 0,
        yesterdayQuotationsCount: 0,
        todayQuotationsCount: 0,
        pendingQuotationsCount: 0,
        pendingQuotationsValue: 0,
        acceptedQuotationsCount: 0,
        recentQuotations: [],

        totalLeadsCount: 0,
        yesterdayLeadsCount: 0,
        todayLeadsCount: 0,
        highPriorityLeadsCount: 0,
        leadsByStage: {},
        recentLeads: [],

        yesterdayExpenses: 0,
        todayExpenses: 0,
        thisMonthExpenses: 0,
        lifetimeExpenses: 0,
        recentExpenses: [],

        totalProductsCount: 0,
        lowStockProductsCount: 0,
        lowStockProducts: [],
        topSellingProduct: 'None',

        totalCustomersCount: 0,
        recentCustomers: [],

        totalCashMemosCount: 0,
        todayCashMemosCount: 0
    };

    if (!db) return snapshot;

    const [
        invoicesSnap,
        quotationsSnap,
        leadsSnap,
        expensesSnap,
        productsSnap,
        customersSnap,
        cashMemosSnap
    ] = await Promise.all([
        getDocs(collection(db, 'invoices')).catch(() => null),
        getDocs(collection(db, 'quotations')).catch(() => null),
        getDocs(collection(db, 'leads')).catch(() => null),
        getDocs(collection(db, 'expenses')).catch(() => null),
        getDocs(collection(db, 'products')).catch(() => null),
        getDocs(collection(db, 'customers')).catch(() => null),
        getDocs(collection(db, 'cash_memos')).catch(() => null)
    ]);

    // 1. Process Invoices
    if (invoicesSnap) {
        snapshot.totalInvoicesCount = invoicesSnap.size;
        const productSalesCount: Record<string, number> = {};

        invoicesSnap.forEach(d => {
            const data = d.data() as any;
            const amt = Number(data.grand_total ?? data.total ?? data.subtotal ?? 0);
            const balance = Number(data.balance_amount ?? 0);
            const time = getTimestampMs(data.created_at || data.date);

            snapshot.lifetimeRevenue += amt;

            if (data.payment_status === 'unpaid' || data.payment_status === 'partial' || balance > 0) {
                snapshot.unpaidInvoicesCount += 1;
                snapshot.totalOutstandingBalance += balance > 0 ? balance : amt;
            }

            if (time >= yesterdayStart && time < todayStart) {
                snapshot.yesterdaySales += amt;
                snapshot.yesterdayInvoicesCount += 1;
            } else if (time >= todayStart) {
                snapshot.todaySales += amt;
                snapshot.todayInvoicesCount += 1;
            }

            if (time >= monthStart) {
                snapshot.thisMonthSales += amt;
                snapshot.thisMonthInvoicesCount += 1;
            }

            (data.items || []).forEach((item: any) => {
                const name = item.description || item.name || 'Item';
                productSalesCount[name] = (productSalesCount[name] || 0) + (Number(item.quantity) || 1);
            });

            if (snapshot.recentInvoices.length < 5) {
                snapshot.recentInvoices.push({
                    number: data.number || data.invoice_number || d.id,
                    customer: data.customer_name || 'Customer',
                    amount: amt,
                    status: data.payment_status || data.status || 'finalized',
                    date: time ? new Date(time).toLocaleDateString() : 'N/A'
                });
            }
        });

        let topCount = 0;
        for (const [pName, count] of Object.entries(productSalesCount)) {
            if (count > topCount) {
                topCount = count;
                snapshot.topSellingProduct = `${pName} (${count} units)`;
            }
        }
    }

    // 2. Process Quotations
    if (quotationsSnap) {
        snapshot.totalQuotationsCount = quotationsSnap.size;
        quotationsSnap.forEach(d => {
            const data = d.data() as any;
            const amt = Number(data.grand_total ?? data.total ?? data.subtotal ?? 0);
            const time = getTimestampMs(data.created_at || data.date);
            const status = (data.status || 'draft').toLowerCase();

            if (status === 'pending' || status === 'draft' || status === 'sent') {
                snapshot.pendingQuotationsCount += 1;
                snapshot.pendingQuotationsValue += amt;
            } else if (status === 'accepted' || status === 'converted') {
                snapshot.acceptedQuotationsCount += 1;
            }

            if (time >= yesterdayStart && time < todayStart) {
                snapshot.yesterdayQuotationsCount += 1;
            } else if (time >= todayStart) {
                snapshot.todayQuotationsCount += 1;
            }

            if (snapshot.recentQuotations.length < 5) {
                snapshot.recentQuotations.push({
                    number: data.number || d.id,
                    customer: data.customer_name || 'Customer',
                    amount: amt,
                    status: data.status || 'draft',
                    date: time ? new Date(time).toLocaleDateString() : 'N/A'
                });
            }
        });
    }

    // 3. Process Leads
    if (leadsSnap) {
        snapshot.totalLeadsCount = leadsSnap.size;
        leadsSnap.forEach(d => {
            const data = d.data() as any;
            const time = getTimestampMs(data.created_at || data.date);
            const stage = data.status || data.stage || 'New';
            snapshot.leadsByStage[stage] = (snapshot.leadsByStage[stage] || 0) + 1;

            if (data.priority === 'HIGH' || data.priority === 'high' || (data.quantity && data.quantity >= 50)) {
                snapshot.highPriorityLeadsCount += 1;
            }

            if (time >= yesterdayStart && time < todayStart) {
                snapshot.yesterdayLeadsCount += 1;
            } else if (time >= todayStart) {
                snapshot.todayLeadsCount += 1;
            }

            if (snapshot.recentLeads.length < 5) {
                snapshot.recentLeads.push({
                    name: data.name || 'Lead',
                    company: data.company_name,
                    stage: stage,
                    phone: data.phone
                });
            }
        });
    }

    // 4. Process Expenses
    if (expensesSnap) {
        expensesSnap.forEach(d => {
            const data = d.data() as any;
            const amt = Number(data.amount ?? data.paid ?? data.requested ?? 0);
            const time = getTimestampMs(data.date || data.created_at);

            snapshot.lifetimeExpenses += amt;

            if (time >= yesterdayStart && time < todayStart) {
                snapshot.yesterdayExpenses += amt;
            } else if (time >= todayStart) {
                snapshot.todayExpenses += amt;
            }

            if (time >= monthStart) {
                snapshot.thisMonthExpenses += amt;
            }

            if (snapshot.recentExpenses.length < 5) {
                snapshot.recentExpenses.push({
                    amount: amt,
                    category: data.category || data.purpose || 'General',
                    description: data.description || data.notes || '',
                    date: time ? new Date(time).toLocaleDateString() : 'N/A'
                });
            }
        });
    }

    // 5. Process Products
    if (productsSnap) {
        snapshot.totalProductsCount = productsSnap.size;
        productsSnap.forEach(d => {
            const data = d.data() as any;
            const stock = Number(data.stockQuantity ?? 0);
            if (stock < 10) {
                snapshot.lowStockProductsCount += 1;
                if (snapshot.lowStockProducts.length < 8) {
                    snapshot.lowStockProducts.push({
                        name: data.name || 'Product',
                        stock
                    });
                }
            }
        });
    }

    // 6. Process Customers
    if (customersSnap) {
        snapshot.totalCustomersCount = customersSnap.size;
        customersSnap.forEach(d => {
            const data = d.data() as any;
            if (snapshot.recentCustomers.length < 8 && data.name) {
                snapshot.recentCustomers.push(data.name);
            }
        });
    }

    // 7. Process Cash Memos
    if (cashMemosSnap) {
        snapshot.totalCashMemosCount = cashMemosSnap.size;
        cashMemosSnap.forEach(d => {
            const data = d.data() as any;
            const time = getTimestampMs(data.created_at || data.date);
            if (time >= todayStart) {
                snapshot.todayCashMemosCount += 1;
            }
        });
    }

    return snapshot;
}

/**
 * Format the live snapshot into a comprehensive system prompt string for Gemini
 */
export function formatSnapshotPrompt(s: LiveBusinessSnapshot): string {
    return `
=== BILL PRO LIVE BUSINESS SNAPSHOT (ACCURATE REAL-TIME DATA) ===
📅 CURRENT DATE: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}

[1. INVOICES & SALES]
- Yesterday Sales: ₹${s.yesterdaySales.toLocaleString()} across ${s.yesterdayInvoicesCount} invoices
- Today Sales: ₹${s.todaySales.toLocaleString()} across ${s.todayInvoicesCount} invoices
- This Month Sales: ₹${s.thisMonthSales.toLocaleString()} across ${s.thisMonthInvoicesCount} invoices
- Lifetime Total Revenue: ₹${s.lifetimeRevenue.toLocaleString()} (${s.totalInvoicesCount} total invoices)
- Unpaid / Pending Invoices: ${s.unpaidInvoicesCount} invoices (Total Balance Due: ₹${s.totalOutstandingBalance.toLocaleString()})
- Recent Invoices: ${JSON.stringify(s.recentInvoices)}

[2. QUOTATIONS]
- Total Quotations Generated: ${s.totalQuotationsCount}
- Yesterday Quotations: ${s.yesterdayQuotationsCount}
- Today Quotations: ${s.todayQuotationsCount}
- Pending / Draft Quotations: ${s.pendingQuotationsCount} (Total Value: ₹${s.pendingQuotationsValue.toLocaleString()})
- Accepted / Converted Quotations: ${s.acceptedQuotationsCount}
- Recent Quotations: ${JSON.stringify(s.recentQuotations)}

[3. LEADS & CRM]
- Total Active Leads: ${s.totalLeadsCount}
- Leads Added Yesterday: ${s.yesterdayLeadsCount} | Leads Added Today: ${s.todayLeadsCount}
- High Priority Leads: ${s.highPriorityLeadsCount}
- Leads by Stage: ${JSON.stringify(s.leadsByStage)}
- Recent Leads: ${JSON.stringify(s.recentLeads)}

[4. EXPENSES]
- Yesterday Expenses: ₹${s.yesterdayExpenses.toLocaleString()}
- Today Expenses: ₹${s.todayExpenses.toLocaleString()}
- This Month Expenses: ₹${s.thisMonthExpenses.toLocaleString()}
- Lifetime Expenses: ₹${s.lifetimeExpenses.toLocaleString()}
- Recent Expenses: ${JSON.stringify(s.recentExpenses)}

[5. INVENTORY & PRODUCTS]
- Total Products: ${s.totalProductsCount}
- Low Stock (< 10 units): ${s.lowStockProductsCount} products (${JSON.stringify(s.lowStockProducts)})
- Top Selling Product: ${s.topSellingProduct}

[6. CUSTOMERS & CASH MEMOS]
- Total Customers: ${s.totalCustomersCount}
- Total Cash Memos: ${s.totalCashMemosCount} (Today: ${s.todayCashMemosCount})
================================================================
CRITICAL INSTRUCTION: Use the above live numbers directly whenever the user asks about sales, yesterday, today, quotations, leads, inventory, expenses, or customers. NEVER say you don't have access to this data!
`;
}

/**
 * Intelligent Rule Fallback when AI models are unavailable or for instantaneous response
 */
export function ruleBasedAiFallback(
    query: string, 
    s: LiveBusinessSnapshot
): { action: string; payload?: any; target?: string; message: string; status: 'SUCCESS' | 'ERROR' } {
    const q = query.toLowerCase().trim();

    // 1. Yesterday Sales
    if (q.includes('yesterday') && (q.includes('sale') || q.includes('revenue') || q.includes('invoice') || q.includes('order'))) {
        const msg = s.yesterdayInvoicesCount > 0 
            ? `Yesterday, you recorded ₹${s.yesterdaySales.toLocaleString()} in sales across ${s.yesterdayInvoicesCount} invoices. Lifetime revenue is ₹${s.lifetimeRevenue.toLocaleString()}.`
            : `Yesterday, there were 0 sales recorded (₹0 across 0 invoices). Lifetime revenue is ₹${s.lifetimeRevenue.toLocaleString()} across ${s.totalInvoicesCount} total invoices.`;
        return { action: 'REPLY', message: msg, status: 'SUCCESS' };
    }

    // 2. Quotation Count / Info
    if (q.includes('quotation') || q.includes('quote')) {
        if (q.includes('create') || q.includes('new') || q.includes('make')) {
            return { action: 'NAVIGATE', target: '/quotations/new', message: 'Opening the new quotation creation screen...', status: 'SUCCESS' };
        }
        const msg = `You have generated a total of ${s.totalQuotationsCount} quotations in Bill Pro (${s.pendingQuotationsCount} pending/draft, ${s.acceptedQuotationsCount} accepted, total value: ₹${s.pendingQuotationsValue.toLocaleString()}).`;
        return { action: 'REPLY', message: msg, status: 'SUCCESS' };
    }

    // 3. Today Sales
    if (q.includes('today') && (q.includes('sale') || q.includes('revenue') || q.includes('invoice'))) {
        const msg = s.todayInvoicesCount > 0
            ? `Today's sales so far: ₹${s.todaySales.toLocaleString()} across ${s.todayInvoicesCount} invoices.`
            : `No invoices recorded yet today (₹0 sales today). Total lifetime revenue is ₹${s.lifetimeRevenue.toLocaleString()}.`;
        return { action: 'REPLY', message: msg, status: 'SUCCESS' };
    }

    // 4. Leads / CRM
    if (q.includes('lead') || q.includes('crm') || q.includes('pipeline')) {
        if (q.includes('create') || q.includes('add') || q.includes('new')) {
            return { action: 'NAVIGATE', target: '/leads/new', message: 'Opening the new lead intake screen...', status: 'SUCCESS' };
        }
        const msg = `You currently have ${s.totalLeadsCount} active leads in your CRM (${s.highPriorityLeadsCount} high priority).`;
        return { action: 'REPLY', message: msg, status: 'SUCCESS' };
    }

    // 5. Expenses
    if (q.includes('expense') || q.includes('spent') || q.includes('cost')) {
        if (q.includes('yesterday')) {
            return { action: 'REPLY', message: `Yesterday's expenses: ₹${s.yesterdayExpenses.toLocaleString()}. Total lifetime expenses: ₹${s.lifetimeExpenses.toLocaleString()}.`, status: 'SUCCESS' };
        }
        return { action: 'REPLY', message: `Today's expenses: ₹${s.todayExpenses.toLocaleString()}. Lifetime expenses: ₹${s.lifetimeExpenses.toLocaleString()}.`, status: 'SUCCESS' };
    }

    // 6. Inventory / Stock
    if (q.includes('stock') || q.includes('inventory') || q.includes('product')) {
        const lowStockNames = s.lowStockProducts.map(p => `${p.name} (${p.stock} left)`).join(', ');
        const msg = `You have ${s.totalProductsCount} products registered. ${s.lowStockProductsCount} products are running low (< 10 units)${lowStockNames ? `: ${lowStockNames}` : ''}.`;
        return { action: 'REPLY', message: msg, status: 'SUCCESS' };
    }

    // 7. Navigation intents
    if (q.includes('dashboard')) return { action: 'NAVIGATE', target: '/dashboard', message: 'Taking you to Dashboard...', status: 'SUCCESS' };
    if (q.includes('invoice')) return { action: 'NAVIGATE', target: '/invoices', message: 'Opening Invoices...', status: 'SUCCESS' };
    if (q.includes('customer')) return { action: 'NAVIGATE', target: '/library/customers', message: 'Opening Customer Library...', status: 'SUCCESS' };
    if (q.includes('report')) return { action: 'NAVIGATE', target: '/reports', message: 'Opening Reports...', status: 'SUCCESS' };
    if (q.includes('setting')) return { action: 'NAVIGATE', target: '/settings', message: 'Opening Settings...', status: 'SUCCESS' };

    return {
        action: 'REPLY',
        message: `I can help you create invoices, quotations, leads, log expenses, manage stock, and view real-time business reports! Your lifetime revenue is ₹${s.lifetimeRevenue.toLocaleString()} across ${s.totalInvoicesCount} invoices. How can I help?`,
        status: 'SUCCESS'
    };
}

/**
 * Ask Bill Pro AI - Combines Gemini with Live Business Snapshot and deterministic fallback
 */
export async function askBillProAi(
    userQuery: string,
    snapshot: LiveBusinessSnapshot
): Promise<{
    action: string;
    payload?: any;
    target?: string;
    message: string;
    status: 'SUCCESS' | 'ERROR';
}> {
    const apiKey = getApiKey();

    if (apiKey) {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const systemPrompt = `
You are the Master AI Worker for Bill Pro web application. You run all operations and answer business analytics questions with exact numbers.
${formatSnapshotPrompt(snapshot)}

ACTIONS YOU CAN EXECUTE:
- NAVIGATE: { "action": "NAVIGATE", "target": "/dashboard" | "/invoices" | "/invoices/new" | "/quotations" | "/quotations/new" | "/leads" | "/leads/new" | "/pipeline" | "/cash-memos" | "/proforma-invoices" | "/library/products" | "/library/customers" | "/expense" | "/reports" | "/settings" }
- ADD_LEAD: { "action": "ADD_LEAD", "payload": { "name": "...", "phone": "...", "company_name": "...", "budget": 5000, "requirement": "..." } }
- PREFILL_DOCUMENT: { "action": "PREFILL_DOCUMENT", "target": "/quotations/new" or "/invoices/new", "payload": { "customerName": "...", "items": [...] } }
- ADD_PRODUCT: { "action": "ADD_PRODUCT", "payload": { "name": "...", "retail_price": 100, "quantity": 10 } }
- ADD_CUSTOMER: { "action": "ADD_CUSTOMER", "payload": { "name": "...", "phone": "...", "gst_number": "..." } }
- ADD_EXPENSE: { "action": "ADD_EXPENSE", "payload": { "amount": 500, "category": "...", "description": "..." } }
- MARK_PAID: { "action": "MARK_PAID", "payload": { "invoiceNumber": "...", "paymentMethod": "Cash" } }
- UPDATE_STOCK: { "action": "UPDATE_STOCK", "payload": { "productSearch": "...", "quantityToAdd": 10 } }
- DISPATCH: { "action": "DISPATCH", "payload": { "customerSearch": "...", "documentType": "quotation" | "invoice" } }
- REPLY: { "action": "REPLY", "message": "Direct conversational answer using the exact numbers from the Live Business Snapshot above" }

CRITICAL RULES:
1. For questions about sales (yesterday, today, this month, lifetime): Use the exact numbers from the Live Business Snapshot above.
2. For questions about quotations (how many quotations, pending, accepted, total value): State the exact counts and values.
3. For questions about leads, expenses, stock, customers: State the exact counts.
4. Output ONLY valid JSON matching this schema:
{
  "action": "NAVIGATE" | "ADD_PRODUCT" | "ADD_CUSTOMER" | "ADD_LEAD" | "PREFILL_DOCUMENT" | "DISPATCH" | "ADD_EXPENSE" | "MARK_PAID" | "UPDATE_STOCK" | "REPLY",
  "target": "/route_path",
  "payload": {},
  "message": "Direct, conversational message answering with exact numbers or confirming the action taken."
}
`;
            const CANDIDATES = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
            for (const modelName of CANDIDATES) {
                try {
                    const model = genAI.getGenerativeModel({
                        model: modelName,
                        generationConfig: {
                            responseMimeType: "application/json",
                            temperature: 0.1
                        },
                        systemInstruction: systemPrompt
                    });
                    const res = await model.generateContent(userQuery);
                    const text = res.response.text();
                    const parsed = JSON.parse(text);
                    return {
                        action: parsed.action || 'REPLY',
                        payload: parsed.payload,
                        target: parsed.target,
                        message: parsed.message || 'Done.',
                        status: 'SUCCESS'
                    };
                } catch (err: any) {
                    if (err?.message?.includes('404')) continue;
                    break;
                }
            }
        } catch (e) {
            console.warn('Gemini client call failed, using deterministic fallback:', e);
        }
    }

    // Deterministic instant fallback
    return ruleBasedAiFallback(userQuery, snapshot);
}

/**
 * Execute client-side business action
 */
export async function executeClientSideAction(
    action: string, 
    payload: any, 
    navigate: (path: string, options?: any) => void
): Promise<{ success: boolean; message: string }> {
    try {
        switch (action) {
            case 'NAVIGATE': {
                const target = payload?.target || '/dashboard';
                navigate(target);
                return { success: true, message: `Navigating to ${target}` };
            }

            case 'ADD_PRODUCT': {
                const price = parseFloat(payload?.retail_price) || 0;
                const generatedNum = Math.floor(price / 100) * 100 + 99;
                const sku = `ETWA${generatedNum}`;
                await addDoc(collection(db, 'products'), {
                    name: payload?.name || 'New Product',
                    sku: sku,
                    retail_price: price,
                    wholesale_price: price,
                    tax_percentage: 18,
                    hsn_code: payload?.hsn_code || '0000',
                    stockQuantity: Number(payload?.quantity) || 0,
                    created_at: new Date(),
                    source: 'ai_agent'
                });
                return { success: true, message: `Successfully added product "${payload?.name}" (₹${price})` };
            }

            case 'ADD_CUSTOMER': {
                await addDoc(collection(db, 'customers'), {
                    name: payload?.name || 'New Customer',
                    phone: payload?.phone || '',
                    email: payload?.email || '',
                    gst_number: payload?.gst_number || '',
                    billing_address: payload?.address || '',
                    created_at: new Date(),
                    source: 'ai_agent'
                });
                return { success: true, message: `Successfully added customer "${payload?.name}"` };
            }

            case 'ADD_LEAD': {
                await addDoc(collection(db, 'leads'), {
                    name: payload?.name || 'New Lead',
                    phone: payload?.phone || '',
                    company_name: payload?.company_name || payload?.company || '',
                    email: payload?.email || '',
                    requirements: payload?.requirement || payload?.requirements || '',
                    budget: parseFloat(payload?.budget) || 0,
                    quantity: parseInt(payload?.quantity) || 0,
                    status: payload?.status || 'New',
                    priority: payload?.priority || 'MEDIUM',
                    created_at: new Date(),
                    source: 'ai_agent'
                });
                return { success: true, message: `Successfully created CRM lead for "${payload?.name}"` };
            }

            case 'ADD_EXPENSE': {
                const amount = parseFloat(payload?.amount) || 0;
                await addDoc(collection(db, 'expenses'), {
                    amount: amount,
                    category: payload?.category || 'Miscellaneous',
                    description: payload?.description || 'Added via Bill Pro AI',
                    date: Timestamp.fromDate(new Date()),
                    paymentMode: payload?.paymentMode || 'UPI',
                    type: 'expense'
                });
                return { success: true, message: `Logged expense of ₹${amount} for ${payload?.category || 'Miscellaneous'}` };
            }

            case 'PREFILL_DOCUMENT': {
                const target = payload?.target || '/invoices/new';
                navigate(target, { state: { prefillData: payload } });
                return { success: true, message: `Opening new document for ${payload?.customerName || payload?.name || 'Customer'}...` };
            }

            default:
                return { success: true, message: 'Action completed.' };
        }
    } catch (e: any) {
        console.error('Action execution failed:', e);
        return { success: false, message: e.message || 'Action failed' };
    }
}

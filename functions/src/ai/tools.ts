import { db } from "../config.js";
import { HttpsError } from "firebase-functions/v2/https";

export interface ToolContext {
    uid: string;
    role: string;
    userName: string;
}

/**
 * Executes a tool by name, enforcing role-based permissions and data validation.
 */
export async function executeTool(toolName: string, args: any, context: ToolContext): Promise<any> {
    switch (toolName) {
        // --- CRM READ ---
        case 'searchLeads':
            return await searchLeads(args, context);
        case 'getTodayFollowups':
            return await getTodayFollowups(context);
        case 'getOverdueFollowups':
            return await getOverdueFollowups(context);
        case 'searchCustomers':
            return await searchCustomers(args, context);
        case 'getPendingQuotations':
            return await getPendingQuotations(context);
        case 'getPaymentPendingCustomers':
            return await getPaymentPendingCustomers(context);
        
        // --- CRM WRITE ---
        case 'assignLead':
            if (context.role !== 'admin' && context.role !== 'sales') {
                 throw new HttpsError("permission-denied", "Only Admin or Sales can assign leads.");
            }
            return await assignLead(args, context);

        default:
            throw new HttpsError("invalid-argument", `Tool '${toolName}' is not implemented or not recognized.`);
    }
}

// ---------------------------------------------------------------------------
// 1. CRM Read Tools (Level 1)
// ---------------------------------------------------------------------------

async function searchLeads(args: any, context: ToolContext) {
    const leadsRef = db.collection("leads");
    let query: any = leadsRef.orderBy("created_at", "desc").limit(5);

    if (context.role === 'sales') {
        // Assume sales access rules
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc: any) => {
        const data = doc.data();
        
        // Lead Priority Engine Logic
        let priority = "LOW";
        const reasons = [];
        const missing = [];
        let recommendedAction = "Follow up and gather more information.";

        // Event date proximity
        if (data.event_date) {
            const eventDate = new Date(data.event_date.seconds * 1000);
            const daysToEvent = (eventDate.getTime() - Date.now()) / (1000 * 3600 * 24);
            if (daysToEvent <= 7) {
                priority = "HIGH";
                reasons.push(`Event is very close (in ${Math.ceil(daysToEvent)} days)`);
            } else if (daysToEvent <= 30) {
                priority = "MEDIUM";
                reasons.push(`Event is in ${Math.ceil(daysToEvent)} days`);
            }
        }

        // Quantity
        if (data.quantity && data.quantity >= 50) {
            priority = "HIGH";
            reasons.push(`High quantity requested (${data.quantity})`);
        } else if (data.quantity) {
             reasons.push(`Quantity requested: ${data.quantity}`);
        } else {
             missing.push("Quantity required");
        }

        if (data.quotation_sent) {
            reasons.push("Quotation already sent");
        }
        
        if (!data.budget_confirmed) {
            missing.push("Budget confirmation");
            recommendedAction = "Follow up today and confirm budget.";
        } else if (priority === "HIGH") {
            recommendedAction = "Immediate follow-up required to close the deal.";
        }

        return {
            id: doc.id,
            name: data.name,
            company: data.company_name,
            status: data.status,
            priorityAnalysis: {
                Priority: priority,
                Reasons: reasons,
                Missing: missing,
                RecommendedAction: recommendedAction
            }
        };
    });
}

async function getTodayFollowups(context: ToolContext) {
    // Today's boundaries
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const activitiesRef = db.collection("activities");
    // Firestore requires a composite index if we mix range (> <) and equality (==).
    // To avoid crashes without building an index, we fetch by date and filter by status in memory.
    const snapshot = await activitiesRef
        .where("due_date", ">=", start)
        .where("due_date", "<=", end)
        .get();

    return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((doc: any) => doc.status === "pending");
}

async function getOverdueFollowups(context: ToolContext) {
    const now = new Date();
    const activitiesRef = db.collection("activities");
    const snapshot = await activitiesRef
        .where("due_date", "<", now)
        .get();

    return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((doc: any) => doc.status === "pending");
}

async function searchCustomers(args: any, context: ToolContext) {
    const snapshot = await db.collection("customers").limit(5).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getPendingQuotations(context: ToolContext) {
    const snapshot = await db.collection("quotations")
        .where("status", "==", "pending")
        .limit(10)
        .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getPaymentPendingCustomers(context: ToolContext) {
    const snapshot = await db.collection("invoices")
        .where("payment_status", "in", ["unpaid", "partial"])
        .limit(10)
        .get();
    
    // Grouping logic would ideally happen, but returning invoices is sufficient for AI to summarize
    return snapshot.docs.map(doc => ({ id: doc.id, customer: doc.data().customer_name, balance: doc.data().balance_amount }));
}


// ---------------------------------------------------------------------------
// 2. CRM Write Tools (Level 2)
// ---------------------------------------------------------------------------

async function assignLead(args: any, context: ToolContext) {
    const { leadId, assignToUserId } = args;
    if (!leadId || !assignToUserId) {
        throw new HttpsError("invalid-argument", "Missing leadId or assignToUserId");
    }

    const leadRef = db.collection("leads").doc(leadId);
    const leadDoc = await leadRef.get();
    
    if (!leadDoc.exists) {
        throw new HttpsError("not-found", "Lead not found");
    }

    await leadRef.update({
        assigned_to: assignToUserId,
        updated_at: new Date()
    });

    return { success: true, message: `Lead successfully assigned to user ${assignToUserId}` };
}

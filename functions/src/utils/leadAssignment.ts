import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config.js";

export interface ServerLeadAssignmentContext {
  source?: string;
  platform?: string;
  pipelineId?: string;
  requiredQuantity?: string | number;
  value?: number;
  location?: string;
  name?: string;
  company?: string;
  requirement?: string;
  campaign?: string;
}

export interface ServerLeadAssignmentResult {
  assigned: boolean;
  ownerId: string;
  ownerName: string;
  ruleName?: string;
}

function extractNum(raw: any): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const match = String(raw || "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) || 0 : 0;
}

function ruleMatches(rule: any, ctx: ServerLeadAssignmentContext): boolean {
  if (!rule || rule.enabled === false) return false;
  const rawTarget = String(rule.value || "").trim();
  if (!rawTarget && rule.field !== "required_quantity" && rule.field !== "value") return false;

  if (rule.field === "required_quantity" || rule.field === "value") {
    const actual = rule.field === "required_quantity" ? extractNum(ctx.requiredQuantity) : Number(ctx.value) || 0;
    const target = extractNum(rule.value);
    const secondary = extractNum(rule.secondaryValue);
    if (rule.operator === "gte") return actual >= target;
    if (rule.operator === "lte") return actual > 0 && actual <= target;
    if (rule.operator === "between") {
      return actual >= Math.min(target, secondary || target) && actual <= Math.max(target, secondary || target);
    }
    return actual === target;
  }

  let haystack = "";
  if (rule.field === "source") haystack = `${ctx.source || ""} ${ctx.platform || ""}`.toLowerCase();
  else if (rule.field === "pipeline_id") haystack = String(ctx.pipelineId || "").toLowerCase();
  else if (rule.field === "location") haystack = String(ctx.location || "").toLowerCase();
  else if (rule.field === "keyword") {
    haystack = [ctx.name, ctx.company, ctx.requirement, ctx.campaign, ctx.source, ctx.location]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  const tokens = rawTarget
    .toLowerCase()
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!haystack || tokens.length === 0) return false;
  if (rule.operator === "equals") return tokens.some((tok) => haystack === tok);
  return tokens.some((tok) => haystack.includes(tok));
}

export async function resolveServerLeadAssignment(
  ctx: ServerLeadAssignmentContext
): Promise<ServerLeadAssignmentResult> {
  try {
    const cfgSnap = await db.collection("settings").doc("lead_assignment").get();
    if (!cfgSnap.exists) return { assigned: false, ownerId: "", ownerName: "" };
    const cfg = cfgSnap.data() as any;
    if (!cfg?.enabled) return { assigned: false, ownerId: "", ownerName: "" };

    const selectedMembers = Array.isArray(cfg.selectedMembers) ? cfg.selectedMembers : [];
    const byId = new Map<string, any>();
    selectedMembers.forEach((m: any) => {
      if (m?.userId) byId.set(String(m.userId), m);
    });

    const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
    const matchedRule = rules.find((r: any) => ruleMatches(r, ctx));

    let ruleAssignees: any[] = [];
    if (matchedRule && Array.isArray(matchedRule.assigneeIds)) {
      for (const uid of matchedRule.assigneeIds) {
        const found = byId.get(String(uid));
        if (found && found.active !== false) {
          ruleAssignees.push(found);
        } else {
          const userDoc = await db.collection("users").doc(String(uid)).get();
          if (userDoc.exists && userDoc.data()?.is_active !== false) {
            const u = userDoc.data() as any;
            ruleAssignees.push({ userId: userDoc.id, name: u.name || u.email || "Team Member" });
          }
        }
      }
    }

    const poolSlots: any[] = [];
    if (cfg.splitMode !== "rules_only") {
      for (const m of selectedMembers) {
        if (m?.active === false || !m?.userId) continue;
        const w = cfg.splitMode === "weighted_split" ? Math.max(1, Math.min(10, Math.round(Number(m.weight) || 1))) : 1;
        for (let i = 0; i < w; i++) poolSlots.push(m);
      }
    }

    if (ruleAssignees.length === 0 && poolSlots.length === 0) {
      return { assigned: false, ownerId: "", ownerName: "" };
    }

    const stateRef = db.collection("stage_messages").doc("__lead_assignment_state");
    const chosen = await db.runTransaction(async (tx: any) => {
      const snap = await tx.get(stateRef);
      const st = snap.exists ? (snap.data() as any) : {};

      if (matchedRule && ruleAssignees.length > 0) {
        const ruleCursors = st.ruleCursors && typeof st.ruleCursors === "object" ? { ...st.ruleCursors } : {};
        const cur = Math.max(0, Number(ruleCursors[matchedRule.id]) || 0);
        const picked = ruleAssignees[cur % ruleAssignees.length];
        ruleCursors[matchedRule.id] = (cur + 1) % Math.max(1, ruleAssignees.length * 1000);
        tx.set(
          stateRef,
          {
            ruleCursors,
            lastAssignedUserId: picked.userId,
            lastAssignedUserName: picked.name || "",
            lastAssignedRuleName: matchedRule.name || "",
            lastAssignedAt: Date.now(),
            totalAutoAssigned: (Number(st.totalAutoAssigned) || 0) + 1,
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return { picked, ruleName: matchedRule.name };
      }

      const cur = Math.max(0, Number(st.poolCursor) || 0);
      const picked = poolSlots[cur % poolSlots.length];
      tx.set(
        stateRef,
        {
          poolCursor: (cur + 1) % Math.max(1, poolSlots.length * 1000),
          lastAssignedUserId: picked.userId,
          lastAssignedUserName: picked.name || "",
          lastAssignedAt: Date.now(),
          totalAutoAssigned: (Number(st.totalAutoAssigned) || 0) + 1,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { picked, ruleName: cfg.splitMode };
    });

    return {
      assigned: true,
      ownerId: String(chosen.picked.userId),
      ownerName: String(chosen.picked.name || ""),
      ruleName: chosen.ruleName,
    };
  } catch (err) {
    console.warn("[ServerLeadAssignment] fallback:", err);
    return { assigned: false, ownerId: "", ownerName: "" };
  }
}


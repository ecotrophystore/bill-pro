import type { Lead, Pipeline, PipelineRule } from '../types';

export interface ClassificationResult {
  pipeline_id: string;
  pipeline_name: string;
  matched_rule_name: string;
  reason: string;
}

/**
 * Evaluates a single rule condition against a lead
 */
function evaluateCondition(lead: Partial<Lead>, rule: PipelineRule): boolean {
  let val: any = undefined;

  switch (rule.field) {
    case 'required_quantity':
      val = Number(lead.required_quantity) || 0;
      break;
    case 'value':
      val = Number(lead.value) || 0;
      break;
    case 'source':
      val = (lead.source || '').toLowerCase();
      break;
    case 'location':
      val = (lead.location || '').toLowerCase();
      break;
    case 'urgency':
      val = (lead.urgency || '').toLowerCase();
      break;
    default:
      val = (lead as any)[rule.field];
  }

  const target = rule.value;

  switch (rule.operator) {
    case 'greater_than_or_equal':
      return Number(val) >= Number(target);
    case 'less_than_or_equal':
      return Number(val) <= Number(target);
    case 'equals':
      return String(val).toLowerCase() === String(target).toLowerCase();
    case 'between':
      return Number(val) >= Number(target) && Number(val) <= Number(rule.secondary_value ?? Infinity);
    case 'contains':
      return String(val).toLowerCase().includes(String(target).toLowerCase());
    case 'in':
      if (Array.isArray(target)) {
        return target.map((t) => String(t).toLowerCase()).includes(String(val).toLowerCase());
      }
      return String(target).toLowerCase().split(',').map((s) => s.trim()).includes(String(val).toLowerCase());
    default:
      return false;
  }
}

/**
 * Classifies a lead into the appropriate pipeline based on quantity or active pipeline rules.
 * Default quantity rules:
 * - Small Order Pipeline: Quantity < 10 (1–9 pcs)
 * - Regular Order Pipeline: Quantity 10–99 pcs
 * - Bulk Order Pipeline: Quantity >= 100 pcs
 */
export function classifyLeadPipeline(
  lead: Partial<Lead>,
  customRules: PipelineRule[] = [],
  availablePipelines: Pipeline[] = []
): ClassificationResult {
  // 1. Evaluate custom rules ordered by priority
  const activeRules = customRules
    .filter((r) => r.is_active !== false)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  for (const rule of activeRules) {
    if (evaluateCondition(lead, rule)) {
      const pipeline = availablePipelines.find((p) => p.id === rule.pipeline_id);
      return {
        pipeline_id: rule.pipeline_id,
        pipeline_name: pipeline?.name || rule.name,
        matched_rule_name: rule.name,
        reason: rule.description || `Matched rule: ${rule.name}`,
      };
    }
  }

  // 2. Default quantity-based classification
  const qty = Number(lead.required_quantity);
  const smallPipe = availablePipelines.find((p) => p.id === 'small_order' || p.name.toLowerCase().includes('small'));
  const regularPipe = availablePipelines.find((p) => p.id === 'regular_order' || p.name.toLowerCase().includes('regular'));
  const bulkPipe = availablePipelines.find((p) => p.id === 'bulk_order' || p.name.toLowerCase().includes('bulk'));

  if (!isNaN(qty) && qty > 0) {
    if (qty >= 100) {
      return {
        pipeline_id: bulkPipe?.id || 'bulk_order',
        pipeline_name: bulkPipe?.name || 'Bulk Order Pipeline',
        matched_rule_name: 'Bulk Order Rule (100+ pcs)',
        reason: `Required quantity (${qty} pcs) is 100 or more.`,
      };
    } else if (qty >= 10) {
      return {
        pipeline_id: regularPipe?.id || 'regular_order',
        pipeline_name: regularPipe?.name || 'Regular Order Pipeline',
        matched_rule_name: 'Regular Order Rule (10–99 pcs)',
        reason: `Required quantity (${qty} pcs) is between 10 and 99.`,
      };
    } else {
      return {
        pipeline_id: smallPipe?.id || 'small_order',
        pipeline_name: smallPipe?.name || 'Small Order Pipeline',
        matched_rule_name: 'Small Order Rule (1–9 pcs)',
        reason: `Required quantity (${qty} pcs) is less than 10.`,
      };
    }
  }

  // Default fallback to Regular or first available
  const defaultPipe = availablePipelines.find((p) => p.is_default) || regularPipe || availablePipelines[0];
  return {
    pipeline_id: defaultPipe?.id || 'regular_order',
    pipeline_name: defaultPipe?.name || 'Regular Order Pipeline',
    matched_rule_name: 'Default Pipeline',
    reason: 'Standard default pipeline assignment',
  };
}

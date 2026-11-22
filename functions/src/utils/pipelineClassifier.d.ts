import type { Lead, Pipeline, PipelineRule } from './types.js';
export interface ClassificationResult {
    pipeline_id: string;
    pipeline_name: string;
    matched_rule_name: string;
    reason: string;
}
/**
 * Classifies a lead into the appropriate pipeline based on quantity or active pipeline rules.
 * Default quantity rules:
 * - Small Order Pipeline: Quantity < 10 (1–9 pcs)
 * - Regular Order Pipeline: Quantity 10–99 pcs
 * - Bulk Order Pipeline: Quantity >= 100 pcs
 * - Unclassified / Requirement Pending: Quantity not yet provided or requirement unclear
 */
export declare function classifyLeadPipeline(lead: Partial<Lead>, customRules?: PipelineRule[], availablePipelines?: Pipeline[]): ClassificationResult;
//# sourceMappingURL=pipelineClassifier.d.ts.map
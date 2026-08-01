// @ts-nocheck
import type { WorkflowEdgeConfig, WorkflowNodeConfig } from '../../types';

export function nodeSummaryWarnings(node: WorkflowNodeConfig) {
  const warnings: any[] = [];
  const config = node.data.config || {};
  if (node.type === 'trigger' && (!config.pipelineId || !config.stageId)) warnings.push({ code: 'trigger', message: 'Select a pipeline and stage.', severity: 'error' });
  if (node.type === 'whatsapp' && !config.metaTemplateName) warnings.push({ code: 'template', message: 'Select an approved WhatsApp template.', severity: 'error' });
  if (node.type === 'review_delay' && !config.maxMessagesPerLead) warnings.push({ code: 'repeat', message: 'Maximum message count is required.', severity: 'error' });
  return warnings;
}

export function validateWorkflowGraph(nodes: WorkflowNodeConfig[], edges: WorkflowEdgeConfig[]) {
  const warningsByNodeId: Record<string, any[]> = {};
  const criticalErrors: string[] = [];
  if (!nodes.some((node) => node.type === 'trigger')) criticalErrors.push('A workflow must start with a trigger node.');
  if (!nodes.some((node) => node.type === 'whatsapp')) criticalErrors.push('At least one WhatsApp message node is required.');
  for (const node of nodes) {
    const warnings = nodeSummaryWarnings(node);
    if (warnings.length) warningsByNodeId[node.id] = warnings;
  }
  if (edges.some((edge) => edge.source === edge.target)) criticalErrors.push('Unsupported loop detected in workflow graph.');
  return { warningsByNodeId, criticalErrors, hasTrigger: true, hasWhatsAppAction: true, maxMessagesOk: true };
}

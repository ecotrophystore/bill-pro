// @ts-nocheck
import { Timestamp } from 'firebase/firestore';
import type { WhatsAppAutomation, WorkflowEdgeConfig, WorkflowNodeConfig } from '../../types';

export function compileWorkflowToAutomation(nodes: WorkflowNodeConfig[], edges: WorkflowEdgeConfig[], base: Partial<WhatsAppAutomation>) {
  const trigger = nodes.find((node) => node.type === 'trigger')?.data.config || {};
  const whatsapp = nodes.find((node) => node.type === 'whatsapp')?.data.config || {};
  const delay = nodes.find((node) => node.type === 'delay')?.data.config || {};
  const repeat = nodes.find((node) => node.type === 'review_delay')?.data.config || {};
  const stop = nodes.find((node) => node.type === 'stop_condition')?.data.config || {};
  const payload: Partial<WhatsAppAutomation> = {
    ...base,
    pipelineId: trigger.pipelineId || base.pipelineId || '',
    stageId: trigger.stageId || base.stageId || '',
    audienceMode: trigger.audienceMode || base.audienceMode || 'current_and_future',
    scheduleType: delay.mode === 'fixed' ? 'fixed_date' : repeat.maxMessagesPerLead ? 'repeat_followup' : delay.value ? 'days_after_stage' : 'immediate',
    delayDays: Number(delay.value || base.delayDays || 0),
    sendTime: delay.sendTime || base.sendTime || '10:00',
    timezone: delay.timezone || base.timezone || 'Asia/Kolkata',
    repeatEnabled: Boolean(repeat.repeatEveryDays || repeat.maxMessagesPerLead),
    repeatEveryDays: Number(repeat.repeatEveryDays || base.repeatEveryDays || 0) || undefined,
    maxMessagesPerLead: Number(repeat.maxMessagesPerLead || base.maxMessagesPerLead || 0) || undefined,
    metaTemplateName: whatsapp.metaTemplateName || base.metaTemplateName || '',
    templateLanguage: whatsapp.templateLanguage || base.templateLanguage || 'en_US',
    variableMappings: whatsapp.parameterMappings ? Object.fromEntries((whatsapp.parameterMappings || []).map((item: any) => [String(item.key), String(item.value)])) : (base.variableMappings || {}),
    stopOnReply: stop.stopOn?.includes('customer_replied') ?? base.stopOnReply ?? true,
    stopOnStageChange: stop.stopOn?.includes('stage_changed') ?? base.stopOnStageChange ?? true,
    skipWon: stop.stopOn?.includes('lead_won') ?? base.skipWon ?? true,
    skipLost: stop.stopOn?.includes('lead_lost') ?? base.skipLost ?? true,
    skipOptedOut: stop.stopOn?.includes('customer_opted_out') ?? base.skipOptedOut ?? true,
    preventDuplicate: base.preventDuplicate ?? true,
    fixedScheduledAt: delay.fixedDate ? Timestamp.fromDate(new Date(delay.fixedDate)) : base.fixedScheduledAt,
    workflowNodes: nodes,
    workflowEdges: edges,
    workflowVersion: (base.workflowVersion || 0) + 1,
  };
  return { payload, warningsByNodeId: {}, criticalErrors: [] };
}

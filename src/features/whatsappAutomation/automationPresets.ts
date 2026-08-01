// @ts-nocheck
import type { WorkflowEdgeConfig, WorkflowNodeConfig, WorkflowNodeType } from '../../types';

export type AutomationPresetKey = 'welcome' | 'follow_up' | 'advance_payment_request' | 'advance_payment_reminder' | 'advance_payment_confirmation' | 'full_payment_request' | 'full_payment_reminder' | 'full_payment_confirmation' | 'production_update' | 'dispatch_details' | 'review_request' | 'custom';

export const AUTOMATION_PRESETS: Array<{ key: AutomationPresetKey; label: string; description: string }> = [
  { key: 'welcome', label: 'Welcome Message', description: 'Lead enters a new stage and receives an immediate welcome.' },
  { key: 'follow_up', label: 'Follow-up Message', description: 'Wait, check reply state, then send a repeatable follow-up.' },
  { key: 'advance_payment_request', label: 'Advance Payment Request', description: 'Request advance payment and stop once payment is received.' },
  { key: 'advance_payment_reminder', label: 'Advance Payment Reminder', description: 'Remind only while advance remains pending.' },
  { key: 'advance_payment_confirmation', label: 'Advance Payment Confirmation', description: 'Send confirmation after advance payment is received.' },
  { key: 'full_payment_request', label: 'Full Payment Request', description: 'Request the full balance and stop when the invoice is paid.' },
  { key: 'full_payment_reminder', label: 'Full Payment Reminder', description: 'Repeat payment reminders while the balance is pending.' },
  { key: 'full_payment_confirmation', label: 'Full Payment Confirmation', description: 'Confirm when the full balance is received.' },
  { key: 'production_update', label: 'Production Update', description: 'Send a production update from the selected production stage.' },
  { key: 'dispatch_details', label: 'Dispatch Details', description: 'Send tracking details after dispatch data is available.' },
  { key: 'review_request', label: 'Review Request', description: 'Send a review request after delivery delay.' },
  { key: 'custom', label: 'Custom WhatsApp Automation', description: 'Start from a blank WhatsApp-only workflow.' },
];

function baseNode(id: string, type: WorkflowNodeType, title: string, summary: string, config: Record<string, any> = {}): WorkflowNodeConfig {
  return { id, type, data: { title, summary, icon: type, config } };
}

export function createPresetBlueprint(preset: AutomationPresetKey): { preset: AutomationPresetKey; nodes: WorkflowNodeConfig[]; edges: WorkflowEdgeConfig[] } {
  const nodes: WorkflowNodeConfig[] = [];
  switch (preset) {
    case 'welcome':
      nodes.push(baseNode('trigger', 'trigger', 'Trigger', 'Lead enters New Lead stage', { triggerType: 'stage_enter', audienceMode: 'current_and_future', pipelineId: 'default', stageId: 'new' }));
      nodes.push(baseNode('check-phone', 'condition', 'Validate WhatsApp Number', 'Only if a valid WhatsApp number exists', { conditions: ['valid_whatsapp_number'] }));
      nodes.push(baseNode('welcome-message', 'whatsapp', 'WhatsApp Message', 'Send: Welcome Message', { templateLanguage: 'en_US' }));
      break;
    case 'follow_up':
      nodes.push(baseNode('trigger', 'trigger', 'Trigger', 'Lead enters Follow-up stage', { triggerType: 'stage_enter', audienceMode: 'current_and_future', pipelineId: 'default', stageId: 'followup' }));
      nodes.push(baseNode('delay-1', 'delay', 'Delay', 'Wait 2 days · Send at 10:00 AM', { mode: 'relative', unit: 'days', value: 2, sendTime: '10:00', timezone: 'Asia/Kolkata' }));
      nodes.push(baseNode('check-reply', 'condition', 'Check Reply State', 'Only if customer has not replied', { conditions: ['customer_not_replied'] }));
      nodes.push(baseNode('followup-1', 'whatsapp', 'WhatsApp Message', 'Send: Follow-up Message', { templateLanguage: 'en_US' }));
      nodes.push(baseNode('repeat', 'review_delay', 'Repeat Follow-up', 'Wait configured interval', { repeatEveryDays: 7, maxMessagesPerLead: 3 }));
      break;
    default:
      nodes.push(baseNode('trigger', 'trigger', 'Trigger', 'Lead enters selected pipeline stage', { triggerType: 'stage_enter', audienceMode: 'current_and_future', pipelineId: 'default', stageId: 'new' }));
      nodes.push(baseNode('check-phone', 'condition', 'Validate WhatsApp Number', 'Only if a valid WhatsApp number exists', { conditions: ['valid_whatsapp_number'] }));
      nodes.push(baseNode('message-1', 'whatsapp', 'WhatsApp Message', 'Send: WhatsApp Message', { templateLanguage: 'en_US' }));
      break;
  }
  nodes.push(baseNode('end', 'end', 'End Workflow', 'End workflow', {}));
  const edges: WorkflowEdgeConfig[] = nodes.slice(0, -1).map((node, index) => ({ id: `e-${node.id}-${nodes[index + 1].id}`, source: node.id, target: nodes[index + 1].id, type: 'smoothstep' }));
  return { preset, nodes, edges };
}

export function makeWorkflowId(prefix: WorkflowNodeType) { return `${prefix}-${Math.random().toString(36).slice(2, 10)}`; }

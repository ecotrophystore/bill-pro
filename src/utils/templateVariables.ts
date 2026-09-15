import type { Lead, StageMessageConfig } from '../types';

export interface TemplateContext {
  customer_name?: string;
  name?: string;
  company_name?: string;
  company?: string;
  event_name?: string;
  event_date?: string;
  quantity?: string | number;
  required_quantity?: string | number;
  order_value?: string | number;
  value?: string | number;
  trophy_size?: string;
  sales_person?: string;
  design_person?: string;
  delivery_date?: string;
  tracking_number?: string;
  current_stage?: string;
  previous_stage?: string;
  stage_name?: string;
  phone?: string;
  email?: string;
  location?: string;
  [key: string]: any;
}

/**
 * Builds the template context dictionary from a Lead object and stage names
 */
export function buildTemplateContext(
  lead: Partial<Lead>,
  currentStageName: string,
  previousStageName?: string
): TemplateContext {
  const qty = lead.required_quantity ? String(lead.required_quantity) : '';
  const val = lead.value ? (typeof lead.value === 'number' ? `₹${lead.value.toLocaleString('en-IN')}` : String(lead.value)) : '';

  return {
    customer_name: lead.name || 'Valued Customer',
    name: lead.name || 'Valued Customer',
    company_name: lead.company || lead.organization || '',
    company: lead.company || lead.organization || '',
    event_name: lead.event_name || 'your upcoming event',
    event_date: lead.event_date || '',
    quantity: qty,
    required_quantity: qty,
    order_value: val,
    value: val,
    trophy_size: lead.trophy_size || '',
    sales_person: lead.sales_person || 'EcoTrophy Sales Team',
    design_person: lead.design_person || 'Design Team',
    delivery_date: lead.delivery_date || '',
    tracking_number: lead.tracking_number || '',
    current_stage: currentStageName,
    stage_name: currentStageName,
    previous_stage: previousStageName || '',
    phone: lead.phone || '',
    email: lead.email || '',
    location: lead.location || '',
  };
}

/**
 * Replaces both {{variable}} and {variable} placeholders in a template string
 */
export function renderTemplateText(template: string, context: TemplateContext): string {
  if (!template) return '';

  return template
    // Double braces {{variable}}
    .replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key) => {
      const val = context[key];
      return val !== undefined && val !== null ? String(val) : '';
    })
    // Single braces {variable}
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
      const val = context[key];
      return val !== undefined && val !== null ? String(val) : '';
    });
}

/**
 * Default preset message templates for all 16 standard CRM pipeline stages
 */
export const DEFAULT_STAGE_MESSAGES: Record<string, Partial<StageMessageConfig>> = {
  new_enquiry: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, thank you for reaching out to EcoTrophy! We have received your inquiry for {{quantity}} trophies and our team will get in touch with you shortly to understand your requirements. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, we received your inquiry. EcoTrophy team will contact you shortly.",
    email_enabled: false,
    email_subject: "Thank you for contacting EcoTrophy - Inquiry Received",
    email_template: "Hi {{customer_name}},\n\nThank you for reaching out to EcoTrophy regarding your trophy inquiry. Our team will review your details and connect with you shortly.\n\nWarm regards,\nEcoTrophy Team",
  },
  requirement_collection: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, we are in the process of collecting and reviewing the design details and customization requirements for your order. Please feel free to share logos, text, or reference samples here. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, please share your trophy customization details with EcoTrophy.",
    email_enabled: false,
    email_subject: "Customization & Requirement Details - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nWe are collecting the specific customization requirements (logos, text, sizes) for your order. Please reply with your requirements.\n\nBest regards,\nEcoTrophy",
  },
  requirement_confirmed: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, we have successfully confirmed your trophy specifications for {{event_name}}. Your order is now ready for our design team. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, your trophy order requirements have been confirmed with EcoTrophy.",
    email_enabled: false,
    email_subject: "Order Requirements Confirmed - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nYour trophy requirements for {{event_name}} have been confirmed. We are queuing this for our design team.\n\nBest regards,\nEcoTrophy",
  },
  design_stage: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, your trophy order has now entered the Design Stage. Our design team is working on your trophy design. We will share the design with you once it is ready. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, your trophy order has entered the Design Stage at EcoTrophy.",
    email_enabled: false,
    email_subject: "Trophy Order In Design Stage - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nYour trophy order has now entered the Design Stage. Our design team is preparing your custom artwork.\n\nBest regards,\nEcoTrophy",
  },
  design_approval: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, your trophy design is ready for approval. Please review the design shared with you and confirm so we can proceed further. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, your trophy design is ready for approval. Please check WhatsApp/Email to confirm. – EcoTrophy",
    email_enabled: false,
    email_subject: "Action Required: Trophy Design Ready for Approval - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nYour trophy design draft is ready for approval. Please review the attached design and reply with your confirmation so we can proceed.\n\nBest regards,\nEcoTrophy",
  },
  quotation_sent: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, we have shared the official quotation for your order of {{quantity}} trophies (Total: {{order_value}}). Please review and let us know if you have any questions. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, quotation for your trophy order has been sent. – EcoTrophy",
    email_enabled: false,
    email_subject: "Official Quotation for Trophy Order - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nPlease find the quotation for your upcoming order of {{quantity}} trophies. Feel free to contact us with any questions.\n\nBest regards,\nEcoTrophy",
  },
  follow_up: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, following up regarding your trophy inquiry for {{event_name}}. Please let us know if you need any assistance or modifications to proceed. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, following up on your trophy inquiry. Let us know how we can assist. – EcoTrophy",
    email_enabled: false,
    email_subject: "Following up on your EcoTrophy inquiry",
    email_template: "Hi {{customer_name}},\n\nJust following up to see if you have any questions regarding your trophy order for {{event_name}}.\n\nBest regards,\nEcoTrophy",
  },
  advance_payment: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, your order has been moved to the Advance Payment stage. Once the advance payment is completed, we will immediately initiate manufacturing. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, please complete the advance payment to start production on your trophy order. – EcoTrophy",
    email_enabled: false,
    email_subject: "Advance Payment Confirmation - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nYour order has been queued for production pending advance payment confirmation.\n\nBest regards,\nEcoTrophy",
  },
  production: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, your trophy design has been approved and your order has now moved to Production. We will keep you updated on the progress. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, your trophy order is now in Production at EcoTrophy.",
    email_enabled: false,
    email_subject: "Order In Production - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nYour trophy design has been approved and your order of {{quantity}} trophies has moved to Production. We will notify you once manufacturing is complete.\n\nBest regards,\nEcoTrophy",
  },
  quality_check: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, your trophies have completed manufacturing and are currently undergoing our thorough Quality Check process before packaging. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, your trophy order is undergoing final quality inspection. – EcoTrophy",
    email_enabled: false,
    email_subject: "Order In Quality Check - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nYour trophies have completed manufacturing and are undergoing quality inspection.\n\nBest regards,\nEcoTrophy",
  },
  ready_for_dispatch: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, your trophy order is ready for dispatch. Our team is preparing the shipment and dispatch details will be shared shortly. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, your trophy order is packed and ready for dispatch. – EcoTrophy",
    email_enabled: false,
    email_subject: "Order Ready for Dispatch - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nYour trophy order is packaged and ready for dispatch. Shipment tracking details will follow shortly.\n\nBest regards,\nEcoTrophy",
  },
  dispatch: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, your trophy order has been dispatched successfully. We will share the tracking/delivery details with you. – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, your trophy order has been dispatched! Tracking details will be shared shortly. – EcoTrophy",
    email_enabled: false,
    email_subject: "Your EcoTrophy Order Has Been Dispatched",
    email_template: "Hi {{customer_name}},\n\nYour order has been dispatched. Tracking number: {{tracking_number}}.\n\nBest regards,\nEcoTrophy",
  },
  delivered: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, your trophy order has been marked as delivered. Thank you for choosing EcoTrophy. We hope the trophies make the occasion memorable.",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, your trophy order has been delivered. Thank you for choosing EcoTrophy!",
    email_enabled: false,
    email_subject: "Order Delivered - Thank You for Choosing EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nYour trophy order has been delivered. We hope the trophies make {{event_name}} truly memorable!\n\nWarm regards,\nEcoTrophy Team",
  },
  full_payment: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, we have successfully recorded the full payment for your order. Thank you for your business! – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, full payment received with thanks. – EcoTrophy",
    email_enabled: false,
    email_subject: "Payment Received in Full - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nWe have received full payment for your order. Thank you for partnering with EcoTrophy.\n\nBest regards,\nEcoTrophy",
  },
  completed: {
    whatsapp_enabled: true,
    whatsapp_template: "Hi {{customer_name}}, your order for {{event_name}} is now marked as Completed. It was a pleasure working with you, and we look forward to crafting trophies for your future events! – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, your order is completed. Thank you for choosing EcoTrophy!",
    email_enabled: false,
    email_subject: "Order Completed - EcoTrophy",
    email_template: "Hi {{customer_name}},\n\nYour order for {{event_name}} is completed. Thank you for choosing EcoTrophy!\n\nWarm regards,\nEcoTrophy",
  },
  lost_cancelled: {
    whatsapp_enabled: false,
    whatsapp_template: "Hi {{customer_name}}, thank you for your interest in EcoTrophy. We have updated your inquiry status. Feel free to contact us whenever you need custom awards in the future! – EcoTrophy",
    sms_enabled: false,
    sms_template: "Hi {{customer_name}}, thank you for considering EcoTrophy for your awards.",
    email_enabled: false,
    email_subject: "EcoTrophy Inquiry Status Update",
    email_template: "Hi {{customer_name}},\n\nThank you for considering EcoTrophy. We hope to work with you on future events.\n\nWarm regards,\nEcoTrophy",
  },
};

export const AVAILABLE_TEMPLATE_VARIABLES = [
  { variable: '{{customer_name}}', label: 'Customer Name', example: 'Aarav Sharma' },
  { variable: '{{company_name}}', label: 'Company / Org', example: 'Rotary Club' },
  { variable: '{{event_name}}', label: 'Event Name', example: 'Annual Sports Day' },
  { variable: '{{event_date}}', label: 'Event Date', example: '24 Oct 2026' },
  { variable: '{{quantity}}', label: 'Quantity', example: '50' },
  { variable: '{{order_value}}', label: 'Order Value', example: '₹35,000' },
  { variable: '{{trophy_size}}', label: 'Trophy Size', example: '8 inches' },
  { variable: '{{sales_person}}', label: 'Sales Person', example: 'Monisha' },
  { variable: '{{design_person}}', label: 'Design Person', example: 'Karthik' },
  { variable: '{{delivery_date}}', label: 'Delivery Date', example: '20 Oct 2026' },
  { variable: '{{tracking_number}}', label: 'Tracking #', example: 'ST49201928' },
  { variable: '{{current_stage}}', label: 'Current Stage', example: 'Design Stage' },
  { variable: '{{previous_stage}}', label: 'Previous Stage', example: 'Requirement Confirmed' },
];

import { Timestamp } from 'firebase/firestore';

export interface PaymentRecord {
  id: string;
  linked_document_id: string;
  linked_document_type: 'invoice' | 'cash_memo' | 'proforma_invoice';
  amount: number;
  method: string;
  date: string;
  reference_number?: string;
  status: 'completed' | 'voided';
  void_reason?: string;
  created_at: Timestamp;
  created_by: string;
}

export type UserRole = 'admin' | 'accounts' | 'sales';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: Timestamp;
}

export interface Customer {
  id: string;
  name: string;
  gst_number?: string;
  billing_address?: string;
  shipping_address?: string;
  email?: string;
  phone?: string;
  whatsapp_number?: string;
  facebook_id?: string;
  instagram_id?: string;
  type?: 'business' | 'individual'; // New: categorizing customer type
  customer_type?: 'new' | 'existing' | 'repeat';
  total_enquiries_count?: number;
  total_orders_count?: number;
  notes?: string;
  created_at: Timestamp;
  updated_at?: Timestamp;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  hsn_code: string;
  retail_price: number;    // Changed: specific price tiers
  wholesale_price: number; // New: wholesale support
  tax_percentage: number;
  category?: string;       // New: for nature (e.g., Trophy)
  size?: string;           // New: for specifications
  specifications?: string[]; // New: list of tags (Nature, Specs)
  stockQuantity?: number;
  costPrice?: number;
  unit?: string;
  priceHistory?: {
    date: any;
    price: number;
    vendorName: string;
    purchaseId: string;
  }[];
  created_at: Timestamp;
}

export interface LineItem {
  product_id?: string;
  description: string;
  desc?: string;
  hsn_code: string;
  quantity: number;
  rate: number;
  tax_percentage: number;
  tax_amount?: number;
  line_total?: number;
  priceTier?: 'retail' | 'wholesale';
}

export interface Quotation {
  id: string;
  number: string;
  customer_id: string;
  customer_name?: string;
  customer_type?: 'gst' | 'non_gst';
  customer_address?: string;
  customer_state?: string;
  customer_gstin?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'convert_requested' | 'converted';
  items: LineItem[];
  subtotal: number;
  tax_total: number;
  grand_total: number;
  advance_amount?: number;
  advance_payment_method?: string;
  advance_payment_date?: any;
  advance_reference_number?: string;
  terms?: string;
  notes?: string;
  validity_days?: number;
  conversion_status?: 'converted';
  convertedToProforma?: boolean;
  linked_proforma_id?: string;
  proformaInvoiceId?: string;
  proformaInvoiceNumber?: string;
  linked_memo_id?: string;
  linked_invoice_id?: string;
  payment_method_to_show?: 'Bank Details' | 'UPI Details' | 'GPay Details' | 'All Payment Details' | 'None';
  created_by: string;
  created_at: Timestamp;
}

export interface Invoice {
  id: string;
  number: string; // format: ECO/YYYY/0001
  customer_id: string;
  customer_name?: string;
  is_gst: boolean; // OFF=cash memo
  is_locked: boolean;
  status: 'draft' | 'finalized' | 'cancelled';
  payment_status: 'unpaid' | 'partial' | 'paid';
  items: LineItem[];
  subtotal: number;
  cgst: number;
  sgst_igst: number;
  tax_total: number;
  round_off: number;
  grand_total: number;
  advance_amount?: number;
  balance_amount?: number;
  payment_history?: string[]; // IDs of PaymentRecords
  linked_quotation_id?: string;
  linked_proforma_id?: string;
  sourceDocumentType?: string;
  sourceProformaId?: string;
  sourceProformaNumber?: string;
  payment_method_to_show?: 'Bank Details' | 'UPI Details' | 'GPay Details' | 'All Payment Details' | 'None';
  created_by: string;
  created_at: Timestamp;
  amount_in_words: string;
}

export interface CashMemo extends Omit<Invoice, 'number'> {
  number: string; // format: MEMO/YYYY/0001
  walk_in_customer?: boolean;
}

export interface ProformaInvoice extends Omit<Invoice, 'number' | 'status'> {
  number: string; // format: PI/YYYY/0001
  status: 'draft' | 'finalized' | 'cancelled' | 'converted';
  sourceDocumentType?: string;
  sourceQuotationId?: string;
  sourceQuotationNumber?: string;
}

export interface PurchaseItem {
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Purchase {
  id: string;
  status: 'draft' | 'uploaded' | 'processing' | 'extracting' | 'classifying' | 'review_ready' | 'submitted' | 'pending_approval' | 'approved' | 'confirmed' | 'rejected' | 'needs_revision' | 'extraction_failed' | 'pending' | 'bank_transfer' | 'cleared' | 'flagged';
  userId: string;
  category: string;
  vendor: {
    name: string;
    address?: string;
    gst_number?: string;
    phone?: string;
  };
  invoice: {
    invoice_number: string;
    invoice_date: string;
    payment_method: string;
  };
  items: PurchaseItem[];
  taxAmount: number;
  grandTotal: number;
  overallConfidence: number;
  duplicateDetected: boolean;
  manualReviewRequired?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  // Fallback for Purchases.tsx display logic temporarily
  amount: number; 
  reference?: string;
  date?: Timestamp;
}

export interface AILearningFeedback {
  id?: string;
  purchaseId: string;
  userId: string;
  field: string;
  predictedValue: any;
  correctedValue: any;
  timestamp: Timestamp;
}

export interface Transaction {
  id: string;
  bank_transaction_id: string;
  date: Timestamp;
  amount: number;
  description: string;
  type: 'credit' | 'debit';
  match_status: 'matched' | 'unmatched' | 'pending_review' | 'approved_advance' | 'approved_expense' | 'ignored';
  suggested_action?: 'partial_payment' | 'advance_payment' | 'expense' | 'unknown';
  category?: 'Sales' | 'Purchase' | 'Maintenance' | 'Assets' | 'Salary' | 'Taxes' | 'General' | string;
  matched_id?: string; // ID of invoice or purchase
  confidence_score?: number;
  match_explanation?: string;
  metadata?: {
    suggested_doc_id?: string;
    suggestion_reason?: string;
  };
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  user_id: string;
  is_read: boolean;
  created_at: Timestamp;
}

export interface Settings {
  // Company Details
  companyName: string;
  companyLogo?: string;
  companyAddress: string;
  companyCity: string;
  companyState: string;
  companyPincode: string;
  companyGstin: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;

  // Bank Details
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;

  // UPI Details
  upiId: string;
  upiPaymentLink: string;
  qrCode?: string;

  // GPay Details
  gpayNumber: string;
  gpayHolderName: string;

  // Other Details
  termsAndConditions: string;
  gstTermsAndConditions?: string;
  nonGstTermsAndConditions?: string;
  notes: string;
  authorizedSignature?: string;
  defaultGst: number;

  // Global settings (existing)
  invoice_prefix: string;
  quotation_prefix?: string;
  proforma_prefix?: string;
  memo_prefix?: string;

  quotation_format?: string;
  proforma_format?: string;
  invoice_format?: string;
  memo_format?: string;

  quotation_year?: string;
  proforma_year?: string;
  invoice_year?: string;
  memo_year?: string;

  quotation_next_number?: number;
  proforma_next_number?: number;
  invoice_next_number?: number;
  memo_next_number?: number;

  email_list: string[];
  weekly_report_day: string;
  monthly_report_date: number;
  allow_backdate_days: number;

  // Meta / social integrations
  metaAppId?: string;
  metaAppSecret?: string;
  metaWebhookVerifyToken?: string;
  metaWebhookCallbackUrl?: string;
  metaPageId?: string;
  instagramAccountId?: string;
  whatsappBusinessAccountId?: string;
  whatsappPhoneNumberId?: string;
  whatsappWebhookCallbackUrl?: string;
  facebookWebhookSubscribed?: boolean;
  instagramWebhookSubscribed?: boolean;
  whatsappWebhookSubscribed?: boolean;
  metaWhatsAppAccessToken?: string;
}

export interface StatementUploadLog {
  id: string;
  bank_name: string;
  start_date: Timestamp;
  end_date: Timestamp;
  upload_date: Timestamp;
  uploaded_by: string;
}

export interface CustomerAdvance {
  id: string;
  customer_id: string;
  amount: number;
  available_credit: number;
  date: Timestamp;
  reference_number: string;
  transaction_id: string;
}

export interface ExpenseRecord {
  id: string;
  transaction_id: string;
  date: Timestamp;
  amount: number;
  category: 'Vendor Purchase' | 'Production Material' | 'Maintenance' | 'Asset Purchase' | 'Salary' | 'Utilities' | 'Transportation' | 'Office Expense' | 'Other';
  description: string;
  vendor?: string;
  status: 'pending_review' | 'approved';
  created_at: Timestamp;
}

export type LeadPlatform = 'meta' | 'google' | 'manual' | 'test';
export type LeadIngestStatus = 'received' | 'created' | 'matched' | 'duplicate' | 'failed';

export interface StageHistoryEntry {
  from_stage: string;
  to_stage: string;
  changed_by: string;
  changed_by_name?: string;
  changed_at: any;
  note?: string;
  notification_triggered?: boolean;
}

export interface NotificationHistoryEntry {
  id: string;
  stage_id: string;
  stage_name: string;
  channel: 'whatsapp' | 'sms' | 'email';
  recipient: string;
  message: string;
  status: 'sent' | 'pending' | 'failed' | 'skipped';
  sent_at: any;
  sent_by: string;
  error?: string;
}

export interface PipelineRule {
  id: string;
  pipeline_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  priority: number;
  field: 'required_quantity' | 'value' | 'customer_type' | 'source' | 'event_type' | 'category' | 'location' | 'urgency' | 'is_repeat_customer' | 'budget';
  operator: 'equals' | 'greater_than_or_equal' | 'less_than_or_equal' | 'between' | 'in' | 'contains';
  value: any;
  secondary_value?: any;
}

export interface StageMessageConfig {
  id: string;
  stage_id: string;
  stage_name: string;
  pipeline_id?: string;
  whatsapp_enabled: boolean;
  whatsapp_template: string;
  sms_enabled: boolean;
  sms_template: string;
  email_enabled: boolean;
  email_subject?: string;
  email_template: string;
  delay_minutes?: number;
  is_active: boolean;
}

export interface Lead {
  id: string;
  name: string;
  company?: string;
  organization?: string;
  phone?: string;
  email?: string;
  location?: string;
  required_quantity?: string | number;
  event_name?: string;
  event_date?: string;
  delivery_date?: string;
  trophy_size?: string;
  sales_person?: string;
  design_person?: string;
  tracking_number?: string;
  source: string;
  platform: LeadPlatform;
  campaign?: string;
  campaign_id?: string;
  ad_id?: string;
  form_id?: string;
  owner_id?: string;
  pipeline_id?: string;
  status: string;
  reason?: string;
  followup_reason?: string;
  normalized_phone?: string;
  normalized_email?: string;
  last_event_id?: string;
  next_follow_up_date?: Timestamp;
  created_at: Timestamp;
  updated_at?: Timestamp;
  value?: number;
  cost?: number;
  // History & audit trail
  stage_history?: StageHistoryEntry[];
  notification_history?: NotificationHistoryEntry[];
  notifications_sent?: Record<string, boolean>;
  // WhatsApp automation fields
  stageEnteredAt?: Timestamp;
  lastCustomerReplyAt?: Timestamp;
  whatsappOptedOut?: boolean;
  leadStatus?: 'active' | 'won' | 'lost';
  // AI Qualification & WhatsApp Inbound Analysis
  qualification_status?: 'Qualified' | 'Not Qualified' | 'Needs Follow-up';
  qualification_reason?: string;
  confidence_score?: number;
  urgency?: 'low' | 'medium' | 'high';
  requirement?: string;
  budget?: string;
  timeline?: string;
  flag_for_review?: boolean;
  suggested_reply?: string;
  next_action?: string;
  // Customer & Meta Omnichannel tracking
  customer_id?: string;
  is_repeat_customer?: boolean;
  customer_lifecycle?: 'new_customer' | 'existing_customer' | 'repeat_customer';
  whatsapp_number?: string;
  facebook_profile?: string;
  instagram_profile?: string;
  campaign_name?: string;
  ad_name?: string;
  ad_set_name?: string;
  event_type?: string;
  trophy_type?: string;
  customer_type?: string;
  last_message?: string;
  last_message_channel?: 'whatsapp' | 'facebook_messenger' | 'facebook_lead_ad' | 'instagram' | 'email';
  last_message_time?: any;
  // Notes & Reminder metadata
  notes_count?: number;
  active_reminder?: {
    note_id?: string;
    datetime: any;
    title: string;
    status: ReminderStatus;
    priority?: NotePriority;
    alarm_enabled?: boolean;
  };
}

export type NotePriority = 'low' | 'medium' | 'high' | 'urgent';
export type NoteCategory = 'general' | 'call' | 'whatsapp' | 'meeting' | 'task' | 'stage_blocker';
export type ReminderStatus = 'pending' | 'triggered' | 'snoozed' | 'completed' | 'dismissed';

export interface TaggedUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface NoteChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  lead_name?: string;
  company?: string;
  phone?: string;
  pipeline_id?: string;
  stage_id?: string;
  stage_name?: string;
  author_id: string;
  author_name: string;
  author_email?: string;
  content: string;
  category: NoteCategory;
  priority: NotePriority;
  is_pinned?: boolean;
  
  // Tagged Team Members
  tagged_users: TaggedUser[];
  
  // Reminder & Alarm Specs
  has_reminder: boolean;
  reminder_datetime?: any; // Firestore Timestamp, Date, or ISO string
  reminder_status?: ReminderStatus;
  alarm_enabled?: boolean;
  alarm_sound?: 'chime' | 'digital' | 'bell' | 'urgent';
  snoozed_until?: any;
  completed_at?: any;
  completed_by?: string;
  
  // Checklist Action Items
  checklist?: NoteChecklistItem[];

  created_at: any;
  updated_at?: any;
}

export interface LeadIntakeEvent {
  id: string;
  event_id: string;
  source: string;
  platform: LeadPlatform;
  status: LeadIngestStatus;
  lead_id?: string;
  message?: string;
  error?: string;
  raw_payload?: unknown;
  created_at: Timestamp;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: 'lead.created' | 'lead.updated' | 'lead.matched' | 'lead.duplicate' | 'message.template.prepared' | 'message.template.queued';
  message: string;
  actor: 'system' | string;
  created_at: Timestamp;
}

export type MessageTemplateChannel = 'whatsapp' | 'email' | 'sms' | 'note';

export interface MessageTemplate {
  id: string;
  name: string;
  channel: MessageTemplateChannel;
  pipeline_id?: string;
  trigger_stage_id?: string;
  subject?: string;
  body: string;
  is_active: boolean;
  created_at: Timestamp;
  updated_at?: Timestamp;
}

export interface MessageQueueItem {
  id: string;
  lead_id: string;
  template_id: string;
  pipeline_id: string;
  channel: MessageTemplateChannel | 'note';
  subject?: string;
  body: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'canceled' | 'skipped';
  created_by?: string;
  error?: string;
  created_at: Timestamp;
  updated_at?: Timestamp;
  // Automation fields (optional – only present for automation-sourced queue items)
  source?: 'automation' | 'manual';
  automationId?: string;
  enrollmentId?: string;
  templateLanguage?: string;
  variables?: Record<string, string>;
  scheduledAt?: Timestamp;
  idempotencyKey?: string;
  metaMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  attemptCount?: number;
  sentAt?: Timestamp;
  deliveredAt?: Timestamp;
  readAt?: Timestamp;
  failedAt?: Timestamp;
  recipient?: string;
  phone?: string;
}

export interface PipelineStage {
  id: string;
  label: string;
  required_fields?: string[]; // New: configurable stage validation requirements (e.g. ['phone', 'email'])
}

export interface Pipeline {
  id: string;
  name: string;
  scenario?: string;
  is_default?: boolean;
  stages: PipelineStage[];
  created_at: Timestamp;
  updated_at?: Timestamp;
  welcome_enabled?: boolean;
  welcome_stage_id?: string;
  welcome_template_id?: string;
}

export const STANDARD_CRM_STAGES: PipelineStage[] = [
  { id: 'new_enquiry', label: 'New Enquiry' },
  { id: 'requirement_collection', label: 'Requirement Collection' },
  { id: 'requirement_confirmed', label: 'Requirement Confirmed' },
  { id: 'design_stage', label: 'Design Stage' },
  { id: 'design_approval', label: 'Design Approval' },
  { id: 'quotation_sent', label: 'Quotation Sent' },
  { id: 'follow_up', label: 'Follow Up' },
  { id: 'advance_payment', label: 'Advance Payment' },
  { id: 'production', label: 'Production' },
  { id: 'quality_check', label: 'Quality Check' },
  { id: 'ready_for_dispatch', label: 'Ready for Dispatch' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'full_payment', label: 'Full Payment' },
  { id: 'completed', label: 'Completed' },
  { id: 'lost_cancelled', label: 'Lost / Cancelled', required_fields: ['reason'] },
];

export const DEFAULT_QUANTITY_PIPELINES: Pipeline[] = [
  {
    id: 'small_order',
    name: 'Small Order Pipeline',
    scenario: '1–9 Pieces',
    is_default: false,
    stages: STANDARD_CRM_STAGES,
    created_at: new Date() as any,
  },
  {
    id: 'regular_order',
    name: 'Regular Order Pipeline',
    scenario: '10–99 Pieces',
    is_default: true,
    stages: STANDARD_CRM_STAGES,
    created_at: new Date() as any,
  },
  {
    id: 'bulk_order',
    name: 'Bulk Order Pipeline',
    scenario: '100+ Pieces',
    is_default: false,
    stages: STANDARD_CRM_STAGES,
    created_at: new Date() as any,
  },
  {
    id: 'unclassified',
    name: 'Unclassified / Requirement Pending',
    scenario: 'Requirement Pending',
    is_default: false,
    stages: STANDARD_CRM_STAGES,
    created_at: new Date() as any,
  },
];

export interface Contact {
  id: string;
  organization_id?: string;
  name: string;
  email?: string;
  phone?: string;
  created_at: Timestamp;
  updated_at?: Timestamp;
}

export interface Organization {
  id: string;
  name: string;
  created_at: Timestamp;
  updated_at?: Timestamp;
}

export interface Opportunity {
  id: string;
  lead_id: string;
  contact_id?: string;
  organization_id?: string;
  value: number;
  expected_close_date?: Timestamp;
  status: 'open' | 'won' | 'lost';
  created_at: Timestamp;
  updated_at?: Timestamp;
}

export interface Automation {
  id: string;
  name: string;
  trigger_event: 'stage_change';
  pipeline_id: string;
  trigger_stage_id: string;
  action_type: 'whatsapp' | 'email' | 'sms' | 'stub';
  template_id: string;
  is_active: boolean;
  created_at: Timestamp;
}

export interface AutomationRun {
  id: string;
  lead_id: string;
  automation_id: string;
  trigger_type: string;
  stage_id: string;
  status: 'success' | 'failed' | 'skipped' | 'retry' | 'blocked';
  error_message?: string;
  run_at: Timestamp;
  idempotency_key: string; // combination of leadId_trigger_stage_template
}

export interface AuditLog {
  id: string;
  document_type: 'lead' | 'invoice' | 'cash_memo' | 'proforma_invoice' | 'quotation' | 'permission' | 'settings';
  document_id: string;
  action: 'create' | 'update' | 'delete' | 'permission_change' | 'price_change' | 'reconciliation' | 'automation_edit';
  user_id: string;
  timestamp: Timestamp;
  notes?: string;
}

export type CRMPermissionAction =
  | 'view_lead'
  | 'create_lead'
  | 'edit_lead'
  | 'assign_lead'
  | 'move_stage'
  | 'send_message'
  | 'manage_automation'
  | 'export_data'
  | 'view_audit_logs';

export const CRM_ROLE_PERMISSIONS: Record<UserRole, CRMPermissionAction[]> = {
  admin: [
    'view_lead',
    'create_lead',
    'edit_lead',
    'assign_lead',
    'move_stage',
    'send_message',
    'manage_automation',
    'export_data',
    'view_audit_logs',
  ],
  accounts: [
    'view_lead',
    'move_stage',
    'send_message',
  ],
  sales: [
    'view_lead',
    'create_lead',
    'edit_lead',
    'assign_lead',
    'move_stage',
    'send_message',
  ],
};

// ─── WhatsApp Automation Types ────────────────────────────────────────────

export type AudienceMode = 'current_leads' | 'future_leads' | 'current_and_future';
export type ScheduleType = 'immediate' | 'fixed_date' | 'days_after_stage' | 'repeat_followup';
export type AutomationStatus = 'active' | 'paused' | 'draft';
export type EnrollmentStatus = 'scheduled' | 'processing' | 'completed' | 'cancelled' | 'failed';
export type WorkflowNodeType =
  | 'trigger'
  | 'condition'
  | 'delay'
  | 'whatsapp'
  | 'payment_condition'
  | 'production_condition'
  | 'dispatch_condition'
  | 'review_delay'
  | 'stop_condition'
  | 'end'
  | 'add';

export interface WorkflowNodeWarning {
  code: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface WorkflowNodeData {
  title: string;
  summary: string;
  description?: string;
  icon?: string;
  config?: Record<string, any>;
  warnings?: WorkflowNodeWarning[];
}

export interface WorkflowNodeConfig {
  id: string;
  type: WorkflowNodeType;
  data: WorkflowNodeData;
  position?: { x: number; y: number };
}

export interface WorkflowEdgeConfig {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
}

export interface WhatsAppAutomation {
  id: string;
  name: string;
  status: AutomationStatus;
  pipelineId: string;
  stageId: string;
  audienceMode: AudienceMode;
  scheduleType: ScheduleType;
  fixedScheduledAt?: Timestamp;
  delayDays?: number;
  sendTime?: string;           // HH:MM
  timezone: string;            // e.g. 'Asia/Kolkata'
  repeatEnabled?: boolean;
  repeatEveryDays?: number;
  maxMessagesPerLead?: number;
  // WhatsApp template
  templateId?: string;         // internal message_templates doc id (optional reference)
  metaTemplateName: string;    // exact name in Meta Business Manager
  templateLanguage: string;    // e.g. 'en_US'
  variableMappings?: Record<string, string>; // {{1}} -> 'name', etc.
  // Stop conditions
  stopOnReply: boolean;
  stopOnStageChange: boolean;
  skipWon: boolean;
  skipLost: boolean;
  skipOptedOut: boolean;
  preventDuplicate: boolean;
  workflowNodes?: WorkflowNodeConfig[];
  workflowEdges?: WorkflowEdgeConfig[];
  workflowVersion?: number;
  publishedVersion?: number;
  draftUpdatedAt?: Timestamp;
  publishedAt?: Timestamp;
  // Metadata
  createdBy: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface AutomationEnrollment {
  id: string;
  automationId: string;
  leadId: string;
  enrolledStageId: string;
  enrolledAt: Timestamp;
  scheduledAt: Timestamp;
  currentMessageNumber: number;
  maxMessages: number;
  status: EnrollmentStatus;
  cancelReason?: string;
  idempotencyKey: string;
  lastExecutionAt?: Timestamp;
  nextExecutionAt?: Timestamp;
  processingStartedAt?: Timestamp;
  processingBy?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

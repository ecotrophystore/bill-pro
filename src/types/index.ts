import { Timestamp } from 'firebase/firestore';

export interface PaymentRecord {
  id: string;
  payment_id: string;
  document_type: 'quotation' | 'invoice' | 'cash_memo';
  document_id: string;
  customer_id: string;
  payment_method: string;
  payment_amount: number;
  payment_date: Timestamp;
  reference_number?: string;
  created_by: string;
  created_at: Timestamp;
  is_voided?: boolean;
  void_reason?: string;
  voided_by?: string;
  voided_at?: Timestamp;
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
  gst_number: string;
  billing_address: string;
  shipping_address?: string;
  email?: string;
  phone?: string;
  type: 'business' | 'individual'; // New: categorizing customer type
  notes?: string;
  created_at: Timestamp;
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
  created_at: Timestamp;
}

export interface LineItem {
  product_id?: string;
  description: string;
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
  customer_type?: 'gst' | 'non_gst';
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'convert_requested' | 'converted';
  items: LineItem[];
  subtotal: number;
  tax_total: number;
  grand_total: number;
  advance_amount?: number;
  advance_payment_method?: string;
  advance_payment_date?: Timestamp;
  advance_reference_number?: string;
  terms?: string;
  validity_days?: number;
  conversion_status?: 'converted';
  linked_invoice_id?: string;
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
  created_by: string;
  created_at: Timestamp;
  amount_in_words: string;
}

export interface CashMemo extends Omit<Invoice, 'number'> {
  number: string; // format: MEMO/YYYY/0001
  walk_in_customer?: boolean;
}

export interface PurchaseItem {
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Purchase {
  id: string;
  status: 'draft' | 'uploaded' | 'processing' | 'extracting' | 'classifying' | 'review_ready' | 'submitted' | 'pending_approval' | 'approved' | 'confirmed' | 'rejected' | 'needs_revision' | 'extraction_failed';
  userId: string;
  category: string;
  vendor: {
    name: string;
    address: string;
    gst_number: string;
    phone: string;
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
  amount?: number; 
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
  company_name: string;
  gst_number: string;
  invoice_prefix: string;
  email_list: string[];
  weekly_report_day: string; // e.g., 'Monday'
  monthly_report_date: number; // e.g., 1
  allow_backdate_days: number;
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

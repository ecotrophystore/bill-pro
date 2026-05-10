import { Timestamp } from 'firebase/firestore';

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
  image_url?: string;      // New: product image URL
  vendor?: string;         // New: product vendor/brand
  sku?: string;            // New: SKU from Shopify
  created_at: Timestamp;
}

export interface LineItem {
  product_id?: string;
  description: string;
  hsn_code: string;
  quantity: number;
  rate: number;
  tax_percentage: number;
  tax_amount: number;
  line_total: number;
}

export interface Quotation {
  id: string;
  number: string;
  customer_id: string;
  status: 'draft' | 'sent' | 'convert_requested' | 'converted';
  items: LineItem[];
  subtotal: number;
  tax_total: number;
  grand_total: number;
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
  linked_quotation_id?: string;
  created_by: string;
  created_at: Timestamp;
  amount_in_words: string;
}

export interface CashMemo extends Omit<Invoice, 'number'> {
  number: string; // format: MEMO/YYYY/0001
  walk_in_customer?: boolean;
}

export interface Purchase {
  id: string;
  vendor: string;
  reference: string;
  date: Timestamp;
  amount: number;
  category: string;
  description?: string;
  status: 'pending' | 'cleared' | 'flagged';
  created_at?: Timestamp;
}

export interface Transaction {
  id: string;
  bank_transaction_id: string;
  date: Timestamp;
  amount: number;
  description: string;
  type: 'credit' | 'debit';
  match_status: 'matched' | 'unmatched';
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

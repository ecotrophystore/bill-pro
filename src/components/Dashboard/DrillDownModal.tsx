import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  ExternalLink, 
  Search, 
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  FileText,
  Building,
  Phone,
  Trash2
} from 'lucide-react';
import type { Lead, Invoice, CashMemo, ProformaInvoice, Quotation, Purchase } from '../../types';
import type { DrillDownType } from './ExecutiveSummaryCards';
import { STAGE_LABEL_MAP, parseDate, getDocAmount, getItemDate } from '../../utils/dashboardMetrics';

interface UnifiedSalesRecord {
  id: string;
  docType: 'Invoice' | 'Cash Memo' | 'Proforma' | 'Purchase';
  number: string;
  customer_name: string;
  grand_total: number;
  balance_amount: number;
  cleared_amount: number;
  payment_status: string;
  status: string;
  displayDate: string;
  route: string;
}

interface DrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: DrillDownType | string | null;
  leads: Lead[];
  invoices: Invoice[];
  cashMemos: CashMemo[];
  proformaInvoices?: ProformaInvoice[];
  quotations?: Quotation[];
  purchases?: any[];
}

export const DrillDownModal: React.FC<DrillDownModalProps> = ({
  isOpen,
  onClose,
  type,
  leads,
  invoices,
  cashMemos,
  proformaInvoices = [],
  quotations = [],
  purchases = []
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  if (!isOpen || !type) return null;

  let title = 'Underlying Records';
  let subtitle = 'Drill-down breakdown';
  let isLeadData = false;
  let isSalesData = false;
  let displayedLeads: Lead[] = [];
  let displayedSales: UnifiedSalesRecord[] = [];

  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Build unified sales collection across all document types
  const allSalesRecords: UnifiedSalesRecord[] = [
    // 1. Tax Invoices
    ...invoices.filter(i => i.status !== 'cancelled').map(i => {
      const grand = getDocAmount(i);
      const bal = i.payment_status === 'paid' ? 0 : (Number(i.balance_amount) || grand);
      return {
        id: i.id,
        docType: 'Invoice' as const,
        number: i.number || 'Draft Inv',
        customer_name: i.customer_name || 'Direct Customer',
        grand_total: grand,
        balance_amount: bal,
        cleared_amount: Math.max(0, grand - bal),
        payment_status: i.payment_status || 'unpaid',
        status: i.status || 'finalized',
        displayDate: getItemDate(i)?.toLocaleDateString('en-IN') || '-',
        route: '/invoices'
      };
    }),
    // 2. Cash Memos (Always 100% cleared cash)
    ...cashMemos.filter(m => m.status !== 'cancelled').map(m => {
      const grand = getDocAmount(m);
      return {
        id: m.id,
        docType: 'Cash Memo' as const,
        number: m.number || 'Cash Memo',
        customer_name: m.customer_name || 'Walk-in Customer',
        grand_total: grand,
        balance_amount: 0,
        cleared_amount: grand,
        payment_status: 'paid',
        status: m.status || 'finalized',
        displayDate: getItemDate(m)?.toLocaleDateString('en-IN') || '-',
        route: '/cash-memos'
      };
    }),
    // 3. Proforma Invoices (Standalone B2B bookings)
    ...proformaInvoices.filter(p => p.status !== 'cancelled').map(p => {
      const grand = getDocAmount(p);
      const bal = p.payment_status === 'paid' ? 0 : (Number(p.balance_amount) || grand);
      return {
        id: p.id,
        docType: 'Proforma' as const,
        number: p.number || 'Proforma',
        customer_name: p.customer_name || 'Direct Customer',
        grand_total: grand,
        balance_amount: bal,
        cleared_amount: Math.max(0, grand - bal),
        payment_status: p.payment_status || 'unpaid',
        status: p.status || 'draft',
        displayDate: getItemDate(p)?.toLocaleDateString('en-IN') || '-',
        route: '/proforma-invoices'
      };
    })
  ];

  switch (type) {
    case 'total_leads':
      title = 'Captured Inquiries & Leads';
      subtitle = 'All client inquiries recorded across acquisition channels';
      isLeadData = true;
      displayedLeads = leads;
      break;

    case 'active_orders':
      title = 'Active Production Orders';
      subtitle = 'Orders and inquiries currently progressing through shop floor gates';
      isLeadData = true;
      displayedLeads = leads.filter(l => 
        ['advance_payment', 'production', 'quality_check', 'ready_for_dispatch', 'dispatch', 'design_stage', 'design_approval', 'requirement_confirmed'].includes(l.status || '')
      );
      if (displayedLeads.length === 0 && allSalesRecords.length > 0) {
        // Fallback to active invoices if leads collection isn't used for shop floor
        isLeadData = false;
        isSalesData = true;
        displayedSales = allSalesRecords.filter(s => s.payment_status !== 'paid');
      }
      break;

    case 'pending_followups':
      title = 'Pending Follow-ups';
      subtitle = "Action items and leads requiring today's client follow-up";
      isLeadData = true;
      displayedLeads = leads.filter(l => {
        if (l.leadStatus === 'lost' || l.leadStatus === 'won' || l.status === 'lost_cancelled') return false;
        if (l.status === 'follow_up' || l.qualification_status === 'Needs Follow-up') return true;
        const d = parseDate(l.next_follow_up_date);
        return d && d <= endOfToday;
      });
      break;

    case 'total_sales':
      title = 'Total Sales & Revenue Documents';
      subtitle = 'All confirmed Invoices, Cash Memos, and Proformas';
      isSalesData = true;
      displayedSales = allSalesRecords;
      break;

    case 'payments_received':
      title = 'Cleared Collections & Realized Cash';
      subtitle = 'Cash memos and invoices with cleared payments';
      isSalesData = true;
      displayedSales = allSalesRecords.filter(s => s.cleared_amount > 0 || s.payment_status === 'paid' || s.payment_status === 'partial');
      break;

    case 'outstanding_amounts':
      title = 'Pending Balances & Receivables';
      subtitle = 'Accounts with pending dues requiring collection follow-up';
      isSalesData = true;
      displayedSales = allSalesRecords.filter(s => s.balance_amount > 0 || s.payment_status === 'unpaid' || s.payment_status === 'partial');
      break;

    case 'purchases':
      title = 'Vendor Purchase Records';
      subtitle = 'All procurement and vendor bill entries recorded in the database';
      isSalesData = true;
      displayedSales = (purchases || []).map((p: any) => {
        const amt = Number(p.grandTotal || p.amount || p.total || 0);
        const vendorName = typeof p.vendor === 'string' ? p.vendor : p.vendor?.name || 'Unknown Vendor';
        const ref = p.invoice?.invoice_number || p.reference || p.id;
        const d = getItemDate(p);
        return {
          id: p.id,
          docType: 'Purchase' as const,
          number: ref,
          customer_name: vendorName,
          grand_total: amt,
          balance_amount: 0,
          cleared_amount: amt,
          payment_status: p.status || 'cleared',
          status: p.status || 'submitted',
          displayDate: d ? d.toLocaleDateString('en-IN') : 'No Date',
          route: '/purchases'
        };
      });
      break;

    default:
      // Pipeline stage drill-down
      if (typeof type === 'string' && STAGE_LABEL_MAP[type]) {
        title = `Stage: ${STAGE_LABEL_MAP[type]}`;
        subtitle = `Leads currently positioned in this workflow gate`;
        isLeadData = true;
        displayedLeads = leads.filter(l => l.status === type);
      } else {
        title = 'Filtered Records';
        subtitle = 'Record breakdown';
        isLeadData = true;
        displayedLeads = leads;
      }
      break;
  }

  const filteredLeads = displayedLeads.filter(l => 
    !search || 
    l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.company?.toLowerCase().includes(search.toLowerCase()) ||
    l.phone?.includes(search) ||
    l.requirement?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSales = displayedSales.filter(s => 
    !search || 
    s.number?.toLowerCase().includes(search.toLowerCase()) ||
    s.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative bg-surface rounded-2xl border border-shadow-darker/10 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col z-10 animate-scale-up overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-shadow-darker/10 flex items-center justify-between bg-surface">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-primary-dark">{title}</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-primary/10 text-primary">
                {isLeadData ? filteredLeads.length : filteredSales.length} records
              </span>
            </div>
            <p className="text-xs text-secondary mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-secondary hover:text-primary-dark hover:bg-secondary/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter bar inside modal */}
        <div className="p-4 bg-primary/5 border-b border-shadow-darker/10 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input
              type="text"
              placeholder="Search records by number, customer, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="neo-input !py-1.5 !pl-8 text-xs w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary hidden sm:inline">
              Click 'View' or 'Delete' to manage documents
            </span>
          </div>
        </div>

        {/* Table Content */}
        <div className="p-5 overflow-y-auto flex-1 custom-sidebar-scrollbar">
          {/* Leads Table */}
          {isLeadData && (
            <div className="overflow-x-auto">
              {filteredLeads.length === 0 ? (
                <div className="py-12 text-center text-secondary space-y-2">
                  <p className="font-semibold text-sm">No records match the current criteria.</p>
                  <p className="text-xs text-secondary/70">Try clearing the search box or check other pipeline filters.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10">
                    <tr>
                      <th className="p-3">Client / Name</th>
                      <th className="p-3">Phone / Contact</th>
                      <th className="p-3">Stage / Gate</th>
                      <th className="p-3">Requirement</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-shadow-darker/5">
                    {filteredLeads.map(lead => (
                      <tr key={lead.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-primary-dark">{lead.name || 'Unnamed'}</div>
                          <div className="text-[10px] text-secondary">{lead.company || 'Direct'}</div>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-secondary">
                          {lead.phone || '-'}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary-dark">
                            {STAGE_LABEL_MAP[lead.status] || lead.status}
                          </span>
                        </td>
                        <td className="p-3 text-secondary truncate max-w-xs">
                          {lead.requirement || lead.trophy_type || '-'}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate(`/leads/${lead.id}`);
                            }}
                            className="neo-btn !py-1 !px-2.5 text-xs text-primary font-bold inline-flex items-center gap-1"
                          >
                            Open <ExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Sales Records Table (Invoices + Cash Memos + Proformas) */}
          {isSalesData && (
            <div className="overflow-x-auto">
              {filteredSales.length === 0 ? (
                <div className="py-12 text-center text-secondary space-y-2">
                  <p className="font-semibold text-sm">No sales records found in this category.</p>
                  <p className="text-xs text-secondary/70">Create a new invoice, cash memo, or adjust the date filter to see records.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10">
                    <tr>
                      <th className="p-3">Doc #</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Grand Total</th>
                      <th className="p-3">Balance Due</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-shadow-darker/5">
                    {filteredSales.map(doc => (
                      <tr key={doc.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3 font-bold text-primary-dark">{doc.number}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            doc.docType === 'Invoice'
                              ? 'bg-emerald-100 text-emerald-800'
                              : doc.docType === 'Cash Memo'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {doc.docType}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-primary-dark">{doc.customer_name}</td>
                        <td className="p-3 text-secondary font-mono text-[11px]">{doc.displayDate}</td>
                        <td className="p-3 font-bold text-primary-dark">₹{doc.grand_total.toLocaleString('en-IN')}</td>
                        <td className="p-3 font-black text-rose-600">
                          {doc.balance_amount > 0 ? `₹${doc.balance_amount.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            doc.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {doc.payment_status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate(doc.route);
                              }}
                              className="neo-btn !py-1 !px-2.5 text-xs text-primary font-bold inline-flex items-center gap-1"
                            >
                              View <ExternalLink size={12} />
                            </button>
                            {doc.docType === 'Purchase' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm(`Delete purchase record for ${doc.customer_name} (₹${doc.grand_total})?`)) return;
                                  try {
                                    const { doc: firestoreDoc, deleteDoc: firestoreDelete } = await import('firebase/firestore');
                                    const { db } = await import('../../lib/firebase');
                                    if (!db) return;
                                    await firestoreDelete(firestoreDoc(db, 'purchases', doc.id));
                                    alert("Purchase record deleted.");
                                    onClose();
                                  } catch (e: any) {
                                    alert("Failed to delete purchase: " + e.message);
                                  }
                                }}
                                className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                                title="Delete this purchase record"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

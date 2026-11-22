import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PhoneCall,
  Clock,
  AlertTriangle,
  Truck,
  MessageSquare,
  ExternalLink,
  Search,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  User,
  ArrowUpRight
} from 'lucide-react';
import type { Lead, Invoice, CashMemo, ProformaInvoice } from '../../types';
import { openWhatsAppWebDirect } from '../../services/stageNotificationService';
import { STAGE_LABEL_MAP, parseDate, PRODUCTION_STAGES } from '../../utils/dashboardMetrics';

interface ActionableOperationalTablesProps {
  leads: Lead[];
  invoices: Invoice[];
  cashMemos?: CashMemo[];
  proformaInvoices?: ProformaInvoice[];
}

type TabKey = 'followups' | 'production' | 'overdue' | 'dispatches';

export const ActionableOperationalTables: React.FC<ActionableOperationalTablesProps> = ({
  leads,
  invoices,
  cashMemos = [],
  proformaInvoices = []
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('followups');
  const [searchTerm, setSearchTerm] = useState('');

  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // 1. Today's Priority Follow-ups
  const priorityFollowups = leads.filter(l => {
    if (l.leadStatus === 'lost' || l.leadStatus === 'won' || l.status === 'lost_cancelled') return false;
    if (l.status === 'follow_up' || l.qualification_status === 'Needs Follow-up') return true;
    const fDate = parseDate(l.next_follow_up_date);
    return fDate && fDate <= endOfToday;
  }).sort((a, b) => {
    const da = parseDate(a.next_follow_up_date)?.getTime() || 0;
    const db = parseDate(b.next_follow_up_date)?.getTime() || 0;
    return da - db;
  });

  // 2. Active Production Orders
  const activeProductionOrders = leads.filter(l => {
    const s = l.status || '';
    return PRODUCTION_STAGES.includes(s) && l.leadStatus !== 'lost' && l.leadStatus !== 'won';
  });

  // 3. Overdue Payments & Balances (Invoices + Proformas)
  const overdueInvoices = [
    ...invoices.filter(i => i.status !== 'cancelled' && (i.payment_status === 'unpaid' || i.payment_status === 'partial')),
    ...proformaInvoices.filter(p => p.status !== 'cancelled' && (p.payment_status === 'unpaid' || p.payment_status === 'partial'))
  ].sort((a, b) => (Number(b.balance_amount) || 0) - (Number(a.balance_amount) || 0));

  // 4. Upcoming Dispatches (Orders in ready_for_dispatch or dispatch, or with delivery_date)
  const upcomingDispatches = leads.filter(l => {
    const s = l.status || '';
    return (s === 'ready_for_dispatch' || s === 'dispatch' || !!l.delivery_date) && l.leadStatus !== 'lost';
  });

  const handleOpenWhatsApp = (lead: Lead) => {
    const phone = lead.phone || lead.whatsapp_number;
    if (!phone) {
      alert("No phone or WhatsApp number available for this contact.");
      return;
    }
    const defaultMsg = `Hello ${lead.name || 'Sir/Madam'}, this is regarding your trophy and awards inquiry with EcoBill. How may we assist you today?`;
    openWhatsAppWebDirect(phone, defaultMsg);
  };

  const handleSendPaymentReminder = (inv: Invoice | ProformaInvoice) => {
    const balance = inv.balance_amount || inv.grand_total;
    const msg = `Dear ${inv.customer_name || 'Customer'}, gentle reminder regarding document #${inv.number}. The pending balance is ₹${balance.toLocaleString('en-IN')}. Please share payment confirmation once processed. Thank you!`;
    const targetUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(targetUrl, '_blank');
  };

  return (
    <div className="neo-card p-6 border border-shadow-darker/10 space-y-5">
      {/* Table Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-shadow-darker/10 pb-4">
        <div>
          <h3 className="font-bold text-lg text-primary-dark">Actionable Operational Tasks</h3>
          <p className="text-xs text-secondary mt-0.5">Surface immediate tasks without navigating away from the dashboard</p>
        </div>

        {/* Tab Buttons */}
        <div className="inline-flex rounded-xl bg-surface p-1 border border-shadow-darker/10 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('followups')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'followups'
                ? 'bg-primary text-white shadow-xs'
                : 'text-secondary hover:text-primary-dark'
            }`}
          >
            <PhoneCall size={13} />
            Today's Priority ({priorityFollowups.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('production')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'production'
                ? 'bg-primary text-white shadow-xs'
                : 'text-secondary hover:text-primary-dark'
            }`}
          >
            <Layers size={13} />
            Shop Floor Orders ({activeProductionOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('overdue')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'overdue'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-amber-900 hover:text-amber-950 font-bold'
            }`}
          >
            <AlertTriangle size={13} />
            Overdue Balances ({overdueInvoices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dispatches')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'dispatches'
                ? 'bg-primary text-white shadow-xs'
                : 'text-secondary hover:text-primary-dark'
            }`}
          >
            <Truck size={13} />
            Dispatches ({upcomingDispatches.length})
          </button>
        </div>
      </div>

      {/* Filter / Search within operational tab */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search by client, order, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="neo-input !py-1.5 !pl-8 text-xs w-full"
          />
        </div>
        <span className="text-[11px] text-secondary">
          Showing real-time records
        </span>
      </div>

      {/* Content for Active Tab */}
      <div className="overflow-x-auto min-h-[220px]">
        {/* Tab 1: Today's Priority Follow-ups */}
        {activeTab === 'followups' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10">
              <tr>
                <th className="p-3">Client / Company</th>
                <th className="p-3">Requirement</th>
                <th className="p-3">Urgency</th>
                <th className="p-3">Follow-up Due</th>
                <th className="p-3 text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shadow-darker/5">
              {priorityFollowups.filter(l => 
                !searchTerm || 
                l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.phone?.includes(searchTerm)
              ).length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-secondary">
                    No pending follow-ups due today. You are all caught up!
                  </td>
                </tr>
              ) : (
                priorityFollowups
                  .filter(l => 
                    !searchTerm || 
                    l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    l.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    l.phone?.includes(searchTerm)
                  )
                  .slice(0, 10)
                  .map(lead => {
                    const fDate = parseDate(lead.next_follow_up_date);
                    const isPast = fDate && fDate < new Date();
                    return (
                      <tr key={lead.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-primary-dark">{lead.name || 'Unnamed Client'}</div>
                          <div className="text-[10px] text-secondary">{lead.company || lead.phone || 'Direct Customer'}</div>
                        </td>
                        <td className="p-3 max-w-xs truncate">
                          <span className="font-medium text-primary-dark">
                            {lead.requirement || lead.trophy_type || lead.event_name || 'Standard Trophy Enquiry'}
                          </span>
                          {lead.required_quantity && (
                            <span className="text-[10px] text-secondary block">Qty: {lead.required_quantity}</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            lead.urgency === 'high' 
                              ? 'bg-rose-100 text-rose-700' 
                              : lead.urgency === 'medium'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-sky-100 text-sky-700'
                          }`}>
                            {lead.urgency?.toUpperCase() || 'NORMAL'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`font-semibold ${isPast ? 'text-rose-600' : 'text-primary-dark'}`}>
                            {fDate ? fDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Today'}
                          </span>
                          {isPast && <span className="block text-[9px] text-rose-500 font-bold">OVERDUE</span>}
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenWhatsApp(lead)}
                            className="neo-btn !py-1 !px-2.5 text-[11px] text-emerald-700 hover:bg-emerald-50 font-bold inline-flex items-center gap-1"
                            title="Open WhatsApp Chat"
                          >
                            <MessageSquare size={12} /> Chat
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/leads/${lead.id}`)}
                            className="neo-btn !py-1 !px-2.5 text-[11px] text-primary font-bold inline-flex items-center gap-1"
                          >
                            View <ExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        )}

        {/* Tab 2: Active Production Orders */}
        {activeTab === 'production' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10">
              <tr>
                <th className="p-3">Client / Order</th>
                <th className="p-3">Specifications</th>
                <th className="p-3">Shop Floor Gate</th>
                <th className="p-3">Target Delivery</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shadow-darker/5">
              {activeProductionOrders.filter(l => 
                !searchTerm || 
                l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.company?.toLowerCase().includes(searchTerm.toLowerCase())
              ).length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-secondary">
                    No active production orders moving through the shop floor right now.
                  </td>
                </tr>
              ) : (
                activeProductionOrders
                  .filter(l => 
                    !searchTerm || 
                    l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    l.company?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .slice(0, 10)
                  .map(lead => (
                    <tr key={lead.id} className="hover:bg-primary/5 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-primary-dark">{lead.name}</div>
                        <div className="text-[10px] text-secondary">{lead.company || 'Direct'}</div>
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-primary-dark">
                          {lead.trophy_type || lead.trophy_size || 'Custom Award'}
                        </span>
                        <div className="text-[10px] text-secondary">
                          Qty: <span className="font-bold text-primary-dark">{lead.required_quantity || '1'}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-800 border border-amber-500/20">
                          <Layers size={11} /> {STAGE_LABEL_MAP[lead.status] || lead.status}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-primary-dark">
                        {lead.delivery_date ? new Date(lead.delivery_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Flexible'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/pipeline`)}
                          className="neo-btn !py-1 !px-2.5 text-[11px] text-primary font-bold inline-flex items-center gap-1"
                        >
                          Pipeline Board <ArrowUpRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        )}

        {/* Tab 3: Overdue Payments & Balances */}
        {activeTab === 'overdue' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10">
              <tr>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Grand Total</th>
                <th className="p-3">Pending Balance</th>
                <th className="p-3 text-right">Collection Follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shadow-darker/5">
              {overdueInvoices.filter(i => 
                !searchTerm || 
                i.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                i.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
              ).length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-secondary">
                    All customer invoices are cleared or fully paid!
                  </td>
                </tr>
              ) : (
                overdueInvoices
                  .filter(i => 
                    !searchTerm || 
                    i.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    i.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .slice(0, 10)
                  .map(inv => {
                    const balance = Number(inv.balance_amount) || Number(inv.grand_total) || 0;
                    return (
                      <tr key={inv.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3 font-bold text-primary-dark">
                          {inv.number}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-primary-dark">{inv.customer_name || 'Direct Customer'}</div>
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${
                            inv.payment_status === 'partial' ? 'text-amber-600' : 'text-rose-600'
                          }`}>
                            {inv.payment_status}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-primary-dark">
                          ₹{inv.grand_total.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 font-black text-rose-600">
                          ₹{balance.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => handleSendPaymentReminder(inv)}
                            className="neo-btn !py-1 !px-2.5 text-[11px] text-emerald-700 hover:bg-emerald-50 font-bold inline-flex items-center gap-1"
                            title="Send WhatsApp payment reminder"
                          >
                            <MessageSquare size={12} /> Remind
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate('/invoices')}
                            className="neo-btn !py-1 !px-2.5 text-[11px] text-primary font-bold inline-flex items-center gap-1"
                          >
                            Invoice <ExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        )}

        {/* Tab 4: Upcoming Dispatches */}
        {activeTab === 'dispatches' && (
          <table className="w-full text-left text-xs">
            <thead className="bg-primary/5 text-secondary uppercase font-semibold text-[10px] border-b border-shadow-darker/10">
              <tr>
                <th className="p-3">Recipient / Event</th>
                <th className="p-3">Destination / Location</th>
                <th className="p-3">Target Date</th>
                <th className="p-3">Dispatch Tracking</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shadow-darker/5">
              {upcomingDispatches.filter(l => 
                !searchTerm || 
                l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.location?.toLowerCase().includes(searchTerm.toLowerCase())
              ).length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-secondary">
                    No dispatches scheduled for delivery in this window.
                  </td>
                </tr>
              ) : (
                upcomingDispatches
                  .filter(l => 
                    !searchTerm || 
                    l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    l.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    l.location?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .slice(0, 10)
                  .map(lead => (
                    <tr key={lead.id} className="hover:bg-primary/5 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-primary-dark">{lead.name}</div>
                        <div className="text-[10px] text-secondary">{lead.event_name || lead.company || 'Direct Award'}</div>
                      </td>
                      <td className="p-3 text-secondary font-medium">
                        {lead.location || 'Local Delivery'}
                      </td>
                      <td className="p-3 font-semibold text-primary-dark">
                        {lead.delivery_date ? new Date(lead.delivery_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Immediate'}
                      </td>
                      <td className="p-3">
                        {lead.tracking_number ? (
                          <span className="font-mono text-[11px] font-bold text-primary">
                            #{lead.tracking_number}
                          </span>
                        ) : (
                          <span className="text-[10px] text-secondary font-medium">
                            Ready for Packing
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/leads/${lead.id}`)}
                          className="neo-btn !py-1 !px-2.5 text-[11px] text-primary font-bold inline-flex items-center gap-1"
                        >
                          Details <ExternalLink size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

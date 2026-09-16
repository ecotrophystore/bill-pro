import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  FileText,
  Receipt,
  Banknote,
  Users,
  Building2,
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  Settings,
  Bot,
  Shield,
  Loader2,
  ArrowRight,
  Sparkles,
  Command,
} from 'lucide-react';
import clsx from 'clsx';
import { db } from '../../lib/firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';

interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  path: string;
  category: 'Navigation' | 'Invoices' | 'Quotations' | 'Proformas' | 'Cash Memos' | 'Leads' | 'Customers';
}

const NAV_ACTIONS: SearchResultItem[] = [
  { id: 'nav-dash', title: 'Dashboard', subtitle: 'Overview & quick metrics', badge: 'Page', badgeColor: 'bg-primary/10 text-primary border-primary/20', icon: LayoutDashboard, path: '/dashboard', category: 'Navigation' },
  { id: 'nav-invoices', title: 'Tax Invoices', subtitle: 'GST Invoices list & creation', badge: 'Billing', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Receipt, path: '/invoices', category: 'Navigation' },
  { id: 'nav-create-inv', title: 'Create Tax Invoice', subtitle: 'Generate new GST invoice', badge: 'Action', badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: Receipt, path: '/invoices/new', category: 'Navigation' },
  { id: 'nav-quotations', title: 'Quotations', subtitle: 'GST Quotation estimates', badge: 'Billing', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200', icon: FileText, path: '/quotations', category: 'Navigation' },
  { id: 'nav-create-qtn', title: 'Create Quotation', subtitle: 'Draft a new customer quote', badge: 'Action', badgeColor: 'bg-amber-100 text-amber-800 border-amber-300', icon: FileText, path: '/quotations/new', category: 'Navigation' },
  { id: 'nav-proforma', title: 'Proforma Invoices', subtitle: 'Advance PI documents', badge: 'Billing', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200', icon: FileText, path: '/proforma-invoices', category: 'Navigation' },
  { id: 'nav-cashmemos', title: 'Cash Memos', subtitle: 'Non-GST / walk-in billing', badge: 'Billing', badgeColor: 'bg-purple-50 text-purple-700 border-purple-200', icon: Banknote, path: '/cash-memos', category: 'Navigation' },
  { id: 'nav-leads', title: 'CRM Leads', subtitle: 'Manage inbound and assigned leads', badge: 'CRM', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Users, path: '/leads', category: 'Navigation' },
  { id: 'nav-add-lead', title: 'Add New Lead', subtitle: 'Manual lead intake form', badge: 'CRM', badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300', icon: Users, path: '/leads/new', category: 'Navigation' },
  { id: 'nav-pipeline', title: 'Pipeline Kanban', subtitle: 'Visual stage tracking board', badge: 'CRM', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Users, path: '/pipeline', category: 'Navigation' },
  { id: 'nav-whatsapp', title: 'WhatsApp Automation', subtitle: 'Meta workflows & template sender', badge: 'Automation', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Bot, path: '/whatsapp-automation', category: 'Navigation' },
  { id: 'nav-expense', title: 'Expense Day Book', subtitle: 'Cash ledger & expense tracking', badge: 'Finance', badgeColor: 'bg-rose-50 text-rose-700 border-rose-200', icon: Wallet, path: '/expense', category: 'Navigation' },
  { id: 'nav-purchases', title: 'Purchases & OCR', subtitle: 'Vendor invoice processing', badge: 'Finance', badgeColor: 'bg-teal-50 text-teal-700 border-teal-200', icon: ShoppingCart, path: '/purchases', category: 'Navigation' },
  { id: 'nav-customers', title: 'Customer Library', subtitle: 'Client directory & GST records', badge: 'Library', badgeColor: 'bg-sky-50 text-sky-700 border-sky-200', icon: Building2, path: '/library/customers', category: 'Navigation' },
  { id: 'nav-products', title: 'Product Library', subtitle: 'Items, HSN codes & pricing', badge: 'Library', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200', icon: Receipt, path: '/library/products', category: 'Navigation' },
  { id: 'nav-auditor', title: 'AI Auditor Trail', subtitle: 'Discrepancy checker & audit log', badge: 'Security', badgeColor: 'bg-slate-100 text-slate-700 border-slate-300', icon: Shield, path: '/auditor', category: 'Navigation' },
  { id: 'nav-settings', title: 'Settings & Config', subtitle: 'Numbering sequence, company details, UPI', badge: 'System', badgeColor: 'bg-slate-100 text-slate-700 border-slate-300', icon: Settings, path: '/settings', category: 'Navigation' },
];

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [remoteResults, setRemoteResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Focus input whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Global keyboard shortcut to open modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open handled by parent or toggle
        }
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch live search results from Firestore
  useEffect(() => {
    const queryTerm = searchQuery.trim().toLowerCase();
    if (!queryTerm || queryTerm.length < 2) {
      setRemoteResults([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      if (!db) {
        setLoading(false);
        return;
      }

      try {
        const results: SearchResultItem[] = [];

        // 1. Search Invoices
        const invSnap = await getDocs(query(collection(db, 'invoices'), limit(25)));
        invSnap.forEach((d) => {
          const data = d.data();
          const num = (data.number || '').toLowerCase();
          const cust = (data.customer_name || '').toLowerCase();
          const total = data.grand_total ? `₹${Number(data.grand_total).toLocaleString('en-IN')}` : '';
          if (num.includes(queryTerm) || cust.includes(queryTerm)) {
            results.push({
              id: `inv-${d.id}`,
              title: data.number || 'Tax Invoice',
              subtitle: `${data.customer_name || 'Walk-in'} • ${total} • ${data.status || 'draft'}`,
              badge: 'Invoice',
              badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              icon: Receipt,
              path: `/invoices/edit/${d.id}`,
              category: 'Invoices',
            });
          }
        });

        // 2. Search Quotations
        const qtnSnap = await getDocs(query(collection(db, 'quotations'), limit(25)));
        qtnSnap.forEach((d) => {
          const data = d.data();
          const num = (data.number || '').toLowerCase();
          const cust = (data.customer_name || '').toLowerCase();
          const total = data.grand_total ? `₹${Number(data.grand_total).toLocaleString('en-IN')}` : '';
          if (num.includes(queryTerm) || cust.includes(queryTerm)) {
            results.push({
              id: `qtn-${d.id}`,
              title: data.number || 'Quotation',
              subtitle: `${data.customer_name || 'Customer'} • ${total} • ${data.status || 'draft'}`,
              badge: 'Quote',
              badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
              icon: FileText,
              path: `/quotations/edit/${d.id}`,
              category: 'Quotations',
            });
          }
        });

        // 3. Search Proformas
        const proformaSnap = await getDocs(query(collection(db, 'proformas'), limit(20)));
        proformaSnap.forEach((d) => {
          const data = d.data();
          const num = (data.number || '').toLowerCase();
          const cust = (data.customer_name || '').toLowerCase();
          if (num.includes(queryTerm) || cust.includes(queryTerm)) {
            results.push({
              id: `pi-${d.id}`,
              title: data.number || 'Proforma Invoice',
              subtitle: `${data.customer_name || 'Customer'} • PI Record`,
              badge: 'Proforma',
              badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
              icon: FileText,
              path: `/proforma-invoices/edit/${d.id}`,
              category: 'Proformas',
            });
          }
        });

        // 4. Search Leads
        const leadSnap = await getDocs(query(collection(db, 'leads'), limit(25)));
        leadSnap.forEach((d) => {
          const data = d.data();
          const name = (data.name || '').toLowerCase();
          const phone = (data.phone || '').toLowerCase();
          const email = (data.email || '').toLowerCase();
          if (name.includes(queryTerm) || phone.includes(queryTerm) || email.includes(queryTerm)) {
            results.push({
              id: `lead-${d.id}`,
              title: data.name || 'Lead',
              subtitle: `${data.phone || data.email || 'No contact'} • Stage: ${data.status || 'New'}`,
              badge: 'Lead',
              badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
              icon: Users,
              path: `/leads/${d.id}`,
              category: 'Leads',
            });
          }
        });

        // 5. Search Customers
        const custSnap = await getDocs(query(collection(db, 'customers'), limit(25)));
        custSnap.forEach((d) => {
          const data = d.data();
          const name = (data.name || '').toLowerCase();
          const phone = (data.phone || '').toLowerCase();
          const gstin = (data.gst_number || '').toLowerCase();
          if (name.includes(queryTerm) || phone.includes(queryTerm) || gstin.includes(queryTerm)) {
            results.push({
              id: `cust-${d.id}`,
              title: data.name || 'Customer',
              subtitle: `${data.gst_number ? `GST: ${data.gst_number}` : 'Individual'} • ${data.phone || data.email || ''}`,
              badge: 'Customer',
              badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
              icon: Building2,
              path: `/library/customers`,
              category: 'Customers',
            });
          }
        });

        if (isMounted) {
          setRemoteResults(results);
          setLoading(false);
        }
      } catch (err) {
        console.error('Search error:', err);
        if (isMounted) setLoading(false);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Filter local navigation items based on query
  const filteredNavResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return NAV_ACTIONS.slice(0, 8);
    return NAV_ACTIONS.filter(
      (item) => item.title.toLowerCase().includes(term) || item.subtitle.toLowerCase().includes(term)
    );
  }, [searchQuery]);

  // Combined list of results
  const allResults = useMemo(() => {
    return [...remoteResults, ...filteredNavResults];
  }, [remoteResults, filteredNavResults]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allResults.length]);

  const handleSelect = (item: SearchResultItem) => {
    onClose();
    navigate(item.path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[selectedIndex]) {
        handleSelect(allResults[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl neo-card !p-0 overflow-hidden shadow-2xl border border-shadow-darker/20 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-shadow-darker/10 gap-3 bg-surface">
          <Search size={20} className="text-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search Invoices, Quotes, Leads, Customers, Pages... (↑↓ to navigate, Enter to open)"
            className="w-full bg-transparent border-none outline-none text-primary-dark text-base placeholder:text-secondary/60 font-medium"
          />
          {loading ? (
            <Loader2 size={18} className="animate-spin text-primary shrink-0" />
          ) : searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 text-secondary hover:text-primary-dark rounded transition-colors"
            >
              <X size={18} />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-semibold bg-surface border border-shadow-darker/20 rounded shadow-xs text-secondary">
              <Command size={11} /> K
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-shadow-darker/5 custom-sidebar-scrollbar bg-surface/90">
          {allResults.length === 0 ? (
            <div className="py-12 text-center text-secondary">
              <Sparkles size={32} className="mx-auto mb-2 opacity-30 text-primary" />
              <p className="font-semibold text-primary-dark">No matching records found</p>
              <p className="text-xs mt-1">Try searching by Invoice Number, Customer Name, Phone, or Page Name.</p>
            </div>
          ) : (
            allResults.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={clsx(
                    'flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all duration-150 group my-0.5',
                    isSelected
                      ? 'bg-primary/10 border border-primary/25 shadow-neo-pressed text-primary-dark'
                      : 'hover:bg-shadow-darker/5 text-secondary'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div
                      className={clsx(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                        isSelected ? 'bg-primary text-surface shadow-xs' : 'bg-surface shadow-neo-surface text-primary-dark'
                      )}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-primary-dark truncate">{item.title}</span>
                        <span
                          className={clsx(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0',
                            item.badgeColor
                          )}
                        >
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-xs text-secondary truncate mt-0.5">{item.subtitle}</p>
                    </div>
                  </div>

                  <ArrowRight
                    size={16}
                    className={clsx(
                      'shrink-0 transition-all duration-200',
                      isSelected ? 'opacity-100 translate-x-0 text-primary' : 'opacity-0 -translate-x-2'
                    )}
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts bar */}
        <div className="px-4 py-2.5 border-t border-shadow-darker/10 bg-surface/80 flex items-center justify-between text-[11px] text-secondary">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono bg-surface border border-shadow-darker/20 px-1.5 py-0.5 rounded text-[10px]">↑</kbd>{' '}
              <kbd className="font-mono bg-surface border border-shadow-darker/20 px-1.5 py-0.5 rounded text-[10px]">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="font-mono bg-surface border border-shadow-darker/20 px-1.5 py-0.5 rounded text-[10px]">↵</kbd> to select
            </span>
          </div>
          <span>
            <kbd className="font-mono bg-surface border border-shadow-darker/20 px-1.5 py-0.5 rounded text-[10px]">esc</kbd> to dismiss
          </span>
        </div>
      </div>
    </div>
  );
}

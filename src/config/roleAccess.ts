import type { UserRole } from '../types';

export interface RoleMeta {
  id: UserRole;
  label: string;
  shortLabel: string;
  description: string;
  homePath: string;
}

export const ROLE_META: Record<UserRole, RoleMeta> = {
  admin: {
    id: 'admin',
    label: 'Administrator',
    shortLabel: 'ADMIN',
    description: 'Full unrestricted access to CRM, Billing, Finance, HR, Audit Logs, and System Settings.',
    homePath: '/dashboard',
  },
  hr: {
    id: 'hr',
    label: 'Human Resources (HR)',
    shortLabel: 'HR',
    description: 'Team & Role Management, Staff Directory, Staff Expenses, Audit Logs, and HR Reports.',
    homePath: '/settings?tab=hr_team',
  },
  sales: {
    id: 'sales',
    label: 'Sales Team',
    shortLabel: 'SALES',
    description: 'CRM Pipeline, Leads, WhatsApp Automation, Quotations, Proformas, Invoices, and Customers.',
    homePath: '/pipeline',
  },
  user: {
    id: 'user',
    label: 'Standard User',
    shortLabel: 'USER',
    description: 'Basic workspace: Dashboard, Product Catalog, Expense Submission, Quotations & Cash Memos.',
    homePath: '/dashboard',
  },
  accounts: {
    id: 'accounts',
    label: 'Accounts & Finance',
    shortLabel: 'ACCOUNTS',
    description: 'Billing, Purchases, Bank Reconciliation, Expenses, Reports, and Financial Audits.',
    homePath: '/dashboard',
  },
};

export interface RouteRule {
  prefix: string;
  roles: UserRole[];
}

export const ROUTE_ACCESS_RULES: RouteRule[] = [
  { prefix: '/dashboard', roles: ['admin', 'hr', 'sales', 'user', 'accounts'] },
  { prefix: '/hr', roles: ['admin', 'hr'] },

  // CRM & WhatsApp
  { prefix: '/pipeline', roles: ['admin', 'sales', 'accounts'] },
  { prefix: '/leads', roles: ['admin', 'sales', 'accounts'] },
  { prefix: '/crm-dashboard', roles: ['admin', 'sales'] },
  { prefix: '/whatsapp-automation', roles: ['admin', 'sales'] },
  { prefix: '/stage-automation', roles: ['admin', 'sales'] },
  { prefix: '/lead-intake', roles: ['admin', 'sales'] },
  { prefix: '/company-intelligence', roles: ['admin', 'hr', 'sales'] },

  // Sales & Billing
  { prefix: '/quotations', roles: ['admin', 'sales', 'user', 'accounts'] },
  { prefix: '/cash-memos', roles: ['admin', 'sales', 'user', 'accounts'] },
  { prefix: '/proforma-invoices', roles: ['admin', 'sales', 'accounts'] },
  { prefix: '/invoices', roles: ['admin', 'sales', 'accounts'] },

  // Finance & Purchases
  { prefix: '/purchases', roles: ['admin', 'accounts'] },
  { prefix: '/purchase-analytics', roles: ['admin', 'accounts'] },
  { prefix: '/reconciliation', roles: ['admin', 'accounts'] },
  { prefix: '/expense', roles: ['admin', 'hr', 'user', 'accounts'] },

  // Libraries & Reports
  { prefix: '/library/products', roles: ['admin', 'sales', 'user', 'accounts'] },
  { prefix: '/library/customers', roles: ['admin', 'sales', 'accounts'] },
  { prefix: '/reports', roles: ['admin', 'hr', 'accounts'] },
  { prefix: '/auditor', roles: ['admin', 'accounts'] },
  { prefix: '/audit-logs', roles: ['admin', 'hr', 'accounts'] },
  { prefix: '/settings', roles: ['admin', 'hr'] },
];

export function normalizeRole(role?: string | null): UserRole {
  if (role === 'admin' || role === 'hr' || role === 'sales' || role === 'user' || role === 'accounts') {
    return role;
  }
  return 'user';
}

export function canAccessRoute(role: UserRole | string | null | undefined, pathname: string): boolean {
  const effectiveRole = normalizeRole(role);
  if (effectiveRole === 'admin') return true;

  // Match longest prefix first
  const sortedRules = [...ROUTE_ACCESS_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  const matched = sortedRules.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/')
  );

  if (!matched) {
    // Allow root redirect
    return pathname === '/' || pathname === '';
  }

  return matched.roles.includes(effectiveRole);
}

export function getDefaultRouteForRole(role?: UserRole | string | null): string {
  return ROLE_META[normalizeRole(role)].homePath;
}


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
  design: {
    id: 'design',
    label: 'Design Team',
    shortLabel: 'DESIGN',
    description: 'Design queue, artwork proofs, mockup approvals, and product specifications.',
    homePath: '/pipeline?pipeline=design_pipeline',
  },
  production: {
    id: 'production',
    label: 'Production Team',
    shortLabel: 'PRODUCTION',
    description: 'Production queue, job specs, quality check, and dispatch tracking.',
    homePath: '/pipeline?pipeline=production_pipeline',
  },
};

export interface RouteRule {
  prefix: string;
  roles: UserRole[];
}

export const ROUTE_ACCESS_RULES: RouteRule[] = [
  { prefix: '/dashboard', roles: ['admin', 'hr', 'sales', 'user', 'accounts', 'design', 'production'] },
  { prefix: '/hr', roles: ['admin', 'hr'] },

  // CRM & WhatsApp
  { prefix: '/pipeline', roles: ['admin', 'sales', 'accounts', 'design', 'production'] },
  { prefix: '/trophy-creator', roles: ['admin', 'sales', 'design'] },
  { prefix: '/leads', roles: ['admin', 'sales', 'accounts'] },
  { prefix: '/crm-dashboard', roles: ['admin', 'sales'] },
  { prefix: '/whatsapp-automation', roles: ['admin', 'sales'] },
  { prefix: '/stage-automation', roles: ['admin', 'sales', 'design', 'production'] },
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
  { prefix: '/library/products', roles: ['admin', 'sales', 'user', 'accounts', 'design', 'production'] },
  { prefix: '/library/customers', roles: ['admin', 'sales', 'accounts'] },
  { prefix: '/reports', roles: ['admin', 'hr', 'accounts'] },
  { prefix: '/auditor', roles: ['admin', 'accounts'] },
  { prefix: '/audit-logs', roles: ['admin', 'hr', 'accounts'] },
  { prefix: '/settings', roles: ['admin', 'hr'] },
];

export function normalizeRole(role?: string | null): UserRole {
  if (
    role === 'admin' ||
    role === 'hr' ||
    role === 'sales' ||
    role === 'user' ||
    role === 'accounts' ||
    role === 'design' ||
    role === 'production'
  ) {
    return role;
  }
  return 'user';
}

export function canAccessRoute(role: UserRole | string | null | undefined, pathname: string): boolean {
  const effectiveRole = normalizeRole(role);
  if (effectiveRole === 'admin') return true;

  const rawPath = pathname || '';

  // Pipeline specific sub-workflow routing checks
  if (rawPath.includes('pipeline=design_pipeline') || rawPath.endsWith('/design_pipeline')) {
    return effectiveRole === 'design';
  }
  if (rawPath.includes('pipeline=production_pipeline') || rawPath.endsWith('/production_pipeline')) {
    return effectiveRole === 'production';
  }
  if (rawPath === '/pipeline' || rawPath === '/pipeline/') {
    // Regular sales pipeline: design and production teams only see their dedicated sub-pipeline
    if (effectiveRole === 'design' || effectiveRole === 'production') {
      return false;
    }
  }

  const cleanPath = rawPath.split('?')[0].split('#')[0];

  // Specific directory vs detail check:
  // Design & Production teams do NOT have access to the Leads Directory table or Lead creation
  if (cleanPath === '/leads' || cleanPath === '/leads/' || cleanPath === '/leads/new') {
    if (effectiveRole === 'design' || effectiveRole === 'production') {
      return false;
    }
  }

  // But individual lead profile (/leads/:id) is accessible for design & production to review specs and artwork
  if (cleanPath.startsWith('/leads/') && cleanPath !== '/leads/new') {
    if (effectiveRole === 'design' || effectiveRole === 'production') {
      return true;
    }
  }

  // Match longest prefix first
  const sortedRules = [...ROUTE_ACCESS_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  const matched = sortedRules.find(
    (r) => cleanPath === r.prefix || cleanPath.startsWith(r.prefix + '/')
  );

  if (!matched) {
    // Allow root redirect
    return cleanPath === '/' || cleanPath === '';
  }

  return matched.roles.includes(effectiveRole);
}

export function getDefaultRouteForRole(role?: UserRole | string | null): string {
  return ROLE_META[normalizeRole(role)].homePath;
}


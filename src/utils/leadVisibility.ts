import {
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import type { Lead, User } from '../types';

export function isAdminUser(user?: Pick<User, 'role'> | null): boolean {
  return String(user?.role || '').toLowerCase() === 'admin';
}

export function isSalesTeamUser(user?: Pick<User, 'role'> | null): boolean {
  const role = String(user?.role || '').toLowerCase();
  return (
    role === 'sales' ||
    role === 'admin' ||
    role === 'accounts' ||
    role === 'design' ||
    role === 'production'
  );
}

/**
 * Returns true if the user has permission to view all leads across the company.
 * Everyone on the sales, design, and production teams, as well as administrators and accounts staff, can view leads.
 */
export function canViewAllLeads(user?: Pick<User, 'role'> | null): boolean {
  return isSalesTeamUser(user);
}

export function getLeadOwnerId(lead?: Partial<Lead> | Record<string, any> | null): string {
  if (!lead) return '';
  return String(lead.owner_id || (lead as any).ownerId || '').trim();
}

export function getLeadAssigneeName(lead?: Partial<Lead> | Record<string, any> | null): string {
  if (!lead) return '';
  return String(lead.sales_person || (lead as any).owner_name || '').trim();
}

/**
 * Checks whether a lead is specifically owned by/assigned to a given user.
 */
export function isLeadDirectlyAssignedToUser(
  lead: Partial<Lead> | Record<string, any> | null | undefined,
  user: Pick<User, 'id' | 'name' | 'email'> | null | undefined
): boolean {
  if (!lead || !user) return false;

  const ownerId = getLeadOwnerId(lead);
  if (ownerId) {
    return ownerId === String(user.id || '').trim();
  }

  // Legacy fallback if no explicit owner_id was recorded
  const salesPerson = String(lead.sales_person || '').trim().toLowerCase();
  if (!salesPerson) return false;

  const userName = String(user.name || '').trim().toLowerCase();
  const userEmail = String(user.email || '').trim().toLowerCase();
  return Boolean((userName && salesPerson === userName) || (userEmail && salesPerson === userEmail));
}

/**
 * Returns true if the given user is allowed to view the lead.
 * - Everyone on the sales team (and admins / accounts) can view all leads.
 * - Other users can view if explicitly assigned to them.
 */
export function isLeadAssignedToUser(
  lead: Partial<Lead> | Record<string, any> | null | undefined,
  user: Pick<User, 'id' | 'name' | 'email' | 'role'> | null | undefined
): boolean {
  if (!lead || !user) return false;
  if (canViewAllLeads(user)) return true;
  return isLeadDirectlyAssignedToUser(lead, user);
}

export function filterLeadsForUser<T extends Partial<Lead> | Record<string, any>>(
  leads: T[],
  user: Pick<User, 'id' | 'name' | 'email' | 'role'> | null | undefined
): T[] {
  if (!user) return [];
  if (canViewAllLeads(user)) return leads;
  return leads.filter((lead) => isLeadAssignedToUser(lead, user));
}

/**
 * Subscribes to leads visible to the current user.
 * - Sales team members, admins, and accounts subscribe to all leads.
 * - Scoped users subscribe only to leads where `owner_id == user.id`.
 */
export function subscribeScopedLeads(
  firestore: Firestore | null | undefined,
  user: Pick<User, 'id' | 'name' | 'email' | 'role'> | null | undefined,
  onLeads: (leads: Lead[]) => void,
  onError?: (error: Error) => void,
  adminConstraints: QueryConstraint[] = []
): () => void {
  if (!firestore || !user) {
    onLeads([]);
    return () => {};
  }

  const canViewAll = canViewAllLeads(user);
  const q = canViewAll
    ? adminConstraints.length > 0
      ? query(collection(firestore, 'leads'), ...adminConstraints)
      : query(collection(firestore, 'leads'))
    : query(collection(firestore, 'leads'), where('owner_id', '==', user.id));

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
      // Keep consistent newest-first ordering
      rows.sort((a, b) => {
        const at =
          typeof (a as any).created_at?.toMillis === 'function'
            ? (a as any).created_at.toMillis()
            : ((a as any).created_at?.seconds || 0) * 1000;
        const bt =
          typeof (b as any).created_at?.toMillis === 'function'
            ? (b as any).created_at.toMillis()
            : ((b as any).created_at?.seconds || 0) * 1000;
        return bt - at;
      });
      onLeads(filterLeadsForUser(rows, user));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/**
 * One-shot fetch of leads visible to the current user.
 */
export async function fetchScopedLeads(
  firestore: Firestore | null | undefined,
  user: Pick<User, 'id' | 'name' | 'email' | 'role'> | null | undefined,
  adminConstraints: QueryConstraint[] = []
): Promise<Lead[]> {
  if (!firestore || !user) return [];
  const canViewAll = canViewAllLeads(user);
  const q = canViewAll
    ? adminConstraints.length > 0
      ? query(collection(firestore, 'leads'), ...adminConstraints)
      : query(collection(firestore, 'leads'))
    : query(collection(firestore, 'leads'), where('owner_id', '==', user.id));

  const snap = await getDocs(q).catch(() => null);
  if (!snap) return [];
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
  rows.sort((a, b) => {
    const at =
      typeof (a as any).created_at?.toMillis === 'function'
        ? (a as any).created_at.toMillis()
        : ((a as any).created_at?.seconds || 0) * 1000;
    const bt =
      typeof (b as any).created_at?.toMillis === 'function'
        ? (b as any).created_at.toMillis()
        : ((b as any).created_at?.seconds || 0) * 1000;
    return bt - at;
  });
  return filterLeadsForUser(rows, user);
}

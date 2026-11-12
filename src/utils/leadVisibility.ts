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

export function getLeadOwnerId(lead?: Partial<Lead> | Record<string, any> | null): string {
  if (!lead) return '';
  return String(lead.owner_id || (lead as any).ownerId || '').trim();
}

export function getLeadAssigneeName(lead?: Partial<Lead> | Record<string, any> | null): string {
  if (!lead) return '';
  return String(lead.sales_person || (lead as any).owner_name || '').trim();
}

/**
 * Returns true if the given user is allowed to view the lead.
 * - Admins can view every lead.
 * - Non-admin team members can ONLY view leads assigned to them (by UID or legacy name match when UID is absent).
 */
export function isLeadAssignedToUser(
  lead: Partial<Lead> | Record<string, any> | null | undefined,
  user: Pick<User, 'id' | 'name' | 'email' | 'role'> | null | undefined
): boolean {
  if (!lead || !user) return false;
  if (isAdminUser(user)) return true;

  const ownerId = getLeadOwnerId(lead);
  if (ownerId) {
    return ownerId === String(user.id || '').trim();
  }

  // Legacy fallback only if no explicit owner_id / ownerId was stored on the lead
  const salesPerson = String(lead.sales_person || '').trim().toLowerCase();
  if (!salesPerson) return false;

  const userName = String(user.name || '').trim().toLowerCase();
  const userEmail = String(user.email || '').trim().toLowerCase();
  return Boolean((userName && salesPerson === userName) || (userEmail && salesPerson === userEmail));
}

export function filterLeadsForUser<T extends Partial<Lead> | Record<string, any>>(
  leads: T[],
  user: Pick<User, 'id' | 'name' | 'email' | 'role'> | null | undefined
): T[] {
  if (!user) return [];
  if (isAdminUser(user)) return leads;
  return leads.filter((lead) => isLeadAssignedToUser(lead, user));
}

/**
 * Subscribes to leads visible to the current user.
 * - Admins subscribe to all leads.
 * - Non-admins subscribe ONLY to leads where `owner_id == user.id` (server-side scoped).
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

  const isAdmin = isAdminUser(user);
  const q = isAdmin
    ? adminConstraints.length > 0
      ? query(collection(firestore, 'leads'), ...adminConstraints)
      : query(collection(firestore, 'leads'))
    : query(collection(firestore, 'leads'), where('owner_id', '==', user.id));

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
      // Keep consistent newest-first ordering without requiring composite Firestore indexes
      if (!isAdmin) {
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
      }
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
  const isAdmin = isAdminUser(user);
  const q = isAdmin
    ? adminConstraints.length > 0
      ? query(collection(firestore, 'leads'), ...adminConstraints)
      : query(collection(firestore, 'leads'))
    : query(collection(firestore, 'leads'), where('owner_id', '==', user.id));

  const snap = await getDocs(q).catch(() => null);
  if (!snap) return [];
  return filterLeadsForUser(
    snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)),
    user
  );
}


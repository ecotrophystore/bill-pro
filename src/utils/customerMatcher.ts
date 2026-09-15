import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Customer } from '../types';

export interface CustomerMatchQuery {
  name?: string;
  phone?: string;
  whatsapp_number?: string;
  email?: string;
  facebook_id?: string;
  instagram_id?: string;
  organization?: string;
}

export interface CustomerMatchResult {
  isExisting: boolean;
  customerType: 'new' | 'existing' | 'repeat';
  customer: Customer;
  previousEnquiriesCount: number;
  matchedBy: 'phone' | 'whatsapp' | 'email' | 'facebook' | 'instagram' | 'none';
}

/**
 * Normalizes phone number to standard 10 or 12 digit format (stripping spaces, symbols)
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/**
 * Checks for existing customer by phone, WhatsApp, email, Facebook, or Instagram ID.
 * Deduplicates customer records and marks New vs Existing/Repeat.
 */
export async function matchOrCreateCustomer(
  data: CustomerMatchQuery
): Promise<CustomerMatchResult> {
  if (!db) {
    throw new Error('Firestore database is not initialized.');
  }

  const cleanPhone = normalizePhoneNumber(data.phone || data.whatsapp_number || '');
  const raw10Phone = cleanPhone.length === 12 && cleanPhone.startsWith('91') ? cleanPhone.slice(2) : cleanPhone;
  const cleanEmail = (data.email || '').trim().toLowerCase();
  const fbId = (data.facebook_id || '').trim();
  const igId = (data.instagram_id || '').trim();

  let matchedCustomer: Customer | null = null;
  let matchedBy: CustomerMatchResult['matchedBy'] = 'none';

  // 1. Search existing customers by Phone / WhatsApp number
  if (cleanPhone) {
    try {
      const phoneQueries = [
        query(collection(db, 'customers'), where('phone', '==', cleanPhone)),
        query(collection(db, 'customers'), where('phone', '==', raw10Phone)),
        query(collection(db, 'customers'), where('whatsapp_number', '==', cleanPhone)),
      ];

      for (const q of phoneQueries) {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docItem = snap.docs[0];
          matchedCustomer = { id: docItem.id, ...docItem.data() } as Customer;
          matchedBy = 'phone';
          break;
        }
      }
    } catch (err) {
      console.warn('[CustomerMatcher] Phone query lookup note:', err);
    }
  }

  // 2. Search by Email if not matched
  if (!matchedCustomer && cleanEmail) {
    try {
      const emailQuery = query(collection(db, 'customers'), where('email', '==', cleanEmail));
      const emailSnap = await getDocs(emailQuery);
      if (!emailSnap.empty) {
        const docItem = emailSnap.docs[0];
        matchedCustomer = { id: docItem.id, ...docItem.data() } as Customer;
        matchedBy = 'email';
      }
    } catch (err) {
      console.warn('[CustomerMatcher] Email query lookup note:', err);
    }
  }

  // 3. Search by Facebook PSID / Profile ID if not matched
  if (!matchedCustomer && fbId) {
    try {
      const fbQuery = query(collection(db, 'customers'), where('facebook_id', '==', fbId));
      const fbSnap = await getDocs(fbQuery);
      if (!fbSnap.empty) {
        const docItem = fbSnap.docs[0];
        matchedCustomer = { id: docItem.id, ...docItem.data() } as Customer;
        matchedBy = 'facebook';
      }
    } catch (err) {
      console.warn('[CustomerMatcher] Facebook ID lookup note:', err);
    }
  }

  // 4. Search by Instagram ID if not matched
  if (!matchedCustomer && igId) {
    try {
      const igQuery = query(collection(db, 'customers'), where('instagram_id', '==', igId));
      const igSnap = await getDocs(igQuery);
      if (!igSnap.empty) {
        const docItem = igSnap.docs[0];
        matchedCustomer = { id: docItem.id, ...docItem.data() } as Customer;
        matchedBy = 'instagram';
      }
    } catch (err) {
      console.warn('[CustomerMatcher] Instagram ID lookup note:', err);
    }
  }

  // 5. Count existing enquiries / leads for this customer/phone
  let previousEnquiriesCount = 0;
  if (matchedCustomer || cleanPhone) {
    try {
      const searchPhones = [cleanPhone, raw10Phone].filter(Boolean);
      const leadsQuery = query(
        collection(db, 'leads'),
        where('phone', 'in', searchPhones.length > 0 ? searchPhones : ['__dummy__'])
      );
      const leadsSnap = await getDocs(leadsQuery);
      previousEnquiriesCount = leadsSnap.size;
    } catch (err) {
      console.warn('[CustomerMatcher] Lead history count note:', err);
    }
  }

  // 6. If Customer Exists -> Update missing fields & return
  if (matchedCustomer) {
    const isRepeat = previousEnquiriesCount > 0 || (matchedCustomer.total_orders_count || 0) > 0;
    const customerType = isRepeat ? 'repeat' : 'existing';

    try {
      const updates: any = {
        total_enquiries_count: (matchedCustomer.total_enquiries_count || previousEnquiriesCount) + 1,
        customer_type: customerType,
        updated_at: serverTimestamp(),
      };
      if (!matchedCustomer.whatsapp_number && data.whatsapp_number) updates.whatsapp_number = data.whatsapp_number;
      if (!matchedCustomer.facebook_id && fbId) updates.facebook_id = fbId;
      if (!matchedCustomer.instagram_id && igId) updates.instagram_id = igId;
      if (!matchedCustomer.email && cleanEmail) updates.email = cleanEmail;

      await updateDoc(doc(db, 'customers', matchedCustomer.id), updates);
    } catch (err) {
      console.warn('[CustomerMatcher] Could not update existing customer counters:', err);
    }

    return {
      isExisting: true,
      customerType,
      customer: matchedCustomer,
      previousEnquiriesCount,
      matchedBy,
    };
  }

  // 7. If Customer Does NOT Exist -> Create New Customer
  const customerName = data.name || (data.organization ? `${data.organization} Contact` : `Lead +${cleanPhone || 'New'}`);
  const newCustomerPayload: any = {
    name: customerName,
    phone: cleanPhone || '',
    whatsapp_number: data.whatsapp_number || cleanPhone || '',
    email: cleanEmail || '',
    facebook_id: fbId || '',
    instagram_id: igId || '',
    type: data.organization ? 'business' : 'individual',
    customer_type: 'new',
    total_enquiries_count: 1,
    total_orders_count: 0,
    created_at: serverTimestamp(),
    notes: data.organization ? `Organization: ${data.organization}` : '',
  };

  const newDocRef = await addDoc(collection(db, 'customers'), newCustomerPayload);
  const createdCustomer: Customer = {
    id: newDocRef.id,
    ...newCustomerPayload,
  };

  return {
    isExisting: false,
    customerType: 'new',
    customer: createdCustomer,
    previousEnquiriesCount: 0,
    matchedBy: 'none',
  };
}

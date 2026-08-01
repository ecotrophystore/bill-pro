import { httpsCallable } from 'firebase/functions';
import { auth, functions, db } from './firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export async function testLeadIngestHttp(payload: Record<string, any>) {
  if (!functions || !db) {
    throw new Error('Firebase is not initialized.');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to send a test lead.');
  }

  try {
    const callable = httpsCallable(functions, 'testLeadIngest');
    const result = await callable(payload);
    const data = result.data as {
      ok?: boolean;
      status?: string;
      leadId?: string;
      eventId?: string;
      error?: string;
      message?: string;
    };

    if (data?.ok === false) {
      throw new Error(data?.error || data?.message || 'Test ingest failed');
    }

    return data;
  } catch (error: any) {
    console.warn("Cloud function testLeadIngest failed, attempting client-side save fallback:", error);
    try {
      const leadRef = await addDoc(collection(db, 'leads'), {
        ...payload,
        status: 'new',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      return { ok: true, leadId: leadRef.id, status: 'fallback_success' };
    } catch (fallbackError: any) {
      console.error("Client-side fallback also failed:", fallbackError);
      throw new Error(fallbackError?.message || 'Failed to save lead. Connection or Permission issue.');
    }
  }
}

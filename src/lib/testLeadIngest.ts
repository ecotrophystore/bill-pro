import { httpsCallable } from 'firebase/functions';
import { auth, functions, db } from './firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { runAutomationForLead } from './whatsappAutomationRunner';
import { resolveLeadAssignment } from '../services/leadAssignmentService';

export async function testLeadIngestHttp(payload: Record<string, any>) {
  if (!functions || !db) {
    throw new Error('Firebase is not initialized.');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to send a test lead.');
  }

  const autoAssignment = await resolveLeadAssignment({
    source: payload.source || payload.platform,
    platform: payload.platform,
    pipelineId: payload.pipeline_id,
    name: payload.name,
    requirement: payload.message,
    campaign: payload.campaign,
  }).catch(() => ({ assigned: false, ownerId: '', ownerName: '', mode: 'unassigned' as const }));

  const enrichedPayload = autoAssignment.assigned
    ? {
        ...payload,
        owner_id: autoAssignment.ownerId,
        ownerId: autoAssignment.ownerId,
        sales_person: autoAssignment.ownerName,
      }
    : payload;

  try {
    const callable = httpsCallable(functions, 'testLeadIngest');
    const result = await callable(enrichedPayload);
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

    if (data?.leadId) {
      runAutomationForLead(data.leadId, enrichedPayload).catch(e => console.error('[Automation error]:', e));
    }

    return data;
  } catch (error: any) {
    console.warn("Cloud function testLeadIngest failed, attempting client-side save fallback:", error);
    try {
      const leadData = {
        ...enrichedPayload,
        status: 'new',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      const leadRef = await addDoc(collection(db, 'leads'), leadData);
      
      // Run WhatsApp automation immediately
      runAutomationForLead(leadRef.id, leadData).catch(e => console.error('[Automation error]:', e));

      return { ok: true, leadId: leadRef.id, status: 'fallback_success' };
    } catch (fallbackError: any) {
      console.error("Client-side fallback also failed:", fallbackError);
      throw new Error(fallbackError?.message || 'Failed to save lead. Connection or Permission issue.');
    }
  }
}

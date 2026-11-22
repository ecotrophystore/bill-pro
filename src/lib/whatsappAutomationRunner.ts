import { collection, query, where, getDocs, addDoc, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const PERMANENT_TOKEN = "EAAP5CXj9PZA0BSZArJ0rvk8MMj0L90vBkzBNs6lhFeYwCEFv4ko0dj49kmqxRKwTZBsWhO18Ecsk4ZCQ4V6xLJtZCD2h2NAb3U9eakgQZCYELZAkQqPY300LngHx9DmeoOE3WBGTtASRr5XfjfBp1x0vmjKS6sf8dsKdDGIOvbtTM2QZBccvuBxS6hZCdg5QmhAZDZD";
const DEFAULT_PHONE_ID = "1263075550230396";

function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export async function runAutomationForLead(leadId: string, leadData: Record<string, any>) {
  if (!db) return;

  const phone = normalizePhone(leadData.phone || '');
  if (!phone) {
    console.log('[Automation] Lead has no phone number, skipping automation.');
    return;
  }

  const pipelineId = leadData.pipeline_id || 'default';
  const stageId = leadData.status || 'new';

  try {
    // 1. Fetch active automations for this pipeline and stage
    const autoQuery = query(
      collection(db, 'whatsapp_automations'),
      where('pipelineId', '==', pipelineId),
      where('stageId', '==', stageId),
      where('status', '==', 'active')
    );

    const autoSnap = await getDocs(autoQuery);
    if (autoSnap.empty) {
      console.log(`[Automation] No active automations found for pipeline "${pipelineId}" and stage "${stageId}".`);
      return;
    }

    // 2. Fetch Meta Config (if custom phone ID configured)
    let phoneId = DEFAULT_PHONE_ID;
    try {
      const configDoc = await getDoc(doc(db, 'meta_integrations', 'default'));
      if (configDoc.exists()) {
        const cData = configDoc.data();
        if (cData.whatsappPhoneNumberId) phoneId = cData.whatsappPhoneNumberId;
      }
    } catch (e) {
      console.warn('[Automation] Error reading meta_integrations config, using default:', e);
    }

    for (const autoDoc of autoSnap.docs) {
      const auto = autoDoc.data();
      const templateName = auto.metaTemplateName || 'hello_world';
      const templateLang = auto.templateLanguage || 'en_US';

      console.log(`[Automation] Triggering automation "${auto.name || 'Unnamed'}" for lead ${leadId} (+${phone})...`);

      // 3. Send via Meta Graph API
      const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
      const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang }
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERMANENT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const resData = await res.json();
      const metaMessageId = resData.messages?.[0]?.id || null;
      const isSuccess = Boolean(metaMessageId);

      // 4. Record in Message Queue
      await addDoc(collection(db, 'message_queue'), {
        lead_id: leadId,
        recipient: phone,
        template_name: templateName,
        status: isSuccess ? 'sent' : 'failed',
        metaMessageId: metaMessageId,
        error: resData.error?.message || null,
        created_at: serverTimestamp(),
        sent_at: isSuccess ? serverTimestamp() : null,
      });

      // 5. Record Activity
      await addDoc(collection(db, 'activities'), {
        lead_id: leadId,
        type: 'whatsapp.sent',
        message: isSuccess 
          ? `WhatsApp template "${templateName}" automatically sent to +${phone}.`
          : `Failed to auto-send WhatsApp template "${templateName}": ${resData.error?.message || 'Error'}`,
        actor: 'system',
        created_at: serverTimestamp(),
      });

      // 6. Record Enrollment
      const enrollId = `${autoDoc.id}_${leadId}`;
      await setDoc(doc(db, 'automation_enrollments', enrollId), {
        automationId: autoDoc.id,
        leadId: leadId,
        enrolledStageId: stageId,
        status: isSuccess ? 'completed' : 'failed',
        currentMessageNumber: 1,
        enrolledAt: serverTimestamp(),
        lastSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      console.log(`[Automation] Finished sending. Meta result:`, resData);
    }
  } catch (error) {
    console.error('[Automation] Error executing automation:', error);
  }
}

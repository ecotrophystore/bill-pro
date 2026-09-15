import { collection, query, where, getDocs, addDoc, doc, setDoc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { analyzeIncomingWhatsAppMessage, type WhatsAppAiAnalysisResult } from './whatsappAiAnalyzer';

export interface InboundMessagePayload {
  senderPhone: string;
  senderName?: string;
  messageText: string;
  metaMessageId?: string;
  timestamp?: any;
}

export interface InboundProcessingOutcome {
  leadId: string;
  isNewLead: boolean;
  leadName: string;
  pipelineStage: string;
  qualificationStatus: string;
  aiAnalysis: WhatsAppAiAnalysisResult;
}

function cleanPhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/**
 * Automatically processes incoming WhatsApp message, runs AI qualification,
 * de-duplicates, and syncs directly into the CRM pipeline.
 */
export async function processInboundWhatsAppMessage(
  payload: InboundMessagePayload
): Promise<InboundProcessingOutcome> {
  if (!db) {
    throw new Error('Firestore database is not initialized.');
  }

  const { senderPhone, senderName = '', messageText, metaMessageId } = payload;
  const formattedPhone = cleanPhone(senderPhone);

  // 1. Fetch recent conversation history for context
  let history: Array<{ direction: 'inbound' | 'outbound'; content: string }> = [];
  try {
    const msgQuery = query(
      collection(db, 'messages'),
      where('senderPhone', '==', formattedPhone)
    );
    const msgSnap = await getDocs(msgQuery);
    history = msgSnap.docs.map(d => ({
      direction: d.data().direction || 'inbound',
      content: d.data().content || '',
    })).slice(-5);
  } catch (e) {
    console.warn('[Inbound Processor] Could not fetch chat history for context:', e);
  }

  // 2. Run AI Sales Qualification & Intent Analysis
  const aiAnalysis = await analyzeIncomingWhatsAppMessage(
    messageText,
    formattedPhone,
    senderName,
    history
  );

  // 3. De-duplication: Check if Lead already exists by phone
  let leadId = '';
  let isNewLead = false;
  let existingLeadData: any = null;

  try {
    const leadsQuery = query(
      collection(db, 'leads'),
      where('phone', 'in', [formattedPhone, senderPhone, formattedPhone.replace(/^91/, '')])
    );
    const leadsSnap = await getDocs(leadsQuery);

    if (!leadsSnap.empty) {
      const docItem = leadsSnap.docs[0];
      leadId = docItem.id;
      existingLeadData = docItem.data();
    }
  } catch (e) {
    console.warn('[Inbound Processor] Error during lead de-duplication check:', e);
  }

  const leadName = aiAnalysis.extracted_details.name || senderName || existingLeadData?.name || `Lead +${formattedPhone}`;
  const stage = aiAnalysis.flag_for_review 
    ? (existingLeadData?.status || 'needs_review') 
    : (aiAnalysis.recommended_pipeline_stage || 'new');

  if (!leadId) {
    // 4A. CREATE NEW LEAD
    isNewLead = true;
    const leadRef = await addDoc(collection(db, 'leads'), {
      name: leadName,
      phone: formattedPhone,
      email: aiAnalysis.extracted_details.email || '',
      company: aiAnalysis.extracted_details.company || '',
      location: aiAnalysis.extracted_details.location || '',
      requirement: aiAnalysis.extracted_details.requirement || messageText,
      required_quantity: aiAnalysis.extracted_details.quantity || '',
      budget: aiAnalysis.extracted_details.budget || '',
      timeline: aiAnalysis.extracted_details.timeline || '',
      priority: aiAnalysis.extracted_details.urgency || 'medium',
      urgency: aiAnalysis.extracted_details.urgency || 'medium',
      pipeline_id: 'default',
      status: stage,
      source: 'whatsapp_inbound',
      sourceType: 'whatsapp',
      platform: 'meta',
      notes: `[AI Qualification] ${aiAnalysis.qualification_reason}\nRecommended Action: ${aiAnalysis.extracted_details.recommended_next_action}`,
      qualification_status: aiAnalysis.qualification_status,
      qualification_reason: aiAnalysis.qualification_reason,
      confidence_score: aiAnalysis.confidence_score,
      suggested_reply: aiAnalysis.suggested_reply,
      next_action: aiAnalysis.extracted_details.recommended_next_action,
      flag_for_review: aiAnalysis.flag_for_review,
      ai_qualification: aiAnalysis.qualification_status,
      ai_confidence: aiAnalysis.confidence_score,
      ai_classification: aiAnalysis.classification,
      ai_summary: aiAnalysis.internal_audit_log,
      ai_suggested_reply: aiAnalysis.suggested_reply,
      ai_flag_for_review: aiAnalysis.flag_for_review,
      last_contacted_at: serverTimestamp(),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    leadId = leadRef.id;

    // Create corresponding Customer record
    try {
      await addDoc(collection(db, 'customers'), {
        name: leadName,
        phone: formattedPhone,
        email: aiAnalysis.extracted_details.email || '',
        company: aiAnalysis.extracted_details.company || '',
        type: 'individual',
        notes: `Created from inbound WhatsApp lead. Requirement: ${aiAnalysis.extracted_details.requirement}`,
        created_at: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[Inbound Processor] Could not create customer document:', e);
    }
  } else {
    // 4B. UPDATE EXISTING LEAD
    isNewLead = false;
    const updatePayload: any = {
      updated_at: serverTimestamp(),
      last_contacted_at: serverTimestamp(),
      qualification_status: aiAnalysis.qualification_status,
      qualification_reason: aiAnalysis.qualification_reason,
      confidence_score: aiAnalysis.confidence_score,
      suggested_reply: aiAnalysis.suggested_reply,
      next_action: aiAnalysis.extracted_details.recommended_next_action,
      flag_for_review: aiAnalysis.flag_for_review,
      ai_qualification: aiAnalysis.qualification_status,
      ai_confidence: aiAnalysis.confidence_score,
      ai_classification: aiAnalysis.classification,
      ai_summary: aiAnalysis.internal_audit_log,
      ai_suggested_reply: aiAnalysis.suggested_reply,
      ai_flag_for_review: aiAnalysis.flag_for_review,
    };

    if (aiAnalysis.extracted_details.name && !existingLeadData?.name) {
      updatePayload.name = aiAnalysis.extracted_details.name;
    }
    if (aiAnalysis.extracted_details.company) {
      updatePayload.company = aiAnalysis.extracted_details.company;
    }
    if (aiAnalysis.extracted_details.requirement) {
      updatePayload.requirement = aiAnalysis.extracted_details.requirement;
    }
    if (aiAnalysis.extracted_details.budget) {
      updatePayload.budget = aiAnalysis.extracted_details.budget;
    }
    if (aiAnalysis.extracted_details.timeline) {
      updatePayload.timeline = aiAnalysis.extracted_details.timeline;
    }
    if (aiAnalysis.extracted_details.location) {
      updatePayload.location = aiAnalysis.extracted_details.location;
    }
    if (aiAnalysis.extracted_details.urgency) {
      updatePayload.priority = aiAnalysis.extracted_details.urgency;
      updatePayload.urgency = aiAnalysis.extracted_details.urgency;
    }
    // Only update stage if lead is still in early/open stages
    if (!['won', 'lost'].includes(existingLeadData?.status) && !aiAnalysis.flag_for_review) {
      updatePayload.status = stage;
    }

    await updateDoc(doc(db, 'leads', leadId), updatePayload);
  }

  // 5. Store message in `messages` collection
  const messageDocRef = await addDoc(collection(db, 'messages'), {
    leadId,
    senderPhone: formattedPhone,
    senderName: leadName,
    direction: 'inbound',
    type: 'text',
    content: messageText,
    metaMessageId: metaMessageId || `local_${Date.now()}`,
    platform: 'whatsapp',
    aiProcessed: true,
    aiProcessedAt: serverTimestamp(),
    created_at: serverTimestamp(),
  });

  // 6. Update or create `conversations` document
  try {
    const convId = `whatsapp_${formattedPhone}`;
    await setDoc(doc(db, 'conversations', convId), {
      leadId,
      participantPhone: formattedPhone,
      participantName: leadName,
      platform: 'whatsapp',
      status: 'open',
      lastMessage: messageText,
      lastMessageAt: serverTimestamp(),
      lastCustomerReplyAt: serverTimestamp(),
      ai_qualification: aiAnalysis.qualification_status,
      ai_classification: aiAnalysis.classification,
      ai_suggested_reply: aiAnalysis.suggested_reply,
      ai_flag_for_review: aiAnalysis.flag_for_review,
      updated_at: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn('[Inbound Processor] Error updating conversation doc:', e);
  }

  // 7. Log structured Audit Activity in `activities` collection
  try {
    await addDoc(collection(db, 'activities'), {
      lead_id: leadId,
      leadId: leadId,
      type: 'whatsapp_ai_qualification',
      title: `WhatsApp Inbound: ${aiAnalysis.classification.toUpperCase()} (${aiAnalysis.qualification_status})`,
      message: aiAnalysis.internal_audit_log,
      description: `Inbound WhatsApp message analyzed. Status marked as "${aiAnalysis.qualification_status}". Suggested next step: ${aiAnalysis.extracted_details.recommended_next_action}`,
      actor: 'AI Qualification Assistant',
      ai_suggested_reply: aiAnalysis.suggested_reply,
      created_at: serverTimestamp(),
      date: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[Inbound Processor] Error writing activity log:', e);
  }

  return {
    leadId,
    isNewLead,
    leadName,
    pipelineStage: stage,
    qualificationStatus: aiAnalysis.qualification_status,
    aiAnalysis,
  };
}

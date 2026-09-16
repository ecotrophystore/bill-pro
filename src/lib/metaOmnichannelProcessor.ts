import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { matchOrCreateCustomer, normalizePhoneNumber } from '../utils/customerMatcher';
import { extractMetaRequirements, type ExtractedRequirement } from '../utils/metaRequirementExtractor';
import { classifyLeadPipeline, type ClassificationResult } from '../utils/pipelineClassifier';
import { DEFAULT_QUANTITY_PIPELINES, type Pipeline, type PipelineRule, type Lead } from '../types';

export type MetaLeadChannel = 'whatsapp' | 'facebook_messenger' | 'facebook_lead_ad' | 'instagram';

export interface MetaInboundPayload {
  channel: MetaLeadChannel;
  senderName?: string;
  senderPhone?: string;
  whatsappNumber?: string;
  senderEmail?: string;
  facebookProfileId?: string;
  instagramProfileId?: string;
  messageText: string;
  metaMessageId?: string;
  campaignName?: string;
  adName?: string;
  adSetName?: string;
  formId?: string;
  timestamp?: any;
}

export interface MetaInboundOutcome {
  success: boolean;
  leadId: string;
  leadName: string;
  customerId: string;
  customerType: 'new' | 'existing' | 'repeat';
  isRepeatCustomer: boolean;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  extractedRequirements: ExtractedRequirement;
  classification: ClassificationResult;
  message: string;
}

/**
 * Omnichannel processor for Meta incoming customer enquiries.
 * Identifies New/Existing customers, extracts requirements, auto-assigns pipeline,
 * lands at stage "New Enquiry", and logs complete activity and conversation history.
 */
export async function processMetaInboundEnquiry(
  payload: MetaInboundPayload
): Promise<MetaInboundOutcome> {
  if (!db) {
    throw new Error('Firestore database is not initialized.');
  }

  const {
    channel,
    senderName = '',
    senderPhone = '',
    whatsappNumber = '',
    senderEmail = '',
    facebookProfileId = '',
    instagramProfileId = '',
    messageText = '',
    metaMessageId = '',
    campaignName = '',
    adName = '',
    adSetName = '',
    formId = '',
  } = payload;

  const cleanPhone = normalizePhoneNumber(senderPhone || whatsappNumber);
  const now = new Date();

  // 1. Requirement Extraction
  const extracted = extractMetaRequirements(messageText);

  // 2. Identify & Deduplicate Customer (New vs Existing / Repeat)
  const customerMatch = await matchOrCreateCustomer({
    name: senderName || extracted.organization || '',
    phone: cleanPhone,
    whatsapp_number: normalizePhoneNumber(whatsappNumber || cleanPhone),
    email: senderEmail,
    facebook_id: facebookProfileId,
    instagram_id: instagramProfileId,
    organization: extracted.organization,
  });

  const { customer, customerType, isExisting, previousEnquiriesCount } = customerMatch;

  // 3. Fetch Pipelines & Rules from Firestore
  let availablePipelines = DEFAULT_QUANTITY_PIPELINES;
  let customRules: PipelineRule[] = [];

  try {
    const pipeSnap = await getDocs(collection(db, 'pipelines'));
    if (!pipeSnap.empty) {
      availablePipelines = pipeSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Pipeline));
    }
  } catch (e) {
    console.warn('[Meta Processor] Using default pipelines:', e);
  }

  try {
    const rulesSnap = await getDocs(collection(db, 'pipeline_rules'));
    if (!rulesSnap.empty) {
      customRules = rulesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PipelineRule));
    }
  } catch (e) {
    console.warn('[Meta Processor] Using default rules:', e);
  }

  // 4. Auto-classify into the matching Pipeline (Rule 3 & 4)
  const classification = classifyLeadPipeline(
    {
      required_quantity: extracted.required_quantity,
      customer_type: extracted.customer_type,
      source: channel,
      event_type: extracted.event_type,
      location: extracted.location,
      urgency: extracted.urgency,
      budget: extracted.budget,
      is_repeat_customer: isExisting,
      customer_lifecycle: isExisting ? (customerType === 'repeat' ? 'repeat_customer' : 'existing_customer') : 'new_customer',
    },
    customRules,
    availablePipelines
  );

  const initialStageId = 'new_enquiry';
  const initialStageLabel = 'New Enquiry';

  const leadDisplayName =
    senderName ||
    customer.name ||
    extracted.organization ||
    (cleanPhone ? `Lead +${cleanPhone}` : `Meta Lead (${channel})`);

  // Channel readable label
  const channelLabels: Record<MetaLeadChannel, string> = {
    whatsapp: 'WhatsApp',
    facebook_messenger: 'Facebook Messenger',
    facebook_lead_ad: 'Facebook Lead Ad',
    instagram: 'Instagram Direct',
  };
  const channelLabel = channelLabels[channel] || channel;

  // 5. Create New Lead Document
  const leadPayload: any = {
    name: leadDisplayName,
    company: extracted.organization || customer.name || '',
    organization: extracted.organization || '',
    phone: cleanPhone || customer.phone || '',
    whatsapp_number: normalizePhoneNumber(whatsappNumber || cleanPhone || customer.whatsapp_number || ''),
    email: senderEmail || customer.email || '',
    location: extracted.location || '',
    required_quantity: extracted.required_quantity || '',
    event_name: extracted.event_name || '',
    event_date: extracted.event_date || '',
    delivery_date: extracted.delivery_date || '',
    trophy_type: extracted.trophy_type || '',
    trophy_size: extracted.trophy_size || '',
    budget: extracted.budget || '',
    event_type: extracted.event_type || '',
    customer_type: extracted.customer_type || (isExisting ? 'Existing Customer' : 'New Customer'),
    urgency: extracted.urgency || 'medium',
    requirement: messageText,
    source: channelLabel,
    platform: 'meta',
    campaign: campaignName || 'Meta Organic / Inbound',
    campaign_name: campaignName,
    ad_name: adName,
    ad_set_name: adSetName,
    form_id: formId,
    facebook_profile: facebookProfileId,
    instagram_profile: instagramProfileId,
    customer_id: customer.id,
    is_repeat_customer: isExisting,
    customer_lifecycle: isExisting ? (customerType === 'repeat' ? 'repeat_customer' : 'existing_customer') : 'new_customer',
    pipeline_id: classification.pipeline_id,
    status: initialStageId,
    last_message: messageText,
    last_message_channel: channel,
    last_message_time: serverTimestamp(),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    stageEnteredAt: serverTimestamp(),
    stage_history: [
      {
        from_stage: 'Initial Ingest',
        to_stage: initialStageLabel,
        changed_by: 'system_meta_inbound',
        changed_by_name: `Meta Auto-Capture (${channelLabel})`,
        changed_at: now,
        note: `Enquiry received via ${channelLabel}. Classified into "${classification.pipeline_name}".`,
      },
    ],
    notification_history: [],
    notifications_sent: {},
  };

  const leadRef = await addDoc(collection(db, 'leads'), leadPayload);
  const leadId = leadRef.id;

  // 6. Record Message in messages collection for Omnichannel Threading
  try {
    await addDoc(collection(db, 'messages'), {
      leadId: leadId,
      customerId: customer.id,
      senderPhone: cleanPhone,
      senderName: leadDisplayName,
      direction: 'inbound',
      type: 'text',
      content: messageText,
      metaMessageId: metaMessageId || `meta_${Date.now()}`,
      platform: channel,
      channel: channel,
      campaignName: campaignName || null,
      adName: adName || null,
      created_at: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Meta Processor] Could not log message record:', err);
  }

  // 7. Record Comprehensive Activity Log (Rule 16)
  try {
    const customerTag = isExisting
      ? `Existing Customer (Previous enquiries: ${previousEnquiriesCount})`
      : 'New Customer';

    const qtyText = extracted.required_quantity ? `Quantity: ${extracted.required_quantity} pcs` : 'Quantity: Unspecified';
    const eventText = extracted.event_name ? `, Event: "${extracted.event_name}"` : '';

    const activityMessage = `New ${channelLabel} enquiry received. Customer: "${leadDisplayName}" [${customerTag}], ${qtyText}${eventText}. CRM auto-classified into "${classification.pipeline_name}". Initial stage set to "${initialStageLabel}".`;

    await addDoc(collection(db, 'activities'), {
      lead_id: leadId,
      customer_id: customer.id,
      type: 'meta.inbound_enquiry',
      source: channel,
      message: activityMessage,
      actor: 'Meta Automation',
      created_at: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Meta Processor] Could not log activity record:', err);
  }

  return {
    success: true,
    leadId,
    leadName: leadDisplayName,
    customerId: customer.id,
    customerType,
    isRepeatCustomer: isExisting,
    pipelineId: classification.pipeline_id,
    pipelineName: classification.pipeline_name,
    stageId: initialStageId,
    stageName: initialStageLabel,
    extractedRequirements: extracted,
    classification,
    message: `Successfully captured enquiry from ${leadDisplayName} into "${classification.pipeline_name}".`,
  };
}

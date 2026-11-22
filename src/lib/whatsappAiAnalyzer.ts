import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  WHATSAPP_PAYMENT_TERM_RE,
  WHATSAPP_SPAM_OR_ALERT_RE,
  WHATSAPP_VENDOR_OR_INDIAMART_RE,
  hasCommercialEnquirySignal,
  isMediaOrSystemNoise,
  extractCustomerAndCompanyInfo,
} from '../utils/whatsappEnquiryQualifier';

export interface ExtractedLeadDetails {
  name: string;
  company: string;
  email: string;
  phone: string;
  requirement: string;
  quantity: string;
  budget: string;
  timeline: string;
  location: string;
  urgency: 'low' | 'medium' | 'high';
  recommended_next_action: string;
  trophy_type?: string;
  trophy_size?: string;
  event_name?: string;
  event_date?: string;
  delivery_date?: string;
}

export type MessageClassification = 
  | 'new_lead' 
  | 'follow_up' 
  | 'customer_query' 
  | 'support_issue' 
  | 'payment_related' 
  | 'meeting_request' 
  | 'spam' 
  | 'other';

export type QualificationStatus = 'Qualified' | 'Not Qualified' | 'Needs Follow-up';

export interface WhatsAppAiAnalysisResult {
  classification: MessageClassification;
  qualification_status: QualificationStatus;
  is_business_lead?: boolean;
  extracted_details: ExtractedLeadDetails;
  qualification_reason: string;
  recommended_pipeline_stage: 'new' | 'contacted' | 'qualified' | 'lost' | 'needs_review';
  confidence_score: number;
  flag_for_review: boolean;
  suggested_reply: string;
  internal_audit_log: string;
}

const DEFAULT_GEMINI_KEY = 'AIzaSyADF4qRiXl1HavHy8GAXVx6XaweqQkq6Yk';

function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    const customKey = localStorage.getItem('VITE_GEMINI_API_KEY') || localStorage.getItem('GEMINI_API_KEY');
    if (customKey) return customKey;
  }
  const envKey = ((import.meta as any).env?.VITE_GEMINI_API_KEY as string);
  return envKey || DEFAULT_GEMINI_KEY;
}


/**
 * Robust fallback analyzer if Gemini API is offline/unreachable
 */
function heuristicAnalysis(messageText: string, senderPhone: string, senderName: string): WhatsAppAiAnalysisResult {
  const text = (messageText || '').toLowerCase();
  const identity = extractCustomerAndCompanyInfo({
    text: messageText,
    senderName,
    phone: senderPhone
  });

  // 1. Vendor pitches, IndiaMART broadcasts, machinery/raw material suppliers, and spam/noise
  if (
    WHATSAPP_VENDOR_OR_INDIAMART_RE.test(text) ||
    WHATSAPP_SPAM_OR_ALERT_RE.test(text) ||
    isMediaOrSystemNoise(messageText)
  ) {
    const isVendor = WHATSAPP_VENDOR_OR_INDIAMART_RE.test(text);
    const isSpamAlert = WHATSAPP_SPAM_OR_ALERT_RE.test(text);
    return {
      classification: isVendor ? 'other' : isSpamAlert ? 'spam' : 'other',
      qualification_status: 'Not Qualified',
      is_business_lead: false,
      extracted_details: {
        name: isVendor ? 'Vendor / IndiaMART Pitch' : senderName || 'Unknown',
        company: identity.company || '',
        email: '',
        phone: senderPhone,
        requirement: isVendor ? 'Vendor / Supplier / IndiaMART Broadcast' : isSpamAlert ? 'Spam / Advertisement' : messageText,
        quantity: '',
        budget: '',
        timeline: '',
        location: '',
        urgency: 'low',
        recommended_next_action: isVendor ? 'Ignore vendor pitch / IndiaMART broadcast' : 'Archive non-customer chat'
      },
      qualification_reason: isVendor
        ? 'Vendor / Supplier / IndiaMART broadcast offering raw materials, machines, or B2B supply to us. Not a customer buying enquiry.'
        : isSpamAlert
          ? 'Message identified as spam, advertisement, OTP, bank alert, or promotional broadcast.'
          : 'Media placeholder or casual non-enquiry chat without commercial intent.',
      recommended_pipeline_stage: 'lost',
      confidence_score: 0.95,
      flag_for_review: false,
      suggested_reply: '',
      internal_audit_log: `Lead Name: ${senderName || 'Unknown'}\nWhatsApp Number: ${senderPhone}\nStatus: Not Qualified\nReason: Vendor / IndiaMART / Non-enquiry\nPipeline Updated: No`
    };
  }

  // 2. Payment confirmation / invoice query detection
  if (WHATSAPP_PAYMENT_TERM_RE.test(text)) {
    return {
      classification: 'payment_related',
      qualification_status: 'Qualified',
      is_business_lead: true,
      extracted_details: {
        name: identity.name,
        company: identity.company || '',
        email: '',
        phone: senderPhone,
        requirement: 'Payment Confirmation / Invoice Query',
        quantity: '',
        budget: '',
        timeline: 'Immediate',
        location: '',
        urgency: 'high',
        recommended_next_action: 'Verify payment in bank/accounting records and dispatch invoice'
      },
      qualification_reason: 'Customer sent payment confirmation or inquiry regarding invoice/payment.',
      recommended_pipeline_stage: 'contacted',
      confidence_score: 0.88,
      flag_for_review: false,
      suggested_reply: `Hi ${identity.name || 'there'}, thank you for sharing the payment update! Our accounts team is verifying it and will share the confirmed receipt shortly.`,
      internal_audit_log: `Lead Name: ${identity.name}\nCompany: ${identity.company || 'N/A'}\nWhatsApp Number: ${senderPhone}\nStatus: Qualified\nKey Details Extracted:\n• Requirement: Payment update / Invoice inquiry\n• Urgency: High\nReason for Status: Active customer communicating regarding payment.\nPipeline Updated: Yes (Stage: Contacted)`
    };
  }

  // 3. Buying Intent / New enquiry (English + Tamil/Tanglish commercial keywords)
  if (hasCommercialEnquirySignal(messageText)) {
    return {
      classification: 'new_lead',
      qualification_status: 'Qualified',
      is_business_lead: true,
      extracted_details: {
        name: identity.name,
        company: identity.company || '',
        email: '',
        phone: senderPhone,
        requirement: messageText,
        quantity: text.match(/\d+\s*(pieces|pcs|nos\.?|units|sets|troph(y|ies)|medals?|mementos?)/i)?.[0] || '',
        budget: text.match(/(\d+k|\d+\s*(rupees|rs|inr))/i)?.[0] || '',
        timeline: text.includes('urgent') ? 'Urgent' : 'Standard',
        location: '',
        urgency: text.includes('urgent') ? 'high' : 'medium',
        recommended_next_action: 'Share product catalog and discuss custom specifications'
      },
      qualification_reason: 'Clear commercial intent for custom trophies/awards matching our core product catalog.',
      recommended_pipeline_stage: 'qualified',
      confidence_score: 0.85,
      flag_for_review: false,
      suggested_reply: `Hi ${identity.name || 'there'}, thank you for reaching out to EcoTrophy! We would be delighted to assist with your requirements. We are preparing our best options and catalog for you right now.`,
      internal_audit_log: `Lead Name: ${identity.name}\nCompany: ${identity.company || 'N/A'}\nWhatsApp Number: ${senderPhone}\nStatus: Qualified\nKey Details Extracted:\n• Requirement: ${messageText}\n• Urgency: ${text.includes('urgent') ? 'High' : 'Medium'}\nReason for Status: Clear buying intent for trophies/awards.\nPipeline Updated: Yes (Stage: Qualified)`
    };
  }

  // 4. Ambiguous / Short greeting or casual personal message (NOT a qualified business lead)
  return {
    classification: 'other',
    qualification_status: 'Needs Follow-up',
    is_business_lead: false,
    extracted_details: {
      name: identity.name,
      company: identity.company || '',
      email: '',
      phone: senderPhone,
      requirement: messageText,
      quantity: '',
      budget: '',
      timeline: '',
      location: '',
      urgency: 'low',
      recommended_next_action: 'Wait for product/order requirement or reply politely'
    },
    qualification_reason: 'Greeting or casual message without clear commercial buying intent.',
    recommended_pipeline_stage: 'new',
    confidence_score: 0.6,
    flag_for_review: true,
    suggested_reply: `Vanakkam ${identity.name || ''}! Welcome to EcoTrophy Innovations — India's Premier Sustainable Trophy & Awards maker. How can we help you today?`,
    internal_audit_log: `Lead Name: ${identity.name}\nWhatsApp Number: ${senderPhone}\nStatus: Needs Follow-up\nKey Details Extracted:\n• Requirement: Unspecified message\nReason for Status: No clear sales lead intent detected yet.\nPipeline Updated: Skipped`
  };
}

const GEMINI_MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

/**
 * Main AI Analyzer using Google Gemini with Tamil + Tanglish + English understanding
 */
export async function analyzeIncomingWhatsAppMessage(
  messageText: string,
  senderPhone: string,
  senderName: string = '',
  chatHistory: Array<{ direction: 'inbound' | 'outbound'; content: string; timestamp?: any }> = []
): Promise<WhatsAppAiAnalysisResult> {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    console.warn('[AI Analyzer] Gemini API key not found in env/localStorage, using intelligent heuristic analyzer.');
    return heuristicAnalysis(messageText, senderPhone, senderName);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const historyFormatted = chatHistory.slice(-6).map(m => `[${m.direction.toUpperCase()}]: ${m.content}`).join('\n');

    const prompt = `
You are an expert AI Sales Qualification and CRM Assistant for "EcoTrophy Innovations" (a company specializing in custom eco-friendly corporate trophies, mementos, medals, plaques, and awards).

Your task is to analyze incoming WhatsApp messages from prospective clients or existing customers, accurately interpret Tamil, Tanglish (Tamil written in English script), and English, extract key sales details, determine whether this is a potential sales lead, make a qualification decision, and formulate a suggested professional reply.

RULES:
1. Multi-Lingual Understanding: Accurately understand colloquial Tamil & Tanglish (e.g. "50 pcs venum", "budget 25k kulla", "memento model anupunga", "naalai ku kidaikuma", "payment panniten").
2. Store ALL extracted fields and reasoning in CLEAN, PROFESSIONAL ENGLISH.
3. "is_business_lead":
   - true ONLY if the conversation clearly shows a prospective customer enquiry wanting to purchase custom trophies, awards, medals, mementos, plaques, or corporate gifts, or a customer following up on an existing order or payment.
   - FALSE for ALL VENDOR / SUPPLIER pitches (e.g. suppliers selling acrylic sheets, MDF, raw materials, trophy blanks, laser machines, UV printers, machinery, courier services, loans, digital marketing, website development). EcoTrophy is the SELLER; anyone trying to sell TO EcoTrophy is NOT a business lead.
   - FALSE for ALL IndiaMART, TradeIndia, JustDial broadcasts, alerts ("buy lead", "view enquiry"), advertisements, spam, job seekers, and promotional broadcasts.
   - FALSE for ALL regular personal conversations ("Hi", "Hello", "Call me", "Where are you", casual friend/family chats), greetings, acknowledgements ("Ok", "Thanks"), media-only placeholders ("Photo", "Video"), OTPs, bank alerts.
4. Name & Company Extraction:
   - Extract real personal name into "name" (e.g. from "I am Rajesh", "Name: Suresh", "Regards, Anand", or sender profile name if not a phone number).
   - Extract company / institution name into "company" (e.g. from "ABC School", "Infosys", "Company: Tech Corp").
   - NEVER set "name" to a phone number or generic "Customer" if an actual name or company name is found. If only a company is mentioned, use the company name in "name".
5. Strict Qualification:
   - "Qualified": Matches our business ICP (trophies, mementos, plaques, medals, corporate gifts) with clear customer buying intent, quantity, or budget.
   - "Not Qualified": Vendor/supplier pitches, IndiaMART broadcasts, advertisements, spam, or non-business message.
   - "Needs Follow-up": Customer buyer inquiry with incomplete specs (e.g. asking for catalog or prices without quantity yet).
6. If confidence is below 0.70 or intent is ambiguous, set flag_for_review: true.
7. Suggested reply: Draft a polite, concise response acknowledging their specific need. (DO NOT send automatically, this is for human approval).

Incoming Message Details:
Sender Phone: ${senderPhone}
Sender Name (if available): ${senderName || 'Unknown'}
Latest Message: "${messageText}"

Recent Chat History Context:
${historyFormatted || '(No prior history)'}

Respond with a JSON object strictly matching this schema:
{
  "is_business_lead": true,
  "classification": "new_lead" | "follow_up" | "customer_query" | "support_issue" | "payment_related" | "meeting_request" | "spam" | "other",
  "qualification_status": "Qualified" | "Not Qualified" | "Needs Follow-up",
  "extracted_details": {
    "name": "string (extracted sender or organization name)",
    "company": "string (company/institution name if mentioned)",
    "email": "string (email address if mentioned)",
    "phone": "${senderPhone}",
    "requirement": "string (detailed description in English of what trophies/products they need)",
    "quantity": "string (e.g. '50 pieces')",
    "budget": "string (e.g. '₹25,000')",
    "timeline": "string (e.g. 'Next Friday / 2 weeks')",
    "location": "string (city/state if mentioned)",
    "urgency": "low" | "medium" | "high",
    "recommended_next_action": "string (e.g. 'Send catalog for wooden trophies', 'Verify payment')"
  },
  "qualification_reason": "string (1-2 clear sentences in English explaining why this status was chosen)",
  "recommended_pipeline_stage": "new" | "contacted" | "qualified" | "lost" | "needs_review",
  "confidence_score": 0.95,
  "flag_for_review": false,
  "suggested_reply": "string (professional draft reply in English/friendly tone)"
}
`;

    let responseText = '';
    let lastErr: any = null;
    for (const modelName of GEMINI_MODEL_CANDIDATES) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        if (responseText) break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!responseText) {
      throw lastErr || new Error('Empty Gemini response');
    }

    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    const inferredBusinessLead =
      typeof parsed.is_business_lead === 'boolean'
        ? parsed.is_business_lead
        : parsed.classification !== 'spam' &&
          parsed.classification !== 'other' &&
          parsed.recommended_pipeline_stage !== 'lost';

    // Build the exact required audit log format
    const auditLog = `Lead Name: ${parsed.extracted_details?.name || senderName || 'Prospective Lead'}
WhatsApp Number: ${senderPhone}
Status: ${parsed.qualification_status}
Key Details Extracted:
• Requirement: ${parsed.extracted_details?.requirement || 'Not specified'}
• Quantity: ${parsed.extracted_details?.quantity || 'Not specified'}
• Budget: ${parsed.extracted_details?.budget || 'Not specified'}
• Timeline: ${parsed.extracted_details?.timeline || 'Not specified'}
• Urgency: ${parsed.extracted_details?.urgency || 'Medium'}
• Location: ${parsed.extracted_details?.location || 'Not specified'}
Reason for Status: ${parsed.qualification_reason}
Pipeline Updated: ${inferredBusinessLead ? `Yes (Stage: ${(parsed.recommended_pipeline_stage || 'new').toUpperCase()})` : 'No'}`;

    return {
      classification: parsed.classification || 'new_lead',
      qualification_status: parsed.qualification_status || 'Needs Follow-up',
      is_business_lead: inferredBusinessLead,
      extracted_details: {
        name: parsed.extracted_details?.name || senderName || '',
        company: parsed.extracted_details?.company || '',
        email: parsed.extracted_details?.email || '',
        phone: senderPhone,
        requirement: parsed.extracted_details?.requirement || messageText,
        quantity: parsed.extracted_details?.quantity || '',
        budget: parsed.extracted_details?.budget || '',
        timeline: parsed.extracted_details?.timeline || '',
        location: parsed.extracted_details?.location || '',
        urgency: parsed.extracted_details?.urgency || 'medium',
        recommended_next_action: parsed.extracted_details?.recommended_next_action || 'Follow up with lead',
      },
      qualification_reason: parsed.qualification_reason || 'AI analysis completed.',
      recommended_pipeline_stage: parsed.recommended_pipeline_stage || 'new',
      confidence_score: Number(parsed.confidence_score || 0.8),
      flag_for_review: Boolean(parsed.flag_for_review || (parsed.confidence_score < 0.7)),
      suggested_reply: parsed.suggested_reply || 'Thank you for reaching out to EcoTrophy. How can we help you?',
      internal_audit_log: auditLog,
    };
  } catch (error: any) {
    console.error('[AI Analyzer] Gemini analysis failed, using heuristic fallback:', error);
    return heuristicAnalysis(messageText, senderPhone, senderName);
  }
}

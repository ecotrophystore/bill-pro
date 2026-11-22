/**
 * Shared WhatsApp enquiry qualification helpers so only genuine customer
 * enquiries and commercial order/payment follow-ups enter CRM pipelines.
 * Personal chats, greetings, media-only previews, IndiaMART broadcasts,
 * and vendor/supplier sales pitches are strictly filtered out.
 */

export const WHATSAPP_MEDIA_OR_SYSTEM_RE =
  /^(\[new whatsapp message\]|photo|photos|video|videos|audio|voice\s*message|ptt|sticker|gif|document|image|contact\s*card|location|live\s*location|missed\s*(?:voice|video)\s*call|incoming\s*(?:voice|video)\s*call|this message was deleted|you deleted this message|waiting for this message\.?)$/i;

export const WHATSAPP_SPAM_OR_ALERT_RE =
  /(click here|earn money|lottery|work from home|\b(?:otp|one time password|verification code|debited|credited|a\/c\s*x+|unsubscribe|sebi|stock market|win cash|congratulations.*winner|instant loan|credit card offer)\b)/i;

/**
 * Strict regex to identify Vendor / Supplier / IndiaMART pitches and unwanted B2B marketing broadcasts.
 * EcoTrophy is the manufacturer/seller of trophies; suppliers trying to SELL raw materials,
 * acrylic sheets, machinery, SEO, or IndiaMART leads must NEVER enter the CRM as customer leads.
 */
export const WHATSAPP_VENDOR_OR_INDIAMART_RE =
  /\b(indiamart|india\s*mart|tradeindia|trade\s*india|justdial|just\s*dial|exportersindia|exporters\s*india|udaan|sulekha|b2b\s*portal|buy\s*lead(?:s)?|view\s*enquir(?:y|ies)\s*on\s*indiamart|seller\s*on\s*indiamart|indiamart\.com|tradeindia\.com|justdial\.com|we\s*(?:are|r)\s*(?:a\s*)?(?:leading\s*)?(?:manufacturer|manufacturers|mfrs?|supplier|suppliers|dealer|dealers|wholesaler|wholesalers|distributor|distributors|stockist|stockists|importer|importers|trader|traders)\b|we\s*(?:deal|deals|specialize|supply|provide|offer|manufacture|fabricate)\s*(?:in|all\s*kinds\s*of|raw\s*materials?|laser|acrylic|sheets?|machines?|trophies|mementos)\b|raw\s*material(?:s)?\s*(?:supplier|available|price|for\s*sale)|acrylic\s*(?:sheet|sheets|offcut|board|scrap|raw\s*material)|mdf\s*(?:sheet|sheets|board|boards|cutouts?)|laser\s*(?:cutting|engraving|marking)?\s*machine(?:s)?|uv\s*(?:printer|flatbed|ink)|fiber\s*laser|co2\s*laser|cnc\s*router|sublimation\s*(?:machine|heat\s*press|paper|ink)|medal\s*ribbon\s*manufacturer|lanyard\s*manufacturer|digital\s*marketing|seo\s*services?|website\s*design|web\s*development|google\s*ads\s*service|bulk\s*sms|whatsapp\s*marketing\s*service|business\s*loan|msme\s*loan|unsecured\s*loan|packaging\s*box\s*manufacturer|corrugated\s*box(?:es)?\s*manufacturer|courier\s*(?:service|partner)|transport\s*(?:service|logistics)\s*(?:provider|pan\s*india)|catalogue\s*attached\s*for\s*your\s*reference.*dealership|dealer\s*price\s*list|wholesale\s*rate\s*for\s*dealers)\b/i;

export const WHATSAPP_CASUAL_CHAT_RE =
  /^(hi+|hlo|hello+|hey+|hai|vanakkam|namaste|good\s*(?:morning|afternoon|evening|night)|gm|gn|happy\s+[\w\s]+|ok+|okay+|kk|k|done|sure|yes|no|nope|yeah|yup|thanks?|thank\s*you|tq|ty|noted|welcome|fine|super|nice|cool|great|call\s*me(?:\s*back)?|call\s*later|busy|in\s*(?:a\s*)?meeting|where\s*(?:are|r)\s*you|how\s*(?:are|r)\s*you|what(?:'s|s)?\s*up|coming|reached|left|on\s*the\s*way|check\s*(?:this|it)|see\s*(?:this|you)|👍+|🙏+|👌+|❤️+)[.!?\s]*$/i;

export const WHATSAPP_PRODUCT_NOUN_RE =
  /\b(troph(?:y|ies)|award(?:s)?|medal(?:s)?|memento(?:s)?|momento(?:s|es)?|shield(?:s)?|plaque(?:s)?|crystal|acrylic|wooden|corporate\s*gift(?:s)?|souvenir(?:s)?|crest(?:s)?|badge(?:s)?|ecotrophy)\b/i;

export const WHATSAPP_COMMERCIAL_INTENT_RE =
  /\b(enquir(?:y|ies)|inquir(?:y|ies)|quot(?:e|ation)|proforma|pric(?:e|ing)|rate(?:s)?|cost|budget|estimat(?:e|ion)|catalog(?:ue)?|brochure|sample(?:s)?|mockup(?:s)?|engrav(?:e|ing)|moq|minimum\s*order|bulk\s*order|custom(?:ized|ised)?\s+(?:troph(?:y|ies)|award(?:s)?|medal(?:s)?|memento(?:s)?|plaque(?:s)?|gift(?:s)?|cup(?:s)?|badge(?:s)?|order)|(?:place|new|want\s*to|need(?:\s*to)?|confirm)\s+(?:\w+\s+)?order|how\s*much|rate\s*enna|price\s*enna|evlo|evalavu|order\s*(?:pannanum|podanum)|(?:catalog|brochure|model|rate|price|quot(?:e|ation))\s*anupunga)\b/i;

export const WHATSAPP_PAYMENT_TERM_RE =
  /\b(payment|paid|gpay|google\s*pay|phonepe|paytm|upi|bank\s*transfer|neft|rtgs|imps|utr|transaction\s*id|invoice|advance\s*(?:paid|payment|amount)|panniten)\b/i;

export const WHATSAPP_NUMBERED_QTY_RE =
  /\b\d{1,5}(?:\s+(?!inch|inches|cm|mm|ft|rs|inr|rupees|budget|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]+){0,2}\s*(?:pcs|pieces|nos\.?|units|sets|troph(?:y|ies)|awards?|medals?|mementos?|momento(?:s|es)?|plaques?|shields?)\b|\b(?:qty|quantity)\s*[:=-]?\s*\d{1,5}\b/i;

export const WHATSAPP_EVENT_AWARD_RE =
  /(?:sports\s*day|annual\s*day|convocation|prize\s*distribution|felicitation).*(?:troph(?:y|ies)|award(?:s)?|medal(?:s)?|memento(?:s)?|shield(?:s)?|plaque(?:s)?|prize|cup(?:s)?|gift(?:s)?|order|need|want|require|looking|pric(?:e|ing)|quot(?:e|ation)|enquir|inquir)|(?:need|want|require|looking\s*for|order).*(?:sports\s*day|annual\s*day|convocation|prize\s*distribution|felicitation)/i;

export function isMediaOrSystemNoise(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length < 2) return true;
  if (WHATSAPP_MEDIA_OR_SYSTEM_RE.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (WHATSAPP_SPAM_OR_ALERT_RE.test(lower)) return true;
  if (WHATSAPP_VENDOR_OR_INDIAMART_RE.test(lower)) return true;
  return false;
}

export function hasCommercialEnquirySignal(
  text: string,
  extra?: { quantity?: string; budget?: string }
): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed || isMediaOrSystemNoise(trimmed)) return false;

  const lower = trimmed.toLowerCase();
  // Vendor pitches and IndiaMART broadcasts must never be treated as commercial buyer enquiries
  if (WHATSAPP_VENDOR_OR_INDIAMART_RE.test(lower)) {
    return false;
  }

  if (extra?.quantity && /\d/.test(extra.quantity)) return true;
  if (extra?.budget && /\d/.test(extra.budget)) return true;

  if (
    WHATSAPP_PRODUCT_NOUN_RE.test(lower) ||
    WHATSAPP_COMMERCIAL_INTENT_RE.test(lower) ||
    WHATSAPP_PAYMENT_TERM_RE.test(lower) ||
    WHATSAPP_NUMBERED_QTY_RE.test(lower) ||
    WHATSAPP_EVENT_AWARD_RE.test(lower)
  ) {
    return true;
  }

  // Support explicit currency figures when combined with buy/need verbs
  if (
    /(?:rs\.?|inr|₹|\b\d+\s*k\b)/i.test(lower) &&
    /\b(need|want|looking|order|around|under|within|for|troph|award|medal|memento|gift)\b/i.test(lower)
  ) {
    return true;
  }

  // Support Tanglish buy verbs ("venum" / "theva" / "anupunga") only when paired with a number or commercial cue
  if (
    /\b(venum|theva|anupunga|kulla)\b/i.test(lower) &&
    (/\d/.test(lower) || /\b(model|design|gift|cup|school|college|event|company|office|advance|balance)\b/i.test(lower))
  ) {
    return true;
  }

  return false;
}

export function isCasualConversationOnly(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed) return true;
  if (isMediaOrSystemNoise(trimmed)) return true;
  if (hasCommercialEnquirySignal(trimmed)) return false;
  return WHATSAPP_CASUAL_CHAT_RE.test(trimmed);
}

/**
 * Final decision gate used before creating a new lead or placing a chat in CRM pipelines.
 * Never qualifies unread status, unsaved numbers, vendor pitches, or IndiaMART broadcasts.
 */
export function isCustomerEnquiryLead(params: {
  latestText: string;
  combinedText?: string;
  quantity?: string;
  budget?: string;
  aiIsBusinessLead?: boolean;
  aiClassification?: string;
  aiQualificationStatus?: string;
  aiRecommendedStage?: string;
}): boolean {
  const latest = String(params.latestText || '').trim();
  const contextText = String(params.combinedText || latest).trim();

  if (isMediaOrSystemNoise(latest) || isMediaOrSystemNoise(contextText)) return false;
  if (WHATSAPP_VENDOR_OR_INDIAMART_RE.test(latest) || WHATSAPP_VENDOR_OR_INDIAMART_RE.test(contextText)) return false;
  if (params.aiClassification === 'spam' || params.aiClassification === 'other') return false;
  if (params.aiQualificationStatus === 'Not Qualified') return false;
  if (params.aiRecommendedStage === 'lost') return false;
  if (isCasualConversationOnly(latest) && !hasCommercialEnquirySignal(contextText, params)) return false;

  const hasKeywordSignal =
    hasCommercialEnquirySignal(latest, { quantity: params.quantity, budget: params.budget }) ||
    hasCommercialEnquirySignal(contextText, { quantity: params.quantity, budget: params.budget });

  // Strict requirement gate: A lead must have a genuine commercial requirement signal
  // (products, quantity, pricing, catalog, budget, or event award specifications).
  // If the contact is only chatting without sending any requirement, they must NOT be automatically added as a lead.
  return Boolean(hasKeywordSignal);
}

/**
 * Intelligent extraction of Customer Name and Company/Institution Name from message text,
 * push names, or prior lead details, preventing raw phone numbers from displaying as lead names.
 */
export interface ExtractedContactIdentity {
  name: string;
  company: string;
  hasSpecificName: boolean;
  hasSpecificCompany: boolean;
}

const GENERIC_CONTACT_TERMS = new Set([
  'unknown',
  'customer',
  'contact',
  'lead',
  'inquiry',
  'whatsapp lead',
  'prospective lead',
  'prospective client',
  'valued customer',
  'meta ai',
  'whatsapp',
  'whatsapp business',
  'user',
  'client',
  'sir',
  'madam',
  'admin'
]);

export function isRealContactName(raw?: string | null): boolean {
  if (!raw) return false;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3) return false;
  // If it's a phone number (e.g. +91 98765 43210 or digits only) -> NOT a name
  if (/^\+?[\d\s\-()]{7,}$/.test(cleaned)) return false;
  if (/^(lead\s*\+?[\d\s]+)$/i.test(cleaned)) return false;
  if (GENERIC_CONTACT_TERMS.has(cleaned.toLowerCase())) return false;
  return true;
}

export function extractCustomerAndCompanyInfo(params: {
  text?: string;
  senderName?: string;
  pushname?: string;
  phone?: string;
  aiName?: string;
  aiCompany?: string;
  existingName?: string;
  existingCompany?: string;
}): ExtractedContactIdentity {
  const text = String(params.text || '').trim();
  const rawSender = String(params.senderName || '').trim();
  const rawPushname = String(params.pushname || '').trim();
  const rawAiName = String(params.aiName || '').trim();
  const rawAiCompany = String(params.aiCompany || '').trim();
  const rawExistingName = String(params.existingName || '').trim();
  const rawExistingCompany = String(params.existingCompany || '').trim();

  let identifiedName = '';
  let identifiedCompany = '';

  // 1. Existing verified company or AI-extracted company
  if (isRealContactName(rawExistingCompany)) {
    identifiedCompany = rawExistingCompany;
  } else if (isRealContactName(rawAiCompany)) {
    identifiedCompany = rawAiCompany;
  }

  // 2. Company / Institution name patterns in message text
  if (!identifiedCompany && text) {
    const orgPatterns = [
      /\b(?:company|organization|institution|school|college|firm|academy|trust|foundation)\s*(?:name)?\s*[:=-]\s*([A-Za-z0-9\s&'\.,\-]{2,50})/i,
      /\b(?:from|for|at|representing|on behalf of)\s+([A-Z][A-Za-z0-9\s&'\.]+(?:school|college|academy|university|pvt\s+ltd|limited|corp|institute|club|trust|foundation|solutions|technologies|enterprises|associates|group|industries|sports\s+club|society|association|hospital))\b/i,
      /\b(?:calling from|we are from|contacting from|messaging from)\s+([A-Za-z0-9\s&'\.,\-]{3,40})/i
    ];
    for (const pat of orgPatterns) {
      const match = text.match(pat);
      if (match && match[1] && isRealContactName(match[1])) {
        const candidate = match[1].trim().replace(/[,\.;]+$/, '');
        if (!GENERIC_CONTACT_TERMS.has(candidate.toLowerCase())) {
          identifiedCompany = candidate;
          break;
        }
      }
    }
  }

  // 3. Customer's own name:
  // Priority:
  // a) Existing verified customer name in database
  // b) Customer's own WhatsApp display name (pushname) - NEVER sales-entered contact name
  // c) Self-introduction in message text ("I am Rajesh", "My name is ...")
  // d) AI-extracted name from message content
  // Note: rawSender (the name entered/saved by the sales team in WhatsApp) is intentionally NOT used.
  if (isRealContactName(rawExistingName)) {
    identifiedName = rawExistingName;
  } else if (isRealContactName(rawPushname)) {
    identifiedName = rawPushname;
  }

  // 4. Person's name self-introduction patterns in message text
  if (!identifiedName && text) {
    const personPatterns = [
      /\b(?:i am|i'm|my name is|this is|myself|speaking is)\s+([A-Z][a-zA-Z\.]+(?:\s+[A-Z][a-zA-Z\.]+){0,2})\b/i,
      /\b(?:name|contact person|poc|enquirer|caller)\s*[:=-]\s*([A-Za-z\s\.]{2,30})/i,
      /\b(?:regards|thanks & regards|warm regards|with regards|cheers|sincerely)\s*,?\s*[\r\n]+\s*([A-Za-z\s\.]{2,30})/i,
      /\b(?:en peyar|naan)\s+([A-Z][a-z]+)\b/i
    ];
    for (const pat of personPatterns) {
      const match = text.match(pat);
      if (match && match[1] && isRealContactName(match[1])) {
        const candidate = match[1].trim().replace(/[,\.;]+$/, '');
        if (!GENERIC_CONTACT_TERMS.has(candidate.toLowerCase())) {
          identifiedName = candidate;
          break;
        }
      }
    }
  }

  // 5. Fallback to AI-extracted name if verified as real contact name
  if (!identifiedName && isRealContactName(rawAiName)) {
    identifiedName = rawAiName;
  }

  const hasSpecificName = isRealContactName(identifiedName);
  const hasSpecificCompany = isRealContactName(identifiedCompany);

  // Determine final lead display name:
  // If we have a personal name, use it.
  // If we have ONLY a company name (e.g. "St. Joseph's Higher Secondary School"), use the company name as lead name!
  // Only if NEITHER is found, fall back to phone number format.
  let finalName = '';
  if (hasSpecificName) {
    finalName = identifiedName;
  } else if (hasSpecificCompany) {
    finalName = identifiedCompany;
  } else if (params.phone) {
    const rawDigits = params.phone.replace(/\D/g, '');
    finalName = rawDigits.length === 10
      ? `+91 ${rawDigits.slice(0, 5)} ${rawDigits.slice(5)}`
      : rawDigits.length === 12 && rawDigits.startsWith('91')
        ? `+91 ${rawDigits.slice(2, 7)} ${rawDigits.slice(7)}`
        : `+${rawDigits || params.phone}`;
  } else {
    finalName = 'New Customer';
  }

  return {
    name: finalName,
    company: identifiedCompany,
    hasSpecificName: hasSpecificName || hasSpecificCompany,
    hasSpecificCompany,
  };
}

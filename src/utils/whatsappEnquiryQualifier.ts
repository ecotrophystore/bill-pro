/**
 * Shared WhatsApp enquiry qualification helpers so only genuine customer
 * enquiries and commercial order/payment follow-ups enter CRM pipelines.
 * Personal chats, greetings, and media-only previews are kept out.
 */

export const WHATSAPP_MEDIA_OR_SYSTEM_RE =
  /^(\[new whatsapp message\]|photo|photos|video|videos|audio|voice\s*message|ptt|sticker|gif|document|image|contact\s*card|location|live\s*location|missed\s*(?:voice|video)\s*call|incoming\s*(?:voice|video)\s*call|this message was deleted|you deleted this message|waiting for this message\.?)$/i;

export const WHATSAPP_SPAM_OR_ALERT_RE =
  /(click here|earn money|lottery|work from home|\b(?:otp|one time password|verification code|debited|credited|a\/c\s*x+|unsubscribe|sebi|stock market|win cash)\b)/i;

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
  return WHATSAPP_SPAM_OR_ALERT_RE.test(trimmed.toLowerCase());
}

export function hasCommercialEnquirySignal(
  text: string,
  extra?: { quantity?: string; budget?: string }
): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed || isMediaOrSystemNoise(trimmed)) return false;

  if (extra?.quantity && /\d/.test(extra.quantity)) return true;
  if (extra?.budget && /\d/.test(extra.budget)) return true;

  const lower = trimmed.toLowerCase();
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
 * Never qualifies unread status or unsaved numbers on its own without commercial enquiry intent.
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

  if (isMediaOrSystemNoise(latest)) return false;
  if (params.aiClassification === 'spam' || params.aiQualificationStatus === 'Not Qualified') return false;
  if (params.aiRecommendedStage === 'lost') return false;
  if (isCasualConversationOnly(latest) && !hasCommercialEnquirySignal(contextText, params)) return false;

  const hasKeywordSignal =
    hasCommercialEnquirySignal(latest, { quantity: params.quantity, budget: params.budget }) ||
    hasCommercialEnquirySignal(contextText, { quantity: params.quantity, budget: params.budget });

  if (params.aiIsBusinessLead === true) {
    return hasKeywordSignal || !WHATSAPP_CASUAL_CHAT_RE.test(latest);
  }

  return hasKeywordSignal;
}


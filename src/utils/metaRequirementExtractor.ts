export interface ExtractedRequirement {
  required_quantity?: number;
  event_name?: string;
  event_type?: string;
  event_date?: string;
  delivery_date?: string;
  trophy_type?: string;
  trophy_size?: string;
  budget?: string;
  organization?: string;
  location?: string;
  customer_type?: string;
  urgency?: 'low' | 'medium' | 'high';
  notes?: string;
  confidence: number;
}

/**
 * Extracts structured customer requirement attributes from raw text / Meta enquiry messages.
 * Leaves fields empty when information is not present (avoids guessing).
 */
export function extractMetaRequirements(text: string): ExtractedRequirement {
  if (!text || typeof text !== 'string') {
    return { confidence: 0 };
  }

  const raw = text.trim();
  const lower = raw.toLowerCase();
  const result: ExtractedRequirement = { confidence: 0 };
  let points = 0;

  // 1. Quantity Extraction (e.g. "150 trophies", "50 pcs", "need 120", "qty: 30", "250 awards", "10 pieces")
  const qtyPatterns = [
    /(?:need|want|require|order|for|qty|quantity|count|around|approx)?\s*[:=-]?\s*(\d{1,5})\s*(?:trophies|trophy|pieces|piece|pcs|pc|awards|award|medals|medal|mementos|memento|shields|shield|cups|cup)/i,
    /(\d{1,5})\s*(?:nos|qty|units|sets)/i,
    /(?:qty|quantity)\s*[:=-]\s*(\d{1,5})/i,
    /(?:total of|bulk of)\s*(\d{1,5})/i,
  ];

  for (const pattern of qtyPatterns) {
    const match = raw.match(pattern);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        result.required_quantity = parsed;
        points += 30;
        break;
      }
    }
  }

  // Fallback single number if explicitly structured (e.g. "Quantity: 50")
  if (!result.required_quantity) {
    const directMatch = raw.match(/\b(?:quantity|qty)\s*[:=]\s*(\d+)\b/i);
    if (directMatch) {
      result.required_quantity = parseInt(directMatch[1], 10);
      points += 30;
    }
  }

  // 2. Event Name & Event Type
  const eventMatches = [
    { regex: /(?:annual\s+sports\s+day|sports\s+day|sports\s+meet)/i, name: 'Annual Sports Day', type: 'Sports' },
    { regex: /(?:cricket\s+tournament|football\s+tournament|badminton\s+tournament|chess\s+tournament|tournament)/i, name: 'Sports Tournament', type: 'Sports' },
    { regex: /(?:school\s+day|annual\s+day|college\s+day|kindergarten\s+day|convocation|graduation)/i, name: 'Annual School / College Day', type: 'School' },
    { regex: /(?:awards\s+ceremony|award\s+function|annual\s+awards|recognition\s+event|gala)/i, name: 'Award Ceremony', type: 'Corporate' },
    { regex: /(?:marathon|run\s+event|5k|10k|cyclothon)/i, name: 'Marathon / Athletic Event', type: 'Sports' },
    { regex: /(?:corporate\s+meet|sales\s+meet|dealer\s+meet|annual\s+general\s+meeting|agm)/i, name: 'Corporate Meet', type: 'Corporate' },
    { regex: /(?:quiz\s+competition|dance\s+competition|singing\s+competition|competition)/i, name: 'Competition Event', type: 'Academic' },
  ];

  for (const ev of eventMatches) {
    if (ev.regex.test(raw)) {
      result.event_name = ev.name;
      result.event_type = ev.type;
      points += 20;
      break;
    }
  }

  // 3. Dates (Event Date / Delivery Date)
  // Look for date patterns like "on October 20", "on 20th Oct", "by 20/10/2026", "delivery by Friday"
  const datePatterns = [
    /(?:on|dated|date|for)\s+([0-3]?\d(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?)/i,
    /(?:on|dated|date|for)\s+((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+[0-3]?\d(?:st|nd|rd|th)?(?:\s+\d{4})?)/i,
    /(?:on|date)\s+([0-3]?\d[\/\-\.][0-1]?\d[\/\-\.]\d{2,4})/i,
  ];

  for (const dp of datePatterns) {
    const dMatch = raw.match(dp);
    if (dMatch && dMatch[1]) {
      result.event_date = dMatch[1].trim();
      points += 15;
      break;
    }
  }

  const deliveryPatterns = [
    /(?:delivery\s+(?:by|date|before|on)|need\s+(?:by|before))\s+([0-3]?\d(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?)/i,
    /(?:delivery\s+(?:by|date|before|on)|need\s+(?:by|before))\s+([0-3]?\d[\/\-\.][0-1]?\d[\/\-\.]\d{2,4})/i,
    /(?:need\s+delivery\s+by|deliver\s+by)\s+([a-zA-Z0-9\s,]+)/i,
  ];

  for (const delP of deliveryPatterns) {
    const delMatch = raw.match(delP);
    if (delMatch && delMatch[1]) {
      result.delivery_date = delMatch[1].trim();
      points += 15;
      break;
    }
  }

  // 4. Trophy Type & Size
  const trophyTypes = [
    { regex: /(?:crystal\s+trophy|crystal\s+award|glass\s+trophy)/i, label: 'Crystal Trophy' },
    { regex: /(?:wooden\s+plaque|wooden\s+shield|wood\s+trophy|wooden\s+memento)/i, label: 'Wooden Shield / Plaque' },
    { regex: /(?:metal\s+cup|metal\s+trophy|brass\s+cup)/i, label: 'Metal Cup / Trophy' },
    { regex: /(?:acrylic\s+award|acrylic\s+trophy|acrylic\s+memento)/i, label: 'Acrylic Award' },
    { regex: /(?:gold\s+medal|silver\s+medal|bronze\s+medal|medals|ribbon\s+medal)/i, label: 'Medals' },
    { regex: /(?:star\s+trophy|pillar\s+trophy|custom\s+memento)/i, label: 'Custom Memento' },
  ];

  for (const t of trophyTypes) {
    if (t.regex.test(raw)) {
      result.trophy_type = t.label;
      points += 10;
      break;
    }
  }

  const sizeMatch = raw.match(/(\d{1,2}(?:\.\d)?)\s*(?:inch|inches|in|\"|cm)\b/i);
  if (sizeMatch && sizeMatch[1]) {
    result.trophy_size = `${sizeMatch[1]} Inch`;
    points += 10;
  }

  // 5. Budget (e.g. "₹500 per trophy", "budget around ₹500", "Rs 300 each")
  const budgetMatch = raw.match(/(?:budget\s*(?:around|is|of|approx)?|rate|price|cost)?\s*[:=-]?\s*(?:₹|rs\.?|inr)\s*(\d{2,7}(?:\s*(?:per|each|\/|-)?\s*(?:trophy|piece|pc|item))?)/i);
  if (budgetMatch && budgetMatch[1]) {
    result.budget = `₹${budgetMatch[1].trim()}`;
    points += 15;
  }

  // 6. Organization / School / Company Name
  const orgMatch = raw.match(/(?:for|from|our|at)\s+([A-Z][A-Za-z0-9\s&'\.]+(?:school|college|academy|university|pvt\s+ltd|limited|corp|institute|club|trust|foundation|sports\s+club|society|association))\b/i);
  if (orgMatch && orgMatch[1]) {
    result.organization = orgMatch[1].trim();
    result.customer_type = /school|college|academy|university|institute/i.test(orgMatch[1]) ? 'School / College' : 'Corporate';
    points += 15;
  }

  // 7. Location (e.g. in Chennai, Bangalore, Mumbai, etc.)
  const cityMatch = raw.match(/(?:in|at|location|city|delivery\s+to|branch)?\s*[:=-]?\s*\b(Chennai|Bangalore|Bengaluru|Mumbai|Delhi|Hyderabad|Coimbatore|Kolkata|Pune|Ahmedabad|Jaipur|Madurai|Trichy|Salem|Kochi|Trivandrum|Calicut|Goa|Noida|Gurgaon)\b/i);
  if (cityMatch && cityMatch[1]) {
    result.location = cityMatch[1].trim();
    points += 10;
  }

  // 8. Urgency
  if (/(?:urgent|emergency|asap|within\s+[12]\s+days|by\s+tomorrow|today|immediate)/i.test(lower)) {
    result.urgency = 'high';
  } else if (/(?:this\s+week|next\s+week|soon|within\s+5\s+days)/i.test(lower)) {
    result.urgency = 'medium';
  } else if (result.required_quantity) {
    result.urgency = 'low';
  }

  result.confidence = Math.min(100, Math.max(10, points));

  return result;
}

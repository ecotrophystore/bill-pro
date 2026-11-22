export interface ExtractedRequirement {
  customer_name?: string;
  required_quantity?: number;
  event_name?: string;
  event_type?: string;
  event_date?: string;
  delivery_date?: string;
  trophy_type?: string;
  trophy_size?: string;
  budget?: string;
  value?: number;
  organization?: string;
  location?: string;
  email?: string;
  phone?: string;
  customer_type?: string;
  urgency?: 'low' | 'medium' | 'high';
  notes?: string;
  confidence: number;
}

/**
 * Extracts structured customer requirement attributes from raw text / Meta enquiry messages.
 * Handles both key-value / Story Builder formats (with bullet points or markers) and natural language text.
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

  // 0. High-Priority Story Builder / Key-Value Field Parsing
  // Handles lines starting with bullet points (•, *, -) or whitespace

  // Name: Must NOT be preceded by "event", "programme", "user", "file"
  const nameMatchStructured = raw.match(/^[•\*\-\s]*(?<!event\s*)(?<!programme\s*)(?<!program\s*)Name\s*[:=-]\s*(.+)$/im);
  if (nameMatchStructured && nameMatchStructured[1]) {
    const candidateName = nameMatchStructured[1].replace(/[*_~]/g, '').trim();
    if (candidateName && !/^(looking|interested|enquiring|want|need|planning|from|sports\s+events)/i.test(candidateName)) {
      result.customer_name = candidateName;
      points += 30;
    }
  }

  // Company / Organisation
  const companyMatch = raw.match(/^[•\*\-\s]*(?:Organisation|Organization|Company|Business|Firm)\s*[:=-]\s*(.+)$/im);
  if (companyMatch && companyMatch[1]) {
    result.organization = companyMatch[1].replace(/[*_~]/g, '').trim();
    result.customer_type = /school|college|academy|university|institute/i.test(result.organization) ? 'School / College' : 'Corporate';
    points += 20;
  }

  // Email
  const emailMatch = raw.match(/^[•\*\-\s]*(?:Email|E-mail)\s*[:=-]\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/im);
  if (emailMatch && emailMatch[1]) {
    result.email = emailMatch[1].trim();
    points += 20;
  }

  // Phone / WhatsApp
  const phoneMatch = raw.match(/^[•\*\-\s]*(?:WhatsApp|Phone|Mobile|Contact\s*No|Tel)\s*[:=-]\s*([+\d\s\-()]{7,20})/im);
  if (phoneMatch && phoneMatch[1]) {
    result.phone = phoneMatch[1].replace(/\D/g, '').trim();
    points += 15;
  }

  // Event Name
  const eventMatchStructured = raw.match(/^[•\*\-\s]*(?:Event\s*\/\s*programme\s*name|Event\s*name|Programme\s*name|Event)\s*[:=-]\s*(.+)$/im);
  if (eventMatchStructured && eventMatchStructured[1]) {
    result.event_name = eventMatchStructured[1].replace(/[*_~]/g, '').trim();
    points += 20;
  }

  // Quantity (Handles ranges like 11-50 -> 50, or single numbers like 150)
  const qtyRangeMatch = raw.match(/^[•\*\-\s]*(?:Quantity|Qty|Required\s*Quantity|Count)\s*[:=-]\s*(\d+)\s*(?:-|to|–)\s*(\d+)/im);
  if (qtyRangeMatch && qtyRangeMatch[2]) {
    result.required_quantity = parseInt(qtyRangeMatch[2], 10);
    points += 30;
  } else {
    const qtyMatchStructured = raw.match(/^[•\*\-\s]*(?:Quantity|Qty|Required\s*Quantity|Count)\s*[:=-]\s*(\d+)/im);
    if (qtyMatchStructured && qtyMatchStructured[1]) {
      result.required_quantity = parseInt(qtyMatchStructured[1], 10);
      points += 30;
    }
  }

  // Budget
  const budgetMatchStructured = raw.match(/^[•\*\-\s]*(?:Budget|Estimated\s*Budget|Deal\s*Value)\s*[:=-]\s*(.+)$/im);
  if (budgetMatchStructured && budgetMatchStructured[1]) {
    const bRaw = budgetMatchStructured[1].trim();
    result.budget = bRaw;
    const numMatch = bRaw.match(/(?:₹|rs\.?|inr)?\s*([0-9,]+)/i);
    if (numMatch && numMatch[1]) {
      const numVal = parseInt(numMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(numVal) && numVal > 0) {
        result.value = numVal;
      }
    }
    points += 25;
  }

  // Event Date
  const eventDateMatchStructured = raw.match(/^[•\*\-\s]*(?:Event\s*date|Date\s*of\s*event)\s*[:=-]\s*(.+)$/im);
  if (eventDateMatchStructured && eventDateMatchStructured[1]) {
    result.event_date = eventDateMatchStructured[1].replace(/[*_~]/g, '').trim();
    points += 15;
  }

  // Delivery Deadline / Must reach by
  const deliveryMatchStructured = raw.match(/^[•\*\-\s]*(?:Trophies\s*must\s*reach\s*me\s*by|Delivery\s*date|Delivery\s*deadline|Deadline|Need\s*by)\s*[:=-]\s*(.+)$/im);
  if (deliveryMatchStructured && deliveryMatchStructured[1]) {
    result.delivery_date = deliveryMatchStructured[1].replace(/[*_~]/g, '').trim();
    points += 15;
  }

  // Location
  const locMatchStructured = raw.match(/^[•\*\-\s]*(?:Event\s*location|Delivery\s*location|Location|City)\s*[:=-]\s*(.+)$/im);
  if (locMatchStructured && locMatchStructured[1]) {
    result.location = locMatchStructured[1].replace(/[*_~]/g, '').trim();
    points += 15;
  }

  // Design Direction / Trophy Type
  const designMatch = raw.match(/^[•\*\-\s]*(?:Design\s*direction|Trophy\s*type|Material)\s*[:=-]\s*(.+)$/im);
  if (designMatch && designMatch[1]) {
    result.trophy_size = designMatch[1].replace(/[*_~]/g, '').trim();
    points += 10;
  }

  // Collect Context / Notes
  const noteParts: string[] = [];
  const occasionMatch = raw.match(/^[•\*\-\s]*Occasion\s*[:=-]\s*(.+)$/im);
  if (occasionMatch && occasionMatch[1]) noteParts.push(`Occasion: ${occasionMatch[1].trim()}`);

  const recogniseMatch = raw.match(/^[•\*\-\s]*(?:Who\s*we’re\s*recognising|Recognising)\s*[:=-]\s*(.+)$/im);
  if (recogniseMatch && recogniseMatch[1]) noteParts.push(`Recognising: ${recogniseMatch[1].trim()}`);

  const awardCategoriesMatch = raw.match(/^[•\*\-\s]*Award\s*categories\s*[:=-]\s*(.+)$/im);
  if (awardCategoriesMatch && awardCategoriesMatch[1]) noteParts.push(`Awards: ${awardCategoriesMatch[1].trim()}`);

  const deadlineFlexMatch = raw.match(/^[•\*\-\s]*Deadline\s*flexibility\s*[:=-]\s*(.+)$/im);
  if (deadlineFlexMatch && deadlineFlexMatch[1]) noteParts.push(`Deadline: ${deadlineFlexMatch[1].trim()}`);

  const logoMatch = raw.match(/^[•\*\-\s]*(?:References\s*or\s*logo|Logo)\s*[:=-]\s*(.+)$/im);
  if (logoMatch && logoMatch[1]) noteParts.push(`Logo: ${logoMatch[1].trim()}`);

  if (noteParts.length > 0) {
    result.notes = noteParts.join(' | ');
  }

  // 1. Quantity Extraction (Fallback for unstructured text)
  if (!result.required_quantity) {
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
  }

  // 2. Event Name & Event Type (Fallback)
  if (!result.event_name) {
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
  }

  // 3. Dates (Event Date / Delivery Date Fallback)
  if (!result.event_date) {
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
  }

  if (!result.delivery_date) {
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
  }

  // 4. Trophy Type & Size (Fallback)
  if (!result.trophy_type) {
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
  }

  if (!result.trophy_size) {
    const sizeMatch = raw.match(/(\d{1,2}(?:\.\d)?)\s*(?:inch|inches|in|\"|cm)\b/i);
    if (sizeMatch && sizeMatch[1]) {
      result.trophy_size = `${sizeMatch[1]} Inch`;
      points += 10;
    }
  }

  // 5. Budget (Fallback)
  if (!result.budget) {
    const budgetMatch = raw.match(/(?:budget\s*(?:around|is|of|approx)?|rate|price|cost)?\s*[:=-]?\s*(?:₹|rs\.?|inr)\s*([0-9,]+(?:\s*(?:per|each|\/|-)?\s*(?:trophy|piece|pc|item))?)/i);
    if (budgetMatch && budgetMatch[1]) {
      result.budget = `₹${budgetMatch[1].trim()}`;
      const numVal = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(numVal) && numVal > 0) result.value = numVal;
      points += 15;
    }
  }

  // 6. Organization / School / Company Name (Fallback)
  if (!result.organization) {
    const orgMatch = raw.match(/(?:for|from|our|at)\s+([A-Z][A-Za-z0-9\s&'\.]+(?:school|college|academy|university|pvt\s+ltd|limited|corp|institute|club|trust|foundation|sports\s+club|society|association))\b/i);
    if (orgMatch && orgMatch[1]) {
      result.organization = orgMatch[1].trim();
      result.customer_type = /school|college|academy|university|institute/i.test(orgMatch[1]) ? 'School / College' : 'Corporate';
      points += 15;
    }
  }

  // 7. Location (Fallback)
  if (!result.location) {
    const cityMatch = raw.match(/(?:in|at|location|city|delivery\s+to|branch)?\s*[:=-]?\s*\b(Chennai|Bangalore|Bengaluru|Mumbai|Delhi|Hyderabad|Coimbatore|Kolkata|Pune|Ahmedabad|Jaipur|Madurai|Trichy|Salem|Kochi|Trivandrum|Calicut|Goa|Noida|Gurgaon)\b/i);
    if (cityMatch && cityMatch[1]) {
      result.location = cityMatch[1].trim();
      points += 10;
    }
  }

  // 8. Urgency
  if (/(?:urgent|emergency|asap|within\s+[12]\s+days|by\s+tomorrow|today|immediate)/i.test(lower)) {
    result.urgency = 'high';
  } else if (/(?:this\s+week|next\s+week|soon|within\s+5\s+days)/i.test(lower)) {
    result.urgency = 'medium';
  } else if (result.required_quantity) {
    result.urgency = 'low';
  }

  // 9. Customer Name Extraction (Fallback)
  if (!result.customer_name) {
    const nameMatch = raw.match(/(?:my\s+name\s+is|i\s+am|this\s+is)\s+([A-Z][a-zA-Z\s]{2,30})\b/i);
    if (nameMatch && nameMatch[1]) {
      const extractedStr = nameMatch[1].trim();
      if (!/^(looking|interested|enquiring|want|need|planning|from|sports)/i.test(extractedStr)) {
        const words = extractedStr.split(' ');
        result.customer_name = words.slice(0, 3).join(' ');
        points += 10;
      }
    }
  }

  result.confidence = Math.min(100, Math.max(10, points));
  return result;
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getApiKey } from '../services/ai';
import type {
  Lead,
  FITSQualificationData,
  SalesQualityAudit,
  PROSPERBreakdown,
  LostLeadIntelligence,
} from '../types';

export interface StagePlaybook {
  stageId: string;
  stageName: string;
  phaseName: string;
  objective: string;
  primaryOwner: string;
  isAutomated: boolean;
  questions: {
    english: string;
    tanglish: string;
    purpose: string;
  }[];
  pitchTechniques: string[];
  objections: {
    objection: string;
    handlingScript: string;
    tanglishScript?: string;
  }[];
  nextActions: string[];
  checklist: string[];
}

/**
 * 1. LEAD INTENT CLASSIFICATION ENGINE
 * Evaluates inbound enquiry signals and scores intent from 0 to 100 (HIGH, MEDIUM, LOW)
 */
export function classifyLeadIntent(params: {
  text: string;
  quantity?: string | number;
  budget?: string | number;
  eventName?: string;
  eventDate?: string;
  deliveryDate?: string;
  company?: string;
  isRepeatCustomer?: boolean;
  hasMediaOrLogo?: boolean;
}): { tier: 'HIGH' | 'MEDIUM' | 'LOW'; score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const text = (params.text || '').toLowerCase();

  // 1. Quantity Metric (0 - 30 pts)
  const qty = typeof params.quantity === 'number'
    ? params.quantity
    : parseInt(String(params.quantity || '').replace(/\D/g, ''), 10) || 0;

  if (qty >= 100) {
    score += 30;
    reasons.push(`Bulk order detected (${qty} units: +30 pts)`);
  } else if (qty >= 25) {
    score += 25;
    reasons.push(`Medium-large batch (${qty} units: +25 pts)`);
  } else if (qty >= 10) {
    score += 18;
    reasons.push(`Standard order volume (${qty} units: +18 pts)`);
  } else if (qty >= 2) {
    score += 10;
    reasons.push(`Small quantity (${qty} units: +10 pts)`);
  } else if (qty === 1) {
    score += 2;
    reasons.push('Single piece inquiry (+2 pts)');
  }

  // 2. Timeline Proximity (0 - 25 pts)
  const targetDate = params.eventDate || params.deliveryDate;
  if (targetDate) {
    const parsed = new Date(targetDate).getTime();
    if (!isNaN(parsed)) {
      const daysUntil = (parsed - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntil >= 0 && daysUntil <= 7) {
        score += 25;
        reasons.push(`Critical deadline (${Math.ceil(daysUntil)} days remaining: +25 pts)`);
      } else if (daysUntil > 7 && daysUntil <= 15) {
        score += 20;
        reasons.push(`Upcoming event (${Math.ceil(daysUntil)} days away: +20 pts)`);
      } else if (daysUntil > 15 && daysUntil <= 35) {
        score += 12;
        reasons.push(`Planned future event (${Math.ceil(daysUntil)} days: +12 pts)`);
      } else if (daysUntil > 35) {
        score += 5;
        reasons.push('Flexible future timeline (+5 pts)');
      }
    }
  } else if (/urgent|asap|tomorrow|this week|2 days|3 days|emergency/i.test(text)) {
    score += 20;
    reasons.push('Explicit urgent timeline mentioned in chat (+20 pts)');
  }

  // 3. Customer Credibility & Entity (0 - 25 pts)
  if (params.isRepeatCustomer) {
    score += 25;
    reasons.push('Verified repeat customer (+25 pts)');
  } else if (params.company && params.company.trim().length > 2) {
    score += 20;
    reasons.push(`Corporate / Educational institution identified (${params.company}: +20 pts)`);
  } else if (/(college|school|university|pvt ltd|private limited|associat|club|trust|foundation|solutions|technologies)/i.test(text)) {
    score += 15;
    reasons.push('Institutional keyword detected (+15 pts)');
  } else {
    score += 5;
  }

  // 4. Content Engagement & Artwork (0 - 20 pts)
  if (params.hasMediaOrLogo || /logo|artwork|cdr|pdf|png|vector|ai file/i.test(text)) {
    score += 20;
    reasons.push('Logo / artwork file ready (+20 pts)');
  } else if (/quote|quotation|price|rate|model|catalog|catalogue|sample/i.test(text)) {
    score += 15;
    reasons.push('Direct quotation / catalog request (+15 pts)');
  } else if (/hi|hello|vanakkam/i.test(text) && text.length < 15) {
    score += 5;
    reasons.push('Minimal greeting (+5 pts)');
  }

  // Budget mentions bonus
  const budgetVal = typeof params.budget === 'number'
    ? params.budget
    : parseInt(String(params.budget || '').replace(/\D/g, ''), 10) || 0;
  if (budgetVal >= 10000) {
    score = Math.min(100, score + 10);
    reasons.push(`Budget indicated (₹${budgetVal.toLocaleString('en-IN')})`);
  }

  const normalizedScore = Math.min(100, Math.max(0, score));
  let tier: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (normalizedScore >= 65) {
    tier = 'HIGH';
  } else if (normalizedScore >= 35) {
    tier = 'MEDIUM';
  }

  return { tier, score: normalizedScore, reasons };
}

/**
 * 2. FITS QUALIFICATION EVALUATOR (15 Marks)
 * Evaluates Fit (3), Intent (4), Timeline (4), and Scope/Spend (4)
 */
export function evaluateFitsQualification(fits?: FITSQualificationData): {
  score: number;
  fitScore: number;
  intentScore: number;
  timelineScore: number;
  scopeScore: number;
  insights: string[];
} {
  if (!fits) {
    return {
      score: 0,
      fitScore: 0,
      intentScore: 0,
      timelineScore: 0,
      scopeScore: 0,
      insights: ['FITS qualification has not been initiated for this lead.'],
    };
  }

  let fitScore = 0;
  let intentScore = 0;
  let timelineScore = 0;
  let scopeScore = 0;
  const insights: string[] = [];

  // Fit (3 Marks)
  if (fits.fit_status === 'fit') {
    fitScore = 3;
    insights.push('Product requirements cleanly match EcoTrophy capabilities (3/3).');
  } else if (fits.fit_status === 'partial') {
    fitScore = 2;
    insights.push('Partial product fit - custom materials or non-standard specs needed (2/3).');
  } else {
    fitScore = 0;
    insights.push('Outside current manufacturing parameters (0/3).');
  }

  // Intent (4 Marks)
  if (fits.intent_level === 'high') {
    intentScore = 4;
    insights.push('High commercial intent with verified decision-maker / event sponsor (4/4).');
  } else if (fits.intent_level === 'medium') {
    intentScore = 2.5;
    insights.push('Moderate intent; needs consultative nurturing (2.5/4).');
  } else {
    intentScore = 1;
    insights.push('Low intent / price scouting (1/4).');
  }

  // Timeline (4 Marks)
  if (fits.timeline_date) {
    timelineScore = 4;
    insights.push(`Event date locked: ${fits.timeline_date} (4/4).`);
  } else if (fits.urgency_status) {
    timelineScore = 2.5;
    insights.push('Urgency bracket identified but specific event date unverified (2.5/4).');
  } else {
    insights.push('Event date and delivery timeline not yet documented (0/4).');
  }

  // Scope / Spend (4 Marks)
  if (fits.scope_quantity && fits.scope_quantity > 0 && fits.scope_budget_limit) {
    scopeScore = 4;
    insights.push(`Exact scope quantified: ${fits.scope_quantity} units with budget constraint (4/4).`);
  } else if (fits.scope_quantity && fits.scope_quantity > 0) {
    scopeScore = 3;
    insights.push(`Quantity confirmed (${fits.scope_quantity} pcs); budget limit open (3/4).`);
  } else if (fits.scope_budget_limit) {
    scopeScore = 2;
    insights.push('Budget stated but piece quantity unconfirmed (2/4).');
  } else {
    insights.push('Quantity and budget remain unverified (0/4).');
  }

  const total = Math.min(15, fitScore + intentScore + timelineScore + scopeScore);
  return {
    score: total,
    fitScore,
    intentScore,
    timelineScore,
    scopeScore,
    insights,
  };
}

/**
 * 3. PROSPER SALES CONVERSATION EVALUATION ENGINE (40 Marks)
 * Evaluates rep conversations across EcoTrophy's exact 7-step PROSPER framework:
 * P – Pitch (5M)
 * R – Rapport (5M)
 * O – Open Questions (6M)
 * S – Story (5M)
 * P – Proposal (7M)
 * E – Eliminate Objections (6M)
 * R – Reserve & Close (6M)
 * Sum = 40 Marks
 */
export function evaluateProsperSkills(chatHistory: string, repNotes = ''): PROSPERBreakdown {
  const text = (chatHistory + ' ' + repNotes).toLowerCase();
  const tips: string[] = [];

  // Step 1: P – Pitch (5 Marks) - Value hook: sustainable wood/crystal, in-house laser craft, direct factory speed
  let pitch = 1.5; // Baseline
  if (/(sustainable|teakwood|solid wood|optical crystal|virgin acrylic|in-house manufacturing|in-house laser|direct manufacturer|factory rate|zero middleman)/i.test(text)) {
    pitch += 2.5;
  }
  if (/(laser cut|laser engrav|handcrafted|uv print|premium finish|custom design)/i.test(text)) {
    pitch += 1.0;
  }
  pitch = Math.min(5, Math.max(0, pitch));

  // Step 2: R – Rapport (5 Marks) - Personal connection, language mirroring, event congratulation
  let rapport = 2.0;
  if (/(vanakkam|congratulations|congrats|proud moment|milestone|honour|delighted to assist|happy to help|warm welcome|glad to connect)/i.test(text)) {
    rapport += 2.0;
  }
  if (/(sir|ma'am|certainly|sure thing|thank you|welcome|all the best)/i.test(text)) {
    rapport += 1.0;
  }
  rapport = Math.min(5, Math.max(0, rapport));

  // Step 3: O – Open Questions (6 Marks) - Diagnostic questions on ceremony format, audience, and past pain points
  let open_questions = 1.5;
  if (/(what kind of|what event|what occasion|tell me about|how are you planning|who will present|who will receive|chief guest|dignitaries)/i.test(text)) {
    open_questions += 2.5;
  }
  if (/(past experience|previous vendor|any difficulty|what size|what height|theme of the event|ceremony ambiance)/i.test(text)) {
    open_questions += 2.0;
  }
  open_questions = Math.min(6, Math.max(0, open_questions));

  // Step 4: S – Story (5 Marks) - Social proof, case studies, stage presentation photos of previous orders
  let story = 0.5;
  if (/(last month for|similar to what we made|case study|testimonial|stage photo|on stage|srm|college sports|corporate event|here is how it looked|portfolio|photo of finished)/i.test(text)) {
    story += 3.5;
  } else if (/(earlier work|sample photo|previous batch|recent dispatch)/i.test(text)) {
    story += 2.0;
  }
  story = Math.min(5, Math.max(0, story));

  // Step 5: P – Proposal (7 Marks) - Good-Better-Best tiers, 2D photorealistic proof, clear specs & transparent quote
  let proposal = 2.0;
  if (/(quotation|quote pdf|proforma|invoice|rate breakdown|gst 18%|tax total|grand total)/i.test(text)) {
    proposal += 2.5;
  }
  if (/(2d mockup|digital proof|photorealistic|exact scale|option 1|option 2|good-better-best|teak base|crystal plaque)/i.test(text)) {
    proposal += 2.5;
  }
  proposal = Math.min(7, Math.max(0, proposal));

  // Step 6: E – Eliminate Objections (6 Marks) - Reframing price vs cheap plastic, sample concerns, advance policies
  let eliminate_objections = 2.0;
  if (/(difference is|compared to|market plastic|hollow plastic|quality difference|lifetime keepsake|solid timber|advance policy|first-off sample|express laser)/i.test(text)) {
    eliminate_objections += 3.0;
  } else if (/expensive|discount|bazaar|cheaper|kammi|kuraiya/i.test(text)) {
    eliminate_objections = 2.0;
  } else {
    eliminate_objections = 3.5; // If no objection was raised, maintain neutral good standing
  }
  eliminate_objections = Math.min(6, Math.max(0, eliminate_objections));

  // Step 7: R – Reserve & Close (6 Marks) - Time-bound production slot cutoff, 50% advance token
  let reserve_close = 1.5;
  if (/(reserve machine|reserve slot|production slot|cutoff|by tomorrow 12|lock slot|reserve your batch|50% advance|upi qr|advance token)/i.test(text)) {
    reserve_close += 3.5;
  }
  if (/(delivery date guarantee|on-time delivery|shall we confirm|lock the order)/i.test(text)) {
    reserve_close += 1.0;
  }
  reserve_close = Math.min(6, Math.max(0, reserve_close));

  // Status mapping
  const step_status = {
    pitch: (pitch >= 4.0 ? 'completed' : pitch >= 2.0 ? 'weak' : 'missing') as 'completed' | 'weak' | 'missing',
    rapport: (rapport >= 4.0 ? 'completed' : rapport >= 2.0 ? 'weak' : 'missing') as 'completed' | 'weak' | 'missing',
    open_questions: (open_questions >= 4.5 ? 'completed' : open_questions >= 2.5 ? 'weak' : 'missing') as 'completed' | 'weak' | 'missing',
    story: (story >= 4.0 ? 'completed' : story >= 2.0 ? 'weak' : 'missing') as 'completed' | 'weak' | 'missing',
    proposal: (proposal >= 5.5 ? 'completed' : proposal >= 3.0 ? 'weak' : 'missing') as 'completed' | 'weak' | 'missing',
    eliminate_objections: (eliminate_objections >= 4.5 ? 'completed' : eliminate_objections >= 2.5 ? 'weak' : 'missing') as 'completed' | 'weak' | 'missing',
    reserve_close: (reserve_close >= 4.5 ? 'completed' : reserve_close >= 2.5 ? 'weak' : 'missing') as 'completed' | 'weak' | 'missing',
  };

  // Determine Next Best Action & Coaching Tips
  let next_best_action = 'Follow up with customer on quotation review.';
  let suggested_whatsapp_draft = 'Vanakkam! Quotation and design proof check panneengala sir? Everything clear-a irukka?';

  if (step_status.pitch === 'missing' || step_status.pitch === 'weak') {
    tips.push('P – Pitch: Introduce EcoTrophy’s in-house sustainable timber & crystal craftsmanship before discussing raw prices.');
    next_best_action = 'Execute Step 1 (Pitch): Send EcoTrophy direct manufacturer craft introduction.';
    suggested_whatsapp_draft = 'Vanakkam from EcoTrophy! Namma direct manufacturers of sustainable wooden & optical crystal awards. Complete in-house laser production, so best quality and direct factory pricing guaranteed!';
  } else if (step_status.open_questions === 'missing' || step_status.open_questions === 'weak') {
    tips.push('O – Open Questions: Ask open-ended questions about the ceremony theme, audience profile, and recipient emotional impact.');
    next_best_action = 'Execute Step 3 (Open Questions): Ask about event theme, dignitaries, and previous vendor pain points.';
    suggested_whatsapp_draft = 'To help our design studio curate the most fitting options: What is the core theme of your ceremony, who are the dignitaries presenting the awards, and what has been your biggest frustration with award vendors in the past?';
  } else if (step_status.story === 'missing' || step_status.story === 'weak') {
    tips.push('S – Story: Share social proof! Send a photo or video of a similar trophy completed for a past corporate or educational event.');
    next_best_action = 'Execute Step 4 (Story): Share a 10-second stage video or photo of a past award ceremony build.';
    suggested_whatsapp_draft = 'Sir, just sharing a quick photo of 120 custom teakwood awards we finished for a major university last week. Notice the golden laser depth! Here is how they looked on stage:';
  } else if (step_status.proposal === 'missing' || step_status.proposal === 'weak') {
    tips.push('P – Proposal: Present Good-Better-Best tiers with a 2D digital mockup proof instead of plain text prices.');
    next_best_action = 'Execute Step 5 (Proposal): Deliver 2D photorealistic mockup with tiered EcoBill quote.';
    suggested_whatsapp_draft = 'Unga requirement-kaga namma design team 2 options mockup ready pannirukkom: Option 1 Solid Teakwood Base, Option 2 Premium 10mm Crystal Award. Digital mockup and transparent quotation PDF keezha attach pannirukken sir.';
  } else if (step_status.eliminate_objections === 'weak') {
    tips.push('E – Eliminate Objections: Reframe price concerns with material longevity and brand prestige; do not cut prices immediately!');
    next_best_action = 'Execute Step 6 (Eliminate Objections): Reframe value vs. hollow bazaar plastic.';
    suggested_whatsapp_draft = 'Market-la kidaikkura cheaper trophies hollow plastic-la spray paint pannirupanga. Namma kitta 100% solid timber with lifetime warranty. Just ₹50 difference-kaga recipients manasula unga brand prestige romba perusa reach aagum!';
  } else if (step_status.reserve_close === 'missing' || step_status.reserve_close === 'weak') {
    tips.push('R – Reserve & Close: Create time-bound cutoff urgency tied to their event date and request the 50% advance token.');
    next_best_action = 'Execute Step 7 (Reserve & Close): Create production slot reservation cutoff and request 50% advance.';
    suggested_whatsapp_draft = 'Function delivery safe-a reach aaga, naalaikku 12 PM-kulla workshop laser batch lock pannanum sir. 50% advance token transfer panna direct UPI QR keezha share panren. Slot reserve pannidlama?';
  }

  return {
    pitch,
    rapport,
    open_questions,
    story,
    proposal,
    eliminate_objections,
    reserve_close,
    step_status,
    next_best_action,
    suggested_whatsapp_draft,
    coaching_tips: tips,

    // Backward compatibility aliases
    prepare_probe: open_questions,
    rapport_receptivity: rapport,
    outline_options: pitch,
    solve_objections: eliminate_objections,
    propose_next_steps: reserve_close,
    execute_terms: proposal,
    reengage_reinforce: story,
  };
}

/**
 * 4. 100-MARK SALES QUALITY AUDIT EVALUATOR
 * Synthesizes SLA (10), Follow-up (15), Design/Appt (10), FITS (15), PROSPER (40), and Call/WhatsApp (10)
 */
export function computeSalesQualityAudit(lead: Lead, chatTranscript = ''): SalesQualityAudit {
  // 1. SLA Score (10 Marks)
  let sla_score = 7; // Baseline
  if (lead.created_at) {
    const createdMs = lead.created_at.toMillis ? lead.created_at.toMillis() : new Date(lead.created_at as any).getTime();
    const stageEnteredMs = lead.stageEnteredAt?.toMillis ? lead.stageEnteredAt.toMillis() : createdMs;
    const diffMins = (stageEnteredMs - createdMs) / (1000 * 60);

    if (diffMins <= 15) sla_score = 10;
    else if (diffMins <= 30) sla_score = 8;
    else if (diffMins <= 60) sla_score = 6;
    else if (diffMins <= 180) sla_score = 4;
    else sla_score = 2;
  }

  // 2. Follow-up Score (15 Marks)
  let followup_score = 0;
  if (lead.next_follow_up_date) followup_score += 5;
  const historyCount = lead.stage_history?.length || 0;
  if (historyCount >= 3) followup_score += 6;
  else if (historyCount >= 1) followup_score += 4;
  if (lead.notes_count && lead.notes_count > 0) followup_score += 4;
  followup_score = Math.min(15, followup_score);

  // 3. Appointment / Design Finalization (10 Marks)
  let appointment_design_score = 5;
  if (lead.design_person) appointment_design_score += 2;
  if (lead.trophy_size) appointment_design_score += 1.5;
  if (lead.status === 'design_stage' || lead.status === 'design_approval' || lead.status === 'quotation_sent' || lead.status === 'advance_payment' || lead.status === 'production') {
    appointment_design_score += 1.5;
  }
  appointment_design_score = Math.min(10, appointment_design_score);

  // 4. FITS Qualification Score (15 Marks)
  const fitsEval = evaluateFitsQualification(lead.fits_data);
  const fits_score = lead.fits_score ?? fitsEval.score;

  // 5. PROSPER Execution Score (40 Marks: 5 + 5 + 6 + 5 + 7 + 6 + 6 = 40)
  const prosperBreakdown = lead.prosper_breakdown || evaluateProsperSkills(chatTranscript, lead.reason || '');
  const prosper_score = Math.min(
    40,
    Math.round(
      (prosperBreakdown.pitch ?? 0) +
      (prosperBreakdown.rapport ?? 0) +
      (prosperBreakdown.open_questions ?? 0) +
      (prosperBreakdown.story ?? 0) +
      (prosperBreakdown.proposal ?? 0) +
      (prosperBreakdown.eliminate_objections ?? 0) +
      (prosperBreakdown.reserve_close ?? 0) ||
      ((prosperBreakdown.prepare_probe ?? 0) +
        (prosperBreakdown.rapport_receptivity ?? 0) +
        (prosperBreakdown.outline_options ?? 0) +
        (prosperBreakdown.solve_objections ?? 0) +
        (prosperBreakdown.propose_next_steps ?? 0) +
        (prosperBreakdown.execute_terms ?? 0) +
        (prosperBreakdown.reengage_reinforce ?? 0))
    )
  );

  // 6. Call & WhatsApp Quality Score (10 Marks)
  let call_whatsapp_quality_score = 7;
  if (lead.phone && lead.phone.length >= 10) call_whatsapp_quality_score += 1.5;
  if (lead.email) call_whatsapp_quality_score += 1.5;
  call_whatsapp_quality_score = Math.min(10, call_whatsapp_quality_score);

  const total_score = Math.round(
    sla_score + followup_score + appointment_design_score + fits_score + prosper_score + call_whatsapp_quality_score
  );

  return {
    total_score: Math.min(100, Math.max(0, total_score)),
    sla_score,
    followup_score,
    appointment_design_score,
    fits_score,
    prosper_score,
    call_whatsapp_quality_score,
    last_audited_at: new Date(),
    audited_by: 'ai_engine',
    audit_notes: fitsEval.insights.slice(0, 3),
  };
}

/**
 * 5. CONTEXTUAL SALES PLAYBOOK
 * Real-time guide for each stage in the EcoTrophy sales pipeline
 */
export const STAGE_PLAYBOOKS: Record<string, StagePlaybook> = {
  new_enquiry: {
    stageId: 'new_enquiry',
    stageName: 'New Enquiry',
    phaseName: '1. Discovery & Intent',
    objective: 'Acknowledge lead within 15 minutes, establish brand prestige, and qualify initial need.',
    primaryOwner: 'AI + Sales Rep',
    isAutomated: true,
    questions: [
      {
        english: 'Thank you for contacting EcoTrophy! May I know what special event or occasion these awards are for?',
        tanglish: 'Vanakkam! Indha trophies / awards enna function-kaga plan panreenga? Sports Day-a, Annual Day-a, or Corporate Event-a?',
        purpose: 'Discover event category and importance',
      },
      {
        english: 'Approximately how many trophies or medals will you be presenting?',
        tanglish: 'Total-a approximate-a evlo quantity / pieces theva padum?',
        purpose: 'Establish order scale and batch size',
      },
    ],
    pitchTechniques: [
      'Introduce EcoTrophy as South India’s premier manufacturer of custom sustainable wooden and optical crystal awards.',
      'Emphasize our complete in-house production: direct manufacturer rates with zero middleman delays.',
    ],
    objections: [
      {
        objection: 'Just send me your price list first.',
        handlingScript: 'We craft over 500+ customized models from ₹150 to ₹3,500. To save your time, once I know your approximate quantity and event type, I will share the top 5 curated best-sellers right away!',
        tanglishScript: 'Kandippa sir, namma kitta 500+ designs irukku. Unga event-ku suit aagura top 5 selected models-oda pricing udane anuparen!',
      },
    ],
    nextActions: [
      'Dispatch EcoTrophy Digital Catalog link via WhatsApp',
      'Set Intent Tier (HIGH/MEDIUM/LOW)',
      'Assign sales rep within 15 minutes',
    ],
    checklist: [
      'Customer phone number verified',
      'Event category recorded',
      'Catalog sent on WhatsApp',
    ],
  },

  requirement_collection: {
    stageId: 'requirement_collection',
    stageName: 'FITS Qualification',
    phaseName: '1. Discovery & Intent',
    objective: 'Lock in Fit, Intent, Timeline, and Scope/Budget parameters.',
    primaryOwner: 'Sales Rep',
    isAutomated: false,
    questions: [
      {
        english: 'What is your event date, and by which date do you need these delivered to your location?',
        tanglish: 'Function enna date? Ungalukku hand-la eppo reach aaganum?',
        purpose: 'Establish production and transit lead-time buffer',
      },
      {
        english: 'Do you have a preferred height (e.g., 8", 10", 12") or material like Teakwood, Acrylic, or Crystal?',
        tanglish: 'Enna material prefer panreenga: Wooden, Acrylic, Crystal or Metal medals?',
        purpose: 'Verify product fit with manufacturing capabilities',
      },
      {
        english: 'Do you have an approximate budget limit per piece or overall for the order?',
        tanglish: 'Oru piece-ku approximate budget plan irukka sir?',
        purpose: 'Scope out pricing tier',
      },
    ],
    pitchTechniques: [
      'Recommend sustainable natural timber bases for earthy prestige, or beveled optical crystal for VIP felicitations.',
      'Explain that in-house laser cutting allows custom silhouette shapes (e.g., school mascot, company logo outline).',
    ],
    objections: [
      {
        objection: 'Local shops deliver in 2 days.',
        handlingScript: 'Local shops use pre-molded plastic with stickered metal plates. EcoTrophy delivers custom laser-engraved seasoned timber and crystal built to last a lifetime. For urgent events, we also have our 48-Hour Express Laser line!',
      },
    ],
    nextActions: [
      'Complete FITS scorecard',
      'Collect client logo vector / PNG',
      'Assign design ticket',
    ],
    checklist: [
      'Fit status confirmed',
      'Event date stamped',
      'Delivery city / pincode recorded',
      'Quantity and budget established',
    ],
  },

  design_stage: {
    stageId: 'design_stage',
    stageName: 'Requirement & Design Finalization',
    phaseName: '2. Design & Proofing',
    objective: 'Finalize artwork, logo engraving, dimensions, and secure written client proof approval.',
    primaryOwner: 'Sales Rep + Design Team',
    isAutomated: false,
    questions: [
      {
        english: 'Could you share your high-res logo and the exact inscription text for each award category?',
        tanglish: 'Unga school / company logo clear-a PNG or PDF format-la anuppa mudiyuma?',
        purpose: 'Collect design vector assets',
      },
      {
        english: 'Would you prefer gold-infill engraving, color UV printing, or a dual-tone metallic plate?',
        tanglish: 'Gold lettering venuma, illai color print text venuma sir?',
        purpose: 'Lock finish specification',
      },
    ],
    pitchTechniques: [
      'Provide a photorealistic 2D scale mockup with exact measurements so there are no surprises on event day.',
      'Offer free digital proof revisions until the management committee is 100% satisfied.',
    ],
    objections: [
      {
        objection: 'Can you produce and ship a physical sample first before we place the order?',
        handlingScript: 'Because every trophy requires custom laser programming and wood calibration, physical prototypes incur setup costs. Instead, we provide an exact 1:1 scale digital proof. For orders over 50 pieces, once advance is confirmed, we can produce 1 first-off sample and share HD video before batch run!',
      },
    ],
    nextActions: [
      'Share digital proof on WhatsApp',
      'Obtain written "Design Approved" sign-off',
      'Attach approved design to lead record',
    ],
    checklist: [
      'Logo vector uploaded',
      'Recipient category text proofread',
      'Client approval received in writing',
    ],
  },

  quotation_sent: {
    stageId: 'quotation_sent',
    stageName: 'Quotation',
    phaseName: '2. Design & Quotation',
    objective: 'Issue official transparent quotation with payment terms and Good-Better-Best options.',
    primaryOwner: 'Sales Rep (AI-Prefilled)',
    isAutomated: true,
    questions: [
      {
        english: 'Did you get a chance to review the quotation PDF and design proof?',
        tanglish: 'Quotation and mockup check panneengala sir? Everything clear-a irukka?',
        purpose: 'Verify receipt and open discussion',
      },
    ],
    pitchTechniques: [
      'Present Good-Better-Best tiers (e.g. Eco-Wood Plaque vs. Acrylic Teak Base vs. Crystal Prestige).',
      'Highlight inclusive pricing: packaging, shockproof foam boxes, and direct transit insurance.',
    ],
    objections: [
      {
        objection: 'Your quotation is higher than competitor X.',
        handlingScript: 'Competitor quotes often exclude 18% GST, box packaging, or transit insurance. More importantly, they use lightweight hollow plastic. EcoTrophy provides 100% solid timber, precision laser etching, and our On-Time Event Guarantee.',
      },
    ],
    nextActions: [
      'Send quotation PDF with dynamic UPI QR link',
      'Schedule 24-hr follow-up reminder',
    ],
    checklist: [
      'GST calculated correctly (18%)',
      'Quantity discount tier verified',
      'Quotation delivered via WhatsApp',
    ],
  },

  follow_up: {
    stageId: 'follow_up',
    stageName: 'Follow-up & Closing',
    phaseName: '2. Design & Quotation',
    objective: 'Overcome hesitation, emphasize production cutoff deadlines, and close advance payment.',
    primaryOwner: 'Sales Rep + Automated Drip',
    isAutomated: true,
    questions: [
      {
        english: 'Our production team is finalizing the dispatch batch for next week. Shall we reserve your slot today to guarantee delivery by [EventDate]?',
        tanglish: 'Next week delivery schedule finalize panrom sir. Unga order-oda production slot reserve pannidlama?',
        purpose: 'Create natural delivery deadline urgency',
      },
    ],
    pitchTechniques: [
      'Use real-time factory photos of ongoing production to build trust.',
      'Remind client of transit buffers: "To deliver safely by Friday, laser cutting must begin by Tuesday."',
    ],
    objections: [
      {
        objection: 'We need committee approval; call next week.',
        handlingScript: 'Understood sir. If we wait until next week, express courier charges may apply. How about I hold your production slot provisionally for 24 hours so you keep the best rate?',
      },
    ],
    nextActions: [
      'Execute Day 1 / Day 3 follow-up touchpoint',
      'Send advance payment QR link',
    ],
    checklist: [
      'Follow-up note logged',
      'Future follow-up date always set',
      'Production cutoff date communicated',
    ],
  },

  advance_payment: {
    stageId: 'advance_payment',
    stageName: 'Payment & Confirmation',
    phaseName: '3. Production & Fulfillment',
    objective: 'Collect 50% advance token and reconcile transaction in EcoBill.',
    primaryOwner: 'Automated Reconciliation + Accounts',
    isAutomated: true,
    questions: [
      {
        english: 'Kindly share the transaction screenshot or UTR number so our accounts team can generate your official payment receipt.',
        tanglish: 'Payment panna screenshot or UTR number anupunga sir, udane official receipt send panrom.',
        purpose: 'Capture payment reference',
      },
    ],
    pitchTechniques: [
      'Instant payment receipt and Job Card dispatched within 10 minutes of reconciliation.',
    ],
    objections: [
      {
        objection: 'Our institution only pays 100% after delivery against bill.',
        handlingScript: 'For registered educational and corporate institutions, we accept an official signed Purchase Order (PO) with institutional stamp in lieu of personal advance!',
      },
    ],
    nextActions: [
      'Auto-match bank / UPI credit to Quotation / PI',
      'Dispatch payment receipt voucher',
      'Promote lead to Production job queue',
    ],
    checklist: [
      'Advance amount verified in bank',
      'Receipt issued',
      'Order specs locked',
    ],
  },

  production: {
    stageId: 'production',
    stageName: 'Order in Production',
    phaseName: '3. Production',
    objective: 'Fulfill manufacturing on schedule with highest quality craftsmanship.',
    primaryOwner: 'Factory Floor Manager',
    isAutomated: true,
    questions: [],
    pitchTechniques: [
      'Send "Work in Progress" laser video clip to customer WhatsApp to delight them.',
    ],
    objections: [],
    nextActions: [
      'Manufacture trophies as per job card',
      'Execute Quality Check',
    ],
    checklist: [
      'Material cut as per specs',
      'Laser engraving verified against approved mockup',
      'Packaging completed in bubble & foam boxes',
    ],
  },

  lost_cancelled: {
    stageId: 'lost_cancelled',
    stageName: 'Lost / Cancelled Intelligence',
    phaseName: '5. Closing & Intelligence',
    objective: 'Capture mandatory lost reason, identify sales mistakes, and schedule cyclical win-back.',
    primaryOwner: 'Sales Rep + Manager Audit',
    isAutomated: true,
    questions: [
      {
        english: 'Thank you for considering EcoTrophy. May I ask what influenced your final decision so we can improve next time?',
        tanglish: 'Feedback-kaga kekrom sir, enna reason-kaga order drop aachu nu therinjukkalama?',
        purpose: 'Capture honest customer exit feedback',
      },
    ],
    pitchTechniques: [
      'Leave a positive, professional brand impression: "We hope to craft awards for your next milestone ceremony!"',
    ],
    objections: [],
    nextActions: [
      'Record primary lost reason and competitor details',
      'Set automated Day 330 annual win-back trigger',
    ],
    checklist: [
      'Lost reason taxonomy selected',
      'Salesperson mistake audited',
      'Annual win-back scheduled',
    ],
  },
};

/**
 * Checks if a set of questions are the old hardcoded generic placeholder templates
 */
export function isGenericPlaceholderQuestions(
  questions?: Array<{ english?: string; tanglish?: string; purpose?: string }>
): boolean {
  if (!questions || questions.length === 0) return true;
  return questions.some((q) => {
    const en = (q.english || '').toLowerCase();
    return (
      en.includes('could you share your high-res logo and the exact inscription text') ||
      en.includes('would you prefer gold-infill engraving, color uv printing') ||
      (en.includes('for laser crafted awards within') && en.includes('sustainable teakwood laser-infill engraving, color uv printing'))
    );
  });
}

/**
 * Generates context-aware, semantic probing questions by deeply analyzing
 * all customer signals: customer chat messages, requirement text, notes,
 * event name, company, deal value, and pipeline stage.
 * Ensures the system never serves generic repetitive templates.
 */
export function generateSemanticFallbackQuestions(
  lead: Lead,
  customContextText?: string,
  messages: any[] = []
): Array<{ english: string; tanglish: string; purpose: string }> {
  const clientName = lead.name && !/^\+?\d[\d\s-]+$/.test(lead.name) ? lead.name.trim().split(' ')[0] : '';
  const greetingEn = clientName ? `Hi ${clientName}!` : 'Hello!';
  const greetingTa = clientName ? `Vanakkam ${clientName} sir!` : 'Vanakkam sir!';

  // Extract all incoming customer chat messages
  const inboundMsgs = Array.isArray(messages)
    ? messages
      .filter((m) => m && (m.direction === 'inbound' || m.sender === 'customer' || m.sender_type === 'customer' || !m.fromMe))
      .map((m) => String(m.text || m.content || m.message || '').trim())
      .filter(Boolean)
    : [];

  const chatCustomerText = inboundMsgs.join(' ');
  const lastCustomerMessage = inboundMsgs[inboundMsgs.length - 1] || lead.last_message || '';

  const allText = [
    lead.requirement || '',
    lead.notes || '',
    lead.last_message || '',
    lead.event_name || '',
    (lead as any).category || '',
    lead.qualification_reason || '',
    lead.company || '',
    lead.organization || '',
    chatCustomerText,
    lastCustomerMessage,
    customContextText || '',
  ].join(' ').toLowerCase();

  const questions: Array<{ english: string; tanglish: string; purpose: string }> = [];
  const qty = Number(lead.required_quantity) || 0;
  const dealValue = Number(lead.value) || (lead.budget ? Number(String(lead.budget).replace(/[^\d]/g, '')) : 0);
  const eventTitle = lead.event_name || (allText.includes('tournament') ? 'Sports Tournament' : '');

  // 1. DESIGN CORRECTION / PROOF / REVISIONS (e.g. Yokesh, Chakravarthi, proof, correction, spellings, revision)
  if (/(correction|revision|alter|proof|yokesh|chakravarthi|artwork|draft|sample proof|layout|design in process|spelling)/i.test(allText)) {
    questions.push({
      purpose: 'Verify updated design proof & text spellings',
      english: `${greetingEn} Our design studio has updated the digital proof with your latest corrections. Could you please review the text alignment, recipient spellings, and logo placement so we can lock final approval?`,
      tanglish: `${greetingTa} Neenga sonna corrections vechu updated design proof ready pannitom. Text spellings, logo placement and layout check panni final approval kudukka mudiyuma sir? Laser cutting start pannidalaam.`
    });
    questions.push({
      purpose: 'Confirm finalized recipient titles & award categories',
      english: 'Are all recipient names and category headings (Winner, Runner, VIP Mementos) 100% final on this proof, or do you have any last-minute additions?',
      tanglish: 'Proof-la irukira category names and recipient titles ellam 100% final-a irukka sir, illai vera edhavadhu names add panna venduma sir?'
    });
    if (!lead.delivery_date) {
      questions.push({
        purpose: 'Lock production dispatch cutoff date',
        english: 'Once you sign off on this proof today, what is your exact required delivery date so our dispatch team can schedule zero-rush courier dispatch?',
        tanglish: 'Indha proof approval aanavudane, delivery endha date-kulla ungalukku kedaikkanum sir? Express dispatch schedule panna helpful-a irukkum.'
      });
    }
    return questions;
  }

  // 2. SPORTS TOURNAMENTS & CHAMPIONSHIPS (e.g. Afroze: Sports Tournament, Cricket, Football, Badminton, Tournament, Medals)
  if (/(sport|tournament|cricket|football|badminton|chess|match|championship|runner|winner|mvp|man of the match|best batsman|medals|athletic|kabaddi|volleyball|marathon)/i.test(allText)) {
    questions.push({
      purpose: `Structure category tiers for ${eventTitle || 'Sports Tournament'}`,
      english: `${greetingEn} For your ${eventTitle || 'Sports Tournament'}${qty ? ` (${qty} pieces)` : ''}, do you need tiered trophy sizes for Champions, Runners-up, and individual special awards (e.g. Best Player, MVP), or uniform mementos across all categories?`,
      tanglish: `${greetingTa} Unga ${eventTitle || 'Sports Tournament'}-ku${qty ? ` (${qty} pcs)` : ''}, Winner, Runner & Best Player-ku tiered size trophies thevaiya sir, illai ellarukkum uniform size mementos plan panreengala?`
    });
    questions.push({
      purpose: 'Choose sport action 3D cutout vs solid timber shield plaque',
      english: 'Would you prefer dynamic sport action 3D laser cutouts (e.g. player in action silhouette), or classic seasoned Teakwood shield plaques with vibrant UV category printing?',
      tanglish: 'Sports action 3D silhouette laser cutout model nalla irukkuma sir, illai traditional Teakwood shield plaque with color UV print prefer panreengala?'
    });
    questions.push({
      purpose: 'Confirm participant medals & custom neck lanyards',
      english: 'Are you also planning matching embossed participant medals with custom branded ribbon lanyards for all participating players?',
      tanglish: 'Tournament participants-kaga matching embossed medals and custom branded ribbon lanyards-um add panna venduma sir?'
    });
    return questions;
  }

  // 3. LARGE BATCH CONFERENCES & CORPORATE MILESTONES (e.g. AICLT 2026: 650 pieces, ₹5,00,000 budget, conference, corporate, summit)
  if (qty >= 100 || dealValue >= 50000 || /(conference|summit|annual meet|aiclt|corporate|keynote|dignitary|speaker|delegates|symposium|star performer|excellence award)/i.test(allText)) {
    const orgLabel = lead.company || lead.organization || lead.event_name || 'annual conference';
    questions.push({
      purpose: `VIP Dignitary vs Delegate mockup tiers for ${qty ? `${qty} pieces` : orgLabel}`,
      english: `${greetingEn} For the ${orgLabel} order${qty ? ` of ${qty} pieces` : ''}, shall our design team prepare a tiered prototype mockup featuring premium VIP Dignitary awards (10-12") alongside delegate mementos (7-8")?`,
      tanglish: `${greetingTa} Unga ${orgLabel}${qty ? ` (${qty} pcs)` : ''}-kaga, VIP Dignitary awards and Delegate mementos rendu model-um include panni 1:1 scale digital proof ready pannalama sir?`
    });
    if (dealValue > 0) {
      questions.push({
        purpose: `Optimize luxury finish within ₹${dealValue.toLocaleString('en-IN')}`,
        english: `To give you the highest luxury finish within your ₹${dealValue.toLocaleString('en-IN')} budget with factory-direct volume tiering, would you prefer our optical crystal series or sustainable seasoned Teakwood with gold inlay?`,
        tanglish: `Unga ₹${dealValue.toLocaleString('en-IN')} budget-kulla factory direct volume tier rate-la luxury optical crystal nalla irukkuma sir, illai Teakwood gold laser finish venuma?`
      });
    } else {
      questions.push({
        purpose: 'Volume batch tiering & direct factory pricing',
        english: 'Because we manufacture directly in our factory, unlocking the full batch volume gives you a significantly lower per-unit cost. Shall we prepare a tiered quotation?',
        tanglish: 'Namma direct factory manufacturing-la batch quantity slab unlock panna unit rate nalla reduce panni thara mudiyum sir. Tiered quote share pannalama?'
      });
    }
    questions.push({
      purpose: 'Schedule phased batch dispatch & transit buffer',
      english: `What is your target venue delivery date so our dispatch manager can coordinate early courier batch transit with zero-rush buffer?`,
      tanglish: 'Event date-ku munadi batch-by-batch delivery endha date-kulla reach aaganum sir? Priority production slot reserve panna useful-a irukkum.'
    });
    return questions;
  }

  // 4. SCHOOL / COLLEGE / CONVOCATION / ACADEMIC CEREMONIES
  if (/(school|college|university|convocation|graduation|annual day|alumni|students|institution|merit|faculty)/i.test(allText)) {
    questions.push({
      purpose: 'Academic category split (Student merit vs Chief Guest VIPs)',
      english: `${greetingEn} For your academic ceremony, what is the split between student merit awards and heavy VIP mementos for chief guests and management dignitaries?`,
      tanglish: `${greetingTa} Unga institution function-la student merit awards evvalavu pieces, and chief guest VIP mementos evvalavu thevai padum sir?`
    });
    questions.push({
      purpose: 'Confirm institution crest & motto vector',
      english: 'Could you share your official institution crest or seal in vector format (PDF/PNG) so our design studio can integrate your emblem and motto into the layout proof?',
      tanglish: 'School / College emblem or seal clear-a share panna mudiyuma sir? Motto and year add panni digital proof anuppidalaam.'
    });
    return questions;
  }

  // 5. PRICING / BUDGET / QUOTATION OBJECTIONS
  if (/(price|rate|cost|budget|expensive|discount|cheaper|per piece|gst|quotation|quote)/i.test(allText)) {
    questions.push({
      purpose: 'Explore value-engineering & finish alternatives',
      english: `${greetingEn} To keep your order comfortably aligned with your target per-piece budget while maintaining a luxury look, would you prefer our sustainable seasoned Teakwood finish or our high-clarity optical crystal series?`,
      tanglish: `${greetingTa} Unga budget-kulla best luxury look vara mari, Teakwood laser engraved memento parkalama, illai optical crystal series choose panreengala sir?`
    });
    questions.push({
      purpose: 'Volume tiering & factory-direct batch savings',
      english: 'Because we manufacture directly in our factory, unlocking the next volume tier gives you a significantly lower per-unit cost. Would you like to review tiered batch pricing?',
      tanglish: 'Namma direct factory manufacturing pannuvadhala, batch quantity increase panna unit rate nalla reduce panni thara mudiyum sir. Tiered pricing check pannalama?'
    });
    questions.push({
      purpose: 'Confirm protective packaging & 18% GST billing',
      english: 'Would you like the quotation to include individual protective foam gift boxes and official 18% GST invoicing for institutional reimbursement?',
      tanglish: 'Quotation-la individual gift box packaging and official 18% GST bill include pannidlama sir?'
    });
    return questions;
  }

  // 6. URGENT TIMELINE / FAST DISPATCH
  if (/(urgent|asap|fast|emergency|tomorrow|2 days|3 days|short notice|rush|deadline)/i.test(allText)) {
    questions.push({
      purpose: 'Lock priority laser production slot for urgent delivery',
      english: `${greetingEn} Since your event timeline is critical, could you confirm your exact delivery city/pincode so our laser engraving team can lock an express production slot?`,
      tanglish: `${greetingTa} Event romba kitta irukuradhala, unga exact delivery address and pincode confirm panna express laser production slot reserve pannidalam sir.`
    });
    questions.push({
      purpose: 'Fast-track design sign-off for immediate manufacturing',
      english: 'Can we quickly review the proof preview over WhatsApp in the next 30 minutes so we can lock approval and start laser cutting immediately today?',
      tanglish: 'Quick-a WhatsApp-la proof preview paarthu approve panniteengana, udane laser cutting start panni dispatch guarantee panna mudiyum sir.'
    });
    return questions;
  }

  // 7. CUSTOM BLUEPRINT / SHAPE / CUTOUT / 3D TROPHY
  if (/(blueprint|custom|customized|shape|cutout|acrylic|wood cutout|trophy size)/i.test(allText)) {
    questions.push({
      purpose: 'Confirm custom cutout dimensions & thickness',
      english: `${greetingEn} For your bespoke silhouette trophy, what overall height (e.g. 7", 8", 10", or 12") and base thickness best suits your stage award presentation?`,
      tanglish: `${greetingTa} Custom shape trophy-ku evvalavu height (7, 8, 10 or 12 inch) and base thickness irundha stage presentation-ku grandeur-a irukkum sir?`
    });
    questions.push({
      purpose: 'Confirm 3D laser engraving vs UV color finish',
      english: 'Would you prefer vibrant full-color UV printed graphics on the front or deep 3D laser engraving with gold metallic infill?',
      tanglish: 'Front-la direct color UV print venuma sir, illai deep laser engraving with gold metallic infill prefer panreengala?'
    });
    return questions;
  }

  // 8. CATALOG / MODEL SHORTLIST
  if (/(catalog|catalogue|models|samples|photos|brochure|options|designs)/i.test(allText)) {
    questions.push({
      purpose: 'Curate shortlisted models based on ceremony style',
      english: `${greetingEn} To send the most relevant curated catalog, are you looking for contemporary minimalist wooden trophies, traditional prestige mementos, or heavy crystal awards?`,
      tanglish: `${greetingTa} Unga event-ku correct catalog anuppa, wooden contemporary trophies venuma, traditional mementos venuma, illai crystal awards prefer panreengala sir?`
    });
    questions.push({
      purpose: 'Determine per-piece budget preference',
      english: 'What approximate price range per piece (e.g., ₹250-₹500, ₹500-₹1,200, or ₹1,500+ luxury mementos) matches your category allocation?',
      tanglish: 'Oru trophy-ku approximate-a enna budget range (₹250-₹500, ₹500-₹1200, or premium ₹1500+) plan panreenga sir?'
    });
    return questions;
  }

  // 9. ADVANCE PAYMENT & ORDER LOCK
  if (/(paid|gpay|phonepe|advance|transfer|screenshot|utr|payment done|bill)/i.test(allText)) {
    questions.push({
      purpose: 'Capture payment reference for job card creation',
      english: `${greetingEn} Kindly share the payment screenshot or UTR reference number so our accounts team can issue your official receipt and release the factory job card.`,
      tanglish: `${greetingTa} Payment panna screenshot or UTR number anuppunga sir, udane official bill receipt and factory job card generate pannidalaam.`
    });
    return questions;
  }

  // 10. GENERAL / STAGE & VOLUME DISCOVERY (Intelligent fallback referencing customer specifics)
  if (!qty) {
    questions.push({
      purpose: 'Establish order quantity tier',
      english: `${greetingEn} Approximately how many total pieces or trophies are you planning for this event across all categories?`,
      tanglish: `${greetingTa} Indha event-kaga total-a evvalavu pieces thevai padum sir (Winners, VIP mementos, Souvenirs)?`
    });
  } else {
    questions.push({
      purpose: `Verify category tiers for ${qty} pieces`,
      english: `${greetingEn} For your ${qty} pcs batch, do you need uniform mementos or tiered sizes (e.g. 1st, 2nd, 3rd place & VIP dignitary awards)?`,
      tanglish: `${greetingTa} ${qty} pieces-la ellam same height-a irukkanuma, illai 1st, 2nd, 3rd size variations thevaiya sir?`
    });
  }

  if (!lead.delivery_date && !lead.event_date) {
    questions.push({
      purpose: 'Confirm target delivery deadline buffer',
      english: `What is your event date, and by what date do you need delivery${lead.location ? ` in ${lead.location}` : ''} so our production team can schedule zero-rush dispatch?`,
      tanglish: `Event eppo sir? ${lead.location ? `${lead.location}-la ` : ''}Delivery eppo kedaikkanum? Production schedule panna helpful-a irukkum.`
    });
  } else {
    questions.push({
      purpose: 'Lock material finish & aesthetic style',
      english: 'Would you prefer sustainable Teakwood laser-infill engraving, color UV printing, or a dual-tone metallic plate?',
      tanglish: 'Gold laser infill engraving venuma, illai color print UV finish venuma sir?'
    });
  }

  return questions;
}

/**
 * AI-POWERED CONTEXTUAL PROBING QUESTION GENERATOR
 * Calls Gemini Generative AI to deeply analyze the customer's actual conversation history,
 * requirement notes, design team updates, and deal stage to craft 2-3 laser-targeted questions.
 * Smoothly falls back to semantic analysis if offline or rate-limited.
 */
export async function generateContextualProbingQuestions(
  lead: Lead,
  messages: any[] = []
): Promise<Array<{ english: string; tanglish: string; purpose: string }>> {
  // 1. Compile recent chat snippets
  const chatSnippets: string[] = [];
  if (Array.isArray(messages) && messages.length > 0) {
    const recent = messages.slice(-15);
    recent.forEach((m) => {
      const text = m.text || m.content || m.message || '';
      if (!text || typeof text !== 'string') return;
      const clean = text.trim();
      if (!clean) return;
      const isCustomer = m.direction === 'inbound' || m.sender === 'customer' || m.sender_type === 'customer';
      chatSnippets.push(`${isCustomer ? 'Customer' : 'Sales Rep'}: ${clean}`);
    });
  }
  const chatHistoryText = chatSnippets.join('\n');
  const allContext = [
    lead.requirement ? `Requirement: ${lead.requirement}` : '',
    lead.notes ? `Notes: ${lead.notes}` : '',
    lead.last_message ? `Last Message: ${lead.last_message}` : '',
    lead.qualification_reason ? `Audit: ${lead.qualification_reason}` : '',
    chatHistoryText ? `Chat History:\n${chatHistoryText}` : ''
  ].filter(Boolean).join('\n');

  const apiKey = getApiKey();
  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const stageName = lead.status ? lead.status.replace(/_/g, ' ') : 'new enquiry';
      const prompt = `You are the Lead Sales & Production Strategist at EcoTrophy (leading manufacturer of premium sustainable awards, optical crystal trophies, and wooden mementos).
Analyze this customer's ACTUAL conversation history, their stated requirements, design notes, and current deal stage.
Then generate 2 to 3 sharp, highly context-aware PROBING QUESTIONS that the sales rep should ask the customer right now to advance the order.

CRITICAL RULES:
1. DEEP CHAT ANALYSIS: Focus on what the customer is talking about RIGHT NOW in their chat messages or requirement notes.
   - For example: If they mention "Design Correction", "Yokesh", "Chakravarthi", or proof revisions, ask specifically about verifying the revised proof changes (logo alignment, text spelling, sizing) so it can go to laser cutting! DO NOT ask for their logo vector or budget if they already provided it or are past that!
   - If they are discussing pricing or budget, ask about volume slabs or alternative material finishes (e.g. Teakwood vs Acrylic vs Crystal) to fit their target unit price.
   - If they sent a sample photo or dimension, ask about base weight, personalized individual naming, or font preference.
   - If they just sent a greeting or basic enquiry, ask about event date, estimated quantity, and ceremony theme.
2. NEVER REPEAT OR BE GENERIC: Do NOT return the same generic template for every customer. Each question must directly reference the specific details, names, materials, or actions mentioned in their chat/requirement.
3. LANGUAGE: Provide each question in two forms:
   - "english": Professional, polished, courteous English.
   - "tanglish": Natural conversational Tamil in English script (Tanglish) as spoken by professional sales reps in Tamil Nadu (e.g., "Vanakkam sir, Yokesh design correction proof check panniteengala? Inscription text and logo placement ok-va sir?").
4. RETURN FORMAT: Strictly return a JSON array of objects:
[
  {
    "purpose": "Brief phrase describing why this question is being asked",
    "english": "🇬🇧 Question in English",
    "tanglish": "🇮🇳 Question in Tanglish"
  }
]

=== CUSTOMER PROFILE ===
Name: ${lead.name || 'Not provided'}
Company/Org: ${lead.company || lead.organization || 'Not provided'}
Stage: ${stageName}
Quantity: ${lead.required_quantity || 'Not specified'}
Budget: ${lead.budget || (lead.value ? '₹' + lead.value : 'Not specified')}
Delivery Date: ${lead.delivery_date || 'Not specified'}
Location: ${lead.location || 'Not specified'}

=== REQUIREMENT & NOTES ===
Requirement: ${lead.requirement || 'None'}
Notes: ${lead.notes || 'None'}
Last Message: ${lead.last_message || 'None'}

=== RECENT CHAT MESSAGES ===
${chatHistoryText || 'No direct chat messages recorded yet; rely on Requirement & Notes.'}`;

      const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2
            }
          });
          const result = await model.generateContent(prompt);
          const responseText = result.response.text();
          const parsed = JSON.parse(responseText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((item) => ({
              purpose: String(item.purpose || 'Contextual probing'),
              english: String(item.english || ''),
              tanglish: String(item.tanglish || '')
            })).filter(q => q.english.length > 5);
          }
        } catch (err: any) {
          const msg = err?.message || '';
          if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
            continue;
          }
          break;
        }
      }
    } catch (e) {
      console.warn('[salesIntelligenceEngine] Gemini probing question error, falling back to semantic analysis', e);
    }
  }

  // Fallback to intelligent semantic analysis based on actual customer chat / requirement keywords
  return generateSemanticFallbackQuestions(lead, allContext, messages);
}

/**
 * Helper to fetch the playbook for any stage (supports aliases and per-lead dynamic tailoring).
 * When a Lead is provided, the probing questions, pitch techniques, and objection scripts
 * dynamically adapt to the customer's actual chat, requirements, and deal context.
 */
export function getStagePlaybook(stageId: string, lead?: Lead, customQuestions?: Array<{ english: string; tanglish: string; purpose: string }>): StagePlaybook {
  let basePlaybook: StagePlaybook;

  if (STAGE_PLAYBOOKS[stageId]) {
    basePlaybook = STAGE_PLAYBOOKS[stageId];
  } else if (stageId === 'fits_qualification') {
    basePlaybook = STAGE_PLAYBOOKS['requirement_collection'];
  } else if (stageId === 'requirement_design_finalization') {
    basePlaybook = STAGE_PLAYBOOKS['design_stage'];
  } else if (stageId === 'quotation') {
    basePlaybook = STAGE_PLAYBOOKS['quotation_sent'];
  } else if (stageId === 'payment' || stageId === 'order_confirmation') {
    basePlaybook = STAGE_PLAYBOOKS['advance_payment'];
  } else if (stageId === 'won_lost') {
    basePlaybook = STAGE_PLAYBOOKS['lost_cancelled'];
  } else {
    basePlaybook = STAGE_PLAYBOOKS['new_enquiry'];
  }

  if (!lead) {
    return basePlaybook;
  }

  // 1. If explicit custom questions provided or cached on lead (and not the old generic placeholders), use them directly
  if (customQuestions && customQuestions.length > 0) {
    return {
      ...basePlaybook,
      questions: customQuestions
    };
  }

  if (
    lead.contextual_probing_questions &&
    lead.contextual_probing_questions.length > 0 &&
    !isGenericPlaceholderQuestions(lead.contextual_probing_questions)
  ) {
    return {
      ...basePlaybook,
      questions: lead.contextual_probing_questions
    };
  }

  // 2. Otherwise generate semantic questions analyzing lead's chat, requirement, and notes
  const semanticQuestions = generateSemanticFallbackQuestions(lead);

  return {
    ...basePlaybook,
    questions: semanticQuestions.length > 0 ? semanticQuestions : basePlaybook.questions
  };
}


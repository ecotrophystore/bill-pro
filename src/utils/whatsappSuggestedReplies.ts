import { STANDARD_CRM_STAGES, type PipelineStage } from '../types';

export interface SmartSuggestedReply {
  id: string;
  category: 'requirement' | 'design' | 'quote' | 'payment' | 'deadline' | 'production' | 'dispatch' | 'knowledge';
  categoryLabel: string;
  title: string;
  text: string;
  isStageRecommended?: boolean;
}

export interface ClientContextForReplies {
  clientName?: string;
  companyName?: string;
  requirement?: string;
  quantity?: string | number;
  deliveryDate?: string;
  eventDate?: string;
  currentStage?: string;
  budget?: string | number;
}

/**
 * Format relative deadline string and status
 */
export function calculateDeadlineInfo(deliveryDateStr?: string, eventDateStr?: string): {
  effectiveDate: string | null;
  daysRemaining: number | null;
  status: 'overdue' | 'today' | 'urgent' | 'approaching' | 'normal' | 'unset';
  label: string;
  badgeClass: string;
} {
  const targetDateStr = deliveryDateStr || eventDateStr;
  if (!targetDateStr) {
    return {
      effectiveDate: null,
      daysRemaining: null,
      status: 'unset',
      label: 'No deadline set',
      badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    };
  }

  const parsed = new Date(targetDateStr);
  if (isNaN(parsed.getTime())) {
    return {
      effectiveDate: targetDateStr,
      daysRemaining: null,
      status: 'unset',
      label: targetDateStr,
      badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    };
  }

  // Calculate day difference (start of today vs start of target)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const formattedDate = target.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: target.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  });

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      effectiveDate: targetDateStr,
      daysRemaining: diffDays,
      status: 'overdue',
      label: `Overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} (${formattedDate})`,
      badgeClass: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
    };
  }

  if (diffDays === 0) {
    return {
      effectiveDate: targetDateStr,
      daysRemaining: 0,
      status: 'today',
      label: `Due Today (${formattedDate})`,
      badgeClass: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40 animate-pulse font-bold'
    };
  }

  if (diffDays <= 2) {
    return {
      effectiveDate: targetDateStr,
      daysRemaining: diffDays,
      status: 'urgent',
      label: `Due in ${diffDays} ${diffDays === 1 ? 'day' : 'days'} (${formattedDate})`,
      badgeClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold'
    };
  }

  if (diffDays <= 7) {
    return {
      effectiveDate: targetDateStr,
      daysRemaining: diffDays,
      status: 'approaching',
      label: `Due in ${diffDays} days (${formattedDate})`,
      badgeClass: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30'
    };
  }

  return {
    effectiveDate: targetDateStr,
    daysRemaining: diffDays,
    status: 'normal',
    label: `${diffDays} days left (${formattedDate})`,
    badgeClass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
  };
}

/**
 * Generate client-specific suggested replies grounded in EcoTrophy product knowledge
 */
export function generateClientSpecificReplies(ctx: ClientContextForReplies): SmartSuggestedReply[] {
  const name = ctx.clientName?.trim() ? ctx.clientName.trim().split(' ')[0] : 'there';
  const company = ctx.companyName?.trim() || '';
  const companyPhrase = company ? ` for ${company}` : '';
  const product = ctx.requirement?.trim() || 'custom awards';
  const qtyPhrase = ctx.quantity ? `${ctx.quantity} pcs ` : '';
  const deadlineInfo = calculateDeadlineInfo(ctx.deliveryDate, ctx.eventDate);
  const deadlinePhrase = deadlineInfo.effectiveDate
    ? ` by ${new Date(deadlineInfo.effectiveDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    : '';

  const stage = ctx.currentStage || 'new_enquiry';

  const isStageNew = stage === 'new_enquiry' || stage === 'requirement_collection';
  const isStageDesign = stage === 'requirement_confirmed' || stage === 'design_stage' || stage === 'design_approval';
  const isStageQuote = stage === 'quotation_sent' || stage === 'follow_up';
  const isStageAdvance = stage === 'advance_payment';
  const isStageProduction = stage === 'production' || stage === 'quality_check';
  const isStageDispatch = stage === 'ready_for_dispatch' || stage === 'dispatch' || stage === 'delivered' || stage === 'full_payment';

  const replies: SmartSuggestedReply[] = [
    // 1. Requirement & Discovery
    {
      id: 'req_welcome',
      category: 'requirement',
      categoryLabel: 'Requirement Discovery',
      title: 'Welcome & Specs Gathering',
      text: `Hi ${name}, thank you for contacting EcoTrophy! We'd love to help craft memorable awards${companyPhrase}. Could you please share the required quantity, preferred materials (wood, crystal, or acrylic), and your event date?`,
      isStageRecommended: isStageNew
    },
    {
      id: 'req_catalog',
      category: 'requirement',
      categoryLabel: 'Requirement Discovery',
      title: 'EcoTrophy Catalog & Materials',
      text: `Hi ${name}, at EcoTrophy we specialize in 100% sustainable seasoned teakwood awards, optical K9 crystal trophies, and premium laser-etched plaques. I can share our curated catalog tailored for your event!`,
      isStageRecommended: isStageNew
    },

    // 2. Design & Mockups
    {
      id: 'design_preview',
      category: 'design',
      categoryLabel: 'Design & Mockup',
      title: 'Mockup Preview Approval',
      text: `Hi ${name}, our design studio has prepared the 2D digital mockup for your ${qtyPhrase}${product}${companyPhrase}. Please review the layout and text engraving so we can get your confirmation!`,
      isStageRecommended: isStageDesign
    },
    {
      id: 'design_logo_vector',
      category: 'design',
      categoryLabel: 'Design & Mockup',
      title: 'Request High-Res Logo/CDR',
      text: `Hi ${name}, to ensure razor-sharp laser engraving and vibrant UV color printing, could you please send your logo in CDR, AI, or vector PDF format?`,
      isStageRecommended: isStageDesign
    },

    // 3. Quotation & Pricing
    {
      id: 'quote_followup',
      category: 'quote',
      categoryLabel: 'Quotation Follow-Up',
      title: 'Quotation Follow-Up & Specs',
      text: `Hi ${name}, following up on the quotation shared for ${qtyPhrase}${product}. The quote includes precision laser engraving, UV print, and individual protective gift packaging. Do you have any questions or require any adjustments?`,
      isStageRecommended: isStageQuote
    },
    {
      id: 'quote_factory_direct',
      category: 'quote',
      categoryLabel: 'Quotation Follow-Up',
      title: 'Factory-Direct Best Pricing',
      text: `Hi ${name}, as direct manufacturers, our quotation offers direct factory pricing with zero middleman markup. We assure premium craftsmanship and 100% on-time delivery!`,
      isStageRecommended: isStageQuote
    },

    // 4. Project Deadline Commitment & Slot Locking
    {
      id: 'deadline_urgency',
      category: 'deadline',
      categoryLabel: 'Project Deadline',
      title: 'Workshop Cutoff & Deadline Urgency',
      text: deadlinePhrase
        ? `Hi ${name}, to ensure your ${qtyPhrase}${product} is dispatched safely${deadlinePhrase}, our workshop cutoff for initiating cutting and print is today. May we lock in your order?`
        : `Hi ${name}, what is your exact event date? We offer express 48-hour workshop turnaround so your awards reach comfortably on time.`,
      isStageRecommended: deadlineInfo.status === 'urgent' || deadlineInfo.status === 'approaching' || isStageQuote
    },

    // 5. Advance Payment & Order Confirmation
    {
      id: 'advance_token_request',
      category: 'payment',
      categoryLabel: 'Advance Payment',
      title: '50% Advance Token Request',
      text: `Hi ${name}, to confirm your workshop slot and start manufacturing ${companyPhrase || 'your order'}, kindly transfer the 50% advance token. Please share the payment screenshot here once done!`,
      isStageRecommended: isStageAdvance
    },
    {
      id: 'advance_upi_details',
      category: 'payment',
      categoryLabel: 'Advance Payment',
      title: 'Share Bank / UPI Details',
      text: `Hi ${name}, you can transfer the 50% advance via UPI / NEFT. As soon as you share the confirmation, our workshop supervisor will immediately queue your trophies for production!`,
      isStageRecommended: isStageAdvance
    },

    // 6. Production & Quality Check
    {
      id: 'prod_update',
      category: 'production',
      categoryLabel: 'Workshop Update',
      title: 'In-Production Workshop Update',
      text: `Hi ${name}, great news! Your ${qtyPhrase}${product} order is now running on our laser engraving and UV printing line. Everything is progressing smoothly on schedule${deadlinePhrase}.`,
      isStageRecommended: isStageProduction
    },

    // 7. Ready for Dispatch & Balance
    {
      id: 'dispatch_ready',
      category: 'dispatch',
      categoryLabel: 'Ready for Dispatch',
      title: 'Trophies Ready & Balance Request',
      text: `Hi ${name}, your trophies have passed quality inspection and are securely packed! Kindly clear the remaining balance so our team can hand over the package to express courier and share the live tracking number.`,
      isStageRecommended: isStageDispatch
    },

    // 8. EcoTrophy Knowledge Base
    {
      id: 'kb_sustainable_wood',
      category: 'knowledge',
      categoryLabel: 'Knowledge Base',
      title: 'Sustainable Wood Craft Guarantee',
      text: `At EcoTrophy, we use sustainably harvested, seasoned natural hardwood. Each trophy is hand-finished with non-toxic coats to preserve the natural grain for a lifetime of prestige.`
    },
    {
      id: 'kb_optical_crystal',
      category: 'knowledge',
      categoryLabel: 'Knowledge Base',
      title: 'K9 Optical Crystal Specifications',
      text: `We use Grade-A optical crystal (K9) known for diamond-cut transparency, premium weight, and flawless refractive beveling. Engravings are deep laser-etched with zero fading.`
    }
  ];

  // Sort so stage-recommended replies appear first
  return replies.sort((a, b) => {
    if (a.isStageRecommended && !b.isStageRecommended) return -1;
    if (!a.isStageRecommended && b.isStageRecommended) return 1;
    return 0;
  });
}


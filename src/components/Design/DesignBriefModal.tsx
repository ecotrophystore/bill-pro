import React, { useState } from 'react';
import {
  Palette,
  X,
  Building,
  Calendar,
  Clock,
  Award,
  Layers,
  Shapes as ShapesIcon,
  Sparkles,
  Download,
  ExternalLink,
  Copy,
  Check,
  User,
  Phone,
  Mail,
  IndianRupee,
  Package,
  Image as ImageIcon,
  Tag,
  Printer,
  Eye,
  Factory,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Lead } from '../../types';
import toast from 'react-hot-toast';
import { printDesignTeamChecklist } from '../../utils/printDesignProductionSheet';

interface DesignBriefModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onOpenProductionSpecs?: () => void;
}

export function DesignBriefModal({ isOpen, lead, onClose, onOpenProductionSpecs }: DesignBriefModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);

  if (!isOpen || !lead) return null;

  const handleCopy = (text: string, key: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handlePrint = () => {
    if (!lead) return;
    printDesignTeamChecklist(lead);
  };

  // Parse color chips from brand_colors (e.g. "#003366, #FFCC00 (Gold), Red")
  const brandColorsRaw = lead.brand_colors || '';
  const parsedColors = brandColorsRaw
    .split(/[,;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  // Reference designs array
  const referenceImages: string[] = Array.isArray(lead.reference_designs)
    ? lead.reference_designs
    : [];

  // Deadlines helpers using brand-aligned tones
  const getDeadlineBadge = (dateStr?: string) => {
    if (!dateStr) return { label: 'Not Set', color: 'bg-surface border border-shadow-darker/30 text-secondary' };
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return { label: dateStr, color: 'bg-surface border border-shadow-darker/30 text-primary-dark font-medium' };

    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue by ${Math.abs(diffDays)}d`, color: 'bg-tertiary/15 text-tertiary border border-tertiary/30 font-bold' };
    }
    if (diffDays === 0) {
      return { label: 'Due Today!', color: 'bg-tertiary/20 text-tertiary border border-tertiary/40 font-bold animate-pulse' };
    }
    if (diffDays <= 2) {
      return { label: `In ${diffDays} days (Urgent)`, color: 'bg-tertiary/15 text-tertiary border border-tertiary/30 font-semibold' };
    }
    return { label: `In ${diffDays} days`, color: 'bg-primary/10 text-primary-dark border border-primary/20 font-medium' };
  };

  const designDeadlineBadge = getDeadlineBadge(lead.design_deadline);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:static">
      <div className="bg-surface border border-shadow-darker/30 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-neo-raised overflow-hidden print:max-w-none print:max-h-none print:border-none print:shadow-none print:rounded-none">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-shadow-darker/20 bg-surface print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-primary/10 text-primary-dark border border-primary/20">
              <Palette size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-primary-dark text-base leading-tight">
                  Design Brief &amp; Creative Specs
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary-dark border border-primary/20">
                  REF-{lead.id.slice(0, 7).toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-secondary">
                Client: <strong className="text-primary-dark">{lead.company || lead.name}</strong> • Assigned Designer: {lead.design_person || 'Unassigned'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenProductionSpecs && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProductionSpecs();
                }}
                className="neo-btn text-xs px-3 py-1.5 font-bold text-primary-dark hover:text-primary border border-primary/20 bg-primary/10 hover:bg-primary/20 flex items-center gap-1.5 transition-colors"
                title="Enter or update 9 Production specifications for this order"
              >
                <Factory size={13} className="text-primary" />
                <span className="hidden sm:inline">Production Specs</span>
              </button>
            )}
            <button
              onClick={handlePrint}
              type="button"
              className="neo-btn text-xs px-3 py-1.5 font-bold text-secondary hover:text-primary-dark flex items-center gap-1.5 transition-colors"
              title="Print clean Design Team Checklist with Sales details"
            >
              <Printer size={14} className="text-primary" />
              <span className="hidden sm:inline">Print Design Checklist</span>
            </button>
            <Link
              to={`/leads/${lead.id}`}
              className="neo-btn-primary text-xs px-3.5 py-1.5 font-bold flex items-center gap-1.5 bg-primary text-white hover:bg-primary-dark transition-colors"
            >
              <Eye size={14} />
              <span className="hidden sm:inline">Open Lead 360°</span>
            </Link>
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-secondary hover:text-primary-dark hover:bg-surface-hover transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-primary-dark">

          {/* Header Banner: Deal Scope, Quantity & Value */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-surface border border-shadow-darker/30 shadow-neo-surface">
            <div>
              <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">
                Total Quantity
              </div>
              <div className="text-lg font-bold text-primary-dark flex items-center gap-1 mt-0.5">
                <Package size={16} className="text-primary" />
                {lead.required_quantity ? `${lead.required_quantity} pcs` : 'Not specified'}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">
                Budget / Value
              </div>
              <div className="text-lg font-bold text-primary-dark flex items-center gap-1 mt-0.5">
                <IndianRupee size={16} className="text-primary" />
                {lead.value ? `₹${lead.value.toLocaleString('en-IN')}` : lead.budget || 'Open / Custom'}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">
                Design Deadline
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Clock size={15} className="text-primary shrink-0" />
                <span className={`px-2 py-0.5 rounded text-xs ${designDeadlineBadge.color}`}>
                  {lead.design_deadline || designDeadlineBadge.label}
                </span>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">
                Event Date
              </div>
              <div className="text-sm font-semibold text-primary-dark flex items-center gap-1.5 mt-1">
                <Calendar size={15} className="text-primary" />
                {lead.event_date || 'No Date'}
              </div>
            </div>
          </div>

          {/* Section 1: Creative Specifications & Identity */}
          <div className="border border-shadow-darker/25 rounded-xl p-4 bg-surface shadow-neo-surface space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-darker/15 pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-primary" />
                <h4 className="text-xs font-bold uppercase tracking-wide text-primary-dark">
                  Creative &amp; Physical Specifications
                </h4>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* Product Size */}
              <div className="p-3 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1 flex items-center gap-1">
                  <ShapesIcon size={13} className="text-primary" /> Product Size / Dimensions
                </div>
                <div className="text-sm font-bold text-primary-dark">
                  {lead.trophy_size || 'To be proposed by designer'}
                </div>
              </div>

              {/* Shapes */}
              <div className="p-3 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1 flex items-center gap-1">
                  <ShapesIcon size={13} className="text-primary" /> Shape / Silhouette
                </div>
                <div className="text-sm font-bold text-primary-dark">
                  {lead.shapes || lead.trophy_type || 'Custom Cut / Designer Choice'}
                </div>
              </div>

              {/* Material */}
              <div className="p-3 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Layers size={13} className="text-primary" /> Material Required
                </div>
                <div className="text-sm font-bold text-primary-dark">
                  {lead.material || 'Acrylic / Wood / Metal hybrid'}
                </div>
              </div>

              {/* Design Theme */}
              <div className="p-3 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs sm:col-span-2">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Tag size={13} className="text-primary" /> Design Theme &amp; Occasion
                </div>
                <div className="text-sm font-semibold text-primary-dark">
                  {lead.theme || lead.event_name || 'Standard Trophy Theme'}
                </div>
              </div>

              {/* Models / Variants */}
              <div className="p-3 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Award size={13} className="text-primary" /> Models / Variants
                </div>
                <div className="text-sm font-semibold text-primary-dark">
                  {lead.model_variants || 'Single Standard Model'}
                </div>
              </div>
            </div>

            {/* Concept & Notes */}
            <div className="p-3.5 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-bold text-primary-dark uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-primary" /> Creative Concept &amp; Design Notes
                </div>
                {(lead.concept || lead.concept_notes || lead.design_notes) && (
                  <button
                    onClick={() =>
                      handleCopy(
                        lead.concept || lead.concept_notes || lead.design_notes || '',
                        'concept',
                        'Concept notes'
                      )
                    }
                    className="text-xs text-primary hover:text-primary-dark flex items-center gap-1 font-bold"
                  >
                    {copiedKey === 'concept' ? <Check size={12} /> : <Copy size={12} />}
                    <span>Copy</span>
                  </button>
                )}
              </div>
              <p className="text-sm text-primary-dark/90 whitespace-pre-wrap leading-relaxed">
                {lead.concept || lead.concept_notes || lead.design_notes || 'No specific concept text entered. Please refer to reference assets and theme above.'}
              </p>
            </div>

            {/* Brand Colors */}
            <div className="p-3.5 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs">
              <div className="text-xs font-bold text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Palette size={14} className="text-primary" /> Customer Brand Colors
              </div>
              {parsedColors.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {parsedColors.map((colorItem, idx) => {
                    const hexMatch = colorItem.match(/#([0-9A-Fa-f]{3,8})\b/);
                    const hexColor = hexMatch ? hexMatch[0] : null;

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-shadow-darker/30 shadow-neo-surface"
                      >
                        {hexColor ? (
                          <span
                            className="w-4 h-4 rounded-full border border-black/20 shadow-inner shrink-0"
                            style={{ backgroundColor: hexColor }}
                          />
                        ) : (
                          <Palette size={14} className="text-secondary shrink-0" />
                        )}
                        <span className="text-xs font-medium text-primary-dark">
                          {colorItem}
                        </span>
                        {hexColor && (
                          <button
                            onClick={() => handleCopy(hexColor, `color_${idx}`, 'Color hex')}
                            className="text-secondary hover:text-primary transition-colors ml-1"
                            title="Copy Hex"
                          >
                            {copiedKey === `color_${idx}` ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="text-xs text-secondary italic">No specific brand colors specified.</span>
              )}
            </div>
          </div>

          {/* Section 2: Visual Assets (Logo & Reference Designs) */}
          <div className="border border-shadow-darker/25 rounded-xl p-4 bg-surface shadow-neo-surface space-y-4">
            <div className="flex items-center gap-2 border-b border-shadow-darker/15 pb-2.5">
              <ImageIcon size={16} className="text-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wide text-primary-dark">
                Visual Assets &amp; Reference Designs
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Logo */}
              <div className="p-3.5 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                    Customer Logo
                  </div>
                  {lead.artwork_url ? (
                    <div className="relative group rounded-lg overflow-hidden border border-shadow-darker/20 bg-white p-2 flex items-center justify-center min-h-[140px] max-h-[180px]">
                      <img
                        src={lead.artwork_url}
                        alt="Customer Logo"
                        className="max-h-36 max-w-full object-contain cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => setActivePreviewImage(lead.artwork_url || null)}
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border-2 border-dashed border-shadow-darker/20 p-6 flex flex-col items-center justify-center text-center text-secondary text-xs">
                      <ImageIcon size={28} className="mb-1 opacity-50" />
                      <span>No logo uploaded yet</span>
                    </div>
                  )}
                </div>

                {lead.artwork_url && (
                  <div className="mt-3 flex items-center gap-2">
                    <a
                      href={lead.artwork_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold neo-btn text-primary-dark hover:text-primary flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Download size={13} /> Download Logo
                    </a>
                    <a
                      href={lead.artwork_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-xs neo-btn text-secondary hover:text-primary-dark"
                      title="Open full view"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                )}
              </div>

              {/* Reference Designs */}
              <div className="p-3.5 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-secondary uppercase tracking-wider">
                      Reference Designs / Inspirations ({referenceImages.length})
                    </span>
                  </div>

                  {referenceImages.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto">
                      {referenceImages.map((imgUrl, i) => (
                        <div
                          key={i}
                          className="relative group rounded-lg overflow-hidden border border-shadow-darker/20 bg-white h-24 flex items-center justify-center"
                        >
                          <img
                            src={imgUrl}
                            alt={`Reference ${i + 1}`}
                            className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setActivePreviewImage(imgUrl)}
                          />
                          <a
                            href={imgUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="absolute bottom-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Download"
                          >
                            <Download size={12} />
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border-2 border-dashed border-shadow-darker/20 p-6 flex flex-col items-center justify-center text-center text-secondary text-xs">
                      <ImageIcon size={28} className="mb-1 opacity-50" />
                      <span>No reference designs attached</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Deadlines & Milestones Schedule */}
          <div className="border border-shadow-darker/25 rounded-xl p-4 bg-surface shadow-neo-surface space-y-3">
            <div className="flex items-center gap-2 border-b border-shadow-darker/15 pb-2">
              <Clock size={16} className="text-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wide text-primary-dark">
                Critical Milestone Deadlines
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border border-shadow-darker/20 bg-surface shadow-2xs">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1">
                  1. Design Approval Deadline
                </div>
                <div className="text-sm font-bold text-primary-dark">
                  {lead.design_deadline || 'Open'}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-shadow-darker/20 bg-surface shadow-2xs">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1">
                  2. Production Completion Target
                </div>
                <div className="text-sm font-bold text-primary-dark">
                  {lead.production_deadline || 'Open'}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-shadow-darker/20 bg-surface shadow-2xs">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1">
                  3. Client Delivery Deadline
                </div>
                <div className="text-sm font-bold text-primary-dark">
                  {lead.delivery_date || 'Open'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Customer & Sales Point of Contact */}
          <div className="border border-shadow-darker/25 rounded-xl p-4 bg-surface shadow-neo-surface space-y-3">
            <div className="flex items-center gap-2 border-b border-shadow-darker/15 pb-2">
              <User size={16} className="text-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wide text-primary-dark">
                Point of Contact (For Clarifications)
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Customer Contact */}
              <div className="p-3 rounded-lg border border-shadow-darker/20 bg-surface shadow-2xs">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1">
                  Customer / Organization
                </div>
                <div className="text-sm font-bold text-primary-dark">
                  {lead.name} {lead.company ? `(${lead.company})` : ''}
                </div>
                <div className="mt-2 space-y-1 text-xs text-primary-dark">
                  {lead.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone size={13} className="text-primary" />
                      <a href={`tel:${lead.phone}`} className="hover:underline font-mono">
                        {lead.phone}
                      </a>
                    </div>
                  )}
                  {lead.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail size={13} className="text-primary" />
                      <a href={`mailto:${lead.email}`} className="hover:underline">
                        {lead.email}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Sales Rep Contact */}
              <div className="p-3 rounded-lg border border-shadow-darker/20 bg-surface shadow-2xs">
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider mb-1">
                  Internal Sales Representative
                </div>
                <div className="text-sm font-bold text-primary-dark">
                  {lead.sales_person || 'Sales Team'}
                </div>
                <p className="text-xs text-secondary mt-1">
                  Contact this sales executive if creative details, brand guidelines, or event dates need re-confirmation.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-shadow-darker/20 bg-surface flex items-center justify-between print:hidden">
          <div className="text-xs text-secondary">
            Tip: Upload and manage versioned mockup drafts inside the{' '}
            <Link to={`/leads/${lead.id}`} className="text-primary font-bold hover:underline">
              Lead 360° Artwork tab
            </Link>
            .
          </div>
          <button
            onClick={onClose}
            type="button"
            className="neo-btn px-4 py-2 text-xs font-bold text-secondary hover:text-primary-dark transition-colors"
          >
            Close
          </button>
        </div>

      </div>

      {/* Lightbox Image Preview Modal */}
      {activePreviewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs cursor-pointer"
          onClick={() => setActivePreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-transparent">
            <button
              onClick={() => setActivePreviewImage(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-primary"
            >
              <X size={24} />
            </button>
            <img
              src={activePreviewImage}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

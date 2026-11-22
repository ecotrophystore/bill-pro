import React, { useRef } from 'react';
import {
  Printer,
  X,
  Building,
  Calendar,
  Clock,
  Award,
  Layers,
  ExternalLink,
  Copy,
  Check,
  FileCode,
  Truck,
  User,
  Package,
  MapPin,
  Box,
  Plane,
  Bus,
} from 'lucide-react';
import type { Lead } from '../../types';
import toast from 'react-hot-toast';
import { printProductionTeamChecklist } from '../../utils/printDesignProductionSheet';

interface ProductionJobCardModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onOpenSpecsModal?: () => void;
}

export function ProductionJobCardModal({
  isOpen,
  lead,
  onClose,
  onOpenSpecsModal,
}: ProductionJobCardModalProps) {
  const [copiedCitation, setCopiedCitation] = React.useState(false);
  const printableAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !lead) return null;

  const jobCardNumber = `JC-${lead.id.slice(0, 8).toUpperCase()}`;
  const latestMockup =
    lead.mockups && lead.mockups.length > 0
      ? lead.mockups[lead.mockups.length - 1]
      : null;
  const approvedMockup = lead.mockups?.find((m) => m.status === 'approved') || latestMockup;
  const previewImage = approvedMockup?.url || lead.artwork_url;

  const handleCopyCitation = () => {
    if (!lead.design_notes) return;
    navigator.clipboard.writeText(lead.design_notes);
    setCopiedCitation(true);
    toast.success('Engraving citation copied to clipboard!');
    setTimeout(() => setCopiedCitation(false), 2000);
  };

  const handlePrint = () => {
    if (!lead) return;
    printProductionTeamChecklist(lead);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:static">
      <div className="bg-surface border border-shadow-darker/30 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-neo-raised overflow-hidden print:max-w-none print:max-h-none print:border-none print:shadow-none print:rounded-none">

        {/* Modal Header (Hidden in Print) */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-shadow-darker/20 bg-surface print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center font-bold">
              <Printer size={16} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-primary-dark">
                Factory Production Job Card
              </h3>
              <p className="text-[11px] text-secondary">
                Order #{jobCardNumber} • Printable Manufacturing Work Order
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSpecsModal && (
              <button
                type="button"
                onClick={onOpenSpecsModal}
                className="neo-btn text-xs px-3.5 py-1.5 font-bold text-primary-dark hover:text-primary transition-colors border border-shadow-darker/30"
              >
                Edit Specs
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="neo-btn-primary text-xs px-3.5 py-1.5 font-bold flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white shadow-sm"
            >
              <Printer size={14} /> Print Job Card
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-secondary hover:text-primary-dark hover:bg-surface-hover transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Job Sheet Body */}
        <div ref={printableAreaRef} className="p-6 overflow-y-auto space-y-5 print:p-6 print:overflow-visible">

          {/* Sheet Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  EcoTrophy Manufacturing
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-900 text-white">
                  Work Order / Job Card
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                Trophy, Award &amp; Memento Manufacturing &amp; Packaging Order
              </p>
            </div>

            <div className="text-right">
              <div className="font-mono text-base font-black text-slate-900 tracking-wider">
                {jobCardNumber}
              </div>
              <div className="text-xs text-slate-500 font-semibold mt-0.5">
                Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Grid: Order Specs & Critical Deadlines */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Customer</span>
              <strong className="text-slate-900 text-sm font-black block truncate">{lead.name}</strong>
              {lead.company && <span className="text-slate-700 text-[11px] truncate block">{lead.company}</span>}
              {lead.phone && <span className="text-slate-700 font-mono text-[11px] block">{lead.phone}</span>}
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Required Quantity</span>
              <strong className="text-slate-900 text-lg font-black block">
                {lead.required_quantity ? `${lead.required_quantity} PCS` : '1 PC (Sample)'}
              </strong>
              {lead.trophy_size && (
                <span className="text-slate-700 text-[11px] block font-bold">
                  Size: {lead.trophy_size}
                </span>
              )}
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Production Deadline</span>
              <strong className="text-sm font-black text-slate-900 block">
                {lead.production_deadline || 'Open / Priority'}
              </strong>
              <span className="text-slate-600 text-[11px] block">
                Delivery TAT: {lead.delivery_date || 'Standard'}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Team Assignments</span>
              <span className="text-slate-700 block text-[11px]">
                Production: <strong className="text-slate-900 font-bold">{lead.production_person || 'Floor Team'}</strong>
              </span>
              <span className="text-slate-700 block text-[11px] mt-0.5">
                Sales Rep: <strong className="text-slate-900 font-bold">{lead.sales_person || 'Sales Team'}</strong>
              </span>
            </div>
          </div>

          {/* Section: Dedicated Materials, Stock & Box Packaging Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-300 rounded-xl p-3.5 bg-slate-50 text-xs">

            {/* Materials & Stock */}
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase text-slate-900 flex items-center gap-1">
                <Layers size={13} /> Materials to Use &amp; Stock Status
              </span>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                <div>
                  <strong className="text-slate-500 text-[10px] uppercase block">Materials to Use in Trophy:</strong>
                  <span className="font-bold text-slate-900">
                    {lead.trophy_materials_used || lead.material || 'Standard Acrylic / Teak Wood Hybrid'}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">Raw Material Stock:</span>
                  <span className="font-bold text-slate-900 uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-100">
                    {lead.materials_stock_status === 'need_to_buy' ? 'To Buy / Order' : 'In Stock'}
                  </span>
                </div>
                {lead.materials_to_buy && (
                  <div className="text-[11px] text-slate-800">
                    <strong>To Buy:</strong> {lead.materials_to_buy}
                  </div>
                )}
              </div>
            </div>

            {/* Packaging & Box Sizes */}
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase text-slate-900 flex items-center gap-1">
                <Box size={13} /> Packaging Box Sizes
              </span>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1.5">
                <div>
                  <strong className="text-slate-500 text-[10px] uppercase block">Single Box Size (Individual Unit):</strong>
                  <span className="font-bold text-slate-900">
                    {lead.single_box_size || 'Standard Unit Box'}
                  </span>
                </div>
                <div>
                  <strong className="text-slate-500 text-[10px] uppercase block">Whole Box Size (Master Carton):</strong>
                  <span className="font-bold text-slate-900">
                    {lead.master_box_size || 'Standard Master Box Packing'}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Section: Delivery Logistics & Prototype Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-300 rounded-xl p-3.5 bg-slate-50 text-xs">
            {/* Delivery Logistics */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-black uppercase text-slate-900 flex items-center gap-1">
                <Truck size={13} /> Delivery Logistics (Courier / Bus / Flight)
              </span>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                <div>
                  <strong className="text-slate-500 text-[10px] uppercase block">Delivery Mode:</strong>
                  <span className="font-bold text-slate-900 capitalize">
                    {lead.delivery_mode ? lead.delivery_mode.replace(/_/g, ' ') : 'Courier Service'}
                  </span>
                </div>
                {lead.delivery_details && (
                  <div>
                    <strong className="text-slate-500 text-[10px] uppercase block">Transport Details:</strong>
                    <span className="font-medium text-slate-800">{lead.delivery_details}</span>
                  </div>
                )}
                <div>
                  <strong className="text-slate-500 text-[10px] uppercase block">Delivery Location / Destination:</strong>
                  <span className="font-bold text-slate-900">
                    {lead.delivery_location || lead.location || 'Direct Client Handover'}
                  </span>
                </div>
              </div>
            </div>

            {/* Prototype & Sample */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-black uppercase text-slate-900 flex items-center gap-1">
                <Award size={13} /> Prototype &amp; Physical Sample
              </span>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <strong className="text-slate-500 text-[10px] uppercase">Prototype Status:</strong>
                  <span className="font-bold text-slate-900 uppercase text-[10px]">
                    {lead.prototype_status ? lead.prototype_status.replace(/_/g, ' ') : 'Not Required'}
                  </span>
                </div>
                {lead.prototype_notes && (
                  <p className="text-slate-700 text-[11px]">
                    <strong>Notes:</strong> {lead.prototype_notes}
                  </p>
                )}
                {lead.prototype_photo_url && (
                  <div className="pt-1 flex items-center gap-2">
                    <img
                      src={lead.prototype_photo_url}
                      alt="Prototype"
                      className="w-10 h-10 object-contain rounded border border-slate-200"
                    />
                    <span className="text-[10px] text-slate-600 font-semibold">Physical Sample on file</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: Artwork Mockup & Laser Citation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Approved Mockup */}
            <div className="border border-slate-300 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Award size={14} /> Approved Mockup Proof
                </span>
                {approvedMockup?.version && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-900 font-bold text-[10px]">
                    v{approvedMockup.version} Approved
                  </span>
                )}
              </div>

              {previewImage ? (
                <div className="rounded-lg bg-slate-100 border border-slate-200 p-2 flex items-center justify-center min-h-[160px] max-h-[220px] overflow-hidden">
                  <img
                    src={previewImage}
                    alt="Proof Preview"
                    className="max-h-[200px] max-w-full object-contain rounded"
                  />
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center text-slate-500 text-xs">
                  No visual mockup attached yet.
                </div>
              )}
            </div>

            {/* Citation & Engraving Text */}
            <div className="border border-slate-300 rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                    Citation &amp; Laser Engraving Text
                  </span>
                  {lead.design_notes && (
                    <button
                      type="button"
                      onClick={handleCopyCitation}
                      className="print:hidden text-[11px] font-bold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200"
                      title="Copy text for laser engraving software"
                    >
                      {copiedCitation ? <Check size={12} /> : <Copy size={12} />}
                      {copiedCitation ? 'Copied' : 'Copy Text'}
                    </button>
                  )}
                </div>

                <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-900 whitespace-pre-wrap leading-relaxed min-h-[130px]">
                  {lead.design_notes || 'No specific citation text provided. Refer to approved mockup.'}
                </div>
              </div>
            </div>
          </div>

          {/* Factory Floor Checklist & Sign-Off */}
          <div className="border border-slate-300 rounded-xl p-4 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                Factory Technician Sign-Off Checklist
              </span>
              <span className="text-[10px] font-semibold text-slate-500">
                Check each step as it is completed on the shop floor
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
              <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 rounded border-slate-300" />
                <div>
                  <strong className="block text-[11px] font-bold text-slate-900">1. Material Cut</strong>
                  <span className="text-[10px] text-slate-500">Material verified</span>
                </div>
              </div>

              <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 rounded border-slate-300" />
                <div>
                  <strong className="block text-[11px] font-bold text-slate-900">2. Engraving/UV</strong>
                  <span className="text-[10px] text-slate-500">Citation checked</span>
                </div>
              </div>

              <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 rounded border-slate-300" />
                <div>
                  <strong className="block text-[11px] font-bold text-slate-900">3. Assembled</strong>
                  <span className="text-[10px] text-slate-500">Base fixed &amp; cleaned</span>
                </div>
              </div>

              <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 rounded border-slate-300" />
                <div>
                  <strong className="block text-[11px] font-bold text-slate-900">4. QC Passed</strong>
                  <span className="text-[10px] text-slate-500">Inspection verified</span>
                </div>
              </div>

              <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 rounded border-slate-300" />
                <div>
                  <strong className="block text-[11px] font-bold text-slate-900">5. Box Packed</strong>
                  <span className="text-[10px] text-slate-500">Box &amp; label ready</span>
                </div>
              </div>
            </div>

            {/* Signature & QC stamp row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-200 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Operator Signature:</span>
                <div className="mt-4 border-b border-dashed border-slate-400 w-full" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">QC Inspector Sign &amp; Date:</span>
                <div className="mt-4 border-b border-dashed border-slate-400 w-full" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Dispatch Mode &amp; AWB:</span>
                <div className="mt-1 font-mono text-[11px] font-bold text-slate-900">
                  {lead.delivery_mode ? `${lead.delivery_mode.toUpperCase()}` : 'COURIER'}
                  {lead.dispatch_awb ? `: ${lead.dispatch_awb}` : ''}
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

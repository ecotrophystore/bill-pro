import React, { useState, useEffect } from 'react';
import {
  Factory,
  X,
  Package,
  Layers,
  Truck,
  MapPin,
  Calendar,
  Clock,
  Printer,
  Sparkles,
  Check,
  Upload,
  AlertCircle,
  Eye,
  Loader2,
  Phone,
  User,
  ShoppingBag,
  Box,
  Plane,
  Bus,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { Lead } from '../../types';
import toast from 'react-hot-toast';
import { printProductionTeamChecklist } from '../../utils/printDesignProductionSheet';

interface ProductionSpecsModalProps {
  isOpen: boolean;
  lead: Lead | null;
  onClose: () => void;
  onOpenJobCard?: () => void;
  onSuccess?: () => void;
  initialTab?: 'view' | 'edit';
}

const COMMON_DELIVERY_MODES = [
  { id: 'courier', label: 'Courier Service', icon: Truck },
  { id: 'bus', label: 'Private Bus Parcel (KPN / SRS / ABT)', icon: Bus },
  { id: 'flight', label: 'Air Cargo / Flight Express', icon: Plane },
  { id: 'train', label: 'Train Parcel Service', icon: Truck },
  { id: 'local_hand_delivery', label: 'Local Hand Delivery / Van', icon: Truck },
  { id: 'customer_pickup', label: 'Factory Pickup by Customer', icon: User },
];

const STOCK_STATUS_OPTIONS = [
  { id: 'in_stock', label: 'In Stock (Ready in Factory)' },
  { id: 'need_to_buy', label: 'Need to Buy (Purchase Required)' },
  { id: 'partially_available', label: 'Partially Available' },
  { id: 'ordered', label: 'Ordered / In Transit from Supplier' },
];

const PROTOTYPE_OPTIONS = [
  { id: 'not_required', label: 'Not Required (Direct Production)' },
  { id: 'needed', label: 'Prototype Sample Needed' },
  { id: 'sample_in_progress', label: 'Sample in Progress' },
  { id: 'sample_ready', label: 'Sample Ready for Review' },
  { id: 'client_approved', label: 'Prototype Approved by Client' },
];

export function ProductionSpecsModal({
  isOpen,
  lead,
  onClose,
  onOpenJobCard,
  onSuccess,
  initialTab = 'view',
}: ProductionSpecsModalProps) {
  const { user: currentUser, dbUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'view' | 'edit'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  // Form states
  const [trophySize, setTrophySize] = useState(lead?.trophy_size || '');
  const [trophyMaterialsUsed, setTrophyMaterialsUsed] = useState(
    lead?.trophy_materials_used || lead?.material || ''
  );
  const [materialsStockStatus, setMaterialsStockStatus] = useState<any>(
    lead?.materials_stock_status || 'in_stock'
  );
  const [materialsToBuy, setMaterialsToBuy] = useState(lead?.materials_to_buy || '');
  const [singleBoxSize, setSingleBoxSize] = useState(lead?.single_box_size || '');
  const [masterBoxSize, setMasterBoxSize] = useState(lead?.master_box_size || '');
  const [deliveryMode, setDeliveryMode] = useState<any>(lead?.delivery_mode || 'courier');
  const [deliveryDetails, setDeliveryDetails] = useState(
    lead?.delivery_details || lead?.dispatch_courier || ''
  );
  const [deliveryLocation, setDeliveryLocation] = useState(
    lead?.delivery_location || lead?.location || ''
  );
  const [prototypeStatus, setPrototypeStatus] = useState<any>(
    lead?.prototype_status || 'not_required'
  );
  const [prototypeNotes, setPrototypeNotes] = useState(lead?.prototype_notes || '');
  const [productionDeadline, setProductionDeadline] = useState(lead?.production_deadline || '');

  // Prototype photo file upload
  const [prototypeFile, setPrototypeFile] = useState<File | null>(null);
  const [prototypePhotoUrl, setPrototypePhotoUrl] = useState(lead?.prototype_photo_url || '');

  React.useEffect(() => {
    if (lead) {
      setTrophySize(lead.trophy_size || '');
      setTrophyMaterialsUsed(lead.trophy_materials_used || lead.material || '');
      setMaterialsStockStatus(lead.materials_stock_status || 'in_stock');
      setMaterialsToBuy(lead.materials_to_buy || '');
      setSingleBoxSize(lead.single_box_size || '');
      setMasterBoxSize(lead.master_box_size || '');
      setDeliveryMode(lead.delivery_mode || 'courier');
      setDeliveryDetails(lead.delivery_details || lead.dispatch_courier || '');
      setDeliveryLocation(lead.delivery_location || lead.location || '');
      setPrototypeStatus(lead.prototype_status || 'not_required');
      setPrototypeNotes(lead.prototype_notes || '');
      setProductionDeadline(lead.production_deadline || '');
      setPrototypePhotoUrl(lead.prototype_photo_url || '');
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const handleSave = async (e: React.FormEvent, pushToProduction: boolean = false) => {
    e.preventDefault();
    if (!db || !lead) return;

    setSaving(true);
    const toastId = toast.loading(
      pushToProduction
        ? 'Saving specs & dispatching to Production Pipeline...'
        : 'Saving production specifications...'
    );

    try {
      let finalPrototypeUrl = prototypePhotoUrl;
      if (prototypeFile && storage) {
        const sanitized = prototypeFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const sRef = storageRef(
          storage,
          `production_prototypes/${lead.id}/proto_${Date.now()}_${sanitized}`
        );
        await uploadBytes(sRef, prototypeFile);
        finalPrototypeUrl = await getDownloadURL(sRef);
      }

      const updates: any = {
        trophy_size: trophySize.trim(),
        trophy_materials_used: trophyMaterialsUsed.trim(),
        material: trophyMaterialsUsed.trim(),
        materials_stock_status: materialsStockStatus,
        materials_to_buy: materialsToBuy.trim(),
        single_box_size: singleBoxSize.trim(),
        master_box_size: masterBoxSize.trim(),
        delivery_mode: deliveryMode,
        delivery_details: deliveryDetails.trim(),
        delivery_location: deliveryLocation.trim(),
        prototype_status: prototypeStatus,
        prototype_notes: prototypeNotes.trim(),
        prototype_photo_url: finalPrototypeUrl || undefined,
        production_deadline: productionDeadline.trim(),
        updated_at: serverTimestamp(),
      };

      if (pushToProduction) {
        updates.pipeline_id = 'production_pipeline';
        updates.stage_id = 'material_prep';
        updates.status = 'in_production';
        updates.production_status = 'material_prep';
      }

      await updateDoc(doc(db, 'leads', lead.id), updates);

      await addDoc(collection(db, 'activities'), {
        lead_id: lead.id,
        type: pushToProduction ? 'handoff_to_production' : 'production_specs_updated',
        content: pushToProduction
          ? `🚀 Order specs completed and handed off to Production Pipeline (Stage 1: Material Prep) by ${dbUser?.name || currentUser?.displayName || 'Design Team'}.`
          : `🏭 Production specs updated by ${dbUser?.name || currentUser?.displayName || 'Production Team'}: Box (${singleBoxSize || 'Standard'}), Mode (${deliveryMode}), Stock (${materialsStockStatus}).`,
        user_name: dbUser?.name || currentUser?.displayName || 'Team Member',
        user_id: dbUser?.id || currentUser?.uid || '',
        created_at: serverTimestamp(),
      });

      toast.success(
        pushToProduction
          ? 'Specifications saved & order sent to Production Team Pipeline!'
          : 'Production specifications saved successfully!',
        { id: toastId }
      );
      setActiveTab('view');
      if (onSuccess) onSuccess();
      if (pushToProduction) onClose();
    } catch (err: any) {
      console.error('Error saving production specs:', err);
      toast.error('Failed to save production specs: ' + (err?.message || 'Unknown error'), {
        id: toastId,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:static">
      <div className="bg-surface border border-shadow-darker/30 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-neo-raised overflow-hidden print:max-w-none print:max-h-none print:border-none print:shadow-none print:rounded-none">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-shadow-darker/20 bg-surface print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-primary/10 text-primary-dark border border-primary/20">
              <Factory size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-primary-dark text-base leading-tight">
                  Production &amp; Manufacturing Specifications
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary-dark border border-primary/20">
                  REF-{lead.id.slice(0, 7).toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-secondary">
                Customer: <strong className="text-primary-dark">{lead.company || lead.name}</strong> • Quantity: <strong className="text-primary-dark">{lead.required_quantity || 1} pcs</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => lead && printProductionTeamChecklist(lead)}
              className="neo-btn text-xs px-3 py-1.5 font-bold text-primary-dark hover:text-primary flex items-center gap-1.5 transition-colors border border-shadow-darker/30"
              title="Print clean Production Team Checklist with 9 manufacturing specifications"
            >
              <Printer size={14} className="text-primary" />
              <span className="hidden sm:inline">Print Production Checklist</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'view' ? 'edit' : 'view')}
              className="neo-btn-primary text-xs px-3.5 py-1.5 font-bold flex items-center gap-1.5 bg-primary text-white hover:bg-primary-dark transition-colors"
            >
              {activeTab === 'view' ? 'Edit Specs' : 'View Specs'}
            </button>

            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-secondary hover:text-primary-dark hover:bg-surface-hover transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        {activeTab === 'view' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-primary-dark">

            {/* Quick Handoff Prompt Banner */}
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
              <div>
                <div className="text-xs font-bold text-primary-dark flex items-center gap-1.5">
                  <Factory size={15} className="text-primary" />
                  <span>Production &amp; Factory Specifications</span>
                </div>
                <p className="text-[11px] text-secondary mt-0.5">
                  Enter or verify the 9 manufacturing requirements below and transfer the order directly to the factory floor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className="neo-btn-primary px-3.5 py-1.5 text-xs font-bold text-white bg-primary hover:bg-primary-dark shrink-0 flex items-center gap-1.5 shadow-xs"
              >
                ✏️ Edit / Add Production Details
              </button>
            </div>

            {/* Top Metrics Row: Quantity, Size & Production Deadline */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-surface border border-shadow-darker/30 shadow-neo-surface">
              <div>
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">
                  1. Size / Dimensions
                </div>
                <div className="text-base font-bold text-primary-dark mt-0.5">
                  {lead.trophy_size || 'To be specified by design'}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">
                  Order Quantity
                </div>
                <div className="text-base font-bold text-primary-dark flex items-center gap-1 mt-0.5">
                  <Package size={16} className="text-primary" />
                  {lead.required_quantity ? `${lead.required_quantity} pcs` : '1 pc (Sample)'}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-secondary uppercase tracking-wider">
                  2. Production Deadline
                </div>
                <div className="text-base font-bold text-primary-dark flex items-center gap-1.5 mt-0.5">
                  <Clock size={16} className="text-primary" />
                  {lead.production_deadline || 'Not Set'}
                </div>
              </div>
            </div>

            {/* Section: Materials to Use & Raw Material Stock to Buy */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Materials to Use */}
              <div className="border border-shadow-darker/25 rounded-xl p-4 bg-surface shadow-neo-surface space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary-dark uppercase tracking-wider border-b border-shadow-darker/15 pb-2">
                  <Layers size={14} className="text-primary" />
                  <span>3. Materials to Use in Trophy</span>
                </div>
                <p className="text-sm font-semibold text-primary-dark whitespace-pre-wrap leading-relaxed">
                  {lead.trophy_materials_used || lead.material || 'Standard Acrylic / Wood Hybrid'}
                </p>
                {lead.shapes && (
                  <div className="text-xs text-secondary pt-2 border-t border-shadow-darker/10">
                    <span className="font-bold">Shape / Cut:</span> {lead.shapes}
                  </div>
                )}
              </div>

              {/* Stock Status & Purchase Requirement */}
              <div className="border border-shadow-darker/25 rounded-xl p-4 bg-surface shadow-neo-surface space-y-2">
                <div className="flex items-center justify-between border-b border-shadow-darker/15 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-primary-dark uppercase tracking-wider">
                    <ShoppingBag size={14} className="text-primary" />
                    <span>4. Stock &amp; Materials to Buy</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary-dark border border-primary/20">
                    {STOCK_STATUS_OPTIONS.find((s) => s.id === lead.materials_stock_status)?.label ||
                      (lead.materials_stock_status === 'need_to_buy' ? 'Need to Buy' : 'In Stock')}
                  </span>
                </div>
                <div className="text-xs text-secondary font-bold">Purchase Requirements / To Buy:</div>
                <p className="text-sm font-semibold text-primary-dark whitespace-pre-wrap">
                  {lead.materials_to_buy || 'All required raw materials are in factory stock.'}
                </p>
              </div>
            </div>

            {/* Section: Packaging (Single Box Size & Whole Box Size) */}
            <div className="border border-shadow-darker/25 rounded-xl p-4 bg-surface shadow-neo-surface space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary-dark uppercase tracking-wider border-b border-shadow-darker/15 pb-2">
                <Box size={14} className="text-primary" />
                <span>5 &amp; 6. Packaging Specifications</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs">
                  <span className="text-[11px] font-bold text-secondary uppercase tracking-wider block mb-1">
                    5. Packing Single Box Size
                  </span>
                  <div className="text-sm font-bold text-primary-dark">
                    {lead.single_box_size || 'To be specified (Standard unit box)'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs">
                  <span className="text-[11px] font-bold text-secondary uppercase tracking-wider block mb-1">
                    6. Whole Box / Master Carton Size
                  </span>
                  <div className="text-sm font-bold text-primary-dark">
                    {lead.master_box_size || 'To be specified (Master packaging)'}
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Delivery Details & Location */}
            <div className="border border-shadow-darker/25 rounded-xl p-4 bg-surface shadow-neo-surface space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary-dark uppercase tracking-wider border-b border-shadow-darker/15 pb-2">
                <Truck size={14} className="text-primary" />
                <span>7 &amp; 8. Delivery Logistics &amp; Destination</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Delivery Mode & Transport details */}
                <div className="p-3 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-secondary uppercase tracking-wider block">
                    7. Delivery Mode (Courier / Bus / Flight)
                  </span>
                  <div className="text-sm font-bold text-primary-dark flex items-center gap-1.5">
                    {lead.delivery_mode === 'flight' ? (
                      <Plane size={15} className="text-primary" />
                    ) : lead.delivery_mode === 'bus' ? (
                      <Bus size={15} className="text-primary" />
                    ) : (
                      <Truck size={15} className="text-primary" />
                    )}
                    <span>
                      {COMMON_DELIVERY_MODES.find((m) => m.id === lead.delivery_mode)?.label ||
                        lead.delivery_mode ||
                        'Courier Service'}
                    </span>
                  </div>
                  {lead.delivery_details && (
                    <div className="text-xs text-primary-dark/80 pt-1 border-t border-shadow-darker/10">
                      <strong>Details / Service:</strong> {lead.delivery_details}
                    </div>
                  )}
                  {lead.dispatch_awb && (
                    <div className="text-xs font-mono text-primary font-bold">
                      AWB / LR #: {lead.dispatch_awb}
                    </div>
                  )}
                </div>

                {/* Delivery Location */}
                <div className="p-3 rounded-lg bg-surface border border-shadow-darker/20 shadow-2xs space-y-1">
                  <span className="text-[11px] font-bold text-secondary uppercase tracking-wider block flex items-center gap-1">
                    <MapPin size={12} className="text-primary" /> 8. Delivery Location / Destination
                  </span>
                  <div className="text-sm font-bold text-primary-dark">
                    {lead.delivery_location || lead.location || 'Direct Client Handover'}
                  </div>
                  {lead.phone && (
                    <div className="text-xs text-secondary pt-1 border-t border-shadow-darker/10 flex items-center gap-1">
                      <Phone size={12} className="text-primary" /> Contact: {lead.phone}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section: Prototype / Sample */}
            <div className="border border-shadow-darker/25 rounded-xl p-4 bg-surface shadow-neo-surface space-y-3">
              <div className="flex items-center justify-between border-b border-shadow-darker/15 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary-dark uppercase tracking-wider">
                  <Sparkles size={14} className="text-primary" />
                  <span>9. Prototype / Physical Sample</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary-dark border border-primary/20">
                  {PROTOTYPE_OPTIONS.find((p) => p.id === lead.prototype_status)?.label ||
                    (lead.prototype_status === 'needed' ? 'Sample Needed' : 'Not Required')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <div className="text-xs font-bold text-secondary uppercase tracking-wider mb-1">
                    Prototype Notes &amp; Client Feedback
                  </div>
                  <p className="text-xs text-primary-dark whitespace-pre-wrap">
                    {lead.prototype_notes || 'No specific prototype notes entered.'}
                  </p>
                </div>

                {lead.prototype_photo_url && (
                  <div className="p-2 rounded-lg bg-white border border-shadow-darker/20 flex items-center gap-3">
                    <img
                      src={lead.prototype_photo_url}
                      alt="Prototype Sample"
                      className="w-16 h-16 object-contain rounded border border-shadow-darker/20"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-primary-dark block">Physical Sample Photo</span>
                      <a
                        href={lead.prototype_photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary font-bold hover:underline"
                      >
                        View Full Screen
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Edit Trigger */}
            <div className="pt-3 border-t border-shadow-darker/20 flex items-center justify-between gap-3">
              <span className="text-xs text-secondary italic">
                Ready to hand off to the factory floor?
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className="neo-btn-primary text-xs px-5 py-2 font-bold bg-primary text-white hover:bg-primary-dark flex items-center gap-1.5 shadow-xs"
              >
                ✏️ Enter / Edit Production Details
              </button>
            </div>

          </div>
        ) : (
          /* Edit Form */
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">

            {/* 1. Trophy Size & Production Deadline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  1. Trophy Size / Dimensions <span className="text-tertiary">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={trophySize}
                  onChange={(e) => setTrophySize(e.target.value)}
                  placeholder="e.g. 10 x 4 inches, 12mm thickness"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 text-primary-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  2. Production Deadline <span className="text-tertiary">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={productionDeadline}
                  onChange={(e) => setProductionDeadline(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark"
                />
              </div>
            </div>

            {/* 3. Materials to Use in Trophy */}
            <div>
              <label className="block text-xs font-bold text-primary-dark mb-1">
                3. Materials to Use in Trophy
              </label>
              <textarea
                rows={2}
                value={trophyMaterialsUsed}
                onChange={(e) => setTrophyMaterialsUsed(e.target.value)}
                placeholder="e.g. 12mm Cast Acrylic front + 2-inch solid seasoned Teak base + 2mm Gold mirror plate with laser etching"
                className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 text-primary-dark"
              />
            </div>

            {/* 4. Stock & Materials to Buy */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  4. Raw Material Stock Status
                </label>
                <select
                  value={materialsStockStatus}
                  onChange={(e) => setMaterialsStockStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark font-semibold"
                >
                  {STOCK_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  Materials We Want to Buy / Order
                </label>
                <input
                  type="text"
                  value={materialsToBuy}
                  onChange={(e) => setMaterialsToBuy(e.target.value)}
                  placeholder="e.g. 5 sheets 10mm Clear Acrylic, 30 Teak Blocks"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark"
                />
              </div>
            </div>

            {/* 5 & 6. Packaging Sizes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  5. Packing Single Box Size
                </label>
                <input
                  type="text"
                  value={singleBoxSize}
                  onChange={(e) => setSingleBoxSize(e.target.value)}
                  placeholder="e.g. 11 x 5 x 3 inches, Velvet satin gift box"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  6. Whole Box / Master Carton Size
                </label>
                <input
                  type="text"
                  value={masterBoxSize}
                  onChange={(e) => setMasterBoxSize(e.target.value)}
                  placeholder="e.g. 24 x 18 x 16 inches, 20 pcs per master box (3 cartons total)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark"
                />
              </div>
            </div>

            {/* 7 & 8. Delivery Details & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  7. Delivery Mode
                </label>
                <select
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark font-semibold"
                >
                  {COMMON_DELIVERY_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  Transport Details / Courier / Bus / Flight
                </label>
                <input
                  type="text"
                  value={deliveryDetails}
                  onChange={(e) => setDeliveryDetails(e.target.value)}
                  placeholder="e.g. KPN Parcel to Madurai / Indigo Air Cargo 6E-241"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  8. Delivery Location / Destination
                </label>
                <input
                  type="text"
                  value={deliveryLocation}
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                  placeholder="e.g. Hotel Taj Coromandel, Nungambakkam, Chennai"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark"
                />
              </div>
            </div>

            {/* 9. Prototype Status & Photo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-shadow-darker/15">
              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  9. Prototype / Sample Status
                </label>
                <select
                  value={prototypeStatus}
                  onChange={(e) => setPrototypeStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark font-semibold"
                >
                  {PROTOTYPE_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <textarea
                  rows={2}
                  value={prototypeNotes}
                  onChange={(e) => setPrototypeNotes(e.target.value)}
                  placeholder="Prototype instructions or client sample comments..."
                  className="w-full mt-2 px-3 py-2 text-xs rounded-lg border border-shadow-darker/25 bg-surface text-primary-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-primary-dark mb-1">
                  Attach Prototype / Sample Photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files && setPrototypeFile(e.target.files[0])}
                  className="text-xs text-secondary file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-primary file:text-white hover:file:bg-primary-dark"
                />
                {prototypeFile && (
                  <p className="text-[11px] text-primary font-bold mt-1">
                    Selected: {prototypeFile.name}
                  </p>
                )}
                {!prototypeFile && prototypePhotoUrl && (
                  <p className="text-[11px] text-secondary mt-1 truncate">
                    Current photo saved
                  </p>
                )}
              </div>
            </div>

            {/* Submit & Cancel */}
            <div className="pt-4 border-t border-shadow-darker/15 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('view')}
                className="neo-btn text-xs px-4 py-2 font-bold text-secondary w-full sm:w-auto"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="submit"
                  disabled={saving}
                  className="neo-btn text-xs px-4 py-2.5 font-bold text-primary-dark border-primary/20 hover:bg-primary/5 flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 flex-1 sm:flex-initial"
                >
                  <Check size={14} /> Save Specs
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={(e) => handleSave(e, true)}
                  className="neo-btn-primary text-xs px-5 py-2.5 font-bold bg-primary text-white hover:bg-primary-dark flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 flex-1 sm:flex-initial"
                  title="Save specifications and push order card into the Production Team Pipeline"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Transferring...
                    </>
                  ) : (
                    <>
                      <Factory size={14} /> Save &amp; Push to Production 🏭
                    </>
                  )}
                </button>
              </div>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}

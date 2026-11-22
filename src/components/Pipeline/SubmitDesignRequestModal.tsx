import React, { useState } from 'react';
import {
  Palette,
  X,
  Upload,
  Calendar,
  Clock,
  Sparkles,
  Layers,
  Shapes as ShapesIcon,
  Award,
  IndianRupee,
  Package,
  Check,
  Building,
  User,
  Phone,
  Mail,
  Loader2,
  Trash2,
  Plus,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { Lead } from '../../types';
import toast from 'react-hot-toast';

interface SubmitDesignRequestModalProps {
  isOpen: boolean;
  lead: Lead | null;
  targetStageId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const COMMON_MATERIALS = [
  'Clear Acrylic',
  'Frosted Acrylic',
  'Teak Wood',
  'Solid Wood Base',
  'Brass Metal',
  'Cast Metal',
  'Crystal Glass',
  'Gold Plated Metal',
  'Resin Trophy',
  'MDF Substrate',
];

const COMMON_SHAPES = [
  'Flame / Torch',
  'Diamond Cut',
  'Shield / Crest',
  'Star / Starburst',
  'Octagon / Geometric',
  'Pillar / Obelisk',
  'Sail / Wave',
  'Custom Outline',
];

const COMMON_THEMES = [
  'Corporate Excellence',
  'Annual Awards Gala',
  'Sports Tournament / Championship',
  'Long Service & Recognition',
  'Academic / Scholastic',
  'Eco / Sustainability',
  'Modern Minimalist',
];

export function SubmitDesignRequestModal({
  isOpen,
  lead,
  targetStageId,
  onClose,
  onSuccess,
}: SubmitDesignRequestModalProps) {
  const { user: currentUser, dbUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Form states pre-filled with existing lead data
  const [trophySize, setTrophySize] = useState(lead?.trophy_size || '');
  const [concept, setConcept] = useState(lead?.concept || lead?.design_notes || '');
  const [theme, setTheme] = useState(lead?.theme || lead?.event_name || '');
  const [shapes, setShapes] = useState(lead?.shapes || lead?.trophy_type || '');
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>(() => {
    if (!lead?.material) return [];
    return lead.material.split(',').map((m) => m.trim()).filter(Boolean);
  });
  const [customMaterial, setCustomMaterial] = useState('');
  const [brandColors, setBrandColors] = useState(lead?.brand_colors || '');
  const [modelVariants, setModelVariants] = useState(lead?.model_variants || '');
  const [quantity, setQuantity] = useState(String(lead?.required_quantity || ''));
  const [budget, setBudget] = useState(lead?.budget || (lead?.value ? String(lead.value) : ''));
  const [designDeadline, setDesignDeadline] = useState(lead?.design_deadline || '');
  const [productionDeadline, setProductionDeadline] = useState(lead?.production_deadline || '');
  const [deliveryDeadline, setDeliveryDeadline] = useState(lead?.delivery_date || '');
  const [eventDate, setEventDate] = useState(lead?.event_date || '');
  const [assignedDesigner, setAssignedDesigner] = useState(lead?.design_person || '');

  // File uploads
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState(lead?.artwork_url || '');
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [existingRefUrls, setExistingRefUrls] = useState<string[]>(
    Array.isArray(lead?.reference_designs) ? lead!.reference_designs! : []
  );

  // Sync state if lead prop changes
  React.useEffect(() => {
    if (lead) {
      setTrophySize(lead.trophy_size || '');
      setConcept(lead.concept || lead.design_notes || '');
      setTheme(lead.theme || lead.event_name || '');
      setShapes(lead.shapes || lead.trophy_type || '');
      if (lead.material) {
        setSelectedMaterials(lead.material.split(',').map((m) => m.trim()).filter(Boolean));
      } else {
        setSelectedMaterials([]);
      }
      setBrandColors(lead.brand_colors || '');
      setModelVariants(lead.model_variants || '');
      setQuantity(String(lead.required_quantity || ''));
      setBudget(lead.budget || (lead.value ? String(lead.value) : ''));
      setDesignDeadline(lead.design_deadline || '');
      setProductionDeadline(lead.production_deadline || '');
      setDeliveryDeadline(lead.delivery_date || '');
      setEventDate(lead.event_date || '');
      setAssignedDesigner(lead.design_person || '');
      setLogoUrl(lead.artwork_url || '');
      setExistingRefUrls(Array.isArray(lead.reference_designs) ? lead.reference_designs : []);
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const toggleMaterial = (mat: string) => {
    if (selectedMaterials.includes(mat)) {
      setSelectedMaterials(selectedMaterials.filter((m) => m !== mat));
    } else {
      setSelectedMaterials([...selectedMaterials, mat]);
    }
  };

  const addCustomMaterial = () => {
    if (!customMaterial.trim()) return;
    if (!selectedMaterials.includes(customMaterial.trim())) {
      setSelectedMaterials([...selectedMaterials, customMaterial.trim()]);
    }
    setCustomMaterial('');
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFile(e.target.files[0]);
    }
  };

  const handleRefFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setReferenceFiles((prev) => [...prev, ...files]);
    }
  };

  const removeReferenceFile = (index: number) => {
    setReferenceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingRefUrl = (index: number) => {
    setExistingRefUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !lead) return;

    setSubmitting(true);
    const toastId = toast.loading('Submitting design request to Design Team...');

    try {
      let finalLogoUrl = logoUrl;
      // 1. Upload Logo if new file selected
      if (logoFile && storage) {
        const sanitized = logoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const sRef = storageRef(storage, `lead_artwork/${lead.id}/logo_${Date.now()}_${sanitized}`);
        await uploadBytes(sRef, logoFile);
        finalLogoUrl = await getDownloadURL(sRef);
      }

      // 2. Upload any new reference design files
      const newUploadedRefUrls: string[] = [];
      if (referenceFiles.length > 0 && storage) {
        for (const file of referenceFiles) {
          const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const sRef = storageRef(storage, `lead_references/${lead.id}/ref_${Date.now()}_${sanitized}`);
          await uploadBytes(sRef, file);
          const url = await getDownloadURL(sRef);
          newUploadedRefUrls.push(url);
        }
      }

      const allRefUrls = [...existingRefUrls, ...newUploadedRefUrls];

      const materialCombined = selectedMaterials.join(', ');

      const updates: any = {
        trophy_size: trophySize.trim(),
        concept: concept.trim(),
        concept_notes: concept.trim(),
        design_notes: concept.trim(),
        theme: theme.trim(),
        shapes: shapes.trim(),
        material: materialCombined,
        brand_colors: brandColors.trim(),
        model_variants: modelVariants.trim(),
        required_quantity: quantity.trim() ? (isNaN(Number(quantity)) ? quantity.trim() : Number(quantity)) : lead.required_quantity,
        budget: budget.trim(),
        design_deadline: designDeadline.trim(),
        production_deadline: productionDeadline.trim(),
        delivery_date: deliveryDeadline.trim(),
        event_date: eventDate.trim(),
        design_person: assignedDesigner.trim() || lead.design_person || undefined,
        artwork_url: finalLogoUrl || undefined,
        reference_designs: allRefUrls,
        pipeline_id: 'design_pipeline',
        design_status: 'pending_brief',
        design_stage_id: 'concept_creation',
        status: targetStageId || lead.status || 'requirement_design_finalization',
        updated_at: serverTimestamp(),
      };

      await updateDoc(doc(db, 'leads', lead.id), updates);

      // Add to CRM activities log
      await addDoc(collection(db, 'activities'), {
        lead_id: lead.id,
        type: 'design_request_submitted',
        content: `🎨 Formal Design Request submitted by ${dbUser?.name || currentUser?.displayName || 'Sales Representative'} with size (${trophySize || 'Standard'}), material (${materialCombined || 'Custom'}), and deadlines. Lead pushed to Design Pipeline.`,
        user_name: dbUser?.name || currentUser?.displayName || 'Sales Representative',
        user_id: dbUser?.id || currentUser?.uid || '',
        created_at: serverTimestamp(),
      });

      toast.success('Design Request submitted to Design Team successfully!', { id: toastId });
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Error submitting design request:', err);
      toast.error('Failed to submit design request: ' + (err?.message || 'Unknown error'), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface border border-shadow-darker/20 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-shadow-darker/20 bg-surface">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-primary/10 text-primary-dark border border-primary/20">
              <Palette size={20} />
            </span>
            <div>
              <h3 className="font-bold text-primary-dark text-base leading-tight">
                Submit Design Request &amp; Creative Brief
              </h3>
              <p className="text-xs text-secondary">
                Lead: <strong className="text-primary-dark">{lead.name}</strong> • Client: {lead.company || 'Direct Client'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-lg text-secondary hover:text-primary-dark hover:bg-surface-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* Quick Notice */}
          <div className="p-3 rounded-xl bg-surface border border-shadow-darker/30 shadow-neo-surface text-xs text-primary-dark flex items-center gap-2">
            <Sparkles size={16} className="text-primary shrink-0" />
            <span>
              Filling these creative parameters helps the <strong>Design Team</strong> create the exact 3D/2D mockup without back-and-forth delays.
            </span>
          </div>

          {/* Section 1: Physical Dimensions & Materials */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <ShapesIcon size={14} className="text-primary" /> Product Dimensions &amp; Materials
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Product Size */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Product Size / Dimensions <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={trophySize}
                  onChange={(e) => setTrophySize(e.target.value)}
                  placeholder="e.g. 8x4 inches, 10mm acrylic with 2-inch wood base"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Shapes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Shape / Silhouette
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shapes}
                    onChange={(e) => setShapes(e.target.value)}
                    placeholder="e.g. Flame, Diamond cut, Octagon, Shield"
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <select
                    onChange={(e) => {
                      if (e.target.value) setShapes(e.target.value);
                    }}
                    value=""
                    className="px-2 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                  >
                    <option value="" disabled>Presets</option>
                    {COMMON_SHAPES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Material Chips */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Target Materials (Select all applicable)
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_MATERIALS.map((mat) => {
                  const isSelected = selectedMaterials.includes(mat);
                  return (
                    <button
                      key={mat}
                      type="button"
                      onClick={() => toggleMaterial(mat)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                        isSelected
                          ? 'bg-primary text-white border-primary shadow-xs'
                          : 'bg-surface border-shadow-darker/20 text-slate-700 dark:text-slate-300 hover:bg-surface-hover'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '}{mat}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 max-w-sm">
                <input
                  type="text"
                  value={customMaterial}
                  onChange={(e) => setCustomMaterial(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomMaterial();
                    }
                  }}
                  placeholder="Add custom material..."
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                />
                <button
                  type="button"
                  onClick={addCustomMaterial}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-surface border border-shadow-darker/20 hover:bg-surface-hover"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Creative Concept, Theme & Colors */}
          <div className="space-y-3 pt-3 border-t border-shadow-darker/10">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Sparkles size={14} className="text-primary" /> Concept, Theme &amp; Brand Colors
            </h4>

            {/* Concept text */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Design Concept &amp; Special Instructions
              </label>
              <textarea
                rows={3}
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="Describe the desired look, message, typography, engraving requirements, or customer vision..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Theme */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Design Theme / Occasion
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    placeholder="e.g. Annual Sports Gala 2026"
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                  />
                  <select
                    onChange={(e) => {
                      if (e.target.value) setTheme(e.target.value);
                    }}
                    value=""
                    className="px-2 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                  >
                    <option value="" disabled>Presets</option>
                    {COMMON_THEMES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Brand Colors */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Customer Brand Colors (Hex codes or names)
                </label>
                <input
                  type="text"
                  value={brandColors}
                  onChange={(e) => setBrandColors(e.target.value)}
                  placeholder="e.g. #003366 (Navy Blue), #FFD700 (Gold)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                />
              </div>
            </div>

            {/* Models / Variants */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Models / Variants Breakdown
              </label>
              <input
                type="text"
                value={modelVariants}
                onChange={(e) => setModelVariants(e.target.value)}
                placeholder="e.g. Winner (12 inch), 1st Runner-Up (10 inch), 2nd Runner-Up (8 inch)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
              />
            </div>
          </div>

          {/* Section 3: Logos & Reference Images */}
          <div className="space-y-3 pt-3 border-t border-shadow-darker/10">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Upload size={14} className="text-blue-600" /> Logo &amp; Reference Assets
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Logo upload */}
              <div className="p-3 rounded-lg border border-shadow-darker/10 bg-slate-50 dark:bg-slate-900/40">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Customer Logo File / Vector
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*,.pdf,.ai,.eps,.svg"
                    onChange={handleLogoChange}
                    className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                  />
                </div>
                {logoFile && (
                  <p className="text-[11px] text-emerald-600 mt-1 font-medium">Selected: {logoFile.name}</p>
                )}
                {!logoFile && logoUrl && (
                  <p className="text-[11px] text-slate-500 mt-1 truncate">Current: {logoUrl}</p>
                )}
              </div>

              {/* Reference designs upload */}
              <div className="p-3 rounded-lg border border-shadow-darker/10 bg-slate-50 dark:bg-slate-900/40">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Reference Designs / Samples (Inspirations)
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleRefFilesChange}
                  className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                />

                {/* Newly selected files */}
                {referenceFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      New attachments ({referenceFiles.length}):
                    </span>
                    {referenceFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                        <span className="truncate max-w-[200px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeReferenceFile(idx)}
                          className="text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Existing ref URLs */}
                {existingRefUrls.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Existing references ({existingRefUrls.length}):
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {existingRefUrls.map((url, idx) => (
                        <div key={idx} className="flex items-center gap-1 text-[11px] bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-shadow-darker/20">
                          <span>Ref #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeExistingRefUrl(idx)}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Deadlines & Quantities */}
          <div className="space-y-3 pt-3 border-t border-shadow-darker/10">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Clock size={14} className="text-amber-500" /> Quantity, Budget &amp; Deadlines
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Required Quantity
                </label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Estimated Budget (₹)
                </label>
                <input
                  type="text"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="e.g. 25000"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Design Deadline <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={designDeadline}
                  onChange={(e) => setDesignDeadline(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Production Target
                </label>
                <input
                  type="date"
                  value={productionDeadline}
                  onChange={(e) => setProductionDeadline(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Client Delivery Date
                </label>
                <input
                  type="date"
                  value={deliveryDeadline}
                  onChange={(e) => setDeliveryDeadline(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Event Date
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Assign Designer (Optional)
                </label>
                <input
                  type="text"
                  value={assignedDesigner}
                  onChange={(e) => setAssignedDesigner(e.target.value)}
                  placeholder="Designer Name / Queue"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-shadow-darker/20 bg-surface"
                />
              </div>
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-4 border-t border-shadow-darker/10 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 flex items-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <Palette size={15} /> Send to Design Pipeline
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

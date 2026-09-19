import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, addDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowRight, Loader2, Save, Sparkles, UserPlus, Building, Phone, Mail, MapPin, Calendar, Clock, DollarSign } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { type LeadPlatform, type Pipeline, DEFAULT_QUANTITY_PIPELINES, STANDARD_CRM_STAGES } from '../types';
import { useCRMPermission } from '../hooks/useCRMPermission';
import { classifyLeadPipeline } from '../utils/pipelineClassifier';

export default function AddLead() {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [requiredQuantity, setRequiredQuantity] = useState('');
  const [orderValue, setOrderValue] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [trophySize, setTrophySize] = useState('');
  const [salesPerson, setSalesPerson] = useState('');
  const [designPerson, setDesignPerson] = useState('');
  const [campaign, setCampaign] = useState('');
  const [source, setSource] = useState('Manual');
  const [platform, setPlatform] = useState<LeadPlatform>('manual');
  const [pipelineId, setPipelineId] = useState('regular_order');
  const [pipelines, setPipelines] = useState<Pipeline[]>(DEFAULT_QUANTITY_PIPELINES);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [manualPipelineOverridden, setManualPipelineOverridden] = useState(false);
  const { hasPermission } = useCRMPermission();

  useEffect(() => {
    if (!db) return;

    const unsub = onSnapshot(
      query(collection(db, 'pipelines')),
      (snapshot) => {
        if (!snapshot.empty) {
          const loaded = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Pipeline));
          const merged = [...loaded];
          DEFAULT_QUANTITY_PIPELINES.forEach((def) => {
            const hasMatch = loaded.some(p => {
              if (p.id === def.id) return true;
              const pName = p.name.toLowerCase();
              if (def.id === 'unclassified' && (pName.includes('unclassified') || pName.includes('pending'))) return true;
              if (def.id === 'small_order' && pName.includes('small')) return true;
              if (def.id === 'regular_order' && pName.includes('regular')) return true;
              if (def.id === 'bulk_order' && pName.includes('bulk')) return true;
              return pName === def.name.toLowerCase().trim();
            });
            if (!hasMatch) {
              merged.push(def);
            }
          });
          setPipelines(merged);
        } else {
          setPipelines(DEFAULT_QUANTITY_PIPELINES);
        }
      },
      (error) => {
        console.error('Pipeline load failed', error);
      }
    );

    return () => unsub();
  }, []);

  // Automatic Pipeline Classification when quantity changes (unless user manually changed pipeline)
  const autoClassified = useMemo(() => {
    const qty = Number(requiredQuantity);
    if (isNaN(qty) || qty <= 0) return null;
    return classifyLeadPipeline(
      { required_quantity: qty, value: Number(orderValue) || undefined },
      [],
      pipelines
    );
  }, [requiredQuantity, orderValue, pipelines]);

  useEffect(() => {
    if (autoClassified && !manualPipelineOverridden) {
      setPipelineId(autoClassified.pipeline_id);
    }
  }, [autoClassified, manualPipelineOverridden]);

  const canSave = useMemo(
    () =>
      hasPermission('create_lead') &&
      (name.trim().length > 0 || phone.trim().length > 0 || email.trim().length > 0),
    [name, phone, email, hasPermission]
  );

  const handleSave = async () => {
    if (!hasPermission('create_lead')) {
      setFeedback('Error: You do not have permission to create leads.');
      return;
    }
    setSaving(true);
    setFeedback('');

    try {
      const now = new Date();
      const currentUserName = auth?.currentUser?.displayName || auth?.currentUser?.email || 'CRM User';
      const currentUserId = auth?.currentUser?.uid || 'user';

      const initialStage = STANDARD_CRM_STAGES[0]?.id || 'new_enquiry';

      const newLeadData = {
        name: name.trim() || 'New Customer',
        company: company.trim(),
        phone: phone.trim(),
        email: email.trim(),
        location: location.trim(),
        required_quantity: requiredQuantity ? Number(requiredQuantity) || requiredQuantity : '',
        value: orderValue ? Number(orderValue) || 0 : 0,
        event_name: eventName.trim(),
        event_date: eventDate.trim(),
        delivery_date: deliveryDate.trim(),
        trophy_size: trophySize.trim(),
        sales_person: salesPerson.trim(),
        design_person: designPerson.trim(),
        source: source.trim() || 'Manual',
        platform: platform || 'manual',
        campaign: campaign.trim(),
        pipeline_id: pipelineId,
        status: initialStage,
        requirement: message.trim() || `Inquiry for ${requiredQuantity || 'custom'} trophies`,
        stage_history: [
          {
            from_stage: 'Created',
            to_stage: STANDARD_CRM_STAGES[0]?.label || 'New Enquiry',
            changed_by: currentUserId,
            changed_by_name: currentUserName,
            changed_at: now,
            note: 'Lead created manually',
            notification_triggered: false,
          },
        ],
        notification_history: [],
        notifications_sent: {},
        stageEnteredAt: serverTimestamp(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'leads'), newLeadData);

      // Record activity
      await addDoc(collection(db, 'activities'), {
        lead_id: docRef.id,
        type: 'lead.created',
        message: `Customer lead created manually in ${pipelines.find((p) => p.id === pipelineId)?.name || 'Pipeline'}.`,
        actor: currentUserId,
        created_at: serverTimestamp(),
      });

      setFeedback(`✓ Saved new lead: "${name || 'Customer'}" successfully!`);
      // Reset form
      setName('');
      setCompany('');
      setPhone('');
      setEmail('');
      setLocation('');
      setRequiredQuantity('');
      setOrderValue('');
      setEventName('');
      setEventDate('');
      setDeliveryDate('');
      setTrophySize('');
      setSalesPerson('');
      setDesignPerson('');
      setCampaign('');
      setMessage('');
      setManualPipelineOverridden(false);
    } catch (error: any) {
      console.error('Save failed:', error);
      setFeedback(error?.message || 'Failed to save lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">CRM Intake</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
              Rule 1: Auto Classification
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary-dark mt-1">Add Customer Lead</h1>
          <p className="text-secondary text-sm">
            Enter customer order requirements. Pipeline is automatically classified based on quantity.
          </p>
        </div>
      </div>

      {/* Auto Classification Alert */}
      {autoClassified && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-600 shrink-0" />
            <span>
              <strong>Auto Classification:</strong> {autoClassified.reason} ➔ Assigned to{' '}
              <strong>{autoClassified.pipeline_name}</strong>
            </span>
          </div>
          {manualPipelineOverridden && (
            <button
              type="button"
              onClick={() => {
                setManualPipelineOverridden(false);
                setPipelineId(autoClassified.pipeline_id);
              }}
              className="text-[10px] underline font-bold"
            >
              Reset to Auto
            </button>
          )}
        </div>
      )}

      <div className="neo-card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Customer Basic Info */}
          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">
              Customer Name <span className="text-rose-500">*</span>
            </label>
            <input
              className="neo-input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Karthik Raja"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">Company / Organization</label>
            <input
              className="neo-input w-full"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Rotary Club / ABC Tech"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">
              Phone Number <span className="text-rose-500">*</span>
            </label>
            <input
              className="neo-input w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">Email Address</label>
            <input
              className="neo-input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. karthik@example.com"
            />
          </div>

          {/* Order Specs & Quantity */}
          <div className="space-y-1.5">
            <label className="block font-bold text-emerald-800">
              Required Quantity (Pieces) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              className="neo-input w-full font-bold text-emerald-900 border-emerald-300"
              value={requiredQuantity}
              onChange={(e) => setRequiredQuantity(e.target.value)}
              placeholder="e.g. 50 (determines Small/Regular/Bulk pipeline)"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-emerald-800">Estimated Order Value (₹)</label>
            <input
              type="number"
              className="neo-input w-full font-bold text-emerald-900"
              value={orderValue}
              onChange={(e) => setOrderValue(e.target.value)}
              placeholder="e.g. 35000"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">Event Name</label>
            <input
              className="neo-input w-full"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. Annual Sports Meet 2026"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">Event Date</label>
            <input
              className="neo-input w-full"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              placeholder="e.g. 24 Oct 2026"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">Delivery Deadline</label>
            <input
              className="neo-input w-full"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              placeholder="e.g. 20 Oct 2026"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">Trophy Size / Specs</label>
            <input
              className="neo-input w-full"
              value={trophySize}
              onChange={(e) => setTrophySize(e.target.value)}
              placeholder="e.g. 8 inch Wooden / Metal"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">Assigned Sales Person</label>
            <input
              className="neo-input w-full"
              value={salesPerson}
              onChange={(e) => setSalesPerson(e.target.value)}
              placeholder="e.g. Monisha"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">Assigned Design Person</label>
            <input
              className="neo-input w-full"
              value={designPerson}
              onChange={(e) => setDesignPerson(e.target.value)}
              placeholder="e.g. Karthik"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">Location / Delivery City</label>
            <input
              className="neo-input w-full"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Chennai / Bangalore"
            />
          </div>

          {/* Pipeline Selector (Auto-assigned or overridden) */}
          <div className="space-y-1.5">
            <label className="block font-bold text-primary-dark">
              Target Pipeline {autoClassified && <span className="text-emerald-600 font-normal">(Auto-Selected)</span>}
            </label>
            <select
              className="neo-input w-full font-bold text-primary-dark"
              value={pipelineId}
              onChange={(e) => {
                setPipelineId(e.target.value);
                setManualPipelineOverridden(true);
              }}
            >
              {pipelines.map((pipe) => (
                <option key={pipe.id} value={pipe.id}>
                  {pipe.name} ({pipe.scenario || 'General'})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5 text-xs">
          <label className="block font-bold text-primary-dark">Initial Requirement Notes / Message</label>
          <textarea
            className="neo-input w-full min-h-[80px]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Customer requested customized wooden award trophies with gold engraving."
          />
        </div>

        {feedback && (
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary-dark font-semibold">
            {feedback}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-shadow-darker/10">
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={handleSave}
            className="neo-btn-primary text-xs px-6 py-2.5 font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            Create Customer Lead
          </button>
        </div>
      </div>
    </div>
  );
}

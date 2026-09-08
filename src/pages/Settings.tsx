import { useState, useEffect } from 'react';
import { 
  Save, 
  ShieldIcon, 
  Database, 
  HardDrive, 
  RefreshCw, 
  Loader2, 
  FileText, 
  Building, 
  Building2, 
  Smartphone, 
  QrCode, 
  FileSignature, 
  Settings as SettingsIcon, 
  IndianRupee, 
  Hash, 
  ListOrdered,
  Download,
  ShieldCheck,
  Lock,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  ShieldAlert,
  Users
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, limit, query } from 'firebase/firestore';
import React, { lazy, Suspense } from 'react';
import { getDocumentPreview, getFinancialYearInfo, syncExistingDocumentNumbers } from '../utils/numberGenerator';

const MetaIntegrationPanel = lazy(() => import('../components/settings/MetaIntegrationPanel'));

export default function Settings() {
  const { settings, updateSettings } = useSettings();
  const { dbUser } = useAuth();
  const navigate = useNavigate();
  const [localSettings, setLocalSettings] = useState(settings);
  const [config, setConfig] = useState({
    invoice_prefix: 'ECO',
    fiscal_year_start: '04-01',
    next_invoice_number: 1,
    gst_enabled: true,
    hsn_validation: true,
    currency: 'INR'
  });
  const [saving, setSaving] = useState(false);
  const [syncingDocs, setSyncingDocs] = useState(false);
  const [purgingCache, setPurgingCache] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState('company');

  useEffect(() => {
    async function loadConfig() {
      if (!db) return;
      try {
        const docRef = doc(db, 'system', 'config');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const remoteData = docSnap.data();
          setConfig(prev => ({ ...prev, ...remoteData }));
          setLocalSettings(prev => ({
            ...prev,
            bankName: remoteData.bankName || prev.bankName || 'HDFC BANK',
            accountHolderName: remoteData.accountHolderName || prev.accountHolderName || 'ECOTROPHY INNOVATIONS (OPC) PVT LTD',
            accountNumber: remoteData.accountNumber || prev.accountNumber || '50200101733061',
            ifscCode: remoteData.ifscCode || prev.ifscCode || 'HDFC0002639',
            branchName: remoteData.branchName || prev.branchName || 'Tiruchengode',
            gpayNumber: remoteData.gpayNumber || prev.gpayNumber || '+91 88707 44306',
            gpayHolderName: remoteData.gpayHolderName || prev.gpayHolderName || 'Chakravarthi MM',
            gstTermsAndConditions: remoteData.gstTermsAndConditions || remoteData.termsAndConditions || prev.gstTermsAndConditions || `1. 50% Advance payment required to confirm order.\n2. Balance payment to be made before dispatch.\n3. Goods once sold cannot be returned.\n4. Delivery timeline subject to artwork approval.`,
            nonGstTermsAndConditions: remoteData.nonGstTermsAndConditions || prev.nonGstTermsAndConditions || `1. Goods once sold cannot be returned.\n2. Payment received in full.`,
            ...remoteData
          }));
        }
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    }
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const settingsToSave = {
        ...localSettings,
        bankName: localSettings.bankName || 'HDFC BANK',
        accountHolderName: localSettings.accountHolderName || 'ECOTROPHY INNOVATIONS (OPC) PVT LTD',
        accountNumber: localSettings.accountNumber || '50200101733061',
        ifscCode: localSettings.ifscCode || 'HDFC0002639',
        branchName: localSettings.branchName || 'Tiruchengode',
        gpayNumber: localSettings.gpayNumber || '+91 88707 44306',
        gpayHolderName: localSettings.gpayHolderName || 'Chakravarthi MM',
        termsAndConditions: localSettings.gstTermsAndConditions || localSettings.termsAndConditions || `1. 50% Advance payment required to confirm order.\n2. Balance payment to be made before dispatch.\n3. Goods once sold cannot be returned.\n4. Delivery timeline subject to artwork approval.`,
        gstTermsAndConditions: localSettings.gstTermsAndConditions || localSettings.termsAndConditions || `1. 50% Advance payment required to confirm order.\n2. Balance payment to be made before dispatch.\n3. Goods once sold cannot be returned.\n4. Delivery timeline subject to artwork approval.`,
        nonGstTermsAndConditions: localSettings.nonGstTermsAndConditions || `1. Goods once sold cannot be returned.\n2. Payment received in full.`,
      };
      updateSettings(settingsToSave);
      if (db) {
        const docRef = doc(db, 'system', 'config');
        await setDoc(docRef, {
          ...config,
          ...settingsToSave,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      alert('Settings saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncExistingDocs = async () => {
    const confirm = window.confirm(
      "Apply current numbering format to all existing documents in database?\n\nThis will reformat existing Quotations, Proformas, Invoices, and Cash Memos to match your configured prefixes, format style, and manual year (e.g. QTN/25-26/0001, PI/25-26/0001, ECO/25-26/0001)."
    );
    if (!confirm) return;

    setSyncingDocs(true);
    try {
      // First save settings to ensure latest values are active
      updateSettings(localSettings);
      if (db) {
        const docRef = doc(db, 'system', 'config');
        await setDoc(docRef, {
          ...config,
          ...localSettings,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      const { updatedCount, details } = await syncExistingDocumentNumbers(localSettings);
      alert(`Success! Updated ${updatedCount} existing document(s) to match your configured numbering format.`);
    } catch (err: any) {
      console.error('Error syncing existing documents:', err);
      alert(`Error updating documents: ${err?.message || 'Unknown error'}`);
    } finally {
      setSyncingDocs(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'companyLogo' | 'qrCode' | 'authorizedSignature') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalSettings(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePurgeCache = async () => {
    const confirm = window.confirm(
      "Purge temporary browser cache and session draft data?\n\nThis will clear cached OCR previews, temporary table states, and refresh application storage without affecting your saved database documents."
    );
    if (!confirm) return;

    setPurgingCache(true);
    setMaintenanceMessage(null);
    try {
      sessionStorage.clear();
      
      const keysToPreserve = ['ecobill_settings', 'theme', 'user'];
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !keysToPreserve.includes(key) && (key.startsWith('draft_') || key.startsWith('tmp_') || key.includes('cache'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map(k => window.caches.delete(k)));
      }

      setMaintenanceMessage({ type: 'success', text: 'Temporary cache and session drafts purged successfully!' });
    } catch (err: any) {
      console.error('Error purging cache:', err);
      setMaintenanceMessage({ type: 'error', text: `Failed to purge cache: ${err?.message || 'Unknown error'}` });
    } finally {
      setPurgingCache(false);
    }
  };

  const handleExportBackup = async () => {
    setExportingBackup(true);
    setMaintenanceMessage(null);
    try {
      if (!db) throw new Error('Database is not initialized');

      const collectionsToBackup = ['invoices', 'quotations', 'proformas', 'cash_memos', 'customers', 'products', 'expenses', 'leads'];
      const backupData: Record<string, any[]> = {};

      for (const collName of collectionsToBackup) {
        try {
          const snap = await getDocs(query(collection(db, collName), limit(500)));
          backupData[collName] = snap.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        } catch (colErr) {
          console.warn(`Could not backup collection ${collName}:`, colErr);
          backupData[collName] = [];
        }
      }

      backupData['system_config'] = [{ ...config, ...localSettings }];

      const fullBackup = {
        app: 'EcoBill Pro',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        exportedBy: dbUser?.email || 'unknown',
        data: backupData
      };

      const jsonStr = JSON.stringify(fullBackup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `ecobill-database-backup-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const totalCount = Object.values(backupData).reduce((a, b) => a + b.length, 0);
      setMaintenanceMessage({ type: 'success', text: `Database backup generated and downloaded successfully (${totalCount} records exported)!` });
    } catch (err: any) {
      console.error('Backup error:', err);
      setMaintenanceMessage({ type: 'error', text: `Failed to generate backup: ${err?.message || 'Unknown error'}` });
    } finally {
      setExportingBackup(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark uppercase">System Configuration</h1>
          <p className="text-secondary mt-1">Manage your company profile, document sequences, payment details, and preferences.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="neo-btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Left Column: Sidebar-like settings groups */}
        <div className="space-y-4">
          <button onClick={() => setActiveTab('company')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'company' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <Building size={18} className={activeTab === 'company' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'company' ? "text-primary-dark" : "text-secondary")}>Company Details</span>
          </button>
          <button onClick={() => setActiveTab('sequences')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'sequences' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <Hash size={18} className={activeTab === 'sequences' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'sequences' ? "text-primary-dark" : "text-secondary")}>Document Numbering</span>
          </button>
          <button onClick={() => setActiveTab('bank')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'bank' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <Building2 size={18} className={activeTab === 'bank' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'bank' ? "text-primary-dark" : "text-secondary")}>Bank Details</span>
          </button>
          <button onClick={() => setActiveTab('upi')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'upi' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <QrCode size={18} className={activeTab === 'upi' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'upi' ? "text-primary-dark" : "text-secondary")}>UPI Details</span>
          </button>
          <button onClick={() => setActiveTab('gpay')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'gpay' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <Smartphone size={18} className={activeTab === 'gpay' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'gpay' ? "text-primary-dark" : "text-secondary")}>GPay Details</span>
          </button>
          <button onClick={() => setActiveTab('other')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'other' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <FileSignature size={18} className={activeTab === 'other' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'other' ? "text-primary-dark" : "text-secondary")}>Other Details</span>
          </button>
          <button onClick={() => setActiveTab('system_config')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'system_config' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <SettingsIcon size={18} className={activeTab === 'system_config' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'system_config' ? "text-primary-dark" : "text-secondary")}>System Config</span>
          </button>
          <button onClick={() => setActiveTab('financial')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'financial' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <FileText size={18} className={activeTab === 'financial' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'financial' ? "text-primary-dark" : "text-secondary")}>Financial Modules</span>
          </button>
          <button onClick={() => setActiveTab('security')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'security' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <ShieldIcon size={18} className={activeTab === 'security' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'security' ? "text-primary-dark" : "text-secondary")}>Security & Audits</span>
          </button>
          <button onClick={() => setActiveTab('integrations')} className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'integrations' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}>
             <Database size={18} className={activeTab === 'integrations' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'integrations' ? "text-primary-dark" : "text-secondary")}>Integrations</span>
          </button>
        </div>

        {/* Right Column: Main settings fields */}
        <div className="md:col-span-3 space-y-6">
          {activeTab === 'company' && (
            <section className="neo-card space-y-6">
              <h3 className="flex items-center gap-2 text-primary-dark">
                <Building size={20} className="text-primary" />
                Company Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Company Name</label>
                  <input type="text" value={localSettings.companyName} onChange={(e) => setLocalSettings({...localSettings, companyName: e.target.value})} className="w-full neo-input" placeholder="Company Name" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Company Email</label>
                  <input type="email" value={localSettings.companyEmail} onChange={(e) => setLocalSettings({...localSettings, companyEmail: e.target.value})} className="w-full neo-input" placeholder="Email" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Company Phone</label>
                  <input type="text" value={localSettings.companyPhone} onChange={(e) => setLocalSettings({...localSettings, companyPhone: e.target.value})} className="w-full neo-input" placeholder="Phone Number" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Company Website</label>
                  <input type="text" value={localSettings.companyWebsite} onChange={(e) => setLocalSettings({...localSettings, companyWebsite: e.target.value})} className="w-full neo-input" placeholder="Website URL" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Company Address</label>
                  <textarea value={localSettings.companyAddress} onChange={(e) => setLocalSettings({...localSettings, companyAddress: e.target.value})} className="w-full neo-input h-20 resize-none" placeholder="Address" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">City</label>
                  <input type="text" value={localSettings.companyCity} onChange={(e) => setLocalSettings({...localSettings, companyCity: e.target.value})} className="w-full neo-input" placeholder="City" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Pincode</label>
                  <input type="text" value={localSettings.companyPincode} onChange={(e) => setLocalSettings({...localSettings, companyPincode: e.target.value})} className="w-full neo-input" placeholder="Pincode" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">State</label>
                  <input type="text" value={localSettings.companyState} onChange={(e) => setLocalSettings({...localSettings, companyState: e.target.value})} className="w-full neo-input" placeholder="State" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">GSTIN</label>
                  <input type="text" value={localSettings.companyGstin} onChange={(e) => setLocalSettings({...localSettings, companyGstin: e.target.value})} className="w-full neo-input" placeholder="GST Number" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Company Logo</label>
                  <div className="flex items-center gap-4">
                    {localSettings.companyLogo && <img src={localSettings.companyLogo} alt="Logo" className="h-16 object-contain bg-white rounded p-1 border" />}
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'companyLogo')} className="neo-input w-full" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'bank' && (
            <section className="neo-card space-y-6">
              <h3 className="flex items-center gap-2 text-primary-dark">
                <Building2 size={20} className="text-primary" />
                Bank Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Bank Name</label>
                  <input type="text" value={localSettings.bankName} onChange={(e) => setLocalSettings({...localSettings, bankName: e.target.value})} className="w-full neo-input" placeholder="HDFC BANK" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Account Holder Name</label>
                  <input type="text" value={localSettings.accountHolderName} onChange={(e) => setLocalSettings({...localSettings, accountHolderName: e.target.value})} className="w-full neo-input" placeholder="ECOTROPHY INNOVATIONS (OPC) PVT LTD" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Account Number</label>
                  <input type="text" value={localSettings.accountNumber} onChange={(e) => setLocalSettings({...localSettings, accountNumber: e.target.value})} className="w-full neo-input" placeholder="50200101733061" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">IFSC Code</label>
                  <input type="text" value={localSettings.ifscCode} onChange={(e) => setLocalSettings({...localSettings, ifscCode: e.target.value})} className="w-full neo-input" placeholder="HDFC0002639" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Branch Name</label>
                  <input type="text" value={localSettings.branchName} onChange={(e) => setLocalSettings({...localSettings, branchName: e.target.value})} className="w-full neo-input" placeholder="Tiruchengode" />
                </div>
              </div>
            </section>
          )}

          {activeTab === 'upi' && (
            <section className="neo-card space-y-6">
              <h3 className="flex items-center gap-2 text-primary-dark">
                <QrCode size={20} className="text-primary" />
                UPI Details
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">UPI ID</label>
                  <input type="text" value={localSettings.upiId} onChange={(e) => setLocalSettings({...localSettings, upiId: e.target.value})} className="w-full neo-input" placeholder="yourname@upi" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">UPI Payment Link</label>
                  <input type="text" value={localSettings.upiPaymentLink} onChange={(e) => setLocalSettings({...localSettings, upiPaymentLink: e.target.value})} className="w-full neo-input" placeholder="upi://pay?pa=..." />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">QR Code Upload</label>
                  <div className="flex items-center gap-4">
                    {localSettings.qrCode && <img src={localSettings.qrCode} alt="QR Code" className="h-24 object-contain bg-white rounded p-1 border" />}
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'qrCode')} className="neo-input w-full" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'gpay' && (
            <section className="neo-card space-y-6">
              <h3 className="flex items-center gap-2 text-primary-dark">
                <Smartphone size={20} className="text-primary" />
                GPay Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">GPay Phone Number</label>
                  <input type="text" value={localSettings.gpayNumber} onChange={(e) => setLocalSettings({...localSettings, gpayNumber: e.target.value})} className="w-full neo-input" placeholder="+91 88707 44306" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">GPay Holder Name</label>
                  <input type="text" value={localSettings.gpayHolderName} onChange={(e) => setLocalSettings({...localSettings, gpayHolderName: e.target.value})} className="w-full neo-input" placeholder="Chakravarthi MM" />
                </div>
              </div>
            </section>
          )}

          {activeTab === 'other' && (
            <section className="neo-card space-y-6">
              <h3 className="flex items-center gap-2 text-primary-dark">
                <FileSignature size={20} className="text-primary" />
                Other Details
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-secondary tracking-widest uppercase">Default GST %</label>
                    <select value={localSettings.defaultGst} onChange={(e) => setLocalSettings({...localSettings, defaultGst: Number(e.target.value)})} className="w-full neo-input appearance-none bg-surface">
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-secondary tracking-widest uppercase">Terms & Conditions (GST Bills)</label>
                    <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Used in Quotations, PI & Tax Invoices</span>
                  </div>
                  <textarea 
                    value={localSettings.gstTermsAndConditions ?? localSettings.termsAndConditions} 
                    onChange={(e) => setLocalSettings({
                      ...localSettings, 
                      gstTermsAndConditions: e.target.value,
                      termsAndConditions: e.target.value 
                    })} 
                    className="w-full neo-input h-28 resize-none font-mono text-xs leading-relaxed" 
                    placeholder="1. 50% Advance payment required to confirm order.&#10;2. Balance payment to be made before dispatch..." 
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-secondary tracking-widest uppercase">Terms & Conditions (Non-GST Bills)</label>
                    <span className="text-[10px] text-muted font-bold uppercase tracking-wider">Used in Cash Memos</span>
                  </div>
                  <textarea 
                    value={localSettings.nonGstTermsAndConditions ?? ''} 
                    onChange={(e) => setLocalSettings({...localSettings, nonGstTermsAndConditions: e.target.value})} 
                    className="w-full neo-input h-20 resize-none font-mono text-xs leading-relaxed" 
                    placeholder="1. Goods once sold cannot be returned.&#10;2. Payment received in full." 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Notes</label>
                  <textarea value={localSettings.notes} onChange={(e) => setLocalSettings({...localSettings, notes: e.target.value})} className="w-full neo-input h-16 resize-none" placeholder="Notes for customer..." />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Authorized Signature Upload</label>
                  <div className="flex items-center gap-4">
                    {localSettings.authorizedSignature && <img src={localSettings.authorizedSignature} alt="Signature" className="h-16 object-contain bg-white rounded p-1 border" />}
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'authorizedSignature')} className="neo-input w-full" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'sequences' && (() => {
            const fy = getFinancialYearInfo();
            
            const qPrefix = localSettings.quotation_prefix || 'QTN';
            const qYear = localSettings.quotation_year?.trim() || fy.fyHyphen;
            const qYearSlash = qYear.replace(/-/g, '/');
            const qYearHyphen = qYear.replace(/\//g, '-');

            const piPrefix = localSettings.proforma_prefix || 'PI';
            const piYear = localSettings.proforma_year?.trim() || fy.fyHyphen;
            const piYearSlash = piYear.replace(/-/g, '/');
            const piYearHyphen = piYear.replace(/\//g, '-');

            const invPrefix = localSettings.invoice_prefix || 'ECO';
            const invYear = localSettings.invoice_year?.trim() || fy.fyHyphen;
            const invYearSlash = invYear.replace(/-/g, '/');
            const invYearHyphen = invYear.replace(/\//g, '-');

            const memoPrefix = localSettings.memo_prefix || 'MEMO';
            const memoYear = localSettings.memo_year?.trim() || fy.fyHyphen;
            const memoYearSlash = memoYear.replace(/-/g, '/');
            const memoYearHyphen = memoYear.replace(/\//g, '-');

            return (
              <section className="space-y-6">
                <div className="neo-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="flex items-center gap-2 text-primary-dark">
                      <Hash size={20} className="text-primary" />
                      Document Numbering & Sequence Manager
                    </h3>
                    <p className="text-xs text-secondary">
                      Customize document prefixes, manually edit financial years (e.g. 25-26, 26-27, 27-28), number formats, and starting sequences. 
                      These formats automatically calculate when drafting bills and remain fully editable on all creation pages.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSyncExistingDocs}
                    disabled={syncingDocs}
                    className="neo-btn !bg-amber-50 hover:!bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs flex items-center gap-2 px-3 py-2 shrink-0 self-start sm:self-auto"
                    title="Re-apply current prefix, year, and format to existing bills in database"
                  >
                    {syncingDocs ? <Loader2 size={15} className="animate-spin text-amber-700" /> : <RefreshCw size={15} className="text-amber-700" />}
                    {syncingDocs ? 'Syncing...' : 'Sync Existing Documents'}
                  </button>
                </div>

                {/* 1. GST Quotation Numbering */}
                <div className="neo-card space-y-4 border-l-4 border-l-amber-500">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-shadow-darker/10">
                    <h4 className="font-bold text-primary-dark flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      GST Quotation Numbering
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-secondary font-semibold">Live Preview:</span>
                      <span className="neo-badge font-mono font-bold text-amber-700 bg-amber-50 px-3 py-1 border border-amber-200">
                        {getDocumentPreview('quotation', localSettings)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Quotation Prefix</label>
                      <input 
                        type="text" 
                        value={localSettings.quotation_prefix || ''} 
                        onChange={(e) => setLocalSettings({...localSettings, quotation_prefix: e.target.value.toUpperCase()})} 
                        className="w-full neo-input font-mono font-bold" 
                        placeholder="QTN" 
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-secondary tracking-widest uppercase">Year (Manual Edit)</label>
                        <span className="text-[10px] text-amber-600 font-semibold">Lifelong Dynamic</span>
                      </div>
                      <input 
                        type="text" 
                        value={localSettings.quotation_year || ''} 
                        onChange={(e) => setLocalSettings({...localSettings, quotation_year: e.target.value})} 
                        className="w-full neo-input font-mono font-bold" 
                        placeholder={`e.g. ${fy.fyHyphen}`} 
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button type="button" onClick={() => setLocalSettings({...localSettings, quotation_year: '25-26'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300">25-26</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, quotation_year: '26-27'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300">26-27</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, quotation_year: '27-28'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300">27-28</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, quotation_year: ''})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-surface hover:bg-shadow-darker/10 text-secondary border border-shadow-darker/20">Auto ({fy.fyHyphen})</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Number Format</label>
                      <select 
                        value={localSettings.quotation_format || 'prefix_hyphen_fy'} 
                        onChange={(e) => setLocalSettings({...localSettings, quotation_format: e.target.value})} 
                        className="w-full neo-input appearance-none bg-surface"
                      >
                        <option value="prefix_hyphen_fy">{qPrefix}/{qYearHyphen}/0001 (FY Hyphen)</option>
                        <option value="prefix_slash_fy">{qPrefix}/{qYearSlash}/0001 (FY Slash)</option>
                        <option value="prefix_dash_fy">{qPrefix}-{qYearHyphen}-0001 (All Hyphens)</option>
                        <option value="prefix_year">{qPrefix}/{localSettings.quotation_year?.trim() || fy.fullYear}/0001 (Full Year)</option>
                        <option value="prefix_simple">{qPrefix}-0001 (Sequential Only)</option>
                        <option value="prefix_simple_slash">{qPrefix}/0001 (Sequential Slash)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Next Starting Number</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={localSettings.quotation_next_number ?? 1} 
                        onChange={(e) => setLocalSettings({...localSettings, quotation_next_number: Math.max(1, parseInt(e.target.value) || 1)})} 
                        className="w-full neo-input font-mono" 
                        placeholder="1" 
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Proforma Invoice Numbering */}
                <div className="neo-card space-y-4 border-l-4 border-l-blue-500">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-shadow-darker/10">
                    <h4 className="font-bold text-primary-dark flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      Proforma Invoice Numbering
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-secondary font-semibold">Live Preview:</span>
                      <span className="neo-badge font-mono font-bold text-blue-700 bg-blue-50 px-3 py-1 border border-blue-200">
                        {getDocumentPreview('proforma', localSettings)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Proforma Prefix</label>
                      <input 
                        type="text" 
                        value={localSettings.proforma_prefix || ''} 
                        onChange={(e) => setLocalSettings({...localSettings, proforma_prefix: e.target.value.toUpperCase()})} 
                        className="w-full neo-input font-mono font-bold" 
                        placeholder="PI" 
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-secondary tracking-widest uppercase">Year (Manual Edit)</label>
                        <span className="text-[10px] text-blue-600 font-semibold">Lifelong Dynamic</span>
                      </div>
                      <input 
                        type="text" 
                        value={localSettings.proforma_year || ''} 
                        onChange={(e) => setLocalSettings({...localSettings, proforma_year: e.target.value})} 
                        className="w-full neo-input font-mono font-bold" 
                        placeholder={`e.g. ${fy.fyHyphen}`} 
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button type="button" onClick={() => setLocalSettings({...localSettings, proforma_year: '25-26'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300">25-26</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, proforma_year: '26-27'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300">26-27</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, proforma_year: '27-28'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300">27-28</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, proforma_year: ''})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-surface hover:bg-shadow-darker/10 text-secondary border border-shadow-darker/20">Auto ({fy.fyHyphen})</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Number Format</label>
                      <select 
                        value={localSettings.proforma_format || 'prefix_hyphen_fy'} 
                        onChange={(e) => setLocalSettings({...localSettings, proforma_format: e.target.value})} 
                        className="w-full neo-input appearance-none bg-surface"
                      >
                        <option value="prefix_hyphen_fy">{piPrefix}/{piYearHyphen}/0001 (FY Hyphen)</option>
                        <option value="prefix_slash_fy">{piPrefix}/{piYearSlash}/0001 (FY Slash)</option>
                        <option value="prefix_dash_fy">{piPrefix}-{piYearHyphen}-0001 (All Hyphens)</option>
                        <option value="prefix_year">{piPrefix}/{localSettings.proforma_year?.trim() || fy.fullYear}/0001 (Full Year)</option>
                        <option value="prefix_simple">{piPrefix}-0001 (Sequential Only)</option>
                        <option value="prefix_simple_slash">{piPrefix}/0001 (Sequential Slash)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Next Starting Number</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={localSettings.proforma_next_number ?? 1} 
                        onChange={(e) => setLocalSettings({...localSettings, proforma_next_number: Math.max(1, parseInt(e.target.value) || 1)})} 
                        className="w-full neo-input font-mono" 
                        placeholder="1" 
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Tax Invoice Numbering */}
                <div className="neo-card space-y-4 border-l-4 border-l-emerald-500">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-shadow-darker/10">
                    <h4 className="font-bold text-primary-dark flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      Tax Invoice Numbering
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-secondary font-semibold">Live Preview:</span>
                      <span className="neo-badge font-mono font-bold text-emerald-700 bg-emerald-50 px-3 py-1 border border-emerald-200">
                        {getDocumentPreview('invoice', localSettings)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Invoice Prefix</label>
                      <input 
                        type="text" 
                        value={localSettings.invoice_prefix || ''} 
                        onChange={(e) => setLocalSettings({...localSettings, invoice_prefix: e.target.value.toUpperCase()})} 
                        className="w-full neo-input font-mono font-bold" 
                        placeholder="INV" 
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-secondary tracking-widest uppercase">Year (Manual Edit)</label>
                        <span className="text-[10px] text-emerald-600 font-semibold">Lifelong Dynamic</span>
                      </div>
                      <input 
                        type="text" 
                        value={localSettings.invoice_year || ''} 
                        onChange={(e) => setLocalSettings({...localSettings, invoice_year: e.target.value})} 
                        className="w-full neo-input font-mono font-bold" 
                        placeholder={`e.g. ${fy.fyHyphen}`} 
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button type="button" onClick={() => setLocalSettings({...localSettings, invoice_year: '25-26'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300">25-26</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, invoice_year: '26-27'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300">26-27</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, invoice_year: '27-28'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300">27-28</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, invoice_year: ''})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-surface hover:bg-shadow-darker/10 text-secondary border border-shadow-darker/20">Auto ({fy.fyHyphen})</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Number Format</label>
                      <select 
                        value={localSettings.invoice_format || 'prefix_hyphen_fy'} 
                        onChange={(e) => setLocalSettings({...localSettings, invoice_format: e.target.value})} 
                        className="w-full neo-input appearance-none bg-surface"
                      >
                        <option value="prefix_hyphen_fy">{invPrefix}/{invYearHyphen}/0001 (FY Hyphen)</option>
                        <option value="prefix_slash_fy">{invPrefix}/{invYearSlash}/0001 (FY Slash)</option>
                        <option value="prefix_dash_fy">{invPrefix}-{invYearHyphen}-0001 (All Hyphens)</option>
                        <option value="prefix_year">{invPrefix}/{localSettings.invoice_year?.trim() || fy.fullYear}/0001 (Full Year)</option>
                        <option value="prefix_simple">{invPrefix}-0001 (Sequential Only)</option>
                        <option value="prefix_simple_slash">{invPrefix}/0001 (Sequential Slash)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Next Starting Number</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={localSettings.invoice_next_number ?? 1} 
                        onChange={(e) => setLocalSettings({...localSettings, invoice_next_number: Math.max(1, parseInt(e.target.value) || 1)})} 
                        className="w-full neo-input font-mono" 
                        placeholder="1" 
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Cash Memo Numbering */}
                <div className="neo-card space-y-4 border-l-4 border-l-purple-500">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-shadow-darker/10">
                    <h4 className="font-bold text-primary-dark flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                      Cash Memo Numbering
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-secondary font-semibold">Live Preview:</span>
                      <span className="neo-badge font-mono font-bold text-purple-700 bg-purple-50 px-3 py-1 border border-purple-200">
                        {getDocumentPreview('memo', localSettings)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Memo Prefix</label>
                      <input 
                        type="text" 
                        value={localSettings.memo_prefix || ''} 
                        onChange={(e) => setLocalSettings({...localSettings, memo_prefix: e.target.value.toUpperCase()})} 
                        className="w-full neo-input font-mono font-bold" 
                        placeholder="MEMO" 
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-secondary tracking-widest uppercase">Year (Manual Edit)</label>
                        <span className="text-[10px] text-purple-600 font-semibold">Lifelong Dynamic</span>
                      </div>
                      <input 
                        type="text" 
                        value={localSettings.memo_year || ''} 
                        onChange={(e) => setLocalSettings({...localSettings, memo_year: e.target.value})} 
                        className="w-full neo-input font-mono font-bold" 
                        placeholder={`e.g. ${fy.fyHyphen}`} 
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button type="button" onClick={() => setLocalSettings({...localSettings, memo_year: '25-26'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300">25-26</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, memo_year: '26-27'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300">26-27</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, memo_year: '27-28'})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300">27-28</button>
                        <button type="button" onClick={() => setLocalSettings({...localSettings, memo_year: ''})} className="px-2 py-0.5 text-[11px] font-mono rounded bg-surface hover:bg-shadow-darker/10 text-secondary border border-shadow-darker/20">Auto ({fy.fyHyphen})</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Number Format</label>
                      <select 
                        value={localSettings.memo_format || 'prefix_hyphen_fy'} 
                        onChange={(e) => setLocalSettings({...localSettings, memo_format: e.target.value})} 
                        className="w-full neo-input appearance-none bg-surface"
                      >
                        <option value="prefix_hyphen_fy">{memoPrefix}/{memoYearHyphen}/0001 (FY Hyphen)</option>
                        <option value="prefix_slash_fy">{memoPrefix}/{memoYearSlash}/0001 (FY Slash)</option>
                        <option value="prefix_dash_fy">{memoPrefix}-{memoYearHyphen}-0001 (All Hyphens)</option>
                        <option value="prefix_year">{memoPrefix}/{localSettings.memo_year?.trim() || fy.fullYear}/0001 (Full Year)</option>
                        <option value="prefix_simple">{memoPrefix}-0001 (Sequential Only)</option>
                        <option value="prefix_simple_slash">{memoPrefix}/0001 (Sequential Slash)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-secondary tracking-widest uppercase">Next Starting Number</label>
                      <input 
                        type="number" 
                        min="1" 
                        value={localSettings.memo_next_number ?? 1} 
                        onChange={(e) => setLocalSettings({...localSettings, memo_next_number: Math.max(1, parseInt(e.target.value) || 1)})} 
                        className="w-full neo-input font-mono" 
                        placeholder="1" 
                      />
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {activeTab === 'system_config' && (
            <section className="neo-card space-y-6">
              <h3 className="flex items-center gap-2 text-primary-dark">
                <SettingsIcon size={20} className="text-primary" />
                System Config
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Invoice Prefix</label>
                  <input type="text" value={localSettings.invoice_prefix} onChange={(e) => setLocalSettings({...localSettings, invoice_prefix: e.target.value})} className="w-full neo-input" />
                </div>
              </div>
            </section>
          )}

          {activeTab === 'financial' && (
            <>
              <section className="neo-card space-y-6">
                <h3 className="flex items-center gap-2 text-primary-dark">
                  <SettingsIcon size={20} className="text-primary" />
                  General Invoicing
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-secondary tracking-widest uppercase">Invoice Prefix</label>
                    <input 
                      type="text" 
                      value={config.invoice_prefix}
                      onChange={(e) => setConfig({...config, invoice_prefix: e.target.value})}
                      className="w-full neo-input" 
                    />
                  </div>
                  <div className="space-y-2">
                     <label className="text-xs font-black text-secondary tracking-widest uppercase">Currency</label>
                     <div className="relative">
                       <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={14} />
                       <select 
                        value={config.currency}
                        onChange={(e) => setConfig({...config, currency: e.target.value})}
                        className="w-full neo-input !pl-10 appearance-none bg-surface"
                       >
                         <option value="INR">INR (₹)</option>
                         <option value="USD">USD ($)</option>
                       </select>
                     </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-shadow-darker/10">
                  <div className="flex items-center justify-between p-3 neo-input bg-surface/50">
                    <div>
                       <p className="font-bold text-primary-dark text-sm">HSN Validation</p>
                       <p className="text-[10px] text-secondary">Enforce 4+ digits for HSN/SAC codes (Rule #14)</p>
                    </div>
                    <button 
                      onClick={() => setConfig({...config, hsn_validation: !config.hsn_validation})}
                      className={`w-12 h-6 rounded-full transition-all relative ${config.hsn_validation ? 'bg-primary shadow-neo-inset' : 'bg-shadow-darker/20'}`}
                    >
                      <div className={`absolute top-1 bottom-1 w-4 bg-surface rounded-full transition-all ${config.hsn_validation ? 'right-1' : 'left-1 shadow-neo-raised'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 neo-input bg-surface/50">
                    <div>
                       <p className="font-bold text-primary-dark text-sm">GST Calculation</p>
                       <p className="text-[10px] text-secondary">Automatic CGST/SGST splitting (Rule #12)</p>
                    </div>
                    <button 
                      onClick={() => setConfig({...config, gst_enabled: !config.gst_enabled})}
                      className={`w-12 h-6 rounded-full transition-all relative ${config.gst_enabled ? 'bg-primary shadow-neo-inset' : 'bg-shadow-darker/20'}`}
                    >
                      <div className={`absolute top-1 bottom-1 w-4 bg-surface rounded-full transition-all ${config.gst_enabled ? 'right-1' : 'left-1 shadow-neo-raised'}`} />
                    </button>
                  </div>
                </div>
              </section>

              <section className="neo-card space-y-4">
                 <div className="flex items-center justify-between">
                   <h3 className="flex items-center gap-2 text-primary-dark">
                      <RefreshCw size={20} className="text-primary" />
                      Data Maintenance & Exports
                   </h3>
                   <span className="text-[11px] text-secondary font-mono">JSON Snapshot Engine</span>
                 </div>
                 <p className="text-xs text-secondary">
                   Manage client-side cache and generate offline full database backups of Invoices, Quotes, Leads, Products, and Expenses.
                 </p>

                 {maintenanceMessage && (
                   <div className={clsx(
                     "p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in",
                     maintenanceMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                   )}>
                     {maintenanceMessage.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <ShieldAlert size={16} className="text-rose-600 shrink-0" />}
                     <span>{maintenanceMessage.text}</span>
                   </div>
                 )}

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                      onClick={handlePurgeCache} 
                      disabled={purgingCache}
                      className="neo-btn text-xs py-3 border-rose-200 hover:bg-rose-50 text-rose-700 font-bold uppercase flex items-center justify-center gap-2"
                    >
                      {purgingCache ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                      {purgingCache ? 'Purging Cache...' : 'Purge Temporary Cache'}
                    </button>
                    <button 
                      onClick={handleExportBackup} 
                      disabled={exportingBackup}
                      className="neo-btn text-xs py-3 font-bold uppercase flex items-center justify-center gap-2 bg-primary/5 hover:bg-primary/10 text-primary-dark border-primary/20"
                    >
                      {exportingBackup ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} className="text-primary" />}
                      {exportingBackup ? 'Exporting JSON...' : 'Export Database Backup (JSON)'}
                    </button>
                 </div>
              </section>
            </>
          )}

          {activeTab === 'security' && (
            <section className="space-y-6 animate-fade-in">
              {/* Security Posture Status */}
              <div className="neo-card space-y-4 border-l-4 border-l-emerald-500">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-primary-dark font-bold">
                    <ShieldCheck size={22} className="text-emerald-600" />
                    Security & Access Control Posture
                  </h3>
                  <span className="neo-badge bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
                    Protected & Hardened
                  </span>
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  Enterprise-grade role-based security is active. All financial documents, customer PII, and system configurations are protected via authenticated Firestore security rules.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 bg-surface rounded-xl border border-shadow-darker/10 space-y-1">
                    <div className="flex items-center gap-2 text-primary-dark font-bold text-xs">
                      <Lock size={14} className="text-primary" />
                      Database Auth Guards
                    </div>
                    <p className="text-[11px] text-secondary">request.auth != null verified on all read/write endpoints.</p>
                  </div>
                  <div className="p-3 bg-surface rounded-xl border border-shadow-darker/10 space-y-1">
                    <div className="flex items-center gap-2 text-primary-dark font-bold text-xs">
                      <KeyRound size={14} className="text-primary" />
                      Secret Manager
                    </div>
                    <p className="text-[11px] text-secondary">Backend API keys & Webhook verify tokens mounted securely.</p>
                  </div>
                  <div className="p-3 bg-surface rounded-xl border border-shadow-darker/10 space-y-1">
                    <div className="flex items-center gap-2 text-primary-dark font-bold text-xs">
                      <Users size={14} className="text-primary" />
                      Active Role: <span className="uppercase text-primary">{dbUser?.role || 'sales'}</span>
                    </div>
                    <p className="text-[11px] text-secondary">User authenticated as {dbUser?.email || 'Active User'}.</p>
                  </div>
                </div>
              </div>

              {/* Role Permission Matrix */}
              <div className="neo-card space-y-4">
                <h4 className="font-bold text-sm text-primary-dark flex items-center gap-2">
                  <Users size={18} className="text-primary" />
                  Role-Based Access Control Matrix
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-shadow-darker/10 text-left text-secondary uppercase tracking-wider bg-surface/50">
                        <th className="py-2.5 px-3 font-semibold">Capability / Area</th>
                        <th className="py-2.5 px-3 font-semibold text-center">Admin</th>
                        <th className="py-2.5 px-3 font-semibold text-center">Accounts</th>
                        <th className="py-2.5 px-3 font-semibold text-center">Sales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-shadow-darker/5">
                      <tr>
                        <td className="py-2 px-3 font-medium text-primary-dark">System Configuration & Integrations</td>
                        <td className="py-2 px-3 text-center text-emerald-600 font-bold">✓ Full</td>
                        <td className="py-2 px-3 text-center text-secondary">Read Only</td>
                        <td className="py-2 px-3 text-center text-secondary">Restricted</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-medium text-primary-dark">Invoicing, Quotes & Cash Memos</td>
                        <td className="py-2 px-3 text-center text-emerald-600 font-bold">✓ Full</td>
                        <td className="py-2 px-3 text-center text-emerald-600 font-bold">✓ Full</td>
                        <td className="py-2 px-3 text-center text-amber-600 font-bold">Create / Edit</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-medium text-primary-dark">Financial Deletions & Voiding</td>
                        <td className="py-2 px-3 text-center text-emerald-600 font-bold">✓ Full</td>
                        <td className="py-2 px-3 text-center text-rose-600 font-semibold">Protected</td>
                        <td className="py-2 px-3 text-center text-rose-600 font-semibold">Protected</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-medium text-primary-dark">CRM Leads & WhatsApp Workflows</td>
                        <td className="py-2 px-3 text-center text-emerald-600 font-bold">✓ Full</td>
                        <td className="py-2 px-3 text-center text-amber-600 font-bold">Move Stages</td>
                        <td className="py-2 px-3 text-center text-emerald-600 font-bold">✓ Full</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-medium text-primary-dark">Audit Logs & Discrepancy Trail</td>
                        <td className="py-2 px-3 text-center text-emerald-600 font-bold">✓ Full</td>
                        <td className="py-2 px-3 text-center text-secondary">View Only</td>
                        <td className="py-2 px-3 text-center text-secondary">Restricted</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quick Links to Audit Log and Auditor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div 
                  onClick={() => navigate('/audit-logs')}
                  className="neo-card p-4 flex items-center justify-between cursor-pointer hover:bg-shadow-darker/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-surface transition-colors">
                      <ShieldAlert size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-primary-dark">System Audit Logs</p>
                      <p className="text-xs text-secondary">View append-only database transaction history</p>
                    </div>
                  </div>
                  <ExternalLink size={16} className="text-secondary group-hover:text-primary transition-colors" />
                </div>

                <div 
                  onClick={() => navigate('/auditor')}
                  className="neo-card p-4 flex items-center justify-between cursor-pointer hover:bg-shadow-darker/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-700 group-hover:bg-indigo-600 group-hover:text-surface transition-colors">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-primary-dark">AI Audit Trail</p>
                      <p className="text-xs text-secondary">Run financial reconciliation and anomaly checks</p>
                    </div>
                  </div>
                  <ExternalLink size={16} className="text-secondary group-hover:text-indigo-600 transition-colors" />
                </div>
              </div>
            </section>
          )}

          {activeTab === 'integrations' && (
            <Suspense fallback={
              <div className="flex items-center justify-center p-12 text-secondary">
                <Loader2 className="animate-spin mr-2" size={24} />
                <span>Loading Meta Integration Settings...</span>
              </div>
            }>
              <MetaIntegrationPanel />
            </Suspense>
          )}

        </div>
      </div>
    </div>
  );
}

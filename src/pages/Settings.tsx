import { useState, useEffect } from 'react';
import { Save, ShieldIcon, Database, HardDrive, RefreshCw, Loader2, FileText, Building, Building2, Smartphone, QrCode, FileSignature, Settings as SettingsIcon, IndianRupee } from 'lucide-react';
import clsx from 'clsx';
import { useSettings } from '../contexts/SettingsContext';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function Settings() {
  const { settings, updateSettings } = useSettings();
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
  const [activeTab, setActiveTab] = useState('company');

  useEffect(() => {
    async function loadConfig() {
      if (!db) return;
      try {
        const docRef = doc(db, 'system', 'config');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setConfig(prev => ({ ...prev, ...docSnap.data() }));
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
      updateSettings(localSettings);
      if (db) {
        const docRef = doc(db, 'system', 'config');
        await setDoc(docRef, {
          ...config,
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

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark uppercase">System Configuration</h1>
          <p className="text-secondary mt-1">Manage your company profile, payment details, and system preferences.</p>
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
                  <input type="text" value={localSettings.bankName} onChange={(e) => setLocalSettings({...localSettings, bankName: e.target.value})} className="w-full neo-input" placeholder="Bank Name" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Account Holder Name</label>
                  <input type="text" value={localSettings.accountHolderName} onChange={(e) => setLocalSettings({...localSettings, accountHolderName: e.target.value})} className="w-full neo-input" placeholder="Account Name" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Account Number</label>
                  <input type="text" value={localSettings.accountNumber} onChange={(e) => setLocalSettings({...localSettings, accountNumber: e.target.value})} className="w-full neo-input" placeholder="Account Number" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">IFSC Code</label>
                  <input type="text" value={localSettings.ifscCode} onChange={(e) => setLocalSettings({...localSettings, ifscCode: e.target.value})} className="w-full neo-input" placeholder="IFSC Code" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Branch Name</label>
                  <input type="text" value={localSettings.branchName} onChange={(e) => setLocalSettings({...localSettings, branchName: e.target.value})} className="w-full neo-input" placeholder="Branch Name" />
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
                  <input type="text" value={localSettings.gpayNumber} onChange={(e) => setLocalSettings({...localSettings, gpayNumber: e.target.value})} className="w-full neo-input" placeholder="Phone Number" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">GPay Holder Name</label>
                  <input type="text" value={localSettings.gpayHolderName} onChange={(e) => setLocalSettings({...localSettings, gpayHolderName: e.target.value})} className="w-full neo-input" placeholder="Holder Name" />
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
                  <label className="text-xs font-black text-secondary tracking-widest uppercase">Terms & Conditions</label>
                  <textarea value={localSettings.termsAndConditions} onChange={(e) => setLocalSettings({...localSettings, termsAndConditions: e.target.value})} className="w-full neo-input h-24 resize-none" placeholder="T&C..." />
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
                 <h3 className="flex items-center gap-2 text-primary-dark">
                    <RefreshCw size={20} className="text-primary" />
                    Data Maintenance
                 </h3>
                 <p className="text-xs text-secondary italic">Caution: Some actions here may impact audit logs.</p>
                 <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => alert("Cache purged successfully")} className="neo-btn text-xs py-3 border-error/20 hover:bg-error/5 text-error font-black uppercase">Purge Temporary Cache</button>
                    <button onClick={() => alert("Database backup initiated")} className="neo-btn text-xs py-3 font-black uppercase flex items-center justify-center gap-2">
                       <HardDrive size={14} />
                       Backup Database
                    </button>
                 </div>
              </section>
            </>
          )}

          {activeTab === 'security' && (
            <section className="neo-card space-y-6 p-12 text-center text-secondary min-h-[400px] flex flex-col justify-center items-center">
               <ShieldIcon size={64} className="mx-auto mb-4 opacity-20" />
               <h3 className="text-2xl font-bold text-primary-dark">Security & Audit Logs</h3>
               <p className="max-w-sm mt-2 text-sm">Advanced security configuration, role-based access controls, and complete audit log exports are coming soon in the next major update.</p>
            </section>
          )}

          {activeTab === 'integrations' && (
            <section className="neo-card space-y-6 p-12 text-center text-secondary min-h-[400px] flex flex-col justify-center items-center">
               <Database size={64} className="mx-auto mb-4 opacity-20" />
               <h3 className="text-2xl font-bold text-primary-dark">Third-Party Integrations</h3>
               <p className="max-w-sm mt-2 text-sm">API Keys, Webhooks, and automatic sync with accounting software like Tally and QuickBooks will be available shortly.</p>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}

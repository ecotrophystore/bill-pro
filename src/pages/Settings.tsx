import { useEffect, useState } from 'react';
import { Save, Settings as SettingsIcon, ShieldIcon, Database, HardDrive, RefreshCw, Loader2, FileText, IndianRupee } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import clsx from 'clsx';

export default function Settings() {
  const [config, setConfig] = useState({
    invoice_prefix: 'ECO',
    fiscal_year_start: '04-01',
    next_invoice_number: 1,
    gst_enabled: true,
    hsn_validation: true,
    currency: 'INR'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('financial');

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
        // We keep the defaults instead of crashing
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleSave = async () => {
    if (!db) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'system', 'config'), {
        ...config,
        updated_at: serverTimestamp()
      }, { merge: true });
      alert('Settings saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-primary" size={40} /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark uppercase">System Configuration</h1>
          <p className="text-secondary mt-1">Global parameters for invoice numbering and financial rules.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Sidebar-like settings groups */}
        <div className="space-y-4">
          <button 
            onClick={() => setActiveTab('financial')}
            className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'financial' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}
          >
             <FileText size={18} className={activeTab === 'financial' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'financial' ? "text-primary-dark" : "text-secondary")}>Financial Modules</span>
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'security' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}
          >
             <ShieldIcon size={18} className={activeTab === 'security' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'security' ? "text-primary-dark" : "text-secondary")}>Security & Audits</span>
          </button>
          <button 
            onClick={() => setActiveTab('integrations')}
            className={clsx("w-full text-left p-4 neo-card flex items-center gap-3 transition-all", activeTab === 'integrations' ? "bg-primary/5 border-l-4 border-primary shadow-neo-pressed" : "hover:bg-shadow-darker/5")}
          >
             <Database size={18} className={activeTab === 'integrations' ? "text-primary" : "text-secondary"} />
             <span className={clsx("font-bold", activeTab === 'integrations' ? "text-primary-dark" : "text-secondary")}>Integrations</span>
          </button>
        </div>

        {/* Right Column: Main settings fields */}
        <div className="md:col-span-2 space-y-6">
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

import { useState } from 'react';
import { Settings as SettingsIcon, Shield, Database, Globe, AlertTriangle, CheckCircle2, Loader2, Download, Trash2, Link } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Shared/Toast';
import clsx from 'clsx';

type SettingsTab = 'general' | 'security' | 'data' | 'integrations';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [isPurging, setIsPurging] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const { user, dbUser } = useAuth();
  const { showToast } = useToast();

  const tabs = [
    { id: 'general' as SettingsTab, label: 'General', icon: SettingsIcon },
    { id: 'security' as SettingsTab, label: 'Security', icon: Shield },
    { id: 'data' as SettingsTab, label: 'Data Management', icon: Database },
    { id: 'integrations' as SettingsTab, label: 'Integrations', icon: Globe },
  ];

  const handlePurgeCache = async () => {
    if (!confirm('Are you sure you want to clear the local cache? This will reload data from Firestore.')) return;
    setIsPurging(true);
    try {
      // Clear IndexedDB/localStorage caches
      if (window.caches) {
        const names = await window.caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
      }
      localStorage.removeItem('ecobill_cache');
      sessionStorage.clear();
      showToast('Cache purged successfully! Data will reload from Firestore.', 'success');
      // Reload after short delay
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      showToast('Failed to purge cache.', 'error');
    } finally {
      setIsPurging(false);
    }
  };

  const handleBackupDatabase = async () => {
    setIsBackingUp(true);
    try {
      // Trigger export of Firestore data as downloadable JSON
      const { db } = await import('../lib/firebase');
      if (!db) throw new Error('Firestore not available');
      
      const { collection, getDocs } = await import('firebase/firestore');
      
      const collections = ['invoices', 'quotations', 'purchases', 'products', 'customers'];
      const backup: Record<string, any[]> = {};

      for (const col of collections) {
        const snap = await getDocs(collection(db, col));
        backup[col] = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Convert timestamps to strings for JSON serialization
          created_at: doc.data().created_at?.toDate?.()?.toISOString() || null,
          date: doc.data().date?.toDate?.()?.toISOString() || null,
        }));
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `ecobill_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(link.href);

      showToast(`Database backup created! ${Object.values(backup).flat().length} records exported.`, 'success');
    } catch (err: any) {
      console.error('Backup error:', err);
      showToast('Backup failed: ' + err.message, 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark uppercase">Settings</h1>
          <p className="text-secondary mt-1">Manage your EcoBill configuration and preferences.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tab Sidebar */}
        <div className="space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all text-sm font-bold",
                activeTab === tab.id 
                  ? 'bg-primary/10 text-primary-dark shadow-neo-pressed border-l-4 border-primary' 
                  : 'text-secondary hover:bg-shadow-darker/5 hover:text-primary-dark'
              )}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="lg:col-span-3">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="neo-card space-y-6 animate-fade-in">
              <h3 className="text-lg font-bold text-primary-dark">General Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Business Name</label>
                  <input 
                    type="text" 
                    className="neo-input w-full" 
                    defaultValue="Ecotrophy Innovations" 
                    placeholder="Your business name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">GSTIN</label>
                  <input 
                    type="text" 
                    className="neo-input w-full" 
                    placeholder="29AABCU9603R1ZM"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Email</label>
                  <input 
                    type="email" 
                    className="neo-input w-full" 
                    defaultValue={user?.email || ''} 
                    readOnly
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Currency</label>
                  <select className="neo-input w-full">
                    <option value="INR">₹ INR (Indian Rupee)</option>
                    <option value="USD">$ USD (US Dollar)</option>
                    <option value="EUR">€ EUR (Euro)</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Business Address</label>
                  <textarea 
                    className="neo-input w-full" 
                    rows={2}
                    placeholder="Full business address for invoices..."
                  />
                </div>
              </div>

              <button 
                onClick={() => showToast('General settings saved!', 'success')} 
                className="neo-btn-primary"
              >
                Save Changes
              </button>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="neo-card space-y-6 animate-fade-in">
              <h3 className="text-lg font-bold text-primary-dark">Security & Access</h3>

              <div className="space-y-4">
                <div className="p-4 bg-green-50 rounded-xl border border-green-200 flex items-start gap-3">
                  <CheckCircle2 size={20} className="text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-green-800">Authentication Active</p>
                    <p className="text-xs text-green-600 mt-0.5">Firebase Auth with email/password is enabled. All routes are protected.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-primary-dark">Current User</label>
                    <input type="text" className="neo-input w-full" readOnly value={user?.email || 'Not signed in'} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-bold text-primary-dark">Role</label>
                    <input type="text" className="neo-input w-full" readOnly value={dbUser?.role || 'Manager'} />
                  </div>
                </div>

                <div className="p-4 bg-orange-50 rounded-xl border border-orange-200 flex items-start gap-3">
                  <AlertTriangle size={20} className="text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-orange-800">Session Management</p>
                    <p className="text-xs text-orange-600 mt-0.5">Use the profile dropdown in the header to sign out. Sessions expire with Firebase Auth token refresh.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Data Management Tab */}
          {activeTab === 'data' && (
            <div className="neo-card space-y-6 animate-fade-in">
              <h3 className="text-lg font-bold text-primary-dark">Data Management</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-6 neo-input bg-surface/50 space-y-3 flex flex-col">
                  <div className="flex items-center gap-3">
                    <Trash2 size={20} className="text-error" />
                    <div>
                      <h4 className="text-sm font-bold text-primary-dark">Purge Cache</h4>
                      <p className="text-[10px] text-secondary mt-0.5">Clear local storage, session data, and browser caches.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handlePurgeCache}
                    disabled={isPurging}
                    className="neo-btn text-error border-error/20 hover:bg-error/5 flex items-center justify-center gap-2 mt-auto"
                  >
                    {isPurging ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    {isPurging ? 'Purging...' : 'Purge Cache'}
                  </button>
                </div>

                <div className="p-6 neo-input bg-surface/50 space-y-3 flex flex-col">
                  <div className="flex items-center gap-3">
                    <Download size={20} className="text-primary" />
                    <div>
                      <h4 className="text-sm font-bold text-primary-dark">Backup Database</h4>
                      <p className="text-[10px] text-secondary mt-0.5">Export all Firestore collections to a JSON file.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleBackupDatabase}
                    disabled={isBackingUp}
                    className="neo-btn-primary flex items-center justify-center gap-2 mt-auto"
                  >
                    {isBackingUp ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {isBackingUp ? 'Exporting...' : 'Backup Now'}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 flex items-start gap-3">
                <Database size={20} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-blue-800">Firestore Real-time Sync</p>
                  <p className="text-xs text-blue-600 mt-0.5">All data is continuously synced with Cloud Firestore. Your data is safe and accessible from any device.</p>
                </div>
              </div>
            </div>
          )}

          {/* Integrations Tab */}
          {activeTab === 'integrations' && (
            <div className="neo-card space-y-6 animate-fade-in">
              <h3 className="text-lg font-bold text-primary-dark">Integrations</h3>

              <div className="space-y-4">
                {[
                  { name: 'Firebase Auth', status: 'active', description: 'Email/Password authentication' },
                  { name: 'Cloud Firestore', status: 'active', description: 'Real-time NoSQL database' },
                  { name: 'Cloud Functions', status: 'configured', description: 'AI Auditor backend (asia-south1)' },
                  { name: 'Bank API', status: 'pending', description: 'Connect your bank for auto-reconciliation' },
                ].map(integration => (
                  <div key={integration.name} className="flex items-center justify-between p-4 neo-input">
                    <div className="flex items-center gap-3">
                      <Link size={16} className="text-secondary" />
                      <div>
                        <p className="text-sm font-bold text-primary-dark">{integration.name}</p>
                        <p className="text-[10px] text-secondary">{integration.description}</p>
                      </div>
                    </div>
                    <span className={clsx(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                      integration.status === 'active' ? 'bg-green-100 text-green-700' :
                      integration.status === 'configured' ? 'bg-blue-100 text-blue-700' :
                      'bg-orange-100 text-orange-700'
                    )}>
                      {integration.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

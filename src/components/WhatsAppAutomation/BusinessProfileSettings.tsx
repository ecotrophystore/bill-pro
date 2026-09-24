import React, { useState, useEffect } from 'react';
import { X, Camera, Store, MapPin, Mail, Globe, Info, Save, Loader2, Edit2 } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';

interface BusinessProfileSettingsProps {
  onClose: () => void;
}

export function BusinessProfileSettings({ onClose }: BusinessProfileSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  
  interface BusinessProfile {
    businessName: string;
    description: string;
    address: string;
    email: string;
    website: string;
    category: string;
    profilePicture?: string;
  }

  const [profile, setProfile] = useState<BusinessProfile>({
    businessName: 'Your Business Name',
    description: 'We provide the best products and services.',
    address: '123 Main Street, City',
    email: 'contact@business.com',
    website: 'https://business.com',
    category: 'Retail'
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!db) return;
      try {
        const docRef = doc(db, 'settings', 'whatsapp_business_profile');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setProfile({ ...profile, ...snap.data() });
        }
      } catch (err) {
        console.error('Error fetching business profile', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    if (!db || !functions) return;
    setSaving(true);
    try {
      // 1. Save to local Firestore
      const docRef = doc(db, 'settings', 'whatsapp_business_profile');
      await setDoc(docRef, profile, { merge: true });
      
      // 2. Sync to Meta Cloud API
      const syncFn = httpsCallable(functions, 'syncBusinessProfileToMeta');
      await syncFn({ profile });
      
      setEditMode(false);
    } catch (err: any) {
      console.error('Error saving profile', err);
      alert(`Failed to sync profile to Meta: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="neo-card w-full max-w-md bg-transparent flex flex-col shadow-2xl sm:rounded-2xl overflow-hidden h-[100dvh] md:h-auto md:max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-[#008069] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1 hover:bg-transparent rounded-full transition-colors">
              <X size={20} />
            </button>
            <h2 className="font-semibold text-lg">Business profile</h2>
          </div>
          {!editMode && (
            <button 
              onClick={() => setEditMode(true)} 
              className="p-1.5 hover:bg-transparent rounded-full transition-colors flex items-center gap-1 text-sm font-medium"
            >
              <Edit2 size={16} /> Edit
            </button>
          )}
          {editMode && (
            <button 
              onClick={handleSave} 
              disabled={saving}
              className="px-3 py-1.5 bg-transparent hover:bg-transparent rounded-lg transition-colors flex items-center gap-1.5 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-transparent custom-sidebar-scrollbar">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 size={24} className="animate-spin text-[#008069]" />
            </div>
          ) : (
            <div className="p-0">
              
              {/* Profile Image Section */}
              <div className="bg-transparent flex flex-col items-center py-8 shadow-sm">
                <div className="relative group cursor-pointer" onClick={() => editMode && document.getElementById('profile-pic-upload')?.click()}>
                  <div className="w-32 h-32 rounded-full bg-slate-200 border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                    {profile.profilePicture ? (
                      <img src={profile.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <Store size={48} className="text-slate-400" />
                    )}
                  </div>
                  {editMode && (
                    <div className="absolute bottom-0 right-0 bg-[#008069] p-2.5 rounded-full text-white shadow-lg border-2 border-white">
                      <Camera size={18} />
                    </div>
                  )}
                  <input 
                    type="file" 
                    id="profile-pic-upload" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setProfile({ ...profile, profilePicture: reader.result as string });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Profile Details */}
              <div className="mt-2 bg-transparent shadow-sm divide-y divide-slate-100">
                
                {/* Name */}
                <div className="px-5 py-4 flex gap-4">
                  <Store size={22} className="text-slate-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Business Name</div>
                    {editMode ? (
                      <input 
                        type="text" 
                        value={profile.businessName}
                        onChange={(e) => setProfile({...profile, businessName: e.target.value})}
                        className="w-full border-b-2 border-[#008069] pb-1 text-slate-800 focus:outline-none"
                      />
                    ) : (
                      <div className="text-slate-800 font-medium">{profile.businessName}</div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div className="px-5 py-4 flex gap-4">
                  <Info size={22} className="text-slate-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Description</div>
                    {editMode ? (
                      <textarea 
                        value={profile.description}
                        onChange={(e) => setProfile({...profile, description: e.target.value})}
                        rows={3}
                        className="w-full border-b-2 border-[#008069] pb-1 text-slate-800 focus:outline-none resize-none"
                      />
                    ) : (
                      <div className="text-slate-800 text-sm whitespace-pre-wrap">{profile.description}</div>
                    )}
                  </div>
                </div>

                {/* Address */}
                <div className="px-5 py-4 flex gap-4">
                  <MapPin size={22} className="text-slate-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Address</div>
                    {editMode ? (
                      <textarea 
                        value={profile.address}
                        onChange={(e) => setProfile({...profile, address: e.target.value})}
                        rows={2}
                        className="w-full border-b-2 border-[#008069] pb-1 text-slate-800 focus:outline-none resize-none"
                      />
                    ) : (
                      <div className="text-slate-800 text-sm whitespace-pre-wrap">{profile.address}</div>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div className="px-5 py-4 flex gap-4">
                  <Mail size={22} className="text-slate-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Email</div>
                    {editMode ? (
                      <input 
                        type="email" 
                        value={profile.email}
                        onChange={(e) => setProfile({...profile, email: e.target.value})}
                        className="w-full border-b-2 border-[#008069] pb-1 text-slate-800 focus:outline-none"
                      />
                    ) : (
                      <div className="text-slate-800 text-sm">{profile.email}</div>
                    )}
                  </div>
                </div>

                {/* Website */}
                <div className="px-5 py-4 flex gap-4">
                  <Globe size={22} className="text-slate-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Website</div>
                    {editMode ? (
                      <input 
                        type="url" 
                        value={profile.website}
                        onChange={(e) => setProfile({...profile, website: e.target.value})}
                        className="w-full border-b-2 border-[#008069] pb-1 text-slate-800 focus:outline-none"
                      />
                    ) : (
                      <a href={profile.website} target="_blank" rel="noreferrer" className="text-sky-600 text-sm hover:underline">{profile.website}</a>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="p-6 text-center text-xs text-slate-400">
                <p>This profile will be visible to your customers on WhatsApp.</p>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}




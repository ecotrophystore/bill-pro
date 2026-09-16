import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Settings } from '../types';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
}

const defaultSettings: Settings = {
  companyName: 'ECOTROPHY INNOVATIONS (OPC) PVT LTD',
  companyLogo: '',
  companyAddress: '',
  companyCity: 'Tiruchengode',
  companyState: 'Tamil Nadu',
  companyPincode: '',
  companyGstin: '',
  companyPhone: '',
  companyEmail: '',
  companyWebsite: '',
  bankName: 'HDFC BANK',
  accountHolderName: 'ECOTROPHY INNOVATIONS (OPC) PVT LTD',
  accountNumber: '50200101733061',
  ifscCode: 'HDFC0002639',
  branchName: 'Tiruchengode',
  upiId: '',
  upiPaymentLink: '',
  qrCode: '',
  gpayNumber: '+91 88707 44306',
  gpayHolderName: 'Chakravarthi MM',
  termsAndConditions: '1. 50% Advance payment required to confirm order.\n2. Balance payment to be made before dispatch.\n3. Goods once sold cannot be returned.\n4. Delivery timeline subject to artwork approval.',
  gstTermsAndConditions: '1. 50% Advance payment required to confirm order.\n2. Balance payment to be made before dispatch.\n3. Goods once sold cannot be returned.\n4. Delivery timeline subject to artwork approval.',
  nonGstTermsAndConditions: '1. Goods once sold cannot be returned.\n2. Payment received in full.',
  notes: 'Thank you for your business!',
  authorizedSignature: '',
  defaultGst: 18,
  invoice_prefix: 'INV',
  quotation_prefix: 'QTN',
  proforma_prefix: 'PI',
  memo_prefix: 'MEMO',
  quotation_format: 'prefix_hyphen_fy',
  proforma_format: 'prefix_hyphen_fy',
  invoice_format: 'prefix_hyphen_fy',
  memo_format: 'prefix_hyphen_fy',
  quotation_year: '',
  proforma_year: '',
  invoice_year: '',
  memo_year: '',
  quotation_next_number: 1,
  proforma_next_number: 1,
  invoice_next_number: 1,
  memo_next_number: 1,
  email_list: [],
  weekly_report_day: 'Monday',
  monthly_report_date: 1,
  allow_backdate_days: 7,
  metaAppId: '',
  metaAppSecret: '',
  metaWebhookVerifyToken: '',
  metaWebhookCallbackUrl: '',
  metaPageId: '',
  instagramAccountId: '',
  whatsappBusinessAccountId: '',
  whatsappPhoneNumberId: '',
  whatsappWebhookCallbackUrl: '',
  facebookWebhookSubscribed: false,
  instagramWebhookSubscribed: false,
  whatsappWebhookSubscribed: false,
  metaWhatsAppAccessToken: '',
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: () => {},
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    const saved = localStorage.getItem('companySettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (err) {
        console.error('Failed to parse settings from localStorage', err);
      }
    }

    if (db) {
      try {
        const docRef = doc(db, 'system', 'config');
        const unsub = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const remoteData = docSnap.data() as Partial<Settings>;
            setSettings(prev => {
              const updated = { ...prev, ...remoteData };
              try {
                localStorage.setItem('companySettings', JSON.stringify(updated));
              } catch (e) {
                console.warn('Could not cache settings to localStorage:', e);
              }
              return updated;
            });
          }
        }, (err) => {
          console.warn('Settings onSnapshot error:', err);
        });
        return () => unsub();
      } catch (err) {
        console.warn('Could not establish settings listener:', err);
      }
    }
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      localStorage.setItem('companySettings', JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save settings to localStorage:', e);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Settings } from '../types';

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
}

const defaultSettings: Settings = {
  companyName: '',
  companyLogo: '',
  companyAddress: '',
  companyCity: '',
  companyState: '',
  companyPincode: '',
  companyGstin: '',
  companyPhone: '',
  companyEmail: '',
  companyWebsite: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ifscCode: '',
  branchName: '',
  upiId: '',
  upiPaymentLink: '',
  qrCode: '',
  gpayNumber: '',
  gpayHolderName: '',
  termsAndConditions: '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged if the payment is delayed.',
  notes: 'Thank you for your business!',
  authorizedSignature: '',
  defaultGst: 18,
  invoice_prefix: 'ECO',
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
  }, []);

  const updateSettings = (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('companySettings', JSON.stringify(updated));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

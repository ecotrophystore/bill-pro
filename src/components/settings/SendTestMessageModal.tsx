import React, { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface SendTestMessageModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function SendTestMessageModal({ onClose, onSuccess }: SendTestMessageModalProps) {
  const [countryCode, setCountryCode] = useState('91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mode, setMode] = useState<'text' | 'template'>('template');
  const [templateName, setTemplateName] = useState('hello_world');
  const [templateLanguage, setTemplateLanguage] = useState('en_US');
  const [textBody, setTextBody] = useState('This is a test message from Bill Pro.');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; messageId?: string; error?: string } | null>(null);

  const handleSend = async () => {
    if (!phoneNumber) return;
    
    setLoading(true);
    setResult(null);
    try {
      const functions = getFunctions();
      const sendWhatsAppTestMessage = httpsCallable(functions, 'sendWhatsAppTestMessage');
      
      const fullNumber = `${countryCode.replace('+', '')}${phoneNumber}`;
      
      const response = await sendWhatsAppTestMessage({
        phoneNumber: fullNumber,
        mode,
        templateName,
        templateLanguage,
        textBody
      });
      
      const data = response.data as any;
      if (data.success) {
        setResult({ success: true, messageId: data.messageId });
        if (onSuccess) onSuccess();
      } else {
        setResult({ success: false, error: data.error || 'Failed to send message' });
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message || 'Network or execution error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-shadow-darker/50 backdrop-blur-sm animate-fade-in">
      <div className="neo-card w-full max-w-md bg-surface flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-shadow-darker/10">
          <h3 className="font-bold text-primary-dark">Send WhatsApp Test Message</h3>
          <button onClick={onClose} className="p-2 hover:bg-shadow-darker/5 rounded-full transition-colors text-secondary">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-secondary tracking-widest uppercase">Recipient Phone</label>
            <div className="flex gap-2">
              <div className="flex-none w-20 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary font-medium">+</span>
                <input 
                  type="text" 
                  value={countryCode} 
                  onChange={e => setCountryCode(e.target.value)} 
                  className="w-full neo-input text-sm pl-6" 
                  placeholder="91" 
                />
              </div>
              <input 
                type="text" 
                value={phoneNumber} 
                onChange={e => setPhoneNumber(e.target.value)} 
                className="w-full neo-input text-sm flex-1" 
                placeholder="10 digit number" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-secondary tracking-widest uppercase">Message Mode</label>
            <select 
              value={mode} 
              onChange={e => setMode(e.target.value as any)} 
              className="w-full neo-input text-sm appearance-none bg-surface"
            >
              <option value="template">Approved Template</option>
              <option value="text">Free-form Text (Requires active 24h window)</option>
            </select>
          </div>

          {mode === 'template' ? (
            <>
              <div className="space-y-2">
                <label className="text-xs font-black text-secondary tracking-widest uppercase">Template Name</label>
                <input 
                  type="text" 
                  value={templateName} 
                  onChange={e => setTemplateName(e.target.value)} 
                  className="w-full neo-input text-sm" 
                  placeholder="e.g. hello_world" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-secondary tracking-widest uppercase">Language Code</label>
                <input 
                  type="text" 
                  value={templateLanguage} 
                  onChange={e => setTemplateLanguage(e.target.value)} 
                  className="w-full neo-input text-sm" 
                  placeholder="e.g. en_US" 
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-black text-secondary tracking-widest uppercase">Message Body</label>
              <textarea 
                value={textBody} 
                onChange={e => setTextBody(e.target.value)} 
                className="w-full neo-input text-sm resize-none h-24" 
                placeholder="Type your test message..." 
              />
            </div>
          )}

          {result && (
            <div className={`p-3 rounded-md text-xs font-medium border ${result.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              {result.success ? `Success! Meta Message ID: ${result.messageId}` : `Error: ${result.error}`}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-shadow-darker/10 flex justify-end gap-3 bg-surface/50">
          <button onClick={onClose} disabled={loading} className="neo-btn px-4 py-2 text-sm">
            Cancel
          </button>
          <button 
            onClick={handleSend} 
            disabled={loading || !phoneNumber} 
            className="neo-btn-primary px-4 py-2 text-sm flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Send Test
          </button>
        </div>
      </div>
    </div>
  );
}

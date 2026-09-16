import React, { useState } from 'react';
import { X, Terminal, Copy, Check } from 'lucide-react';

interface MetaSecretSetupModalProps {
  onClose: () => void;
}

function CopyCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="bg-shadow-darker/5 p-3 rounded font-mono text-xs text-primary-dark flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 truncate">
        <Terminal size={14} className="text-primary flex-shrink-0" />
        {cmd}
      </span>
      <button onClick={copy} className="flex-shrink-0 p-1 rounded hover:bg-primary/10 transition-colors text-secondary hover:text-primary">
        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function MetaSecretSetupModal({ onClose }: MetaSecretSetupModalProps) {
  const secrets = [
    {
      num: 1, name: 'Meta App Secret', key: 'META_APP_SECRET',
      desc: 'Used to verify the HMAC-SHA256 signature on incoming webhook requests.',
    },
    {
      num: 2, name: 'Webhook Verify Token', key: 'META_WEBHOOK_VERIFY_TOKEN',
      desc: 'A strong random string you generate. Used during the Meta Dashboard webhook verification step.',
    },
    {
      num: 3, name: 'WhatsApp Access Token', key: 'META_WHATSAPP_ACCESS_TOKEN',
      desc: 'Permanent System User Token with whatsapp_business_messaging permission.',
    },
    {
      num: 4, name: 'Facebook System User Token', key: 'META_FACEBOOK_SYSTEM_USER_TOKEN',
      desc: 'System User Token with pages_show_list, leads_retrieval, pages_messaging, and instagram_manage_messages permissions.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-shadow-darker/50 backdrop-blur-sm animate-fade-in">
      <div className="neo-card w-full max-w-lg bg-surface flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-shadow-darker/10">
          <h3 className="font-bold text-primary-dark">Secret Setup Instructions</h3>
          <button onClick={onClose} className="p-2 hover:bg-shadow-darker/5 rounded-full transition-colors text-secondary">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm text-secondary">
          <p>
            For security, sensitive Meta credentials must <strong>not</strong> be entered in the browser.
            Store them in Google Cloud Secret Manager via the Firebase CLI.
          </p>

          <div className="space-y-5">
            {secrets.map(s => (
              <div key={s.key}>
                <h4 className="font-bold text-primary-dark mb-1">{s.num}. {s.name}</h4>
                <p className="text-xs mb-2">{s.desc}</p>
                <CopyCmd cmd={`firebase functions:secrets:set ${s.key}`} />
              </div>
            ))}
          </div>

          <div className="p-3 bg-primary/10 border border-primary/20 rounded-md text-primary-dark text-xs space-y-2">
            <strong className="block">After setting secrets, redeploy Functions:</strong>
            <CopyCmd cmd="firebase deploy --only functions" />
          </div>
        </div>

        <div className="p-4 border-t border-shadow-darker/10 flex justify-end">
          <button onClick={onClose} className="neo-btn px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
}

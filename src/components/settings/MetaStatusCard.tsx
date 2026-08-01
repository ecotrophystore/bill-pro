import React from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Unplug, Info } from 'lucide-react';
import clsx from 'clsx';

export type ConnectionStatus = 'not_configured' | 'configured' | 'testing' | 'connected' | 'disconnected' | 'invalid_token' | 'token_expired' | 'permission_missing' | 'webhook_not_verified' | 'subscription_missing' | 'error';

interface MetaStatusCardProps {
  platformName: string;
  status: ConnectionStatus;
  accountName?: string;
  displayPhoneNumber?: string;
  phoneNumberId?: string;
  wabaId?: string;
  tokenConfigured?: boolean;
  webhookVerified?: boolean;
  webhookSubscribed?: boolean;
  lastTestTime?: string;
  lastWebhookTime?: string;
  lastSuccessfulMessage?: string;
  lastErrorCode?: string;
  lastError?: string;
  onTest?: () => void;
  onSubscribe?: () => void;
  onUnsubscribe?: () => void;
  onSendTest?: () => void;
  onDisconnect?: () => void;
  isLoading?: boolean;
}

export function MetaStatusCard({
  platformName,
  status,
  accountName,
  displayPhoneNumber,
  phoneNumberId,
  wabaId,
  tokenConfigured,
  webhookVerified,
  webhookSubscribed,
  lastTestTime,
  lastWebhookTime,
  lastSuccessfulMessage,
  lastErrorCode,
  lastError,
  onTest,
  onSubscribe,
  onUnsubscribe,
  onSendTest,
  onDisconnect,
  isLoading
}: MetaStatusCardProps) {

  const getStatusDisplay = () => {
    switch (status) {
      case 'connected': return { label: 'Connected', color: 'text-green-600 bg-green-50 border-green-200', icon: <CheckCircle size={16} /> };
      case 'error': 
      case 'invalid_token':
      case 'token_expired':
      case 'permission_missing':
      case 'webhook_not_verified':
      case 'subscription_missing': return { label: 'Action Required', color: 'text-red-600 bg-red-50 border-red-200', icon: <AlertTriangle size={16} /> };
      case 'testing': return { label: 'Testing...', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: <RefreshCw size={16} className="animate-spin" /> };
      case 'configured': return { label: 'Configured', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: <Info size={16} /> };
      case 'disconnected': return { label: 'Disconnected', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: <Unplug size={16} /> };
      default: return { label: 'Not Configured', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: <XCircle size={16} /> };
    }
  };

  const statusDisplay = getStatusDisplay();

  const maskId = (id?: string) => id ? `****${id.slice(-4)}` : 'N/A';

  return (
    <div className="neo-card p-5 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-bold text-primary-dark">{platformName}</h4>
          <div className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-2 border", statusDisplay.color)}>
            {statusDisplay.icon}
            {statusDisplay.label}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
        <div className="text-secondary">Account:</div>
        <div className="font-medium text-primary-dark truncate">{accountName || 'Unknown'}</div>
        
        <div className="text-secondary">Phone:</div>
        <div className="font-medium text-primary-dark">{displayPhoneNumber || 'Unknown'}</div>

        <div className="text-secondary">Phone Number ID:</div>
        <div className="font-medium text-primary-dark font-mono">{maskId(phoneNumberId)}</div>

        <div className="text-secondary">WABA ID:</div>
        <div className="font-medium text-primary-dark font-mono">{maskId(wabaId)}</div>

        <div className="col-span-2 my-1 border-t border-shadow-darker/5"></div>

        <div className="text-secondary">Token:</div>
        <div className="font-medium">
           {tokenConfigured ? <span className="text-green-600">Configured</span> : <span className="text-red-600">Missing</span>}
        </div>

        <div className="text-secondary">Webhook:</div>
        <div className="font-medium">
           {webhookVerified ? <span className="text-green-600">Verified</span> : <span className="text-yellow-600">Pending</span>}
        </div>

        <div className="text-secondary">Subscription:</div>
        <div className="font-medium">
           {webhookSubscribed ? <span className="text-green-600">Active</span> : <span className="text-yellow-600">Inactive</span>}
        </div>

        <div className="col-span-2 my-1 border-t border-shadow-darker/5"></div>

        <div className="text-secondary">Last Test:</div>
        <div className="font-medium text-primary-dark">{lastTestTime ? new Date(lastTestTime).toLocaleString() : 'Never'}</div>

        <div className="text-secondary">Last Webhook:</div>
        <div className="font-medium text-primary-dark">{lastWebhookTime ? new Date(lastWebhookTime).toLocaleString() : 'Never'}</div>
        
        <div className="text-secondary">Last Message:</div>
        <div className="font-medium text-primary-dark">{lastSuccessfulMessage ? new Date(lastSuccessfulMessage).toLocaleString() : 'Never'}</div>
      </div>

      {lastError && (
        <div className="p-3 bg-error/10 border border-error/20 rounded-md text-error text-xs font-medium">
          <AlertTriangle size={14} className="inline mr-1.5" />
          {lastErrorCode && `[${lastErrorCode}] `}{lastError}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-3 border-t border-shadow-darker/10">
        <button onClick={onTest} disabled={isLoading || !tokenConfigured || !phoneNumberId} className="neo-btn-primary text-xs py-1.5 px-3">
          Test Connection
        </button>
        {webhookSubscribed ? (
           <button onClick={onUnsubscribe} disabled={isLoading} className="neo-btn text-xs py-1.5 px-3 text-yellow-700 hover:bg-yellow-50">
             Unsubscribe Webhook
           </button>
        ) : (
           <button onClick={onSubscribe} disabled={isLoading || status !== 'connected'} className="neo-btn text-xs py-1.5 px-3">
             Subscribe Webhook
           </button>
        )}
        <button onClick={onSendTest} disabled={isLoading || status !== 'connected'} className="neo-btn text-xs py-1.5 px-3">
          Send Test Message
        </button>
        <button onClick={onDisconnect} disabled={isLoading || status === 'not_configured'} className="neo-btn text-xs py-1.5 px-3 text-error border-error/20 hover:bg-error/5 ml-auto">
          Disconnect
        </button>
      </div>
    </div>
  );
}

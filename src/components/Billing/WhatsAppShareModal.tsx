import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, MessageSquare, ExternalLink, Download, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { Customer, Invoice, Quotation, CashMemo, ProformaInvoice, Settings } from '../../types';
import {
  sendDocumentViaInbuiltWhatsApp,
  generateDefaultShareMessage,
  formatIndianPhoneNumber
} from '../../services/inbuiltWhatsAppShareService';
import { downloadPDF } from '../../utils/pdfGenerator';
import { useNavigate } from 'react-router-dom';

export interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Invoice | Quotation | CashMemo | ProformaInvoice;
  documentType: 'Invoice' | 'Quotation' | 'Cash Memo' | 'Proforma Invoice';
  customer?: Customer | string;
  settings?: Settings;
}

export default function WhatsAppShareModal({
  isOpen,
  onClose,
  document: docData,
  documentType,
  customer,
  settings
}: WhatsAppShareModalProps) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const customerName = typeof customer === 'object' && customer !== null ? customer.name : customer || 'Customer';
  const docNumber = (docData as any).number || (docData as any).quote_number || 'DOC';
  const totalAmount = Number((docData as any).grand_total || 0);
  const paymentStatus = ((docData as any).payment_status || 'unpaid').toUpperCase();

  // Initialize phone & message when modal opens
  useEffect(() => {
    if (!isOpen) {
      setSentSuccess(false);
      setPdfBlob(null);
      return;
    }

    let initialPhone = '';
    if (typeof customer === 'object' && customer !== null) {
      initialPhone = customer.whatsapp_number || customer.phone || '';
    } else if ((docData as any).customer_phone || (docData as any).phone) {
      initialPhone = (docData as any).customer_phone || (docData as any).phone || '';
    }
    setPhone(initialPhone.replace(/\D/g, ''));

    const initialMsg = generateDefaultShareMessage(docData, customerName, documentType);
    setMessage(initialMsg);

    // Pre-generate PDF in the background for instant dispatch
    let isMounted = true;
    setIsGeneratingPdf(true);
    downloadPDF(docData, customer || 'Customer', documentType, 'blob', settings)
      .then((blob) => {
        if (isMounted && blob instanceof Blob) {
          setPdfBlob(blob);
        }
      })
      .catch((err) => {
        console.warn('PDF pre-generation warning:', err);
      })
      .finally(() => {
        if (isMounted) setIsGeneratingPdf(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, docData, customer, documentType]);

  if (!isOpen) return null;

  const handleSendViaInbuiltWhatsApp = async () => {
    const clean = phone.replace(/\D/g, '');
    if (!clean || clean.length < 10) {
      toast.error('Please enter a valid 10-digit WhatsApp number');
      return;
    }

    setIsSending(true);
    const toastId = toast.loading('Sending via in-built WhatsApp...');

    try {
      const result = await sendDocumentViaInbuiltWhatsApp({
        docData,
        customer: customer || 'Customer',
        docType: documentType,
        phone: clean,
        messageText: message,
        settings,
        existingBlob: pdfBlob || undefined
      });

      if (result.success) {
        setSentSuccess(true);
        toast.success(`Successfully sent ${documentType} to +${formatIndianPhoneNumber(clean)}!`, {
          id: toastId,
          duration: 4000
        });
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      console.error('In-built WhatsApp dispatch error:', err);
      toast.error(err.message || 'Failed to send via in-built WhatsApp', { id: toastId });
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenWhatsAppWeb = () => {
    const clean = phone.replace(/\D/g, '');
    const finalPhone = clean.length === 10 ? `91${clean}` : clean;
    const encodedText = encodeURIComponent(message);
    const targetUrl = finalPhone ? `https://wa.me/${finalPhone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDirectDownload = () => {
    downloadPDF(docData, customer || 'Customer', documentType, 'download', settings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#FAF8F5] border border-shadow-darker/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-shadow-darker/10 bg-white/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-inner">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-primary-dark">
                Share {documentType} via In-Built WhatsApp
              </h2>
              <p className="text-xs text-secondary">
                Dispatches PDF document directly using Meta Cloud integration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-secondary hover:text-primary-dark hover:bg-shadow-darker/10 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Document Summary Card */}
          <div className="p-4 rounded-xl bg-white border border-shadow-darker/10 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs text-secondary uppercase font-semibold">Document</div>
              <div className="text-sm font-bold text-primary-dark mt-0.5">{docNumber}</div>
              <div className="text-xs text-secondary/80">{customerName}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-secondary uppercase font-semibold">Amount</div>
              <div className="text-sm font-black text-primary-dark mt-0.5">₹ {totalAmount.toLocaleString('en-IN')}</div>
              <span
                className={`inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-bold ${
                  paymentStatus === 'PAID'
                    ? 'bg-green-100 text-green-700'
                    : paymentStatus === 'PARTIAL'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {paymentStatus}
              </span>
            </div>
          </div>

          {/* Recipient Phone Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-primary-dark flex items-center justify-between">
              <span>Customer WhatsApp Number</span>
              {phone && (
                <span className="text-[10px] font-normal text-secondary">
                  Sending to +{formatIndianPhoneNumber(phone)}
                </span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-secondary">
                +91
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 10-digit phone number"
                className="w-full neo-input pl-12 pr-4 py-2.5 text-sm font-medium"
              />
            </div>
          </div>

          {/* Message Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-primary-dark">
              Accompanying Message / Caption
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full neo-input p-3 text-xs leading-relaxed font-sans"
              placeholder="Enter message to send alongside document..."
            />
          </div>

          {/* Attachment Preview Card */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/60 text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-emerald-600 flex-shrink-0" />
              <div className="truncate max-w-[260px]">
                <span className="font-semibold">{documentType} PDF: </span>
                <span className="opacity-80 font-mono text-[11px]">{docNumber}.pdf</span>
              </div>
            </div>
            {isGeneratingPdf ? (
              <span className="flex items-center gap-1 text-[11px] text-amber-700">
                <Loader2 size={12} className="animate-spin" /> Preparing PDF...
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                <CheckCircle2 size={12} /> Ready to send
              </span>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 bg-white/60 border-t border-shadow-darker/10 flex flex-col sm:flex-row gap-2 justify-between items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleDirectDownload}
              type="button"
              className="p-2 text-secondary hover:text-primary-dark hover:bg-shadow-darker/10 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Download PDF directly"
            >
              <Download size={14} /> Download
            </button>
            <button
              onClick={handleOpenWhatsAppWeb}
              type="button"
              className="p-2 text-secondary hover:text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Open standard WhatsApp Web link as fallback"
            >
              <ExternalLink size={14} /> WhatsApp Web
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              disabled={isSending}
              className="neo-btn px-4 py-2 text-xs font-bold text-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSendViaInbuiltWhatsApp}
              disabled={isSending || !phone}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Sending via In-Built WA...
                </>
              ) : sentSuccess ? (
                <>
                  <CheckCircle2 size={14} />
                  Sent!
                </>
              ) : (
                <>
                  <Send size={14} />
                  Send via In-Built WhatsApp
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

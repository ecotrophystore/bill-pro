import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, ArrowRight, FileCheck, Receipt, AlertCircle, RefreshCw } from 'lucide-react';
import { getNextProposedNumber } from '../../utils/numberGenerator';
import { useSettings } from '../../contexts/SettingsContext';
import { 
  clientConvertQuotationToInvoice,
  clientConvertQuotationToProforma,
  clientConvertQuotationToCashMemo,
  clientConvertProformaToInvoice 
} from '../../utils/clientBillingCreator';

export interface ConvertSourceDoc {
  id: string;
  number: string;
  customer_id?: string;
  customer_name?: string;
  customer_type?: 'gst' | 'non_gst';
  grand_total?: number;
  payment_status?: string;
}

interface ConvertDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceDoc: ConvertSourceDoc | null;
  sourceType: 'quotation' | 'proforma';
  onConverted: (targetType: 'invoice' | 'proforma' | 'memo', generatedNumber: string) => void;
}

export const ConvertDocumentModal: React.FC<ConvertDocumentModalProps> = ({
  isOpen,
  onClose,
  sourceDoc,
  sourceType,
  onConverted
}) => {
  const { settings } = useSettings();
  
  // Default target type based on source and customer type
  const isGST = !sourceDoc?.customer_type || sourceDoc?.customer_type === 'gst';
  const initialTarget: 'invoice' | 'proforma' | 'memo' = sourceType === 'proforma' 
    ? 'invoice' 
    : (isGST ? 'invoice' : 'memo');

  const [targetType, setTargetType] = useState<'invoice' | 'proforma' | 'memo'>(initialTarget);
  const [docNumber, setDocNumber] = useState<string>('');
  const [isLoadingNumber, setIsLoadingNumber] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // When modal opens or targetType changes, fetch the exact next orderwise sequence number
  useEffect(() => {
    if (!isOpen || !sourceDoc) return;
    
    // Reset target when source doc changes
    if (sourceType === 'proforma') {
      setTargetType('invoice');
    } else {
      const isCustomerGst = !sourceDoc.customer_type || sourceDoc.customer_type === 'gst';
      setTargetType(isCustomerGst ? 'invoice' : 'memo');
    }
  }, [isOpen, sourceDoc, sourceType]);

  const fetchProposedNumber = async (target: 'invoice' | 'proforma' | 'memo') => {
    setIsLoadingNumber(true);
    setErrorMessage(null);
    try {
      let coll: 'invoices' | 'proforma_invoices' | 'cash_memos' = 'invoices';
      let docKind: 'invoice' | 'proforma' | 'memo' = 'invoice';

      if (target === 'invoice') {
        coll = 'invoices';
        docKind = 'invoice';
      } else if (target === 'proforma') {
        coll = 'proforma_invoices';
        docKind = 'proforma';
      } else if (target === 'memo') {
        coll = 'cash_memos';
        docKind = 'memo';
      }

      const num = await getNextProposedNumber(coll, docKind, settings);
      setDocNumber(num);
    } catch (err: any) {
      console.warn("Could not calculate next proposed number:", err);
      setDocNumber('');
    } finally {
      setIsLoadingNumber(false);
    }
  };

  useEffect(() => {
    if (isOpen && sourceDoc) {
      fetchProposedNumber(targetType);
    }
  }, [isOpen, targetType, sourceDoc]);

  if (!isOpen || !sourceDoc) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docNumber.trim()) {
      setErrorMessage("Please specify a document number.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let resultNumber = docNumber.trim();

      if (sourceType === 'quotation') {
        if (targetType === 'invoice') {
          const res = await clientConvertQuotationToInvoice(sourceDoc.id, resultNumber, true);
          resultNumber = res.invoiceNumber || resultNumber;
        } else if (targetType === 'proforma') {
          const res = await clientConvertQuotationToProforma(sourceDoc.id, resultNumber, true);
          resultNumber = res.proformaNumber || resultNumber;
        } else {
          const res = await clientConvertQuotationToCashMemo(sourceDoc.id, resultNumber);
          resultNumber = res.memoNumber || resultNumber;
        }
      } else {
        // sourceType === 'proforma'
        const res = await clientConvertProformaToInvoice(sourceDoc.id, resultNumber);
        resultNumber = res.invoiceNumber || resultNumber;
      }

      onConverted(targetType, resultNumber);
      onClose();
    } catch (err: any) {
      console.error("Conversion error:", err);
      setErrorMessage(err?.message || "Failed to convert document. Please verify your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTargetTitle = () => {
    if (targetType === 'invoice') return 'Tax Invoice (GST)';
    if (targetType === 'proforma') return 'Proforma Invoice';
    return 'Cash Memo (Non-GST)';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="neo-card bg-surface w-full max-w-lg p-6 shadow-2xl relative border-2 border-primary/20 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-shadow-darker/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary-dark">
              <Sparkles size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-primary-dark tracking-tight">
                {sourceType === 'quotation' ? 'Convert Quotation' : 'Convert Proforma Invoice'}
              </h3>
              <p className="text-xs text-secondary font-medium">
                Verify or change the orderwise document number
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-secondary hover:text-primary-dark hover:bg-shadow-darker/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Source Doc Snapshot */}
        <div className="mt-4 p-3.5 bg-shadow-darker/5 rounded-xl border border-shadow-darker/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="text-secondary font-medium uppercase tracking-wider block text-[10px]">Source Document</span>
            <span className="font-bold text-primary-dark text-sm">{sourceDoc.number}</span>
            {sourceDoc.customer_name && (
              <span className="text-secondary ml-2">({sourceDoc.customer_name})</span>
            )}
          </div>
          <div className="text-right">
            <span className="text-secondary font-medium uppercase tracking-wider block text-[10px]">Grand Total</span>
            <span className="font-black text-primary-dark text-sm">
              ₹ {sourceDoc.grand_total ? sourceDoc.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </span>
          </div>
        </div>

        <form onSubmit={handleConfirm} className="mt-5 space-y-5">
          {/* Target Type Selector (Only if source is quotation) */}
          {sourceType === 'quotation' && (
            <div>
              <label className="text-xs font-black text-secondary tracking-widest uppercase block mb-2">
                Convert To
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTargetType('invoice')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    targetType === 'invoice'
                      ? 'border-primary-dark bg-primary/10 text-primary-dark shadow-sm'
                      : 'border-shadow-darker/20 hover:border-primary/40 text-secondary'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs mb-0.5">
                    <Receipt size={14} className={targetType === 'invoice' ? 'text-primary' : ''} />
                    Tax Invoice
                  </div>
                  <div className="text-[10px] opacity-80">Official GST Bill</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetType('proforma')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    targetType === 'proforma'
                      ? 'border-primary-dark bg-primary/10 text-primary-dark shadow-sm'
                      : 'border-shadow-darker/20 hover:border-primary/40 text-secondary'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs mb-0.5">
                    <FileCheck size={14} className={targetType === 'proforma' ? 'text-primary' : ''} />
                    Proforma
                  </div>
                  <div className="text-[10px] opacity-80">Estimate / Advance</div>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetType('memo')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    targetType === 'memo'
                      ? 'border-primary-dark bg-primary/10 text-primary-dark shadow-sm'
                      : 'border-shadow-darker/20 hover:border-primary/40 text-secondary'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs mb-0.5">
                    <Receipt size={14} className={targetType === 'memo' ? 'text-primary' : ''} />
                    Cash Memo
                  </div>
                  <div className="text-[10px] opacity-80">Non-GST Retail Bill</div>
                </button>
              </div>
            </div>
          )}

          {/* Document Number Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-black text-secondary tracking-widest uppercase">
                {targetType === 'invoice' ? 'Invoice Number' : (targetType === 'proforma' ? 'Proforma Number' : 'Cash Memo Number')}
              </label>
              <button
                type="button"
                onClick={() => fetchProposedNumber(targetType)}
                disabled={isLoadingNumber || isSubmitting}
                className="text-[11px] text-primary hover:text-primary-dark font-bold flex items-center gap-1 transition-colors"
                title="Calculate next sequence number again"
              >
                <RefreshCw size={12} className={isLoadingNumber ? 'animate-spin' : ''} />
                <span>Auto-Sequence</span>
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                disabled={isSubmitting}
                placeholder="Enter document number"
                className="neo-input w-full font-mono text-base font-bold text-primary-dark !py-2.5"
                required
              />
              {isLoadingNumber && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 size={16} className="animate-spin text-primary" />
                </div>
              )}
            </div>

            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-secondary">
              <span className="text-emerald-600 font-bold shrink-0">✓</span>
              <span>
                Pre-filled with the <strong>correct orderwise sequential number</strong> based on your sequence settings. You can edit this number if you need a specific number.
              </span>
            </div>
          </div>

          {/* Error notice if any */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
              <AlertCircle size={16} className="shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-3 border-t border-shadow-darker/10 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="neo-btn !py-2.5 !px-5 text-sm font-semibold text-secondary hover:text-primary-dark"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLoadingNumber || !docNumber.trim()}
              className="neo-btn-primary !py-2.5 !px-6 text-sm font-bold flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Converting...</span>
                </>
              ) : (
                <>
                  <span>Create {targetType === 'invoice' ? 'Tax Invoice' : (targetType === 'proforma' ? 'Proforma' : 'Cash Memo')}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConvertDocumentModal;

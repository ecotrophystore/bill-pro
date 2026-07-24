import React from 'react';
import { CreditCard } from 'lucide-react';

export type PaymentMethodToShow = 'Bank Details' | 'UPI Details' | 'GPay Details' | 'All Payment Details' | 'None';

interface PaymentDetailsSelectorProps {
  value: PaymentMethodToShow;
  onChange: (value: PaymentMethodToShow) => void;
}

export const PaymentDetailsSelector: React.FC<PaymentDetailsSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="neo-card p-4 space-y-3">
      <h3 className="text-lg font-bold text-primary-dark flex items-center gap-2">
        <CreditCard size={20} className="text-primary" />
        Bank/UPI Details on PDF
      </h3>
      <p className="text-sm text-secondary">
        Select which of your receiving accounts to print on the invoice for the customer.
      </p>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as PaymentMethodToShow)}
          className="w-full neo-input appearance-none bg-surface"
        >
          <option value="Bank Details">Bank Details Only</option>
          <option value="UPI Details">UPI Details Only</option>
          <option value="GPay Details">GPay Details Only</option>
          <option value="All Payment Details">All Payment Details</option>
          <option value="None">None (Hide Payment Section)</option>
        </select>
      </div>
    </div>
  );
};

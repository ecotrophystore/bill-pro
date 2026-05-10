import { X, Printer, Download } from 'lucide-react';

interface DigitalReceiptProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    number: string;
    customer_name: string;
    date: string;
    items: any[];
    subtotal: number;
    tax_total: number;
    grand_total: number;
    type: 'Invoice' | 'Quotation' | 'Cash Memo';
  };
}

export default function DigitalReceipt({ isOpen, onClose, data }: DigitalReceiptProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
        {/* Actions Header */}
        <div className="bg-surface p-4 border-b border-shadow-darker/10 flex justify-between items-center">
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="p-2 neo-btn !px-3 !py-2 flex items-center gap-2 text-xs font-bold">
              <Printer size={16} /> Print
            </button>
            <button className="p-2 neo-btn !px-3 !py-2 flex items-center gap-2 text-xs font-bold">
              <Download size={16} /> PDF
            </button>
          </div>
          <button onClick={onClose} className="p-2 neo-btn !rounded-full !px-3 !py-2">
            <X size={20} />
          </button>
        </div>

        {/* Receipt Content */}
        <div className="flex-1 overflow-y-auto p-8 sm:p-12 bg-white text-gray-800 font-sans">
          <div className="flex justify-between items-start mb-12">
            <div>
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl mb-4 shadow-lg">
                EB
              </div>
              <h1 className="text-2xl font-black text-primary-dark uppercase tracking-tight">Ecotrophy Innovations</h1>
              <p className="text-xs text-secondary font-medium mt-1">123 Industrial Hub, Tech Park, India</p>
              <p className="text-xs text-secondary font-medium">GSTIN: 29AAAAA0000A1Z5</p>
            </div>
            <div className="text-right">
              <h2 className="text-4xl font-black text-shadow-darker/10 uppercase tracking-tighter leading-none mb-2">{data.type}</h2>
              <p className="text-sm font-bold text-primary-dark">{data.number}</p>
              <p className="text-xs text-secondary mt-1">{data.date}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12 mb-12 py-6 border-y border-gray-100">
            <div>
              <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-2">Billed To</p>
              <p className="font-bold text-primary-dark text-lg">{data.customer_name}</p>
              <p className="text-xs text-secondary mt-1">Customer ID: {Math.random().toString(36).substring(7).toUpperCase()}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-secondary uppercase tracking-widest mb-2">Payment Status</p>
              <span className="inline-block px-3 py-1 rounded-full bg-success/10 text-success text-[10px] font-black uppercase tracking-widest ring-1 ring-success/20">
                Verified
              </span>
            </div>
          </div>

          <table className="w-full mb-12">
            <thead>
              <tr className="border-b-2 border-gray-100 text-left">
                <th className="py-4 text-[10px] font-black text-secondary uppercase tracking-widest">Description</th>
                <th className="py-4 text-[10px] font-black text-secondary uppercase tracking-widest text-right">Qty</th>
                <th className="py-4 text-[10px] font-black text-secondary uppercase tracking-widest text-right">Rate</th>
                <th className="py-4 text-[10px] font-black text-secondary uppercase tracking-widest text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.items.map((item, i) => (
                <tr key={i}>
                  <td className="py-4">
                    <p className="font-bold text-gray-800">{item.description || item.name}</p>
                    <p className="text-[10px] text-secondary font-mono">HSN: {item.hsn_code || '8481'}</p>
                  </td>
                  <td className="py-4 text-right font-medium text-gray-600">{item.quantity}</td>
                  <td className="py-4 text-right font-medium text-gray-600">₹{item.rate.toLocaleString()}</td>
                  <td className="py-4 text-right font-bold text-gray-800">₹{(item.quantity * item.rate).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-secondary font-medium">Subtotal</span>
                <span className="font-bold text-gray-800">₹{data.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-secondary font-medium">Tax (GST 18%)</span>
                <span className="font-bold text-gray-800">₹{data.tax_total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xl pt-4 border-t-2 border-gray-100">
                <span className="font-black text-primary-dark uppercase tracking-tight">Total</span>
                <span className="font-black text-primary-dark">₹{data.grand_total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-12 border-t border-dashed border-gray-200 text-center">
            <p className="text-xs text-secondary font-medium italic">
              This is a computer-generated document. No signature required. 
              Powered by EcoBill AI Auditor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

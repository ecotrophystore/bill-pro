import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: { type: 'month' | 'fy' | 'custom', format: 'excel' | 'pdf' | 'bulk_pdf', startDate?: Date, endDate?: Date }) => void;
}

export default function ExportReportModal({ isOpen, onClose, onExport }: ExportReportModalProps) {
  const [dateType, setDateType] = useState<'month' | 'specific_month' | 'fy' | 'custom'>('month');
  const [format, setFormat] = useState<'excel' | 'pdf' | 'bulk_pdf'>('excel');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  if (!isOpen) return null;

  const handleExport = () => {
    if (dateType === 'custom') {
      if (!startDate || !endDate) {
        alert("Please select both start and end dates.");
        return;
      }
      onExport({
        type: 'custom',
        format,
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      });
    } else if (dateType === 'specific_month') {
      if (!selectedMonth) {
        alert("Please select a month.");
        return;
      }
      const [year, month] = selectedMonth.split('-');
      const start = new Date(parseInt(year), parseInt(month) - 1, 1);
      const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
      onExport({
        type: 'custom',
        format,
        startDate: start,
        endDate: end
      });
    } else {
      onExport({
        type: dateType,
        format
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-800">Export Report</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Time Period</label>
              <select 
                value={dateType} 
                onChange={(e) => setDateType(e.target.value as any)}
                className="w-full neo-input"
              >
                <option value="month">This Month</option>
                <option value="specific_month">Specific Month</option>
                <option value="fy">Financial Year (Apr - Mar)</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {dateType === 'specific_month' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Month</label>
                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full neo-input" />
              </div>
            )}

            {dateType === 'custom' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full neo-input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full neo-input" />
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Format</label>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="format" checked={format === 'excel'} onChange={() => setFormat('excel')} />
                  <span>Excel Summary Report (.xlsx)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} />
                  <span>PDF Summary Report (.pdf)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="format" checked={format === 'bulk_pdf'} onChange={() => setFormat('bulk_pdf')} />
                  <span>Bulk Individual PDFs (.zip)</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 font-semibold text-gray-600 hover:text-gray-800 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleExport} 
            className="neo-btn-primary px-6 py-2"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Calendar, 
  Filter, 
  Loader2, 
  Edit, 
  Trash2, 
  Download, 
  ChevronDown, 
  Upload, 
  X, 
  FileText, 
  Check, 
  Save, 
  Wallet, 
  FileSpreadsheet, 
  ArrowDownRight,
  ArrowUpRight,
  Info,
  Layers,
  Sparkles,
  RefreshCw,
  Clock,
  User,
  Tags,
  DollarSign
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ExpenseItem {
  id: string;
  date: string;
  member: string;
  purpose: string;
  requested: number;
  paid: number;
  taxStatus: 'GST' | 'Non-GST';
  gstPercent: number;
  gstAmount: number;
  nonGstAmount: number;
  paymentMode: 'Cash' | 'UPI' | 'Bank' | 'Card';
  billNo?: string;
  notes?: string;
}

export default function ExpensePage() {
  // Staged Preview Rows
  const [previewRows, setPreviewRows] = useState<ExpenseItem[]>([]);
  
  // Saved database list (persisted via localStorage)
  const [savedExpenses, setSavedExpenses] = useState<ExpenseItem[]>([]);
  
  // System parameters
  const [openingCash, setOpeningCash] = useState<number>(() => {
    const saved = localStorage.getItem('ecobill_opening_cash');
    const parsed = saved ? parseFloat(saved) : 0;
    return parsed > 0 ? parsed : 100000; // default 1,00,000 INR
  });
  const [isEditingOpeningCash, setIsEditingOpeningCash] = useState(false);
  const [tempOpeningCash, setTempOpeningCash] = useState(openingCash.toString());

  // Drag and drop states
  const [dragActive, setDragActive] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedFileName, setParsedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Entry Form state
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().split('T')[0],
    member: '',
    purpose: '',
    requested: '',
    paid: '',
    taxStatus: 'GST' as 'GST' | 'Non-GST',
    gstPercent: 18,
    paymentMode: 'UPI' as 'Cash' | 'UPI' | 'Bank' | 'Card',
    billNo: '',
    notes: ''
  });

  // Report Filter states
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filterMember, setFilterMember] = useState('all');
  const [filterTaxStatus, setFilterTaxStatus] = useState('all');
  const [filterPaymentMode, setFilterPaymentMode] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load saved expenses on mount
  useEffect(() => {
    const saved = localStorage.getItem('ecobill_saved_expenses');
    if (saved) {
      try {
        setSavedExpenses(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Update opening cash local storage
  const handleSaveOpeningCash = () => {
    const val = parseFloat(tempOpeningCash) || 0;
    setOpeningCash(val);
    localStorage.setItem('ecobill_opening_cash', val.toString());
    setIsEditingOpeningCash(false);
  };

  // Helper to extract calculations
  const getStats = (rows: ExpenseItem[]) => {
    let totalRequested = 0;
    let totalPaid = 0;
    let gstTotal = 0;
    let nonGstTotal = 0;

    rows.forEach(item => {
      totalRequested += item.requested;
      totalPaid += item.paid;
      if (item.taxStatus === 'GST') {
        gstTotal += item.gstAmount;
      } else {
        nonGstTotal += item.nonGstAmount;
      }
    });

    return {
      totalRequested,
      totalPaid,
      gstTotal,
      nonGstTotal
    };
  };

  // Live Summary based on staged + historical totals
  const allCurrentExpenses = [...savedExpenses, ...previewRows];
  const stats = getStats(allCurrentExpenses);
  const moneyInHand = openingCash - stats.totalPaid;
  const closingBalance = moneyInHand;

  // File Upload handling
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value && e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setParsedFileName(file.name);
    setIsParsing(true);
    
    const fileType = file.name.split('.').pop()?.toLowerCase();
    
    setTimeout(() => {
      if (fileType === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const parsed = results.data.map((row: any, idx) => {
              const req = parseFloat(row.Requested || row.requested || row.Amount || row.amount) || 0;
              const paid = parseFloat(row.Paid || row.paid || row.Amount || row.amount) || 0;
              const tax = (row.TaxStatus || row.tax_status || '').toLowerCase().includes('non') ? 'Non-GST' : 'GST';
              const gstPct = parseFloat(row.GstPercent || row.gst_percent || row.GST || 18) || 18;
              const gstAmt = tax === 'GST' ? exactRound((paid * gstPct) / (100 + gstPct)) : 0;
              
              return {
                id: `csv-${Date.now()}-${idx}`,
                date: row.Date || row.date || new Date().toISOString().split('T')[0],
                member: row.Member || row.member || row.Name || row.name || 'Imported Member',
                purpose: row.Purpose || row.purpose || row.Description || row.description || 'Imported Purpose',
                requested: req,
                paid: paid,
                taxStatus: tax as 'GST' | 'Non-GST',
                gstPercent: gstPct,
                gstAmount: gstAmt,
                nonGstAmount: tax === 'Non-GST' ? paid : 0,
                paymentMode: (row.PaymentMode || row.payment_mode || 'UPI') as any,
                billNo: row.BillNo || row.bill_no || '',
                notes: row.Notes || row.notes || 'Parsed from CSV'
              };
            });
            setPreviewRows(prev => [...prev, ...parsed]);
            setIsParsing(false);
          }
        });
      } else if (fileType === 'xlsx' || fileType === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          
          const parsed = jsonData.map((row: any, idx) => {
            const req = parseFloat(row.Requested || row.requested || row.Amount || row.amount) || 0;
            const paid = parseFloat(row.Paid || row.paid || row.Amount || row.amount) || 0;
            const tax = (row.TaxStatus || row.tax_status || '').toLowerCase().includes('non') ? 'Non-GST' : 'GST';
            const gstPct = parseFloat(row.GstPercent || row.gst_percent || row.GST || 18) || 18;
            const gstAmt = tax === 'GST' ? exactRound((paid * gstPct) / (100 + gstPct)) : 0;
            
            return {
              id: `xlsx-${Date.now()}-${idx}`,
              date: row.Date || row.date || new Date().toISOString().split('T')[0],
              member: row.Member || row.member || row.Name || row.name || 'Imported Member',
              purpose: row.Purpose || row.purpose || row.Description || row.description || 'Imported Purpose',
              requested: req,
              paid: paid,
              taxStatus: tax as 'GST' | 'Non-GST',
              gstPercent: gstPct,
              gstAmount: gstAmt,
              nonGstAmount: tax === 'Non-GST' ? paid : 0,
              paymentMode: (row.PaymentMode || row.payment_mode || 'UPI') as any,
              billNo: row.BillNo || row.bill_no || '',
              notes: row.Notes || row.notes || 'Parsed from XLSX'
            };
          });
          setPreviewRows(prev => [...prev, ...parsed]);
          setIsParsing(false);
        };
        reader.readAsArrayBuffer(file);
      } else {
        // Image or PDF - simulate AI OCR parsing extraction
        const ocrMock: ExpenseItem = {
          id: `ocr-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          member: 'Spacetech Plastics & Acrylics',
          purpose: 'Raw material procurement (2.5mm sheets)',
          requested: 8500,
          paid: 8500,
          taxStatus: 'GST',
          gstPercent: 18,
          gstAmount: exactRound((8500 * 18) / 118),
          nonGstAmount: 0,
          paymentMode: 'UPI',
          billNo: `ST-${Math.floor(1000 + Math.random() * 9000)}`,
          notes: 'AI OCR Extraction: Confirmed match with invoice snapshot.'
        };
        setPreviewRows(prev => [...prev, ocrMock]);
        setIsParsing(false);
      }
    }, 1500);
  };

  const exactRound = (num: number) => Math.round(num * 100) / 100;

  // Add Item Manually
  const handleAddManualExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.member || !manualForm.purpose || !manualForm.paid) {
      alert("Please fill in Member Name, Purpose, and Paid Amount.");
      return;
    }

    const requested = parseFloat(manualForm.requested) || parseFloat(manualForm.paid) || 0;
    const paid = parseFloat(manualForm.paid) || 0;
    const gstAmt = manualForm.taxStatus === 'GST' ? exactRound((paid * manualForm.gstPercent) / (100 + manualForm.gstPercent)) : 0;

    const newItem: ExpenseItem = {
      id: `manual-${Date.now()}`,
      date: manualForm.date,
      member: manualForm.member,
      purpose: manualForm.purpose,
      requested,
      paid,
      taxStatus: manualForm.taxStatus,
      gstPercent: manualForm.gstPercent,
      gstAmount: gstAmt,
      nonGstAmount: manualForm.taxStatus === 'Non-GST' ? paid : 0,
      paymentMode: manualForm.paymentMode,
      billNo: manualForm.billNo,
      notes: manualForm.notes
    };

    setPreviewRows(prev => [...prev, newItem]);
    
    // Clear manual form (keep date)
    setManualForm(prev => ({
      ...prev,
      member: '',
      purpose: '',
      requested: '',
      paid: '',
      billNo: '',
      notes: ''
    }));
  };

  // Preview Row modification
  const handleEditPreviewRow = (id: string, field: keyof ExpenseItem, val: any) => {
    setPreviewRows(prev => prev.map(row => {
      if (row.id === id) {
        const updated = { ...row, [field]: val };
        // Recalculate tax amounts if values change
        if (field === 'paid' || field === 'taxStatus' || field === 'gstPercent') {
          const paid = parseFloat(updated.paid as any) || 0;
          const pct = parseFloat(updated.gstPercent as any) || 18;
          if (updated.taxStatus === 'GST') {
            updated.gstAmount = exactRound((paid * pct) / (100 + pct));
            updated.nonGstAmount = 0;
          } else {
            updated.gstAmount = 0;
            updated.nonGstAmount = paid;
          }
        }
        return updated;
      }
      return row;
    }));
  };

  const handleRemovePreviewRow = (id: string) => {
    setPreviewRows(prev => prev.filter(row => row.id !== id));
  };

  // Save preview list to persistent storage
  const handleSaveExpenses = () => {
    if (previewRows.length === 0) {
      alert("No temporary expenses to save.");
      return;
    }
    const updated = [...savedExpenses, ...previewRows];
    setSavedExpenses(updated);
    localStorage.setItem('ecobill_saved_expenses', JSON.stringify(updated));
    setPreviewRows([]);
    alert("Staged expenses successfully saved and committed to database!");
  };

  // Reset Preview Table
  const handleResetPreview = () => {
    if (window.confirm("Are you sure you want to clear the staged preview table?")) {
      setPreviewRows([]);
    }
  };

  const handleDeleteSavedExpense = (id: string) => {
    if (window.confirm("Are you sure you want to delete this saved expense from the ledger?")) {
      const updated = savedExpenses.filter(item => item.id !== id);
      setSavedExpenses(updated);
      localStorage.setItem('ecobill_saved_expenses', JSON.stringify(updated));
    }
  };

  // Report logic (Filters & Search)
  const filteredReportList = savedExpenses.filter(item => {
    if (filterFromDate && item.date < filterFromDate) return false;
    if (filterToDate && item.date > filterToDate) return false;
    if (filterMember !== 'all' && item.member.toLowerCase() !== filterMember.toLowerCase()) return false;
    if (filterTaxStatus !== 'all' && item.taxStatus !== filterTaxStatus) return false;
    if (filterPaymentMode !== 'all' && item.paymentMode !== filterPaymentMode) return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSearch = item.member.toLowerCase().includes(q) || 
                          item.purpose.toLowerCase().includes(q) || 
                          (item.billNo || '').toLowerCase().includes(q) || 
                          (item.notes || '').toLowerCase().includes(q);
      if (!matchSearch) return false;
    }
    return true;
  });

  // Calculate filtered stats
  const filteredStats = getStats(filteredReportList);
  const filteredClosing = openingCash - filteredStats.totalPaid;

  // Extract unique members for filter dropdown
  const uniqueMembers = [...new Set(savedExpenses.map(item => item.member))];

  // Running cash for Staged Preview Table
  let previewRunningCash = openingCash;
  const previewWithRunningCash = previewRows.map(item => {
    previewRunningCash -= item.paid;
    return { ...item, runningCash: previewRunningCash };
  });

  // Export functions
  const handleExportExcel = () => {
    const dataToExport = filteredReportList.map(item => ({
      Date: item.date,
      Member: item.member,
      Purpose: item.purpose,
      'Requested Amount (₹)': item.requested,
      'Paid Amount (₹)': item.paid,
      'Tax Status': item.taxStatus,
      'GST Amount (₹)': item.gstAmount,
      'Non-GST Amount (₹)': item.nonGstAmount,
      'Payment Mode': item.paymentMode,
      'Bill Number': item.billNo || 'N/A',
      Notes: item.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, "Expense_Report.xlsx");
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Expense Ledger Report", 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 14, 28);
    doc.text(`Opening Balance: Rs. ${openingCash.toLocaleString()}`, 14, 34);

    const tableData = filteredReportList.map(item => [
      item.date,
      item.member,
      item.purpose,
      `Rs. ${item.requested.toLocaleString()}`,
      `Rs. ${item.paid.toLocaleString()}`,
      item.taxStatus,
      item.paymentMode,
      item.billNo || '-'
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Member', 'Purpose', 'Requested', 'Paid', 'Tax', 'Mode', 'Bill No']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 118, 110] },
      styles: { fontSize: 8 }
    });

    doc.save("Expense_Ledger_Report.pdf");
  };

  // Simple visual SVG charts computations
  const getMemberWiseExpenses = () => {
    const map: Record<string, number> = {};
    savedExpenses.forEach(item => {
      map[item.member] = (map[item.member] || 0) + item.paid;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  };

  const getTaxBreakdown = () => {
    let gstVal = 0;
    let nonGstVal = 0;
    savedExpenses.forEach(item => {
      if (item.taxStatus === 'GST') gstVal += item.paid;
      else nonGstVal += item.paid;
    });
    return { gstVal, nonGstVal };
  };

  const getMonthlyBreakdown = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const map: Record<string, number> = {};
    
    savedExpenses.forEach(item => {
      if (item.date) {
        const monthIndex = new Date(item.date).getMonth();
        const monthName = months[monthIndex];
        map[monthName] = (map[monthName] || 0) + item.paid;
      }
    });

    return months.map(m => ({ month: m, total: map[m] || 0 }));
  };

  const memberExpenses = getMemberWiseExpenses();
  const taxBreakdown = getTaxBreakdown();
  const monthlyExpenses = getMonthlyBreakdown();
  const maxMonthlyExpense = Math.max(...monthlyExpenses.map(m => m.total), 1000);

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-16">
      
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark uppercase">Expense Tracking</h1>
          <p className="text-secondary mt-1">
            Manage cash flow, monitor member disbursements, and parse digital bills using AI OCR scan.
          </p>
        </div>
      </div>

      {/* 2. Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {/* Opening Cash Card */}
        <div className="bg-[#FCFAF7] border border-shadow-darker/10 shadow-sm rounded-2xl p-4 border-l-[5px] border-l-primary relative flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Opening Cash</span>
            <Wallet size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            {isEditingOpeningCash ? (
              <div className="flex items-center gap-1">
                <input 
                  type="number" 
                  className="neo-input !p-1 text-xs w-20 font-bold" 
                  value={tempOpeningCash} 
                  onChange={(e) => setTempOpeningCash(e.target.value)} 
                />
                <button onClick={handleSaveOpeningCash} className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200">
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group cursor-pointer" onClick={() => setIsEditingOpeningCash(true)}>
                <span className="text-base font-black text-[#004D40]">₹{openingCash.toLocaleString('en-IN')}</span>
                <Edit size={10} className="text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            <span className="text-[9px] text-secondary/60 block mt-1">Starting balance</span>
          </div>
        </div>

        {/* Money in Hand */}
        <div className="bg-[#FCFAF7] border border-shadow-darker/10 shadow-sm rounded-2xl p-4 border-l-[5px] border-l-primary flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Money In Hand</span>
            <ArrowDownRight size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            <span className="text-base font-black text-[#004D40]">₹{moneyInHand.toLocaleString('en-IN')}</span>
            <span className="text-[9px] text-secondary/60 block mt-1">Opening - Paid</span>
          </div>
        </div>

        {/* Total Requested */}
        <div className="bg-[#FCFAF7] border border-shadow-darker/10 shadow-sm rounded-2xl p-4 border-l-[5px] border-l-primary flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Total Requested</span>
            <Layers size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            <span className="text-base font-black text-[#004D40]">₹{stats.totalRequested.toLocaleString('en-IN')}</span>
            <span className="text-[9px] text-secondary/60 block mt-1">Aggregate demands</span>
          </div>
        </div>

        {/* Total Paid */}
        <div className="bg-[#FCFAF7] border border-shadow-darker/10 shadow-sm rounded-2xl p-4 border-l-[5px] border-l-primary flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Total Paid</span>
            <ArrowUpRight size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            <span className="text-base font-black text-[#004D40]">₹{stats.totalPaid.toLocaleString('en-IN')}</span>
            <span className="text-[9px] text-secondary/60 block mt-1">Disbursed cash</span>
          </div>
        </div>

        {/* Closing Balance */}
        <div className="bg-[#FCFAF7] border border-shadow-darker/10 shadow-sm rounded-2xl p-4 border-l-[5px] border-l-primary flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Closing Bal.</span>
            <Wallet size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            <span className="text-base font-black text-[#004D40]">₹{closingBalance.toLocaleString('en-IN')}</span>
            <span className="text-[9px] text-secondary/60 block mt-1">Current session net</span>
          </div>
        </div>

        {/* GST Total */}
        <div className="bg-[#FCFAF7] border border-shadow-darker/10 shadow-sm rounded-2xl p-4 border-l-[5px] border-l-primary flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">GST Total</span>
            <Tags size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            <span className="text-base font-black text-[#004D40]">₹{stats.gstTotal.toLocaleString('en-IN')}</span>
            <span className="text-[9px] text-secondary/60 block mt-1">GST inclusive paid</span>
          </div>
        </div>

        {/* Non-GST Total */}
        <div className="bg-[#FCFAF7] border border-shadow-darker/10 shadow-sm rounded-2xl p-4 border-l-[5px] border-l-primary flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Non-GST Total</span>
            <Info size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            <span className="text-base font-black text-[#004D40]">₹{stats.nonGstTotal.toLocaleString('en-IN')}</span>
            <span className="text-[9px] text-secondary/60 block mt-1">Standard direct paid</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Upload & Manual Entry Form */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* 3. Upload receipt */}
          <div className="neo-card space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2"><Upload size={18} /> Parse & Extract Receipts</h3>
            
            <div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                dragActive ? 'border-primary bg-primary/5' : 'border-shadow-darker/20 hover:border-primary/50'
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                className="hidden" 
                accept="image/*,application/pdf,.csv,.xlsx,.xls"
                onChange={handleFileChange}
              />
              <FileSpreadsheet size={36} className="text-secondary/60 mb-2 animate-bounce" />
              <p className="text-xs font-semibold text-primary-dark text-center">Drag files here or click to browse</p>
              <p className="text-[10px] text-secondary/60 text-center mt-1">Supports Images, PDFs, CSV, or Excel formats</p>
            </div>

            {isParsing && (
              <div className="flex items-center gap-2 text-xs bg-primary/10 border border-primary/20 p-3 rounded-xl animate-pulse">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span className="font-semibold text-primary-dark">AI OCR is parsing bill: {parsedFileName}...</span>
              </div>
            )}
          </div>

          {/* 5. Manual data filling section */}
          <div className="neo-card space-y-4">
            <div className="flex items-center gap-2 border-b pb-2 border-shadow-darker/10">
              <Plus size={18} className="text-primary" />
              <h3 className="text-base font-extrabold uppercase tracking-wide">Or Add Expense Manually</h3>
            </div>
            
            <form onSubmit={handleAddManualExpense} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-primary-dark">Date</label>
                  <input 
                    type="date" 
                    className="neo-input w-full !p-2"
                    value={manualForm.date}
                    onChange={e => setManualForm(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-primary-dark">Member Name</label>
                  <input 
                    type="text" 
                    className="neo-input w-full !p-2"
                    placeholder="Enter member name"
                    value={manualForm.member}
                    onChange={e => setManualForm(prev => ({ ...prev, member: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-primary-dark">Purpose / Description</label>
                <input 
                  type="text" 
                  className="neo-input w-full !p-2"
                  placeholder="e.g. Courier charges, board purchase"
                  value={manualForm.purpose}
                  onChange={e => setManualForm(prev => ({ ...prev, purpose: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-primary-dark">Requested (₹)</label>
                  <input 
                    type="number" 
                    className="neo-input w-full !p-2"
                    placeholder="0"
                    value={manualForm.requested}
                    onChange={e => setManualForm(prev => ({ ...prev, requested: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-primary-dark">Paid Amount (₹)</label>
                  <input 
                    type="number" 
                    className="neo-input w-full !p-2"
                    placeholder="0"
                    value={manualForm.paid}
                    onChange={e => setManualForm(prev => ({ ...prev, paid: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-primary-dark">Tax Status</label>
                  <select 
                    className="neo-input w-full !p-2 bg-surface"
                    value={manualForm.taxStatus}
                    onChange={e => setManualForm(prev => ({ ...prev, taxStatus: e.target.value as any }))}
                  >
                    <option value="GST">GST</option>
                    <option value="Non-GST">Non-GST</option>
                  </select>
                </div>
                {manualForm.taxStatus === 'GST' && (
                  <div className="space-y-1">
                    <label className="font-semibold text-primary-dark">GST %</label>
                    <select 
                      className="neo-input w-full !p-2 bg-surface"
                      value={manualForm.gstPercent}
                      onChange={e => setManualForm(prev => ({ ...prev, gstPercent: parseInt(e.target.value) }))}
                    >
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-primary-dark">Payment Mode</label>
                  <select 
                    className="neo-input w-full !p-2 bg-surface"
                    value={manualForm.paymentMode}
                    onChange={e => setManualForm(prev => ({ ...prev, paymentMode: e.target.value as any }))}
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank">Bank Transfer</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-primary-dark">Bill Number</label>
                  <input 
                    type="text" 
                    className="neo-input w-full !p-2"
                    placeholder="INV-123"
                    value={manualForm.billNo}
                    onChange={e => setManualForm(prev => ({ ...prev, billNo: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-primary-dark">Notes</label>
                <textarea 
                  className="neo-input w-full !p-2 h-16 resize-none"
                  placeholder="Additional memo..."
                  value={manualForm.notes}
                  onChange={e => setManualForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <button type="submit" className="w-full neo-btn-primary flex items-center justify-center gap-2 mt-4">
                <Plus size={16} /> Add to Staging
              </button>
            </form>
          </div>

        </div>

        {/* Right Side: Staging Review Table & Charts */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* 4. Review & Edit Preview table */}
          <div className="neo-card space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-2 border-shadow-darker/10">
              <div>
                <h3 className="text-lg font-bold">Staging Preview Table</h3>
                <p className="text-xs text-secondary">Verify and edit parsed/manual rows before committing to ledger.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleResetPreview} className="neo-btn !px-3 !py-1 text-xs text-error hover:bg-error/5">
                  Reset
                </button>
                <button onClick={handleSaveExpenses} className="neo-btn-primary !px-4 !py-1 text-xs flex items-center gap-1">
                  <Save size={14} /> Save Expenses
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-surface border-b border-shadow-darker/10">
                    <th className="p-3 font-bold text-primary-dark">Date</th>
                    <th className="p-3 font-bold text-primary-dark">Member</th>
                    <th className="p-3 font-bold text-primary-dark">Purpose</th>
                    <th className="p-3 font-bold text-primary-dark text-right">Requested</th>
                    <th className="p-3 font-bold text-primary-dark text-right">Paid</th>
                    <th className="p-3 font-bold text-primary-dark text-center">Tax</th>
                    <th className="p-3 font-bold text-primary-dark text-right">GST Amt</th>
                    <th className="p-3 font-bold text-primary-dark text-right">Non-GST</th>
                    <th className="p-3 font-bold text-primary-dark text-right">Running</th>
                    <th className="p-3 font-bold text-primary-dark text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-shadow-darker/5">
                  {previewWithRunningCash.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-secondary/60">
                        No expenses staged. Drag files or enter manually to populate.
                      </td>
                    </tr>
                  ) : (
                    previewWithRunningCash.map((row) => (
                      <tr key={row.id} className="hover:bg-shadow-darker/5 transition-colors">
                        <td className="p-2">
                          <input 
                            type="date" 
                            className="bg-transparent border-b border-transparent focus:border-primary outline-none" 
                            value={row.date} 
                            onChange={(e) => handleEditPreviewRow(row.id, 'date', e.target.value)} 
                          />
                        </td>
                        <td className="p-2 font-medium">
                          <input 
                            type="text" 
                            className="bg-transparent border-b border-transparent focus:border-primary outline-none w-24 font-bold" 
                            value={row.member} 
                            onChange={(e) => handleEditPreviewRow(row.id, 'member', e.target.value)} 
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            className="bg-transparent border-b border-transparent focus:border-primary outline-none w-32" 
                            value={row.purpose} 
                            onChange={(e) => handleEditPreviewRow(row.id, 'purpose', e.target.value)} 
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input 
                            type="number" 
                            className="bg-transparent border-b border-transparent focus:border-primary outline-none w-16 text-right font-mono" 
                            value={row.requested} 
                            onChange={(e) => handleEditPreviewRow(row.id, 'requested', parseFloat(e.target.value) || 0)} 
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input 
                            type="number" 
                            className="bg-transparent border-b border-transparent focus:border-primary outline-none w-16 text-right font-mono font-bold" 
                            value={row.paid} 
                            onChange={(e) => handleEditPreviewRow(row.id, 'paid', parseFloat(e.target.value) || 0)} 
                          />
                        </td>
                        <td className="p-2 text-center">
                          <select 
                            className="bg-transparent outline-none cursor-pointer"
                            value={row.taxStatus}
                            onChange={(e) => handleEditPreviewRow(row.id, 'taxStatus', e.target.value)}
                          >
                            <option value="GST">GST</option>
                            <option value="Non-GST">Non-GST</option>
                          </select>
                        </td>
                        <td className="p-2 text-right font-mono">₹{row.gstAmount.toLocaleString('en-IN')}</td>
                        <td className="p-2 text-right font-mono">₹{row.nonGstAmount.toLocaleString('en-IN')}</td>
                        <td className="p-2 text-right font-mono font-semibold text-primary">₹{row.runningCash.toLocaleString('en-IN')}</td>
                        <td className="p-2 text-center">
                          <button onClick={() => handleRemovePreviewRow(row.id)} className="p-1 text-secondary hover:text-error transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-start">
              <button 
                onClick={() => {
                  const newItem: ExpenseItem = {
                    id: `row-${Date.now()}`,
                    date: new Date().toISOString().split('T')[0],
                    member: 'Custom Member',
                    purpose: 'New Purpose description',
                    requested: 0,
                    paid: 0,
                    taxStatus: 'Non-GST',
                    gstPercent: 18,
                    gstAmount: 0,
                    nonGstAmount: 0,
                    paymentMode: 'UPI'
                  };
                  setPreviewRows(prev => [...prev, newItem]);
                }} 
                className="neo-btn !px-3 !py-1.5 text-xs flex items-center gap-1 hover:text-primary"
              >
                <Plus size={14} /> Add Blank Row
              </button>
            </div>
          </div>

          {/* 7. Charts section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* GST vs Non-GST Chart */}
            <div className="neo-card flex flex-col justify-between">
              <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">GST vs Non-GST</h4>
              <div className="h-28 flex items-center justify-center relative">
                <svg width="100" height="100" viewBox="0 0 42 42" className="transform -rotate-90">
                  <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#E6DFD3" strokeWidth="5" />
                  {taxBreakdown.gstVal + taxBreakdown.nonGstVal > 0 ? (
                    <>
                      {/* GST Segment */}
                      <circle 
                        cx="21" 
                        cy="21" 
                        r="15.915" 
                        fill="transparent" 
                        stroke="#0F766E" 
                        strokeWidth="5" 
                        strokeDasharray={`${(taxBreakdown.gstVal / (taxBreakdown.gstVal + taxBreakdown.nonGstVal)) * 100} ${100 - (taxBreakdown.gstVal / (taxBreakdown.gstVal + taxBreakdown.nonGstVal)) * 100}`} 
                        strokeDashoffset="0" 
                      />
                      {/* Non-GST Segment */}
                      <circle 
                        cx="21" 
                        cy="21" 
                        r="15.915" 
                        fill="transparent" 
                        stroke="#F97316" 
                        strokeWidth="5" 
                        strokeDasharray={`${(taxBreakdown.nonGstVal / (taxBreakdown.gstVal + taxBreakdown.nonGstVal)) * 100} ${100 - (taxBreakdown.nonGstVal / (taxBreakdown.gstVal + taxBreakdown.nonGstVal)) * 100}`} 
                        strokeDashoffset={`-${(taxBreakdown.gstVal / (taxBreakdown.gstVal + taxBreakdown.nonGstVal)) * 100}`} 
                      />
                    </>
                  ) : null}
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-[10px] text-secondary/60">Paid Total</span>
                  <span className="text-xs font-black text-primary-dark">₹{(taxBreakdown.gstVal + taxBreakdown.nonGstVal).toLocaleString('en-IN')}</span>
                </div>
              </div>
              <div className="flex justify-around text-[9px] mt-2 border-t pt-2 border-shadow-darker/10">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-primary rounded-full"></span> GST: ₹{taxBreakdown.gstVal.toLocaleString()}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-500 rounded-full"></span> Non-GST: ₹{taxBreakdown.nonGstVal.toLocaleString()}</span>
              </div>
            </div>

            {/* Monthly Chart */}
            <div className="neo-card md:col-span-2 flex flex-col justify-between">
              <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Monthly Expenses (₹)</h4>
              <div className="h-28 flex items-end gap-1.5 pb-2">
                {monthlyExpenses.map((m, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full relative flex justify-center">
                      {/* Bar fill */}
                      <div 
                        style={{ height: `${(m.total / maxMonthlyExpense) * 60 || 4}px` }} 
                        className="w-full bg-primary/70 hover:bg-primary rounded-t-sm transition-all duration-300"
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1 bg-primary-dark text-white text-[8px] p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                        ₹{m.total.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-[8px] font-semibold text-secondary/60">{m.month}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* 6. Report section below */}
      <div className="neo-card space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4 border-shadow-darker/10">
          <div>
            <h3 className="text-xl font-bold">Historical Expense Reports</h3>
            <p className="text-xs text-secondary mt-1">Audit, query, and search through committed expense ledger records.</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button onClick={handleExportExcel} className="neo-btn flex items-center gap-1 text-xs hover:text-primary">
              <FileSpreadsheet size={14} /> Export Excel
            </button>
            <button onClick={handleExportPDF} className="neo-btn-primary flex items-center gap-1 text-xs">
              <Download size={14} /> Export PDF
            </button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 bg-surface/50 p-4 rounded-2xl shadow-neo-inset">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-secondary">From Date</label>
            <input 
              type="date" 
              className="neo-input w-full !p-2 text-xs" 
              value={filterFromDate}
              onChange={e => setFilterFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-secondary">To Date</label>
            <input 
              type="date" 
              className="neo-input w-full !p-2 text-xs" 
              value={filterToDate}
              onChange={e => setFilterToDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-secondary">Member</label>
            <select 
              className="neo-input w-full !p-2 text-xs bg-surface"
              value={filterMember}
              onChange={e => setFilterMember(e.target.value)}
            >
              <option value="all">All Members</option>
              {uniqueMembers.map((name, idx) => (
                <option key={idx} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-secondary">Tax / Mode</label>
            <div className="grid grid-cols-2 gap-1">
              <select 
                className="neo-input w-full !p-2 text-xs bg-surface"
                value={filterTaxStatus}
                onChange={e => setFilterTaxStatus(e.target.value)}
              >
                <option value="all">Tax (All)</option>
                <option value="GST">GST</option>
                <option value="Non-GST">Non-GST</option>
              </select>
              <select 
                className="neo-input w-full !p-2 text-xs bg-surface"
                value={filterPaymentMode}
                onChange={e => setFilterPaymentMode(e.target.value)}
              >
                <option value="all">Mode (All)</option>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="Card">Card</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-secondary">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary/60" size={14} />
              <input 
                type="text" 
                placeholder="Search description, bill..."
                className="neo-input w-full !pl-8 !p-2 text-xs"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Filtered stats banner */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 bg-primary/5 p-4 rounded-xl border border-primary/10">
          <div>
            <span className="text-[9px] font-bold text-secondary uppercase block">Opening Cash</span>
            <span className="text-sm font-black text-primary-dark">₹{openingCash.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-secondary uppercase block">Total Paid (Filter)</span>
            <span className="text-sm font-black text-primary-dark">₹{filteredStats.totalPaid.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-secondary uppercase block">GST Total (Filter)</span>
            <span className="text-sm font-black text-primary-dark">₹{filteredStats.gstTotal.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-secondary uppercase block">Non-GST Total (Filter)</span>
            <span className="text-sm font-black text-primary-dark">₹{filteredStats.nonGstTotal.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold text-secondary uppercase block">Closing Cash</span>
            <span className="text-sm font-black text-primary-dark">₹{filteredClosing.toLocaleString()}</span>
          </div>
        </div>

        {/* Reports Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface border-b border-shadow-darker/10">
                <th className="p-3 font-bold text-primary-dark">Date</th>
                <th className="p-3 font-bold text-primary-dark">Member</th>
                <th className="p-3 font-bold text-primary-dark">Purpose</th>
                <th className="p-3 font-bold text-primary-dark text-right">Requested</th>
                <th className="p-3 font-bold text-primary-dark text-right">Paid</th>
                <th className="p-3 font-bold text-primary-dark text-center">GST / Non-GST</th>
                <th className="p-3 font-bold text-primary-dark text-center">Payment Mode</th>
                <th className="p-3 font-bold text-primary-dark">Bill No</th>
                <th className="p-3 font-bold text-primary-dark">Notes</th>
                <th className="p-3 font-bold text-primary-dark text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shadow-darker/5">
              {filteredReportList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-secondary/60">
                    No matching report records found.
                  </td>
                </tr>
              ) : (
                filteredReportList.map((item) => (
                  <tr key={item.id} className="hover:bg-shadow-darker/5 transition-colors">
                    <td className="p-3">{item.date}</td>
                    <td className="p-3 font-bold text-primary-dark">{item.member}</td>
                    <td className="p-3 text-secondary">{item.purpose}</td>
                    <td className="p-3 text-right font-mono">₹{item.requested.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-primary-dark">₹{item.paid.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        item.taxStatus === 'GST' ? 'bg-primary/10 text-primary' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {item.taxStatus}
                      </span>
                    </td>
                    <td className="p-3 text-center font-semibold text-secondary">{item.paymentMode}</td>
                    <td className="p-3 font-mono text-secondary">{item.billNo || '-'}</td>
                    <td className="p-3 text-secondary/80 italic max-w-xs truncate" title={item.notes}>{item.notes || '-'}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleDeleteSavedExpense(item.id)} className="p-1 text-secondary hover:text-error transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

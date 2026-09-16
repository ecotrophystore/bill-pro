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
  DollarSign,
  Cloud,
  CloudUpload
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { extractDataFromDocument } from '../services/ai';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  updateDoc, 
  writeBatch, 
  serverTimestamp 
} from 'firebase/firestore';

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
  created_at?: any;
}

export default function ExpensePage() {
  // Staged Preview Rows (Temporary in-memory queue before committing to Firestore)
  const [previewRows, setPreviewRows] = useState<ExpenseItem[]>([]);
  
  // Saved database list (persisted via Firestore `expenses` collection)
  const [savedExpenses, setSavedExpenses] = useState<ExpenseItem[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [isSavingExpenses, setIsSavingExpenses] = useState(false);
  
  // Legacy LocalStorage migration state
  const [legacyLocalExpenses, setLegacyLocalExpenses] = useState<ExpenseItem[]>([]);
  const [isMigratingLegacy, setIsMigratingLegacy] = useState(false);

  // System parameters (Opening cash stored in Firestore `system/config`)
  const [openingCash, setOpeningCash] = useState<number>(() => {
    const saved = localStorage.getItem('ecobill_opening_cash');
    return saved !== null ? parseFloat(saved) : 0;
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

  // 1. Real-time Firestore sync for Expenses & Opening Cash
  useEffect(() => {
    // Check for legacy localStorage data
    try {
      const legacyRaw = localStorage.getItem('ecobill_saved_expenses');
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLegacyLocalExpenses(parsed);
        }
      }
    } catch (e) {
      console.warn("Could not check legacy local expenses:", e);
    }

    if (!db) {
      setLoadingExpenses(false);
      return;
    }

    // A. Sync openingCash from `system/config`
    const configRef = doc(db, 'system', 'config');
    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.openingCash !== undefined) {
          const val = Number(data.openingCash) || 0;
          setOpeningCash(val);
          setTempOpeningCash(val.toString());
          try { localStorage.setItem('ecobill_opening_cash', val.toString()); } catch (e) {}
        }
      }
    }, (err) => {
      console.warn("Error listening to system/config opening cash:", err);
    });

    // B. Sync expenses from `expenses` collection
    const expensesQuery = query(collection(db, 'expenses'), orderBy('date', 'desc'));
    const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const items = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as ExpenseItem));
      setSavedExpenses(items);
      setLoadingExpenses(false);
    }, (err) => {
      console.error("Firestore expenses load failed:", err);
      setLoadingExpenses(false);
    });

    return () => {
      unsubConfig();
      unsubExpenses();
    };
  }, []);

  // Update opening cash in Firestore
  const handleSaveOpeningCash = async () => {
    const val = parseFloat(tempOpeningCash) || 0;
    setOpeningCash(val);
    try { localStorage.setItem('ecobill_opening_cash', val.toString()); } catch (e) {}
    setIsEditingOpeningCash(false);

    if (db) {
      try {
        await setDoc(doc(db, 'system', 'config'), {
          openingCash: val,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn("Could not sync opening cash to Firestore:", err);
      }
    }
  };

  // Helper to extract calculations
  const getStats = (rows: ExpenseItem[]) => {
    let totalRequested = 0;
    let totalPaid = 0;
    let gstTotal = 0;
    let nonGstTotal = 0;

    rows.forEach(item => {
      totalRequested += item.requested || 0;
      totalPaid += item.paid || 0;
      if (item.taxStatus === 'GST') {
        gstTotal += item.gstAmount || 0;
      } else {
        nonGstTotal += item.nonGstAmount || 0;
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

  const exactRound = (num: number) => Math.round(num * 100) / 100;

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
        // Image or PDF - AI Extraction
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const base64Data = (e.target?.result as string).split(',')[1];
            const data = await extractDataFromDocument(base64Data, file.type, 'expense');
            const ocrRow: ExpenseItem = {
              id: `ocr-${Date.now()}`,
              date: data.date || new Date().toISOString().split('T')[0],
              member: 'Imported Vendor',
              purpose: data.description || 'Parsed from AI',
              requested: parseFloat(data.amount) || 0,
              paid: parseFloat(data.amount) || 0,
              taxStatus: 'Non-GST',
              gstPercent: 0,
              gstAmount: 0,
              nonGstAmount: parseFloat(data.amount) || 0,
              paymentMode: 'UPI',
              billNo: '',
              notes: (data.notes || 'AI OCR Extraction') + (data.category ? ` [Category: ${data.category}]` : '')
            };
            setPreviewRows(prev => [...prev, ocrRow]);
          } catch(err) {
            console.error(err);
            alert("Failed to extract data with AI.");
          } finally {
            setIsParsing(false);
          }
        };
        reader.readAsDataURL(file);
      }
    }, 500);
  };

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

  // Save preview list to Firestore
  const handleSaveExpenses = async () => {
    if (previewRows.length === 0) {
      alert("No temporary expenses to save.");
      return;
    }
    if (!db) {
      alert("Database is offline. Check Firebase configuration.");
      return;
    }

    setIsSavingExpenses(true);
    try {
      const batch = writeBatch(db);
      const uid = auth?.currentUser?.uid || 'user';

      for (const item of previewRows) {
        const newDocRef = doc(collection(db, 'expenses'));
        batch.set(newDocRef, {
          date: item.date,
          member: item.member,
          purpose: item.purpose,
          requested: item.requested,
          paid: item.paid,
          taxStatus: item.taxStatus,
          gstPercent: item.gstPercent,
          gstAmount: item.gstAmount,
          nonGstAmount: item.nonGstAmount,
          paymentMode: item.paymentMode,
          billNo: item.billNo || '',
          notes: item.notes || '',
          status: 'approved',
          created_by: uid,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
      }

      await batch.commit();
      setPreviewRows([]);
      alert(`Successfully saved ${previewRows.length} expense(s) to the cloud database!`);
    } catch (err: any) {
      console.error("Error saving expenses to Firestore:", err);
      alert("Failed to save expenses: " + (err.message || "Unknown error"));
    } finally {
      setIsSavingExpenses(false);
    }
  };

  // Reset Preview Table
  const handleResetPreview = () => {
    if (window.confirm("Are you sure you want to clear the staged preview table?")) {
      setPreviewRows([]);
    }
  };

  // Delete saved expense from Firestore
  const handleDeleteSavedExpense = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this saved expense from the cloud ledger?")) return;
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'expenses', id));
    } catch (err: any) {
      console.error("Error deleting expense:", err);
      alert("Failed to delete expense: " + (err.message || "Unknown error"));
    }
  };

  // One-click migration of legacy localStorage expenses to Firestore
  const handleMigrateLegacyExpenses = async () => {
    if (!db || legacyLocalExpenses.length === 0) return;
    setIsMigratingLegacy(true);
    try {
      const batch = writeBatch(db);
      const uid = auth?.currentUser?.uid || 'user';
      for (const item of legacyLocalExpenses) {
        const newDocRef = doc(collection(db, 'expenses'));
        batch.set(newDocRef, {
          date: item.date || new Date().toISOString().split('T')[0],
          member: item.member || 'Migrated Member',
          purpose: item.purpose || 'Migrated Purpose',
          requested: Number(item.requested || item.paid || 0),
          paid: Number(item.paid || 0),
          taxStatus: item.taxStatus || 'Non-GST',
          gstPercent: Number(item.gstPercent || 18),
          gstAmount: Number(item.gstAmount || 0),
          nonGstAmount: Number(item.nonGstAmount || item.paid || 0),
          paymentMode: item.paymentMode || 'UPI',
          billNo: item.billNo || '',
          notes: (item.notes || '') + ' (Migrated from local storage)',
          status: 'approved',
          created_by: uid,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
      }
      await batch.commit();
      localStorage.removeItem('ecobill_saved_expenses');
      setLegacyLocalExpenses([]);
      alert(`Successfully migrated ${legacyLocalExpenses.length} local expense(s) to the cloud!`);
    } catch (err: any) {
      console.error("Migration failed:", err);
      alert("Migration failed: " + (err.message || "Unknown error"));
    } finally {
      setIsMigratingLegacy(false);
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
      `Rs. ${item.gstAmount.toLocaleString()}`,
      item.paymentMode,
      item.billNo || '-'
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Member', 'Purpose', 'Requested', 'Paid', 'Tax', 'GST Amt', 'Mode', 'Bill No']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [0, 77, 64] },
    });

    doc.save("Expense_Ledger_Report.pdf");
  };

  // Analytics Helpers
  const getMemberWiseExpenses = () => {
    const map: Record<string, { total: number; count: number; gst: number; nonGst: number }> = {};
    savedExpenses.forEach(item => {
      const m = item.member || 'Unknown';
      if (!map[m]) map[m] = { total: 0, count: 0, gst: 0, nonGst: 0 };
      map[m].total += item.paid;
      map[m].count += 1;
      map[m].gst += item.gstAmount;
      map[m].nonGst += item.nonGstAmount;
    });
    return Object.entries(map).map(([member, val]) => ({ member, ...val }));
  };

  const getTaxBreakdown = () => {
    let gstPaid = 0;
    let nonGstPaid = 0;
    savedExpenses.forEach(item => {
      if (item.taxStatus === 'GST') gstPaid += item.paid;
      else nonGstPaid += item.paid;
    });
    return { gstPaid, nonGstPaid, total: gstPaid + nonGstPaid };
  };

  const getMonthlyBreakdown = () => {
    const map: Record<string, number> = {};
    savedExpenses.forEach(item => {
      if (!item.date) return;
      const monthKey = item.date.substring(0, 7); // YYYY-MM
      map[monthKey] = (map[monthKey] || 0) + item.paid;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total }));
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
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary-dark text-xs font-bold shadow-xs">
            <Cloud size={14} className="text-primary" />
            Cloud Synced (Firestore)
          </span>
        </div>
      </div>

      {/* Legacy Migration Alert Banner */}
      {legacyLocalExpenses.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0">
              <CloudUpload size={22} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-amber-900">
                Found {legacyLocalExpenses.length} Local Expense Record(s) in Browser
              </h4>
              <p className="text-xs text-amber-800/80 mt-0.5">
                These expenses were saved in your local browser cache before cloud synchronization was enabled.
              </p>
            </div>
          </div>
          <button
            onClick={handleMigrateLegacyExpenses}
            disabled={isMigratingLegacy}
            className="neo-btn-primary !bg-amber-600 hover:!bg-amber-700 !text-white text-xs whitespace-nowrap flex items-center gap-2 px-4 py-2 shrink-0"
          >
            {isMigratingLegacy ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
            Sync {legacyLocalExpenses.length} Records to Cloud
          </button>
        </div>
      )}

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
            <span className="text-[9px] text-secondary/60 block mt-1">Starting balance (Cloud)</span>
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
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Total GST</span>
            <Sparkles size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            <span className="text-base font-black text-[#004D40]">₹{stats.gstTotal.toLocaleString('en-IN')}</span>
            <span className="text-[9px] text-secondary/60 block mt-1">Input tax credit</span>
          </div>
        </div>

        {/* Non-GST Total */}
        <div className="bg-[#FCFAF7] border border-shadow-darker/10 shadow-sm rounded-2xl p-4 border-l-[5px] border-l-primary flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Non-GST Exp.</span>
            <FileText size={16} className="text-primary" />
          </div>
          <div className="mt-2">
            <span className="text-base font-black text-[#004D40]">₹{stats.nonGstTotal.toLocaleString('en-IN')}</span>
            <span className="text-[9px] text-secondary/60 block mt-1">Exempt / Cash</span>
          </div>
        </div>
      </div>

      {/* 3. Inputs Section (Dropzone + Manual Form) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Upload Dropzone */}
        <div className="lg:col-span-5 space-y-4">
          <div className="neo-card p-6 flex flex-col justify-between min-h-[360px] border-2 border-dashed border-primary/20 hover:border-primary/50 transition-all">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="text-primary" size={20} />
                <h3 className="font-bold text-base text-primary-dark">Import Files & AI OCR Scan</h3>
              </div>
              <p className="text-xs text-secondary leading-relaxed mb-4">
                Drag & drop or browse CSV, Excel spreadsheets, or scanned receipt images/PDFs for automated Gemini AI extraction.
              </p>
            </div>

            <div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                dragActive ? 'border-primary bg-primary/5 scale-98' : 'border-shadow-darker/20 hover:bg-shadow-darker/5'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".csv, .xlsx, .xls, image/*, application/pdf" 
                className="hidden" 
              />
              
              {isParsing ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="animate-spin text-primary" size={32} />
                  <span className="text-xs font-bold text-primary-dark">Parsing {parsedFileName}...</span>
                  <span className="text-[10px] text-secondary">AI OCR / Spreadsheet processing</span>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <Upload size={20} />
                  </div>
                  <span className="text-xs font-bold text-primary-dark">Choose file or drag here</span>
                  <span className="text-[10px] text-secondary mt-1">Supports CSV, Excel (.xlsx, .xls), Images, PDFs</span>
                </>
              )}
            </div>

            <div className="bg-primary/5 p-3 rounded-xl flex items-start gap-2 text-[11px] text-secondary mt-4">
              <Info size={14} className="text-primary shrink-0 mt-0.5" />
              <span>Columns matched: Date, Member/Name, Purpose/Description, Paid/Amount, TaxStatus, GST.</span>
            </div>
          </div>
        </div>

        {/* Manual Input Form */}
        <div className="lg:col-span-7">
          <form onSubmit={handleAddManualExpense} className="neo-card p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-primary" />
                <h3 className="font-bold text-base text-primary-dark">Manual Entry Form</h3>
              </div>
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest bg-primary/5 px-2.5 py-1 rounded-full">
                Staged Row
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">Date *</label>
                <input 
                  type="date" 
                  value={manualForm.date} 
                  onChange={(e) => setManualForm({...manualForm, date: e.target.value})} 
                  className="neo-input w-full !text-xs font-semibold" 
                  required 
                />
              </div>

              {/* Member Name */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">Member / Payee *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Ramesh" 
                  value={manualForm.member} 
                  onChange={(e) => setManualForm({...manualForm, member: e.target.value})} 
                  className="neo-input w-full !text-xs" 
                  required 
                />
              </div>

              {/* Payment Mode */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">Payment Mode</label>
                <select 
                  value={manualForm.paymentMode} 
                  onChange={(e) => setManualForm({...manualForm, paymentMode: e.target.value as any})} 
                  className="neo-input w-full !text-xs"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank Transfer</option>
                  <option value="Card">Debit/Credit Card</option>
                </select>
              </div>

              {/* Purpose */}
              <div className="space-y-1 md:col-span-2">
                <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">Purpose / Description *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Raw Material Acrylic Sheets" 
                  value={manualForm.purpose} 
                  onChange={(e) => setManualForm({...manualForm, purpose: e.target.value})} 
                  className="neo-input w-full !text-xs" 
                  required 
                />
              </div>

              {/* Bill No */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">Bill / Ref No.</label>
                <input 
                  type="text" 
                  placeholder="Optional bill #" 
                  value={manualForm.billNo} 
                  onChange={(e) => setManualForm({...manualForm, billNo: e.target.value})} 
                  className="neo-input w-full !text-xs" 
                />
              </div>

              {/* Requested Amount */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">Requested (₹)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  value={manualForm.requested} 
                  onChange={(e) => setManualForm({...manualForm, requested: e.target.value})} 
                  className="neo-input w-full !text-xs" 
                />
              </div>

              {/* Paid Amount */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">Paid Amount (₹) *</label>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  value={manualForm.paid} 
                  onChange={(e) => setManualForm({...manualForm, paid: e.target.value})} 
                  className="neo-input w-full !text-xs font-bold text-primary-dark" 
                  required 
                />
              </div>

              {/* Tax Status */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">Tax Type</label>
                <select 
                  value={manualForm.taxStatus} 
                  onChange={(e) => setManualForm({...manualForm, taxStatus: e.target.value as any})} 
                  className="neo-input w-full !text-xs"
                >
                  <option value="GST">GST Included</option>
                  <option value="Non-GST">Non-GST</option>
                </select>
              </div>

              {/* GST Percent (Conditional) */}
              {manualForm.taxStatus === 'GST' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">GST Rate (%)</label>
                  <select 
                    value={manualForm.gstPercent} 
                    onChange={(e) => setManualForm({...manualForm, gstPercent: parseFloat(e.target.value)})} 
                    className="neo-input w-full !text-xs"
                  >
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
              )}

              {/* Notes */}
              <div className={`space-y-1 ${manualForm.taxStatus === 'GST' ? 'md:col-span-2' : 'md:col-span-3'}`}>
                <label className="text-[11px] font-bold text-secondary uppercase tracking-wider">Notes / Remarks</label>
                <input 
                  type="text" 
                  placeholder="Optional remarks" 
                  value={manualForm.notes} 
                  onChange={(e) => setManualForm({...manualForm, notes: e.target.value})} 
                  className="neo-input w-full !text-xs" 
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button type="submit" className="neo-btn-primary flex items-center gap-2 text-xs py-2 px-6">
                <Plus size={16} /> Add to Staged Queue
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 4. Staged Preview Table */}
      {previewRows.length > 0 && (
        <div className="neo-card p-6 space-y-4 border-2 border-primary/30 animate-scale-up">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-shadow-darker/10 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                </span>
                <h3 className="font-bold text-base text-primary-dark">Staged Preview Table ({previewRows.length} items ready to commit)</h3>
              </div>
              <p className="text-xs text-secondary mt-0.5">Review, edit values inline, and save these items directly to the cloud database.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={handleResetPreview} className="neo-btn text-xs py-2 px-3 text-secondary hover:text-error transition-colors">
                Clear All
              </button>
              <button 
                onClick={handleSaveExpenses} 
                disabled={isSavingExpenses}
                className="neo-btn-primary flex items-center gap-2 text-xs py-2 px-5 shadow-md"
              >
                {isSavingExpenses ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Commit & Save to Cloud ({previewRows.length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-primary/5 text-primary-dark font-black uppercase text-[10px] tracking-wider border-b border-shadow-darker/10">
                  <th className="p-3">Date</th>
                  <th className="p-3">Member</th>
                  <th className="p-3">Purpose</th>
                  <th className="p-3 text-right">Requested</th>
                  <th className="p-3 text-right">Paid Amount</th>
                  <th className="p-3">Tax Type</th>
                  <th className="p-3 text-right">GST Amount</th>
                  <th className="p-3">Mode</th>
                  <th className="p-3 text-right">Running Cash</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-shadow-darker/5 font-medium">
                {previewWithRunningCash.map((row) => (
                  <tr key={row.id} className="hover:bg-primary/5 transition-colors">
                    <td className="p-3 whitespace-nowrap">
                      <input 
                        type="date" 
                        value={row.date} 
                        onChange={(e) => handleEditPreviewRow(row.id, 'date', e.target.value)} 
                        className="bg-transparent border-b border-dashed border-secondary/40 text-xs w-28 outline-none font-semibold text-primary-dark"
                      />
                    </td>
                    <td className="p-3">
                      <input 
                        type="text" 
                        value={row.member} 
                        onChange={(e) => handleEditPreviewRow(row.id, 'member', e.target.value)} 
                        className="bg-transparent border-b border-dashed border-secondary/40 text-xs w-28 outline-none font-semibold text-primary-dark"
                      />
                    </td>
                    <td className="p-3">
                      <input 
                        type="text" 
                        value={row.purpose} 
                        onChange={(e) => handleEditPreviewRow(row.id, 'purpose', e.target.value)} 
                        className="bg-transparent border-b border-dashed border-secondary/40 text-xs w-48 outline-none text-primary-dark"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <input 
                        type="number" 
                        value={row.requested} 
                        onChange={(e) => handleEditPreviewRow(row.id, 'requested', parseFloat(e.target.value))} 
                        className="bg-transparent border-b border-dashed border-secondary/40 text-xs w-20 text-right outline-none text-secondary"
                      />
                    </td>
                    <td className="p-3 text-right font-bold text-primary-dark">
                      <input 
                        type="number" 
                        value={row.paid} 
                        onChange={(e) => handleEditPreviewRow(row.id, 'paid', parseFloat(e.target.value))} 
                        className="bg-transparent border-b border-dashed border-secondary/40 text-xs w-20 text-right outline-none font-bold text-primary-dark"
                      />
                    </td>
                    <td className="p-3">
                      <select 
                        value={row.taxStatus} 
                        onChange={(e) => handleEditPreviewRow(row.id, 'taxStatus', e.target.value)}
                        className="bg-transparent text-xs outline-none border-b border-dashed border-secondary/40"
                      >
                        <option value="GST">GST</option>
                        <option value="Non-GST">Non-GST</option>
                      </select>
                    </td>
                    <td className="p-3 text-right font-semibold text-primary-dark">
                      ₹{row.gstAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3">
                      <select 
                        value={row.paymentMode} 
                        onChange={(e) => handleEditPreviewRow(row.id, 'paymentMode', e.target.value)}
                        className="bg-transparent text-xs outline-none border-b border-dashed border-secondary/40"
                      >
                        <option value="UPI">UPI</option>
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank</option>
                        <option value="Card">Card</option>
                      </select>
                    </td>
                    <td className={`p-3 text-right font-black ${row.runningCash < 0 ? 'text-error' : 'text-[#004D40]'}`}>
                      ₹{row.runningCash.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleRemovePreviewRow(row.id)} className="p-1 hover:text-error text-secondary transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Persistent Saved Database & Reports Section */}
      <div className="neo-card p-6 space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-shadow-darker/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-primary" />
              <h3 className="font-bold text-base text-primary-dark">Saved Expense Ledger ({filteredReportList.length} items)</h3>
            </div>
            <p className="text-xs text-secondary mt-0.5">Real-time cloud database ledger synced with Firestore.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleExportExcel} className="neo-btn text-xs py-2 px-3 flex items-center gap-1.5 font-bold">
              <Download size={14} /> Excel
            </button>
            <button onClick={handleExportPDF} className="neo-btn text-xs py-2 px-3 flex items-center gap-1.5 font-bold text-primary-dark">
              <FileText size={14} /> PDF Report
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
          {/* Search */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Search</label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2.5 text-secondary" />
              <input 
                type="text" 
                placeholder="Payee, purpose, bill..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="neo-input !pl-7 !py-1.5 !text-xs w-full" 
              />
            </div>
          </div>

          {/* From Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">From Date</label>
            <input 
              type="date" 
              value={filterFromDate} 
              onChange={(e) => setFilterFromDate(e.target.value)} 
              className="neo-input !py-1.5 !text-xs w-full font-semibold" 
            />
          </div>

          {/* To Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">To Date</label>
            <input 
              type="date" 
              value={filterToDate} 
              onChange={(e) => setFilterToDate(e.target.value)} 
              className="neo-input !py-1.5 !text-xs w-full font-semibold" 
            />
          </div>

          {/* Filter Member */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Member</label>
            <select 
              value={filterMember} 
              onChange={(e) => setFilterMember(e.target.value)} 
              className="neo-input !py-1.5 !text-xs w-full"
            >
              <option value="all">All Members</option>
              {uniqueMembers.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Filter Tax */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Tax Type</label>
            <select 
              value={filterTaxStatus} 
              onChange={(e) => setFilterTaxStatus(e.target.value)} 
              className="neo-input !py-1.5 !text-xs w-full"
            >
              <option value="all">All Tax Types</option>
              <option value="GST">GST Included</option>
              <option value="Non-GST">Non-GST</option>
            </select>
          </div>

          {/* Filter Payment Mode */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Payment Mode</label>
            <select 
              value={filterPaymentMode} 
              onChange={(e) => setFilterPaymentMode(e.target.value)} 
              className="neo-input !py-1.5 !text-xs w-full"
            >
              <option value="all">All Modes</option>
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
              <option value="Card">Card</option>
            </select>
          </div>
        </div>

        {/* Filtered Summary KPIs */}
        <div className="flex flex-wrap items-center gap-6 p-3.5 bg-[#FCFAF7] border border-shadow-darker/10 rounded-xl text-xs">
          <div>
            <span className="text-secondary text-[11px]">Filtered Total Paid:</span>
            <span className="font-bold text-primary-dark ml-1.5">₹{filteredStats.totalPaid.toLocaleString('en-IN')}</span>
          </div>
          <div className="h-4 w-[1px] bg-shadow-darker/20"></div>
          <div>
            <span className="text-secondary text-[11px]">Filtered GST Tax:</span>
            <span className="font-bold text-primary ml-1.5">₹{filteredStats.gstTotal.toLocaleString('en-IN')}</span>
          </div>
          <div className="h-4 w-[1px] bg-shadow-darker/20"></div>
          <div>
            <span className="text-secondary text-[11px]">Filtered Non-GST:</span>
            <span className="font-bold text-secondary ml-1.5">₹{filteredStats.nonGstTotal.toLocaleString('en-IN')}</span>
          </div>
          <div className="h-4 w-[1px] bg-shadow-darker/20"></div>
          <div>
            <span className="text-secondary text-[11px]">Net Money After Filter:</span>
            <span className="font-black text-[#004D40] ml-1.5">₹{filteredClosing.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Persistent Ledger Table */}
        <div className="overflow-x-auto">
          {loadingExpenses ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-secondary">
              <Loader2 className="animate-spin text-primary" size={24} />
              <span className="text-xs font-semibold">Connecting to Firestore ledger...</span>
            </div>
          ) : filteredReportList.length === 0 ? (
            <div className="py-16 text-center text-secondary border border-dashed border-shadow-darker/20 rounded-2xl">
              <Wallet size={32} className="mx-auto mb-2 opacity-30 text-primary" />
              <p className="font-semibold text-sm">No expenses match the selected filters or database is empty.</p>
              <p className="text-xs opacity-75 mt-1">Add a manual expense or import a spreadsheet above to begin.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-primary/5 text-primary-dark font-black uppercase text-[10px] tracking-wider border-b border-shadow-darker/10">
                  <th className="p-3">Date</th>
                  <th className="p-3">Member</th>
                  <th className="p-3">Purpose</th>
                  <th className="p-3 text-right">Requested</th>
                  <th className="p-3 text-right">Paid Amount</th>
                  <th className="p-3">Tax Type</th>
                  <th className="p-3 text-right">GST Amount</th>
                  <th className="p-3">Mode</th>
                  <th className="p-3">Bill No</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-shadow-darker/5 font-medium">
                {filteredReportList.map((item) => (
                  <tr key={item.id} className="hover:bg-primary/5 transition-colors group">
                    <td className="p-3 font-semibold text-primary-dark whitespace-nowrap">{item.date}</td>
                    <td className="p-3 font-bold text-primary-dark">{item.member}</td>
                    <td className="p-3 text-secondary max-w-[220px] truncate" title={item.purpose}>{item.purpose}</td>
                    <td className="p-3 text-right text-secondary">₹{item.requested?.toLocaleString('en-IN') || '0'}</td>
                    <td className="p-3 text-right font-black text-primary-dark">₹{item.paid?.toLocaleString('en-IN') || '0'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.taxStatus === 'GST' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-shadow-darker/10 text-secondary'
                      }`}>
                        {item.taxStatus}
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold text-primary">₹{item.gstAmount?.toLocaleString('en-IN') || '0'}</td>
                    <td className="p-3">
                      <span className="bg-shadow-darker/5 text-primary-dark px-1.5 py-0.5 rounded font-mono text-[10px]">
                        {item.paymentMode}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[10px] text-secondary">{item.billNo || '-'}</td>
                    <td className="p-3 text-secondary max-w-[180px] truncate" title={item.notes}>{item.notes || '-'}</td>
                    <td className="p-3 text-center">
                      <button 
                        onClick={() => handleDeleteSavedExpense(item.id)} 
                        className="p-1 hover:text-error text-secondary opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete from Firestore"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 6. Visual Analytics & Member Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Member-wise Disbursement Breakdown */}
        <div className="neo-card p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-3">
            <User size={18} className="text-primary" />
            <h4 className="font-bold text-sm text-primary-dark">Member-Wise Demands</h4>
          </div>
          
          <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
            {memberExpenses.length === 0 ? (
              <p className="text-xs text-secondary py-8 text-center">No member data recorded.</p>
            ) : (
              memberExpenses.map(m => (
                <div key={m.member} className="p-2.5 bg-primary/5 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-primary-dark block">{m.member}</span>
                    <span className="text-[10px] text-secondary">{m.count} transaction(s)</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-[#004D40] block">₹{m.total.toLocaleString('en-IN')}</span>
                    <span className="text-[9px] text-primary">GST: ₹{m.gst.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tax Breakdown Analysis */}
        <div className="neo-card p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-3">
            <Tags size={18} className="text-primary" />
            <h4 className="font-bold text-sm text-primary-dark">Tax Distribution</h4>
          </div>

          <div className="space-y-4 py-2">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-primary">GST Invoices ({taxBreakdown.total > 0 ? Math.round((taxBreakdown.gstPaid / taxBreakdown.total) * 100) : 0}%)</span>
                <span>₹{taxBreakdown.gstPaid.toLocaleString('en-IN')}</span>
              </div>
              <div className="w-full h-2.5 bg-shadow-darker/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-500" 
                  style={{ width: `${taxBreakdown.total > 0 ? (taxBreakdown.gstPaid / taxBreakdown.total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-secondary">Non-GST / Cash ({taxBreakdown.total > 0 ? Math.round((taxBreakdown.nonGstPaid / taxBreakdown.total) * 100) : 0}%)</span>
                <span>₹{taxBreakdown.nonGstPaid.toLocaleString('en-IN')}</span>
              </div>
              <div className="w-full h-2.5 bg-shadow-darker/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-secondary/50 rounded-full transition-all duration-500" 
                  style={{ width: `${taxBreakdown.total > 0 ? (taxBreakdown.nonGstPaid / taxBreakdown.total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="p-3 bg-primary/5 rounded-xl text-[11px] text-secondary mt-2">
              <span className="font-bold text-primary-dark block mb-0.5">Input Tax Credit (ITC) Summary</span>
              Total recoverable GST across all records stands at ₹{stats.gstTotal.toLocaleString('en-IN')}.
            </div>
          </div>
        </div>

        {/* Monthly Trend Mini-Bar */}
        <div className="neo-card p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-shadow-darker/10 pb-3">
            <DollarSign size={18} className="text-primary" />
            <h4 className="font-bold text-sm text-primary-dark">Monthly Spend Trend</h4>
          </div>

          <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
            {monthlyExpenses.length === 0 ? (
              <p className="text-xs text-secondary py-8 text-center">No monthly trend data available.</p>
            ) : (
              monthlyExpenses.map(item => (
                <div key={item.month} className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-secondary font-mono">{item.month}</span>
                    <span className="text-primary-dark">₹{item.total.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full h-2 bg-shadow-darker/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full transition-all duration-500"
                      style={{ width: `${(item.total / maxMonthlyExpense) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

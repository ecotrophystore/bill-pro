import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Camera, FileText, CheckCircle, AlertTriangle, Loader2, Edit3, Trash2, Plus } from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../contexts/AuthContext';
import type { Purchase, PurchaseItem } from '../types';

type Step = 'entry_method' | 'upload' | 'processing' | 'review' | 'confirmation';

export default function CreatePurchase() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('entry_method');
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [purchaseId, setPurchaseId] = useState<string>('');
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [originalData, setOriginalData] = useState<any>(null);

  const [formData, setFormData] = useState<Partial<Purchase>>({
    status: 'draft',
    vendor: { name: '', address: '', gst_number: '', phone: '' },
    invoice: { invoice_number: '', invoice_date: '', payment_method: '' },
    items: [],
    taxAmount: 0,
    grandTotal: 0,
    category: 'Expenses',
    overallConfidence: 0,
    duplicateDetected: false
  });

  const [confidenceInfo, setConfidenceInfo] = useState<any>({});

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 20 * 1024 * 1024) {
        alert("File size exceeds 20MB limit.");
        return;
      }
      setFile(selectedFile);
      setStep('upload');
      uploadFileAndProcess(selectedFile);
    }
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        return resolve(file); // Don't compress PDFs or non-images
      }

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              const newFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(newFile);
            } else {
              resolve(file);
            }
          }, 'image/jpeg', 0.7); // 70% quality JPEG
        };
        img.onerror = () => resolve(file);
      };
      reader.onerror = () => resolve(file);
    });
  };

  const uploadFileAndProcess = async (selectedFile: File) => {
    if (!user) return;
    try {
      setStep('processing');
      setProcessingStatus('Analyzing document...');
      
      const pId = `PUR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      setPurchaseId(pId);
      
      const fileToProcess = await compressImage(selectedFile);
      
      const reader = new FileReader();
      reader.readAsDataURL(fileToProcess);
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          await extractData(base64Data, fileToProcess.type, pId, fileToProcess.name);
        } catch (err) {
          console.error("Extraction failed", err);
          setErrorMsg("Extraction failed. Please try manual entry.");
          setStep('review');
        }
      };
      reader.onerror = () => {
        setErrorMsg("Failed to read file.");
        setStep('review');
      };
    } catch (err) {
      console.error(err);
      setErrorMsg("Error initiating processing.");
      setStep('review');
    }
  };

  const extractData = async (base64Data: string, mimeType: string, pId: string, fileName: string) => {
    try {
      const extractInvoiceData = httpsCallable(functions, 'extractInvoiceData');
      
      const result = await extractInvoiceData({
        base64Data,
        mimeType,
        userId: user?.uid,
        purchaseId: pId,
        fileName
      });

      const data = (result.data as any).data;
      
      setProcessingStatus('Checking for duplicates...');
      
      // Duplicate Check
      let isDuplicate = false;
      const q = query(collection(db, 'purchases'), 
        where('vendor.name', '==', data.vendor?.name || ''),
        where('invoice.invoice_number', '==', data.invoice?.invoice_number || '')
      );
      const dupSnapshot = await getDocs(q);
      
      // Filter further by grandTotal to avoid index requirement limitations
      const dupDocs = dupSnapshot.docs.filter(d => d.data().grandTotal === data.grandTotal);
      if (dupDocs.length > 0) {
        isDuplicate = true;
        setDuplicateWarning(true);
      }

      setFormData({
        ...formData,
        vendor: data.vendor || formData.vendor,
        invoice: data.invoice || formData.invoice,
        items: data.items || [],
        taxAmount: data.taxAmount || 0,
        grandTotal: data.grandTotal || 0,
        category: data.category || 'Expenses',
        overallConfidence: data.overallConfidence || 0,
        duplicateDetected: isDuplicate,
        manualReviewRequired: data.manualReviewRequired || false
      });
      
      setOriginalData(data);
      setConfidenceInfo(data.confidence || {});
      setStep('review');

      // Optional: you can upload the file to storage asynchronously here if you want to save it.
      // But we bypass it for the critical path to make extraction instant.

    } catch (err: any) {
      console.error("Extraction failed", err);
      setErrorMsg("Extraction failed. You can continue with manual entry.");
      setStep('review'); // Allow manual entry fallback
    }
  };

  const handleFieldChange = (section: 'vendor' | 'invoice', field: string, value: any) => {
    // We could log to ai_learning_feedback here, but doing it on submit is better
    setFormData({
      ...formData,
      [section]: {
        ...(formData[section as keyof typeof formData] as any),
        [field]: value
      }
    });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...(formData.items || [])];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    const newItems = [...(formData.items || []), { itemName: '', quantity: 1, unitPrice: 0, total: 0 }];
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index: number) => {
    const newItems = [...(formData.items || [])];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const submitPurchase = async () => {
    if (!user) return;
    try {
      setProcessingStatus('Submitting...');
      const finalData = {
        ...formData,
        id: purchaseId || `PUR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
        userId: user.uid,
        status: 'submitted',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        date: formData.invoice?.invoice_date ? Timestamp.fromDate(new Date(formData.invoice.invoice_date)) : Timestamp.now()
      };

      await addDoc(collection(db, 'purchases'), finalData);

      // Log activity
      await addDoc(collection(db, 'purchase_activity_logs'), {
        purchaseId: finalData.id,
        userId: user.uid,
        action: 'submitted',
        timestamp: Timestamp.now()
      });

      // AI Learning Feedback (compare original vs final)
      if (originalData) {
        const checkField = async (field: string, orig: any, final: any) => {
          if (orig !== final && orig !== undefined && final !== undefined) {
            await addDoc(collection(db, 'ai_learning_feedback'), {
              purchaseId: finalData.id,
              userId: user.uid,
              field,
              predictedValue: orig,
              correctedValue: final,
              timestamp: Timestamp.now()
            });
          }
        };

        await checkField('category', originalData.category, finalData.category);
        await checkField('vendor_name', originalData.vendor?.name, finalData.vendor?.name);
        await checkField('invoice_number', originalData.invoice?.invoice_number, finalData.invoice?.invoice_number);
        await checkField('grandTotal', originalData.grandTotal, finalData.grandTotal);
      }

      setStep('confirmation');
    } catch (err) {
      console.error(err);
      alert("Failed to submit purchase.");
    }
  };

  const getConfidenceColor = (score: number) => {
    if (!score) return 'bg-gray-100 text-gray-800';
    if (score >= 90) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 80) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in p-4">
      
      {step === 'entry_method' && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
          <h1 className="text-3xl font-bold text-primary-dark">Create New Purchase</h1>
          <p className="text-secondary text-center max-w-md">Upload an invoice to automatically extract details, or enter them manually.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="neo-card flex flex-col items-center justify-center p-12 cursor-pointer hover:bg-primary/5 transition-colors border-2 border-dashed border-primary/30 hover:border-primary"
            >
              <Upload size={48} className="text-primary mb-4" />
              <h3 className="text-xl font-bold text-primary-dark mb-2">Upload Invoice</h3>
              <p className="text-sm text-secondary text-center">Drag & drop or click to browse. Supports PDF, JPG, PNG (Max 20MB)</p>
              <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept=".pdf,.jpg,.jpeg,.png" />
            </div>

            <div 
              onClick={() => { setPurchaseId(`PUR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`); setStep('review'); }}
              className="neo-card flex flex-col items-center justify-center p-12 cursor-pointer hover:bg-primary/5 transition-colors"
            >
              <FileText size={48} className="text-primary mb-4" />
              <h3 className="text-xl font-bold text-primary-dark mb-2">Manual Entry</h3>
              <p className="text-sm text-secondary text-center">Fill out the purchase details manually if you don't have a digital invoice.</p>
            </div>
          </div>
          
          <button onClick={() => cameraInputRef.current?.click()} className="neo-btn flex items-center gap-2">
            <Camera size={20} /> Use Mobile Camera
          </button>
          <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileSelect} />
        </div>
      )}

      {step === 'processing' && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
          <Loader2 size={64} className="text-primary animate-spin" />
          <h2 className="text-2xl font-bold text-primary-dark">{processingStatus}</h2>
          {uploadProgress >= 0 && uploadProgress <= 100 && (
            <div className="w-full max-w-md bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-4">
              <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${Math.max(5, uploadProgress)}%` }}></div>
            </div>
          )}
          <p className="text-secondary animate-pulse">Our AI is reading the document and classifying the purchase...</p>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-primary-dark">Review Purchase Details</h1>
            <div className="flex gap-4">
              <button onClick={() => setStep('entry_method')} className="neo-btn">Cancel</button>
              <button onClick={submitPurchase} className="neo-btn-primary">Submit Purchase</button>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded neo-card">
              <p className="font-bold">Notice</p>
              <p>{errorMsg}</p>
            </div>
          )}

          {duplicateWarning && (
            <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 rounded neo-card flex justify-between items-center">
              <div>
                <p className="font-bold flex items-center gap-2"><AlertTriangle size={18}/> Possible Duplicate Detected</p>
                <p className="text-sm mt-1">An invoice from this vendor with the same number and amount already exists.</p>
              </div>
              <button onClick={() => setDuplicateWarning(false)} className="px-4 py-2 bg-white rounded shadow text-sm font-bold">Continue Anyway</button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column: Preview */}
            <div className="neo-card h-[800px] flex flex-col">
              <h3 className="font-bold text-lg mb-4 border-b pb-2">Invoice Preview</h3>
              <div className="flex-1 bg-gray-100 rounded flex items-center justify-center overflow-hidden relative">
                {fileUrl ? (
                  <iframe src={fileUrl} className="w-full h-full border-0" title="Invoice Preview" />
                ) : (
                  <div className="text-gray-400 flex flex-col items-center">
                    <FileText size={48} className="mb-2 opacity-50" />
                    <p>No preview available (Manual Entry)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Form */}
            <div className="space-y-6 overflow-y-auto max-h-[800px] pr-2">
              
              {/* Vendor Section */}
              <div className="neo-card space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-bold text-lg text-primary-dark">Vendor Details</h3>
                  {confidenceInfo.vendor_name && (
                    <span className={`text-xs px-2 py-1 rounded-full font-bold border ${getConfidenceColor(confidenceInfo.vendor_name)}`}>
                      Confidence: {confidenceInfo.vendor_name}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-secondary uppercase mb-1 block">Vendor Name</label>
                    <input type="text" className="neo-input w-full" value={formData.vendor?.name || ''} onChange={(e) => handleFieldChange('vendor', 'name', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-secondary uppercase mb-1 block">GST Number</label>
                    <input type="text" className="neo-input w-full" value={formData.vendor?.gst_number || ''} onChange={(e) => handleFieldChange('vendor', 'gst_number', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-secondary uppercase mb-1 block">Address</label>
                    <input type="text" className="neo-input w-full" value={formData.vendor?.address || ''} onChange={(e) => handleFieldChange('vendor', 'address', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Invoice Section */}
              <div className="neo-card space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-bold text-lg text-primary-dark">Invoice Details</h3>
                  {confidenceInfo.invoice_number && (
                    <span className={`text-xs px-2 py-1 rounded-full font-bold border ${getConfidenceColor(confidenceInfo.invoice_number)}`}>
                      Confidence: {confidenceInfo.invoice_number}%
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-secondary uppercase mb-1 block">Invoice Number</label>
                    <input type="text" className="neo-input w-full" value={formData.invoice?.invoice_number || ''} onChange={(e) => handleFieldChange('invoice', 'invoice_number', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-secondary uppercase mb-1 block">Date</label>
                    <input type="date" className="neo-input w-full" value={formData.invoice?.invoice_date || ''} onChange={(e) => handleFieldChange('invoice', 'invoice_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-secondary uppercase mb-1 block">Category</label>
                    <select className="neo-input w-full" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>
                      <option value="Asset">Asset</option>
                      <option value="Subscription">Subscription</option>
                      <option value="Production">Production</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Expenses">Expenses</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-secondary uppercase mb-1 block">Payment Method</label>
                    <input type="text" className="neo-input w-full" value={formData.invoice?.payment_method || ''} onChange={(e) => handleFieldChange('invoice', 'payment_method', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Items Section */}
              <div className="neo-card space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-bold text-lg text-primary-dark">Purchase Items</h3>
                  <button onClick={addItem} className="text-xs flex items-center gap-1 text-primary font-bold hover:underline">
                    <Plus size={14} /> Add Row
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-secondary border-b">
                        <th className="pb-2">Item Name</th>
                        <th className="pb-2 w-20 text-center">Qty</th>
                        <th className="pb-2 w-24 text-right">Price</th>
                        <th className="pb-2 w-24 text-right">Total</th>
                        <th className="pb-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items?.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="py-2 pr-2">
                            <input type="text" className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary outline-none" value={item.itemName} onChange={e => handleItemChange(idx, 'itemName', e.target.value)} />
                          </td>
                          <td className="py-2 pr-2">
                            <input type="number" className="w-full text-center bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary outline-none" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', Number(e.target.value))} />
                          </td>
                          <td className="py-2 pr-2">
                            <input type="number" className="w-full text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary outline-none" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', Number(e.target.value))} />
                          </td>
                          <td className="py-2 text-right font-bold">
                            ₹{(item.quantity * item.unitPrice).toLocaleString()}
                          </td>
                          <td className="py-2 text-right">
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="flex flex-col items-end pt-4 space-y-2 border-t">
                  <div className="flex justify-between w-48 text-sm">
                    <span className="text-secondary">Tax Amount:</span>
                    <input type="number" className="w-24 text-right bg-transparent border-b border-transparent hover:border-gray-300 outline-none" value={formData.taxAmount} onChange={e => setFormData({...formData, taxAmount: Number(e.target.value)})} />
                  </div>
                  <div className="flex justify-between w-48 font-bold text-lg text-primary-dark">
                    <span>Grand Total:</span>
                    <input type="number" className="w-24 text-right bg-transparent border-b border-transparent hover:border-gray-300 outline-none" value={formData.grandTotal} onChange={e => setFormData({...formData, grandTotal: Number(e.target.value)})} />
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'confirmation' && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
          <CheckCircle size={64} className="text-green-500" />
          <h2 className="text-3xl font-bold text-primary-dark">Purchase Submitted</h2>
          <div className="neo-card w-full max-w-md text-center space-y-2">
            <p className="text-secondary">Purchase ID</p>
            <p className="font-mono text-xl font-bold">{purchaseId}</p>
            <div className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold uppercase tracking-wider mt-4">
              Pending Approval
            </div>
          </div>
          <button onClick={() => navigate('/purchases')} className="neo-btn-primary mt-8">View All Purchases</button>
        </div>
      )}

    </div>
  );
}

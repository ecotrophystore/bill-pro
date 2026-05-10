import { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import { 
  Upload, ShoppingBag, X, Check, AlertTriangle, Image as ImageIcon, 
  Loader2, ChevronDown, ChevronUp, Package, FileSpreadsheet, ArrowRight,
  CheckCircle2, Store
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { useToast } from './Shared/Toast';



interface ParsedProduct {
  id: string;
  name: string;
  description: string;
  vendor: string;
  category: string;
  tags: string[];
  sku: string;
  retail_price: number;
  wholesale_price: number;
  image_url: string;
  image_alt: string;
  size: string;
  variants: { option: string; value: string; price: number; sku: string }[];
  selected: boolean;
  status: 'ready' | 'importing' | 'done' | 'error';
  errorMsg?: string;
}

// Strip HTML tags from Shopify body_html
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

export default function ShopifyImportModal({ isOpen, onClose, onImportComplete }: {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResults, setImportResults] = useState({ success: 0, failed: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState('');

  const resetState = () => {
    setStep('upload');
    setParsedProducts([]);
    setExpandedProduct(null);
    setImportProgress({ current: 0, total: 0 });
    setImportResults({ success: 0, failed: 0 });
    setParseError('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const parseShopifyCSV = useCallback((file: File) => {
    setParseError('');
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => 
        header.trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_') // Replace any non-alphanumeric char with underscore
          .replace(/^_+|_+$/g, ''),    // Remove leading/trailing underscores
      complete: (results) => {
        if (results.errors.length > 0) {
          setParseError(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
          return;
        }

        const rows = results.data as Record<string, string>[];
        
        if (rows.length === 0) {
          setParseError('CSV file is empty. No products found.');
          return;
        }

        // Shopify CSV uses multiple rows per product (for variants)
        // Group by Handle — each unique handle is one product
        const productMap = new Map<string, Record<string, string>[]>();
        
        rows.forEach(row => {
          const handle = row.handle || row.title?.toLowerCase().replace(/\s+/g, '-') || '';
          if (!handle) return;
          
          if (!productMap.has(handle)) {
            productMap.set(handle, []);
          }
          productMap.get(handle)!.push(row);
        });

        const products: ParsedProduct[] = [];
        let idx = 0;

        productMap.forEach((rows, handle) => {
          // First row has the main product info
          const mainRow = rows[0];
          const title = mainRow.title || handle;
          
          // Find the image — Shopify puts image in "image_src" column
          const imageUrl = mainRow.image_src || rows.find(r => r.image_src)?.image_src || '';

          // Parse price
          const price = parseFloat(mainRow.variant_price || mainRow.price || '0') || 0;
          const comparePrice = parseFloat(mainRow.variant_compare_at_price || mainRow.compare_at_price || '0') || 0;
          
          // Determine retail vs wholesale
          const retailPrice = comparePrice > price ? comparePrice : price;
          const wholesalePrice = comparePrice > 0 && comparePrice < retailPrice ? comparePrice : Math.round(retailPrice * 0.85);

          // Parse variants
          const variants = rows.map(r => ({
            option: r.option1_name || 'Default',
            value: r.option1_value || 'Default',
            price: parseFloat(r.variant_price || r.price || '0') || price,
            sku: r.variant_sku || r.sku || ''
          })).filter(v => v.value && v.value !== 'Default Title');

          // Build size from option values
          const sizeOption = rows[0].option1_name?.toLowerCase() === 'size' 
            ? rows.map(r => r.option1_value).filter(Boolean).join(', ')
            : '';

          // Tags
          const tags = (mainRow.tags || '')
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);

          products.push({
            id: `shopify_${idx++}_${handle}`,
            name: title,
            description: stripHtml(mainRow.body_html || mainRow.body_html_ || mainRow.description || ''),
            vendor: mainRow.vendor || '',
            category: mainRow.product_type || mainRow.type || mainRow.product_category || '',
            tags,
            sku: mainRow.variant_sku || mainRow.sku || '',
            retail_price: retailPrice,
            wholesale_price: wholesalePrice,
            image_url: imageUrl || mainRow.variant_image || '',
            image_alt: mainRow.image_alt_text || mainRow.variant_image_alt_text || title,
            size: sizeOption,
            variants,
            selected: true,
            status: 'ready'
          });
        });

        if (products.length === 0) {
          setParseError('No valid products found. Make sure this is a Shopify products CSV export.');
          return;
        }

        setParsedProducts(products);
        setStep('preview');
      },
      error: (error) => {
        setParseError(`Failed to parse CSV: ${error.message}`);
      }
    });
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseShopifyCSV(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      parseShopifyCSV(file);
    } else {
      setParseError('Please drop a valid .csv file');
    }
  }, [parseShopifyCSV]);

  const toggleProduct = (id: string) => {
    setParsedProducts(prev => prev.map(p => 
      p.id === id ? { ...p, selected: !p.selected } : p
    ));
  };

  const toggleAll = (selected: boolean) => {
    setParsedProducts(prev => prev.map(p => ({ ...p, selected })));
  };

  const handleImport = async () => {
    if (!db) {
      showToast('Database not available.', 'error');
      return;
    }

    const selectedProducts = parsedProducts.filter(p => p.selected);
    if (selectedProducts.length === 0) {
      showToast('No products selected for import.', 'error');
      return;
    }

    setStep('importing');
    setImportProgress({ current: 0, total: selectedProducts.length });
    let success = 0;
    let failed = 0;

    // Import in batches of 20 (Firestore batch limit is 500)
    const BATCH_SIZE = 20;
    
    for (let i = 0; i < selectedProducts.length; i += BATCH_SIZE) {
      const batchProducts = selectedProducts.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const product of batchProducts) {
        try {
          const docRef = doc(collection(db, 'products'));
          batch.set(docRef, {
            name: product.name,
            description: product.description || '',
            hsn_code: '',
            retail_price: product.retail_price,
            wholesale_price: product.wholesale_price,
            tax_percentage: 0,
            category: product.category || '',
            size: product.size || '',
            specifications: product.tags || [],
            image_url: product.image_url || '',
            vendor: product.vendor || '',
            sku: product.sku || '',
            created_at: new Date(),
            source: 'shopify_import'
          });

          // Update status in UI
          setParsedProducts(prev => prev.map(p => 
            p.id === product.id ? { ...p, status: 'importing' } : p
          ));
        } catch (err: any) {
          setParsedProducts(prev => prev.map(p => 
            p.id === product.id ? { ...p, status: 'error', errorMsg: err.message } : p
          ));
          failed++;
        }
      }

      try {
        await batch.commit();
        // Mark batch as done
        for (const product of batchProducts) {
          setParsedProducts(prev => prev.map(p => 
            p.id === product.id && p.status !== 'error' ? { ...p, status: 'done' } : p
          ));
          if (parsedProducts.find(p => p.id === product.id)?.status !== 'error') {
            success++;
          }
        }
      } catch (err: any) {
        for (const product of batchProducts) {
          setParsedProducts(prev => prev.map(p => 
            p.id === product.id ? { ...p, status: 'error', errorMsg: err.message } : p
          ));
        }
        failed += batchProducts.length;
      }

      setImportProgress({ current: Math.min(i + BATCH_SIZE, selectedProducts.length), total: selectedProducts.length });
      
      // Small delay between batches
      if (i + BATCH_SIZE < selectedProducts.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    setImportResults({ success, failed });
    setStep('done');
    
    if (success > 0) {
      showToast(`Successfully imported ${success} products from Shopify!`, 'success');
      onImportComplete();
    }
  };

  const selectedCount = parsedProducts.filter(p => p.selected).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-surface rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-in">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-shadow-darker/10 bg-gradient-to-r from-[#96bf48]/10 to-primary/5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#96bf48] rounded-xl text-white shadow-lg">
              <Store size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary-dark">Shopify Import</h2>
              <p className="text-xs text-secondary">Import products with photos from Shopify CSV export</p>
            </div>
          </div>
          <button onClick={handleClose} className="neo-btn !p-2 !rounded-full hover:bg-error/10 hover:text-error transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="p-8">
              {/* Instructions */}
              <div className="bg-[#96bf48]/5 border border-[#96bf48]/20 rounded-2xl p-5 mb-8">
                <h3 className="font-bold text-primary-dark flex items-center gap-2 mb-3">
                  <FileSpreadsheet size={18} className="text-[#96bf48]" />
                  How to export from Shopify
                </h3>
                <ol className="text-sm text-secondary space-y-2 ml-6 list-decimal">
                  <li>Go to <strong>Shopify Admin → Products</strong></li>
                  <li>Click <strong>Export</strong> at the top of the product list</li>
                  <li>Select <strong>"All products"</strong> and format <strong>"CSV for Excel"</strong></li>
                  <li>Click <strong>Export products</strong> and download the CSV</li>
                  <li>Upload the downloaded CSV file below</li>
                </ol>
              </div>

              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
                  transition-all duration-300 group
                  ${isDragging 
                    ? 'border-[#96bf48] bg-[#96bf48]/10 scale-[1.02]' 
                    : 'border-shadow-darker/20 hover:border-[#96bf48]/50 hover:bg-[#96bf48]/5'
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className={`
                  mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-4 transition-all
                  ${isDragging ? 'bg-[#96bf48] text-white scale-110' : 'bg-[#96bf48]/10 text-[#96bf48] group-hover:scale-105'}
                `}>
                  <Upload size={36} />
                </div>
                <p className="text-lg font-bold text-primary-dark">
                  {isDragging ? 'Drop your CSV here!' : 'Drop Shopify CSV or click to browse'}
                </p>
                <p className="text-sm text-secondary mt-2">
                  Supports <strong>products_export.csv</strong> from Shopify Admin
                </p>
              </div>

              {/* Parse Error */}
              {parseError && (
                <div className="mt-4 bg-error/10 border border-error/20 text-error rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                  <p className="text-sm">{parseError}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="p-6">
              {/* Summary Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#96bf48]/10 rounded-xl">
                    <ShoppingBag size={20} className="text-[#96bf48]" />
                  </div>
                  <div>
                    <p className="font-bold text-primary-dark">{parsedProducts.length} products found</p>
                    <p className="text-xs text-secondary">{selectedCount} selected for import</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => toggleAll(true)}
                    className="neo-btn text-xs !px-3 !py-1.5"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => toggleAll(false)}
                    className="neo-btn text-xs !px-3 !py-1.5"
                  >
                    Deselect All
                  </button>
                  <button 
                    onClick={() => { resetState(); }}
                    className="neo-btn text-xs !px-3 !py-1.5 text-secondary"
                  >
                    Re-upload
                  </button>
                </div>
              </div>

              {/* Product List */}
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {parsedProducts.map(product => (
                  <div 
                    key={product.id}
                    className={`
                      rounded-2xl border transition-all duration-200
                      ${product.selected 
                        ? 'border-[#96bf48]/30 bg-[#96bf48]/5 shadow-sm' 
                        : 'border-shadow-darker/10 bg-surface opacity-60'
                      }
                    `}
                  >
                    <div className="flex items-center gap-4 p-4">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleProduct(product.id)}
                        className={`
                          w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all
                          ${product.selected 
                            ? 'bg-[#96bf48] border-[#96bf48] text-white' 
                            : 'border-shadow-darker/20 hover:border-[#96bf48]'
                          }
                        `}
                      >
                        {product.selected && <Check size={14} strokeWidth={3} />}
                      </button>

                      {/* Image */}
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-shadow-darker/5 shrink-0 border border-shadow-darker/10">
                        {product.image_url ? (
                          <img 
                            src={product.image_url} 
                            alt={product.image_alt || product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-secondary/30">
                            <ImageIcon size={20} />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-primary-dark text-sm truncate">{product.name}</h4>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {product.vendor && (
                            <span className="px-2 py-0.5 bg-primary/10 rounded text-[10px] font-bold text-primary uppercase">
                              {product.vendor}
                            </span>
                          )}
                          {product.category && (
                            <span className="px-2 py-0.5 bg-shadow-darker/5 rounded text-[10px] font-mono text-secondary">
                              {product.category}
                            </span>
                          )}
                          {product.sku && (
                            <span className="px-2 py-0.5 bg-shadow-darker/5 rounded text-[10px] font-mono text-secondary">
                              SKU: {product.sku}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary-dark">₹ {product.retail_price.toLocaleString()}</p>
                        <p className="text-[10px] text-secondary">retail</p>
                      </div>

                      {/* Expand */}
                      <button 
                        onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                        className="neo-btn !p-1.5 !rounded-lg shrink-0"
                      >
                        {expandedProduct === product.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {/* Expanded Details */}
                    {expandedProduct === product.id && (
                      <div className="px-4 pb-4 pt-0 border-t border-shadow-darker/5 mt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                          {/* Large Image */}
                          {product.image_url && (
                            <div className="rounded-xl overflow-hidden border border-shadow-darker/10 aspect-square bg-white">
                              <img 
                                src={product.image_url} 
                                alt={product.name}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          )}
                          
                          {/* Details */}
                          <div className={`space-y-3 ${product.image_url ? 'sm:col-span-2' : 'sm:col-span-3'}`}>
                            {product.description && (
                              <div>
                                <label className="text-[10px] font-bold text-secondary/60 uppercase">Description</label>
                                <p className="text-xs text-secondary line-clamp-3 mt-1">{product.description}</p>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-secondary/60 uppercase">Retail Price</label>
                                <p className="text-sm font-bold text-primary-dark">₹ {product.retail_price.toLocaleString()}</p>
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-secondary/60 uppercase">Wholesale Price</label>
                                <p className="text-sm font-bold text-success">₹ {product.wholesale_price.toLocaleString()}</p>
                              </div>
                            </div>
                            {product.tags.length > 0 && (
                              <div>
                                <label className="text-[10px] font-bold text-secondary/60 uppercase">Tags</label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {product.tags.map((tag, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-shadow-darker/5 rounded-full text-[10px] text-secondary">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {product.variants.length > 0 && (
                              <div>
                                <label className="text-[10px] font-bold text-secondary/60 uppercase">Variants ({product.variants.length})</label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {product.variants.map((v, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-primary/10 rounded text-[10px] font-mono text-primary">
                                      {v.value} — ₹{v.price}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
              <div className="relative mb-8">
                <div className="w-24 h-24 rounded-full bg-[#96bf48]/10 flex items-center justify-center">
                  <Loader2 size={40} className="text-[#96bf48] animate-spin" />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-surface rounded-full px-3 py-1 shadow-lg border text-xs font-bold text-primary-dark">
                  {importProgress.current}/{importProgress.total}
                </div>
              </div>
              <h3 className="text-xl font-bold text-primary-dark mb-2">Importing Products...</h3>
              <p className="text-sm text-secondary mb-8">Please wait while we add your Shopify products to the library.</p>
              
              {/* Progress Bar */}
              <div className="w-full max-w-md">
                <div className="h-3 bg-shadow-darker/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#96bf48] to-[#5e8e3e] rounded-full transition-all duration-500"
                    style={{ width: `${(importProgress.current / Math.max(importProgress.total, 1)) * 100}%` }}
                  />
                </div>
                <p className="text-center text-xs text-secondary mt-2">
                  {Math.round((importProgress.current / Math.max(importProgress.total, 1)) * 100)}% complete
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-24 h-24 rounded-full bg-success/10 flex items-center justify-center mb-6">
                <CheckCircle2 size={48} className="text-success" />
              </div>
              <h3 className="text-2xl font-bold text-primary-dark mb-2">Import Complete!</h3>
              
              <div className="flex gap-6 mt-4 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-success">{importResults.success}</div>
                  <p className="text-xs text-secondary mt-1">Products Imported</p>
                </div>
                {importResults.failed > 0 && (
                  <div className="text-center">
                    <div className="text-3xl font-bold text-error">{importResults.failed}</div>
                    <p className="text-xs text-secondary mt-1">Failed</p>
                  </div>
                )}
              </div>

              <button onClick={handleClose} className="neo-btn-primary px-8 py-3 text-sm font-bold">
                Close & View Library
              </button>
            </div>
          )}
        </div>

        {/* Footer — only on preview step */}
        {step === 'preview' && (
          <div className="px-6 py-4 border-t border-shadow-darker/10 bg-surface flex items-center justify-between gap-4">
            <p className="text-sm text-secondary">
              <strong className="text-primary-dark">{selectedCount}</strong> of {parsedProducts.length} products selected
            </p>
            <div className="flex gap-3">
              <button onClick={handleClose} className="neo-btn px-6 py-2.5 text-sm">Cancel</button>
              <button 
                onClick={handleImport}
                disabled={selectedCount === 0}
                className="neo-btn-primary px-6 py-2.5 text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Package size={16} />
                Import {selectedCount} Products
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Product } from '../types';
import { Search, Plus, Edit, Trash2, X, Download, ChevronDown } from 'lucide-react';
import VoiceDictation from '../components/VoiceDictation';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ProductLibrary() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReportDropdown, setShowReportDropdown] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [taxPercentage, setTaxPercentage] = useState('18');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!db) return;
      try {
        const querySnapshot = await getDocs(collection(db, 'products'));
        const productsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];
        setProducts(productsData);
      } catch (error) {
        console.error("Error fetching products: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingProductId(null);
    setName('');
    setHsnCode('');
    setRetailPrice('');
    setWholesalePrice('');
    setTaxPercentage('18');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setModalMode('edit');
    setEditingProductId(product.id);
    setName(product.name || '');
    setHsnCode(product.hsn_code || '');
    setRetailPrice(product.retail_price?.toString() || '0');
    setWholesalePrice(product.wholesale_price?.toString() || '0');
    setTaxPercentage(product.tax_percentage?.toString() || '18');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert("Product name is required.");
    
    const rPrice = parseFloat(retailPrice || "0");
    const wPrice = parseFloat(wholesalePrice || "0");
    const tax = parseFloat(taxPercentage || "0");
    
    if (isNaN(rPrice) || isNaN(wPrice) || isNaN(tax)) {
      return alert("Please enter valid numbers for prices and tax percentage.");
    }

    setIsSaving(true);
    try {
      if (modalMode === 'add') {
        const docRef = await addDoc(collection(db, 'products'), {
          name: name.trim(),
          retail_price: rPrice,
          wholesale_price: wPrice,
          tax_percentage: tax,
          hsn_code: hsnCode.trim() || '0000',
          created_at: new Date()
        });
        
        const newProduct: Product = {
          id: docRef.id,
          name: name.trim(),
          retail_price: rPrice,
          wholesale_price: wPrice,
          tax_percentage: tax,
          hsn_code: hsnCode.trim() || '0000',
          created_at: new Date() as any
        };
        setProducts([newProduct, ...products]);
      } else {
        if (!editingProductId) return;
        const productRef = doc(db, 'products', editingProductId);
        await updateDoc(productRef, {
          name: name.trim(),
          retail_price: rPrice,
          wholesale_price: wPrice,
          tax_percentage: tax,
          hsn_code: hsnCode.trim() || '0000'
        });
        
        setProducts(products.map(p => p.id === editingProductId ? {
          ...p,
          name: name.trim(),
          retail_price: rPrice,
          wholesale_price: wPrice,
          tax_percentage: tax,
          hsn_code: hsnCode.trim() || '0000'
        } : p));
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving product:", err);
      alert("Failed to save product.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteDoc(doc(db, 'products', id));
      setProducts(products.filter(p => p.id !== id));
    } catch (err) {
      console.error("Error deleting product:", err);
      alert("Failed to delete product.");
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.hsn_code && product.hsn_code.includes(searchQuery))
  );

  const handleVoiceProduct = (_customerName: string | null, items: any[]) => {
    if (!items || items.length === 0) {
      alert("Could not extract any product details from voice.");
      return;
    }
    const item = items[0];
    setName(item.description || '');
    setHsnCode(item.hsn_code || '0000');
    setRetailPrice(item.rate?.toString() || '0');
    const rPrice = Number(item.rate) || 0;
    setWholesalePrice((item.priceTier === 'wholesale' ? rPrice : rPrice * 0.9).toString());
    setTaxPercentage(item.tax_percentage?.toString() || '18');
    setModalMode('add');
    setEditingProductId(null);
    setIsModalOpen(true);
  };

  const handleDownloadReport = (format: 'excel' | 'pdf') => {
    if (format === 'excel') {
      const reportData = filteredProducts.map(p => ({
        'Product Name': p.name,
        'HSN Code': p.hsn_code || 'N/A',
        'Retail Price (₹)': p.retail_price || 0,
        'Wholesale Price (₹)': p.wholesale_price || 0,
        'Tax Percentage (%)': p.tax_percentage || 0
      }));

      const ws = XLSX.utils.json_to_sheet(reportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");
      XLSX.writeFile(wb, "Products_Report.xlsx");
    } else {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Products Library Report", 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

      autoTable(doc, {
        startY: 40,
        head: [['Product Name', 'HSN Code', 'Retail Price', 'Wholesale Price', 'Tax %']],
        body: filteredProducts.map(p => [
          p.name,
          p.hsn_code || 'N/A',
          `Rs. ${p.retail_price || 0}`,
          `Rs. ${p.wholesale_price || 0}`,
          `${p.tax_percentage || 0}%`
        ]),
        theme: 'striped',
      });
      doc.save("Products_Report.pdf");
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">Product Library</h1>
          <p className="text-secondary mt-1">Manage your products and pricing</p>
        </div>
        <div className="flex gap-4 items-center">
          <VoiceDictation 
            onParsedItems={handleVoiceProduct} 
            functionName="parseVoiceCommand" 
            label="Voice Product" 
          />
          <div className="relative">
            <button 
              onClick={() => setShowReportDropdown(!showReportDropdown)} 
              className="neo-btn flex items-center gap-2"
            >
              <Download size={18} /> Report <ChevronDown size={14} />
            </button>
            {showReportDropdown && (
              <div 
                className="absolute right-0 mt-2 w-40 bg-surface border border-shadow-darker/20 rounded-xl shadow-neo-raised z-50 py-1"
                onMouseLeave={() => setShowReportDropdown(false)}
              >
                <button 
                  onClick={() => { handleDownloadReport('excel'); setShowReportDropdown(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-shadow-darker/5 transition-colors text-sm font-semibold text-secondary"
                >
                  Excel (.xlsx)
                </button>
                <button 
                  onClick={() => { handleDownloadReport('pdf'); setShowReportDropdown(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-shadow-darker/5 transition-colors text-sm font-semibold text-secondary"
                >
                  PDF (.pdf)
                </button>
              </div>
            )}
          </div>
          <button onClick={handleOpenAddModal} className="neo-btn-primary flex items-center gap-2">
            <Plus size={20} />
            Add Product
          </button>
        </div>
      </div>

      <div className="neo-card">
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={20} />
            <input 
              type="text" 
              placeholder="Search products..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="neo-input w-full pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-secondary">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-8 text-secondary">No products found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-secondary/20">
                  <th className="text-left py-3 px-4 text-primary-dark font-semibold">Name</th>
                  <th className="text-left py-3 px-4 text-primary-dark font-semibold">HSN Code</th>
                  <th className="text-right py-3 px-4 text-primary-dark font-semibold">Retail Price</th>
                  <th className="text-right py-3 px-4 text-primary-dark font-semibold">Wholesale Price</th>
                  <th className="text-right py-3 px-4 text-primary-dark font-semibold">Tax %</th>
                  <th className="text-right py-3 px-4 text-primary-dark font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(product => (
                  <tr key={product.id} className="border-b border-secondary/10 hover:bg-surface/50">
                    <td className="py-3 px-4 font-medium">{product.name}</td>
                    <td className="py-3 px-4 text-secondary">{product.hsn_code}</td>
                    <td className="py-3 px-4 text-right">₹{product.retail_price}</td>
                    <td className="py-3 px-4 text-right">₹{product.wholesale_price}</td>
                    <td className="py-3 px-4 text-right">{product.tax_percentage}%</td>
                    <td className="py-3 px-4 flex justify-end gap-2">
                      <button 
                        onClick={() => handleOpenEditModal(product)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Product"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteProduct(product.id!)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Product"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#fcf8f2] border-2 border-secondary/20 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-secondary/10">
              <h2 className="text-xl font-bold text-primary-dark">
                {modalMode === 'add' ? 'Add Product' : 'Edit Product'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-secondary hover:text-primary-dark transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1">Product Name *</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  required
                  placeholder="e.g. Acrylic Trophy"
                  className="neo-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1">HSN Code</label>
                <input 
                  type="text" 
                  value={hsnCode} 
                  onChange={(e) => setHsnCode(e.target.value)} 
                  placeholder="e.g. 39269099"
                  className="neo-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-primary-dark mb-1">Retail Price (₹) *</label>
                  <input 
                    type="number" 
                    value={retailPrice} 
                    onChange={(e) => setRetailPrice(e.target.value)} 
                    required
                    min="0"
                    step="any"
                    placeholder="0"
                    className="neo-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-primary-dark mb-1">Wholesale Price (₹) *</label>
                  <input 
                    type="number" 
                    value={wholesalePrice} 
                    onChange={(e) => setWholesalePrice(e.target.value)} 
                    required
                    min="0"
                    step="any"
                    placeholder="0"
                    className="neo-input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1">Tax Percentage (%) *</label>
                <select 
                  value={taxPercentage} 
                  onChange={(e) => setTaxPercentage(e.target.value)}
                  className="neo-input w-full bg-transparent"
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-secondary/10">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-secondary hover:text-primary-dark font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="neo-btn-primary px-6"
                >
                  {isSaving ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

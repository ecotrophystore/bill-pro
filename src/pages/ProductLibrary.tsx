import { useEffect, useState } from 'react';
import { Package, Search, Plus, Filter, Tag, ArrowRight, X, Store } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import type { Product } from '../types';
import { useToast } from '../components/Shared/Toast';
import ShopifyImportModal from '../components/ShopifyImport';

export default function ProductLibrary() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isShopifyModalOpen, setIsShopifyModalOpen] = useState(false);
  const { showToast } = useToast();
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '',
    category: '',
    retail_price: 0,
    wholesale_price: 0,
    description: '',
    size: ''
  });

  async function fetchProducts() {
    setLoading(true);
    try {
      if (!db) return;
      const querySnapshot = await getDocs(collection(db, 'products'));
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!db) return;
      await addDoc(collection(db, 'products'), {
        ...newProduct,
        specifications: [],
        created_at: new Date()
      });
      setIsAddModalOpen(false);
      setNewProduct({ name: '', category: '', retail_price: 0, wholesale_price: 0, description: '', size: '' });
      fetchProducts();
    } catch (err) {
      console.error("Error adding product:", err);
      showToast('Failed to add product. Check console for permissions.', 'error');
    }
  };

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];

  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = activeCategory === 'All' || p.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary-dark">Product Library</h1>
          <p className="text-secondary mt-1">Hierarchical inventory management with multi-tier pricing.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button 
            onClick={() => setIsShopifyModalOpen(true)}
            className="neo-btn flex items-center gap-2 !border-[#96bf48]/30 hover:!bg-[#96bf48]/10 transition-colors"
            style={{ color: '#5e8e3e' }}
          >
            <Store size={18} /> Shopify Import
          </button>
          <button className="neo-btn flex items-center gap-2">
            <Filter size={18} /> Categories
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="neo-btn-primary flex items-center gap-2"
          >
            <Plus size={20} /> Add Product
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 neo-card flex items-center gap-3 !py-3">
          <Search className="text-secondary" size={20} />
          <input 
            type="text" 
            placeholder="Search products, vendors, SKUs..." 
            className="bg-transparent border-none outline-none w-full text-primary-dark"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat!)}
              className={clsx(
                "px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all",
                activeCategory === cat ? "bg-primary text-white shadow-md" : "bg-surface neo-btn text-secondary hover:text-primary"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [1,2,3,4,5,6].map(i => <div key={i} className="neo-card h-56 animate-pulse bg-shadow-darker/5"></div>)
        ) : filtered.length > 0 ? (
          filtered.map(product => (
            <div key={product.id} className="neo-card flex flex-col group hover:scale-[1.02] transition-transform duration-300 overflow-hidden">
              {/* Product Image */}
              {product.image_url ? (
                <div className="w-full h-44 -mt-6 -mx-6 mb-4 overflow-hidden bg-white" style={{ width: 'calc(100% + 48px)' }}>
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-primary/10 rounded-2xl text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <Package size={24} />
                  </div>
                  {product.category && (
                    <div className="px-3 py-1 bg-surface-dark/50 rounded-full text-[10px] font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
                      <Tag size={10} /> {product.category}
                    </div>
                  )}
                </div>
              )}
              
              {/* Category badge on image products */}
              {product.image_url && product.category && (
                <div className="flex justify-between items-start mb-2">
                  <div className="px-3 py-1 bg-surface-dark/50 rounded-full text-[10px] font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
                    <Tag size={10} /> {product.category}
                  </div>
                  {product.vendor && (
                    <div className="px-3 py-1 bg-primary/10 rounded-full text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                      <Store size={10} /> {product.vendor}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1">
                <h3 className="text-lg font-bold text-primary-dark truncate capitalize">{product.name}</h3>
                <p className="text-xs text-secondary mt-1 line-clamp-2 min-h-[2rem]">
                  {product.description || 'No description available.'}
                </p>

                <div className="mt-4 flex flex-wrap gap-1">
                    {product.sku && (
                        <span className="px-2 py-0.5 bg-primary/10 rounded text-[10px] font-mono text-primary">
                            SKU: {product.sku}
                        </span>
                    )}
                    {product.size && (
                        <span className="px-2 py-0.5 bg-shadow-darker/5 rounded text-[10px] font-mono text-secondary">
                            SIZE: {product.size}
                        </span>
                    )}
                    {(product.specifications || []).slice(0, 3).map(spec => (
                        <span key={spec} className="px-2 py-0.5 bg-shadow-darker/5 rounded text-[10px] font-mono text-secondary">
                           {spec.toUpperCase()}
                        </span>
                    ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-shadow-darker/10">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-secondary/60 uppercase">Retail</label>
                        <div className="text-lg font-bold text-primary-dark">₹ {product.retail_price?.toLocaleString() || '0'}</div>
                    </div>
                    <div className="space-y-1 border-l border-shadow-darker/10 pl-4">
                        <label className="text-[10px] font-bold text-secondary/60 uppercase">Wholesale</label>
                        <div className="text-lg font-bold text-success">₹ {product.wholesale_price?.toLocaleString() || '0'}</div>
                    </div>
                </div>
                <button className="w-full mt-4 py-2 rounded-xl text-primary font-bold text-xs flex items-center justify-center gap-1 hover:bg-primary/5 transition-colors group">
                    View Details & History <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="md:col-span-3 py-20 text-center">
            <div className="text-secondary text-lg font-medium">No products found for "{searchTerm}" in {activeCategory}.</div>
            <p className="text-sm text-secondary/60 mt-2">Products are auto-added when you create bills.</p>
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="neo-card w-full max-w-lg animate-scale-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-primary-dark">Add New Product</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="neo-btn !p-2 !rounded-full">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Product Name</label>
                  <input 
                    required
                    className="neo-input w-full"
                    value={newProduct.name}
                    onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                    placeholder="e.g. EcoBoard Pro"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Category</label>
                  <input 
                    className="neo-input w-full"
                    value={newProduct.category}
                    onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                    placeholder="e.g. Boards"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Size</label>
                  <input 
                    className="neo-input w-full"
                    value={newProduct.size}
                    onChange={e => setNewProduct({...newProduct, size: e.target.value})}
                    placeholder="e.g. 4x8 ft"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Retail Price (₹)</label>
                  <input 
                    type="number"
                    className="neo-input w-full"
                    value={newProduct.retail_price}
                    onChange={e => setNewProduct({...newProduct, retail_price: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-primary-dark">Wholesale Price (₹)</label>
                  <input 
                    type="number"
                    className="neo-input w-full"
                    value={newProduct.wholesale_price}
                    onChange={e => setNewProduct({...newProduct, wholesale_price: Number(e.target.value)})}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-primary-dark">Description</label>
                <textarea 
                  className="neo-input w-full h-24 resize-none"
                  value={newProduct.description}
                  onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="neo-btn flex-1 py-3">Cancel</button>
                <button type="submit" className="neo-btn-primary flex-1 py-3">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shopify Import Modal */}
      <ShopifyImportModal 
        isOpen={isShopifyModalOpen}
        onClose={() => setIsShopifyModalOpen(false)}
        onImportComplete={() => fetchProducts()}
      />
    </div>
  );
}

function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

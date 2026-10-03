import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { Building2, Search, Sparkles, Loader2, Globe, ExternalLink, PlusCircle, CheckCircle2, XCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { Link, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export default function CompanyIntelligence() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any | null>(null);
  
  const [enrichedLeads, setEnrichedLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const navigate = useNavigate();

  // Load enriched leads
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'leads'), orderBy('created_at', 'desc'));
    
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        // Filter leads that have company_intelligence locally
        const leads = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const enriched = leads.filter(l => (l as any).company_intelligence);
        setEnrichedLeads(enriched);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load enriched leads', error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !functions) return;
    
    setSearching(true);
    setSearchResult(null);
    
    try {
      const enrichFn = httpsCallable(functions, 'enrichCompanyManual');
      const result = await enrichFn({ companyName: searchQuery });
      const data = result.data as any;
      
      if (data.success && data.status === 'success') {
        setSearchResult({
          name: data.data.name,
          description: data.data.description,
          website: data.data.website,
          founding_year: 'Verified',
          status: 'success'
        });
      } else {
        setSearchResult({
          name: searchQuery,
          status: 'failed'
        });
      }
    } catch (error) {
      console.error("Sandbox search failed:", error);
      setSearchResult({
        name: searchQuery,
        status: 'failed'
      });
    } finally {
      setSearching(false);
    }
  };

  const handleCreateLead = () => {
    // Navigate to AddLead page with predefined company name
    navigate('/leads/new', { state: { predefinedCompany: searchResult?.name } });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">CRM Workspace</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-200 flex items-center gap-1">
              <Sparkles size={12} /> AI Powered
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary-dark mt-1">Company Intelligence</h1>
          <p className="text-secondary text-xs sm:text-sm mt-1">
            Discover deep B2B insights, analyze corporate profiles, and view automatically enriched leads.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Manual Search Sandbox */}
        <div className="lg:col-span-1 space-y-4">
          <div className="neo-card">
            <h2 className="font-bold text-primary-dark mb-4 flex items-center gap-2">
              <Search size={18} className="text-primary" />
              Prospecting Sandbox
            </h2>
            
            <form onSubmit={handleManualSearch} className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-secondary">Company Name</label>
                <input
                  type="text"
                  className="neo-input w-full"
                  placeholder="e.g. Acme Corp"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={searching || !searchQuery.trim()}
                className="neo-btn-primary w-full text-sm font-bold py-2 flex items-center justify-center gap-2"
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Enrich Data
              </button>
            </form>

            {/* Search Result Display */}
            {searchResult && (
              <div className="mt-6 pt-6 border-t border-shadow-darker/10 animate-fade-in space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 size={20} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary-dark">{searchResult.name}</h3>
                    <div className="flex items-center gap-2 text-xs mt-1">
                      {searchResult.status === 'success' ? (
                         <span className="text-emerald-600 flex items-center gap-1 font-semibold"><CheckCircle2 size={12}/> Match Found</span>
                      ) : (
                         <span className="text-rose-500 flex items-center gap-1 font-semibold"><XCircle size={12}/> No Match</span>
                      )}
                    </div>
                  </div>
                </div>

                {searchResult.status === 'success' && (
                  <div className="space-y-3 text-sm">
                    <p className="text-secondary text-xs leading-relaxed">
                      {searchResult.description}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                       <div className="bg-transparent border border-shadow-darker/10 p-2 rounded-lg">
                         <span className="block text-secondary mb-1">Founded</span>
                         <span className="font-bold text-primary-dark">{searchResult.founding_year || 'N/A'}</span>
                       </div>
                       <div className="bg-transparent border border-shadow-darker/10 p-2 rounded-lg overflow-hidden">
                         <span className="block text-secondary mb-1">Website</span>
                         <a href={searchResult.website} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline flex items-center gap-1 truncate">
                           <Globe size={12} /> {searchResult.website.replace('https://www.', '')}
                         </a>
                       </div>
                    </div>

                    <button 
                      onClick={handleCreateLead}
                      className="w-full neo-btn py-2 text-sm font-bold flex items-center justify-center gap-2 text-primary-dark mt-2 hover:bg-primary/5 border-primary/20"
                    >
                      <PlusCircle size={16} /> Create Lead with Data
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Enriched Directory */}
        <div className="lg:col-span-2 space-y-4">
           <div className="neo-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-primary-dark flex items-center gap-2">
                  <Building2 size={18} className="text-primary" />
                  Enriched Leads Directory
                </h2>
                <span className="text-xs font-bold px-2 py-1 bg-primary/10 text-primary-dark rounded-full">
                  {enrichedLeads.length} Profiles
                </span>
              </div>

              {loading ? (
                <div className="py-12 flex justify-center"><Loader2 size={24} className="text-primary animate-spin" /></div>
              ) : enrichedLeads.length === 0 ? (
                <div className="py-12 text-center text-secondary border border-dashed border-shadow-darker/20 rounded-xl text-xs">
                  No enriched leads found. Add a lead with a valid company name to see the magic!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-secondary border-b border-shadow-darker/10">
                        <th className="py-3 pr-4 font-semibold">Company Profile</th>
                        <th className="py-3 pr-4 font-semibold">Website</th>
                        <th className="py-3 pr-4 font-semibold">Status</th>
                        <th className="py-3 pr-4 font-semibold text-right">Lead</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-shadow-darker/5">
                      {enrichedLeads.map((lead) => {
                        const intel = lead.company_intelligence;
                        return (
                          <tr key={lead.id} className="hover:bg-transparent transition-colors group">
                            <td className="py-3 pr-4">
                               <div className="flex items-start gap-2.5">
                                 <div className="w-7 h-7 rounded bg-primary/5 flex items-center justify-center shrink-0 mt-0.5">
                                    {intel.data?.logo_url ? (
                                       <img src={intel.data.logo_url} alt="Logo" className="w-5 h-5 object-contain" />
                                    ) : (
                                       <Building2 size={14} className="text-primary" />
                                    )}
                                 </div>
                                 <div>
                                   <div className="font-bold text-primary-dark">{intel.data?.name || lead.company || 'Unknown'}</div>
                                   <div className="text-[10px] text-secondary line-clamp-1 max-w-xs mt-0.5">
                                      {intel.data?.description || 'No description available'}
                                   </div>
                                 </div>
                               </div>
                            </td>
                            <td className="py-3 pr-4">
                               {intel.data?.website ? (
                                 <a href={intel.data.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-[11px] font-medium">
                                   <Globe size={11} /> Visit
                                 </a>
                               ) : <span className="text-secondary">-</span>}
                            </td>
                            <td className="py-3 pr-4">
                               {intel.status === 'success' ? (
                                  <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Enriched</span>
                               ) : (
                                  <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Not Found</span>
                               )}
                            </td>
                            <td className="py-3 pr-4 text-right">
                               <Link to={`/leads/${lead.id}`} className="text-primary-dark hover:text-primary font-bold inline-flex items-center gap-1">
                                 View Lead <ExternalLink size={12} />
                               </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}

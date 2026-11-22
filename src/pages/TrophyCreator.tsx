import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Trophy,
  Sparkles,
  Brain,
  Upload,
  Download,
  Share2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Send,
  Layers,
  Palette,
  Sliders,
  Settings,
  Shield,
  FileText,
  Video,
  Eye,
  Trash2,
  ExternalLink,
  Plus,
  Search,
  Filter,
  Check,
  Zap,
  ArrowRight,
  MessageSquare,
  Bot,
  User,
  Paperclip,
  RotateCcw,
  Sparkle,
  X,
  ChevronDown,
  ChevronRight,
  PanelLeft,
  ArrowUp,
  Globe,
  Compass,
  FileSpreadsheet,
  Image as ImageIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchBrainKnowledge,
  addBrainKnowledgeItem,
  toggleBrainItemActive,
  deleteBrainKnowledgeItem,
  uploadBrainFile,
  fetchGeneratedDesigns,
  updateDesignStatus,
  getOpenAiApiKey,
  setOpenAiApiKey,
  chatWithTrophyAgent,
  loadTrophyChatHistory,
  saveTrophyChatHistory,
  type TrophyBrainKnowledgeItem,
  type GeneratedTrophyDesign,
  type TrophyAgentMessage,
  type KnowledgeType,
} from '../services/trophyBrainService';
import { db } from '../lib/firebase';
import { collection, getDocs, query, limit, updateDoc, doc } from 'firebase/firestore';

interface AttachedFileItem {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

export default function TrophyCreator() {
  const { user, dbUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Role resolution
  const userRole = (dbUser?.role || 'sales').toLowerCase();
  const isAdmin = userRole === 'admin';
  const isDesigner = userRole === 'design' || isAdmin;

  // Lead context if opened from a Lead page
  const queryParams = new URLSearchParams(location.search);
  const initialLeadId = queryParams.get('leadId') || '';
  const initialLeadName = queryParams.get('leadName') || '';
  const initialCompany = queryParams.get('company') || '';

  const [selectedLeadId, setSelectedLeadId] = useState(initialLeadId);
  const [selectedLeadName, setSelectedLeadName] = useState(initialLeadName);
  const [selectedCompany, setSelectedCompany] = useState(initialCompany);

  // Leads list for 1-click attaching
  const [leadsList, setLeadsList] = useState<{ id: string; name: string; company?: string }[]>([]);

  // ChatGPT Model Selection state
  const [selectedModel, setSelectedModel] = useState<'gpt-4o' | 'gpt-4o-mini' | 'o1'>('gpt-4o');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Deep Research state
  const [isDeepResearchActive, setIsDeepResearchActive] = useState(false);
  const [expandedResearchIds, setExpandedResearchIds] = useState<Record<string, boolean>>({});

  // File Upload state (Attached files in input bar)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Design Brain state
  const [brainItems, setBrainItems] = useState<TrophyBrainKnowledgeItem[]>([]);
  const [showBrainDrawer, setShowBrainDrawer] = useState(false);
  const [showGalleryDrawer, setShowGalleryDrawer] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Chat conversation state
  const [messages, setMessages] = useState<TrophyAgentMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [agentProgressStep, setAgentProgressStep] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Gallery state
  const [galleryDesigns, setGalleryDesigns] = useState<GeneratedTrophyDesign[]>([]);

  // Brain Upload Modal State
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState<KnowledgeType>('pdf');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocTags, setNewDocTags] = useState('style, manufacturing');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachedBrainFileUrl, setAttachedBrainFileUrl] = useState('');

  // Admin API Key state
  const [customApiKey, setCustomApiKey] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<string | null>(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAgentThinking]);

  // Adjust textarea height dynamically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputPrompt]);

  // Load Brain, Chat, and Leads on Mount
  useEffect(() => {
    loadBrain();
    loadLeads();
    loadDesigns();
    setCustomApiKey(getOpenAiApiKey());

    // Initialize or load chat
    const savedChat = loadTrophyChatHistory();
    if (savedChat.length > 0) {
      setMessages(savedChat);
    } else {
      initializeWelcomeMessage();
    }
  }, []);

  // Save chat on change
  useEffect(() => {
    if (messages.length > 0) {
      saveTrophyChatHistory(messages);
    }
  }, [messages]);

  function initializeWelcomeMessage() {
    const welcomeMsg: TrophyAgentMessage = {
      id: 'welcome-msg',
      role: 'assistant',
      content: initialCompany
        ? `Welcome to **EcoTrophy Storytelling Studio** (Powered by Neuro-Design™).\n\nClient context: **"${initialCompany}"**.\n\n*Our Belief: We don't sell trophies. We craft memories. Every achievement has a story; the trophy should tell it.*\n\nWhat is the story of this achievement? You can upload a brief, toggle **Deep Research**, or choose a narrative metaphor to begin:`
        : `Welcome to **EcoTrophy Storytelling Studio** — India's 1st Storytelling Trophy Brand™ (Powered by Neuro-Design™).\n\n*Our Belief: We don't sell trophies. We craft memories. Every achievement has a story; the trophy should tell it.*\n\nWhat are we creating today? You can type a brief, upload an image/PDF, or explore a metaphor route below:`,
      timestamp: new Date().toISOString(),
      options: [
        {
          id: 'opt-confluence',
          label: '🌊 The Confluence (Convergence Metaphor)',
          actionPrompt: 'Design a storytelling trophy on the "Convergence" metaphor: multiple river-like CNC contours converging around a shared negative-space aperture. 18mm natural rubberwood + 3mm printed acrylic sandwich, self-standing integrated broadened stance.',
        },
        {
          id: 'opt-threshold',
          label: '🚪 The Threshold (Breakthrough Metaphor)',
          actionPrompt: 'Design a storytelling trophy on the "Breakthrough" metaphor: architectural doorway silhouette with light bursting through an acrylic negative-space window. 18mm rubberwood sandwich, self-standing integrated footprint.',
        },
        {
          id: 'opt-ascent',
          label: '⛰️ Ascendant Ridge (Progress Metaphor)',
          actionPrompt: 'Design a storytelling trophy on the "Ascent" metaphor: stepped elevation contours in 18mm natural rubberwood with a printed acrylic path honoring the climb. Integrated self-standing stance, no separate base.',
        },
        {
          id: 'opt-resilience',
          label: '🏛️ Rooted Strata (Resilience Metaphor)',
          actionPrompt: 'Design a storytelling trophy on the "Resilience" metaphor: deep layered strata contours forming a rooted keystone arch. 18mm rubberwood + 3mm frosted acrylic void, self-standing integrated base.',
        },
      ],
    };
    setMessages([welcomeMsg]);
  }

  async function loadBrain() {
    try {
      const items = await fetchBrainKnowledge();
      setBrainItems(items);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadDesigns() {
    try {
      const items = await fetchGeneratedDesigns();
      setGalleryDesigns(items);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadLeads() {
    try {
      if (db) {
        const q = query(collection(db, 'leads'), limit(30));
        const snap = await getDocs(q);
        const list: { id: string; name: string; company?: string }[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({ id: d.id, name: data.name || data.client_name || 'Unnamed', company: data.company });
        });
        setLeadsList(list);

        if (initialLeadId && !initialCompany) {
          const matched = list.find((l) => l.id === initialLeadId);
          if (matched) {
            setSelectedLeadName(matched.name);
            setSelectedCompany(matched.company || '');
          }
        }
      }
    } catch (e) {
      console.warn('Leads fetch failed:', e);
    }
  }

  // Handle local file selection for chat input
  const handleInputFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFiles((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl: reader.result as string,
          },
        ]);
        toast.success(`Attached ${file.name}`);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove attached file
  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle Send Message to Agent
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputPrompt).trim();
    if ((!text && attachedFiles.length === 0) || isAgentThinking) return;

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      toast.error('OpenAI API Key is missing. Please configure it in Settings.');
      setShowAdminModal(true);
      return;
    }

    const currentAttachments = [...attachedFiles];

    const userMessage: TrophyAgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      content: text || (currentAttachments.length > 0 ? `Uploaded ${currentAttachments.map((f) => f.name).join(', ')}` : ''),
      timestamp: new Date().toISOString(),
      attachedFiles: currentAttachments.map((f) => ({
        name: f.name,
        type: f.type,
        url: f.dataUrl,
        previewUrl: f.type.startsWith('image/') ? f.dataUrl : undefined,
      })),
      modelUsed: selectedModel,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputPrompt('');
    setAttachedFiles([]);
    setIsAgentThinking(true);
    setAgentProgressStep(
      isDeepResearchActive
        ? 'Deep Research: Analyzing brand semiotics & Metaphor Territories...'
        : 'Thinking & consulting Design Brain...'
    );

    try {
      const activeRules = brainItems.filter((b) => b.active);
      const userMeta = {
        email: user?.email || dbUser?.email || 'user@ecotrophy.com',
        role: userRole,
      };
      const leadContext = selectedLeadId
        ? { id: selectedLeadId, name: selectedLeadName, company: selectedCompany }
        : undefined;

      const assistantReply = await chatWithTrophyAgent({
        messages: updatedMessages,
        activeBrainRules: activeRules,
        userMeta,
        leadContext,
        selectedModel,
        deepResearch: isDeepResearchActive,
        attachedFiles: currentAttachments.map((f) => ({
          name: f.name,
          type: f.type,
          base64OrUrl: f.dataUrl,
        })),
        onProgressStep: (step) => setAgentProgressStep(step),
      });

      setMessages((prev) => [...prev, assistantReply]);
      if (assistantReply.generatedDesign) {
        setGalleryDesigns((prev) => [assistantReply.generatedDesign!, ...prev]);
        toast.success('✨ Trophy render created!');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to communicate with AI Agent.');
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **Error communicating with agent**: ${err.message || 'Please verify your API key and network connection.'}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsAgentThinking(false);
      setAgentProgressStep('');
    }
  };

  // Toggle research accordion
  const toggleResearchSteps = (msgId: string) => {
    setExpandedResearchIds((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  // Attach to Lead
  const handleAttachToLead = async (design: GeneratedTrophyDesign, targetLeadId: string) => {
    if (!targetLeadId) {
      toast.error('Please select a lead first');
      return;
    }

    try {
      if (db) {
        const leadRef = doc(db, 'leads', targetLeadId);
        await updateDoc(leadRef, {
          artwork_url: design.imageUrl,
          concept_notes: `AI Generated Trophy Design (${design.options.category} - ${design.options.shape})`,
          last_design_at: new Date().toISOString(),
        });
        toast.success('Design attached to Lead successfully!');
      } else {
        toast.success('Attached to local lead record!');
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to attach to lead: ' + e.message);
    }
  };

  // Share via WhatsApp Link
  const handleShareWhatsApp = (design: GeneratedTrophyDesign) => {
    const text = encodeURIComponent(
      `Hello! Here is the custom 3D trophy design concept crafted for *${design.options.clientName || selectedCompany || 'your event'}*:\n\n🏆 *Award:* ${design.options.awardTitle}\n💎 *Materials:* ${design.options.materials.join(', ')}\n🏛️ *Base:* ${design.options.base}\n✨ *Rendering:* ${design.imageUrl}\n\nLet us know your thoughts so we can finalize the artwork!`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  // Push to Quotation
  const handleCreateQuotation = (design: GeneratedTrophyDesign) => {
    const searchParams = new URLSearchParams({
      description: `Custom ${design.options.category} Trophy - ${design.options.materials.join(' + ')} with ${design.options.base}`,
      leadId: design.leadId || selectedLeadId || '',
      imageUrl: design.imageUrl,
    });
    navigate(`/quotations/create?${searchParams.toString()}`);
  };

  // Knowledge Brain Upload
  const handleAddBrainDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !newDocContent.trim()) {
      toast.error('Please fill in title and knowledge content');
      return;
    }

    try {
      const tagsArray = newDocTags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const newItem = await addBrainKnowledgeItem({
        title: newDocTitle.trim(),
        type: newDocType,
        content: newDocContent.trim(),
        fileUrl: attachedBrainFileUrl || undefined,
        tags: tagsArray,
        active: true,
        createdBy: user?.email || 'admin',
      });

      setBrainItems((prev) => [newItem, ...prev]);
      setShowUploadModal(false);
      setNewDocTitle('');
      setNewDocContent('');
      setAttachedBrainFileUrl('');
      toast.success('Knowledge uploaded to Design Brain successfully!');
    } catch (e: any) {
      toast.error('Failed to add knowledge item: ' + e.message);
    }
  };

  // File Upload Helper for Brain
  const handleBrainFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const { url, fileName } = await uploadBrainFile(file);
      setAttachedBrainFileUrl(url);

      if (!newDocTitle) {
        setNewDocTitle(fileName.replace(/\.[^/.]+$/, ''));
      }

      if (file.type.includes('text') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        const text = await file.text();
        setNewDocContent(text);
      } else {
        setNewDocContent(
          (prev) =>
            prev ||
            `Knowledge File: ${fileName}\nType: ${file.type}\nGuidelines: Manufacturing specs and visual aesthetic standards derived from document.`
        );
      }
      toast.success(`Attached file: ${fileName}`);
    } catch (e: any) {
      toast.error('File upload failed: ' + e.message);
    } finally {
      setUploadingFile(false);
    }
  };

  // Test OpenAI API Key
  const handleTestApiKey = async () => {
    setApiKeyStatus('Testing API Key with OpenAI...');
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${customApiKey.trim()}` },
      });
      const data = await res.json();
      if (res.ok) {
        setApiKeyStatus('✅ Verified: Key is active and authorized for ChatGPT Image Generator & GPT-4o!');
        setOpenAiApiKey(customApiKey.trim());
        toast.success('OpenAI API Key verified and saved!');
      } else {
        setApiKeyStatus(`❌ Error: ${data.error?.message || 'Invalid API Key'}`);
        toast.error('API Key verification failed');
      }
    } catch (e: any) {
      setApiKeyStatus(`❌ Network error: ${e.message}`);
    }
  };

  const activeBrainRulesCount = brainItems.filter((b) => b.active).length;

  return (
    <div className="h-[calc(100vh-4.5rem)] flex bg-[#f7f7f8] dark:bg-[#212121] text-[#0d0d0d] dark:text-[#ececec] overflow-hidden -m-4 sm:-m-6">
      {/* HIDDEN FILE INPUT FOR CHAT */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleInputFileSelect}
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.csv"
        className="hidden"
      />

      {/* LEFT CHATGPT-STYLE SIDEBAR */}
      <div
        className={`${isSidebarOpen ? 'w-64' : 'w-0'
          } transition-all duration-300 ease-in-out bg-[#f9f9f9] dark:bg-[#171717] border-r border-black/10 dark:border-white/10 flex flex-col shrink-0 overflow-hidden select-none z-20`}
      >
        {/* Top: New Chat Button */}
        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              initializeWelcomeMessage();
              toast.success('New trophy design chat started');
            }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold transition-colors shadow-2xs"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Plus size={14} />
              </span>
              <span>New Design</span>
            </div>
            <span className="text-[10px] text-secondary">⌘N</span>
          </button>
        </div>

        {/* Middle: Chat History / Gallery shortcuts */}
        <div className="flex-1 overflow-y-auto px-3 space-y-4 text-xs">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-secondary uppercase tracking-wider px-2 py-1">
              Design Ateliers
            </div>
            <button
              type="button"
              onClick={() => setShowBrainDrawer(true)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary-dark font-medium transition-colors text-left"
            >
              <Brain size={14} className="text-amber-600" />
              <span className="truncate flex-1">Design Brain Knowledge</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {activeBrainRulesCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowGalleryDrawer(true)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary-dark font-medium transition-colors text-left"
            >
              <Layers size={14} className="text-primary" />
              <span className="truncate flex-1">Saved Trophy Gallery</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                {galleryDesigns.length}
              </span>
            </button>
          </div>

          {/* Recent Designs List */}
          {galleryDesigns.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-secondary uppercase tracking-wider px-2 py-1">
                Recent Concepts
              </div>
              <div className="space-y-0.5 max-h-64 overflow-y-auto">
                {galleryDesigns.slice(0, 8).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      handleSendMessage(
                        `Review design "${d.options.awardTitle || d.options.category}": ${d.options.materials.join(', ')}.`
                      );
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary-dark transition-colors truncate block"
                    title={d.options.awardTitle || d.options.category}
                  >
                    🏆 {d.options.awardTitle || d.options.category}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Sidebar Footer */}
        <div className="p-3 border-t border-black/10 dark:border-white/10 space-y-1">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminModal(true)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary-dark text-xs font-medium"
            >
              <Settings size={14} />
              <span>API Settings</span>
            </button>
          )}
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-secondary">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="truncate">{user?.email || 'sales@ecotrophy.com'}</span>
          </div>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* TOP CHATGPT-STYLE HEADER BAR */}
        <div className="h-13 border-b border-black/10 dark:border-white/10 flex items-center justify-between px-4 shrink-0 bg-white/70 dark:bg-[#212121]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            {/* Sidebar toggle */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary-dark transition-colors"
              title="Toggle sidebar"
            >
              <PanelLeft size={18} />
            </button>

            {/* CHATGPT MODEL SELECTION DROPDOWN */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-xs font-bold text-primary-dark transition-colors"
              >
                <Sparkles size={14} className="text-amber-500" />
                <span>
                  {selectedModel === 'gpt-4o'
                    ? 'ChatGPT 4o'
                    : selectedModel === 'gpt-4o-mini'
                      ? 'ChatGPT 4o mini'
                      : 'o1 (Deep Thought)'}
                </span>
                <ChevronDown size={13} className="text-secondary" />
              </button>

              {/* Model Dropdown Menu */}
              {isModelDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-68 bg-surface rounded-2xl shadow-xl border border-shadow-darker/20 p-1.5 space-y-1 z-50 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel('gpt-4o');
                      setIsModelDropdownOpen(false);
                      toast.success('Switched to ChatGPT 4o');
                    }}
                    className={`w-full text-left p-2.5 rounded-xl flex items-start justify-between transition-colors ${selectedModel === 'gpt-4o' ? 'bg-primary/10 text-primary-dark font-bold' : 'hover:bg-black/5'
                      }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Sparkles size={13} className="text-amber-500" />
                        <span>GPT-4o</span>
                      </div>
                      <p className="text-[10px] text-secondary font-normal mt-0.5">
                        Flagship model for creative storytelling &amp; 3D renders
                      </p>
                    </div>
                    {selectedModel === 'gpt-4o' && <Check size={14} className="text-primary mt-0.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel('gpt-4o-mini');
                      setIsModelDropdownOpen(false);
                      toast.success('Switched to ChatGPT 4o mini');
                    }}
                    className={`w-full text-left p-2.5 rounded-xl flex items-start justify-between transition-colors ${selectedModel === 'gpt-4o-mini' ? 'bg-primary/10 text-primary-dark font-bold' : 'hover:bg-black/5'
                      }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Zap size={13} className="text-emerald-500" />
                        <span>GPT-4o mini</span>
                      </div>
                      <p className="text-[10px] text-secondary font-normal mt-0.5">
                        Faster, lightweight model for everyday trophy briefs
                      </p>
                    </div>
                    {selectedModel === 'gpt-4o-mini' && <Check size={14} className="text-primary mt-0.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel('o1');
                      setIsModelDropdownOpen(false);
                      toast.success('Switched to o1 Reasoning');
                    }}
                    className={`w-full text-left p-2.5 rounded-xl flex items-start justify-between transition-colors ${selectedModel === 'o1' ? 'bg-primary/10 text-primary-dark font-bold' : 'hover:bg-black/5'
                      }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Brain size={13} className="text-indigo-500" />
                        <span>o1 (Deep Thought)</span>
                      </div>
                      <p className="text-[10px] text-secondary font-normal mt-0.5">
                        Advanced engineering, load path calculation &amp; multi-category systems
                      </p>
                    </div>
                    {selectedModel === 'o1' && <Check size={14} className="text-primary mt-0.5" />}
                  </button>
                </div>
              )}
            </div>

            {/* Lead Context indicator */}
            {selectedCompany && (
              <span className="hidden sm:inline-flex text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Client: {selectedCompany}
              </span>
            )}
          </div>

          {/* Top Right Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBrainDrawer(true)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 hover:bg-amber-100 flex items-center gap-1.5 transition-colors"
            >
              <Brain size={13} className="text-amber-600" />
              <span className="hidden sm:inline">Design Brain</span>
              <span>({activeBrainRulesCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                initializeWelcomeMessage();
                toast.success('New session started');
              }}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary-dark transition-colors"
              title="Reset Chat"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        {/* CHAT MESSAGES STREAM (CENTERED MAX-W-3XL) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const isExpanded = !!expandedResearchIds[msg.id];

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Assistant Avatar */}
                  {!isUser && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 via-primary to-primary-dark text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Sparkles size={16} />
                    </div>
                  )}

                  {/* Message Bubble Container */}
                  <div className={`space-y-3 ${isUser ? 'max-w-xl' : 'flex-1 max-w-2xl'}`}>
                    {/* User Attached Files Preview */}
                    {msg.attachedFiles && msg.attachedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {msg.attachedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-xl border border-black/10 dark:border-white/10 bg-surface flex items-center gap-2 text-xs shadow-2xs"
                          >
                            {file.previewUrl ? (
                              <img src={file.previewUrl} alt={file.name} className="w-8 h-8 rounded object-cover" />
                            ) : (
                              <FileText size={16} className="text-primary" />
                            )}
                            <div className="truncate max-w-[140px]">
                              <span className="font-semibold block truncate">{file.name}</span>
                              <span className="text-[10px] text-secondary uppercase">{file.type.split('/')[1] || 'file'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* DEEP RESEARCH ACCORDION (If deep research was performed) */}
                    {msg.deepResearch && (
                      <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 p-2.5 text-xs space-y-1.5 animate-fade-in">
                        <button
                          type="button"
                          onClick={() => toggleResearchSteps(msg.id)}
                          className="w-full flex items-center justify-between font-semibold text-indigo-900 dark:text-indigo-300 text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            <Compass size={14} className="text-indigo-600 animate-spin-slow" />
                            <span>
                              Deep Research completed ({msg.deepResearch.durationSeconds || 6}s) • {msg.deepResearch.steps?.length || 5} stages
                            </span>
                          </div>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>

                        {isExpanded && msg.deepResearch.steps && (
                          <div className="pt-2 border-t border-indigo-200/50 dark:border-indigo-900/50 space-y-1 text-[11px] text-indigo-800 dark:text-indigo-200">
                            {msg.deepResearch.steps.map((st, sIdx) => (
                              <div key={sIdx} className="flex items-start gap-1.5">
                                <Check size={12} className="text-indigo-600 shrink-0 mt-0.5" />
                                <span>{st}</span>
                              </div>
                            ))}
                            {msg.deepResearch.summary && (
                              <p className="text-[10px] text-secondary italic pt-1">{msg.deepResearch.summary}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Text Body */}
                    <div
                      className={`text-[13px] leading-relaxed ${isUser
                          ? 'bg-[#f4f4f4] dark:bg-[#303030] px-4 py-2.5 rounded-3xl text-right inline-block ml-auto'
                          : 'text-[#0d0d0d] dark:text-[#ececec] whitespace-pre-wrap font-sans'
                        }`}
                    >
                      {msg.content}
                    </div>

                    {/* GENERATED TROPHY CARD (Full Photoreal Image Display) */}
                    {msg.generatedDesign && (
                      <div className="mt-3 rounded-2xl overflow-hidden border border-black/15 dark:border-white/15 bg-surface shadow-md space-y-3 p-3">
                        <div className="relative group rounded-xl overflow-hidden bg-slate-950 aspect-square sm:aspect-video">
                          <img
                            src={msg.generatedDesign.imageUrl}
                            alt="Generated EcoTrophy Design"
                            className="w-full h-full object-contain mx-auto group-hover:scale-102 transition-transform duration-300"
                          />
                          <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-xs p-1 rounded-lg">
                            <a
                              href={msg.generatedDesign.imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-white hover:bg-white/20 rounded transition-colors"
                              title="Full Screen"
                            >
                              <Eye size={14} />
                            </a>
                            <a
                              href={msg.generatedDesign.imageUrl}
                              download={`ecotrophy_${Date.now()}.png`}
                              className="p-1.5 text-white hover:bg-white/20 rounded transition-colors"
                              title="Download"
                            >
                              <Download size={14} />
                            </a>
                          </div>

                          <div className="absolute bottom-2 left-2 right-2 bg-slate-900/85 backdrop-blur-xs p-2.5 rounded-lg text-white text-[11px] space-y-1">
                            <div className="flex items-center justify-between font-bold">
                              <span className="truncate">
                                {msg.generatedDesign.options.awardTitle || msg.generatedDesign.options.category}
                              </span>
                              <span className="text-emerald-400 font-mono text-[10px]">ChatGPT Image HD</span>
                            </div>
                            <p className="text-[10px] text-slate-300 truncate">
                              {msg.generatedDesign.options.materials.join(' + ')} • {msg.generatedDesign.options.shape}
                            </p>
                          </div>
                        </div>

                        {/* Collaborative Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleShareWhatsApp(msg.generatedDesign!)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
                          >
                            <Send size={12} className="text-emerald-600" />
                            <span>Send WhatsApp</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCreateQuotation(msg.generatedDesign!)}
                            className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary-dark border border-primary/25 hover:bg-primary/20 font-bold text-xs flex items-center gap-1.5 transition-colors"
                          >
                            <FileText size={12} className="text-primary" />
                            <span>Create Quotation</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (selectedLeadId) {
                                handleAttachToLead(msg.generatedDesign!, selectedLeadId);
                              } else {
                                setShowGalleryDrawer(true);
                                toast('Pick a lead in the Gallery to attach');
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-surface border border-shadow-darker/25 hover:border-primary text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                          >
                            <Paperclip size={12} className="text-secondary" />
                            <span>Attach to Lead {selectedCompany ? `(${selectedCompany})` : ''}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Interactive Multiple Choice Option Buttons */}
                    {msg.options && msg.options.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1 animate-fade-in">
                        {msg.options.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleSendMessage(opt.actionPrompt || opt.label)}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-primary/30 hover:border-primary hover:bg-primary/5 text-primary-dark transition-all shadow-2xs flex items-center gap-1.5 text-left"
                          >
                            <Sparkle size={12} className="text-amber-500 shrink-0" />
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Agent Thinking Progress Indicator */}
            {isAgentThinking && (
              <div className="flex items-start gap-4 animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 via-primary to-primary-dark text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                  <Sparkles size={16} />
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-primary font-bold">
                    <RefreshCw size={13} className="animate-spin" />
                    <span>{agentProgressStep || 'EcoTrophy Agent is thinking...'}</span>
                  </div>
                  <p className="text-[11px] text-secondary">
                    Applying Neuro-Design™ principles &amp; authentic planar wood/acrylic layer tolerances...
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* BOTTOM CHATGPT-STYLE INPUT PILL CONTAINER */}
        <div className="p-3 sm:p-4 shrink-0 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-[#212121] dark:via-[#212121]/80 z-10">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Attached files preview chips */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2 bg-[#f4f4f4] dark:bg-[#303030] rounded-2xl border border-black/10 dark:border-white/10">
                {attachedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface border border-shadow-darker/20 text-xs shadow-2xs"
                  >
                    {f.type.startsWith('image/') ? (
                      <ImageIcon size={13} className="text-primary" />
                    ) : (
                      <FileText size={13} className="text-amber-600" />
                    )}
                    <span className="truncate max-w-[120px] font-medium">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachedFile(i)}
                      className="text-secondary hover:text-rose-600 p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* THE CHATGPT PILL BOX */}
            <div className="rounded-3xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#303030] shadow-md p-2 flex flex-col space-y-1.5 focus-within:border-black/30 dark:focus-within:border-white/30 transition-all">
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  isDeepResearchActive
                    ? 'Ask with Deep Research e.g. "Conduct full architectural investigation for a Tata Steel safety milestone award"...'
                    : 'Message Trophy Agent e.g. "Create a Confluence award in 18mm natural rubberwood for Apex Corp"...'
                }
                className="w-full bg-transparent px-3 py-1.5 text-[13px] text-slate-800 dark:text-slate-100 placeholder:text-secondary focus:outline-none resize-none leading-relaxed max-h-48 overflow-y-auto"
              />

              {/* Bottom toolbar inside pill */}
              <div className="flex items-center justify-between pt-1 px-1">
                <div className="flex items-center gap-1.5">
                  {/* Plus / File upload button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-secondary hover:text-primary-dark transition-colors"
                    title="Attach image, PDF or design brief"
                  >
                    <Plus size={18} />
                  </button>

                  {/* DEEP RESEARCH TOGGLE BUTTON (Like ChatGPT) */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsDeepResearchActive(!isDeepResearchActive);
                      toast(
                        !isDeepResearchActive
                          ? '🌐 Deep Research enabled (Neuro-Design & Engineering Critique)'
                          : 'Standard chat mode'
                      );
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${isDeepResearchActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'border border-black/15 dark:border-white/15 text-secondary hover:text-primary-dark hover:bg-black/5'
                      }`}
                  >
                    <Compass size={13} className={isDeepResearchActive ? 'animate-spin-slow' : ''} />
                    <span>Deep Research</span>
                  </button>

                  {/* Lead selector */}
                  <select
                    value={selectedLeadId}
                    onChange={(e) => {
                      const lid = e.target.value;
                      setSelectedLeadId(lid);
                      const found = leadsList.find((l) => l.id === lid);
                      if (found) {
                        setSelectedLeadName(found.name);
                        setSelectedCompany(found.company || '');
                        toast.success(`Context: ${found.company || found.name}`);
                      } else {
                        setSelectedLeadName('');
                        setSelectedCompany('');
                      }
                    }}
                    className="text-[11px] p-1 rounded-lg border border-black/10 dark:border-white/10 bg-transparent text-secondary max-w-[130px] truncate focus:outline-none"
                  >
                    <option value="">Link Lead...</option>
                    {leadsList.map((ld) => (
                      <option key={ld.id} value={ld.id}>
                        {ld.company || ld.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Send Button (ChatGPT Black Circle with White ArrowUp) */}
                <button
                  type="button"
                  disabled={(!inputPrompt.trim() && attachedFiles.length === 0) || isAgentThinking}
                  onClick={() => handleSendMessage()}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${inputPrompt.trim() || attachedFiles.length > 0
                      ? 'bg-black dark:bg-white text-white dark:text-black shadow-xs'
                      : 'bg-black/10 dark:bg-white/10 text-black/30 dark:text-white/30 cursor-not-allowed'
                    }`}
                >
                  <ArrowUp size={16} />
                </button>
              </div>
            </div>

            {/* Disclaimer footer */}
            <p className="text-[10px] text-center text-secondary">
              EcoTrophy AI Storytelling Agent can make mistakes. Verify physical shop CNC tolerances before batch production.
            </p>
          </div>
        </div>
      </div>

      {/* DRAWER: DESIGN BRAIN KNOWLEDGE BASE */}
      {showBrainDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-2xs animate-fade-in">
          <div className="w-full max-w-lg bg-surface h-full shadow-2xl flex flex-col p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-500/20 text-amber-700">
                  <Brain size={20} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-primary-dark">EcoTrophy Design Brain</h3>
                  <p className="text-[11px] text-secondary">
                    {activeBrainRulesCount} Manufacturing &amp; Storytelling Rules Active
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBrainDrawer(false)}
                className="p-1 rounded-lg text-secondary hover:text-primary-dark"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="neo-btn-primary px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 shadow-xs"
              >
                <Plus size={14} />
                <span>+ Upload PDF / Rule</span>
              </button>
              <button
                type="button"
                onClick={loadBrain}
                className="neo-btn text-xs px-2.5 py-1.5 font-bold text-secondary hover:text-primary-dark"
              >
                <RefreshCw size={12} />
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {brainItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${item.active
                      ? 'border-primary/40 bg-white dark:bg-black/20 shadow-xs'
                      : 'border-shadow-darker/15 bg-black/5 opacity-60'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`p-1 rounded ${item.type === 'pdf'
                            ? 'bg-rose-100 text-rose-700'
                            : item.type === 'video'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                      >
                        {item.type === 'pdf' && <FileText size={13} />}
                        {item.type === 'video' && <Video size={13} />}
                        {item.type === 'rule' && <Shield size={13} />}
                        {item.type === 'doc' && <Brain size={13} />}
                      </span>
                      <h4 className="font-bold text-primary-dark text-xs">{item.title}</h4>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        await toggleBrainItemActive(item.id, !item.active);
                        setBrainItems((prev) =>
                          prev.map((b) => (b.id === item.id ? { ...b, active: !b.active } : b))
                        );
                        toast.success(item.active ? 'Rule disabled' : 'Rule enabled');
                      }}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.active
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                    >
                      {item.active ? 'Active' : 'Off'}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-700 leading-relaxed max-h-24 overflow-y-auto">
                    {item.content}
                  </p>

                  {item.fileUrl && (
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline text-[10px] font-semibold flex items-center gap-1"
                    >
                      <ExternalLink size={10} />
                      <span>View Attached Document</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: SAVED GALLERY */}
      {showGalleryDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-2xs animate-fade-in">
          <div className="w-full max-w-lg bg-surface h-full shadow-2xl flex flex-col p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Layers size={20} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-primary-dark">Trophy Design Gallery</h3>
                  <p className="text-[11px] text-secondary">{galleryDesigns.length} past renders saved</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGalleryDrawer(false)}
                className="p-1 rounded-lg text-secondary hover:text-primary-dark"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {galleryDesigns.length === 0 ? (
                <div className="text-center p-8 text-secondary text-xs">
                  No designs created yet. Chat with the agent to create your first award!
                </div>
              ) : (
                galleryDesigns.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-xl border border-shadow-darker/20 bg-white dark:bg-black/20 space-y-2 shadow-xs"
                  >
                    <div className="relative rounded-lg overflow-hidden bg-slate-950 aspect-video">
                      <img src={d.imageUrl} alt="Trophy" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-primary-dark truncate">
                        {d.options.awardTitle || d.options.category}
                      </h4>
                      <p className="text-[11px] text-secondary truncate">
                        {d.options.clientName ? `${d.options.clientName} • ` : ''}
                        {d.options.materials.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-shadow-darker/10">
                      <button
                        type="button"
                        onClick={() => {
                          handleSendMessage(
                            `Review and iterate on design "${d.options.awardTitle || d.options.category}": ${d.options.materials.join(', ')}.`
                          );
                          setShowGalleryDrawer(false);
                        }}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        Iterate in Chat
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleShareWhatsApp(d)}
                          className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700"
                          title="WhatsApp"
                        >
                          <Send size={13} />
                        </button>
                        <a
                          href={d.imageUrl}
                          download="trophy.png"
                          className="p-1.5 rounded hover:bg-black/5 text-slate-700"
                          title="Download"
                        >
                          <Download size={13} />
                        </a>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD TO BRAIN MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="neo-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
              <h3 className="text-sm font-bold text-primary-dark flex items-center gap-2">
                <Brain size={18} className="text-amber-600" />
                Upload to Trophy Design Brain
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-secondary hover:text-primary-dark p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddBrainDocument} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-secondary block mb-1">Knowledge Title</label>
                <input
                  type="text"
                  required
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="e.g. 2026 Planar Wood &amp; Acrylic Layer Guidelines"
                  className="w-full text-xs p-2.5 rounded-lg border border-shadow-darker/20 bg-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-secondary block mb-1">Format / Type</label>
                  <select
                    value={newDocType}
                    onChange={(e) => setNewDocType(e.target.value as KnowledgeType)}
                    className="w-full text-xs p-2 rounded-lg border border-shadow-darker/20 bg-surface"
                  >
                    <option value="pdf">PDF Document / Catalog</option>
                    <option value="rule">Manufacturing Rule</option>
                    <option value="doc">Text Stylebook / Guide</option>
                    <option value="video">Video Transcript / Notes</option>
                    <option value="reference_image">Reference Image Specs</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-secondary block mb-1">Tags (Comma-separated)</label>
                  <input
                    type="text"
                    value={newDocTags}
                    onChange={(e) => setNewDocTags(e.target.value)}
                    placeholder="rubberwood, acrylic, stability"
                    className="w-full text-xs p-2 rounded-lg border border-shadow-darker/20 bg-surface"
                  />
                </div>
              </div>

              {/* Upload File Input */}
              <div className="p-3 rounded-lg border border-dashed border-shadow-darker/25 bg-surface text-center space-y-2">
                <input
                  type="file"
                  id="brain_file_upload_input"
                  accept=".pdf,.txt,.md,.json,.png,.jpg,.jpeg,.webp"
                  onChange={handleBrainFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="brain_file_upload_input"
                  className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                >
                  <Upload size={14} />
                  <span>{uploadingFile ? 'Uploading file...' : 'Choose PDF, Document or Image'}</span>
                </label>
                {attachedBrainFileUrl && (
                  <p className="text-[10px] text-emerald-700 font-medium truncate">
                    Attached: {attachedBrainFileUrl}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-secondary block mb-1">
                  Knowledge Rules &amp; Directives (Injected into Agent Prompts)
                </label>
                <textarea
                  rows={4}
                  required
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                  placeholder="Describe manufacturing constraints, layer tolerances, materials, or branding standards the agent must respect..."
                  className="w-full text-xs p-2.5 rounded-lg border border-shadow-darker/20 bg-surface focus:outline-none focus:border-primary leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-shadow-darker/10">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="neo-btn text-xs px-3.5 py-1.5 font-bold text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingFile}
                  className="neo-btn-primary text-xs px-4 py-1.5 font-bold bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Save to Design Brain
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN API MODAL */}
      {showAdminModal && isAdmin && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="neo-card max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-shadow-darker/10 pb-3">
              <h3 className="text-sm font-bold text-primary-dark flex items-center gap-2">
                <Settings size={18} className="text-primary" />
                OpenAI API Configuration
              </h3>
              <button
                type="button"
                onClick={() => setShowAdminModal(false)}
                className="text-secondary hover:text-primary-dark p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-secondary block mb-1">OpenAI API Key</label>
                <input
                  type="password"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full text-xs font-mono p-2.5 rounded-lg border border-shadow-darker/20 bg-surface focus:outline-none focus:border-primary"
                />
              </div>

              {apiKeyStatus && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium ${apiKeyStatus.includes('✅')
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                >
                  {apiKeyStatus}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleTestApiKey}
                  className="neo-btn-primary px-4 py-2 text-xs font-bold"
                >
                  Save &amp; Test Connection
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="neo-btn px-4 py-2 text-xs font-bold text-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

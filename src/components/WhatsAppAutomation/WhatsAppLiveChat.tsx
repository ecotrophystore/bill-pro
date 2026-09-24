// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  doc,
  getDoc,
  getDocs,
  limit,
  addDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Send,
  Loader2,
  Sparkles,
  MessageSquare,
  Search,
  CheckCheck,
  Phone,
  User,
  Building,
  Package,
  ExternalLink,
  Zap,
  Info,
  X,
  FileText,
  AlertCircle,
  Bot,
  Mail,
  ArrowLeft,
  ChevronRight,
  Check,
  Calendar,
  DollarSign,
  Copy,
  Plus,
  MoreVertical,
  Store,
  Edit2,
  Paperclip,
  Image as ImageIcon,
  Tag,
  Settings
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, functions, storage } from '../../lib/firebase';
import { processInboundWhatsAppMessage } from '../../lib/whatsappInboundProcessor';
import { BusinessProfileSettings } from './BusinessProfileSettings';
import { NewChatModal } from './NewChatModal';
import { ManageLabelsModal } from './ManageLabelsModal';
import { useChatLabels } from '../../hooks/useChatLabels';

// ── Types ────────────────────────────────────────────────────────────────────
interface MessageItem {
  id: string;
  conversationId?: string;
  leadId?: string;
  senderPhone: string;
  direction: 'inbound' | 'outbound';
  content: string;
  type?: string;
  metaMessageId?: string;
  platform?: string;
  triggeredBy?: string;
  senderName?: string;
  created_at?: any;
}

interface ConversationItem {
  id: string;
  participantName?: string;
  participantPhone: string;
  leadId?: string;
  lastMessage?: string;
  lastMessageAt?: any;
  lastDirection?: 'inbound' | 'outbound';
  ai_suggested_reply?: string;
  ai_qualification?: string;
  ai_classification?: string;
  ai_flag_for_review?: boolean;
  pipelineStage?: string;
  unreadCount?: number;
  labels?: string[];
  updated_at?: any;
}

// ── Quick Templates for Trophy Business ──────────────────────────────────────
const QUICK_TEMPLATES = [
  {
    title: 'Welcome & Inquiry Response',
    text: 'Hi {{name}}, thank you for reaching out to EcoTrophy! We have received your inquiry. Could you please share the required quantity, event date, and any logo/branding requirements?'
  },
  {
    title: 'Sample Design Ready',
    text: 'Hi {{name}}, your customized trophy design preview is ready! Please review the design and confirm so we can initiate production.'
  },
  {
    title: 'Advance Payment Request',
    text: 'Hi {{name}}, regarding your trophy order, please transfer the 50% advance to confirm your production slot. GPay / UPI: 9344309369. Once paid, kindly share the screenshot here!'
  },
  {
    title: 'In Production Update',
    text: 'Hi {{name}}, great news! Your trophy order has now entered the manufacturing stage in our workshop. We will keep you updated on progress.'
  },
  {
    title: 'Ready for Dispatch',
    text: 'Hi {{name}}, your trophies have passed quality inspection and are packed securely. We are preparing the dispatch today!'
  }
];

const DEFAULT_STAGES = [
  { id: 'new', label: 'New Inquiry' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'quotation_sent', label: 'Quotation Sent' },
  { id: 'advance_paid', label: 'Advance Paid' },
  { id: 'in_production', label: 'In Production' },
  { id: 'ready_dispatch', label: 'Ready for Dispatch' },
  { id: 'delivered', label: 'Delivered / Won' }
];

export function WhatsAppLiveChat() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Responsive mobile/split view state: 'list' or 'chat'
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'qualified'>('all');

  // Input state
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [showLabelsMenu, setShowLabelsMenu] = useState(false);
  const [showManageLabels, setShowManageLabels] = useState(false);
  const [sendError, setSendError] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showBusinessProfile, setShowBusinessProfile] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [editContactMode, setEditContactMode] = useState(false);
  const [editContactName, setEditContactName] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  // Right Drawer Context
  const [leadDetails, setLeadDetails] = useState<any | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  
  // Custom Labels Hook
  const { labels: dynamicChatLabels } = useChatLabels();

  // Available Pipeline stages
  const [availableStages, setAvailableStages] = useState<{ id: string; label: string }[]>(DEFAULT_STAGES);

  // Simulator state
  const [simPhone, setSimPhone] = useState('918148936699');
  const [simName, setSimName] = useState('Karthik Raja');
  const [simText, setSimText] = useState('Hi, I need 50 pieces custom wooden trophy next week. What is the price?');
  const [simulating, setSimulating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // ── 0. Fetch Pipeline Stages for CRM Stage Changer ─────────────────────────
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, 'pipelines'), (snap) => {
      const stages: { id: string; label: string }[] = [];
      snap.docs.forEach((d) => {
        const p = d.data();
        if (p.stages && Array.isArray(p.stages)) {
          p.stages.forEach((s: any) => {
            if (s && s.id && !stages.some((existing) => existing.id === s.id)) {
              stages.push({ id: s.id, label: s.label || s.id });
            }
          });
        }
      });
      if (stages.length > 0) {
        setAvailableStages(stages);
      }
    });
    return () => unsub();
  }, []);

  // ── 1. Fetch Conversations in Real-time ─────────────────────────────────────
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(
      collection(db, 'conversations'),
      (snap) => {
        const list: ConversationItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data()
        } as ConversationItem));

        // Sort dynamically using any available timestamp without dropping docs
        list.sort((a, b) => {
          const getT = (item: any) => {
            const v = item.lastMessageAt || item.updated_at || item.updatedAt || item.lastCustomerReplyAt || item.createdAt || item.created_at;
            if (!v) return 0;
            return v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : new Date(v).getTime() || 0;
          };
          return getT(b) - getT(a);
        });

        setConversations(list);
        setLoadingConvs(false);

        // If URL has leadId or phone, auto-select matching conversation
        const targetLeadId = searchParams.get('leadId');
        const targetPhone = searchParams.get('phone');

        if (targetLeadId || targetPhone) {
          const match = list.find((c) =>
            (targetLeadId && c.leadId === targetLeadId) ||
            (targetPhone && c.participantPhone && c.participantPhone.includes(targetPhone.replace(/\D/g, '').slice(-10)))
          );
          if (match) {
            setSelectedConv(match);
            setMobileView('chat');
            return;
          }
        }

        // Fallback: select first conversation if none selected
        setSelectedConv((prev) => {
          if (prev) {
            const updated = list.find((c) => c.id === prev.id);
            return updated || prev;
          }
          return list.length > 0 ? list[0] : null;
        });
      },
      (err) => {
        console.error('Error fetching conversations:', err);
        setLoadingConvs(false);
      }
    );

    return () => unsub();
  }, [searchParams]);

  // ── 2. Fetch Messages for Selected Conversation (Dual Listener) ─────────────
  useEffect(() => {
    if (!db || !selectedConv) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);

    const rawPhone = String(selectedConv.participantPhone || '').replace(/\D/g, '');
    const searchPhones: string[] = [];
    if (rawPhone.length >= 10) {
      const tenDigit = rawPhone.slice(-10);
      searchPhones.push(rawPhone);
      if (!searchPhones.includes(tenDigit)) searchPhones.push(tenDigit);
      if (!searchPhones.includes(`91${tenDigit}`)) searchPhones.push(`91${tenDigit}`);
      if (!searchPhones.includes(`+91${tenDigit}`)) searchPhones.push(`+91${tenDigit}`);
    } else if (rawPhone.length > 0) {
      searchPhones.push(rawPhone);
    }

    let convMsgs: MessageItem[] = [];
    let phoneMsgs: MessageItem[] = [];

    const mergeAndSet = () => {
      const map = new Map<string, MessageItem>();
      [...convMsgs, ...phoneMsgs].forEach((m) => {
        if (m && m.id) map.set(m.id, m);
      });
      const combined = Array.from(map.values());

      combined.sort((a, b) => {
        const getT = (item: any) => {
          const v = item.created_at || item.createdAt || item.timestamp;
          if (!v) return 0;
          return v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : new Date(v).getTime() || 0;
        };
        return getT(a) - getT(b);
      });

      setMessages(combined);
      setLoadingMessages(false);
    };

    // 1. Listen by conversationId
    const unsub1 = onSnapshot(
      query(collection(db, 'messages'), where('conversationId', '==', selectedConv.id)),
      (snap) => {
        convMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MessageItem));
        mergeAndSet();
      },
      (err) => {
        console.warn('Error fetching conversation messages:', err);
        mergeAndSet();
      }
    );

    // 2. Listen by senderPhone
    let unsub2 = () => {};
    if (searchPhones.length > 0) {
      unsub2 = onSnapshot(
        query(collection(db, 'messages'), where('senderPhone', 'in', searchPhones.slice(0, 10))),
        (snap) => {
          phoneMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MessageItem));
          mergeAndSet();
        },
        (err) => {
          console.warn('Error fetching phone messages:', err);
          mergeAndSet();
        }
      );
    }

    return () => {
      unsub1();
      unsub2();
    };
  }, [selectedConv?.id, selectedConv?.participantPhone]);

  // ── 3. Fetch Linked Lead Details with Phone Fallback ─────────────────────────
  useEffect(() => {
    if (!db || !selectedConv) {
      setLeadDetails(null);
      return;
    }

    if (selectedConv.leadId) {
      getDoc(doc(db, 'leads', selectedConv.leadId))
        .then((snap) => {
          if (snap.exists()) {
            setLeadDetails({ id: snap.id, ...snap.data() });
          } else {
            setLeadDetails(null);
          }
        })
        .catch((e) => console.warn('Could not fetch lead details:', e));
    } else if (selectedConv.participantPhone) {
      const cleanPhone = String(selectedConv.participantPhone).replace(/\D/g, '').slice(-10);
      getDocs(query(collection(db, 'leads'), limit(25)))
        .then((snap) => {
          const match = snap.docs.find((d) => {
            const data = d.data();
            const p = String(data.phone || data.normalized_phone || '').replace(/\D/g, '');
            return p.endsWith(cleanPhone);
          });
          if (match) {
            setLeadDetails({ id: match.id, ...match.data() });
          } else {
            setLeadDetails(null);
          }
        })
        .catch((e) => console.warn('Could not search lead by phone:', e));
    }
  }, [selectedConv?.leadId, selectedConv?.participantPhone]);

  // Auto scroll on message update
  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length]);

  // ── 4. Send Message via Backend Cloud Function / Direct Meta Fallback ────────
  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || inputText).trim();
    if (!content || !selectedConv || isSending) return;
    setIsSending(true);
    setSendError('');
    await sendMessagePayload({ type: 'text', text: { body: content } }, content);
    setInputText('');
    setIsSending(false);
  };

  const handleSendMedia = async (file: File, type: 'image' | 'document' | 'audio') => {
    if (!selectedConv?.id || !storage) return;
    setIsSending(true);
    setShowAttachmentMenu(false);
    
    try {
      const fileRef = ref(storage, `chat_media/${selectedConv.leadId || 'general'}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      let payload: any = { type };
      let previewText = `Sent ${type}`;
      
      if (type === 'image') {
        payload.image = { link: url };
        previewText = '📷 Image';
      } else if (type === 'document') {
        payload.document = { link: url, filename: file.name };
        previewText = `📄 ${file.name}`;
      } else if (type === 'audio') {
        payload.audio = { link: url };
        previewText = '🎵 Audio';
      }

      await sendMessagePayload(payload, previewText, url);
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setSendError(err.message || 'Failed to send message');
    }
  };

  const sendMessagePayload = async (messagePayload: any, textForDb: string, mediaUrl?: string) => {
    try {
      const cleanPhone = String(selectedConv!.participantPhone).replace(/\D/g, '');
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      // Direct Meta Cloud API Dispatch (Instant & No CORS / 404 errors)
      let phoneId = '1263075550230396';
      let token = 'EAAP5CXj9PZA0BSZArJ0rvk8MMj0L90vBkzBNs6lhFeYwCEFv4ko0dj49kmqxRKwTZBsWhO18Ecsk4ZCQ4V6xLJtZCD2h2NAb3U9eakgQZCYELZAkQqPY300LngHx9DmeoOE3WBGTtASRr5XfjfBp1x0vmjKS6sf8dsKdDGIOvbtTM2QZBccvuBxS6hZCdg5QmhAZDZD';
      let version = 'v18.0';

        if (db) {
          try {
            const metaDoc = await getDoc(doc(db, 'meta_integrations', 'default'));
            if (metaDoc.exists()) {
              const data = metaDoc.data();
              if (data?.whatsappPhoneNumberId) phoneId = data.whatsappPhoneNumberId;
              if (data?.metaWhatsAppAccessToken || data?.accessToken)
                token = data.metaWhatsAppAccessToken || data.accessToken;
              if (data?.graphApiVersion) version = data.graphApiVersion;
            }
          } catch (e) {
            console.warn('Could not read meta_integrations/default:', e);
          }
        }

        const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: finalPhone,
            ...messagePayload
          })
        });

        const resJson = await res.json();
        if (resJson.error) {
          throw new Error(resJson.error.message || 'Meta Cloud API error');
        }

        const wamid = resJson.messages?.[0]?.id || `out_${Date.now()}`;

        if (db) {
          await addDoc(collection(db, 'messages'), {
            conversationId: selectedConv!.id,
            leadId: selectedConv!.leadId || null,
            senderPhone: finalPhone,
            direction: 'outbound',
            type: messagePayload.type,
            content: textForDb,
            mediaUrl: mediaUrl || null,
            metaMessageId: wamid,
            platform: 'whatsapp',
            triggeredBy: 'live_chat',
            created_at: serverTimestamp()
          });

          await updateDoc(doc(db, 'conversations', selectedConv!.id), {
            lastMessage: `[You]: ${textForDb}`,
            lastMessageAt: serverTimestamp(),
            lastDirection: 'outbound',
            ai_suggested_reply: '',
            updated_at: serverTimestamp()
          });

          if (selectedConv!.leadId) {
            await addDoc(collection(db, 'activities'), {
              lead_id: selectedConv!.leadId,
              leadId: selectedConv!.leadId,
              type: 'whatsapp_reply_sent',
              title: 'WhatsApp Chat Reply Sent',
              message: `Sent WhatsApp reply: "${textForDb.slice(0, 100)}"`,
              actor: 'Staff',
              created_at: serverTimestamp()
            });
          }
        }

      setInputText('');
      scrollToBottom(true);
    } catch (err: any) {
      console.error('Error sending WhatsApp message:', err);
      const errMsg = err?.details?.message || err?.message || 'Failed to send message via WhatsApp Cloud API.';
      setSendError(errMsg);
    } finally {
      setIsSending(false);
    }
  };

  // ── 5. Inbound Message Simulator for Testing ───────────────────────────────
  const handleSimulateInbound = async () => {
    if (!simText.trim() || simulating) return;
    setSimulating(true);
    try {
      await processInboundWhatsAppMessage({
        senderPhone: simPhone.trim(),
        senderName: simName.trim(),
        messageText: simText.trim(),
        metaMessageId: `sim_${Date.now()}`
      });
      setShowSimulator(false);
      setSimText('');
    } catch (err: any) {
      alert('Simulation error: ' + err.message);
    } finally {
      setSimulating(false);
    }
  };

  // ── 6. Update Lead Pipeline Stage Directly from Live Chat ──────────────────
  const handleUpdateLeadStage = async (newStageId: string) => {
    if (!db || !leadDetails?.id || updatingStage) return;
    setUpdatingStage(true);
    try {
      await updateDoc(doc(db, 'leads', leadDetails.id), {
        status: newStageId,
        updated_at: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      if (selectedConv) {
        await updateDoc(doc(db, 'conversations', selectedConv.id), {
          pipelineStage: newStageId,
          updated_at: serverTimestamp()
        });
      }

      setLeadDetails((prev: any) => (prev ? { ...prev, status: newStageId } : prev));
      setSelectedConv((prev: any) => (prev ? { ...prev, pipelineStage: newStageId } : prev));
    } catch (err) {
      console.error('Failed to update stage:', err);
    } finally {
      setUpdatingStage(false);
    }
  };

  const handleToggleLabel = async (labelId: string) => {
    if (!selectedConv || !db) return;
    
    const currentLabels = selectedConv.labels || [];
    const newLabels = currentLabels.includes(labelId)
      ? currentLabels.filter((id) => id !== labelId)
      : [...currentLabels, labelId];

    try {
      await updateDoc(doc(db, 'conversations', selectedConv.id), {
        labels: newLabels,
        updated_at: serverTimestamp()
      });
      setSelectedConv((prev: any) => (prev ? { ...prev, labels: newLabels } : prev));
      setConversations((prev) => 
        prev.map(c => c.id === selectedConv.id ? { ...c, labels: newLabels } : c)
      );
    } catch (err) {
      console.error('Failed to update labels:', err);
    }
  };

  const handleSaveContact = async () => {
    if (!selectedConv || !db) return;
    setSavingContact(true);
    try {
      await updateDoc(doc(db, 'conversations', selectedConv.id), {
        participantName: editContactName,
        updated_at: serverTimestamp()
      });
      
      if (selectedConv.leadId) {
        await updateDoc(doc(db, 'leads', selectedConv.leadId), {
          name: editContactName,
          updated_at: serverTimestamp()
        });
        setLeadDetails((prev: any) => prev ? { ...prev, name: editContactName } : prev);
      }
      
      setSelectedConv(prev => prev ? { ...prev, participantName: editContactName } : prev);
      setEditContactMode(false);
    } catch (err) {
      console.error('Error saving contact:', err);
    } finally {
      setSavingContact(false);
    }
  };

  // ── Filtered conversation list ──────────────────────────────────────────────
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (c.participantName && c.participantName.toLowerCase().includes(q)) ||
        c.participantPhone.includes(q) ||
        (c.lastMessage && c.lastMessage.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (filterType === 'unread') return (c.unreadCount || 0) > 0;
      if (filterType === 'qualified') return c.ai_qualification === 'Qualified';
      return true;
    });
  }, [conversations, searchQuery, filterType]);

  // Check if conversation is outside the 24-hour Meta Customer Care window
  const isOutside24hWindow = useMemo(() => {
    if (!selectedConv) return false;
    const replyTime = selectedConv.lastCustomerReplyAt;
    if (!replyTime) return true; // Customer hasn't replied yet
    const t = replyTime.toMillis ? replyTime.toMillis() : replyTime.seconds ? replyTime.seconds * 1000 : new Date(replyTime).getTime();
    if (!t || isNaN(t)) return true;
    return (Date.now() - t) > (24 * 60 * 60 * 1000);
  }, [selectedConv?.lastCustomerReplyAt, selectedConv?.id]);

  // Format timestamp helper
  const formatTime = (ts: any) => {
    if (!ts) return '';
    const date = ts.toMillis ? new Date(ts.toMillis()) : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format date divider helper
  const formatDateDivider = (ts: any) => {
    if (!ts) return '';
    const date = ts.toMillis ? new Date(ts.toMillis()) : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    if (now.toDateString() === date.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (yesterday.toDateString() === date.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const copyPhoneNumber = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  return (
    <div className="w-full h-full flex flex-1 min-h-0 bg-transparent rounded-2xl border border-shadow-darker/20 shadow-lg overflow-hidden relative select-text">
      {/* ── COLUMN 1: CONVERSATIONS LIST SIDEBAR ─────────────────────────────── */}
      <div
        className={`${
          mobileView === 'chat' ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 lg:w-[320px] shrink-0 bg-transparent border-r border-slate-200/80 flex-col h-full min-h-0 z-10 transition-all`}
      >
        {/* Sidebar Header & Search */}
        <div className="p-3.5 border-b border-slate-200/80 bg-transparent space-y-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-600/10 flex items-center justify-center text-emerald-700">
                <MessageSquare size={15} />
              </div>
              <h3 className="font-bold text-slate-800 text-sm tracking-tight">Chats</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/70 text-slate-600">
                {filteredConversations.length}
              </span>
            </div>

            <div className="flex items-center gap-1 text-slate-500">
              <button
                onClick={() => setShowNewChatModal(true)}
                className="p-2 hover:bg-transparent rounded-full transition-colors"
                title="New Chat"
              >
                <Plus size={20} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setShowBusinessProfile(true)}
                className="p-2 hover:bg-transparent rounded-full transition-colors"
                title="Business Profile"
              >
                <Store size={20} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setShowSimulator(true)}
                className="p-2 hover:bg-transparent rounded-full transition-colors"
                title="Simulator"
              >
                <MoreVertical size={20} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, message..."
              className="w-full bg-transparent rounded-xl border border-slate-200 py-2 pl-9 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5">
            {(['all', 'unread', 'qualified'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`text-[11px] font-bold capitalize px-3 py-1 rounded-lg transition-all ${
                  filterType === t
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200/60 bg-transparent border border-slate-200/70'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 custom-sidebar-scrollbar">
          {loadingConvs ? (
            <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin text-emerald-600" /> Loading chats...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs space-y-2">
              <MessageSquare size={24} className="mx-auto text-slate-300" />
              <p>No conversations found.</p>
              <button
                onClick={() => setShowSimulator(true)}
                className="text-xs font-semibold text-emerald-600 hover:underline inline-block mt-1"
              >
                Try the Inbound Simulator
              </button>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConv?.id === conv.id;
              const name = conv.participantName || `+${conv.participantPhone}`;
              const initial = name.charAt(0).toUpperCase();

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    setSelectedConv(conv);
                    setMobileView('chat');
                  }}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all border-l-[3px] ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-600'
                      : 'hover:bg-transparent border-transparent'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 border border-emerald-200/70 flex items-center justify-center font-bold text-emerald-800 text-sm shadow-xs">
                      {initial}
                    </div>
                    {conv.lastDirection === 'inbound' && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"></span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{name}</h4>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {formatTime(conv.lastMessageAt || conv.updated_at)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 truncate leading-relaxed">
                      {conv.lastDirection === 'outbound' && (
                        <CheckCheck size={12} className="inline mr-1 text-emerald-600" />
                      )}
                      {conv.lastMessage || 'No messages yet'}
                    </p>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {conv.pipelineStage && (
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-transparent text-slate-700 border border-slate-200/60">
                          {conv.pipelineStage.replace(/_/g, ' ')}
                        </span>
                      )}
                      {conv.ai_qualification === 'Qualified' && (
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Qualified
                        </span>
                      )}
                      {conv.ai_suggested_reply && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-0.5">
                          <Sparkles size={9} className="text-amber-600" /> Draft Ready
                        </span>
                      )}
                      
                      {/* Render Chat Labels */}
                      {conv.labels?.map((labelId) => {
                        const labelDef = dynamicChatLabels.find((l) => l.id === labelId);
                        if (!labelDef) return null;
                        return (
                          <span key={labelId} className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${labelDef.colorClass}`}>
                            {labelDef.text}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── COLUMN 2: ACTIVE CONVERSATION CHAT THREAD ──────────────────────── */}
      <div
        className={`${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        } flex-1 min-w-0 flex-col bg-[#F7F5F0] relative h-full overflow-hidden`}
      >
        {selectedConv ? (
          <>
            {/* Chat Thread Header */}
            <div className="bg-transparent border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-xs shrink-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                {/* Back Button for mobile view */}
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-transparent"
                  title="Back to conversation list"
                >
                  <ArrowLeft size={18} />
                </button>

                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-100 to-teal-200 border border-emerald-300 flex items-center justify-center font-bold text-emerald-800 text-sm shrink-0 shadow-xs">
                  {(selectedConv.participantName || selectedConv.participantPhone).charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">
                      {selectedConv.participantName || `+${selectedConv.participantPhone}`}
                    </h3>
                    {selectedConv.pipelineStage && (
                      <span className="hidden sm:inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-transparent text-slate-700 border border-slate-200">
                        {selectedConv.pipelineStage.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span className="flex items-center gap-1 font-mono">
                      <Phone size={10} className="text-emerald-600" /> +{selectedConv.participantPhone}
                    </span>
                    <button
                      onClick={() => copyPhoneNumber(`+${selectedConv.participantPhone}`)}
                      className="text-slate-400 hover:text-slate-600"
                      title="Copy phone number"
                    >
                      {copiedPhone ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Header Right Actions */}
              <div className="flex items-center gap-2 shrink-0">
                
                {/* Labels Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowLabelsMenu(!showLabelsMenu)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all ${
                      showLabelsMenu || (selectedConv.labels && selectedConv.labels.length > 0)
                        ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-xs'
                        : 'bg-transparent hover:bg-transparent text-slate-700 border-slate-200'
                    }`}
                    title="Toggle Chat Labels"
                  >
                    <Tag size={14} />
                    <span className="hidden sm:inline">Labels</span>
                  </button>

                  {showLabelsMenu && (
                    <div className="absolute top-full right-0 mt-2 bg-transparent rounded-xl shadow-xl border border-slate-200 py-2 flex flex-col z-50 min-w-[200px]">
                      <div className="px-3 pb-2 mb-1 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Apply Labels
                      </div>
                      
                      <div className="max-h-60 overflow-y-auto py-1">
                        {dynamicChatLabels.map((label) => {
                          const isActive = selectedConv.labels?.includes(label.id);
                          return (
                            <button
                              key={label.id}
                              onClick={() => handleToggleLabel(label.id)}
                              className="flex items-center justify-between px-3 py-1.5 hover:bg-transparent transition-colors text-left w-full"
                            >
                              <span className={`text-xs font-bold px-2 py-1 rounded-md border ${label.colorClass}`}>
                                {label.text}
                              </span>
                              {isActive && <Check size={14} className="text-emerald-500" />}
                            </button>
                          );
                        })}
                      </div>

                      <div className="border-t border-slate-100 mt-1 pt-1">
                        <button
                          onClick={() => { setShowLabelsMenu(false); setShowManageLabels(true); }}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-transparent transition-colors w-full text-left"
                        >
                          <Settings size={14} /> Manage Labels
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowDetailsDrawer(!showDetailsDrawer)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all ${
                    showDetailsDrawer
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-transparent hover:bg-transparent text-slate-700 border-slate-200'
                  }`}
                  title="Toggle CRM Context Panel"
                >
                  <Info size={14} />
                  <span className="hidden sm:inline">CRM Context</span>
                </button>

                {selectedConv.leadId && (
                  <button
                    onClick={() => navigate(`/leads/${selectedConv.leadId}`)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-transparent hover:bg-transparent text-primary border border-slate-200 flex items-center gap-1 transition-all"
                    title="Open Lead file in CRM"
                  >
                    <ExternalLink size={13} />
                    <span className="hidden md:inline">Open Lead</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const rawP = String(selectedConv.participantPhone || '').replace(/\D/g, '');
                    const finalP = rawP.length === 10 ? `91${rawP}` : rawP;
                    window.open(`https://wa.me/${finalP}`, '_blank', 'noopener,noreferrer');
                  }}
                  className="text-xs font-bold px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 transition-all shadow-2xs"
                  title="Open chat directly in WhatsApp Web (bypasses Meta Cloud API 24h restrictions)"
                >
                  <ExternalLink size={13} />
                  <span className="hidden sm:inline">WhatsApp Web</span>
                </button>
              </div>
            </div>

            {/* Message Bubbles Container */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3 custom-sidebar-scrollbar">
              {loadingMessages ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                  <Loader2 size={20} className="animate-spin text-emerald-600 mr-2" /> Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs text-center space-y-2.5">
                  <div className="w-12 h-12 rounded-2xl bg-transparent shadow-xs border border-slate-200/80 flex items-center justify-center text-slate-400">
                    <MessageSquare size={24} />
                  </div>
                  <p className="font-semibold text-slate-600 text-sm">No messages recorded yet</p>
                  <p className="text-slate-400 max-w-xs text-[11px] leading-relaxed">
                    Type below to send the first message directly to their WhatsApp via Meta Cloud API.
                  </p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isOutbound = m.direction === 'outbound';
                  const isStageNotification = m.triggeredBy === 'stage_change';

                  // Check if date divider is needed
                  const prevM = idx > 0 ? messages[idx - 1] : null;
                  const currDateStr = formatDateDivider(m.created_at);
                  const prevDateStr = prevM ? formatDateDivider(prevM.created_at) : null;
                  const showDateDivider = currDateStr && currDateStr !== prevDateStr;

                  return (
                    <React.Fragment key={m.id || idx}>
                      {/* Date Divider Chip */}
                      {showDateDivider && (
                        <div className="flex justify-center my-2">
                          <span className="bg-transparent backdrop-blur-xs border border-slate-200/80 text-slate-500 text-[10px] font-bold px-3 py-0.5 rounded-full shadow-2xs">
                            {currDateStr}
                          </span>
                        </div>
                      )}

                      <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
                        {/* Auto Stage Notification Pill */}
                        {isStageNotification && (
                          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 mb-1.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200 shadow-2xs">
                            <Zap size={11} className="text-sky-600" /> Auto Stage Notification Sent
                          </div>
                        )}

                        {/* Chat Bubble */}
                        <div
                          className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-3 text-[13px] leading-relaxed shadow-xs relative ${
                            isOutbound
                              ? 'bg-[#005c4b] text-white rounded-tr-xs'
                              : 'bg-transparent text-slate-800 border border-slate-200/80 rounded-tl-xs'
                          }`}
                        >
                          {m.type === 'image' && m.mediaUrl ? (
                            <div className="mb-2 rounded-md overflow-hidden bg-black/20">
                              <img src={m.mediaUrl} alt="Attachment" className="max-w-full max-h-64 object-contain" />
                            </div>
                          ) : m.type === 'audio' && m.mediaUrl ? (
                            <div className="mb-2">
                              <audio controls src={m.mediaUrl} className="max-w-[200px] h-8" />
                            </div>
                          ) : m.type === 'document' && m.mediaUrl ? (
                            <div className="mb-2 p-3 bg-black/10 rounded-lg flex items-center gap-3">
                              <FileIcon size={24} className={isOutbound ? 'text-emerald-100' : 'text-[#008069]'} />
                              <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="underline font-medium hover:text-white truncate max-w-[150px]">
                                {m.content || 'Document'}
                              </a>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap font-sans break-words">{m.content}</p>
                          )}

                          <div
                            className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                              isOutbound ? 'text-emerald-200' : 'text-slate-400'
                            }`}
                          >
                            <span>{formatTime(m.created_at)}</span>
                            {isOutbound && (
                              <span className="inline-flex items-center ml-0.5">
                                {m.status === 'read' ? (
                                  <CheckCheck size={13} className="text-[#53bdeb]" title="Read" />
                                ) : m.status === 'delivered' ? (
                                  <CheckCheck size={13} className="text-emerald-200" title="Delivered" />
                                ) : m.status === 'failed' ? (
                                  <span className="inline-flex items-center gap-1 text-rose-300 font-bold" title={m.errorMessage || 'Failed to deliver'}>
                                    <AlertCircle size={13} className="text-rose-400" />
                                    <span className="text-[9px] text-rose-300">Undelivered</span>
                                  </span>
                                ) : (
                                  <Check size={13} className="text-emerald-200" title="Sent to Meta" />
                                )}
                              </span>
                            )}
                          </div>

                          {/* Failure Warning with 1-Click WhatsApp Web Resend */}
                          {isOutbound && m.status === 'failed' && (
                            <div className="mt-1.5 pt-1.5 border-t border-rose-400/30 text-[11px] text-rose-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                              <span className="flex items-center gap-1">
                                <AlertCircle size={11} className="shrink-0 text-rose-300" />
                                {m.errorCode === 131047 || m.errorMessage?.includes('Re-engagement')
                                  ? 'Blocked: >24h since customer reply'
                                  : (m.errorMessage || 'Delivery failed')}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const p = String(selectedConv?.participantPhone || m.senderPhone || '').replace(/\D/g, '');
                                  const finalP = p.length === 10 ? `91${p}` : p;
                                  window.open(`https://wa.me/${finalP}?text=${encodeURIComponent(m.content)}`, '_blank', 'noopener,noreferrer');
                                }}
                                className="underline font-bold text-white hover:text-emerald-200 flex items-center gap-1 shrink-0"
                              >
                                Send via WhatsApp Web <ExternalLink size={10} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* AI Suggested Response Copilot Widget */}
            {selectedConv.ai_suggested_reply && (
              <div className="bg-gradient-to-r from-amber-50/95 via-orange-50/90 to-amber-50/95 border border-amber-300/70 rounded-xl p-3 shadow-xs mx-4 mb-2 shrink-0 animate-fade-in">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                    <Sparkles size={14} className="text-amber-600 animate-pulse" />
                    <span>Gemini AI Suggested Reply</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setInputText(selectedConv.ai_suggested_reply || '');
                        if (textareaRef.current) {
                          textareaRef.current.focus();
                        }
                      }}
                      className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1 rounded-lg shadow-xs transition-colors flex items-center gap-1"
                    >
                      <Sparkles size={12} /> Use Draft
                    </button>
                    <button
                      onClick={async () => {
                        if (db && selectedConv.id) {
                          await updateDoc(doc(db, 'conversations', selectedConv.id), {
                            ai_suggested_reply: ''
                          });
                        }
                        setSelectedConv((prev) => (prev ? { ...prev, ai_suggested_reply: undefined } : prev));
                      }}
                      className="text-slate-400 hover:text-slate-600 p-1"
                      title="Dismiss suggestion"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-amber-950 font-normal leading-relaxed italic bg-transparent rounded-lg p-2.5 border border-amber-200/50">
                  "{selectedConv.ai_suggested_reply}"
                </p>
              </div>
            )}

            {/* Quick Templates Floating Popover */}
            {showTemplates && (
              <div className="absolute bottom-20 left-4 z-40 bg-transparent rounded-2xl border border-slate-200 shadow-2xl p-3.5 w-80 max-h-72 overflow-y-auto space-y-2 animate-fade-in custom-sidebar-scrollbar">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Zap size={14} className="text-amber-500" /> Quick Response Templates
                  </span>
                  <button onClick={() => setShowTemplates(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                </div>
                {QUICK_TEMPLATES.map((tmpl, idx) => {
                  const filled = tmpl.text.replace('{{name}}', selectedConv.participantName || 'there');
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setInputText(filled);
                        setShowTemplates(false);
                        if (textareaRef.current) textareaRef.current.focus();
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-transparent transition-all border border-transparent hover:border-slate-200 text-xs group"
                    >
                      <span className="font-bold text-slate-800 group-hover:text-emerald-700 block">{tmpl.title}</span>
                      <span className="text-slate-500 line-clamp-2 text-[11px] mt-0.5">{filled}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Send Error Alert */}
            {sendError && (
              <div className="p-2.5 px-4 bg-rose-50 border-t border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2 shrink-0">
                <span className="flex items-center gap-1.5 font-medium">
                  <AlertCircle size={14} /> {sendError}
                </span>
                <button onClick={() => setSendError('')} className="font-bold hover:underline">
                  Dismiss
                </button>
              </div>
            )}

            {/* Chat Input Bar */}
            <div className="bg-transparent border-t border-slate-200/80 p-3 shrink-0 relative">
              {/* Meta 24-Hour Policy Window Notice */}
              {isOutside24hWindow && (
                <div className="px-3 py-2 mb-2 bg-amber-500/10 border border-amber-300/80 rounded-xl text-amber-950 text-[11px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 animate-fade-in shadow-2xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    <AlertCircle size={14} className="text-amber-600 shrink-0" />
                    <span>
                      <strong>Meta 24h Window Notice:</strong> Customer last replied &gt;24h ago. Regular Cloud API text will fail delivery.
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const p = String(selectedConv?.participantPhone || '').replace(/\D/g, '');
                      const finalP = p.length === 10 ? `91${p}` : p;
                      window.open(`https://wa.me/${finalP}?text=${encodeURIComponent(inputText || '')}`, '_blank', 'noopener,noreferrer');
                    }}
                    className="text-emerald-700 hover:text-emerald-900 font-bold underline shrink-0 flex items-center gap-1 self-start sm:self-auto"
                  >
                    Open WhatsApp Web to Send <ExternalLink size={10} />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTemplates(!showTemplates)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                      showTemplates
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-transparent hover:bg-slate-200/80 text-slate-600 border-slate-200/60'
                    }`}
                  >
                    <Zap size={13} className="text-amber-500" /> Quick Templates
                  </button>

                  {leadDetails?.id && (
                    <button
                      type="button"
                      onClick={() => navigate(`/quotations?leadId=${leadDetails.id}`)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-transparent hover:bg-slate-200/80 text-slate-600 border border-slate-200/60 flex items-center gap-1.5 transition-all"
                    >
                      <FileText size={13} className="text-sky-500" /> Create Quotation
                    </button>
                  )}
                </div>

                <span className="text-[11px] text-slate-400 hidden sm:inline font-medium">
                  Press <kbd className="px-1.5 py-0.5 bg-transparent border border-slate-200 rounded font-mono text-[10px]">Enter</kbd> to send
                </span>
              </div>

              <div className="flex items-end gap-2 relative">
                <div className="relative shrink-0 mb-1">
                  <button
                    onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                    className="w-10 h-10 rounded-full hover:bg-transparent text-slate-500 flex items-center justify-center transition-colors"
                    title="Attach"
                  >
                    <Paperclip size={20} />
                  </button>

                  {showAttachmentMenu && (
                    <div className="absolute bottom-12 left-0 bg-transparent rounded-xl shadow-xl border border-slate-200 py-2 flex flex-col gap-1 z-50 min-w-[160px]">
                      <button onClick={() => imageInputRef.current?.click()} className="flex items-center gap-3 px-4 py-2 hover:bg-transparent text-slate-700 transition-colors text-left w-full">
                        <ImageIcon size={18} className="text-blue-500" />
                        <span className="text-sm font-medium">Image</span>
                      </button>
                      <button onClick={() => docInputRef.current?.click()} className="flex items-center gap-3 px-4 py-2 hover:bg-transparent text-slate-700 transition-colors text-left w-full">
                        <FileText size={18} className="text-purple-500" />
                        <span className="text-sm font-medium">Document</span>
                      </button>
                      <button onClick={() => audioInputRef.current?.click()} className="flex items-center gap-3 px-4 py-2 hover:bg-transparent text-slate-700 transition-colors text-left w-full">
                        <Mic size={18} className="text-orange-500" />
                        <span className="text-sm font-medium">Voice Note</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Hidden File Inputs */}
                <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) handleSendMedia(e.target.files[0], 'image'); }} />
                <input type="file" ref={docInputRef} className="hidden" accept="application/pdf,.doc,.docx" onChange={(e) => { if (e.target.files?.[0]) handleSendMedia(e.target.files[0], 'document'); }} />
                <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={(e) => { if (e.target.files?.[0]) handleSendMedia(e.target.files[0], 'audio'); }} />

                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={`Type a message to ${selectedConv.participantName || `+${selectedConv.participantPhone}`}...`}
                  rows={1}
                  className="flex-1 bg-transparent rounded-xl border border-slate-200 py-2.5 px-3.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none max-h-28 min-h-[44px] leading-relaxed transition-all"
                />

                <button
                  onClick={() => handleSendMessage()}
                  disabled={isSending || !inputText.trim()}
                  className="neo-btn-primary !rounded-xl !px-4 !py-2.5 text-xs flex items-center justify-center gap-1.5 shrink-0 min-h-[44px] font-semibold disabled:opacity-40 shadow-sm transition-all"
                  title="Send via WhatsApp Cloud API"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-transparent shadow-xs border border-slate-200/80 flex items-center justify-center text-emerald-600">
              <MessageSquare size={32} />
            </div>
            <p className="font-semibold text-slate-700">Select a conversation</p>
            <p className="text-xs text-slate-400 max-w-xs text-center">
              Choose a contact from the left list to begin 2-way real-time WhatsApp chatting.
            </p>
          </div>
        )}
      </div>

      {/* ── COLUMN 3: CRM CUSTOMER CONTEXT DRAWER ──────────────────────────── */}
      {showDetailsDrawer && selectedConv && (
        <>
          {/* Backdrop for mobile / laptop screens (< 1280px) */}
          <div
            onClick={() => setShowDetailsDrawer(false)}
            className="xl:hidden fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-2xs transition-opacity"
          />

          <div className="fixed xl:static right-0 top-0 bottom-0 z-50 xl:z-auto w-80 lg:w-[320px] bg-[#f0f2f5] border-l border-slate-200/80 overflow-y-auto shrink-0 shadow-2xl xl:shadow-none flex flex-col h-full animate-fade-in text-xs custom-sidebar-scrollbar">
            {/* Drawer Header (WhatsApp Contact Info Style) */}
            <div className="bg-transparent flex items-center justify-start gap-5 px-4 py-3 shrink-0 shadow-xs">
              <button
                onClick={() => setShowDetailsDrawer(false)}
                className="text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
              <h4 className="font-normal text-slate-800 text-base">Contact info</h4>
            </div>

            {/* Profile Identity Card */}
            <div className="bg-transparent px-4 py-8 flex flex-col items-center shadow-sm mb-2 relative">
              {editContactMode ? (
                <div className="absolute top-4 right-4 flex gap-1">
                  <button onClick={() => setEditContactMode(false)} className="p-2 text-slate-400 hover:bg-transparent rounded-full transition-colors">
                    <X size={18} />
                  </button>
                  <button onClick={handleSaveContact} disabled={savingContact} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors">
                    {savingContact ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    setEditContactName(leadDetails?.name || selectedConv.participantName || '');
                    setEditContactMode(true);
                  }}
                  className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-transparent rounded-full transition-colors"
                  title="Edit Contact"
                >
                  <Edit2 size={18} />
                </button>
              )}
              
              <div className="w-40 h-40 rounded-full bg-slate-200 mb-5 flex items-center justify-center font-normal text-slate-500 text-6xl shrink-0 overflow-hidden shadow-sm">
                {(leadDetails?.name || selectedConv.participantName || 'C').charAt(0).toUpperCase()}
              </div>
              
              {editContactMode ? (
                <input 
                  type="text"
                  value={editContactName}
                  onChange={(e) => setEditContactName(e.target.value)}
                  placeholder="Enter name"
                  className="text-xl font-medium text-slate-900 mb-1.5 text-center border-b-2 border-[#008069] focus:outline-none bg-transparent px-2 py-1 min-w-[200px]"
                  autoFocus
                />
              ) : (
                <h2 className="font-medium text-xl text-slate-900 mb-1.5 text-center">
                  {leadDetails?.name || selectedConv.participantName || `+${selectedConv.participantPhone}`}
                </h2>
              )}
              
              <div className="text-slate-500 text-sm font-normal">
                +{selectedConv.participantPhone}
              </div>
            </div>

            {/* About / CRM Info */}
            <div className="bg-transparent px-5 py-5 shadow-sm mb-2 space-y-5">
              <div className="text-[#008069] font-medium text-[13px] mb-3">About and CRM info</div>
              
              <div className="flex flex-col">
                <span className="text-slate-800 text-[15px]">{leadDetails?.organization || 'Individual Customer'}</span>
                <span className="text-slate-500 text-[13px] mt-0.5">Organization</span>
              </div>

              {leadDetails?.email && (
                <div className="flex flex-col border-t border-slate-100 pt-4">
                  <span className="text-sky-600 text-[15px] truncate"><a href={`mailto:${leadDetails.email}`}>{leadDetails.email}</a></span>
                  <span className="text-slate-500 text-[13px] mt-0.5">Email</span>
                </div>
              )}
            </div>

            {/* Interactive Pipeline Stage Selector */}
            <div className="bg-transparent px-5 py-5 shadow-sm mb-2 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-800 font-medium text-[15px]">
                  Pipeline stage
                </span>
                {updatingStage && <Loader2 size={16} className="animate-spin text-emerald-600" />}
              </div>

              {leadDetails?.id ? (
                <div>
                  <select
                    value={leadDetails?.status || selectedConv.pipelineStage || 'new'}
                    onChange={(e) => handleUpdateLeadStage(e.target.value)}
                    disabled={updatingStage}
                    className="w-full bg-transparent rounded-lg border-b-2 border-slate-200 focus:border-[#008069] p-2.5 text-[15px] font-normal text-slate-800 focus:outline-none"
                  >
                    {availableStages.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[12px] text-slate-400 block mt-2">
                    Changing stage triggers WhatsApp automations.
                  </span>
                </div>
              ) : (
                <div className="text-[14px] text-slate-500">
                  <span className="capitalize">{selectedConv.pipelineStage || 'Inquiry'}</span>
                </div>
              )}
            </div>

            {/* Order Specifications */}
            <div className="bg-transparent px-5 py-5 shadow-sm mb-2 space-y-4">
              <span className="text-[#008069] font-medium text-[13px]">
                Order specifications
              </span>

              <div className="space-y-4">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[13px] mb-0.5">Quantity</span>
                  <span className="text-slate-800 text-[15px]">
                    {leadDetails?.required_quantity ? `${leadDetails.required_quantity} pcs` : 'Not specified'}
                  </span>
                </div>

                <div className="flex flex-col border-t border-slate-100 pt-3">
                  <span className="text-slate-500 text-[13px] mb-0.5">Trophy Specs</span>
                  <span className="text-slate-800 text-[15px]">
                    {leadDetails?.trophy_size || 'Custom'}
                  </span>
                </div>
              </div>

              {leadDetails?.value && (
                <div className="flex flex-col border-t border-slate-100 pt-3">
                  <span className="text-slate-500 text-[13px] mb-0.5">Order Value</span>
                  <span className="text-emerald-700 text-[15px] font-medium">
                    ₹{Number(leadDetails.value).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {leadDetails?.event_date && (
                <div className="flex flex-col border-t border-slate-100 pt-3">
                  <span className="text-slate-500 text-[13px] mb-0.5">Event Date</span>
                  <span className="text-slate-800 text-[15px]">{leadDetails.event_date}</span>
                </div>
              )}
            </div>

            {/* AI Lead Qualification Summary */}
            {leadDetails?.qualification_status && (
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 text-[11px] flex items-center gap-1">
                    <Sparkles size={12} className="text-amber-600" /> AI Lead Status
                  </span>
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                    {leadDetails.qualification_status}
                  </span>
                </div>
                {leadDetails.qualification_reason && (
                  <p className="text-[11px] text-amber-900/80 leading-relaxed">
                    {leadDetails.qualification_reason}
                  </p>
                )}
              </div>
            )}

            {/* Quick CRM Navigation */}
            <div className="bg-transparent px-5 py-4 shadow-sm mb-4 space-y-3">
              <span className="text-[#008069] font-medium text-[13px] block">
                CRM Actions
              </span>
              {selectedConv.leadId ? (
                <>
                  <button
                    onClick={() => navigate(`/leads/${selectedConv.leadId}`)}
                    className="w-full text-left py-2 flex items-center gap-3 text-slate-700 hover:bg-transparent"
                  >
                    <User size={20} className="text-slate-400" /> 
                    <span className="text-[15px]">Open full lead profile</span>
                  </button>
                  <button
                    onClick={() => navigate('/pipeline')}
                    className="w-full text-left py-2 flex items-center gap-3 text-slate-700 hover:bg-transparent"
                  >
                    <Package size={20} className="text-slate-400" /> 
                    <span className="text-[15px]">View on Pipeline Board</span>
                  </button>
                  <button
                    onClick={() => navigate(`/quotations?leadId=${selectedConv.leadId}`)}
                    className="w-full text-left py-2 flex items-center gap-3 text-slate-700 hover:bg-transparent"
                  >
                    <FileText size={20} className="text-slate-400" /> 
                    <span className="text-[15px]">Create quotation</span>
                  </button>
                </>
              ) : (
                <p className="text-[13px] text-slate-500">
                  No linked CRM lead yet.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── TEST SIMULATOR MODAL ───────────────────────────────────────────── */}
      {showSimulator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="neo-card w-full max-w-lg bg-transparent flex flex-col p-5 space-y-4 shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Bot size={18} className="text-emerald-600" /> Test Inbound WhatsApp Simulator
              </h3>
              <button
                onClick={() => setShowSimulator(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Simulate an incoming message from a customer on WhatsApp. This triggers lead creation, pipeline
              classification, and live chat syncing without needing an actual phone.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 uppercase text-[10px]">Customer Phone Number</label>
                <input
                  type="text"
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  className="w-full neo-input mt-1 text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 uppercase text-[10px]">Customer Name</label>
                <input
                  type="text"
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full neo-input mt-1 text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 uppercase text-[10px]">Inquiry Message</label>
                <textarea
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  rows={3}
                  className="w-full neo-input mt-1 text-xs resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80">
              <button onClick={() => setShowSimulator(false)} className="neo-btn text-xs px-3.5 py-1.5">
                Cancel
              </button>
              <button
                onClick={handleSimulateInbound}
                disabled={simulating || !simText.trim()}
                className="neo-btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5 font-semibold"
              >
                {simulating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send Simulated Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW CHAT MODAL ─────────────────────────────────────────────────── */}
      {showNewChatModal && (
        <NewChatModal 
          onClose={() => setShowNewChatModal(false)}
          onChatCreated={(conv) => {
            setConversations((prev) => [conv, ...prev]);
            setSelectedConv(conv);
            setMobileView('chat');
          }}
        />
      )}

      {/* ── BUSINESS PROFILE MODAL ─────────────────────────────────────────── */}
      {showBusinessProfile && (
        <BusinessProfileSettings onClose={() => setShowBusinessProfile(false)} />
      )}
      {showManageLabels && (
        <ManageLabelsModal 
          labels={dynamicChatLabels} 
          onClose={() => setShowManageLabels(false)} 
        />
      )}
    </div>
  );
}




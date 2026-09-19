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
  Copy
} from 'lucide-react';
import { db, functions } from '../../lib/firebase';
import { processInboundWhatsAppMessage } from '../../lib/whatsappInboundProcessor';

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
  const [sendError, setSendError] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  // Right Drawer Context
  const [leadDetails, setLeadDetails] = useState<any | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

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

    try {
      const cleanPhone = String(selectedConv.participantPhone).replace(/\D/g, '');
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      let sentViaFunction = false;

      // 1. Try secure backend Callable Function first
      if (functions) {
        try {
          const sendFn = httpsCallable(functions, 'sendWhatsAppChatMessage');
          await sendFn({
            conversationId: selectedConv.id,
            leadId: selectedConv.leadId || '',
            phone: finalPhone,
            message: content
          });
          sentViaFunction = true;
        } catch (fnErr: any) {
          console.warn('Backend Cloud Function fallback to direct Meta Cloud API:', fnErr);
        }
      }

      // 2. Direct Meta Graph API fallback if Cloud Function not yet deployed
      if (!sentViaFunction) {
        let phoneId = '1263075550230396';
        let token =
          'EAAP5CXj9PZA0BSZArJ0rvk8MMj0L90vBkzBNs6lhFeYwCEFv4ko0dj49kmqxRKwTZBsWhO18Ecsk4ZCQ4V6xLJtZCD2h2NAb3U9eakgQZCYELZAkQqPY300LngHx9DmeoOE3WBGTtASRr5XfjfBp1x0vmjKS6sf8dsKdDGIOvbtTM2QZBccvuBxS6hZCdg5QmhAZDZD';
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
            type: 'text',
            text: { body: content }
          })
        });

        const resJson = await res.json();
        if (resJson.error) {
          throw new Error(resJson.error.message || 'Meta Cloud API error');
        }

        const wamid = resJson.messages?.[0]?.id || `out_${Date.now()}`;

        // Save to Firestore messages & update conversation doc
        if (db) {
          await addDoc(collection(db, 'messages'), {
            conversationId: selectedConv.id,
            leadId: selectedConv.leadId || null,
            senderPhone: finalPhone,
            direction: 'outbound',
            type: 'text',
            content,
            metaMessageId: wamid,
            platform: 'whatsapp',
            triggeredBy: 'live_chat',
            created_at: serverTimestamp()
          });

          await updateDoc(doc(db, 'conversations', selectedConv.id), {
            lastMessage: `[You]: ${content}`,
            lastMessageAt: serverTimestamp(),
            lastDirection: 'outbound',
            ai_suggested_reply: '',
            updated_at: serverTimestamp()
          });

          if (selectedConv.leadId) {
            await addDoc(collection(db, 'activities'), {
              lead_id: selectedConv.leadId,
              leadId: selectedConv.leadId,
              type: 'whatsapp_reply_sent',
              title: 'WhatsApp Chat Reply Sent',
              message: `Sent WhatsApp reply: "${content.slice(0, 100)}"`,
              actor: 'Staff',
              created_at: serverTimestamp()
            });
          }
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
    <div className="w-full h-full flex flex-1 min-h-0 bg-white rounded-2xl border border-shadow-darker/20 shadow-lg overflow-hidden relative select-text">
      {/* ── COLUMN 1: CONVERSATIONS LIST SIDEBAR ─────────────────────────────── */}
      <div
        className={`${
          mobileView === 'chat' ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 lg:w-[320px] shrink-0 bg-white border-r border-slate-200/80 flex-col h-full min-h-0 z-10 transition-all`}
      >
        {/* Sidebar Header & Search */}
        <div className="p-3.5 border-b border-slate-200/80 bg-slate-50/70 space-y-2.5 shrink-0">
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

            <button
              onClick={() => setShowSimulator(true)}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all"
              title="Simulate inbound WhatsApp message"
            >
              <Bot size={13} className="text-emerald-600" />
              <span>Simulator</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, message..."
              className="w-full bg-white rounded-xl border border-slate-200 py-2 pl-9 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
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
                    : 'text-slate-600 hover:bg-slate-200/60 bg-white border border-slate-200/70'
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
                      : 'hover:bg-slate-50/90 border-transparent'
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
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60">
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
            <div className="bg-white border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between shadow-xs shrink-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                {/* Back Button for mobile view */}
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
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
                      <span className="hidden sm:inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
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
                <button
                  onClick={() => setShowDetailsDrawer(!showDetailsDrawer)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all ${
                    showDetailsDrawer
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                  title="Toggle CRM Context Panel"
                >
                  <Info size={14} />
                  <span className="hidden sm:inline">CRM Context</span>
                </button>

                {selectedConv.leadId && (
                  <button
                    onClick={() => navigate(`/leads/${selectedConv.leadId}`)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-primary border border-slate-200 flex items-center gap-1 transition-all"
                    title="Open Lead file in CRM"
                  >
                    <ExternalLink size={13} />
                    <span className="hidden md:inline">Open Lead</span>
                  </button>
                )}
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
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-slate-200/80 flex items-center justify-center text-slate-400">
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
                          <span className="bg-white/80 backdrop-blur-xs border border-slate-200/80 text-slate-500 text-[10px] font-bold px-3 py-0.5 rounded-full shadow-2xs">
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
                              : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap font-sans break-words">{m.content}</p>

                          <div
                            className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                              isOutbound ? 'text-emerald-200' : 'text-slate-400'
                            }`}
                          >
                            <span>{formatTime(m.created_at)}</span>
                            {isOutbound && <CheckCheck size={13} className="text-emerald-300" />}
                          </div>
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
                <p className="text-xs text-amber-950 font-normal leading-relaxed italic bg-white/70 rounded-lg p-2.5 border border-amber-200/50">
                  "{selectedConv.ai_suggested_reply}"
                </p>
              </div>
            )}

            {/* Quick Templates Floating Popover */}
            {showTemplates && (
              <div className="absolute bottom-20 left-4 z-40 bg-white rounded-2xl border border-slate-200 shadow-2xl p-3.5 w-80 max-h-72 overflow-y-auto space-y-2 animate-fade-in custom-sidebar-scrollbar">
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
                      className="w-full text-left p-2.5 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200 text-xs group"
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
            <div className="bg-white border-t border-slate-200/80 p-3 shrink-0 relative">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTemplates(!showTemplates)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                      showTemplates
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 border-slate-200/60'
                    }`}
                  >
                    <Zap size={13} className="text-amber-500" /> Quick Templates
                  </button>

                  {leadDetails?.id && (
                    <button
                      type="button"
                      onClick={() => navigate(`/quotations?leadId=${leadDetails.id}`)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 border border-slate-200/60 flex items-center gap-1.5 transition-all"
                    >
                      <FileText size={13} className="text-sky-500" /> Create Quotation
                    </button>
                  )}
                </div>

                <span className="text-[11px] text-slate-400 hidden sm:inline font-medium">
                  Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[10px]">Enter</kbd> to send
                </span>
              </div>

              <div className="flex items-end gap-2">
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
                  className="flex-1 bg-slate-50 rounded-xl border border-slate-200 py-2.5 px-3.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none max-h-28 min-h-[44px] leading-relaxed transition-all"
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
            <div className="w-16 h-16 rounded-2xl bg-white shadow-xs border border-slate-200/80 flex items-center justify-center text-emerald-600">
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

          <div className="fixed xl:static right-0 top-0 bottom-0 z-50 xl:z-auto w-80 lg:w-[320px] bg-white border-l border-slate-200/80 p-4 overflow-y-auto space-y-4 shrink-0 shadow-2xl xl:shadow-none flex flex-col h-full animate-fade-in text-xs custom-sidebar-scrollbar">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 shrink-0">
              <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                <Info size={16} className="text-emerald-600" />
                Customer CRM Profile
              </h4>
              <button
                onClick={() => setShowDetailsDrawer(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* Profile Identity Card */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center font-bold text-emerald-800 text-sm shrink-0">
                  {(leadDetails?.name || selectedConv.participantName || 'C').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 truncate">
                    {leadDetails?.name || selectedConv.participantName || 'WhatsApp Contact'}
                  </div>
                  <span className="text-[10px] text-slate-400 block font-medium">
                    {leadDetails?.id ? 'Linked CRM Lead' : 'Unlinked Contact'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1 text-slate-600 border-t border-slate-200/60">
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1.5 font-mono text-slate-700">
                    <Phone size={12} className="text-emerald-600 shrink-0" />
                    +{selectedConv.participantPhone}
                  </span>
                  <a
                    href={`https://wa.me/${selectedConv.participantPhone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-emerald-600 hover:underline font-bold"
                  >
                    Open WA
                  </a>
                </div>

                {leadDetails?.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail size={12} className="text-sky-600 shrink-0" />
                    <a href={`mailto:${leadDetails.email}`} className="text-sky-700 hover:underline truncate">
                      {leadDetails.email}
                    </a>
                  </div>
                )}

                {leadDetails?.organization && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Building size={12} className="text-amber-600 shrink-0" />
                    <span className="truncate">{leadDetails.organization}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive Pipeline Stage Selector */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  Pipeline Stage
                </span>
                {updatingStage && <Loader2 size={12} className="animate-spin text-emerald-600" />}
              </div>

              {leadDetails?.id ? (
                <div>
                  <select
                    value={leadDetails?.status || selectedConv.pipelineStage || 'new'}
                    onChange={(e) => handleUpdateLeadStage(e.target.value)}
                    disabled={updatingStage}
                    className="w-full bg-white rounded-lg border border-slate-200 p-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {availableStages.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Changing stage automatically triggers enrolled WhatsApp automations.
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic">
                  Stage: <strong className="text-slate-800 capitalize">{selectedConv.pipelineStage || 'Inquiry'}</strong>
                </div>
              )}
            </div>

            {/* Order Specifications */}
            <div className="space-y-2.5">
              <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                Order Specifications
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <span className="text-[10px] text-slate-400 block">Quantity</span>
                  <span className="font-bold text-slate-800">
                    {leadDetails?.required_quantity ? `${leadDetails.required_quantity} pcs` : 'Not specified'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <span className="text-[10px] text-slate-400 block">Trophy Specs</span>
                  <span className="font-bold text-slate-800 truncate block">
                    {leadDetails?.trophy_size || 'Custom'}
                  </span>
                </div>
              </div>

              {leadDetails?.value && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/80">
                  <span className="text-[10px] text-emerald-800 block font-bold uppercase">Estimated Order Value</span>
                  <span className="font-extrabold text-emerald-900 text-base">
                    ₹{Number(leadDetails.value).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {leadDetails?.event_date && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center gap-2">
                  <Calendar size={14} className="text-slate-500 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 block">Event Date</span>
                    <span className="font-bold text-slate-800">{leadDetails.event_date}</span>
                  </div>
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
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                CRM Actions
              </span>
              {selectedConv.leadId ? (
                <>
                  <button
                    onClick={() => navigate(`/leads/${selectedConv.leadId}`)}
                    className="w-full neo-btn text-xs py-2 flex items-center justify-center gap-1.5 font-semibold"
                  >
                    <User size={13} /> Open Full Lead File
                  </button>
                  <button
                    onClick={() => navigate('/pipeline')}
                    className="w-full neo-btn text-xs py-2 flex items-center justify-center gap-1.5 font-semibold"
                  >
                    <Package size={13} /> View on Pipeline Board
                  </button>
                  <button
                    onClick={() => navigate(`/quotations?leadId=${selectedConv.leadId}`)}
                    className="w-full neo-btn-primary text-xs py-2 flex items-center justify-center gap-1.5 font-semibold"
                  >
                    <FileText size={13} /> Create Quotation
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  No linked CRM lead yet. A lead is created automatically when the customer inquires.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── TEST SIMULATOR MODAL ───────────────────────────────────────────── */}
      {showSimulator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="neo-card w-full max-w-lg bg-white flex flex-col p-5 space-y-4 shadow-2xl rounded-2xl">
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
    </div>
  );
}

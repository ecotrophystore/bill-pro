import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Send,
  Loader2,
  MessageCircle,
  AlertCircle,
  Check,
  CheckCheck,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Mic,
  Play,
  FileIcon,
  Tag,
  Settings,
  BookOpen,
  Calendar,
  Clock,
  ChevronDown,
  Copy,
  Sparkles,
  Bot,
  User,
  Building,
  Phone,
  Package,
  ExternalLink,
  Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, functions, storage } from '../../lib/firebase';
import { useChatLabels } from '../../hooks/useChatLabels';
import { ManageLabelsModal } from '../WhatsAppAutomation/ManageLabelsModal';
import { ContextualSalesGuide } from '../CRM/ContextualSalesGuide';
import { type Lead, STANDARD_CRM_STAGES } from '../../types';
import {
  calculateDeadlineInfo,
  generateClientSpecificReplies,
  type SmartSuggestedReply
} from '../../utils/whatsappSuggestedReplies';

interface PipelineQuickChatModalProps {
  lead: Lead;
  onClose: () => void;
}

export function PipelineQuickChatModal({ lead, onClose }: PipelineQuickChatModalProps) {
  const [currentLead, setCurrentLead] = useState<Lead>(lead);
  const [conversation, setConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showLabelsMenu, setShowLabelsMenu] = useState(false);
  const [showManageLabels, setShowManageLabels] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'lead_details'>('chat');
  const [replyFilter, setReplyFilter] = useState<'all' | 'recommended' | 'quote' | 'deadline' | 'payment' | 'knowledge'>('all');
  const [customDeadlineInput, setCustomDeadlineInput] = useState('');

  const [updatingStage, setUpdatingStage] = useState(false);
  const [updatingDeadline, setUpdatingDeadline] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingLead, setIsDeletingLead] = useState(false);

  const handleDeleteLeadFromChat = async () => {
    if (!currentLead.id) return;
    setIsDeletingLead(true);
    try {
      await deleteDoc(doc(db, 'leads', currentLead.id));
      toast.success(`Lead "${currentLead.name}" deleted successfully.`);
      onClose();
    } catch (err: any) {
      console.error('Failed to delete lead from quick chat', err);
      toast.error('Failed to delete lead: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeletingLead(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { labels: dynamicChatLabels } = useChatLabels();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Real-time synchronization of Lead document from Firestore
  useEffect(() => {
    if (!db || !lead.id) return;
    const unsub = onSnapshot(doc(db, 'leads', lead.id), (snap) => {
      if (snap.exists()) {
        setCurrentLead({ id: snap.id, ...snap.data() } as Lead);
      }
    });
    return () => unsub();
  }, [lead.id]);

  // Fetch Conversation
  useEffect(() => {
    if (!db) return;

    const fetchConv = async () => {
      try {
        let convDoc = null;

        // 1. Try by leadId
        const q1 = query(collection(db, 'conversations'), where('leadId', '==', lead.id));
        const snap1 = await getDocs(q1);
        if (!snap1.empty) {
          convDoc = snap1.docs[0];
        }

        // 2. Fallback: Try by phone number
        if (!convDoc && lead.phone) {
          const rawPhone = lead.phone.replace(/\D/g, '');
          const phoneWith91 = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;

          const q2 = query(collection(db, 'conversations'), where('participantPhone', '==', phoneWith91));
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            convDoc = snap2.docs[0];
          }
        }

        if (convDoc) {
          setConversation({ id: convDoc.id, ...convDoc.data() });
        }
      } catch (err) {
        console.error('Error fetching conversation:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConv();
  }, [lead.id]);

  // Subscribe to Messages
  useEffect(() => {
    if (!db || !conversation?.id) return;

    let convMsgs: any[] = [];
    let phoneMsgs: any[] = [];

    const mergeAndSet = () => {
      const map = new Map<string, any>();
      [...convMsgs, ...phoneMsgs].forEach((m) => {
        if (!m) return;
        const key = m.metaMessageId || m.id;
        map.set(key, m);
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
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    // 1. Listen by conversationId
    const q1 = query(collection(db, 'messages'), where('conversationId', '==', conversation.id));
    const unsub1 = onSnapshot(q1, (snap) => {
      convMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      mergeAndSet();
    });

    // 2. Listen by senderPhone
    const rawPhone = String(lead.phone || '').replace(/\D/g, '');
    let searchPhones: string[] = [];
    if (rawPhone.length >= 10) {
      const tenDigit = rawPhone.slice(-10);
      searchPhones = [rawPhone, tenDigit, `91${tenDigit}`, `+91${tenDigit}`];
    } else if (rawPhone.length > 0) {
      searchPhones = [rawPhone];
    }

    let unsub2 = () => {};
    if (searchPhones.length > 0) {
      const q2 = query(collection(db, 'messages'), where('senderPhone', 'in', searchPhones.slice(0, 10)));
      unsub2 = onSnapshot(q2, (snap) => {
        phoneMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        mergeAndSet();
      });
    }

    return () => {
      unsub1();
      unsub2();
    };
  }, [conversation?.id, lead.phone]);

  const sendMessagePayload = async (messagePayload: any, textForDb: string, mediaUrl?: string) => {
    try {
      const cleanPhone = String(lead.phone || '').replace(/\D/g, '');
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
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
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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

      // Save to Firestore messages & update conversation doc
      if (db && conversation?.id) {
        await addDoc(collection(db, 'messages'), {
          conversationId: conversation.id,
          leadId: lead.id,
          senderPhone: finalPhone,
          direction: 'outbound',
          type: messagePayload.type,
          content: textForDb,
          mediaUrl: mediaUrl || null,
          metaMessageId: wamid,
          platform: 'whatsapp',
          triggeredBy: 'pipeline_chat',
          created_at: serverTimestamp()
        });

        await updateDoc(doc(db, 'conversations', conversation.id), {
          lastMessage: `[You]: ${textForDb}`,
          lastMessageAt: serverTimestamp(),
          lastDirection: 'outbound',
          updated_at: serverTimestamp()
        });

        await addDoc(collection(db, 'activities'), {
          lead_id: lead.id,
          type: 'whatsapp_reply_sent',
          title: 'WhatsApp Quick Chat Sent',
          message: `Sent WhatsApp reply: "${textForDb.slice(0, 100)}"`,
          actor: 'Staff',
          created_at: serverTimestamp()
        });
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      toast.error(`Error sending message: ${err.message}`);
      throw err;
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !conversation?.id) return;
    setIsSending(true);
    try {
      await sendMessagePayload({ type: 'text', text: { body: inputText.trim() } }, inputText.trim());
      setInputText('');
    } catch {
      // Handled in sendMessagePayload
    } finally {
      setIsSending(false);
    }
  };

  const handleSendSuggested = async (text: string) => {
    if (!text.trim()) return;
    if (!conversation?.id) {
      // Fallback: open WhatsApp Web
      const cleanPhone = String(lead.phone || '').replace(/\D/g, '');
      const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      return;
    }

    setIsSending(true);
    try {
      await sendMessagePayload({ type: 'text', text: { body: text.trim() } }, text.trim());
      toast.success('Sent suggested reply via WhatsApp!');
    } catch (err: any) {
      toast.error('Failed to send: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleInsertSuggested = (text: string) => {
    setInputText(text);
    setMobileTab('chat');
    toast.success('Inserted into chat input!');
  };

  const handleSendMedia = async (file: File, type: 'image' | 'document' | 'audio') => {
    if (!conversation?.id || !storage) return;
    setIsSending(true);
    setShowAttachmentMenu(false);

    try {
      const fileRef = ref(storage, `chat_media/${lead.id}/${Date.now()}_${file.name}`);
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
      console.error('Failed to send media:', err);
      toast.error(`Error uploading media: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleLabel = async (labelId: string) => {
    if (!conversation?.id || !db) return;

    const currentLabels = conversation.labels || [];
    const newLabels = currentLabels.includes(labelId)
      ? currentLabels.filter((id: string) => id !== labelId)
      : [...currentLabels, labelId];

    try {
      await updateDoc(doc(db, 'conversations', conversation.id), {
        labels: newLabels,
        updated_at: serverTimestamp()
      });
    } catch (err) {
      console.error('Failed to update labels:', err);
    }
  };

  // 1. Pipeline Stage Change Directly Beside Chat
  const handleUpdateStage = async (newStageId: string) => {
    if (!db || !currentLead.id || updatingStage) return;
    setUpdatingStage(true);
    try {
      await updateDoc(doc(db, 'leads', currentLead.id), {
        status: newStageId,
        updated_at: serverTimestamp()
      });
      if (conversation?.id) {
        await updateDoc(doc(db, 'conversations', conversation.id), {
          pipelineStage: newStageId,
          updated_at: serverTimestamp()
        }).catch(() => null);
      }
      setCurrentLead((prev) => ({ ...prev, status: newStageId }));
      const stageLabel = STANDARD_CRM_STAGES.find((s) => s.id === newStageId)?.label || newStageId;
      toast.success(`Pipeline stage moved to "${stageLabel}"!`);
    } catch (err: any) {
      console.error('Failed to update stage:', err);
      toast.error('Failed to update pipeline stage.');
    } finally {
      setUpdatingStage(false);
    }
  };

  // 2. Project Deadline Change Directly Beside Chat
  const handleUpdateDeadline = async (newDeliveryDate: string) => {
    if (!db || !currentLead.id || updatingDeadline) return;
    setUpdatingDeadline(true);
    try {
      await updateDoc(doc(db, 'leads', currentLead.id), {
        delivery_date: newDeliveryDate,
        updated_at: serverTimestamp()
      });
      setCurrentLead((prev) => ({ ...prev, delivery_date: newDeliveryDate }));
      toast.success(`Project deadline updated: ${newDeliveryDate}!`);
    } catch (err: any) {
      console.error('Failed to update deadline:', err);
      toast.error('Failed to update project deadline.');
    } finally {
      setUpdatingDeadline(false);
    }
  };

  const handleQuickAddDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dateStr = d.toISOString().split('T')[0];
    setCustomDeadlineInput(dateStr);
    handleUpdateDeadline(dateStr);
  };

  // Deadline info calculation
  const deadlineInfo = useMemo(() => {
    return calculateDeadlineInfo(currentLead.delivery_date, currentLead.event_date);
  }, [currentLead.delivery_date, currentLead.event_date]);

  // 3. Client-Specific Suggested Replies grounded in EcoTrophy knowledge
  const smartReplies = useMemo(() => {
    return generateClientSpecificReplies({
      clientName: currentLead.name,
      companyName: currentLead.company || currentLead.organization,
      requirement: currentLead.trophy_size,
      quantity: currentLead.required_quantity,
      deliveryDate: currentLead.delivery_date,
      eventDate: currentLead.event_date,
      currentStage: currentLead.status
    });
  }, [
    currentLead.name,
    currentLead.company,
    currentLead.organization,
    currentLead.trophy_size,
    currentLead.required_quantity,
    currentLead.delivery_date,
    currentLead.event_date,
    currentLead.status
  ]);

  const filteredReplies = useMemo(() => {
    if (replyFilter === 'recommended') {
      return smartReplies.filter((r) => r.isStageRecommended);
    }
    if (replyFilter === 'quote') {
      return smartReplies.filter((r) => r.category === 'quote' || r.category === 'requirement');
    }
    if (replyFilter === 'deadline') {
      return smartReplies.filter((r) => r.category === 'deadline');
    }
    if (replyFilter === 'payment') {
      return smartReplies.filter((r) => r.category === 'payment');
    }
    if (replyFilter === 'knowledge') {
      return smartReplies.filter((r) => r.category === 'knowledge');
    }
    return smartReplies;
  }, [smartReplies, replyFilter]);

  const currentStageLabel =
    STANDARD_CRM_STAGES.find((s) => s.id === currentLead.status)?.label ||
    (currentLead.status || 'New').replace(/_/g, ' ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-5xl bg-[#111b21] border border-slate-700/60 flex flex-col shadow-2xl sm:rounded-2xl overflow-hidden h-[100dvh] sm:h-[86vh]">
        {/* ── HEADER ── */}
        <div className="bg-[#202c33] text-white p-3.5 sm:p-4 flex items-center justify-between shrink-0 border-b border-slate-700/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-lg font-extrabold shrink-0">
              {currentLead.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base leading-tight text-white truncate">
                  {currentLead.name}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shrink-0">
                  {currentStageLabel}
                </span>
              </div>
              <p className="text-xs text-white/70 font-medium truncate mt-0.5">
                {currentLead.organization || currentLead.company || 'Direct Client'} • {currentLead.phone || 'No phone'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mobile Tab Toggle: Chat vs CRM Info */}
            <div className="md:hidden flex items-center bg-[#111b21] rounded-lg p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={() => setMobileTab('chat')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  mobileTab === 'chat' ? 'bg-[#008069] text-white' : 'text-slate-400'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('lead_details')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  mobileTab === 'lead_details' ? 'bg-[#008069] text-white' : 'text-slate-400'
                }`}
              >
                CRM & Replies
              </button>
            </div>

            {/* Playbook Guide Toggle */}
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                showGuide
                  ? 'bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-400'
                  : 'hover:bg-slate-700/50 text-white/70 hover:text-white'
              }`}
              title="Toggle EcoTrophy Sales Guide"
            >
              <BookOpen size={15} />
              <span className="hidden sm:inline">Playbook</span>
            </button>

            {/* Labels Menu */}
            {conversation && (
              <div className="relative">
                <button
                  onClick={() => setShowLabelsMenu(!showLabelsMenu)}
                  className={`p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                    showLabelsMenu || (conversation.labels && conversation.labels.length > 0)
                      ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
                      : 'hover:bg-slate-700/50 text-white/70 hover:text-white'
                  }`}
                  title="Toggle Chat Labels"
                >
                  <Tag size={15} />
                  <span className="hidden sm:inline">Labels</span>
                </button>

                {showLabelsMenu && (
                  <div className="absolute top-full right-0 mt-2 bg-[#2a3942] rounded-xl shadow-xl border border-slate-700 py-2 flex flex-col z-50 min-w-[200px]">
                    <div className="px-3 pb-2 mb-1 border-b border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Apply Labels
                    </div>
                    <div className="max-h-60 overflow-y-auto py-1 custom-sidebar-scrollbar">
                      {dynamicChatLabels.map((label) => {
                        const isActive = conversation.labels?.includes(label.id);
                        return (
                          <button
                            key={label.id}
                            onClick={() => handleToggleLabel(label.id)}
                            className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-700/40 transition-colors text-left w-full"
                          >
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${label.colorClass}`}>
                              {label.text}
                            </span>
                            {isActive && <Check size={14} className="text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t border-slate-700 mt-1 pt-1">
                      <button
                        onClick={() => {
                          setShowLabelsMenu(false);
                          setShowManageLabels(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 transition-colors w-full text-left"
                      >
                        <Settings size={14} /> Manage Labels
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {lead.phone && (
              <button
                type="button"
                onClick={() => {
                  const rawP = String(lead.phone || '').replace(/\D/g, '');
                  const finalP = rawP.length === 10 ? `91${rawP}` : rawP;
                  window.open(`https://wa.me/${finalP}`, '_blank', 'noopener,noreferrer');
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1 transition-colors"
                title="Open directly in WhatsApp Web"
              >
                <span>WhatsApp ↗</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
              title="Delete this lead from pipeline"
            >
              <Trash2 size={16} />
            </button>

            <button onClick={onClose} className="p-1.5 hover:bg-slate-700/50 rounded-full transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Collapsible Playbook Drawer */}
        {showGuide && (
          <div className="p-3 bg-slate-900 border-b border-slate-700 max-h-72 overflow-y-auto custom-sidebar-scrollbar animate-in slide-in-from-top-2 duration-150">
            <ContextualSalesGuide
              lead={currentLead}
              messages={messages}
              onApplyReply={(text) => {
                setInputText(text);
                setShowGuide(false);
                setMobileTab('chat');
              }}
              compact
            />
          </div>
        )}

        {/* Delete Lead Inside Quick Chat Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1f2c34] border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Delete Lead?</h3>
                  <p className="text-xs text-slate-400">Permanently delete {currentLead.name}?</p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                This will remove the lead, its pipeline stage, and associated CRM records. This cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeletingLead}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingLead}
                  onClick={handleDeleteLeadFromChat}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white inline-flex items-center gap-1.5 transition-colors"
                >
                  {isDeletingLead ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={13} />
                      <span>Delete Lead</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TWO-COLUMN SPLIT: CHAT (LEFT) & CRM COPILOT PANEL (RIGHT) ── */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* ──── LEFT COLUMN: CHAT INTERFACE ──── */}
          <div
            className={`flex-1 flex flex-col min-w-0 bg-[#0b141a] relative ${
              mobileTab === 'chat' ? 'flex' : 'hidden md:flex'
            }`}
          >
            {/* Messages area */}
            <div
              className="flex-1 overflow-y-auto p-4 custom-sidebar-scrollbar relative"
              style={{
                backgroundImage:
                  'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
                backgroundRepeat: 'repeat',
                backgroundSize: '300px',
                opacity: 0.95
              }}
            >
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 size={30} className="animate-spin text-[#008069]" />
                </div>
              ) : !conversation ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-slate-900/80 rounded-xl mx-auto max-w-sm mt-10 backdrop-blur-sm border border-slate-700/60">
                  <AlertCircle size={40} className="text-amber-500 mb-3" />
                  <h4 className="font-bold text-white text-base mb-1.5">No Linked WhatsApp Chat</h4>
                  <p className="text-slate-300 text-xs mb-3">
                    This lead does not have an active chat session linked yet.
                  </p>
                  <p className="text-[11px] text-slate-400 mb-4">
                    You can start a chat directly by typing below, or use the "WhatsApp ↗" button above.
                  </p>
                  {lead.phone && (
                    <button
                      type="button"
                      onClick={() => {
                        const rawP = String(lead.phone || '').replace(/\D/g, '');
                        const finalP = rawP.length === 10 ? `91${rawP}` : rawP;
                        window.open(`https://wa.me/${finalP}`, '_blank', 'noopener,noreferrer');
                      }}
                      className="px-4 py-2 bg-[#008069] hover:bg-[#006e5a] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <span>Open in WhatsApp Web ↗</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col space-y-3">
                  {messages.map((msg) => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                      <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] rounded-lg p-2.5 shadow-sm text-sm ${
                            isOutbound ? 'bg-[#005c4b] text-gray-100 rounded-tr-none' : 'bg-[#202c33] text-gray-100 rounded-tl-none'
                          }`}
                        >
                          {msg.type === 'image' && msg.mediaUrl ? (
                            <div className="mb-2 rounded-md overflow-hidden bg-black/20">
                              <img src={msg.mediaUrl} alt="Attachment" className="max-w-full max-h-64 object-contain" />
                            </div>
                          ) : msg.type === 'audio' && msg.mediaUrl ? (
                            <div className="mb-2">
                              <audio controls src={msg.mediaUrl} className="max-w-[200px] h-8" />
                            </div>
                          ) : msg.type === 'document' && msg.mediaUrl ? (
                            <div className="mb-2 p-3 bg-black/10 rounded-lg flex items-center gap-3">
                              <FileIcon size={24} className={isOutbound ? 'text-gray-100' : 'text-[#008069]'} />
                              <a
                                href={msg.mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline font-medium hover:text-white truncate max-w-[150px]"
                              >
                                {msg.content || 'Document'}
                              </a>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap break-words">
                              {msg.content || msg.text || msg.body || msg.message}
                            </div>
                          )}

                          <div className="text-[10px] text-gray-400 text-right mt-1.5 font-medium flex items-center justify-end gap-1">
                            {(() => {
                              const ts = msg.created_at || msg.createdAt || msg.timestamp;
                              if (!ts) return '';
                              const date = ts.toDate
                                ? ts.toDate()
                                : ts.toMillis
                                ? new Date(ts.toMillis())
                                : ts.seconds
                                ? new Date(ts.seconds * 1000)
                                : new Date(ts);
                              if (isNaN(date.getTime())) return '';
                              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            })()}
                            {isOutbound && (
                              <span className="inline-flex items-center ml-0.5">
                                {msg.status === 'read' ? (
                                  <span title="Read">
                                    <CheckCheck size={14} className="text-[#53bdeb]" />
                                  </span>
                                ) : msg.status === 'delivered' ? (
                                  <span title="Delivered">
                                    <CheckCheck size={14} className="text-gray-400" />
                                  </span>
                                ) : msg.status === 'failed' ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-rose-300 font-bold"
                                    title={msg.errorMessage || 'Failed to deliver'}
                                  >
                                    <AlertCircle size={13} className="text-rose-400" />
                                    <span className="text-[9px] text-rose-300">Undelivered</span>
                                  </span>
                                ) : (
                                  <span title="Sent to Meta">
                                    <Check size={14} className="text-gray-400" />
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input composer */}
            <div className="bg-[#202c33] p-3 flex gap-2 shrink-0 items-center relative border-t border-slate-700/60">
              <div className="relative">
                <button
                  onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                  className="w-10 h-10 rounded-full hover:bg-slate-700/50 text-gray-300 flex items-center justify-center transition-colors shrink-0"
                  title="Attach"
                >
                  <Paperclip size={18} />
                </button>

                {showAttachmentMenu && (
                  <div className="absolute bottom-12 left-0 bg-[#2a3942] rounded-xl shadow-xl py-2 flex flex-col gap-1 z-50 min-w-[160px] border border-slate-700">
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-700/50 text-gray-200 transition-colors text-left w-full text-xs font-semibold"
                    >
                      <ImageIcon size={16} className="text-blue-400" />
                      <span>Image</span>
                    </button>
                    <button
                      onClick={() => docInputRef.current?.click()}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-700/50 text-gray-200 transition-colors text-left w-full text-xs font-semibold"
                    >
                      <FileText size={16} className="text-purple-400" />
                      <span>Document</span>
                    </button>
                    <button
                      onClick={() => audioInputRef.current?.click()}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-700/50 text-gray-200 transition-colors text-left w-full text-xs font-semibold"
                    >
                      <Mic size={16} className="text-orange-400" />
                      <span>Voice Note</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Hidden File Inputs */}
              <input
                type="file"
                ref={imageInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleSendMedia(e.target.files[0], 'image');
                }}
              />
              <input
                type="file"
                ref={docInputRef}
                className="hidden"
                accept="application/pdf,.doc,.docx"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleSendMedia(e.target.files[0], 'document');
                }}
              />
              <input
                type="file"
                ref={audioInputRef}
                className="hidden"
                accept="audio/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleSendMedia(e.target.files[0], 'audio');
                }}
              />

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message or insert suggested reply from the side panel..."
                className="flex-1 rounded-xl border-none outline-none px-4 py-2 text-sm resize-none bg-[#2a3942] text-gray-100 placeholder:text-gray-400 max-h-32"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isSending}
                className="w-10 h-10 rounded-full bg-[#008069] hover:bg-[#006e5a] text-white flex items-center justify-center transition-colors disabled:opacity-50 shrink-0"
              >
                {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
              </button>
            </div>
          </div>

          {/* ──── RIGHT COLUMN: CRM STAGE, DEADLINE & SUGGESTED REPLIES ──── */}
          <div
            className={`w-full md:w-[360px] lg:w-[390px] border-t md:border-t-0 md:border-l border-slate-700/80 bg-[#162026] flex flex-col overflow-y-auto custom-sidebar-scrollbar p-3.5 space-y-3.5 shrink-0 ${
              mobileTab === 'lead_details' ? 'flex' : 'hidden md:flex'
            }`}
          >
            {/* ── 1. PIPELINE STAGE SELECTOR (Directly Beside Chat) ── */}
            <div className="bg-[#202c33] p-3 rounded-xl border border-slate-700/70 space-y-2 border-l-4 border-l-emerald-500">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag size={13} className="text-emerald-400" /> Pipeline Stage
                </span>
                {updatingStage ? (
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" /> Saving...
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    {currentStageLabel}
                  </span>
                )}
              </div>

              <div className="relative">
                <select
                  value={currentLead.status || 'new_enquiry'}
                  disabled={updatingStage}
                  onChange={(e) => handleUpdateStage(e.target.value)}
                  className="w-full text-xs font-bold text-white bg-[#111b21] border border-slate-700 rounded-lg py-2 px-3 pr-8 outline-none focus:border-emerald-500 cursor-pointer appearance-none disabled:opacity-50"
                >
                  {STANDARD_CRM_STAGES.map((st) => (
                    <option key={st.id} value={st.id} className="bg-[#111b21] text-white">
                      {st.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                  <ChevronDown size={14} />
                </div>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Change stage here anytime beside chat to move card on the Kanban Board.
              </span>
            </div>

            {/* ── 2. PROJECT DEADLINE / DELIVERY DATE (Directly Beside Chat) ── */}
            <div className="bg-[#202c33] p-3 rounded-xl border border-slate-700/70 space-y-2.5 border-l-4 border-l-amber-500">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={13} className="text-amber-400" /> Project Deadline
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${deadlineInfo.badgeClass}`}>
                  {deadlineInfo.label}
                </span>
              </div>

              {/* Inline Date Picker */}
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={currentLead.delivery_date || customDeadlineInput}
                    disabled={updatingDeadline}
                    onChange={(e) => {
                      setCustomDeadlineInput(e.target.value);
                      if (e.target.value) handleUpdateDeadline(e.target.value);
                    }}
                    className="flex-1 text-xs font-semibold text-white bg-[#111b21] border border-slate-700 rounded-lg py-1.5 px-2.5 outline-none focus:border-amber-500 cursor-pointer disabled:opacity-50"
                  />
                  {updatingDeadline && <Loader2 size={13} className="animate-spin text-amber-400 shrink-0" />}
                </div>

                {/* Quick Add Presets */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 font-medium">Quick Set:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickAddDays(3)}
                    disabled={updatingDeadline}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    +3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAddDays(7)}
                    disabled={updatingDeadline}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    +7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAddDays(14)}
                    disabled={updatingDeadline}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    +14 Days
                  </button>
                </div>
              </div>
            </div>

            {/* ── 3. CLIENT SPECS SUMMARY ── */}
            <div className="bg-[#202c33] p-3 rounded-xl border border-slate-700/70 space-y-2">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                Lead Specifications
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#111b21] p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Quantity</span>
                  <strong className="text-white block mt-0.5">
                    {currentLead.required_quantity ? `${currentLead.required_quantity} pcs` : 'Not specified'}
                  </strong>
                </div>
                <div className="bg-[#111b21] p-2 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Trophy Size/Specs</span>
                  <strong className="text-white block mt-0.5 truncate">
                    {currentLead.trophy_size || 'Custom design'}
                  </strong>
                </div>
                {currentLead.event_date && (
                  <div className="col-span-2 bg-[#111b21] p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Event Date</span>
                    <strong className="text-emerald-400 block mt-0.5">{currentLead.event_date}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* ── 4. CLIENT-SPECIFIC SUGGESTED REPLIES & KNOWLEDGE ── */}
            <div className="bg-[#202c33] p-3 rounded-xl border border-slate-700/70 space-y-3 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Bot size={14} className="text-emerald-400" /> Suggested Replies
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {filteredReplies.length} tailored replies
                </span>
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-sidebar-scrollbar text-[10px]">
                <button
                  type="button"
                  onClick={() => setReplyFilter('all')}
                  className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all ${
                    replyFilter === 'all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setReplyFilter('recommended')}
                  className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                    replyFilter === 'recommended'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/50'
                  }`}
                >
                  ⭐ Stage Focus
                </button>
                <button
                  type="button"
                  onClick={() => setReplyFilter('quote')}
                  className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all ${
                    replyFilter === 'quote'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Quote
                </button>
                <button
                  type="button"
                  onClick={() => setReplyFilter('deadline')}
                  className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all ${
                    replyFilter === 'deadline'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Deadline
                </button>
                <button
                  type="button"
                  onClick={() => setReplyFilter('payment')}
                  className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all ${
                    replyFilter === 'payment'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Advance
                </button>
                <button
                  type="button"
                  onClick={() => setReplyFilter('knowledge')}
                  className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all ${
                    replyFilter === 'knowledge'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Knowledge
                </button>
              </div>

              {/* Reply Cards List */}
              <div className="space-y-2 overflow-y-auto custom-sidebar-scrollbar max-h-72 pr-0.5">
                {filteredReplies.map((r) => (
                  <div
                    key={r.id}
                    className={`p-2.5 rounded-lg bg-[#111b21] space-y-1.5 border transition-all ${
                      r.isStageRecommended ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-200 truncate">{r.title}</span>
                      {r.isStageRecommended && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                          Recommended
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed italic bg-black/20 p-2 rounded">
                      "{r.text}"
                    </p>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleInsertSuggested(r.text)}
                        className="flex-1 text-[10px] font-bold py-1.5 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1 transition-colors"
                        title="Copy into chat box to review before sending"
                      >
                        <Copy size={11} /> Insert
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendSuggested(r.text)}
                        disabled={isSending}
                        className="flex-1 text-[10px] font-bold py-1.5 px-2 rounded bg-[#008069] hover:bg-[#006e5a] text-white flex items-center justify-center gap-1 transition-colors"
                        title="Send immediately via WhatsApp"
                      >
                        <Send size={11} /> Send ⚡
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showManageLabels && (
        <ManageLabelsModal labels={dynamicChatLabels} onClose={() => setShowManageLabels(false)} />
      )}
    </div>
  );
}

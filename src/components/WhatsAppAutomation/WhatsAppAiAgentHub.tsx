import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  Bot,
  CalendarRange,
  CircleDot,
  FileText,
  Lock,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Smile,
  Sparkles,
  UserPlus,
  Users,
  X,
  Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  type SessionInfo,
  type ChatMessage,
  type AiLeadInsight,
  type ConversationSummary,
  type WhatsAppStatusItem,
  fetchAllSessions,
  fetchAllConversations,
  fetchMessagesForContact,
  fetchSessionQr,
  createNewSession,
  rescanSessionForHistory,
  requestPairingCodeForSession,
  sendWhatsAppMessage,
  markConversationRead,
  fetchProfilePicUrl,
  fetchContactInfo,
  fetchWhatsAppStatuses,
  analyzeTextWithAi,
  importLeadsFromHistory,
  subscribeToWhatsAppEvents
} from '../../services/whatsappMultiSessionService';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { type Lead, STANDARD_CRM_STAGES } from '../../types';
import {
  getAutoCrmSyncEnabled,
  previewCrmPipelineAndStage,
  setAutoCrmSyncEnabled,
  subscribeAutoCrmSyncChange,
  syncWhatsAppLeadToCrm,
  findLeadForWhatsAppContact
} from '../../services/whatsappCrmSyncService';
import { hasCommercialEnquirySignal } from '../../utils/whatsappEnquiryQualifier';
import { MultiAccountManager } from './MultiAccountManager';
import {
  WhatsAppDateImportModal,
  type WhatsAppImportSummary
} from './WhatsAppDateImportModal';
import {
  AiCopilotDrawer,
  ContactAvatar,
  ContactProfileDrawer,
  InlineQrSetupView,
  MessageBubble,
  MessagePreviewIcon,
  StatusFeedView,
  formatConversationTime,
  formatPresenceSubtitle,
  getDateDividerLabel
} from './WhatsAppWebComponents';

const QUICK_EMOJIS = ['👋', '👍', '🙏', '✅', '🏆', '🎉', '📄', '📦', '✨', '📞', '💼', '😊'];

export function WhatsAppAiAgentHub() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('all'); // 'all' or sessionId
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedThread, setSelectedThread] = useState<ConversationSummary | null>(null);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [activeInsight, setActiveInsight] = useState<AiLeadInsight | null>(null);
  const [avatarCache, setAvatarCache] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<WhatsAppStatusItem[]>([]);
  const [railMode, setRailMode] = useState<'chats' | 'status'>('chats');
  const [presenceCache, setPresenceCache] = useState<
    Record<string, { presence?: string | null; lastSeen?: number | null }>
  >({});
  const [contactAboutCache, setContactAboutCache] = useState<Record<string, string | null>>({});

  // Search, Filters & Composer state
  const [chatSearch, setChatSearch] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups' | 'leads'>('all');
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<{
    fileDataUrl: string;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Panels, New Chat & Session actions
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [showOwnProfileCard, setShowOwnProfileCard] = useState(false);
  const [showManageAccounts, setShowManageAccounts] = useState(false);
  const [forceQrView, setForceQrView] = useState(false);
  const [showNewChatBox, setShowNewChatBox] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newAccountLabel, setNewAccountLabel] = useState('');
  const [creatingTab, setCreatingTab] = useState(false);
  const [rescanningSessionId, setRescanningSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoPilotEnabled, setAutoPilotEnabled] = useState<boolean>(() => getAutoCrmSyncEnabled());
  const [crmPreview, setCrmPreview] = useState<{ pipelineName: string; stageLabel: string } | null>(null);
  const [saveLeadSuccess, setSaveLeadSuccess] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importingLeads, setImportingLeads] = useState(false);
  const [importProgressText, setImportProgressText] = useState('');
  const [importSummary, setImportSummary] = useState<WhatsAppImportSummary | null>(null);

  // Real-time matched CRM lead doc for active thread
  const [matchedLead, setMatchedLead] = useState<{ id: string; data: Lead } | null>(null);
  const [updatingLeadStage, setUpdatingLeadStage] = useState(false);
  const [updatingLeadDeadline, setUpdatingLeadDeadline] = useState(false);
  const [dismissedAddLeadKeys, setDismissedAddLeadKeys] = useState<Set<string>>(new Set());

  const hasThreadRequirement = useMemo(() => {
    const combined = `${selectedThread?.lastMessage || ''}\n${activeInsight?.requirement || ''}`;
    return hasCommercialEnquirySignal(combined, {
      quantity: activeInsight?.quantity,
      budget: activeInsight?.budget
    });
  }, [selectedThread?.lastMessage, activeInsight?.requirement, activeInsight?.quantity, activeInsight?.budget]);

  useEffect(() => {
    return subscribeAutoCrmSyncChange((enabled) => setAutoPilotEnabled(enabled));
  }, []);

  // Look up & real-time sync matching CRM lead for the selected contact
  useEffect(() => {
    if (!selectedThread) {
      setMatchedLead(null);
      return;
    }

    let unsub: (() => void) | null = null;
    let active = true;

    const lookupLead = async () => {
      try {
        const match = await findLeadForWhatsAppContact({
          phone: selectedThread.phone,
          remoteJid: selectedThread.remoteJid,
          name: selectedThread.name
        });
        if (!active) return;
        if (match && db) {
          setMatchedLead(match);
          unsub = onSnapshot(doc(db, 'leads', match.id), (snap) => {
            if (snap.exists() && active) {
              setMatchedLead({ id: snap.id, data: snap.data() as Lead });
            }
          });
        } else {
          setMatchedLead(null);
        }
      } catch (e) {
        console.warn('Could not match lead for thread:', e);
      }
    };

    lookupLead();

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [selectedThread?.id, selectedThread?.phone, selectedThread?.remoteJid]);

  useEffect(() => {
    if (!activeInsight) {
      setCrmPreview(null);
      return;
    }
    let cancelled = false;
    previewCrmPipelineAndStage(activeInsight, selectedThread?.lastMessage || '').then((res) => {
      if (!cancelled) {
        setCrmPreview({ pipelineName: res.pipelineName, stageLabel: res.stageLabel });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeInsight, selectedThread?.id]);

  // Handle stage change directly beside WhatsApp chat
  const handleUpdateLeadStage = async (newStageId: string) => {
    if (!db) return;
    setUpdatingLeadStage(true);
    try {
      const stageName = STANDARD_CRM_STAGES.find((s) => s.id === newStageId)?.label || newStageId;
      if (matchedLead?.id) {
        await updateDoc(doc(db, 'leads', matchedLead.id), {
          status: newStageId,
          updated_at: serverTimestamp()
        });
        toast.success(`Pipeline stage updated to "${stageName}"!`);
      } else if (selectedThread) {
        const fallbackInsight: AiLeadInsight = activeInsight
          ? { ...activeInsight, pipelineStage: newStageId }
          : {
              leadName: selectedThread.name || 'Inquiry',
              company: '',
              phone: selectedThread.phone || '',
              requirement: selectedThread.lastMessage || 'Custom trophy inquiry',
              quantity: '1',
              budget: '',
              urgency: 'medium',
              stage: 'qualified',
              pipelineStage: newStageId,
              suggestedAction: 'Customer enquiry',
              suggestedReply: '',
              analyzedAt: Date.now()
            };

        const outcome = await syncWhatsAppLeadToCrm({
          sessionId: selectedThread.sessionId,
          sessionLabel: selectedThread.sessionLabel,
          remoteJid: selectedThread.remoteJid,
          phone: selectedThread.phone,
          name: selectedThread.name,
          messageText: selectedThread.lastMessage,
          insight: fallbackInsight,
          forceCreate: true,
          triggeredBy: 'manual'
        });
        if (outcome.action === 'created' || outcome.action === 'updated') {
          toast.success(`Lead created in stage "${stageName}"!`);
          const refreshed = await findLeadForWhatsAppContact({
            phone: selectedThread.phone,
            remoteJid: selectedThread.remoteJid,
            name: selectedThread.name
          });
          if (refreshed) setMatchedLead(refreshed);
        }
      }
    } catch (err: any) {
      console.error('Failed to update stage:', err);
      toast.error('Failed to update pipeline stage.');
    } finally {
      setUpdatingLeadStage(false);
    }
  };

  // Handle project deadline update directly beside WhatsApp chat
  const handleUpdateLeadDeadline = async (deliveryDate: string, eventDate?: string) => {
    if (!db) return;
    if (!matchedLead?.id) {
      toast.error('Please save contact to CRM first to assign deadline.');
      return;
    }
    setUpdatingLeadDeadline(true);
    try {
      const payload: any = {
        delivery_date: deliveryDate,
        updated_at: serverTimestamp()
      };
      if (eventDate !== undefined) {
        payload.event_date = eventDate;
      }
      await updateDoc(doc(db, 'leads', matchedLead.id), payload);
      toast.success(`Project deadline set to ${deliveryDate}!`);
    } catch (err) {
      console.error('Failed to update deadline:', err);
      toast.error('Failed to update project deadline.');
    } finally {
      setUpdatingLeadDeadline(false);
    }
  };

  const handleInsertSuggestedReply = (replyText: string) => {
    setMessageInput(replyText);
    toast.success('Inserted into chat composer!');
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestedAvatarsRef = useRef<Set<string>>(new Set());
  const retriedAvatarsRef = useRef<Set<string>>(new Set());

  const reloadWorkspace = async () => {
    const [freshSessions, freshConvs, freshStatuses] = await Promise.all([
      fetchAllSessions(),
      fetchAllConversations(),
      fetchWhatsAppStatuses()
    ]);
    setSessions(freshSessions);
    setConversations(freshConvs);
    setStatuses(freshStatuses);
  };

  // Initial load + select first session tab if available
  useEffect(() => {
    reloadWorkspace().then(() => {
      // Wait for sessions check
    });
  }, []);

  useEffect(() => {
    if (sessions.length > 0 && activeTabId === 'all') {
      // Default single-account users straight into their account browser tab if desired, or keep 'all' if multi
      if (sessions.length === 1) {
        setActiveTabId(sessions[0].id);
      }
    }
  }, [sessions.length]);

  // Real-time SSE events
  useEffect(() => {
    const unsubscribe = subscribeToWhatsAppEvents({
      onInit: ({ sessions: initSessions, conversations: initConvs, statuses: initStatuses }) => {
        if (initSessions) setSessions(initSessions);
        if (initConvs) setConversations(initConvs);
        if (initStatuses) setStatuses(initStatuses);
      },
      onSessionUpdate: (updatedSession) => {
        setSessions((prev) => {
          const prevStatus = prev.find((s) => s.id === updatedSession.id)?.status;
          if (updatedSession.status === 'connected' && prevStatus !== 'connected') {
            setForceQrView(false);
            fetchAllConversations().then((convs) => {
              if (convs.length) setConversations(convs);
            });
          }
          const idx = prev.findIndex((s) => s.id === updatedSession.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = updatedSession;
            return copy;
          }
          return [...prev, updatedSession];
        });
      },
      onSessionDeleted: ({ id }) => {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        setConversations((prev) => prev.filter((c) => c.sessionId !== id));
        if (activeTabId === id) setActiveTabId('all');
        if (selectedThread?.sessionId === id) setSelectedThread(null);
      },
      onIncomingMessage: ({ sessionId, remoteJid, conversation, message }) => {
        if (conversation) {
          setConversations((prev) => {
            const idx = prev.findIndex(
              (c) => c.id === conversation.id || (c.sessionId === sessionId && c.remoteJid === remoteJid)
            );
            if (idx >= 0) {
              const next = [...prev];
              const isOpen =
                selectedThread &&
                selectedThread.sessionId === sessionId &&
                (selectedThread.remoteJid === remoteJid || selectedThread.id === conversation.id);
              next[idx] = {
                ...next[idx],
                ...conversation,
                unreadCount: isOpen ? 0 : conversation.unreadCount
              };
              return next.sort((a, b) => b.timestamp - a.timestamp);
            }
            return [conversation, ...prev];
          });
        }

        if (
          selectedThread &&
          selectedThread.sessionId === sessionId &&
          (selectedThread.remoteJid === remoteJid || selectedThread.id === `${sessionId}:${remoteJid}`)
        ) {
          if (!message.fromMe) {
            markConversationRead(sessionId, remoteJid);
          }
          setActiveMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev;
            return [...prev, message];
          });
        }
      },
      onConversationUpdated: (updated) => {
        setConversations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      },
      onHistorySynced: ({ sessionId, conversations: syncedList }) => {
        if (Array.isArray(syncedList)) {
          setConversations(syncedList);
        } else {
          fetchAllConversations().then((convs) => {
            if (convs.length) setConversations(convs);
          });
        }
        if (selectedThread && selectedThread.sessionId === sessionId) {
          fetchMessagesForContact(selectedThread.sessionId, selectedThread.remoteJid).then((res) => {
            if (res.messages.length > 0) setActiveMessages(res.messages);
          });
        }
      },
      onPresenceUpdate: ({ sessionId, remoteJid, presence, lastSeen }) => {
        const key = `${sessionId}:${remoteJid}`;
        setPresenceCache((prev) => ({
          ...prev,
          [key]: { presence, lastSeen: lastSeen ?? prev[key]?.lastSeen }
        }));
      },
      onStatusReceived: (statusItem) => {
        setStatuses((prev) => {
          if (prev.some((st) => st.id === statusItem.id && st.sessionId === statusItem.sessionId)) {
            return prev;
          }
          return [statusItem, ...prev];
        });
      },
      onLeadDetected: ({ sessionId, remoteJid, insight }) => {
        setConversations((prev) =>
          prev.map((c) => (c.remoteJid === remoteJid && c.sessionId === sessionId ? { ...c, insight } : c))
        );
        if (selectedThread && selectedThread.remoteJid === remoteJid && selectedThread.sessionId === sessionId) {
          setActiveInsight(insight);
        }
      }
    });

    return () => unsubscribe();
  }, [selectedThread?.id, activeTabId]);

  const activeSession = useMemo(
    () => (activeTabId === 'all' ? null : sessions.find((s) => s.id === activeTabId) || null),
    [sessions, activeTabId]
  );

  // Poll QR code when an unlinked tab is active
  useEffect(() => {
    if (!activeSession || activeSession.status === 'connected') return;

    const timer = setInterval(async () => {
      const fresh = await fetchSessionQr(activeSession.id);
      if (fresh) {
        setSessions((prev) => prev.map((s) => (s.id === fresh.id ? fresh : s)));
        if (fresh.status === 'connected') {
          setForceQrView(false);
          fetchAllConversations().then((convs) => {
            if (convs.length) setConversations(convs);
          });
        }
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [activeSession?.id, activeSession?.status]);

  // Load messages, contact info/About/presence, and mark read when selecting a thread
  useEffect(() => {
    if (!selectedThread) {
      setActiveMessages([]);
      setActiveInsight(null);
      setIsProfileDrawerOpen(false);
      return;
    }

    if ((selectedThread.unreadCount || 0) > 0) {
      markConversationRead(selectedThread.sessionId, selectedThread.remoteJid);
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedThread.id ? { ...c, unreadCount: 0 } : c))
      );
    }

    setInChatSearchOpen(false);
    setInChatSearchQuery('');

    fetchMessagesForContact(selectedThread.sessionId, selectedThread.remoteJid).then((res) => {
      setActiveMessages(res.messages);
      if (res.insight) {
        setActiveInsight(res.insight);
      } else if (selectedThread.insight) {
        setActiveInsight(selectedThread.insight);
      } else {
        setActiveInsight(null);
      }
    });

    const threadId = selectedThread.id;
    fetchContactInfo(selectedThread.sessionId, selectedThread.remoteJid).then((info) => {
      if (!info) return;
      if (info.avatarUrl) {
        setAvatarCache((prev) => ({ ...prev, [threadId]: info.avatarUrl! }));
      }
      setContactAboutCache((prev) => ({ ...prev, [threadId]: info.about }));
      if (info.presence || info.lastSeen) {
        setPresenceCache((prev) => ({
          ...prev,
          [threadId]: { presence: info.presence, lastSeen: info.lastSeen }
        }));
      }
    });
  }, [selectedThread?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, selectedThread?.id]);

  const tabConversations = useMemo(() => {
    return conversations.filter((c) => activeTabId === 'all' || c.sessionId === activeTabId);
  }, [conversations, activeTabId]);

  const unreadTabTotal = useMemo(
    () => tabConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [tabConversations]
  );

  const groupsTabTotal = useMemo(
    () => tabConversations.filter((c) => c.isGroup || c.remoteJid?.endsWith('@g.us')).length,
    [tabConversations]
  );

  const filteredConversations = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return tabConversations.filter((c) => {
      if (chatFilter === 'unread' && !(c.unreadCount && c.unreadCount > 0)) return false;
      if (chatFilter === 'groups' && !(c.isGroup || c.remoteJid?.endsWith('@g.us'))) return false;
      if (
        chatFilter === 'leads' &&
        !(c.insight?.urgency === 'high' || c.insight?.stage === 'qualified')
      ) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q)
      );
    });
  }, [tabConversations, chatFilter, chatSearch]);

  // Lazy-load profile photos for currently visible/filtered conversations
  useEffect(() => {
    const connectedIds = new Set(sessions.filter((s) => s.status === 'connected').map((s) => s.id));
    const candidates = filteredConversations
      .filter(
        (c) =>
          connectedIds.has(c.sessionId) &&
          !(avatarCache[c.id] || c.avatarUrl) &&
          !requestedAvatarsRef.current.has(c.id)
      )
      .slice(0, 40);

      

    candidates.forEach((c) => {
      requestedAvatarsRef.current.add(c.id);
      fetchProfilePicUrl(c.sessionId, c.remoteJid).then((url) => {
        if (url) {
          setAvatarCache((prev) => ({ ...prev, [c.id]: url }));
        }
      });
    });
  }, [filteredConversations, sessions, avatarCache]);

  const activeStatuses = useMemo(
    () => (activeTabId === 'all' ? statuses : statuses.filter((st) => st.sessionId === activeTabId)),
    [statuses, activeTabId]
  );

  const activeStatusSenderKeys = useMemo(() => {
    const keys = new Set<string>();
    activeStatuses.forEach((st) => {
      if (st.senderPhone) keys.add(`${st.sessionId}:${st.senderPhone}`);
      if (st.senderJid) keys.add(`${st.sessionId}:${st.senderJid}`);
    });
    return keys;
  }, [activeStatuses]);

  const ownRailSession = useMemo(() => {
    if (activeSession) return activeSession;
    return sessions.find((s) => s.status === 'connected') || sessions[0] || null;
  }, [activeSession, sessions]);

  const handleRefreshAvatar = (sessionId: string, remoteJid: string, storeId: string) => {
    if (retriedAvatarsRef.current.has(storeId)) return;
    retriedAvatarsRef.current.add(storeId);
    fetchProfilePicUrl(sessionId, remoteJid, true).then((url) => {
      if (url) {
        setAvatarCache((prev) => ({ ...prev, [storeId]: url }));
      }
    });
  };

  const filteredMessages = useMemo(() => {
    const q = inChatSearchQuery.trim().toLowerCase();
    if (!q) return activeMessages;
    return activeMessages.filter((m) => (m.text || '').toLowerCase().includes(q));
  }, [activeMessages, inChatSearchQuery]);

  const handleOpenNewBrowserTab = async () => {
    const label = newAccountLabel.trim() || `WhatsApp Account ${sessions.length + 1}`;
    setCreatingTab(true);
    const res = await createNewSession(label);
    setCreatingTab(false);
    if (res.success && res.session) {
      setSessions((prev) => {
        if (prev.some((s) => s.id === res.session!.id)) return prev;
        return [...prev, res.session!];
      });
      setActiveTabId(res.session.id);
      setForceQrView(true);
      setNewAccountLabel('');
      setSelectedThread(null);
    } else {
      alert(res.error || 'Could not start a new WhatsApp Web tab. Check backend service.');
    }
  };

  const handleRescanSession = async (sessionId: string) => {
    const target = sessions.find((s) => s.id === sessionId);
    if (target?.status === 'connected') {
      const confirmed = window.confirm(
        `Re-link "${target.label || 'WhatsApp Account'}" via QR code?\n\nScanning a fresh QR code lets WhatsApp sync older phone chat history into EcoBill.`
      );
      if (!confirmed) return;
    }

    setForceQrView(true);
    setRescanningSessionId(sessionId);
    const res = await rescanSessionForHistory(sessionId);
    setRescanningSessionId(null);
    if (res.success && res.session) {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? res.session! : s)));
      setSelectedThread(null);
    } else {
      alert(res.error || 'Could not start QR re-scan.');
    }
  };

  const handleStartNewChat = (useSelf = false) => {
    const targetSession =
      activeSession?.status === 'connected'
        ? activeSession
        : sessions.find((s) => s.status === 'connected');
    if (!targetSession) {
      alert('Please connect at least one WhatsApp account first.');
      return;
    }

    const digits = useSelf
      ? (targetSession.phoneNumber || '').replace(/[^0-9]/g, '')
      : newChatPhone.replace(/[^0-9]/g, '');

    if (!digits || digits.length < 7) {
      alert('Enter a valid phone number with country code (or 10-digit Indian number).');
      return;
    }

    const fullDigits = digits.length === 10 ? `91${digits}` : digits;
    const jid = `${fullDigits}@s.whatsapp.net`;
    const storeKey = `${targetSession.id}:${jid}`;

    const existing = conversations.find((c) => c.id === storeKey || (c.sessionId === targetSession.id && c.phone === fullDigits));
    if (existing) {
      setSelectedThread(existing);
    } else {
      const stub: ConversationSummary = {
        id: storeKey,
        sessionId: targetSession.id,
        sessionLabel: targetSession.label,
        remoteJid: jid,
        phone: fullDigits,
        phoneResolved: true,
        name: useSelf ? `+${fullDigits} (You)` : `+${fullDigits}`,
        lastMessage: useSelf ? 'Message yourself' : 'New chat',
        timestamp: Date.now(),
        isSelfChat: useSelf
      };
      setConversations((prev) => [stub, ...prev]);
      setSelectedThread(stub);
    }

    setShowNewChatBox(false);
    setNewChatPhone('');
  };

  const handleSelectAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 14 * 1024 * 1024) {
      alert('Please choose a file smaller than 14 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPendingAttachment({
        fileDataUrl: String(reader.result || ''),
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (textOverride?: string) => {
    if (!selectedThread) return;
    const text = (textOverride ?? messageInput).trim();
    const attachment = textOverride ? null : pendingAttachment;
    if (!text && !attachment) return;

    setSending(true);
    const result = await sendWhatsAppMessage({
      sessionId: selectedThread.sessionId,
      remoteJid: selectedThread.remoteJid,
      phone: selectedThread.phone || undefined,
      message: text,
      fileDataUrl: attachment?.fileDataUrl,
      mimeType: attachment?.mimeType,
      fileName: attachment?.fileName
    });
    setSending(false);

    if (result.success) {
      if (!textOverride) {
        setMessageInput('');
        setPendingAttachment(null);
        setShowEmojiPicker(false);
      }

      const addedMsg: ChatMessage = result.message || {
        id: result.messageId || `${Date.now()}`,
        sessionId: selectedThread.sessionId,
        remoteJid: selectedThread.remoteJid,
        fromMe: true,
        senderPhone: '',
        senderName: 'You',
        text: text || attachment?.fileName || 'Attachment',
        timestamp: Date.now()
      };

      setActiveMessages((prev) => {
        if (prev.some((m) => m.id === addedMsg.id)) return prev;
        return [...prev, addedMsg];
      });
    } else {
      alert(`Failed to send message: ${result.error}`);
    }
  };

  const handleReanalyzeThread = async () => {
    if (!selectedThread) return;
    const recentText = activeMessages
      .filter((m) => !m.fromMe && m.text)
      .map((m) => m.text)
      .slice(-5)
      .join('\n') || activeMessages.map((m) => m.text).slice(-3).join('\n');

    if (!recentText.trim()) return;
    setAnalyzing(true);
    const ins = await analyzeTextWithAi(
      recentText,
      selectedThread.phone || '',
      selectedThread.name || 'Customer',
      selectedThread.sessionId,
      selectedThread.remoteJid
    );
    if (ins) {
      setActiveInsight(ins);
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedThread.id ? { ...c, insight: ins } : c))
      );
    }
    setAnalyzing(false);
  };

  const handleOpenCopilot = () => {
    const nextState = !isCopilotOpen;
    setIsCopilotOpen(nextState);
    if (nextState) setIsProfileDrawerOpen(false);
    if (nextState && !activeInsight && selectedThread) {
      handleReanalyzeThread();
    }
  };

  const handleToggleProfileDrawer = () => {
    const nextState = !isProfileDrawerOpen;
    setIsProfileDrawerOpen(nextState);
    if (nextState) setIsCopilotOpen(false);
  };

  const handleSelectChatFromStatus = (statusItem: WhatsAppStatusItem) => {
    const existing = conversations.find(
      (c) =>
        c.sessionId === statusItem.sessionId &&
        (c.remoteJid === statusItem.senderJid || (statusItem.senderPhone && c.phone === statusItem.senderPhone))
    );
    if (existing) {
      setSelectedThread(existing);
      setRailMode('chats');
      return;
    }
    if (!statusItem.senderPhone) return;
    const jid = `${statusItem.senderPhone}@s.whatsapp.net`;
    const stub: ConversationSummary = {
      id: `${statusItem.sessionId}:${jid}`,
      sessionId: statusItem.sessionId,
      sessionLabel: statusItem.sessionLabel,
      remoteJid: jid,
      phone: statusItem.senderPhone,
      phoneResolved: true,
      name: statusItem.senderName || `+${statusItem.senderPhone}`,
      avatarUrl: statusItem.avatarUrl,
      lastMessage: 'Replying to status',
      timestamp: Date.now()
    };
    setConversations((prev) => [stub, ...prev]);
    setSelectedThread(stub);
    setRailMode('chats');
  };

  const handleDraftQuotation = () => {
    if (!activeInsight) return;
    const params = new URLSearchParams({
      leadName: activeInsight.leadName || selectedThread?.name || '',
      phone: activeInsight.phone || selectedThread?.phone || '',
      company: activeInsight.company || '',
      requirement: activeInsight.requirement || '',
      quantity: activeInsight.quantity || '1',
      budget: activeInsight.budget || ''
    });
    navigate(`/quotations/new?${params.toString()}`);
  };

  const handleSaveToCrm = async () => {
    if (!selectedThread) return;
    const effectiveInsight: AiLeadInsight = activeInsight || {
      isBusinessLead: true,
      leadName: selectedThread.name,
      phone: selectedThread.phone,
      company: '',
      quantity: '',
      budget: '',
      requirement: selectedThread.lastMessage || 'Direct WhatsApp Inbound Chat',
      urgency: 'medium',
      stage: 'qualified',
      suggestedAction: '',
      suggestedReply: '',
      analyzedAt: Date.now()
    };
    try {
      const outcome = await syncWhatsAppLeadToCrm({
        sessionId: selectedThread.sessionId,
        sessionLabel: selectedThread.sessionLabel,
        remoteJid: selectedThread.remoteJid,
        phone: selectedThread.phone,
        name: selectedThread.name,
        messageText: selectedThread.lastMessage,
        insight: effectiveInsight,
        forceCreate: true,
        triggeredBy: 'manual'
      });
      setCrmPreview({ pipelineName: outcome.pipelineName, stageLabel: outcome.stageLabel });
      setSaveLeadSuccess(true);
      if (outcome.leadId) {
        setMatchedLead({
          id: outcome.leadId,
          data: {
            name: outcome.leadName,
            status: outcome.stageId,
            pipeline_id: outcome.pipelineId,
            phone: selectedThread.phone || ''
          } as any
        });
      }
      toast.success(
        outcome.action === 'updated'
          ? `Lead updated in ${outcome.pipelineName} (${outcome.stageLabel})`
          : `Lead added to ${outcome.pipelineName} (${outcome.stageLabel})`
      );
      setTimeout(() => setSaveLeadSuccess(false), 2500);
    } catch (e) {
      console.error('Error saving lead to CRM:', e);
      alert('Could not save lead to CRM. Please check database permissions.');
    }
  };

  const handleStartDateRangeImport = async (opts: {
    mode: 'range' | 'all';
    startDate?: string;
    endDate?: string;
    accountId: string;
  }) => {
    setImportingLeads(true);
    setImportSummary(null);
    setImportProgressText('Scanning synced WhatsApp conversations...');

    try {
      const res = await importLeadsFromHistory({
        sessionId: opts.accountId,
        startDate: opts.startDate,
        endDate: opts.endDate,
        mode: opts.mode
      });

      if (!res.success) {
        toast.error(res.error || 'Could not import WhatsApp leads.');
        return;
      }

      const summary: WhatsAppImportSummary = {
        scanned: res.totalScanned,
        qualified: res.leads.length,
        created: 0,
        updated: 0,
        skipped: Math.max(0, res.totalScanned - res.leads.length)
      };

      for (let i = 0; i < res.leads.length; i += 1) {
        const item = res.leads[i];
        setImportProgressText(`Adding lead ${i + 1} of ${res.leads.length} to Pipeline...`);
        try {
          const outcome = await syncWhatsAppLeadToCrm({
            sessionId: item.sessionId,
            sessionLabel: item.sessionLabel,
            sourceWhatsappNumber: item.sourceWhatsappNumber,
            remoteJid: item.remoteJid,
            phone: item.phone || item.insight?.phone,
            name: item.name || item.insight?.leadName,
            messageText: item.messageText || item.insight?.requirement,
            insight: item.insight,
            forceCreate: false,
            triggeredBy: 'manual',
            messageTimestamp: item.timestamp
          });
          if (outcome.action === 'created') summary.created += 1;
          else if (outcome.action === 'updated') summary.updated += 1;
          else summary.skipped += 1;
        } catch {
          summary.skipped += 1;
        }
      }

      setImportSummary(summary);
      if (summary.created > 0 || summary.updated > 0) {
        toast.success(
          `Pipeline Import: Added ${summary.created} new lead(s), updated ${summary.updated}.`,
          { duration: 5000 }
        );
      } else {
        toast('Import complete: no new uncaptured business leads found in that range.');
      }
    } finally {
      setImportingLeads(false);
      setImportProgressText('');
    }
  };

  const formatContactSubtitle = (thread: ConversationSummary) => {
    if (thread.isSelfChat) return 'Message yourself';
    if (thread.isGroup || thread.remoteJid?.endsWith('@g.us')) return 'WhatsApp Group';
    if (thread.phoneResolved && thread.phone) return `+${thread.phone}`;
    return 'WhatsApp Privacy ID';
  };

  const getUnreadForSession = (sessionId: string) =>
    conversations.filter((c) => c.sessionId === sessionId).reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const hasChatsForActiveTab = useMemo(
    () =>
      activeTabId === 'all'
        ? conversations.length > 0
        : conversations.some((c) => c.sessionId === activeTabId),
    [conversations, activeTabId]
  );

  // Never hide synced chats behind the QR screen unless the user explicitly clicked Link/Re-link OR the tab has 0 synced chats and isn't connected
  const showInlineQrWorkspace =
    !showManageAccounts &&
    (forceQrView ||
      (activeTabId !== 'all' && activeSession && activeSession.status !== 'connected' && !hasChatsForActiveTab) ||
      (sessions.length === 0 && activeTabId === 'all'));

  return (
    <div className="flex flex-col h-[calc(100vh-175px)] min-h-[650px] space-y-2.5">
      {/* Top Browser Window Chrome */}
      <div className="bg-surface rounded-card shadow-neo-raised overflow-hidden shrink-0">
        {/* Browser Tab Strip */}
        <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2 border-b border-shadow-dark overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => {
                setActiveTabId('all');
                setShowManageAccounts(false);
                setForceQrView(false);
                setRailMode('chats');
                setShowOwnProfileCard(false);
              }}
              className={`px-3.5 py-2 rounded-t-card rounded-b-input text-xs font-bold shrink-0 flex items-center gap-2 transition-all ${activeTabId === 'all' && !showManageAccounts
                  ? 'bg-primary text-surface shadow-neo-surface'
                  : 'bg-surface text-secondary shadow-neo-surface hover:text-primary-dark'
                }`}
            >
              <Bot size={14} />
              All Chats
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTabId === 'all' && !showManageAccounts
                    ? 'bg-primary-dark text-surface'
                    : 'bg-surface shadow-neo-inset text-primary'
                  }`}
              >
                {conversations.length}
              </span>
            </button>

            {sessions.map((s) => {
              const isSelected = activeTabId === s.id && !showManageAccounts;
              const unread = getUnreadForSession(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveTabId(s.id);
                    setShowManageAccounts(false);
                    setForceQrView(false);
                    setRailMode('chats');
                    setShowOwnProfileCard(false);
                  }}
                  className={`px-3.5 py-2 rounded-t-card rounded-b-input text-xs font-bold shrink-0 flex items-center gap-2 transition-all ${isSelected
                      ? 'bg-surface shadow-neo-pressed text-primary-dark border-b-2 border-primary'
                      : 'bg-surface text-secondary shadow-neo-surface hover:text-primary-dark'
                    }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${s.status === 'connected' ? 'bg-primary' : 'bg-secondary opacity-50'
                      }`}
                  />
                  <span className="truncate max-w-[140px]">{s.label}</span>
                  {unread > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-surface font-extrabold">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              onClick={handleOpenNewBrowserTab}
              disabled={creatingTab}
              title="Open a new WhatsApp Web tab to scan another number"
              className="px-3 py-2 rounded-btn bg-surface shadow-neo-surface text-primary hover:shadow-neo-hover text-xs font-bold shrink-0 flex items-center gap-1"
            >
              <Plus size={14} />
              New Tab
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const next = !autoPilotEnabled;
                setAutoPilotEnabled(next);
                setAutoCrmSyncEnabled(next);
                toast.success(
                  next
                    ? 'Auto-CRM Pipeline enabled: incoming WhatsApp leads will auto-sync into CRM stages.'
                    : 'Auto-CRM Pipeline paused: leads can still be saved manually from AI Copilot.'
                );
              }}
              className={`px-3 py-1.5 rounded-btn text-[11px] font-bold flex items-center gap-1.5 transition-all ${autoPilotEnabled
                  ? 'bg-primary text-surface shadow-neo-surface'
                  : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                }`}
              title="Automatically add & classify incoming WhatsApp leads into CRM Pipeline stages"
            >
              <Zap size={13} /> Auto-CRM Pipeline: {autoPilotEnabled ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setShowManageAccounts(!showManageAccounts)}
              className={`px-3 py-1.5 rounded-btn text-[11px] font-bold flex items-center gap-1.5 transition-all ${showManageAccounts
                  ? 'bg-primary text-surface shadow-neo-surface'
                  : 'bg-surface shadow-neo-surface text-primary-dark'
                }`}
            >
              <Phone size={13} /> Manage ({sessions.length})
            </button>
          </div>
        </div>

        {/* Browser Address & Sync Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-surface">
          <div className="flex items-center gap-2 flex-1 min-w-[220px] px-3 py-1.5 rounded-btn bg-surface shadow-neo-inset text-[11px] text-secondary">
            <Lock size={12} className="text-primary shrink-0" />
            <span className="truncate font-medium text-primary-dark">
              web.whatsapp.com/{activeSession ? activeSession.label.toLowerCase().replace(/\s+/g, '-') : 'all-accounts'}
            </span>
            {activeSession?.phoneNumber && (
              <span className="text-[10px] font-bold text-primary shrink-0">
                (+{activeSession.phoneNumber})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setImportSummary(null);
                setShowImportModal(true);
              }}
              title="Select a custom date range to import WhatsApp leads into CRM Pipeline"
              className="px-3 py-1.5 rounded-btn bg-surface shadow-neo-surface text-[11px] font-bold text-primary-dark hover:text-primary flex items-center gap-1.5"
            >
              <CalendarRange size={13} className="text-primary" />
              Import Leads
            </button>

            {activeSession && activeSession.status !== 'connected' && hasChatsForActiveTab && (
              <button
                onClick={() => setForceQrView((v) => !v)}
                className="px-3 py-1.5 rounded-btn bg-primary text-surface shadow-neo-surface text-[11px] font-bold flex items-center gap-1.5"
              >
                <QrCode size={13} />
                {forceQrView ? 'View Synced Chats' : 'Link Account (QR)'}
              </button>
            )}

            {activeSession && activeSession.status === 'connected' && (
              <button
                onClick={() => handleRescanSession(activeSession.id)}
                disabled={rescanningSessionId === activeSession.id}
                title="Unlink and scan a fresh QR code to re-link this number"
                className="px-3 py-1.5 rounded-btn bg-surface shadow-neo-surface text-[11px] font-bold text-primary hover:shadow-neo-hover flex items-center gap-1.5"
              >
                <QrCode size={13} />
                {rescanningSessionId === activeSession.id ? 'Starting QR...' : 'Re-link QR'}
              </button>
            )}

            <button
              onClick={reloadWorkspace}
              title="Refresh sessions and chats"
              className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Manage Accounts View OR Browser Viewport */}
      {showManageAccounts ? (
        <div className="flex-1 overflow-y-auto p-1">
          <MultiAccountManager
            activeSessionId={activeTabId === 'all' ? undefined : activeTabId}
            onSelectSession={(id) => {
              setActiveTabId(id);
              setShowManageAccounts(false);
            }}
          />
        </div>
      ) : (
        <div className="flex-1 bg-surface rounded-card shadow-neo-raised flex min-h-0 overflow-hidden relative">
          {/* Far-Left Vertical Icon Rail (exact browser WhatsApp sidebar strip) */}
          <div className="hidden sm:flex flex-col items-center justify-between w-14 py-3 border-r border-shadow-dark bg-surface shrink-0 relative z-20">
            <div className="flex flex-col items-center gap-2.5">
              <button
                onClick={() => {
                  setRailMode('chats');
                  setChatFilter('all');
                }}
                title="All Chats"
                className={`relative w-10 h-10 rounded-card flex items-center justify-center transition-all ${railMode === 'chats' && chatFilter === 'all' ? 'bg-primary text-surface shadow-neo-surface' : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                  }`}
              >
                <MessageSquare size={18} />
                {unreadTabTotal > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-dark text-surface text-[9px] font-extrabold flex items-center justify-center">
                    {unreadTabTotal}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setRailMode('status');
                  setForceQrView(false);
                }}
                title="WhatsApp Status Updates"
                className={`relative w-10 h-10 rounded-card flex items-center justify-center transition-all ${railMode === 'status' ? 'bg-primary text-surface shadow-neo-surface' : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                  }`}
              >
                <CircleDot size={18} />
                {activeStatuses.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-dark text-surface text-[9px] font-extrabold flex items-center justify-center">
                    {activeStatuses.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setRailMode('chats');
                  setChatFilter('groups');
                }}
                title="Groups"
                className={`w-10 h-10 rounded-card flex items-center justify-center transition-all ${railMode === 'chats' && chatFilter === 'groups' ? 'bg-primary text-surface shadow-neo-surface' : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                  }`}
              >
                <Users size={18} />
              </button>

              <button
                onClick={() => {
                  setRailMode('chats');
                  setChatFilter('leads');
                }}
                title="AI Qualified & Urgent Leads"
                className={`w-10 h-10 rounded-card flex items-center justify-center transition-all ${railMode === 'chats' && chatFilter === 'leads' ? 'bg-primary text-surface shadow-neo-surface' : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                  }`}
              >
                <Sparkles size={18} />
              </button>

              <button
                onClick={() => {
                  setRailMode('chats');
                  setShowNewChatBox((v) => !v);
                }}
                title="Start New Chat or Message Yourself"
                className="w-10 h-10 rounded-card bg-surface shadow-neo-surface text-primary hover:shadow-neo-hover flex items-center justify-center"
              >
                <MessageSquarePlus size={18} />
              </button>
            </div>

            <div className="flex flex-col items-center gap-2.5 relative">
              <button
                onClick={() => setShowManageAccounts(true)}
                title="Linked WhatsApp Numbers"
                className="w-10 h-10 rounded-card bg-surface shadow-neo-surface text-secondary hover:text-primary-dark flex items-center justify-center"
              >
                <Smartphone size={18} />
              </button>

              {ownRailSession && (
                <button
                  onClick={() => setShowOwnProfileCard((v) => !v)}
                  title={`${ownRailSession.pushName || ownRailSession.label} — Profile & Status`}
                  className="rounded-full p-0.5 transition-transform hover:scale-105"
                >
                  <ContactAvatar
                    name={ownRailSession.pushName || ownRailSession.label}
                    avatarUrl={ownRailSession.avatarUrl}
                    sizeClass="w-9 h-9 text-xs"
                  />
                </button>
              )}

              {showOwnProfileCard && ownRailSession && (
                <div className="absolute left-14 bottom-0 z-30 w-64 p-4 rounded-card bg-surface shadow-neo-raised border border-shadow-dark space-y-3 animate-fade-in">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ContactAvatar
                        name={ownRailSession.pushName || ownRailSession.label}
                        avatarUrl={ownRailSession.avatarUrl}
                        sizeClass="w-11 h-11 text-sm"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-extrabold text-primary-dark truncate">
                          {ownRailSession.pushName || ownRailSession.label}
                        </h4>
                        <p className="text-[11px] text-secondary truncate">
                          {ownRailSession.phoneNumber ? `+${ownRailSession.phoneNumber}` : ownRailSession.label}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowOwnProfileCard(false)}
                      className="p-1 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <div className="p-2.5 rounded-card bg-surface shadow-neo-inset space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary block">
                      About Status
                    </span>
                    <p className="text-[11px] text-primary-dark leading-snug">
                      {ownRailSession.aboutStatus || 'Hey there! I am using WhatsApp.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-secondary font-medium">Connection</span>
                    <span className="font-bold text-primary capitalize">{ownRailSession.status}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {showInlineQrWorkspace ? (
            <InlineQrSetupView
              session={activeSession}
              newAccountLabel={newAccountLabel}
              onLabelChange={setNewAccountLabel}
              onCreateNewTab={handleOpenNewBrowserTab}
              onRescanSession={handleRescanSession}
              onRequestPairingCode={requestPairingCodeForSession}
              creating={creatingTab}
              rescanning={rescanningSessionId === activeSession?.id}
            />
          ) : railMode === 'status' ? (
            <StatusFeedView
              statuses={activeStatuses}
              sessions={sessions}
              onSelectChatFromStatus={handleSelectChatFromStatus}
            />
          ) : (
            <>
              {/* Column 1: Chats List Panel (WhatsApp Web Left Column) */}
              <div
                className={`${selectedThread ? 'hidden md:flex' : 'flex'
                  } w-full md:w-[330px] lg:w-[370px] shrink-0 border-r border-shadow-dark flex-col min-h-0 bg-surface`}
              >
                {/* Chats Header */}
                <div className="px-4 pt-3.5 pb-2.5 space-y-2.5 border-b border-shadow-darker/60">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-extrabold text-primary-dark tracking-tight">WhatsApp</h2>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowNewChatBox(!showNewChatBox)}
                        title="New Chat or Message Yourself"
                        className="w-8 h-8 rounded-full bg-surface shadow-neo-surface text-primary hover:shadow-neo-hover flex items-center justify-center"
                      >
                        <UserPlus size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Quick New Chat / Message Yourself Form */}
                  {showNewChatBox && (
                    <div className="p-2.5 rounded-card bg-surface shadow-neo-inset space-y-2 animate-fade-in">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newChatPhone}
                          onChange={(e) => setNewChatPhone(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleStartNewChat(false)}
                          placeholder="Phone number (e.g. 9876543210)"
                          className="neo-input flex-1 text-[11px] !py-1.5 !px-2.5"
                        />
                        <button
                          onClick={() => handleStartNewChat(false)}
                          className="neo-btn-primary !px-3 !py-1.5 text-[11px] font-bold"
                        >
                          Chat
                        </button>
                      </div>
                      <button
                        onClick={() => handleStartNewChat(true)}
                        className="w-full py-1.5 px-2.5 rounded-input bg-surface shadow-neo-surface text-[11px] font-bold text-primary hover:text-primary-dark flex items-center justify-center gap-1.5"
                      >
                        <MessageSquare size={12} /> Message Yourself (You)
                      </button>
                    </div>
                  )}

                  {/* Search Input */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                    <input
                      type="text"
                      value={chatSearch}
                      onChange={(e) => setChatSearch(e.target.value)}
                      placeholder="Search or start a new chat"
                      className="neo-input w-full !pl-9 !pr-3 !py-2 text-xs rounded-btn"
                    />
                  </div>

                  {/* WhatsApp Web Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-0.5">
                    <button
                      onClick={() => setChatFilter('all')}
                      className={`px-3 py-1 rounded-btn font-bold shrink-0 transition-all ${chatFilter === 'all'
                          ? 'bg-primary text-surface shadow-neo-surface'
                          : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                        }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setChatFilter('unread')}
                      className={`px-3 py-1 rounded-btn font-bold shrink-0 transition-all ${chatFilter === 'unread'
                          ? 'bg-primary text-surface shadow-neo-surface'
                          : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                        }`}
                    >
                      Unread {unreadTabTotal > 0 ? unreadTabTotal : ''}
                    </button>
                    <button
                      onClick={() => setChatFilter('groups')}
                      className={`px-3 py-1 rounded-btn font-bold shrink-0 transition-all ${chatFilter === 'groups'
                          ? 'bg-primary text-surface shadow-neo-surface'
                          : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                        }`}
                    >
                      Groups {groupsTabTotal > 0 ? groupsTabTotal : ''}
                    </button>
                    <button
                      onClick={() => setChatFilter('leads')}
                      className={`px-3 py-1 rounded-btn font-bold shrink-0 transition-all ${chatFilter === 'leads'
                          ? 'bg-primary text-surface shadow-neo-surface'
                          : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                        }`}
                    >
                      Leads
                    </button>
                  </div>
                </div>

                {/* Scrollable Conversations */}
                <div className="flex-1 overflow-y-auto divide-y divide-shadow-darker/60 custom-sidebar-scrollbar">
                  {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-secondary space-y-3">
                      <Bot size={30} className="mx-auto text-primary opacity-60" />
                      <p className="font-bold text-primary-dark">No WhatsApp chats loaded yet</p>
                      <p className="text-[11px] leading-relaxed">
                        Send/receive a message or click <strong>Sync History (QR)</strong> above to re-pair and pull older chats.
                      </p>
                      <button
                        onClick={() => setShowNewChatBox(true)}
                        className="neo-btn !px-4 !py-1.5 text-[11px] font-bold text-primary"
                      >
                        Start a Chat
                      </button>
                    </div>
                  ) : (
                    filteredConversations.map((c) => {
                      const isSelected = selectedThread?.id === c.id;
                      const avatar = avatarCache[c.id] || c.avatarUrl;
                      const isGroup = Boolean(c.isGroup || c.remoteJid?.endsWith('@g.us'));
                      const hasStatus = Boolean(
                        (c.phone && activeStatusSenderKeys.has(`${c.sessionId}:${c.phone}`)) ||
                          activeStatusSenderKeys.has(c.id)
                      );
                      const rowPresence = presenceCache[c.id]?.presence;
                      const isLiveAction = rowPresence === 'composing' || rowPresence === 'recording';

                      return (
                        <div
                          key={c.id}
                          onClick={() => setSelectedThread(c)}
                          className={`px-3.5 py-3 cursor-pointer flex items-center gap-3 transition-all ${isSelected ? 'bg-surface shadow-neo-pressed' : 'hover:bg-shadow-darker/25'
                            }`}
                        >
                          <ContactAvatar
                            name={c.name}
                            avatarUrl={avatar}
                            isGroup={isGroup}
                            hasStatusRing={hasStatus}
                            onImageError={() => handleRefreshAvatar(c.sessionId, c.remoteJid, c.id)}
                            sizeClass="w-11 h-11 text-sm"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-xs font-bold text-primary-dark truncate">
                                {c.name}
                              </h4>
                              <span
                                className={`text-[10px] shrink-0 ${(c.unreadCount || 0) > 0 ? 'font-bold text-primary' : 'text-secondary'
                                  }`}
                              >
                                {formatConversationTime(c.timestamp)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 mt-1">
                              {isLiveAction ? (
                                <p className="text-[11px] font-bold text-primary truncate">
                                  {rowPresence === 'recording' ? 'recording audio...' : 'typing...'}
                                </p>
                              ) : (
                                <p className="text-[11px] text-secondary truncate flex items-center gap-1">
                                  <MessagePreviewIcon
                                    mediaType={
                                      c.lastMessage === 'Photo'
                                        ? 'image'
                                        : c.lastMessage === 'Voice message'
                                          ? 'audio'
                                          : c.lastMessage === 'Video'
                                            ? 'video'
                                            : c.lastMessage?.endsWith('.pdf')
                                              ? 'document'
                                              : undefined
                                    }
                                  />
                                  <span className="truncate">{c.lastMessage}</span>
                                </p>
                              )}

                              {(c.unreadCount || 0) > 0 && (
                                <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-surface text-[10px] font-extrabold flex items-center justify-center shrink-0">
                                  {c.unreadCount}
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

              {/* Column 2: Active WhatsApp Chat Viewport */}
              <div
                className={`${selectedThread ? 'flex' : 'hidden md:flex'
                  } flex-1 flex-col min-w-0 min-h-0 bg-surface relative`}
              >
                {selectedThread ? (
                  <>
                    {/* Chat Header */}
                    <div className="px-4 py-2.5 border-b border-shadow-dark bg-surface flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={() => setSelectedThread(null)}
                          className="md:hidden p-1.5 rounded-full bg-surface shadow-neo-surface text-primary-dark"
                        >
                          <ArrowLeft size={16} />
                        </button>
                        <div
                          onClick={handleToggleProfileDrawer}
                          title="View Contact Profile, Photo & About"
                          className="flex items-center gap-3 min-w-0 cursor-pointer group"
                        >
                          <ContactAvatar
                            name={selectedThread.name}
                            avatarUrl={avatarCache[selectedThread.id] || selectedThread.avatarUrl}
                            isGroup={Boolean(selectedThread.isGroup || selectedThread.remoteJid?.endsWith('@g.us'))}
                            hasStatusRing={Boolean(
                              (selectedThread.phone &&
                                activeStatusSenderKeys.has(`${selectedThread.sessionId}:${selectedThread.phone}`)) ||
                                activeStatusSenderKeys.has(selectedThread.id)
                            )}
                            onImageError={() =>
                              handleRefreshAvatar(
                                selectedThread.sessionId,
                                selectedThread.remoteJid,
                                selectedThread.id
                              )
                            }
                            sizeClass="w-10 h-10 text-xs"
                          />
                          <div className="min-w-0">
                            <h4 className="text-xs sm:text-sm font-bold text-primary-dark group-hover:text-primary transition-colors truncate">
                              {selectedThread.name}
                            </h4>
                            {(() => {
                              const activePresence = presenceCache[selectedThread.id];
                              const subtitleInfo = formatPresenceSubtitle(
                                activePresence?.presence,
                                activePresence?.lastSeen,
                                formatContactSubtitle(selectedThread)
                              );
                              return (
                                <p
                                  className={`text-[11px] truncate ${
                                    subtitleInfo.isLive ? 'text-primary font-bold' : 'text-secondary'
                                  }`}
                                >
                                  {subtitleInfo.label || formatContactSubtitle(selectedThread)}
                                  {activeTabId === 'all' && ` • ${selectedThread.sessionLabel}`}
                                </p>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setInChatSearchOpen(!inChatSearchOpen);
                            setInChatSearchQuery('');
                          }}
                          title="Search messages in this chat"
                          className={`p-2 rounded-full transition-all ${inChatSearchOpen
                              ? 'bg-primary text-surface shadow-neo-surface'
                              : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                            }`}
                        >
                          <Search size={15} />
                        </button>

                        <button
                          onClick={handleOpenCopilot}
                          className={`px-3 py-1.5 rounded-btn text-[11px] font-bold flex items-center gap-1.5 transition-all ${isCopilotOpen
                              ? 'bg-primary text-surface shadow-neo-surface'
                              : 'bg-surface shadow-neo-surface text-primary hover:shadow-neo-hover'
                            }`}
                        >
                          <Sparkles size={13} />
                          <span>AI Copilot</span>
                        </button>
                      </div>
                    </div>

                    {/* In-Chat Search Sub-bar */}
                    {inChatSearchOpen && (
                      <div className="px-4 py-2 border-b border-shadow-dark bg-surface flex items-center gap-2 shrink-0">
                        <Search size={14} className="text-secondary" />
                        <input
                          type="text"
                          autoFocus
                          value={inChatSearchQuery}
                          onChange={(e) => setInChatSearchQuery(e.target.value)}
                          placeholder="Search messages in this conversation..."
                          className="neo-input flex-1 !py-1.5 text-xs"
                        />
                        <button
                          onClick={() => {
                            setInChatSearchOpen(false);
                            setInChatSearchQuery('');
                          }}
                          className="p-1 text-secondary hover:text-primary-dark"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Interactive Lead Confirmation Prompt: If contact chatted without requirement and is not in CRM */}
                    {!matchedLead && !selectedThread.isGroup && !selectedThread.remoteJid?.endsWith('@g.us') && !dismissedAddLeadKeys.has(selectedThread.id) && (
                      <div className="mx-4 mt-2.5 mb-1 p-3 rounded-card bg-amber-500/10 border border-amber-500/30 shadow-neo-surface flex flex-wrap items-center justify-between gap-3 animate-fade-in shrink-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 font-bold">
                            <UserPlus size={16} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-primary-dark">
                              {hasThreadRequirement ? 'New Inquiry Detected' : 'No Order Requirement Detected'}
                            </p>
                            <p className="text-[11px] text-secondary">
                              {hasThreadRequirement
                                ? `Order details detected. Would you like to add ${selectedThread.phone ? `+${selectedThread.phone}` : selectedThread.name} as a lead?`
                                : `This contact is only chatting without order specs. Can I add ${selectedThread.phone ? `+${selectedThread.phone}` : selectedThread.name} as a lead?`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={handleSaveToCrm}
                            disabled={saveLeadSuccess}
                            className="neo-btn-primary !py-1.5 !px-3 text-xs font-bold flex items-center gap-1.5"
                          >
                            <UserPlus size={13} />
                            <span>Add as Lead</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDismissedAddLeadKeys((prev) => new Set(prev).add(selectedThread.id))}
                            className="neo-btn !py-1.5 !px-2.5 text-xs text-secondary hover:text-primary-dark"
                          >
                            Ignore
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Messages Scroll Canvas */}
                    <div
                      className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 custom-sidebar-scrollbar"
                      style={{
                        backgroundImage: 'radial-gradient(rgba(0, 103, 102, 0.06) 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                      }}
                    >
                      {filteredMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-secondary gap-2 py-12">
                          <MessageSquare size={28} className="text-primary opacity-40" />
                          <p className="text-xs font-semibold text-primary-dark">
                            {inChatSearchQuery
                              ? 'No messages matched your search.'
                              : 'Send a message below to start or continue this WhatsApp chat.'}
                          </p>
                        </div>
                      ) : (
                        filteredMessages.map((m, idx) => {
                          const currentLabel = getDateDividerLabel(m.timestamp);
                          const prevLabel = idx > 0 ? getDateDividerLabel(filteredMessages[idx - 1].timestamp) : null;
                          const showDivider = idx === 0 || currentLabel !== prevLabel;

                          return (
                            <React.Fragment key={m.id}>
                              {showDivider && (
                                <div className="flex justify-center my-2">
                                  <span className="px-3 py-1 rounded-btn bg-surface shadow-neo-surface text-[10px] font-bold text-secondary">
                                    {currentLabel}
                                  </span>
                                </div>
                              )}
                              <MessageBubble message={m} onPreviewImage={(url) => setPreviewImageUrl(url)} />
                            </React.Fragment>
                          );
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Pending File Attachment Preview Bar */}
                    {pendingAttachment && (
                      <div className="px-4 py-2 border-t border-shadow-dark bg-surface flex items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText size={16} className="text-primary shrink-0" />
                          <span className="text-xs font-semibold text-primary-dark truncate">
                            {pendingAttachment.fileName}
                          </span>
                        </div>
                        <button
                          onClick={() => setPendingAttachment(null)}
                          className="p-1 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}

                    {/* Quick Emoji Popover */}
                    {showEmojiPicker && (
                      <div className="px-4 py-2 border-t border-shadow-dark bg-surface flex flex-wrap items-center gap-1.5 shrink-0">
                        {QUICK_EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => setMessageInput((prev) => `${prev}${em}`)}
                            className="w-8 h-8 rounded-btn bg-surface shadow-neo-surface hover:shadow-neo-hover text-sm flex items-center justify-center"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Bottom WhatsApp Web Message Composer */}
                    <div className="px-3.5 py-2.5 border-t border-shadow-dark bg-surface flex items-center gap-2 shrink-0">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                        onChange={handleSelectAttachment}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach image or document"
                        className="w-10 h-10 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary flex items-center justify-center shrink-0"
                      >
                        <Paperclip size={17} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker((v) => !v)}
                        title="Insert emoji"
                        className={`w-10 h-10 rounded-full bg-surface shadow-neo-surface flex items-center justify-center shrink-0 ${showEmojiPicker ? 'text-primary shadow-neo-pressed' : 'text-secondary hover:text-primary'
                          }`}
                      >
                        <Smile size={18} />
                      </button>

                      <input
                        type="text"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder="Type a message"
                        className="neo-input flex-1 !py-2.5 !px-4 text-xs rounded-btn"
                      />

                      <button
                        onClick={() => handleSendMessage()}
                        disabled={sending || (!messageInput.trim() && !pendingAttachment)}
                        className="w-10 h-10 rounded-full bg-primary text-surface shadow-neo-raised flex items-center justify-center shrink-0 disabled:opacity-50 hover:bg-primary-dark transition-colors"
                        title="Send message"
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-secondary gap-3">
                    <div className="w-16 h-16 rounded-full bg-surface shadow-neo-raised flex items-center justify-center text-primary">
                      <MessageSquare size={28} />
                    </div>
                    <h3 className="text-lg font-extrabold text-primary-dark">EcoBill Multi-Agent WhatsApp Web</h3>
                    <p className="text-xs text-secondary max-w-sm leading-relaxed">
                      Select any conversation on the left, message a customer, or scan another WhatsApp account tab above.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        onClick={() => setShowNewChatBox(true)}
                        className="neo-btn-primary text-xs font-bold flex items-center gap-1.5"
                      >
                        <MessageSquarePlus size={14} /> Start New Chat
                      </button>
                      {activeSession?.status === 'connected' && (
                        <button
                          onClick={() => handleRescanSession(activeSession.id)}
                          className="neo-btn text-xs font-bold text-primary flex items-center gap-1.5"
                        >
                          <QrCode size={14} /> Sync History (QR)
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Slide-Over Contact Info & About Drawer */}
              {selectedThread && isProfileDrawerOpen && (
                <ContactProfileDrawer
                  thread={selectedThread}
                  avatarUrl={avatarCache[selectedThread.id] || selectedThread.avatarUrl}
                  about={contactAboutCache[selectedThread.id]}
                  presence={presenceCache[selectedThread.id]?.presence}
                  lastSeen={presenceCache[selectedThread.id]?.lastSeen}
                  onClose={() => setIsProfileDrawerOpen(false)}
                  onOpenCopilot={() => {
                    setIsProfileDrawerOpen(false);
                    setIsCopilotOpen(true);
                    if (!activeInsight && selectedThread) {
                      handleReanalyzeThread();
                    }
                  }}
                />
              )}

              {/* Slide-Over AI Copilot Drawer (2-col default, opens on click) */}
              {selectedThread && isCopilotOpen && (
                <AiCopilotDrawer
                  insight={activeInsight}
                  crmPreview={crmPreview}
                  analyzing={analyzing}
                  sending={sending}
                  saveSuccess={saveLeadSuccess}
                  lead={matchedLead?.data}
                  leadId={matchedLead?.id}
                  onClose={() => setIsCopilotOpen(false)}
                  onReanalyze={handleReanalyzeThread}
                  onDraftQuotation={handleDraftQuotation}
                  onSaveToCrm={handleSaveToCrm}
                  onSendSuggestedReply={(reply) => handleSendMessage(reply)}
                  onUpdateStage={handleUpdateLeadStage}
                  updatingStage={updatingLeadStage}
                  onUpdateDeadline={handleUpdateLeadDeadline}
                  updatingDeadline={updatingLeadDeadline}
                  onInsertReply={handleInsertSuggestedReply}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Fullscreen Image Lightbox Preview */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-50 bg-primary-dark/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-surface shadow-neo-raised text-primary-dark flex items-center justify-center"
            >
              <X size={16} />
            </button>
            <img
              src={previewImageUrl}
              alt="WhatsApp media preview"
              className="max-h-[85vh] max-w-full rounded-card shadow-neo-raised object-contain bg-surface"
            />
          </div>
        </div>
      )}
      <WhatsAppDateImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        accountOptions={sessions.map((s) => ({
          id: s.id,
          label: s.label,
          connected: s.status === 'connected'
        }))}
        defaultAccountId={activeTabId}
        importing={importingLeads}
        progressText={importProgressText}
        resultSummary={importSummary}
        onStartImport={handleStartDateRangeImport}
        onOpenPipeline={() => navigate('/pipeline')}
      />
    </div>
  );
}

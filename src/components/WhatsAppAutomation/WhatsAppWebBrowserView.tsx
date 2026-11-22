import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CalendarRange,
  CheckCircle2,
  Columns3,
  ExternalLink,
  Gift,
  GitBranch,
  Globe,
  Lock,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Minus,
  Plus,
  RotateCw,
  Sparkles,
  Users,
  X,
  Zap,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { ElectronWebviewElement } from '../../types/electron';
import type { AiLeadInsight } from '../../services/whatsappMultiSessionService';
import { analyzeIncomingWhatsAppMessage } from '../../lib/whatsappAiAnalyzer';
import {
  getAutoCrmSyncEnabled,
  previewCrmPipelineAndStage,
  setAutoCrmSyncEnabled,
  subscribeAutoCrmSyncChange,
  syncWhatsAppLeadToCrm,
  type CrmSyncOutcome
} from '../../services/whatsappCrmSyncService';
import { AiCopilotDrawer } from './WhatsAppWebComponents';
import {
  WhatsAppDateImportModal,
  type WhatsAppImportSummary
} from './WhatsAppDateImportModal';
import { WhatsAppWelcomeKitModal } from './WhatsAppWelcomeKitModal';
import { LeadAssignmentModal } from '../CRM/LeadAssignmentManager';
import { subscribeScopedLeads } from '../../utils/leadVisibility';
import { db } from '../../lib/firebase';
import type { Lead } from '../../types';
import {
  findDueNoReplyLeadsForTestimonial,
  getCachedWelcomeKitConfig,
  hasWelcomeKitBeenSent,
  recordNoReplyFollowupDelivery,
  recordWelcomeKitDeliveryToCrm,
  renderWelcomeKitMessage,
  resolveStageNewEnquiryText,
  subscribeWelcomeKitConfig,
  type WelcomeKitConfig,
  type WelcomeKitItem
} from '../../services/whatsappWelcomeKitService';
import {
  doesWhatsAppNumberMatch,
  formatWhatsAppNumberDisplay
} from '../../utils/whatsappNumberUtils';
import {
  hasCommercialEnquirySignal,
  isCasualConversationOnly,
  isCustomerEnquiryLead,
  isMediaOrSystemNoise
} from '../../utils/whatsappEnquiryQualifier';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminUser } from '../../utils/leadVisibility';

interface BrowserTab {
  id: string;
  label: string;
  initialUrl: string;
  partition: string;
  isCustomLabel?: boolean;
}

interface TabRuntimeState {
  url: string;
  title: string;
  isLoading: boolean;
  isConnected: boolean;
  inChatsView?: boolean;
  unreadCount: number;
  zoom: number;
  ownPhone?: string;
  ownName?: string;
}

interface ChromeBookmark {
  id: string;
  title: string;
  url: string;
}

interface ActiveWebChatSnapshot {
  contactName: string;
  headerSubtitle: string;
  phone: string;
  pushname?: string;
  aboutText?: string;
  isGroup?: boolean;
  isSystemBot?: boolean;
  messages: Array<{ fromMe: boolean; meta: string; text: string }>;
}

interface UnreadSidebarEvent {
  contactName: string;
  pushname?: string;
  phone: string;
  previewText: string;
  timeHint?: string;
  isUnread?: boolean;
  timestamp: number;
}

interface CrmSyncFeedItem {
  id: string;
  leadId?: string;
  action: 'created' | 'updated';
  leadName: string;
  pipelineName: string;
  stageLabel: string;
  accountLabel: string;
  assignedToId?: string;
  assignedToName?: string;
  timestamp: number;
}

interface BulkScannedChat {
  key: string;
  contactName: string;
  pushname?: string;
  phone: string;
  latestText: string;
  inboundHistory: Array<{ direction: 'inbound' | 'outbound'; content: string }>;
  timestamp: number;
  timeHint?: string;
}

interface BulkScanPayload {
  requestId?: string;
  trigger?: 'qr_scan' | 'manual_range';
  mode?: 'all' | 'range';
  startDate?: string;
  endDate?: string;
  totalScanned?: number;
  chats?: BulkScannedChat[];
  error?: string;
}

const TABS_STORAGE_KEY = 'ecobill.internalChromeTabs';
const BOOKMARKS_STORAGE_KEY = 'ecobill.internalChromeBookmarks';
const SYNCED_KEYS_STORAGE_KEY = 'ecobill.waSyncedEventKeys';
const SYNC_FEED_STORAGE_KEY = 'ecobill.waDailySyncFeed';
const DEFAULT_CHROME_PARTITION = 'persist:chrome_default';

function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadPersistedSyncKeys(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SYNCED_KEYS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.slice(-600));
  } catch {
    // ignore storage read error
  }
  return new Set();
}

function persistSyncKeys(keys: Set<string>): void {
  try {
    const trimmed = Array.from(keys).slice(-600);
    window.localStorage.setItem(SYNCED_KEYS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage quota error
  }
}

function loadTodaySyncFeed(): CrmSyncFeedItem[] {
  try {
    const raw = window.localStorage.getItem(SYNC_FEED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed?.date === getTodayDateKey() && Array.isArray(parsed.items)) {
      return parsed.items;
    }
  } catch {
    // ignore storage error
  }
  return [];
}

function saveTodaySyncFeed(items: CrmSyncFeedItem[]): void {
  try {
    window.localStorage.setItem(
      SYNC_FEED_STORAGE_KEY,
      JSON.stringify({ date: getTodayDateKey(), items: items.slice(0, 50) })
    );
  } catch {
    // ignore storage error
  }
}

const DEFAULT_BOOKMARKS: ChromeBookmark[] = [
  { id: 'bm_wa', title: 'WhatsApp Web', url: 'https://web.whatsapp.com/' },
  { id: 'bm_gmail', title: 'Gmail', url: 'https://mail.google.com/' },
  { id: 'bm_indiamart', title: 'IndiaMART', url: 'https://seller.indiamart.com/' },
  { id: 'bm_google', title: 'Google', url: 'https://www.google.com/' }
];

function loadSavedTabs(): BrowserTab[] {
  try {
    const raw = window.localStorage.getItem(TABS_STORAGE_KEY) || window.localStorage.getItem('ecobill.waBrowserTabs');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t: any, i: number) => ({
          id: t.id || `tab_${i + 1}`,
          label: t.label || `WhatsApp Web ${i + 1}`,
          initialUrl: t.initialUrl || 'https://web.whatsapp.com/',
          partition: t.partition || `persist:wa_tab_${i + 1}`,
          isCustomLabel: Boolean(t.isCustomLabel ?? true)
        }));
      }
    }
  } catch {
    // ignore storage errors
  }
  return [
    {
      id: 'tab_1',
      label: 'WhatsApp Web 1',
      initialUrl: 'https://web.whatsapp.com/',
      partition: 'persist:wa_tab_1',
      isCustomLabel: true
    }
  ];
}

function loadSavedBookmarks(): ChromeBookmark[] {
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback default
  }
  return DEFAULT_BOOKMARKS;
}

function normalizeUrlInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return 'https://www.google.com/';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!/\s/.test(trimmed) && (trimmed.includes('.') || /^localhost(:\d+)?/i.test(trimmed))) {
    return /^localhost/i.test(trimmed) ? `http://${trimmed}` : `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function mapStageToInsightStage(stage: string): 'new' | 'contacted' | 'qualified' | 'lost' {
  if (stage === 'lost') return 'lost';
  if (stage === 'qualified') return 'qualified';
  if (stage === 'contacted') return 'contacted';
  return 'new';
}

function mapToCrmPipelineStage(
  text: string,
  qty: string,
  recommendedStage: string
): { pipelineStage: string; isBusinessLead: boolean } {
  const lower = (text || '').toLowerCase();
  const hasBusinessIntent =
    hasCommercialEnquirySignal(lower, { quantity: qty }) || recommendedStage === 'qualified';

  if (!hasBusinessIntent || recommendedStage === 'lost') {
    return {
      pipelineStage: recommendedStage === 'lost' ? 'lost_cancelled' : 'new_enquiry',
      isBusinessLead: recommendedStage !== 'lost' && hasBusinessIntent
    };
  }

  if (/\b(design approved|approve design|looks good.*proceed)\b/i.test(lower)) {
    return { pipelineStage: 'design_approval', isBusinessLead: true };
  }
  if (/\b(mockup|design|logo|artwork|engraving)\b/i.test(lower)) {
    return { pipelineStage: 'design_stage', isBusinessLead: true };
  }
  if (Boolean(qty) || /\b(send quotation|share quote|confirm)\b/i.test(lower)) {
    return { pipelineStage: 'requirement_confirmed', isBusinessLead: true };
  }
  return { pipelineStage: 'requirement_collection', isBusinessLead: true };
}

export function WhatsAppWebBrowserView({
  visible = true,
  onMinimize,
  onClose,
  onSummaryChange
}: {
  visible?: boolean;
  onMinimize?: () => void;
  onClose?: () => void;
  onSummaryChange?: (summary: { totalUnread: number; isAnyConnected: boolean }) => void;
}) {
  const navigate = useNavigate();
  const { dbUser } = useAuth();
  const isAdmin = isAdminUser(dbUser);
  const [tabs, setTabs] = useState<BrowserTab[]>(loadSavedTabs);
  const [activeTabId, setActiveTabId] = useState<string>(() => loadSavedTabs()[0]?.id || 'tab_1');
  const [bookmarks, setBookmarks] = useState<ChromeBookmark[]>(loadSavedBookmarks);
  const [readyPartitions, setReadyPartitions] = useState<Record<string, boolean>>({});
  const [tabStates, setTabStates] = useState<Record<string, TabRuntimeState>>({});
  const [addressBarValue, setAddressBarValue] = useState('https://web.whatsapp.com/');
  const [activeChatMap, setActiveChatMap] = useState<Record<string, ActiveWebChatSnapshot>>({});
  const [grabbedCount, setGrabbedCount] = useState(0);

  // Copilot, CRM Auto-Sync & Fullscreen state
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [showSyncFeed, setShowSyncFeed] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importingLeads, setImportingLeads] = useState(false);
  const [importProgressText, setImportProgressText] = useState('');
  const [importSummary, setImportSummary] = useState<WhatsAppImportSummary | null>(null);
  const [qrBulkSyncBanner, setQrBulkSyncBanner] = useState<string | null>(null);
  const [welcomeKitConfig, setWelcomeKitConfig] = useState<WelcomeKitConfig>(getCachedWelcomeKitConfig);
  const [showWelcomeKitModal, setShowWelcomeKitModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [sendingWelcomeKit, setSendingWelcomeKit] = useState(false);
  const [runningNoReplyCheck, setRunningNoReplyCheck] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [autoCrmEnabled, setAutoCrmEnabled] = useState<boolean>(() => getAutoCrmSyncEnabled());
  const [syncFeed, setSyncFeed] = useState<CrmSyncFeedItem[]>(loadTodaySyncFeed);
  const [activeInsight, setActiveInsight] = useState<AiLeadInsight | null>(null);
  const [crmPreview, setCrmPreview] = useState<{ pipelineName: string; stageLabel: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const webviewRefs = useRef<Record<string, ElectronWebviewElement | null>>({});
  const attachedRefs = useRef<Set<string>>(new Set());
  const ipcMessageHandlerRef = useRef<(tab: BrowserTab, event: Event) => void>(() => { });
  const syncedMsgKeysRef = useRef<Set<string>>(loadPersistedSyncKeys());
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingOfflineQueueRef = useRef<Array<() => Promise<void>>>([]);
  const activeTabIdRef = useRef(activeTabId);
  const autoCrmRef = useRef(autoCrmEnabled);
  const welcomeKitConfigRef = useRef(welcomeKitConfig);
  const welcomeKitInFlightRef = useRef<Set<string>>(new Set());
  const noReplySweepRunningRef = useRef(false);
  const noReplySweepFnRef = useRef<(cfg?: WelcomeKitConfig, manual?: boolean) => Promise<number>>(async () => 0);
  const tabsRef = useRef(tabs);
  const tabStatesRef = useRef(tabStates);
  const sendQueueByTabRef = useRef<Map<string, Promise<void>>>(new Map());
  const pendingBulkScanResolversRef = useRef<
    Map<string, { resolve: (payload: BulkScanPayload) => void; timer: ReturnType<typeof setTimeout> }>
  >(new Map());
  const pendingSendResolversRef = useRef<
    Map<
      string,
      {
        resolve: (res: { ok: boolean; error?: string; fromNumber?: string; tabLabel?: string; resolvedPhone?: string }) => void;
        timer: ReturnType<typeof setTimeout>;
        fromNumber?: string;
        tabLabel?: string;
      }
    >
  >(new Map());

  activeTabIdRef.current = activeTabId;
  autoCrmRef.current = autoCrmEnabled;
  welcomeKitConfigRef.current = welcomeKitConfig;
  tabsRef.current = tabs;
  tabStatesRef.current = tabStates;

  useEffect(() => {
    const unsub = subscribeWelcomeKitConfig((next) => {
      setWelcomeKitConfig(next);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      noReplySweepFnRef.current().catch(() => { });
    }, 15000);
    const interval = setInterval(() => {
      noReplySweepFnRef.current().catch(() => { });
    }, 5 * 60 * 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const cleanChromeUa = useMemo(() => {
    const major = (window.electronAPI?.chromeVersion || '134.0.0.0').split('.')[0];
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    return subscribeAutoCrmSyncChange((enabled) => setAutoCrmEnabled(enabled));
  }, []);

  // Subscribe to scoped leads when admin is viewing, so LeadAssignmentModal can display counts and split existing leads
  useEffect(() => {
    if (!db || !dbUser || !isAdmin) return;
    const unsub = subscribeScopedLeads(
      db,
      dbUser,
      (leads) => setAllLeads(leads),
      (err) => console.warn('[WhatsAppBrowser] Scoped leads load failed:', err)
    );
    return () => unsub();
  }, [dbUser?.id, isAdmin]);

  // Listen for stage-move or CRM automated message requests routed to a specific logged-in WhatsApp number
  const dispatchPayloadViaWebviewTab = (
    chosenTab: BrowserTab,
    payload: {
      phone?: string;
      contactName?: string;
      message?: string;
      media?: {
        bytes: Uint8Array;
        fileName: string;
        mimeType: string;
        attachmentType?: 'document' | 'image' | 'video';
      } | null;
      openOnly?: boolean;
      timeoutMs?: number;
    }
  ): Promise<{ ok: boolean; error?: string; fromNumber?: string; tabLabel?: string; resolvedPhone?: string }> => {
    return new Promise((outerResolve) => {
      const chosenTabId = chosenTab.id;
      const prevQueue = sendQueueByTabRef.current.get(chosenTabId) || Promise.resolve();

      // Serialize outbound sends per WhatsApp Web tab so concurrent automations & stage drags never collide
      const nextQueue = prevQueue
        .catch(() => { })
        .then(
          () =>
            new Promise<void>((releaseTabQueue) => {
              const webview = webviewRefs.current[chosenTabId];
              if (!webview) {
                outerResolve({ ok: false, error: 'Target WhatsApp WebView is not mounted' });
                releaseTabQueue();
                return;
              }

              const chosenState = tabStatesRef.current[chosenTabId];
              const requestId = `wa_send_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

              const finish = (res: {
                ok: boolean;
                error?: string;
                fromNumber?: string;
                tabLabel?: string;
                resolvedPhone?: string;
              }) => {
                outerResolve(res);
                releaseTabQueue();
              };

              const timer = setTimeout(() => {
                const pending = pendingSendResolversRef.current.get(requestId);
                if (pending) {
                  pendingSendResolversRef.current.delete(requestId);
                  pending.resolve({
                    ok: false,
                    error: 'Timed out waiting for WhatsApp Web tab to send message',
                    fromNumber: pending.fromNumber,
                    tabLabel: pending.tabLabel
                  });
                }
              }, payload.timeoutMs || 40000);

              pendingSendResolversRef.current.set(requestId, {
                resolve: finish,
                timer,
                fromNumber: chosenState?.ownPhone || '',
                tabLabel: chosenTab.label
              });

              try {
                webview.send('wa:send-direct-message', {
                  requestId,
                  phone: payload.phone || '',
                  contactName: payload.contactName || '',
                  message: payload.message || '',
                  media: payload.media || null,
                  openOnly: Boolean(payload.openOnly)
                });
              } catch (err: any) {
                clearTimeout(timer);
                pendingSendResolversRef.current.delete(requestId);
                finish({
                  ok: false,
                  error: err?.message || 'Failed to message WhatsApp WebView',
                  fromNumber: chosenState?.ownPhone || '',
                  tabLabel: chosenTab.label
                });
              }
            })
        );

      sendQueueByTabRef.current.set(chosenTabId, nextQueue);
    });
  };

  useEffect(() => {
    const handleSendRequest = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        targetPhone: string;
        contactName?: string;
        message: string;
        sourceWhatsappNumber?: string;
        sourceSessionId?: string;
        callback: (res: { ok: boolean; error?: string; fromNumber?: string; tabLabel?: string; resolvedPhone?: string }) => void;
      }>).detail;
      if (!detail || typeof detail.callback !== 'function') return;

      const waTabs = tabsRef.current.filter((t) => t.partition.startsWith('persist:wa_') && webviewRefs.current[t.id]);
      const connectedWaTabs = waTabs.filter((t) => tabStatesRef.current[t.id]?.isConnected);

      let chosenTab: BrowserTab | undefined;
      if (detail.sourceWhatsappNumber) {
        chosenTab =
          connectedWaTabs.find((t) =>
            doesWhatsAppNumberMatch(tabStatesRef.current[t.id]?.ownPhone, detail.sourceWhatsappNumber)
          ) ||
          connectedWaTabs.find(
            (t) =>
              t.label.replace(/\D/g, '').length >= 10 &&
              doesWhatsAppNumberMatch(t.label, detail.sourceWhatsappNumber)
          ) ||
          connectedWaTabs.find(
            (t) =>
              t.id === detail.sourceSessionId &&
              (!tabStatesRef.current[t.id]?.ownPhone ||
                doesWhatsAppNumberMatch(tabStatesRef.current[t.id]?.ownPhone, detail.sourceWhatsappNumber))
          );

        if (!chosenTab) {
          detail.callback({
            ok: false,
            error: `WhatsApp number ${formatWhatsAppNumberDisplay(detail.sourceWhatsappNumber)} is not connected in Desktop tabs`
          });
          return;
        }
      } else {
        chosenTab =
          (detail.sourceSessionId && connectedWaTabs.find((t) => t.id === detail.sourceSessionId)) ||
          connectedWaTabs.find((t) => t.id === activeTabIdRef.current) ||
          connectedWaTabs[0];

        if (!chosenTab) {
          detail.callback({ ok: false, error: 'No connected WhatsApp Web tab in Desktop Browser' });
          return;
        }
      }

      dispatchPayloadViaWebviewTab(chosenTab, {
        phone: detail.targetPhone,
        contactName: detail.contactName || '',
        message: detail.message
      }).then(detail.callback);
    };

    window.addEventListener('ecobill:wa-send-message', handleSendRequest);
    (window as any).__ecobillRemoteSendWhatsapp = (payload: {
      targetPhone: string;
      contactName?: string;
      message: string;
      sourceWhatsappNumber?: string;
      sourceSessionId?: string;
    }) =>
      new Promise<{ ok: boolean; error?: string; fromNumber?: string; tabLabel?: string; resolvedPhone?: string }>((resolve) => {
        window.dispatchEvent(
          new CustomEvent('ecobill:wa-send-message', {
            detail: { ...payload, callback: resolve }
          })
        );
      });

    return () => {
      window.removeEventListener('ecobill:wa-send-message', handleSendRequest);
      delete (window as any).__ecobillRemoteSendWhatsapp;
    };
  }, []);

  // Prepare Chromium partitions before mounting <webview>
  useEffect(() => {
    tabs.forEach((tab) => {
      if (readyPartitions[tab.partition]) return;
      const prep = window.electronAPI?.preparePartition
        ? window.electronAPI.preparePartition(tab.partition)
        : Promise.resolve({ ok: true });
      prep.then(() => {
        setReadyPartitions((prev) => ({ ...prev, [tab.partition]: true }));
      });
    });
  }, [tabs, readyPartitions]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || tabs[0],
    [tabs, activeTabId]
  );

  const activeTabState = activeTab ? tabStates[activeTab.id] : undefined;
  const activeChat = activeTab ? activeChatMap[activeTab.id] || null : null;

  // Report live WhatsApp unread & connection summary up to parent dock pill / header
  useEffect(() => {
    if (!onSummaryChange) return;
    const states = Object.values(tabStates);
    const totalUnread = states.reduce((sum, s) => sum + (s.unreadCount || 0), 0);
    const isAnyConnected = states.some((s) => s.isConnected);
    onSummaryChange({ totalUnread, isAnyConnected });
  }, [tabStates, onSummaryChange]);

  // Keep omnibox synced with active tab URL when switching tabs
  useEffect(() => {
    if (!activeTab) return;
    setAddressBarValue(tabStates[activeTab.id]?.url || activeTab.initialUrl);
  }, [activeTab?.id]);

  // Listen for links requesting a new Chrome tab (target="_blank") & Esc / Ctrl+T shortcuts
  useEffect(() => {
    const unsubNewTab = window.electronAPI?.onOpenNewTab?.((url: string) => {
      openChromeTab(url, 'New Tab');
    });
    return () => {
      unsubNewTab?.();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        openChromeTab('https://www.google.com/', 'Google');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, isFullScreen]);

  const recordSyncFeedItem = (item: CrmSyncFeedItem) => {
    setSyncFeed((prev) => {
      const next = [item, ...prev].slice(0, 50);
      saveTodaySyncFeed(next);
      return next;
    });
  };

  const enqueueAutoSync = (task: () => Promise<void>, tabId?: string) => {
    // If WhatsApp Web is currently offline or disconnected, queue task to re-run automatically when reconnected
    const isOffline = tabId ? tabStatesRef.current[tabId]?.isConnected === false : false;
    if (isOffline) {
      pendingOfflineQueueRef.current.push(task);
      return;
    }
    syncQueueRef.current = syncQueueRef.current
      .then(task)
      .catch((err) => {
        console.error('[WhatsApp Auto-CRM] Sync task failed:', err);
      });
  };

  const resolveMediaAttachment = async (source: {
    localFilePath?: string;
    fileUrl?: string;
    fileName?: string;
    mimeType?: string;
    attachmentType?: string;
  }): Promise<{
    mediaPayload: {
      bytes: Uint8Array;
      fileName: string;
      mimeType: string;
      attachmentType?: 'document' | 'image' | 'video';
    } | null;
    fallbackUrl: string;
  }> => {
    if (!source.localFilePath && !source.fileUrl) {
      return { mediaPayload: null, fallbackUrl: '' };
    }
    if (window.electronAPI?.readMediaBytes) {
      const readRes = await window.electronAPI.readMediaBytes({
        filePath: source.localFilePath,
        fileUrl: source.fileUrl,
        fileName: source.fileName,
        mimeType: source.mimeType
      });
      if (readRes.ok && readRes.bytes) {
        const inferredType =
          source.attachmentType && source.attachmentType !== 'none'
            ? (source.attachmentType as 'document' | 'image' | 'video')
            : 'document';
        return {
          mediaPayload: {
            bytes: readRes.bytes,
            fileName: readRes.fileName || source.fileName || 'attachment',
            mimeType: readRes.mimeType || source.mimeType || 'application/octet-stream',
            attachmentType: readRes.attachmentType || inferredType
          },
          fallbackUrl: ''
        };
      }
    }
    return { mediaPayload: null, fallbackUrl: source.fileUrl || '' };
  };

  const sendWelcomeKitToLead = async (params: {
    tab: BrowserTab;
    leadId?: string;
    contactName: string;
    phone: string;
    company?: string;
    quantity?: string;
    eventName?: string;
    requirement?: string;
    stageLabel?: string;
    pipelineName?: string;
    configOverride?: WelcomeKitConfig;
    forceManual?: boolean;
  }): Promise<{ sentCount: number; failedCount: number }> => {
    const cfg = params.configOverride || welcomeKitConfigRef.current;
    if (!params.forceManual && !cfg.enabled) {
      return { sentCount: 0, failedCount: 0 };
    }

    const lockKey = (params.leadId || params.phone || params.contactName || '').toLowerCase().trim();
    if (!lockKey) return { sentCount: 0, failedCount: 0 };

    if (!params.forceManual) {
      if (welcomeKitInFlightRef.current.has(lockKey)) {
        return { sentCount: 0, failedCount: 0 };
      }
      if (
        hasWelcomeKitBeenSent({
          leadId: params.leadId,
          phone: params.phone,
          contactName: params.contactName
        })
      ) {
        return { sentCount: 0, failedCount: 0 };
      }
    }

    // Acquire lock synchronously right away so concurrent unread/active-chat events never double-send
    welcomeKitInFlightRef.current.add(lockKey);

    const activeItems: WelcomeKitItem[] = [];
    if (cfg.includeStageNewEnquiry) {
      const stageNewText = await resolveStageNewEnquiryText();
      if (stageNewText) {
        activeItems.push({
          id: 'stage_new_enquiry_greeting',
          kind: 'app_template',
          title: 'Stage: New Enquiry Greeting',
          enabled: true,
          messageText: stageNewText,
          attachmentType: 'none'
        });
      }
    }

    for (const item of cfg.items || []) {
      if (!item.enabled) continue;
      if (!item.messageText?.trim() && !item.localFilePath && !item.fileUrl) continue;
      activeItems.push(item);
    }

    if (activeItems.length === 0) {
      welcomeKitInFlightRef.current.delete(lockKey);
      return { sentCount: 0, failedCount: 0 };
    }

    const sentTitles: string[] = [];
    let failedCount = 0;

    try {
      const firstHasAttachment = Boolean(activeItems[0]?.localFilePath || activeItems[0]?.fileUrl);
      if (firstHasAttachment && params.phone) {
        await dispatchPayloadViaWebviewTab(params.tab, {
          phone: params.phone,
          contactName: params.contactName,
          openOnly: true
        });
      }

      for (let i = 0; i < activeItems.length; i += 1) {
        const step = activeItems[i];
        let renderedMsg = renderWelcomeKitMessage(step.messageText || '', {
          name: params.contactName,
          phone: params.phone,
          company: params.company,
          quantity: params.quantity,
          eventName: params.eventName,
          requirement: params.requirement,
          stageLabel: params.stageLabel,
          pipelineName: params.pipelineName
        });

        const { mediaPayload, fallbackUrl } = await resolveMediaAttachment(step);
        if (fallbackUrl) {
          renderedMsg = renderedMsg ? `${renderedMsg}\n${fallbackUrl}` : fallbackUrl;
        }

        if (!renderedMsg && !mediaPayload) {
          continue;
        }

        const res = await dispatchPayloadViaWebviewTab(params.tab, {
          phone: params.phone,
          contactName: params.contactName,
          message: renderedMsg,
          media: mediaPayload,
          timeoutMs: mediaPayload ? 55000 : 38000
        });

        if (res.ok) {
          sentTitles.push(step.title);
        } else {
          failedCount += 1;
          console.warn(`[WelcomeKit] Failed step "${step.title}":`, res.error);
        }

        if (i < activeItems.length - 1) {
          await new Promise((r) => setTimeout(r, cfg.delayBetweenItemsMs || 1200));
        }
      }

      if (sentTitles.length > 0) {
        const ownPhone = tabStatesRef.current[params.tab.id]?.ownPhone || '';
        await recordWelcomeKitDeliveryToCrm({
          leadId: params.leadId,
          phone: params.phone,
          contactName: params.contactName,
          sourceWhatsappNumber: ownPhone,
          sentSummary: sentTitles
        });
        toast.success(
          `Welcome Kit auto-sent to ${params.contactName || params.phone}: ${sentTitles.join(' → ')}`,
          { duration: 5000 }
        );
      }

      return { sentCount: sentTitles.length, failedCount };
    } finally {
      welcomeKitInFlightRef.current.delete(lockKey);
    }
  };

  /**
   * Fast-track trigger: Instantly dispatches welcome message to genuine trophy enquiries
   * within ~1s without blocking on remote Gemini LLM calls or Firestore transaction queues.
   */
  const triggerFastWelcomeKitIfEnquiry = (params: {
    tab: BrowserTab;
    contactName: string;
    phone: string;
    messageText: string;
  }) => {
    const cfg = welcomeKitConfigRef.current;
    if (!cfg || !cfg.enabled) return;

    const text = (params.messageText || '').trim();
    if (!text || isMediaOrSystemNoise(text)) return;

    // Instant qualification: trophy product keywords, commercial intent, quantity, or award event signals
    const isEnquiry = hasCommercialEnquirySignal(text) || isCustomerEnquiryLead({ latestText: text });
    if (!isEnquiry) return;

    const lockKey = (params.phone || params.contactName || '').toLowerCase().trim();
    if (!lockKey) return;

    if (welcomeKitInFlightRef.current.has(lockKey)) return;
    if (hasWelcomeKitBeenSent({ phone: params.phone, contactName: params.contactName })) return;

    // Fast-track immediate dispatch without waiting for AI analysis or CRM cloud DB writes
    sendWelcomeKitToLead({
      tab: params.tab,
      contactName: params.contactName,
      phone: params.phone,
      requirement: text
    }).catch((err) => {
      console.warn('[WelcomeKit] Fast-track auto-send failed:', err);
    });
  };

  const runNoReplyTestimonialSweep = async (
    configOverride?: WelcomeKitConfig,
    isManualTrigger = false
  ): Promise<number> => {
    const cfg = configOverride || welcomeKitConfigRef.current;
    const followCfg = cfg.noReplyFollowUp;
    if (!followCfg?.enabled || noReplySweepRunningRef.current) return 0;

    const waTabs = tabsRef.current.filter(
      (t) => t.partition.startsWith('persist:wa_') && webviewRefs.current[t.id]
    );
    const connectedTabs = waTabs.filter((t) => tabStatesRef.current[t.id]?.isConnected);
    if (connectedTabs.length === 0) {
      if (isManualTrigger) {
        toast.error('Connect at least one WhatsApp Web tab before sending follow-ups.');
      }
      return 0;
    }

    const kitTestimonialItem = (cfg.items || []).find((it) => it.kind === 'testimonial_video');
    const videoSource = followCfg.useTestimonialKitItem && kitTestimonialItem
      ? {
        localFilePath: kitTestimonialItem.localFilePath,
        fileUrl: kitTestimonialItem.fileUrl,
        fileName: kitTestimonialItem.fileName,
        mimeType: kitTestimonialItem.mimeType,
        attachmentType: kitTestimonialItem.attachmentType
      }
      : {
        localFilePath: followCfg.localFilePath,
        fileUrl: followCfg.fileUrl,
        fileName: followCfg.fileName,
        mimeType: followCfg.mimeType,
        attachmentType: followCfg.attachmentType
      };

    const hasVideoSource = Boolean(videoSource.localFilePath || videoSource.fileUrl);
    if (!hasVideoSource && !followCfg.messageText?.trim()) {
      if (isManualTrigger) {
        toast.error('Attach a Testimonial Video or enter follow-up text first.');
      }
      return 0;
    }

    noReplySweepRunningRef.current = true;
    if (isManualTrigger) setRunningNoReplyCheck(true);

    let sentTotal = 0;
    try {
      const dueLeads = await findDueNoReplyLeadsForTestimonial(followCfg, 5);
      if (dueLeads.length === 0) {
        if (isManualTrigger) {
          toast('No silent WhatsApp leads found waiting past the selected days.');
        }
        return 0;
      }

      // Read testimonial video bytes once for all overdue leads in this sweep
      const { mediaPayload, fallbackUrl: fallbackMediaUrl } = hasVideoSource
        ? await resolveMediaAttachment({
          ...videoSource,
          fileName: videoSource.fileName || 'testimonial-video.mp4',
          mimeType: videoSource.mimeType || 'video/mp4',
          attachmentType: videoSource.attachmentType || 'video'
        })
        : { mediaPayload: null, fallbackUrl: '' };

      for (const lead of dueLeads) {
        const chosenTab =
          (lead.sourceWhatsappNumber &&
            connectedTabs.find((t) =>
              doesWhatsAppNumberMatch(tabStatesRef.current[t.id]?.ownPhone, lead.sourceWhatsappNumber)
            )) ||
          (lead.sourceSessionId && connectedTabs.find((t) => t.id === lead.sourceSessionId)) ||
          connectedTabs.find((t) => t.id === activeTabIdRef.current) ||
          connectedTabs[0];

        if (!chosenTab) continue;

        let msg = renderWelcomeKitMessage(followCfg.messageText || '', {
          name: lead.name,
          phone: lead.phone,
          company: lead.company,
          quantity: lead.quantity,
          eventName: lead.eventName,
          requirement: lead.requirement,
          stageLabel: lead.stageLabel
        });
        if (fallbackMediaUrl) {
          msg = msg ? `${msg}\n${fallbackMediaUrl}` : fallbackMediaUrl;
        }
        if (!msg && !mediaPayload) continue;

        if (mediaPayload && lead.phone) {
          await dispatchPayloadViaWebviewTab(chosenTab, {
            phone: lead.phone,
            contactName: lead.name,
            openOnly: true
          });
        }

        const res = await dispatchPayloadViaWebviewTab(chosenTab, {
          phone: lead.phone,
          contactName: lead.name,
          message: msg,
          media: mediaPayload,
          timeoutMs: mediaPayload ? 55000 : 38000
        });

        if (res.ok) {
          sentTotal += 1;
          const ownPhone = tabStatesRef.current[chosenTab.id]?.ownPhone || lead.sourceWhatsappNumber || '';
          await recordNoReplyFollowupDelivery({
            leadId: lead.leadId,
            phone: lead.phone,
            contactName: lead.name,
            sourceWhatsappNumber: ownPhone,
            silentHours: lead.silentHours,
            afterDays: followCfg.afterDays,
            videoLabel: mediaPayload?.fileName || videoSource.fileName || 'Testimonial Video'
          });
          toast.success(
            `Testimonial Video auto-sent to ${lead.name} (no reply for ${followCfg.afterDays}d)`
          );
        }

        await new Promise((r) => setTimeout(r, 1800));
      }

      if (isManualTrigger && sentTotal === 0) {
        toast('Could not deliver follow-ups right now. Check chat readiness.');
      }

      return sentTotal;
    } finally {
      noReplySweepRunningRef.current = false;
      if (isManualTrigger) setRunningNoReplyCheck(false);
    }
  };

  noReplySweepFnRef.current = runNoReplyTestimonialSweep;

  const processExtractedTextToCrm = async (params: {
    tab: BrowserTab;
    contactName: string;
    pushname?: string;
    phone: string;
    latestText: string;
    history: Array<{ direction: 'inbound' | 'outbound'; content: string }>;
    isAutoTriggered: boolean;
    updateActiveDrawer: boolean;
    isUnreadHint?: boolean;
    messageTimestamp?: number;
    bypassAutoCrmGate?: boolean;
    suppressToast?: boolean;
    triggeredBy?: 'auto' | 'manual';
    triggerWelcomeKit?: boolean;
  }): Promise<{ insight: AiLeadInsight; outcome?: CrmSyncOutcome }> => {
    const aiRes = await analyzeIncomingWhatsAppMessage(
      params.latestText,
      params.phone,
      params.contactName,
      params.history
    );

    const inboundHistoryText =
      params.history
        .filter((h) => h.direction === 'inbound')
        .map((h) => h.content)
        .join('\n') || params.latestText;
    const qty = aiRes.extracted_details.quantity || '';
    const mapped = mapToCrmPipelineStage(
      inboundHistoryText,
      qty,
      aiRes.recommended_pipeline_stage
    );

    const isBusinessLead = isCustomerEnquiryLead({
      latestText: params.latestText,
      combinedText: inboundHistoryText,
      quantity: qty,
      budget: aiRes.extracted_details.budget || '',
      aiIsBusinessLead: aiRes.is_business_lead,
      aiClassification: aiRes.classification,
      aiQualificationStatus: aiRes.qualification_status,
      aiRecommendedStage: aiRes.recommended_pipeline_stage
    });

    const insight: AiLeadInsight = {
      leadName: params.pushname || aiRes.extracted_details.name || (params.phone ? `+${params.phone}` : 'WhatsApp Lead'),
      company: aiRes.extracted_details.company || '',
      phone: params.phone || aiRes.extracted_details.phone || '',
      email: aiRes.extracted_details.email || '',
      location: aiRes.extracted_details.location || '',
      requirement: aiRes.extracted_details.requirement || params.latestText,
      quantity: qty,
      budget: aiRes.extracted_details.budget || '',
      trophyType: (aiRes.extracted_details as any)?.trophy_type || '',
      trophySize: (aiRes.extracted_details as any)?.trophy_size || '',
      eventName: (aiRes.extracted_details as any)?.event_name || '',
      eventDate: (aiRes.extracted_details as any)?.event_date || '',
      deliveryDate: (aiRes.extracted_details as any)?.delivery_date || '',
      urgency: aiRes.extracted_details.urgency || 'medium',
      stage: mapStageToInsightStage(aiRes.recommended_pipeline_stage),
      pipelineStage: mapped.pipelineStage,
      isBusinessLead,
      suggestedAction: aiRes.extracted_details.recommended_next_action || 'Follow up with lead',
      suggestedReply: aiRes.suggested_reply || '',
      flagForReview: Boolean(aiRes.flag_for_review || (aiRes.confidence_score && aiRes.confidence_score < 0.7)),
      confidenceScore: aiRes.confidence_score,
      analyzedAt: Date.now()
    };

    const preview = await previewCrmPipelineAndStage(insight, inboundHistoryText);

    if (params.updateActiveDrawer && params.tab.id === activeTabIdRef.current) {
      setActiveInsight(insight);
      setCrmPreview({ pipelineName: preview.pipelineName, stageLabel: preview.stageLabel });
    }

    let outcome: CrmSyncOutcome | undefined;

    // Even when a message lacks buying keywords on its own, syncWhatsAppLeadToCrm checks existing CRM records:
    // - If contact EXISTS in CRM/Pipeline -> updates existing lead with latest reply (no duplicate)
    // - If contact is NEW & non-business -> skips creating a lead cleanly
    if (
      params.isAutoTriggered &&
      (params.bypassAutoCrmGate || autoCrmRef.current) &&
      aiRes.classification !== 'spam'
    ) {
      const remoteKey = params.phone ? `${params.phone}@s.whatsapp.net` : params.contactName;
      const tabState = tabStatesRef.current[params.tab.id];
      const ownPhone = tabState?.ownPhone || '';
      const formattedOwn = formatWhatsAppNumberDisplay(ownPhone);
      outcome = await syncWhatsAppLeadToCrm({
        sessionId: params.tab.id,
        sessionLabel: params.tab.isCustomLabel ? params.tab.label : formattedOwn || params.tab.label,
        sourceWhatsappNumber: ownPhone,
        remoteJid: remoteKey,
        phone: params.phone,
        name: params.contactName,
        pushname: params.pushname,
        messageText: params.latestText,
        insight,
        forceCreate: false,
        triggeredBy: params.triggeredBy || 'auto',
        messageTimestamp: params.messageTimestamp
      });

      if (outcome.action === 'created') {
        setGrabbedCount((c) => c + 1);
        recordSyncFeedItem({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          leadId: outcome.leadId,
          action: 'created',
          leadName: outcome.leadName,
          pipelineName: outcome.pipelineName,
          stageLabel: outcome.stageLabel,
          accountLabel: params.tab.label,
          assignedToId: outcome.assignedToId,
          assignedToName: outcome.assignedToName,
          timestamp: Date.now()
        });
        if (!params.suppressToast) {
          toast.success(
            `New WhatsApp Lead: ${outcome.leadName} → ${outcome.pipelineName} (${outcome.stageLabel})${isAdmin && outcome.assignedToName ? ` • Assigned: ${outcome.assignedToName}` : ''}`,
            { duration: 5000 }
          );
        }
        if (params.triggerWelcomeKit && welcomeKitConfigRef.current.enabled) {
          const lockKey = (outcome.leadId || params.phone || params.contactName || '').toLowerCase().trim();
          const phoneKey = params.phone || insight.phone;
          const nameKey = outcome.leadName || params.contactName;

          if (
            hasWelcomeKitBeenSent({ leadId: outcome.leadId, phone: phoneKey, contactName: nameKey }) ||
            welcomeKitInFlightRef.current.has(lockKey)
          ) {
            recordWelcomeKitDeliveryToCrm({
              leadId: outcome.leadId,
              phone: phoneKey,
              contactName: nameKey,
              sourceWhatsappNumber: tabStatesRef.current[params.tab.id]?.ownPhone || '',
              sentSummary: ['Welcome Kit (Fast-Track)']
            }).catch(() => { });
          } else {
            sendWelcomeKitToLead({
              tab: params.tab,
              leadId: outcome.leadId,
              contactName: nameKey,
              phone: phoneKey,
              company: insight.company,
              quantity: insight.quantity,
              eventName: insight.eventName,
              requirement: insight.requirement,
              stageLabel: outcome.stageLabel,
              pipelineName: outcome.pipelineName
            }).catch((err) => {
              console.warn('[WelcomeKit] Auto-send failed:', err);
            });
          }
        }
      } else if (outcome.action === 'updated') {
        setGrabbedCount((c) => c + 1);
        recordSyncFeedItem({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          leadId: outcome.leadId,
          action: 'updated',
          leadName: outcome.leadName,
          pipelineName: outcome.pipelineName,
          stageLabel: outcome.stageLabel,
          accountLabel: params.tab.label,
          timestamp: Date.now()
        });
        if (!params.suppressToast) {
          toast.success(
            `Updated Existing Lead: ${outcome.leadName} (${outcome.pipelineName} • ${outcome.stageLabel})`,
            { duration: 4000 }
          );
        }
      } else if (outcome.action === 'skipped' && outcome.reason?.includes('Waiting for user confirmation')) {
        window.dispatchEvent(
          new CustomEvent('ecobill:whatsapp-confirm-lead', {
            detail: {
              sessionId: params.tab.id,
              sessionLabel: params.tab.isCustomLabel ? params.tab.label : formattedOwn || params.tab.label,
              remoteJid: remoteKey,
              phone: params.phone,
              name: params.pushname || params.contactName,
              messageText: params.latestText,
              insight,
              messageTimestamp: params.messageTimestamp || Date.now()
            }
          })
        );
        if (!params.suppressToast) {
          toast(
            `Is this a lead? Confirmation requested for ${params.pushname || params.contactName || params.phone}`,
            { icon: '❓', duration: 6000 }
          );
        }
      }
    }

    return { insight, outcome };
  };

  const processScannedChatsBatch = async (
    tab: BrowserTab,
    chats: BulkScannedChat[],
    opts: {
      trigger: 'qr_scan' | 'manual_range';
      totalScanned?: number;
      onProgress?: (text: string) => void;
    }
  ): Promise<WhatsAppImportSummary> => {
    const candidates = chats.filter((c) => {
      const combined = c.inboundHistory.map((h) => h.content).join('\n') || c.latestText;
      if (isMediaOrSystemNoise(c.latestText) && !hasCommercialEnquirySignal(combined)) return false;
      if (isCasualConversationOnly(combined)) return false;
      return true;
    });

    const summary: WhatsAppImportSummary = {
      scanned: Math.max(opts.totalScanned || 0, chats.length),
      qualified: 0,
      created: 0,
      updated: 0,
      skipped: Math.max(0, chats.length - candidates.length)
    };

    const concurrency = 3;
    for (let i = 0; i < candidates.length; i += concurrency) {
      const slice = candidates.slice(i, i + concurrency);
      opts.onProgress?.(
        `Analyzing ${Math.min(i + slice.length, candidates.length)} of ${candidates.length} chat(s) from ${tab.label}...`
      );
      const results = await Promise.all(
        slice.map((chat) =>
          processExtractedTextToCrm({
            tab,
            contactName: chat.contactName,
            pushname: chat.pushname,
            phone: chat.phone,
            latestText: chat.latestText,
            history:
              chat.inboundHistory.length > 0
                ? chat.inboundHistory
                : [{ direction: 'inbound', content: chat.latestText }],
            isAutoTriggered: true,
            updateActiveDrawer: false,
            messageTimestamp: chat.timestamp,
            bypassAutoCrmGate: true,
            suppressToast: true,
            triggeredBy: opts.trigger === 'manual_range' ? 'manual' : 'auto'
          }).catch(() => null)
        )
      );

      for (const res of results) {
        if (!res) {
          summary.skipped += 1;
          continue;
        }
        if (res.insight.isBusinessLead) {
          summary.qualified += 1;
        }
        if (res.outcome?.action === 'created') {
          summary.created += 1;
        } else if (res.outcome?.action === 'updated') {
          summary.updated += 1;
        } else {
          summary.skipped += 1;
        }
      }
    }

    return summary;
  };

  const handleStartBulkImport = async (opts: {
    mode: 'range' | 'all';
    startDate?: string;
    endDate?: string;
    accountId: string;
  }) => {
    const waTabs = tabsRef.current.filter(
      (t) => t.partition.startsWith('persist:wa_') && webviewRefs.current[t.id]
    );
    const connectedTabs = waTabs.filter((t) => tabStatesRef.current[t.id]?.isConnected);
    const targetTabs =
      opts.accountId === 'all'
        ? connectedTabs
        : connectedTabs.filter((t) => t.id === opts.accountId);

    if (targetTabs.length === 0) {
      toast.error('No connected WhatsApp Web tab found. Please scan QR code first.');
      return;
    }

    setImportingLeads(true);
    setImportSummary(null);
    const totalSummary: WhatsAppImportSummary = {
      scanned: 0,
      qualified: 0,
      created: 0,
      updated: 0,
      skipped: 0
    };

    try {
      for (const tab of targetTabs) {
        const wv = webviewRefs.current[tab.id];
        if (!wv) continue;

        setImportProgressText(`Scanning ${tab.label} chat history...`);
        const requestId = `bulk_${tab.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const payload = await new Promise<BulkScanPayload>((resolve) => {
          const timer = setTimeout(() => {
            pendingBulkScanResolversRef.current.delete(requestId);
            resolve({ requestId, chats: [], totalScanned: 0, error: 'Scan timed out' });
          }, 30000);

          pendingBulkScanResolversRef.current.set(requestId, { resolve, timer });
          wv.send('wa:scan-chats-for-import', {
            requestId,
            mode: opts.mode,
            startDate: opts.startDate,
            endDate: opts.endDate,
            trigger: 'manual_range'
          });
        });

        if (payload.error) {
          toast.error(`${tab.label}: ${payload.error}`);
          continue;
        }

        const tabSummary = await processScannedChatsBatch(tab, payload.chats || [], {
          trigger: 'manual_range',
          totalScanned: payload.totalScanned,
          onProgress: (txt) => setImportProgressText(txt)
        });

        totalSummary.scanned += tabSummary.scanned;
        totalSummary.qualified += tabSummary.qualified;
        totalSummary.created += tabSummary.created;
        totalSummary.updated += tabSummary.updated;
        totalSummary.skipped += tabSummary.skipped;
      }

      setImportSummary(totalSummary);
      if (totalSummary.created > 0 || totalSummary.updated > 0) {
        toast.success(
          `Pipeline Import: Added ${totalSummary.created} new lead(s), updated ${totalSummary.updated}.`,
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

  // Always keep latest IPC handler in a ref so Vite HMR updates & state changes take effect without re-attaching webview listeners
  ipcMessageHandlerRef.current = async (tab: BrowserTab, event: Event) => {
    const ipcEv = event as unknown as { channel: string; args: any[] };
    if (ipcEv.channel === 'wa:status') {
      const statusPayload = ipcEv.args?.[0] as
        | { isConnected: boolean; inChatsView?: boolean; unreadCount: number; ownPhone?: string; ownName?: string }
        | undefined;
      if (statusPayload) {
        if (statusPayload.isConnected && pendingOfflineQueueRef.current.length > 0) {
          const backlog = pendingOfflineQueueRef.current.splice(0);
          backlog.forEach((t) => enqueueAutoSync(t, tab.id));
        }
        setTabStates((prev) => ({
          ...prev,
          [tab.id]: {
            url: prev[tab.id]?.url || tab.initialUrl,
            title: prev[tab.id]?.title || tab.label,
            isLoading: false,
            isConnected: statusPayload.isConnected,
            inChatsView: statusPayload.inChatsView ?? prev[tab.id]?.inChatsView,
            unreadCount: statusPayload.unreadCount,
            zoom: prev[tab.id]?.zoom || 1,
            ownPhone: statusPayload.ownPhone || prev[tab.id]?.ownPhone,
            ownName: statusPayload.ownName || prev[tab.id]?.ownName
          }
        }));
      }
    } else if (ipcEv.channel === 'wa:send-result') {
      const resultPayload = ipcEv.args?.[0] as { requestId?: string; ok?: boolean; error?: string; resolvedPhone?: string } | undefined;
      if (resultPayload?.requestId) {
        const pending = pendingSendResolversRef.current.get(resultPayload.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingSendResolversRef.current.delete(resultPayload.requestId);
          pending.resolve({
            ok: Boolean(resultPayload.ok),
            error: resultPayload.error,
            fromNumber: pending.fromNumber,
            tabLabel: pending.tabLabel,
            resolvedPhone: resultPayload.resolvedPhone
          });
        }
      }
    } else if (ipcEv.channel === 'wa:active-chat') {
      const snapshot = ipcEv.args?.[0] as ActiveWebChatSnapshot | null;
      if (!snapshot || !snapshot.contactName) return;
      setActiveChatMap((prev) => ({ ...prev, [tab.id]: snapshot }));

      if (snapshot.isGroup || snapshot.isSystemBot) return;

      const inbound = snapshot.messages.filter((m) => !m.fromMe);
      const lastInbound = inbound[inbound.length - 1];
      if (!lastInbound?.text || isMediaOrSystemNoise(lastInbound.text)) return;

      // FAST-TRACK: Instantly dispatch welcome message to new customer enquiry within ~1s
      triggerFastWelcomeKitIfEnquiry({
        tab,
        contactName: snapshot.contactName,
        phone: snapshot.phone,
        messageText: lastInbound.text
      });

      if (!autoCrmRef.current) return;

      const contactIdentity = (snapshot.phone || snapshot.contactName).toLowerCase().trim();
      const timeMatch = String(lastInbound.meta || '').match(/\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?/i)?.[0] || '';
      const syncKey = `${getTodayDateKey()}::${contactIdentity}::${timeMatch}::${lastInbound.text.trim().slice(0, 120)}`;
      if (!syncedMsgKeysRef.current.has(syncKey)) {
        syncedMsgKeysRef.current.add(syncKey);
        enqueueAutoSync(async () => {
          try {
            await processExtractedTextToCrm({
              tab,
              contactName: snapshot.contactName,
              pushname: snapshot.pushname,
              phone: snapshot.phone,
              latestText: lastInbound.text,
              history: snapshot.messages.slice(-6).map((m) => ({
                direction: m.fromMe ? 'outbound' : 'inbound',
                content: m.text
              })),
              isAutoTriggered: true,
              updateActiveDrawer: true,
              triggerWelcomeKit: true
            });
            persistSyncKeys(syncedMsgKeysRef.current);
          } catch (err) {
            syncedMsgKeysRef.current.delete(syncKey);
            throw err;
          }
        }, tab.id);
      }
    } else if (ipcEv.channel === 'wa:unread-event') {
      const unreadEv = ipcEv.args?.[0] as UnreadSidebarEvent | undefined;
      if (!unreadEv?.contactName || !unreadEv.previewText || isMediaOrSystemNoise(unreadEv.previewText)) return;

      // FAST-TRACK: Instantly dispatch welcome message to new customer enquiry within ~1s
      triggerFastWelcomeKitIfEnquiry({
        tab,
        contactName: unreadEv.contactName,
        phone: unreadEv.phone,
        messageText: unreadEv.previewText
      });

      if (!autoCrmRef.current) return;

      const contactIdentity = (unreadEv.phone || unreadEv.contactName).toLowerCase().trim();
      const timeKey = String(unreadEv.timeHint || '').trim();
      const syncKey = `${getTodayDateKey()}::${contactIdentity}::${timeKey}::${unreadEv.previewText.trim().slice(0, 120)}`;
      if (syncedMsgKeysRef.current.has(syncKey)) return;
      syncedMsgKeysRef.current.add(syncKey);

      enqueueAutoSync(async () => {
        try {
          await processExtractedTextToCrm({
            tab,
            contactName: unreadEv.contactName,
            pushname: unreadEv.pushname,
            phone: unreadEv.phone,
            latestText: unreadEv.previewText,
            history: [{ direction: 'inbound', content: unreadEv.previewText }],
            isAutoTriggered: true,
            updateActiveDrawer: false,
            triggerWelcomeKit: true
          });
          persistSyncKeys(syncedMsgKeysRef.current);
        } catch (err) {
          syncedMsgKeysRef.current.delete(syncKey);
          throw err;
        }
      }, tab.id);
    } else if (ipcEv.channel === 'wa:bulk-scan-started') {
      const startPayload = ipcEv.args?.[0] as { trigger?: string } | undefined;
      if (startPayload?.trigger === 'qr_scan') {
        setQrBulkSyncBanner(`QR Linked (${tab.label}): Scanning all existing chats to add leads into Pipeline...`);
        toast('WhatsApp linked! Scanning existing chats for pipeline leads...', { duration: 4000 });
      }
    } else if (ipcEv.channel === 'wa:bulk-chats-scanned') {
      const bulkPayload = (ipcEv.args?.[0] || {}) as BulkScanPayload;
      if (bulkPayload.requestId && pendingBulkScanResolversRef.current.has(bulkPayload.requestId)) {
        const pending = pendingBulkScanResolversRef.current.get(bulkPayload.requestId)!;
        clearTimeout(pending.timer);
        pendingBulkScanResolversRef.current.delete(bulkPayload.requestId);
        pending.resolve(bulkPayload);
        return;
      }

      if (bulkPayload.trigger === 'qr_scan') {
        const scannedList = Array.isArray(bulkPayload.chats) ? bulkPayload.chats : [];
        setQrBulkSyncBanner(
          `QR Sync (${tab.label}): Qualifying ${scannedList.length} existing chat(s) for CRM Pipeline...`
        );
        enqueueAutoSync(async () => {
          try {
            const summary = await processScannedChatsBatch(tab, scannedList, {
              trigger: 'qr_scan',
              totalScanned: bulkPayload.totalScanned
            });
            if (summary.created > 0 || summary.updated > 0) {
              toast.success(
                `QR Scan Sync (${tab.label}): Added ${summary.created} new lead(s), updated ${summary.updated} in Pipeline.`,
                { duration: 6000 }
              );
            } else if (summary.scanned > 0) {
              toast(`QR Scan Sync (${tab.label}): Scanned ${summary.scanned} chat(s), existing leads are up to date.`);
            }
          } finally {
            setQrBulkSyncBanner(null);
          }
        });
      }
    }
  };

  const attachWebviewListeners = (tab: BrowserTab, el: HTMLElement | null) => {
    const wv = el as ElectronWebviewElement | null;
    webviewRefs.current[tab.id] = wv;
    if (!wv || attachedRefs.current.has(tab.id)) return;
    attachedRefs.current.add(tab.id);

    const updateTabState = (patch: Partial<TabRuntimeState>) => {
      setTabStates((prev) => ({
        ...prev,
        [tab.id]: {
          url: prev[tab.id]?.url || tab.initialUrl,
          title: prev[tab.id]?.title || tab.label,
          isLoading: prev[tab.id]?.isLoading || false,
          isConnected: prev[tab.id]?.isConnected || false,
          unreadCount: prev[tab.id]?.unreadCount || 0,
          zoom: prev[tab.id]?.zoom || 1,
          ownPhone: prev[tab.id]?.ownPhone,
          ownName: prev[tab.id]?.ownName,
          ...patch
        }
      }));
    };

    const syncUrlState = (url?: string) => {
      const currentUrl = url || wv.getURL?.() || tab.initialUrl;
      updateTabState({ url: currentUrl });
      if (tab.id === activeTabIdRef.current) {
        setAddressBarValue(currentUrl);
      }
    };

    wv.addEventListener('did-start-loading', () => {
      updateTabState({ isLoading: true });
    });

    wv.addEventListener('did-stop-loading', () => {
      updateTabState({ isLoading: false });
    });

    wv.addEventListener('did-navigate', (e: Event) => {
      syncUrlState((e as unknown as { url?: string }).url);
    });

    wv.addEventListener('did-navigate-in-page', (e: Event) => {
      syncUrlState((e as unknown as { url?: string }).url);
    });

    wv.addEventListener('page-title-updated', (e: Event) => {
      const pageTitle = (e as unknown as { title?: string }).title || '';
      if (!pageTitle) return;
      updateTabState({ title: pageTitle });
    });

    wv.addEventListener('ipc-message', (event: Event) => {
      ipcMessageHandlerRef.current(tab, event);
    });
  };

  const openWhatsAppTab = () => {
    const suffix = Date.now().toString(36);
    const id = `wa_${suffix}`;
    const waCount = tabs.filter((t) => t.partition.startsWith('persist:wa_')).length + 1;
    const newTab: BrowserTab = {
      id,
      label: `WhatsApp Web ${waCount}`,
      initialUrl: 'https://web.whatsapp.com/',
      partition: `persist:wa_${suffix}`,
      isCustomLabel: true
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  };

  const openChromeTab = (url = 'https://www.google.com/', label = 'Google') => {
    const suffix = Date.now().toString(36);
    const id = `tab_${suffix}`;
    const newTab: BrowserTab = {
      id,
      label,
      initialUrl: url,
      partition: DEFAULT_CHROME_PARTITION,
      isCustomLabel: false
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);
  };

  const handleCloseTab = async (tab: BrowserTab, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;

    const isWaTab = tab.partition.startsWith('persist:wa_');
    if (isWaTab) {
      const confirmed = window.confirm(
        `Close "${tab.label}" and sign out this WhatsApp number session?`
      );
      if (!confirmed) return;
      await window.electronAPI?.clearPartition(tab.partition);
    }

    attachedRefs.current.delete(tab.id);
    delete webviewRefs.current[tab.id];

    const remaining = tabs.filter((t) => t.id !== tab.id);
    setTabs(remaining);
    if (activeTabId === tab.id) {
      setActiveTabId(remaining[0].id);
    }
  };

  const handleRenameTab = (tab: BrowserTab) => {
    const nextName = window.prompt('Rename Tab:', tab.label);
    if (!nextName || !nextName.trim()) return;
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id ? { ...t, label: nextName.trim(), isCustomLabel: true } : t))
    );
  };

  const navigateActiveTabTo = (rawUrl: string) => {
    const targetUrl = normalizeUrlInput(rawUrl);
    setAddressBarValue(targetUrl);
    const wv = activeTab ? webviewRefs.current[activeTab.id] : null;
    if (wv?.loadURL) {
      wv.loadURL(targetUrl).catch(() => { });
    }
  };

  const handleToggleBookmark = () => {
    const currentUrl = activeTabState?.url || addressBarValue;
    if (!currentUrl) return;
    const exists = bookmarks.some((b) => b.url === currentUrl);
    if (exists) {
      setBookmarks((prev) => prev.filter((b) => b.url !== currentUrl));
      toast.success('Removed bookmark');
    } else {
      const title =
        activeTabState?.title?.replace(/\(\d+\)\s*/, '').slice(0, 22) ||
        new URL(currentUrl).hostname.replace(/^www\./, '');
      setBookmarks((prev) => [...prev, { id: `bm_${Date.now()}`, title, url: currentUrl }]);
      toast.success(`Bookmarked ${title}`);
    }
  };

  const handleAdjustZoom = (delta: number) => {
    if (!activeTab) return;
    const wv = webviewRefs.current[activeTab.id];
    const currentZoom = tabStates[activeTab.id]?.zoom || 1;
    const nextZoom = Math.min(1.5, Math.max(0.7, Number((currentZoom + delta).toFixed(2))));
    wv?.setZoomFactor?.(nextZoom);
    setTabStates((prev) => ({
      ...prev,
      [activeTab.id]: {
        ...(prev[activeTab.id] || {
          url: activeTab.initialUrl,
          title: activeTab.label,
          isLoading: false,
          isConnected: false,
          unreadCount: 0,
          zoom: 1
        }),
        zoom: nextZoom
      }
    }));
  };

  const handleAnalyzeCurrentChat = async () => {
    if (!activeTab) return;
    const wv = webviewRefs.current[activeTab.id];
    wv?.send('wa:request-snapshot');

    if (!activeChat) {
      toast('Open a WhatsApp conversation first to grab & extract lead details.');
      return;
    }

    const inbound = activeChat.messages.filter((m) => !m.fromMe);
    const targetMsg = inbound[inbound.length - 1] || activeChat.messages[activeChat.messages.length - 1];
    if (!targetMsg?.text) return;

    setAnalyzing(true);
    try {
      await processExtractedTextToCrm({
        tab: activeTab,
        contactName: activeChat.contactName,
        pushname: activeChat.pushname,
        phone: activeChat.phone,
        latestText: targetMsg.text,
        history: activeChat.messages.slice(-6).map((m) => ({
          direction: m.fromMe ? 'outbound' : 'inbound',
          content: m.text
        })),
        isAutoTriggered: false,
        updateActiveDrawer: true
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveToCrm = async (override?: { name?: string; company?: string }) => {
    if (!activeTab || !activeInsight) return;
    const lastText =
      activeChat?.messages[activeChat.messages.length - 1]?.text || activeInsight.requirement;
    const remoteKey = activeChat?.phone
      ? `${activeChat.phone}@s.whatsapp.net`
      : activeChat?.contactName || activeInsight.leadName;

    const contactName = override?.name?.trim() || activeChat?.pushname || activeChat?.contactName || activeInsight.leadName;
    const contactCompany = override?.company?.trim() || activeInsight.company || '';

    try {
      const tabState = tabStatesRef.current[activeTab.id];
      const ownPhone = tabState?.ownPhone || '';
      const formattedOwn = formatWhatsAppNumberDisplay(ownPhone);
      const outcome = await syncWhatsAppLeadToCrm({
        sessionId: activeTab.id,
        sessionLabel: activeTab.isCustomLabel ? activeTab.label : formattedOwn || activeTab.label,
        sourceWhatsappNumber: ownPhone,
        remoteJid: remoteKey,
        phone: activeChat?.phone || activeInsight.phone,
        name: contactName,
        pushname: activeChat?.pushname,
        messageText: lastText,
        insight: {
          ...activeInsight,
          leadName: contactName,
          company: contactCompany,
          isBusinessLead: true
        },
        forceCreate: true,
        triggeredBy: 'manual'
      });
      setCrmPreview({ pipelineName: outcome.pipelineName, stageLabel: outcome.stageLabel });
      if (outcome.action === 'created' || outcome.action === 'updated') {
        recordSyncFeedItem({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          leadId: outcome.leadId,
          action: outcome.action,
          leadName: outcome.leadName,
          pipelineName: outcome.pipelineName,
          stageLabel: outcome.stageLabel,
          accountLabel: activeTab.label,
          timestamp: Date.now()
        });
      }
      setSaveSuccess(true);
      toast.success(
        outcome.action === 'updated'
          ? `Lead updated in ${outcome.pipelineName} (${outcome.stageLabel})`
          : `Lead added to ${outcome.pipelineName} (${outcome.stageLabel})`
      );
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {
      toast.error('Could not save lead to CRM. Check permissions.');
    }
  };

  const handleDraftQuotation = () => {
    if (!activeInsight) return;
    const params = new URLSearchParams({
      leadName: activeInsight.leadName || activeChat?.contactName || '',
      phone: activeInsight.phone || activeChat?.phone || '',
      company: activeInsight.company || '',
      requirement: activeInsight.requirement || '',
      quantity: activeInsight.quantity || '1',
      budget: activeInsight.budget || ''
    });
    setIsFullScreen(false);
    navigate(`/quotations/new?${params.toString()}`);
  };

  const handleCopySuggestedReply = async (reply: string) => {
    if (!reply) return;
    try {
      await navigator.clipboard.writeText(reply);
      toast.success('Suggested reply copied! Paste (Ctrl+V) in WhatsApp Web to send.');
    } catch {
      toast.error('Clipboard copy failed.');
    }
  };

  const activeWv = activeTab ? webviewRefs.current[activeTab.id] : null;
  const currentUrl = activeTabState?.url || addressBarValue || '';
  const isCurrentWhatsApp = currentUrl.startsWith('https://web.whatsapp.com');
  const isBookmarked = bookmarks.some((b) => b.url === currentUrl);

  const rootContainerClass = !visible
    ? 'fixed -left-[9999px] top-0 w-[1280px] h-[800px] opacity-0 pointer-events-none'
    : isFullScreen
      ? 'fixed inset-0 z-50 bg-surface p-1.5 flex flex-col space-y-1.5'
      : 'flex flex-col flex-1 w-full h-full min-h-0 space-y-1.5';

  return (
    <div className={rootContainerClass}>
      {/* Compact Internal Chrome Top Strip: Multi-Tabs + Omnibox + Quick Controls */}
      <div className="bg-surface rounded-card shadow-neo-raised overflow-hidden shrink-0">
        {/* Row 1: Browser Tab Strip + Mobile-First Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 px-2 pt-1.5 pb-1 border-b border-shadow-dark">
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto pb-0.5 sm:pb-0">
            {tabs.map((tab) => {
              const isSelected = tab.id === activeTab?.id;
              const st = tabStates[tab.id];
              const isWaPartition = tab.partition.startsWith('persist:wa_');
              const displayLabel = tab.isCustomLabel ? tab.label : st?.title || tab.label;

              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  onDoubleClick={() => handleRenameTab(tab)}
                  title={
                    isWaPartition && st?.ownPhone
                      ? `${displayLabel} (${formatWhatsAppNumberDisplay(st.ownPhone)}) — Double-click to rename`
                      : 'Click to switch tab, double-click to rename'
                  }
                  className={`group px-3 py-1.5 rounded-t-card rounded-b-input text-xs font-bold shrink-0 flex items-center gap-1.5 cursor-pointer transition-all ${isSelected
                    ? 'bg-surface shadow-neo-pressed text-primary-dark border-b-2 border-primary'
                    : 'bg-surface text-secondary shadow-neo-surface hover:text-primary-dark'
                    }`}
                >
                  {isWaPartition ? (
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${st?.isConnected ? 'bg-primary' : 'bg-secondary opacity-50'
                        }`}
                    />
                  ) : (
                    <Globe size={12} className="text-primary shrink-0" />
                  )}
                  <span className="truncate max-w-[140px]">{displayLabel}</span>
                  {isWaPartition && st?.ownPhone && (
                    <span className="hidden md:inline text-[10px] font-medium text-secondary">
                      {formatWhatsAppNumberDisplay(st.ownPhone)}
                    </span>
                  )}
                  {(st?.unreadCount || 0) > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-surface font-extrabold leading-none">
                      {st?.unreadCount}
                    </span>
                  )}
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => handleCloseTab(tab, e)}
                      className="p-0.5 rounded-full text-secondary hover:text-primary-dark opacity-70 group-hover:opacity-100"
                      title="Close tab"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => openChromeTab('https://www.google.com/', 'Google')}
              title="New Internal Chrome Tab (Ctrl+T)"
              className="px-2.5 py-1.5 rounded-btn bg-surface shadow-neo-surface text-secondary hover:text-primary-dark text-[11px] font-bold shrink-0 flex items-center gap-1"
            >
              <Plus size={13} /> Tab
            </button>

            <button
              onClick={openWhatsAppTab}
              title="Open an isolated WhatsApp account tab to scan another phone"
              className="px-2.5 py-1.5 rounded-btn bg-surface shadow-neo-surface text-primary hover:shadow-neo-hover text-[11px] font-bold shrink-0 flex items-center gap-1"
            >
              <MessageSquarePlus size={13} /> + WhatsApp
            </button>
          </div>

          <div className="flex items-center justify-end gap-1.5 shrink-0 flex-wrap">
            <button
              onClick={() => {
                const next = !autoCrmEnabled;
                setAutoCrmEnabled(next);
                setAutoCrmSyncEnabled(next);
                toast.success(
                  next
                    ? 'Auto-CRM Pipeline enabled across all connected WhatsApp accounts.'
                    : 'Auto-CRM Pipeline paused.'
                );
              }}
              className={`min-h-[34px] px-2.5 py-1 rounded-btn text-[11px] font-bold flex items-center gap-1 transition-all ${autoCrmEnabled
                ? 'bg-primary text-surface shadow-neo-surface'
                : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                }`}
              title="Continuously monitor all logged-in WhatsApp tabs & auto-sync leads to Pipeline"
            >
              <Zap size={12} /> <span className="hidden xs:inline sm:inline">{autoCrmEnabled ? 'Auto-CRM Live' : 'Auto-CRM Off'}</span>
              {syncFeed.length > 0 || grabbedCount > 0 ? ` (${Math.max(syncFeed.length, grabbedCount)})` : ''}
            </button>

            <button
              onClick={() => {
                setImportSummary(null);
                setShowImportModal(true);
              }}
              className="min-h-[34px] px-2.5 py-1 rounded-btn bg-surface shadow-neo-surface text-primary-dark hover:text-primary text-[11px] font-bold flex items-center gap-1"
              title="Import WhatsApp leads from a custom date range into CRM Pipeline"
            >
              <CalendarRange size={12} className="text-primary" />
              <span className="hidden sm:inline">Import Leads</span>
            </button>

            <button
              onClick={() => setShowWelcomeKitModal(true)}
              className={`min-h-[34px] px-2.5 py-1 rounded-btn text-[11px] font-bold flex items-center gap-1 transition-all ${welcomeKitConfig.enabled || welcomeKitConfig.noReplyFollowUp?.enabled
                ? 'bg-primary text-surface shadow-neo-surface'
                : 'bg-surface shadow-neo-surface text-primary-dark hover:text-primary'
                }`}
              title="Configure & auto-send NFF, Brochure, Testimonial Video & 1-2 day no-reply follow-up"
            >
              <Gift size={12} className={welcomeKitConfig.enabled || welcomeKitConfig.noReplyFollowUp?.enabled ? 'text-surface' : 'text-primary'} />
              <span className="hidden sm:inline">Welcome Kit</span>
              {(welcomeKitConfig.enabled || welcomeKitConfig.noReplyFollowUp?.enabled) && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-surface text-primary">
                  ON
                </span>
              )}
            </button>

            {isAdmin && (
              <button
                onClick={() => setShowAssignmentModal(true)}
                className="min-h-[34px] px-2.5 py-1 rounded-btn bg-surface shadow-neo-surface text-primary-dark hover:text-primary text-[11px] font-bold flex items-center gap-1"
                title="Divide and split incoming & existing leads among team members"
              >
                <GitBranch size={12} className="text-primary" />
                <span className="hidden sm:inline">Split Leads</span>
              </button>
            )}

            <button
              onClick={() => {
                setShowSyncFeed((s) => {
                  const next = !s;
                  if (next) setIsCopilotOpen(false);
                  return next;
                });
              }}
              className={`min-h-[34px] px-2.5 py-1 rounded-btn text-[11px] font-bold flex items-center gap-1 transition-all ${showSyncFeed
                ? 'bg-primary text-surface shadow-neo-surface'
                : 'bg-surface shadow-neo-surface text-primary-dark hover:text-primary'
                }`}
              title="View today's captured & updated WhatsApp leads"
            >
              <CheckCircle2 size={12} className={showSyncFeed ? 'text-surface' : 'text-primary'} />
              <span className="hidden sm:inline">CRM Feed</span>
              {syncFeed.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${showSyncFeed ? 'bg-surface text-primary' : 'bg-primary text-surface'}`}>
                  {syncFeed.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setIsFullScreen(false);
                navigate('/pipeline');
              }}
              className="min-h-[34px] px-2.5 py-1 rounded-btn bg-surface shadow-neo-surface text-primary-dark hover:text-primary text-[11px] font-bold flex items-center gap-1"
              title="Open Sales Pipeline Board (WhatsApp continues monitoring in background)"
            >
              <Columns3 size={12} className="text-primary" /> <span className="hidden md:inline">Pipeline</span>
            </button>

            <button
              onClick={() => {
                setIsFullScreen(false);
                navigate('/leads');
              }}
              className="min-h-[34px] px-2.5 py-1 rounded-btn bg-surface shadow-neo-surface text-primary-dark hover:text-primary text-[11px] font-bold hidden lg:flex items-center gap-1"
              title="Open Leads Directory"
            >
              <Users size={12} className="text-primary" /> <span>Leads</span>
            </button>

            <button
              onClick={() => {
                const next = !isCopilotOpen;
                setIsCopilotOpen(next);
                if (next) {
                  setShowSyncFeed(false);
                  if (activeChat) {
                    handleAnalyzeCurrentChat();
                  }
                }
              }}
              className={`min-h-[34px] px-2.5 py-1 rounded-btn text-[11px] font-bold flex items-center gap-1 transition-all ${isCopilotOpen
                ? 'bg-primary text-surface shadow-neo-surface'
                : 'bg-surface shadow-neo-surface text-primary hover:shadow-neo-hover'
                }`}
              title="Extract open WhatsApp chat to Lead / Quotation"
            >
              <Sparkles size={12} /> Copilot
            </button>

            {onMinimize && (
              <button
                onClick={() => {
                  setIsFullScreen(false);
                  onMinimize();
                }}
                title="Minimize Browser Panel to Floating Pill (stays live in background)"
                className="min-w-[34px] min-h-[34px] p-1.5 rounded-btn bg-surface shadow-neo-surface text-primary-dark hover:text-primary flex items-center justify-center"
              >
                <Minus size={14} />
              </button>
            )}

            <button
              onClick={() => setIsFullScreen((f) => !f)}
              title={isFullScreen ? 'Exit Full Page (Esc)' : 'Expand to Full Window'}
              className="min-w-[34px] min-h-[34px] p-1.5 rounded-btn bg-surface shadow-neo-surface text-primary-dark hover:text-primary flex items-center justify-center"
            >
              {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            {onClose && (
              <button
                onClick={() => {
                  setIsFullScreen(false);
                  onClose();
                }}
                title="Hide / Close Browser Panel"
                className="min-w-[34px] min-h-[34px] p-1.5 rounded-btn bg-surface shadow-neo-surface text-secondary hover:text-error flex items-center justify-center"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Mobile-First Compact Omnibox + Scrollable Bookmarks */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 px-2.5 py-1.5 bg-surface">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => activeWv?.goBack()}
                title="Back"
                className="min-w-[32px] min-h-[32px] p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark flex items-center justify-center"
              >
                <ArrowLeft size={13} />
              </button>
              <button
                onClick={() => activeWv?.goForward()}
                title="Forward"
                className="min-w-[32px] min-h-[32px] p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark flex items-center justify-center"
              >
                <ArrowRight size={13} />
              </button>
              <button
                onClick={() => (activeTabState?.isLoading ? activeWv?.stop() : activeWv?.reload())}
                title={activeTabState?.isLoading ? 'Stop Loading' : 'Reload Page'}
                className="min-w-[32px] min-h-[32px] p-1.5 rounded-full bg-surface shadow-neo-surface text-primary hover:shadow-neo-hover flex items-center justify-center"
              >
                {activeTabState?.isLoading ? <X size={13} /> : <RotateCw size={13} />}
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                navigateActiveTabTo(addressBarValue);
              }}
              className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn bg-surface shadow-neo-inset text-xs min-w-0"
            >
              {currentUrl.startsWith('https://') ? (
                <Lock size={12} className="text-primary shrink-0" />
              ) : (
                <Globe size={12} className="text-secondary shrink-0" />
              )}
              <input
                type="text"
                value={addressBarValue}
                onChange={(e) => setAddressBarValue(e.target.value)}
                placeholder="Enter URL or search Google..."
                className="flex-1 bg-transparent outline-none text-xs font-medium text-primary-dark min-w-0"
              />
              <button
                type="button"
                onClick={handleToggleBookmark}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                className={`p-0.5 transition-colors shrink-0 ${isBookmarked ? 'text-primary' : 'text-secondary hover:text-primary-dark'}`}
              >
                <Bookmark size={12} fill={isBookmarked ? 'currentColor' : 'none'} />
              </button>
            </form>
          </div>

          {/* Bookmarks Quick Bar & Zoom */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 overflow-x-auto pb-0.5 sm:pb-0">
            {bookmarks.map((bm) => (
              <button
                key={bm.id}
                type="button"
                onClick={() => {
                  if (activeTab?.partition.startsWith('persist:wa_') && !bm.url.includes('web.whatsapp.com')) {
                    openChromeTab(bm.url, bm.title);
                  } else {
                    navigateActiveTabTo(bm.url);
                  }
                }}
                className="px-2 py-1 rounded-btn bg-surface shadow-neo-surface text-[11px] font-semibold text-secondary hover:text-primary-dark whitespace-nowrap"
                title={bm.url}
              >
                {bm.title}
              </button>
            ))}

            {activeChat?.contactName && isCurrentWhatsApp && (
              <button
                type="button"
                onClick={() => {
                  setIsCopilotOpen(true);
                  handleAnalyzeCurrentChat();
                }}
                className="px-2.5 py-1 rounded-btn bg-primary text-surface text-[11px] font-bold shadow-neo-surface shrink-0 max-w-[180px] truncate"
                title={`Grab & analyze chat with ${activeChat.contactName}`}
              >
                Grab: {activeChat.contactName}
              </button>
            )}

            <div className="hidden xl:flex items-center gap-0.5 pl-1 border-l border-shadow-dark">
              <button
                type="button"
                onClick={() => handleAdjustZoom(-0.1)}
                title="Zoom Out"
                className="p-1 rounded-full text-secondary hover:text-primary-dark"
              >
                <ZoomOut size={12} />
              </button>
              <span className="text-[10px] font-bold text-secondary w-9 text-center">
                {Math.round((activeTabState?.zoom || 1) * 100)}%
              </span>
              <button
                type="button"
                onClick={() => handleAdjustZoom(0.1)}
                title="Zoom In"
                className="p-1 rounded-full text-secondary hover:text-primary-dark"
              >
                <ZoomIn size={12} />
              </button>
              <button
                type="button"
                onClick={() => currentUrl && window.electronAPI?.openExternal(currentUrl)}
                title="Open current URL in external Windows Chrome/Browser"
                className="p-1 rounded-full text-secondary hover:text-primary-dark ml-0.5"
              >
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Browser Viewport + Collapsible AI Lead Copilot / Live CRM Feed Drawer */}
      <div className="flex-1 bg-surface rounded-card shadow-neo-raised flex min-h-0 overflow-hidden relative">
        <div className="flex-1 relative min-w-0 min-h-0 bg-surface flex flex-col overflow-hidden">
          {qrBulkSyncBanner && (
            <div className="px-3 py-1.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-2 text-xs text-primary-dark shrink-0 z-20">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                <span className="font-semibold truncate">{qrBulkSyncBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setQrBulkSyncBanner(null)}
                className="text-[11px] font-bold text-primary hover:underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
          <div className="flex-1 relative min-w-0 min-h-0 overflow-hidden">
            {tabs.map((tab) => {
              const isReady = Boolean(readyPartitions[tab.partition]);
              const isActive = tab.id === activeTab?.id;
              if (!isReady) return null;

              return (
                <webview
                  key={tab.id}
                  ref={(el) => attachWebviewListeners(tab, el)}
                  src={tab.initialUrl}
                  partition={tab.partition}
                  useragent={cleanChromeUa}
                  allowpopups={true}
                  className={
                    isActive
                      ? 'w-full h-full flex-1 relative z-10'
                      : 'absolute inset-0 w-full h-full opacity-0 pointer-events-none -z-10'
                  }
                />
              );
            })}
          </div>
        </div>

        {visible && showSyncFeed && (
          <div className="fixed inset-x-0 bottom-0 top-14 z-50 lg:static lg:inset-auto w-full lg:w-[340px] shrink-0 bg-surface border-t lg:border-t-0 lg:border-l border-shadow-dark flex flex-col min-h-0 overflow-hidden animate-fade-in rounded-t-card lg:rounded-none shadow-neo-raised lg:shadow-none">
            <div className="px-4 py-3 border-b border-shadow-dark flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={15} className="text-primary" />
                <div>
                  <h3 className="text-xs font-bold text-primary-dark">CRM &amp; Pipeline Auto-Sync</h3>
                  <p className="text-[10px] text-secondary">
                    {Object.values(tabStates).filter((s) => s.isConnected).length} WhatsApp account(s) live &bull;{' '}
                    {autoCrmEnabled ? 'Auto-capturing' : 'Paused'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSyncFeed(false)}
                className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark"
                title="Close CRM Feed"
              >
                <X size={13} />
              </button>
            </div>

            <div className="p-3 border-b border-shadow-dark grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-card bg-surface shadow-neo-inset text-center">
                <span className="text-[10px] text-secondary block font-semibold">New Leads Today</span>
                <strong className="text-base text-primary font-extrabold">
                  {syncFeed.filter((i) => i.action === 'created' && (isAdmin || !i.assignedToId || i.assignedToId === dbUser?.id)).length}
                </strong>
              </div>
              <div className="p-2.5 rounded-card bg-surface shadow-neo-inset text-center">
                <span className="text-[10px] text-secondary block font-semibold">Existing Updated</span>
                <strong className="text-base text-primary-dark font-extrabold">
                  {syncFeed.filter((i) => i.action === 'updated' && (isAdmin || !i.assignedToId || i.assignedToId === dbUser?.id)).length}
                </strong>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-sidebar-scrollbar">
              {syncFeed.filter((i) => isAdmin || !i.assignedToId || i.assignedToId === dbUser?.id).length === 0 ? (
                <div className="py-12 px-4 text-center text-secondary space-y-2">
                  <CheckCircle2 size={28} className="mx-auto text-primary opacity-50" />
                  <p className="text-xs font-bold text-primary-dark">Monitoring All Accounts</p>
                  <p className="text-[11px] leading-relaxed">
                    Incoming sales inquiries across all logged-in WhatsApp tabs are automatically qualified,
                    deduplicated, and placed into the right CRM Pipeline &amp; Stage.
                  </p>
                </div>
              ) : (
                syncFeed
                  .filter((i) => isAdmin || !i.assignedToId || i.assignedToId === dbUser?.id)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setIsFullScreen(false);
                        navigate(item.leadId ? `/leads/${item.leadId}` : '/pipeline');
                      }}
                      className="w-full text-left p-3 rounded-card bg-surface shadow-neo-surface hover:shadow-neo-hover transition-all space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-primary-dark truncate">{item.leadName}</span>
                        <span
                          className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${item.action === 'created'
                            ? 'bg-primary text-surface'
                            : 'bg-surface shadow-neo-inset text-primary'
                            }`}
                        >
                          {item.action === 'created' ? 'New Lead' : 'Updated'}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-primary truncate">
                        {item.pipelineName} &bull; {item.stageLabel}
                      </p>
                      {isAdmin && item.assignedToName && (
                        <p className="text-[10px] font-bold text-emerald-700 truncate">
                          Assigned → {item.assignedToName}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-secondary">
                        <span className="truncate">{item.accountLabel}</span>
                        <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </button>
                  ))
              )}
            </div>

            <div className="p-3 border-t border-shadow-dark space-y-2">
              <button
                type="button"
                onClick={() => setShowWelcomeKitModal(true)}
                className="neo-btn w-full text-xs font-bold text-primary-dark flex items-center justify-center gap-1.5"
              >
                <Gift size={13} className="text-primary" />
                Welcome Kit Auto-Send {welcomeKitConfig.enabled ? '(Active)' : '(Off)'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportSummary(null);
                  setShowImportModal(true);
                }}
                className="neo-btn w-full text-xs font-bold text-primary flex items-center justify-center gap-1.5"
              >
                <CalendarRange size={13} /> Import by Date Range
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAssignmentModal(true)}
                  className="neo-btn w-full text-xs font-bold text-primary-dark hover:text-primary flex items-center justify-center gap-1.5"
                  title="Divide and split incoming & existing leads among team members"
                >
                  <GitBranch size={13} className="text-primary" /> Auto-Split &amp; Assign Leads
                </button>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsFullScreen(false);
                    navigate('/pipeline');
                  }}
                  className="neo-btn-primary flex-1 text-xs flex items-center justify-center gap-1.5"
                >
                  <Columns3 size={13} /> Open Pipeline
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsFullScreen(false);
                    navigate('/leads');
                  }}
                  className="neo-btn flex-1 text-xs text-primary-dark flex items-center justify-center gap-1.5"
                >
                  <Users size={13} /> All Leads
                </button>
              </div>
            </div>
          </div>
        )}

        {visible && isCopilotOpen && !showSyncFeed && (
          <AiCopilotDrawer
            insight={activeInsight}
            crmPreview={crmPreview}
            analyzing={analyzing}
            sending={false}
            saveSuccess={saveSuccess}
            onClose={() => setIsCopilotOpen(false)}
            onReanalyze={handleAnalyzeCurrentChat}
            onDraftQuotation={handleDraftQuotation}
            onSaveToCrm={handleSaveToCrm}
            onSendSuggestedReply={handleCopySuggestedReply}
          />
        )}
      </div>

      <WhatsAppDateImportModal
        isOpen={visible && showImportModal}
        onClose={() => setShowImportModal(false)}
        accountOptions={tabs
          .filter((t) => t.partition.startsWith('persist:wa_'))
          .map((t) => ({
            id: t.id,
            label: t.label,
            connected: Boolean(tabStates[t.id]?.isConnected)
          }))}
        defaultAccountId={
          activeTab?.partition.startsWith('persist:wa_') ? activeTab.id : 'all'
        }
        importing={importingLeads}
        progressText={importProgressText}
        resultSummary={importSummary}
        onStartImport={handleStartBulkImport}
        onOpenPipeline={() => {
          setIsFullScreen(false);
          navigate('/pipeline');
        }}
      />

      <WhatsAppWelcomeKitModal
        isOpen={visible && showWelcomeKitModal}
        onClose={() => setShowWelcomeKitModal(false)}
        config={welcomeKitConfig}
        activeChatLabel={
          activeChat && !activeChat.isGroup && !activeChat.isSystemBot
            ? activeChat.contactName
            : undefined
        }
        sendingNow={sendingWelcomeKit}
        runningNoReplyCheck={runningNoReplyCheck}
        onSaved={(next) => {
          setWelcomeKitConfig(next);
          if (next.noReplyFollowUp?.enabled) {
            runNoReplyTestimonialSweep(next, false).catch(() => { });
          }
        }}
        onRunNoReplySweepNow={async (draftConfig) => {
          await runNoReplyTestimonialSweep(draftConfig, true);
        }}
        onSendNowToActiveChat={async (draftConfig) => {
          if (!activeTab || !activeChat || activeChat.isGroup || activeChat.isSystemBot) {
            toast.error('Open a 1-on-1 customer chat in WhatsApp first.');
            return;
          }
          setSendingWelcomeKit(true);
          try {
            const res = await sendWelcomeKitToLead({
              tab: activeTab,
              contactName: activeChat.contactName,
              phone: activeChat.phone,
              company: activeInsight?.company,
              quantity: activeInsight?.quantity,
              eventName: activeInsight?.eventName,
              requirement: activeInsight?.requirement,
              configOverride: draftConfig,
              forceManual: true
            });
            if (res.sentCount === 0) {
              toast.error('Could not send Welcome Kit items. Check WhatsApp chat readiness or attachments.');
            }
          } finally {
            setSendingWelcomeKit(false);
          }
        }}
      />

      {isAdmin && (
        <LeadAssignmentModal
          isOpen={showAssignmentModal}
          onClose={() => setShowAssignmentModal(false)}
          leads={allLeads}
        />
      )}
    </div>
  );
}

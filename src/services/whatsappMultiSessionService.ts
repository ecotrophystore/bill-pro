// Frontend service to interact with the Baileys Multi-WhatsApp Backend

export interface SessionInfo {
  id: string;
  label: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'qr_ready';
  qrCodeDataUrl?: string;
  phoneNumber?: string;
  pushName?: string;
  avatarUrl?: string;
  aboutStatus?: string;
  lastActive?: number;
  unreadCount?: number;
  createdAt?: number;
}

export interface WhatsAppStatusItem {
  id: string;
  sessionId: string;
  sessionLabel: string;
  senderJid: string;
  senderPhone: string;
  senderName: string;
  avatarUrl?: string;
  text: string;
  mediaType?: string;
  mediaUrl?: string;
  timestamp: number;
}

export interface ContactProfileInfo {
  avatarUrl: string | null;
  about: string | null;
  presence: string | null;
  lastSeen: number | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  remoteJid?: string;
  fromMe: boolean;
  senderPhone?: string;
  senderName: string;
  text: string;
  timestamp: number;
  status?: string;
  hasMedia?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
}

export interface AiLeadInsight {
  leadName: string;
  company: string;
  phone: string;
  email?: string;
  location?: string;
  requirement: string;
  quantity: string;
  budget: string;
  trophyType?: string;
  trophySize?: string;
  eventName?: string;
  eventDate?: string;
  deliveryDate?: string;
  urgency: 'low' | 'medium' | 'high';
  stage: 'new' | 'contacted' | 'qualified' | 'lost';
  pipelineStage?: string;
  isBusinessLead?: boolean;
  suggestedAction: string;
  suggestedReply: string;
  analyzedAt: number;
}

export interface ConversationSummary {
  id: string;
  sessionId: string;
  sessionLabel: string;
  remoteJid: string;
  phone: string;
  phoneResolved: boolean;
  name: string;
  lastMessage: string;
  timestamp: number;
  unreadCount?: number;
  isGroup?: boolean;
  isSelfChat?: boolean;
  avatarUrl?: string;
  insight?: AiLeadInsight;
}

const BASE_URL = '/api/whatsapp';

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch (e) {
    return false;
  }
}

export async function fetchAllSessions(): Promise<SessionInfo[]> {
  try {
    const res = await fetch(`${BASE_URL}/sessions`);
    if (!res.ok) throw new Error('Failed to fetch sessions');
    const data = await res.json();
    return data.sessions || [];
  } catch (err) {
    console.error('Error fetching WhatsApp sessions:', err);
    return [];
  }
}

export async function fetchAllConversations(): Promise<ConversationSummary[]> {
  try {
    const res = await fetch(`${BASE_URL}/conversations`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.conversations || [];
  } catch (err) {
    return [];
  }
}

export async function createNewSession(label: string, id?: string): Promise<{ success: boolean; session?: SessionInfo; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create session');
    return { success: true, session: data.session };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error creating session' };
  }
}

export async function fetchSessionQr(sessionId: string): Promise<SessionInfo | null> {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/qr`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    return false;
  }
}

export async function fetchMessagesForContact(
  sessionId: string,
  remoteJidOrPhone: string
): Promise<{ messages: ChatMessage[]; insight: AiLeadInsight | null }> {
  try {
    const param = remoteJidOrPhone.includes('@')
      ? `remoteJid=${encodeURIComponent(remoteJidOrPhone)}`
      : `phone=${encodeURIComponent(remoteJidOrPhone)}`;
    const res = await fetch(`${BASE_URL}/messages?sessionId=${encodeURIComponent(sessionId)}&${param}`);
    if (!res.ok) return { messages: [], insight: null };
    const data = await res.json();
    return {
      messages: data.messages || [],
      insight: data.insight || null
    };
  } catch (err) {
    return { messages: [], insight: null };
  }
}

export async function sendWhatsAppMessage(params: {
  sessionId?: string;
  remoteJid?: string;
  phone?: string;
  message: string;
  documentUrl?: string;
  fileDataUrl?: string;
  mimeType?: string;
  fileName?: string;
}): Promise<{ success: boolean; error?: string; messageId?: string; message?: ChatMessage }> {
  try {
    const res = await fetch(`${BASE_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send message');
    return { success: true, messageId: data.messageId, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error sending message' };
  }
}

export async function markConversationRead(sessionId: string, remoteJid: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}/conversations/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, remoteJid })
    });
  } catch (e) { }
}

export async function rescanSessionForHistory(
  sessionId: string
): Promise<{ success: boolean; session?: SessionInfo; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${encodeURIComponent(sessionId)}/rescan`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start QR re-scan');
    return { success: true, session: data.session };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to restart session' };
  }
}

export async function requestPairingCodeForSession(
  sessionId: string,
  phoneNumber: string
): Promise<{ success: boolean; pairingCode?: string; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${encodeURIComponent(sessionId)}/pairing-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate pairing code');
    return { success: true, pairingCode: data.pairingCode };
  } catch (err: any) {
    return { success: false, error: err.message || 'Could not generate pairing code' };
  }
}

export async function fetchProfilePicUrl(
  sessionId: string,
  remoteJid: string,
  refresh = false
): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/profile-pic?sessionId=${encodeURIComponent(sessionId)}&jid=${encodeURIComponent(remoteJid)}${refresh ? '&refresh=1' : ''
      }`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch (e) {
    return null;
  }
}

export async function fetchContactInfo(
  sessionId: string,
  remoteJid: string
): Promise<ContactProfileInfo | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/contact-info?sessionId=${encodeURIComponent(sessionId)}&jid=${encodeURIComponent(remoteJid)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export async function fetchWhatsAppStatuses(sessionId?: string): Promise<WhatsAppStatusItem[]> {
  try {
    const q = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    const res = await fetch(`${BASE_URL}/statuses${q}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.statuses || [];
  } catch (e) {
    return [];
  }
}

export async function analyzeTextWithAi(
  text: string,
  phone: string,
  senderName: string,
  sessionId?: string,
  remoteJid?: string
): Promise<AiLeadInsight | null> {
  try {
    const res = await fetch(`${BASE_URL}/agent/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, phone, senderName, sessionId, remoteJid })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.insight;
  } catch (err) {
    return null;
  }
}

export interface ImportedHistoryLead {
  sessionId: string;
  sessionLabel?: string;
  sourceWhatsappNumber?: string;
  remoteJid: string;
  phone?: string;
  name?: string;
  messageText?: string;
  timestamp?: number;
  insight: AiLeadInsight;
}

export async function importLeadsFromHistory(params: {
  sessionId?: string;
  startDate?: string;
  endDate?: string;
  mode?: 'range' | 'all';
}): Promise<{ success: boolean; totalScanned: number; leads: ImportedHistoryLead[]; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/import-leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to import leads from WhatsApp history');
    return {
      success: true,
      totalScanned: Number(data.totalScanned || 0),
      leads: Array.isArray(data.leads) ? data.leads : []
    };
  } catch (err: any) {
    return {
      success: false,
      totalScanned: 0,
      leads: [],
      error: err?.message || 'Could not reach WhatsApp backend service'
    };
  }
}

export function subscribeToWhatsAppEvents(handlers: {
  onInit?: (data: { sessions: SessionInfo[]; conversations: ConversationSummary[]; statuses?: WhatsAppStatusItem[] }) => void;
  onSessionUpdate?: (session: SessionInfo) => void;
  onIncomingMessage?: (data: { sessionId: string; remoteJid: string; conversation?: ConversationSummary; message: ChatMessage }) => void;
  onConversationUpdated?: (conversation: ConversationSummary) => void;
  onHistorySynced?: (data: { sessionId: string; totalCount?: number; conversations?: ConversationSummary[] }) => void;
  onPresenceUpdate?: (data: { sessionId: string; remoteJid: string; presence: string; lastSeen?: number }) => void;
  onStatusReceived?: (statusItem: WhatsAppStatusItem) => void;
  onLeadDetected?: (data: {
    sessionId: string;
    remoteJid: string;
    phone?: string;
    name?: string;
    sessionLabel?: string;
    messageText?: string;
    timestamp?: number;
    insight: AiLeadInsight;
  }) => void;
  onBulkLeadsReady?: (data: {
    sessionId: string;
    trigger?: string;
    totalScanned?: number;
    leads: ImportedHistoryLead[];
  }) => void;
  onSessionDeleted?: (data: { id: string }) => void;
}): () => void {
  const eventSource = new EventSource(`${BASE_URL}/events`);

  eventSource.addEventListener('init', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onInit?.(data);
    } catch (err) { }
  });

  eventSource.addEventListener('session_update', (e) => {
    try {
      const session = JSON.parse(e.data);
      handlers.onSessionUpdate?.(session);
    } catch (err) { }
  });

  eventSource.addEventListener('incoming_message', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onIncomingMessage?.(data);
    } catch (err) { }
  });

  eventSource.addEventListener('conversation_updated', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onConversationUpdated?.(data);
    } catch (err) { }
  });

  eventSource.addEventListener('history_synced', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onHistorySynced?.(data);
    } catch (err) { }
  });

  eventSource.addEventListener('presence_update', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onPresenceUpdate?.(data);
    } catch (err) { }
  });

  eventSource.addEventListener('status_received', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onStatusReceived?.(data);
    } catch (err) { }
  });

  eventSource.addEventListener('lead_detected', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onLeadDetected?.(data);
    } catch (err) { }
  });

  eventSource.addEventListener('bulk_leads_ready', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onBulkLeadsReady?.(data);
    } catch (err) { }
  });

  eventSource.addEventListener('session_deleted', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onSessionDeleted?.(data);
    } catch (err) { }
  });

  return () => {
    eventSource.close();
  };
}

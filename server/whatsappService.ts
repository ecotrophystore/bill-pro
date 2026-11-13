import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { execFileSync, spawn } from 'child_process';
import QRCode from 'qrcode';
import pino from 'pino';
import dotenv from 'dotenv';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  isLidUser,
  jidDecode,
  downloadMediaMessage,
  type WASocket
} from '@whiskeysockets/baileys';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { registerReconciliationMailerRoutes } from './reconciliationMailer';

dotenv.config();

const PORT = Number(process.env.WHATSAPP_SERVER_PORT || 5001);
const SESSIONS_DIR = process.env.WHATSAPP_SESSIONS_DIR
  ? path.resolve(process.env.WHATSAPP_SESSIONS_DIR)
  : path.resolve(process.cwd(), '.whatsapp_sessions');
const MEDIA_DIR = path.join(SESSIONS_DIR, 'media');
const REGISTRY_FILE = path.join(SESSIONS_DIR, 'sessions_registry.json');
const LID_CACHE_FILE = path.join(SESSIONS_DIR, 'lid_cache.json');
const CHAT_HISTORY_FILE = path.join(SESSIONS_DIR, 'chat_history.json');
const MAX_MESSAGES_PER_CHAT = 250;

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const gitignorePath = path.resolve(process.cwd(), '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  if (!gitignoreContent.includes('.whatsapp_sessions')) {
    fs.appendFileSync(gitignorePath, '\n# WhatsApp Multi-Session Storage\n.whatsapp_sessions/\n');
  }
}

export interface SessionMetadata {
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
  createdAt: number;
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

export interface ChatMessage {
  id: string;
  sessionId: string;
  remoteJid: string;
  fromMe: boolean;
  senderPhone: string;
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

// In-Memory State
const activeSockets = new Map<string, WASocket>();
const sessionRegistry = new Map<string, SessionMetadata>();
const messageStore = new Map<string, ChatMessage[]>(); // `${sessionId}:${remoteJid}` -> ChatMessage[]
const conversationMap = new Map<string, ConversationSummary>(); // `${sessionId}:${remoteJid}` -> summary
const leadInsights = new Map<string, AiLeadInsight>(); // remoteJid -> insight
const profilePicCache = new Map<string, { url: string; fetchedAt: number }>(); // `${sessionId}:${jid}`
const contactAboutMap = new Map<string, { about: string; fetchedAt: number }>(); // jid -> about
const presenceMap = new Map<string, { presence: string; lastSeen?: number; updatedAt: number }>(); // `${sessionId}:${jid}`
const statusStore = new Map<string, WhatsAppStatusItem[]>(); // sessionId -> Status updates (48h window)
const sseClients = new Set<Response>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const qrTimeoutCounts = new Map<string, number>();
const intentionallyClosedSockets = new WeakSet<WASocket>();
const pendingQrHistorySync = new Set<string>();
const qrHistorySyncTimers = new Map<string, NodeJS.Timeout>();
const recentQrBulkBatches = new Map<string, { sessionId: string; createdAt: number; totalScanned: number; leads: any[] }>();
let historySaveTimer: NodeJS.Timeout | null = null;

// LID <-> Phone Number & Contact Name caches
const lidToPhoneMap = new Map<string, string>(); // lidUser -> phoneDigits
const contactNameMap = new Map<string, string>(); // phoneDigits or jidUser -> display name

function loadLidCache() {
  if (fs.existsSync(LID_CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LID_CACHE_FILE, 'utf-8'));
      if (data.lidToPhone) {
        Object.entries(data.lidToPhone).forEach(([k, v]) => lidToPhoneMap.set(k, String(v)));
      }
      if (data.contactNames) {
        Object.entries(data.contactNames).forEach(([k, v]) => contactNameMap.set(k, String(v)));
      }
    } catch (e) { }
  }
}

function saveLidCache() {
  try {
    fs.writeFileSync(
      LID_CACHE_FILE,
      JSON.stringify(
        {
          lidToPhone: Object.fromEntries(lidToPhoneMap.entries()),
          contactNames: Object.fromEntries(contactNameMap.entries())
        },
        null,
        2
      ),
      'utf-8'
    );
  } catch (e) { }
}

function recordLidMapping(lidJid: string | undefined, pnJid: string | undefined) {
  if (!lidJid || !pnJid) return;
  const lidUser = jidDecode(lidJid)?.user || lidJid.split('@')[0].split(':')[0];
  const pnUser = jidDecode(pnJid)?.user || pnJid.split('@')[0].split(':')[0];
  if (lidUser && pnUser && /^\d{7,15}$/.test(pnUser) && lidUser !== pnUser) {
    if (lidToPhoneMap.get(lidUser) !== pnUser) {
      lidToPhoneMap.set(lidUser, pnUser);
      saveLidCache();
    }
  }
}

function loadRegistry() {
  if (fs.existsSync(REGISTRY_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        data.forEach((s: SessionMetadata) => {
          sessionRegistry.set(s.id, {
            ...s,
            status: 'disconnected',
            qrCodeDataUrl: undefined
          });
        });
      }
    } catch (err) {
      console.error('[Registry] Error reading registry file:', err);
    }
  }
}

function saveRegistry() {
  try {
    const list = Array.from(sessionRegistry.values()).map((s) => ({
      id: s.id,
      label: s.label,
      phoneNumber: s.phoneNumber,
      pushName: s.pushName,
      avatarUrl: s.avatarUrl,
      aboutStatus: s.aboutStatus,
      createdAt: s.createdAt,
      lastActive: s.lastActive
    }));
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Registry] Error saving registry:', err);
  }
}

function loadChatHistory() {
  if (!fs.existsSync(CHAT_HISTORY_FILE)) return;
  try {
    const raw = fs.readFileSync(CHAT_HISTORY_FILE, 'utf-8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);

    if (parsed.messages && typeof parsed.messages === 'object') {
      Object.entries(parsed.messages).forEach(([storeKey, list]) => {
        if (Array.isArray(list)) {
          const valid = (list as ChatMessage[])
            .filter((m) => m && m.id && m.text)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .slice(-MAX_MESSAGES_PER_CHAT);
          if (valid.length > 0) messageStore.set(storeKey, valid);
        }
      });
    }

    if (parsed.conversations && typeof parsed.conversations === 'object') {
      Object.entries(parsed.conversations).forEach(([storeKey, conv]) => {
        if (conv && typeof conv === 'object') {
          const item = conv as ConversationSummary;
          const storedMsgs = messageStore.get(storeKey);
          if (
            storedMsgs?.length &&
            (item.lastMessage === 'Synced WhatsApp chat' || item.lastMessage === 'Message yourself')
          ) {
            item.lastMessage = storedMsgs[storedMsgs.length - 1].text;
          }
          conversationMap.set(storeKey, item);
        }
      });
    }

    if (parsed.leadInsights && typeof parsed.leadInsights === 'object') {
      Object.entries(parsed.leadInsights).forEach(([jid, insight]) => {
        if (insight && typeof insight === 'object') {
          leadInsights.set(jid, insight as AiLeadInsight);
        }
      });
    }

    if (parsed.statuses && typeof parsed.statuses === 'object') {
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      Object.entries(parsed.statuses).forEach(([sessId, items]) => {
        if (Array.isArray(items)) {
          const valid = (items as WhatsAppStatusItem[]).filter((st) => st && st.id && (st.timestamp || 0) >= cutoff);
          if (valid.length > 0) statusStore.set(sessId, valid);
        }
      });
    }

    console.log(
      `[History] Restored ${conversationMap.size} conversation(s) and ${messageStore.size} message thread(s) from disk.`
    );
  } catch (err) {
    console.error('[History] Error loading saved chat history:', err);
  }
}

function saveChatHistoryNow() {
  if (historySaveTimer) {
    clearTimeout(historySaveTimer);
    historySaveTimer = null;
  }
  try {
    const payload = {
      conversations: Object.fromEntries(conversationMap.entries()),
      messages: Object.fromEntries(messageStore.entries()),
      leadInsights: Object.fromEntries(leadInsights.entries()),
      statuses: Object.fromEntries(statusStore.entries())
    };
    const tmpFile = `${CHAT_HISTORY_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(payload), 'utf-8');
    fs.renameSync(tmpFile, CHAT_HISTORY_FILE);
  } catch (err) {
    console.error('[History] Error saving chat history:', err);
  }
}

function scheduleSaveChatHistory() {
  if (historySaveTimer) clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => {
    historySaveTimer = null;
    saveChatHistoryNow();
  }, 500);
}

function clearSessionHistory(sessionId: string) {
  const prefix = `${sessionId}:`;
  let removed = false;
  for (const key of Array.from(messageStore.keys())) {
    if (key.startsWith(prefix)) {
      messageStore.delete(key);
      removed = true;
    }
  }
  for (const key of Array.from(conversationMap.keys())) {
    if (key.startsWith(prefix)) {
      conversationMap.delete(key);
      removed = true;
    }
  }
  if (statusStore.delete(sessionId)) removed = true;
  if (removed) saveChatHistoryNow();
}

function getSortedConversations(): ConversationSummary[] {
  return Array.from(conversationMap.values()).sort((a, b) => b.timestamp - a.timestamp);
}

function broadcastSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  });
}

// Resolve real phone number for any JID (including @lid and @hosted.lid)
async function resolvePhoneNumber(
  sock: WASocket,
  remoteJid: string,
  remoteJidAlt?: string,
  participantAlt?: string
): Promise<{ phone: string; resolved: boolean; canonicalJid: string }> {
  // 1. Check direct alt JID if WhatsApp provided it
  const altCandidate = remoteJidAlt || participantAlt;
  if (altCandidate && (altCandidate.endsWith('@s.whatsapp.net') || altCandidate.endsWith('@hosted'))) {
    const pn = jidDecode(altCandidate)?.user || altCandidate.split('@')[0].split(':')[0];
    if (pn) {
      recordLidMapping(remoteJid, altCandidate);
      return { phone: pn, resolved: true, canonicalJid: `${pn}@s.whatsapp.net` };
    }
  }

  // 2. If remoteJid is already a standard phone JID
  if (remoteJid.endsWith('@s.whatsapp.net') || remoteJid.endsWith('@hosted')) {
    const pn = jidDecode(remoteJid)?.user || remoteJid.split('@')[0].split(':')[0];
    return { phone: pn, resolved: true, canonicalJid: `${pn}@s.whatsapp.net` };
  }

  // 3. If it's a LID, check our local cache and Baileys' internal LIDMappingStore
  if (isLidUser(remoteJid) || remoteJid.includes('@lid')) {
    const lidUser = jidDecode(remoteJid)?.user || remoteJid.split('@')[0].split(':')[0];

    // Check in-memory cache first
    const cachedPn = lidToPhoneMap.get(lidUser);
    if (cachedPn) {
      return { phone: cachedPn, resolved: true, canonicalJid: remoteJid };
    }

    // Check Baileys signalRepository.lidMapping
    try {
      const pnJid = await sock.signalRepository?.lidMapping?.getPNForLID(remoteJid);
      if (pnJid) {
        const pn = jidDecode(pnJid)?.user || pnJid.split('@')[0].split(':')[0];
        if (pn) {
          recordLidMapping(remoteJid, pnJid);
          return { phone: pn, resolved: true, canonicalJid: remoteJid };
        }
      }
    } catch (e) { }

    // Unresolved LID (WhatsApp privacy mode where user has hidden phone number)
    return { phone: '', resolved: false, canonicalJid: remoteJid };
  }

  const fallback = remoteJid.split('@')[0].split(':')[0];
  return { phone: fallback, resolved: true, canonicalJid: remoteJid };
}

function normalizeWaTimestampMs(ts: any): number {
  if (!ts) return Date.now();
  let raw = 0;
  if (typeof ts === 'number') {
    raw = ts;
  } else if (typeof ts === 'string') {
    raw = Number(ts);
  } else if (typeof ts?.toNumber === 'function') {
    raw = ts.toNumber();
  } else if (typeof ts?.low === 'number') {
    raw = ts.low + (ts.high ? ts.high * 0x100000000 : 0);
  }
  if (!Number.isFinite(raw) || raw <= 0) return Date.now();
  return raw > 1e12 ? raw : raw * 1000;
}

function unwrapBaileysMessage(message: any): any {
  let current = message;
  for (let i = 0; i < 4 && current && typeof current === 'object'; i++) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
    } else if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
    } else if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
    } else if (current.viewOnceMessageV2Extension?.message) {
      current = current.viewOnceMessageV2Extension.message;
    } else if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
    } else if (current.editedMessage?.message) {
      current = current.editedMessage.message?.protocolMessage?.editedMessage || current.editedMessage.message;
    } else {
      break;
    }
  }
  return current;
}

function extractMessageContentInfo(rawMessage: any): {
  text: string;
  hasMedia: boolean;
  mediaType?: string;
  fileName?: string;
  mimeType?: string;
} | null {
  const m = unwrapBaileysMessage(rawMessage);
  if (!m || typeof m !== 'object') return null;

  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    (m.documentMessage ? m.documentMessage.fileName || 'Document' : '') ||
    (m.audioMessage ? 'Voice message' : '') ||
    (m.imageMessage ? 'Photo' : '') ||
    (m.videoMessage ? 'Video' : '') ||
    (m.stickerMessage ? 'Sticker' : '') ||
    (m.contactMessage ? `Contact: ${m.contactMessage.displayName || 'Card'}` : '') ||
    (m.locationMessage ? 'Shared Location' : '');

  if (!text || !String(text).trim()) return null;

  const hasMedia = Boolean(m.imageMessage || m.videoMessage || m.documentMessage || m.audioMessage || m.stickerMessage);
  const mediaType = m.imageMessage
    ? 'image'
    : m.videoMessage
      ? 'video'
      : m.documentMessage
        ? 'document'
        : m.audioMessage
          ? 'audio'
          : m.stickerMessage
            ? 'image'
            : undefined;

  const mimeType =
    m.imageMessage?.mimetype ||
    m.videoMessage?.mimetype ||
    m.documentMessage?.mimetype ||
    m.audioMessage?.mimetype ||
    (m.stickerMessage ? 'image/webp' : undefined);

  const fileName = m.documentMessage?.fileName || undefined;

  return { text: String(text), hasMedia, mediaType, fileName, mimeType };
}

function getExtFromMime(mimeType?: string, fileName?: string): string {
  const existingExt = fileName ? path.extname(fileName) : '';
  if (existingExt && existingExt.length <= 6) return existingExt;
  const cleanMime = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (cleanMime === 'image/jpeg' || cleanMime === 'image/jpg') return '.jpg';
  if (cleanMime === 'image/png') return '.png';
  if (cleanMime === 'image/webp') return '.webp';
  if (cleanMime === 'image/gif') return '.gif';
  if (cleanMime === 'application/pdf') return '.pdf';
  if (cleanMime === 'video/mp4') return '.mp4';
  if (cleanMime === 'audio/ogg' || cleanMime === 'audio/opus') return '.ogg';
  if (cleanMime === 'audio/mpeg') return '.mp3';
  return '.bin';
}

function saveMediaBuffer(buffer: Buffer, msgId: string, mimeType?: string, fileName?: string): string | undefined {
  try {
    if (!buffer || buffer.length === 0 || buffer.length > 15 * 1024 * 1024) return undefined;
    const ext = getExtFromMime(mimeType, fileName);
    const safeId = (msgId || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
    const storedName = `${safeId}_${Date.now()}${ext}`;
    fs.writeFileSync(path.join(MEDIA_DIR, storedName), buffer);
    return `/api/whatsapp/media/${storedName}`;
  } catch (err) {
    return undefined;
  }
}

async function persistIncomingMedia(
  sock: WASocket,
  msg: any,
  msgId: string,
  mimeType?: string,
  fileName?: string
): Promise<string | undefined> {
  try {
    const logger = pino({ level: 'silent' });
    const stream = await downloadMediaMessage(
      msg,
      'stream',
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    );
    if (!stream) return undefined;

    const buffer = await new Promise<Buffer | null>((resolve) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      let settled = false;

      const finish = (result: Buffer | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!result) {
          try {
            stream.destroy();
          } catch (e) { }
        }
        resolve(result);
      };

      const timer = setTimeout(() => finish(null), 5000);

      stream.on('error', () => finish(null));
      stream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > 15 * 1024 * 1024) {
          finish(null);
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => finish(Buffer.concat(chunks)));
    });

    if (!buffer || buffer.length === 0) return undefined;
    return saveMediaBuffer(buffer, msgId, mimeType, fileName);
  } catch (e) {
    return undefined;
  }
}

function upsertMessageIntoStore(storeKey: string, chatMsg: ChatMessage): boolean {
  const existing = messageStore.get(storeKey) || [];
  if (existing.some((m) => m.id === chatMsg.id)) return false;

  existing.push(chatMsg);
  existing.sort((a, b) => a.timestamp - b.timestamp);
  if (existing.length > MAX_MESSAGES_PER_CHAT) {
    existing.splice(0, existing.length - MAX_MESSAGES_PER_CHAT);
  }
  messageStore.set(storeKey, existing);
  return true;
}

function getAllRecentStatuses(sessionId?: string): WhatsAppStatusItem[] {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const list: WhatsAppStatusItem[] = [];
  for (const [sessId, items] of statusStore.entries()) {
    if (sessionId && sessId !== sessionId) continue;
    items.forEach((it) => {
      if ((it.timestamp || 0) >= cutoff) list.push(it);
    });
  }
  return list.sort((a, b) => b.timestamp - a.timestamp);
}

async function resolveAvatarForSessionJid(
  sock: WASocket,
  sessionId: string,
  jid: string,
  forceRefresh = false
): Promise<string | null> {
  const cacheKey = `${sessionId}:${jid}`;
  const cached = profilePicCache.get(cacheKey);
  if (cached && !forceRefresh) {
    const ttl = cached.url ? 4 * 60 * 60 * 1000 : 3 * 60 * 1000;
    if (Date.now() - cached.fetchedAt < ttl) {
      return cached.url || null;
    }
  }

  let foundUrl = '';
  try {
    const u = await Promise.race([
      sock.profilePictureUrl(jid, 'preview').catch(() => sock.profilePictureUrl(jid, 'image')),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3500))
    ]);
    foundUrl = u || '';
  } catch (e) {
    foundUrl = '';
  }

  profilePicCache.set(cacheKey, { url: foundUrl, fetchedAt: Date.now() });
  if (foundUrl) {
    const storeKey = `${sessionId}:${jid}`;
    const existing = conversationMap.get(storeKey);
    if (existing && existing.avatarUrl !== foundUrl) {
      existing.avatarUrl = foundUrl;
      conversationMap.set(storeKey, existing);
      scheduleSaveChatHistory();
    }
  }
  return foundUrl || null;
}

async function resolveContactAbout(sock: WASocket, jid: string): Promise<string | null> {
  if (!jid || jid.endsWith('@g.us')) return null;
  const cached = contactAboutMap.get(jid);
  if (cached && Date.now() - cached.fetchedAt < 2 * 60 * 60 * 1000) {
    return cached.about || null;
  }

  let aboutText = '';
  try {
    const list: any = await Promise.race([
      sock.fetchStatus(jid),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3000))
    ]);
    const entry = Array.isArray(list) ? list[0] : list;
    const raw = typeof entry?.status === 'string' ? entry.status : entry?.status?.status;
    aboutText = raw ? String(raw) : '';
  } catch (e) {
    aboutText = '';
  }

  contactAboutMap.set(jid, { about: aboutText, fetchedAt: Date.now() });
  return aboutText || null;
}

async function ingestStatusMessage(
  sock: WASocket,
  sessionId: string,
  metadata: SessionMetadata,
  msg: any,
  isLive: boolean
): Promise<boolean> {
  const rawParticipant = msg?.key?.participant || (msg?.key as any)?.participantAlt || '';
  if (!rawParticipant) return false;

  const contentInfo = extractMessageContentInfo(msg.message);
  if (!contentInfo) return false;

  const resolvedInfo = await resolvePhoneNumber(sock, rawParticipant, (msg?.key as any)?.participantAlt);
  const canonicalSenderJid =
    resolvedInfo.resolved && resolvedInfo.phone && /^\d{7,15}$/.test(resolvedInfo.phone)
      ? `${resolvedInfo.phone}@s.whatsapp.net`
      : rawParticipant;

  const senderPhone = resolvedInfo.resolved ? resolvedInfo.phone : '';
  const senderUser = jidDecode(rawParticipant)?.user || '';
  const fromMe = Boolean(msg.key.fromMe);
  const senderName = fromMe
    ? `You (${metadata.label})`
    : contactNameMap.get(senderPhone) || contactNameMap.get(senderUser) || msg.pushName || (senderPhone ? `+${senderPhone}` : 'WhatsApp Contact');

  const timestampMs = normalizeWaTimestampMs(msg.messageTimestamp);
  const statusId = msg.key.id || `${timestampMs}-${Math.random().toString(36).slice(2, 6)}`;

  let mediaUrl: string | undefined;
  if (contentInfo.hasMedia && isLive) {
    mediaUrl = await persistIncomingMedia(sock, msg, `status_${statusId}`, contentInfo.mimeType, contentInfo.fileName);
  }

  const existing = statusStore.get(sessionId) || [];
  if (existing.some((s) => s.id === statusId)) return false;

  const cachedAvatar =
    profilePicCache.get(`${sessionId}:${canonicalSenderJid}`)?.url ||
    conversationMap.get(`${sessionId}:${canonicalSenderJid}`)?.avatarUrl;

  const statusItem: WhatsAppStatusItem = {
    id: statusId,
    sessionId,
    sessionLabel: metadata.label,
    senderJid: canonicalSenderJid,
    senderPhone,
    senderName,
    avatarUrl: cachedAvatar || undefined,
    text: contentInfo.text,
    mediaType: contentInfo.mediaType,
    mediaUrl,
    timestamp: timestampMs
  };

  existing.unshift(statusItem);
  if (existing.length > 100) existing.length = 100;
  statusStore.set(sessionId, existing);
  scheduleSaveChatHistory();

  if (isLive) {
    broadcastSSE('status_received', statusItem);
  }
  return true;
}

async function ingestWaMessage(
  sock: WASocket,
  sessionId: string,
  metadata: SessionMetadata,
  msg: any,
  options: { runAi: boolean; broadcastLive: boolean }
): Promise<boolean> {
  if (!msg?.message || !msg?.key) return false;

  const rawRemoteJid = msg.key.remoteJid || '';
  if (rawRemoteJid === 'status@broadcast' || rawRemoteJid.includes('@status')) {
    await ingestStatusMessage(sock, sessionId, metadata, msg, options.broadcastLive);
    return false;
  }

  if (
    !rawRemoteJid ||
    rawRemoteJid.includes('broadcast') ||
    rawRemoteJid.includes('@newsletter')
  ) {
    return false;
  }

  const contentInfo = extractMessageContentInfo(msg.message);
  if (!contentInfo) return false;

  const fromMe = Boolean(msg.key.fromMe);
  const remoteJidAlt = (msg.key as any).remoteJidAlt;
  const participantAlt = (msg.key as any).participantAlt;

  const resolvedInfo = await resolvePhoneNumber(sock, rawRemoteJid, remoteJidAlt, participantAlt);

  // Detect self-chat (+phone (You)) instead of dropping it so "Message yourself" works like WhatsApp Web
  const myPhone = metadata.phoneNumber;
  const myLidUser = sock.user?.lid ? jidDecode(sock.user.lid)?.user : undefined;
  const remoteUser = jidDecode(rawRemoteJid)?.user;
  const isSelfChat = Boolean((myPhone && resolvedInfo.phone === myPhone) || (myLidUser && remoteUser === myLidUser));

  const canonicalRemoteJid =
    resolvedInfo.resolved && resolvedInfo.phone && /^\d{7,15}$/.test(resolvedInfo.phone)
      ? `${resolvedInfo.phone}@s.whatsapp.net`
      : rawRemoteJid;

  const rawKey = `${sessionId}:${rawRemoteJid}`;
  const storeKey = `${sessionId}:${canonicalRemoteJid}`;

  // Merge legacy unresolved @lid thread into resolved phone thread if present
  if (rawKey !== storeKey) {
    const legacyMsgs = messageStore.get(rawKey);
    if (legacyMsgs?.length) {
      legacyMsgs.forEach((m) => upsertMessageIntoStore(storeKey, { ...m, remoteJid: canonicalRemoteJid }));
      messageStore.delete(rawKey);
    }
    const legacyConv = conversationMap.get(rawKey);
    if (legacyConv && !conversationMap.get(storeKey)) {
      conversationMap.set(storeKey, { ...legacyConv, id: storeKey, remoteJid: canonicalRemoteJid });
    }
    conversationMap.delete(rawKey);
  }

  const displayPhone = resolvedInfo.resolved ? resolvedInfo.phone : '';
  const pushCandidate = !fromMe ? msg.pushName : undefined;
  const isGroup = rawRemoteJid.endsWith('@g.us');
  const storedName = isSelfChat
    ? `+${displayPhone || myPhone || ''} (You)`
    : contactNameMap.get(displayPhone) ||
    contactNameMap.get(remoteUser || '') ||
    pushCandidate ||
    (displayPhone && !isGroup ? `+${displayPhone}` : isGroup ? 'Group Chat' : 'WhatsApp User');

  const timestampMs = normalizeWaTimestampMs(msg.messageTimestamp);
  const msgId = msg.key.id || `${timestampMs}-${Math.random().toString(36).slice(2, 7)}`;

  // Download media eagerly only for live/recent upsert messages (history CDN links may expire and reset)
  let mediaUrl: string | undefined;
  if (contentInfo.hasMedia && options.broadcastLive) {
    const existingList = messageStore.get(storeKey);
    const alreadyExists = existingList?.some((m) => m.id === msgId);
    if (!alreadyExists) {
      mediaUrl = await persistIncomingMedia(sock, msg, msgId, contentInfo.mimeType, contentInfo.fileName);
    }
  }

  const chatMsg: ChatMessage = {
    id: msgId,
    sessionId,
    remoteJid: canonicalRemoteJid,
    fromMe,
    senderPhone: displayPhone,
    senderName: fromMe ? 'You' : storedName,
    text: contentInfo.text,
    timestamp: timestampMs,
    hasMedia: contentInfo.hasMedia,
    mediaType: contentInfo.mediaType,
    mediaUrl,
    fileName: contentInfo.fileName,
    mimeType: contentInfo.mimeType
  };

  const added = upsertMessageIntoStore(storeKey, chatMsg);

  const prevConv = conversationMap.get(storeKey);
  const existingInsight = leadInsights.get(canonicalRemoteJid) || leadInsights.get(rawRemoteJid) || prevConv?.insight;
  const isPlaceholderPreview =
    !prevConv ||
    prevConv.lastMessage === 'Synced WhatsApp chat' ||
    prevConv.lastMessage === 'Message yourself';
  const shouldUpdateLatest = isPlaceholderPreview || timestampMs >= prevConv.timestamp;

  const bestName = isSelfChat
    ? storedName
    : (prevConv?.name && !prevConv.name.startsWith('+') && prevConv.name !== 'WhatsApp User' && prevConv.name !== 'Group Chat'
      ? prevConv.name
      : '') || storedName;

  const nextUnreadCount =
    options.broadcastLive && !fromMe && added
      ? (prevConv?.unreadCount || 0) + 1
      : prevConv?.unreadCount || 0;

  const summary: ConversationSummary = {
    id: storeKey,
    sessionId,
    sessionLabel: metadata.label,
    remoteJid: canonicalRemoteJid,
    phone: displayPhone || prevConv?.phone || '',
    phoneResolved: Boolean(displayPhone) || Boolean(prevConv?.phoneResolved),
    name: bestName,
    lastMessage: shouldUpdateLatest ? contentInfo.text : prevConv.lastMessage,
    timestamp: shouldUpdateLatest ? timestampMs : prevConv.timestamp,
    unreadCount: nextUnreadCount,
    isGroup: isGroup || prevConv?.isGroup,
    isSelfChat: isSelfChat || prevConv?.isSelfChat,
    avatarUrl: prevConv?.avatarUrl || profilePicCache.get(`${sessionId}:${canonicalRemoteJid}`)?.url || undefined,
    insight: existingInsight
  };
  conversationMap.set(storeKey, summary);

  if (options.broadcastLive && added) {
    broadcastSSE('incoming_message', {
      sessionId,
      remoteJid: canonicalRemoteJid,
      conversation: summary,
      message: chatMsg
    });
    scheduleSaveChatHistory();
  }

  if (options.runAi && !fromMe && !isSelfChat && !isGroup && contentInfo.text.trim().length > 1 && added) {
    const recentContext = (messageStore.get(storeKey) || [])
      .slice(-6)
      .map((m) => `${m.fromMe ? 'Agent' : 'Customer'}: ${m.text}`)
      .join('\n');

    analyzeMessageForLead(contentInfo.text, displayPhone, storedName, recentContext).then((insight) => {
      leadInsights.set(canonicalRemoteJid, insight);
      const conv = conversationMap.get(storeKey);
      if (conv) {
        conv.insight = insight;
        conversationMap.set(storeKey, conv);
        scheduleSaveChatHistory();
      }
      broadcastSSE('lead_detected', {
        sessionId,
        remoteJid: canonicalRemoteJid,
        phone: displayPhone,
        name: bestName || storedName,
        sessionLabel: metadata.label,
        messageText: contentInfo.text,
        timestamp: timestampMs,
        insight
      });
    });
  }

  return added;
}

const ALLOWED_CRM_STAGES = new Set([
  'new_enquiry',
  'requirement_collection',
  'requirement_confirmed',
  'design_stage',
  'design_approval',
  'quotation_sent',
  'follow_up',
  'advance_payment',
  'lost_cancelled'
]);

const NOISE_PATTERN =
  /^(\[new whatsapp message\]|photo|photos|video|videos|audio|voice\s*message|sticker|gif|document|image|contact\s*card|location|missed\s*(?:voice|video)\s*call|this message was deleted)$|\b(otp|verification code|debited|credited|a\/c|balance|lottery|win cash|work from home|unsubscribe|reminder: action needed)\b/i;
const BUSINESS_KEYWORD_PATTERN =
  /\b(troph(?:y|ies)|award(?:s)?|medal(?:s)?|memento(?:s)?|momento(?:s|es)?|shield(?:s)?|plaque(?:s)?|crystal|acrylic|wooden|corporate\s*gift(?:s)?|souvenir(?:s)?|ecotrophy|crest(?:s)?|badge(?:s)?|enquir(?:y|ies)|inquir(?:y|ies)|quot(?:e|ation)|pric(?:e|ing)|cost|rate(?:s)?|budget|estimat(?:e|ion)|catalog(?:ue)?|brochure|bulk\s*order|sample(?:s)?|mockup(?:s)?|engrav(?:e|ing)|proforma|invoice|moq|minimum\s*order|how\s*much|rate\s*enna|price\s*enna|evlo|evalavu|paid\s*advance|advance\s*paid|payment\s*done|payment|upi|gpay|utr|panniten|(?:place|new|want\s*to|need(?:\s*to)?|confirm)\s+(?:\w+\s+)?order)\b/i;

function inferPipelineStage(text: string, quantity: string, isBusinessLead: boolean): string {
  if (!isBusinessLead) return 'new_enquiry';
  const lower = (text || '').toLowerCase();

  if (/\b(cancel(led)? order|not interested|dropped|no longer need)\b/i.test(lower)) {
    return 'lost_cancelled';
  }
  if (
    /\b(paid advance|advance paid|payment done|payment transferred|utr|transaction id)\b/i.test(lower) &&
    !/\b(send|share|how to|what is)\b/i.test(lower)
  ) {
    return 'advance_payment';
  }
  if (/\b(design approved|approve the design|approved|looks good.*proceed|finalize design)\b/i.test(lower)) {
    return 'design_approval';
  }
  if (/\b(mockup|design|logo|artwork|font|layout|correction)\b/i.test(lower)) {
    return 'design_stage';
  }
  if (
    Boolean(quantity) ||
    /\b(send quotation|share quote|confirm(ed)? requirement|need by|delivery by)\b/i.test(lower)
  ) {
    return 'requirement_confirmed';
  }
  if (BUSINESS_KEYWORD_PATTERN.test(lower)) {
    return 'requirement_collection';
  }
  return 'new_enquiry';
}

// Smart Rule-based Fallback Extraction (used if Gemini API is offline or key missing)
function heuristicAnalysis(text: string, phone: string, senderName: string, recentContext = ''): AiLeadInsight {
  const combined = `${recentContext ? `${recentContext}\n` : ''}${text || ''}`.trim();
  const lower = (combined || '').toLowerCase();

  // Extract quantity (supports adjectives like "150 crystal trophies" and compact "50pcs" without matching "8 inch" dimensions)
  const qtyMatch =
    combined.match(
      /\b(\d{1,5})(?:(?:\s+(?!inch|inches|cm|mm|ft|rs|inr|rupees|budget|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]+){0,2})\s*(pcs|pieces|nos|units|sets|trophies|trophy|awards|award|medals|medal|shields|shield|mementos|memento|plaques|plaque|cups|cup)\b/i
    ) || combined.match(/\b(?:qty|quantity)\s*[:=-]?\s*(\d{1,5})\b/i);
  const quantity = qtyMatch && Number(qtyMatch[1]) > 0 && Number(qtyMatch[1]) < 100000 ? `${qtyMatch[1]} pcs` : '';

  // Extract budget
  const budgetMatch = combined.match(/(?:rs\.?|inr|₹|budget\s*(?:is|around)?)\s*([\d,]+k?)/i);
  const budget = budgetMatch ? `₹${budgetMatch[1]}` : '';

  // Extract size & event hints
  const sizeMatch = combined.match(/(\d{1,2}(?:\.\d)?)\s*(?:inch|inches|cm)\b/i);
  const trophySize = sizeMatch ? `${sizeMatch[1]} Inch` : '';

  const isNoise = NOISE_PATTERN.test(text || '');
  const hasBusinessSignal = BUSINESS_KEYWORD_PATTERN.test(lower) || Boolean(quantity) || Boolean(budget);
  const isBusinessLead = !isNoise && hasBusinessSignal;

  // Urgency detection
  let urgency: 'low' | 'medium' | 'high' = 'medium';
  if (lower.includes('urgent') || lower.includes('tomorrow') || lower.includes('asap') || lower.includes('today') || lower.includes('this week') || lower.includes('next friday')) {
    urgency = 'high';
  }

  const pipelineStage = inferPipelineStage(combined, quantity, isBusinessLead);
  const stage: 'new' | 'contacted' | 'qualified' | 'lost' =
    pipelineStage === 'lost_cancelled'
      ? 'lost'
      : isBusinessLead && (Boolean(quantity) || Boolean(budget) || pipelineStage !== 'new_enquiry')
        ? 'qualified'
        : 'new';

  const suggestedAction = isBusinessLead
    ? quantity
      ? `Draft Quotation for ${quantity}`
      : 'Collect Quantity & Event Requirements'
    : 'No CRM Action Needed (Personal / Promo Chat)';

  const suggestedReply = isBusinessLead
    ? `Hello ${senderName !== 'Customer' ? senderName : ''}! Thank you for reaching out to EcoTrophy. We have received your requirement${quantity ? ` for ${quantity}` : ''}. Our team is preparing details & pricing for you right away. Could you also share any preferred model or delivery date?`
    : `Hello ${senderName !== 'Customer' ? senderName : ''}! Thank you for messaging EcoTrophy Innovations.`;

  return {
    leadName: senderName || (phone ? `+${phone}` : 'WhatsApp Lead'),
    company: '',
    phone: phone,
    requirement: (text || combined).slice(0, 140),
    quantity,
    budget,
    trophySize,
    urgency,
    stage,
    pipelineStage,
    isBusinessLead,
    suggestedAction,
    suggestedReply: suggestedReply.replace(/\s+/g, ' ').trim(),
    analyzedAt: Date.now()
  };
}

const GEMINI_API_KEY =
  process.env.VITE_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  '';

async function analyzeMessageForLead(
  text: string,
  phone: string,
  senderName: string,
  recentContext = ''
): Promise<AiLeadInsight> {
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  if (!GEMINI_API_KEY) {
    return heuristicAnalysis(text, cleanPhone, senderName, recentContext);
  }

  try {
    const ai = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
You are an expert CRM sales AI assistant for EcoTrophy Innovations (trophies, awards, mementos, medals, plaques, corporate gifts).
Analyze this incoming WhatsApp message (and recent chat context if present).

Sender Phone: ${cleanPhone || 'Unknown'}
Sender Name: ${senderName}
${recentContext ? `Recent Chat Context:\n${recentContext}\n` : ''}Latest Message: "${text}"

Determine:
1. "isBusinessLead": boolean — TRUE only if this is a clear customer product enquiry, quote/price/catalog request, custom trophy/award/medal/memento/corporate-gift request, design/artwork discussion, or order/payment follow-up. FALSE for ALL regular/personal conversations ("hi", "hello", "call me", "where are you", friend/family/staff chats), greetings, media-only messages ("Photo", "Video"), spam, OTPs, bank alerts, or ambiguous chats without enquiry intent.
2. "pipelineStage": exact CRM stage ID from this list ONLY:
   - "new_enquiry" (initial inquiry with minimal details)
   - "requirement_collection" (asking prices/catalog/type without complete specs/quantity yet)
   - "requirement_confirmed" (gave quantity/product/event/budget details ready for quotation)
   - "design_stage" (discussing artwork, engraving, logo, mockup)
   - "design_approval" (approving design mockup)
   - "follow_up" (following up after quote)
   - "advance_payment" (explicitly confirming advance payment already paid)
   - "lost_cancelled" (cancelling order / not interested)

Respond with ONLY raw JSON without markdown code fences in this schema:
{
  "isBusinessLead": true,
  "leadName": "string (name of person or organization)",
  "company": "string (company/school/organization if mentioned, else empty)",
  "email": "string (if mentioned, else empty)",
  "location": "string (city/area if mentioned, else empty)",
  "requirement": "string (concise product & order requirement summary)",
  "quantity": "string (numeric count like '50 pcs' or '' if not given)",
  "budget": "string (budget/price figure or '')",
  "trophyType": "string (e.g. Crystal Trophy, Wooden Plaque, Medals, or '')",
  "trophySize": "string (e.g. 8 Inch, or '')",
  "eventName": "string (event name if mentioned, or '')",
  "eventDate": "string (event date if mentioned, or '')",
  "deliveryDate": "string (delivery date if mentioned, or '')",
  "urgency": "low" | "medium" | "high",
  "stage": "new" | "contacted" | "qualified" | "lost",
  "pipelineStage": "new_enquiry" | "requirement_collection" | "requirement_confirmed" | "design_stage" | "design_approval" | "follow_up" | "advance_payment" | "lost_cancelled",
  "suggestedAction": "string",
  "suggestedReply": "string"
}
`;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text().trim();
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    const heuristicFallback = heuristicAnalysis(text, cleanPhone, senderName, recentContext);

    const safeStage = ALLOWED_CRM_STAGES.has(parsed.pipelineStage)
      ? parsed.pipelineStage
      : inferPipelineStage(text, parsed.quantity || heuristicFallback.quantity, Boolean(parsed.isBusinessLead));

    return {
      leadName: parsed.leadName || senderName || 'Prospective Client',
      company: parsed.company || '',
      phone: cleanPhone,
      email: parsed.email || '',
      location: parsed.location || '',
      requirement: parsed.requirement || text.slice(0, 120),
      quantity: parsed.quantity || heuristicFallback.quantity || '',
      budget: parsed.budget || heuristicFallback.budget || '',
      trophyType: parsed.trophyType || '',
      trophySize: parsed.trophySize || heuristicFallback.trophySize || '',
      eventName: parsed.eventName || '',
      eventDate: parsed.eventDate || '',
      deliveryDate: parsed.deliveryDate || '',
      urgency: parsed.urgency || 'medium',
      stage: parsed.stage || 'new',
      pipelineStage: safeStage,
      isBusinessLead: typeof parsed.isBusinessLead === 'boolean' ? parsed.isBusinessLead : heuristicFallback.isBusinessLead,
      suggestedAction: parsed.suggestedAction || 'Follow up with customer catalog',
      suggestedReply: parsed.suggestedReply || 'Thank you for contacting EcoTrophy. We would be delighted to assist with your requirement.',
      analyzedAt: Date.now()
    };
  } catch (err) {
    return heuristicAnalysis(text, cleanPhone, senderName, recentContext);
  }
}

const CASUAL_CHAT_ONLY_RE =
  /^(hi+|hlo|hello+|hey+|hai|vanakkam|namaste|good\s*(?:morning|afternoon|evening|night)|gm|gn|happy\s+[\w\s]+|ok+|okay+|kk|k|done|sure|yes|no|nope|yeah|yup|thanks?|thank\s*you|tq|ty|noted|welcome|fine|super|nice|cool|great|call\s*me(?:\s*back)?|call\s*later|busy|in\s*(?:a\s*)?meeting|where\s*(?:are|r)\s*you|how\s*(?:are|r)\s*you|what(?:'s|s)?\s*up|coming|reached|left|on\s*the\s*way|check\s*(?:this|it)|see\s*(?:this|you)|👍+|🙏+|👌+|❤️+)[.!?\s]*$/i;

function isNonEnquiryNoiseOrCasual(latestText: string, combinedText: string): boolean {
  const trimmed = String(latestText || '').trim();
  if (!trimmed || trimmed.length < 2) return true;
  if (NOISE_PATTERN.test(trimmed)) return true;
  if (CASUAL_CHAT_ONLY_RE.test(trimmed) && !BUSINESS_KEYWORD_PATTERN.test(combinedText)) return true;
  return false;
}

export async function extractQualifiedLeadsFromHistory(opts: {
  sessionId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  totalScanned: number;
  leads: Array<{
    sessionId: string;
    sessionLabel: string;
    sourceWhatsappNumber: string;
    remoteJid: string;
    phone: string;
    name: string;
    messageText: string;
    timestamp: number;
    insight: AiLeadInsight;
  }>;
}> {
  const targetSessionId = opts.sessionId && opts.sessionId !== 'all' ? opts.sessionId : '';
  const hasRange = Boolean(opts.startDate && opts.endDate);
  const startMs = hasRange ? new Date(`${opts.startDate}T00:00:00`).getTime() : 0;
  const endMs = hasRange ? new Date(`${opts.endDate}T23:59:59.999`).getTime() : Date.now() + 86400000;

  const candidates: Array<{
    conv: ConversationSummary;
    messageText: string;
    recentContext: string;
    timestamp: number;
  }> = [];

  let totalScanned = 0;

  for (const conv of conversationMap.values()) {
    if (targetSessionId && conv.sessionId !== targetSessionId) continue;
    if (conv.isGroup || conv.remoteJid.endsWith('@g.us') || conv.isSelfChat) continue;
    if (conv.remoteJid.includes('broadcast') || conv.remoteJid.includes('@newsletter')) continue;

    const msgs = messageStore.get(conv.id) || [];
    const inboundInRange = msgs.filter(
      (m) => !m.fromMe && m.text && (!hasRange || (m.timestamp >= startMs && m.timestamp <= endMs))
    );

    let messageText = '';
    let recentContext = '';
    let effectiveTs = 0;

    if (inboundInRange.length > 0) {
      const latestInbound = inboundInRange[inboundInRange.length - 1];
      messageText = latestInbound.text;
      effectiveTs = latestInbound.timestamp;
      recentContext = msgs
        .filter((m) => !hasRange || (m.timestamp >= startMs && m.timestamp <= endMs))
        .slice(-8)
        .map((m) => `${m.fromMe ? 'Agent' : 'Customer'}: ${m.text}`)
        .join('\n');
    } else if (
      msgs.length === 0 &&
      conv.lastMessage &&
      conv.lastMessage !== 'Synced WhatsApp chat' &&
      conv.lastMessage !== 'Message yourself' &&
      (!hasRange || (conv.timestamp >= startMs && conv.timestamp <= endMs))
    ) {
      messageText = conv.lastMessage;
      effectiveTs = conv.timestamp;
      recentContext = conv.lastMessage;
    } else {
      continue;
    }

    totalScanned += 1;
    const combinedInbound = inboundInRange.slice(-6).map((m) => m.text).join('\n') || messageText;
    if (isNonEnquiryNoiseOrCasual(messageText, combinedInbound)) continue;

    candidates.push({
      conv,
      messageText,
      recentContext,
      timestamp: effectiveTs || conv.timestamp || Date.now()
    });
  }

  const leads: Array<{
    sessionId: string;
    sessionLabel: string;
    sourceWhatsappNumber: string;
    remoteJid: string;
    phone: string;
    name: string;
    messageText: string;
    timestamp: number;
    insight: AiLeadInsight;
  }> = [];

  const concurrency = 3;
  for (let i = 0; i < candidates.length; i += concurrency) {
    const slice = candidates.slice(i, i + concurrency);
    const analyzed = await Promise.all(
      slice.map(async (item) => {
        const { conv, messageText, recentContext, timestamp } = item;
        const sessionMeta = sessionRegistry.get(conv.sessionId);

        let insight: AiLeadInsight | undefined = !hasRange ? (conv.insight || leadInsights.get(conv.remoteJid)) : undefined;
        if (!insight) {
          insight = await analyzeMessageForLead(messageText, conv.phone || '', conv.name || 'Customer', recentContext);
          if (!hasRange) {
            leadInsights.set(conv.remoteJid, insight);
            conv.insight = insight;
            conversationMap.set(conv.id, conv);
          }
        }

        if (insight.isBusinessLead !== true) return null;

        return {
          sessionId: conv.sessionId,
          sessionLabel: conv.sessionLabel || sessionMeta?.label || 'WhatsApp Account',
          sourceWhatsappNumber: sessionMeta?.phoneNumber || '',
          remoteJid: conv.remoteJid,
          phone: conv.phone || insight.phone || '',
          name: conv.name || insight.leadName || 'WhatsApp Lead',
          messageText,
          timestamp,
          insight
        };
      })
    );

    for (const row of analyzed) {
      if (row) leads.push(row);
    }
  }

  if (leads.length > 0) {
    scheduleSaveChatHistory();
  }

  return { totalScanned, leads };
}

function scheduleQrHistoryLeadSync(sessionId: string, delayMs = 3000) {
  if (!pendingQrHistorySync.has(sessionId)) return;
  if (qrHistorySyncTimers.has(sessionId)) {
    clearTimeout(qrHistorySyncTimers.get(sessionId));
  }
  const timer = setTimeout(async () => {
    qrHistorySyncTimers.delete(sessionId);
    if (!pendingQrHistorySync.has(sessionId)) return;
    pendingQrHistorySync.delete(sessionId);

    try {
      const { totalScanned, leads } = await extractQualifiedLeadsFromHistory({ sessionId });
      recentQrBulkBatches.set(sessionId, {
        sessionId,
        createdAt: Date.now(),
        totalScanned,
        leads
      });
      if (leads.length > 0 || totalScanned > 0) {
        broadcastSSE('bulk_leads_ready', {
          sessionId,
          trigger: 'qr_scan',
          totalScanned,
          leads
        });
      }
      console.log(
        `[Session ${sessionId}] QR Scan Auto-Sync: Scanned ${totalScanned} chat(s), qualified ${leads.length} lead(s).`
      );
    } catch (err) {
      console.error(`[Session ${sessionId}] QR Scan Auto-Sync error:`, err);
    }
  }, delayMs);

  qrHistorySyncTimers.set(sessionId, timer);
}

// Baileys Session Initializer
export async function initSession(sessionId: string, label: string) {
  if (reconnectTimers.has(sessionId)) {
    clearTimeout(reconnectTimers.get(sessionId));
    reconnectTimers.delete(sessionId);
  }

  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  let metadata = sessionRegistry.get(sessionId);
  if (!metadata) {
    metadata = {
      id: sessionId,
      label: label || `WhatsApp Account ${sessionRegistry.size + 1}`,
      status: 'connecting',
      createdAt: Date.now(),
      lastActive: Date.now()
    };
    sessionRegistry.set(sessionId, metadata);
    saveRegistry();
  } else {
    metadata.status = 'connecting';
    metadata.label = label || metadata.label;
  }
  broadcastSSE('session_update', metadata);

  if (activeSockets.has(sessionId)) {
    const prevSock = activeSockets.get(sessionId)!;
    intentionallyClosedSockets.add(prevSock);
    activeSockets.delete(sessionId);
    try {
      prevSock.end(undefined);
    } catch (e) { }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const safeSaveCreds = async () => {
    try {
      if (intentionallyClosedSockets.has(sock)) return;
      if (!fs.existsSync(sessionDir)) return;
      await saveCreds();
    } catch (e) { }
  };

  const originalKeysSet = state.keys.set.bind(state.keys);
  state.keys.set = async (data) => {
    try {
      if (!fs.existsSync(sessionDir)) return;
      await originalKeysSet(data);
    } catch (e) { }
  };

  const { version } = await fetchLatestBaileysVersion();
  const socketLogger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    logger: socketLogger,
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.windows('Chrome'),
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true
  });

  activeSockets.set(sessionId, sock);
  sock.ev.on('creds.update', safeSaveCreds);

  // Capture contact names and LID <-> Phone mappings from Baileys events
  sock.ev.on('lid-mapping.update', (mapping) => {
    recordLidMapping(mapping.lid, mapping.pn);
  });

  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) {
      if (c.lid && c.id?.endsWith('@s.whatsapp.net')) {
        recordLidMapping(c.lid, c.id);
      } else if (c.id?.endsWith('@lid') && c.phoneNumber) {
        recordLidMapping(c.id, c.phoneNumber);
      }
      const key = jidDecode(c.id)?.user || c.id;
      const displayName = c.name || c.notify || c.verifiedName;
      if (key && displayName) {
        contactNameMap.set(key, displayName);
      }
    }
    saveLidCache();
  });

  sock.ev.on('contacts.update', (contacts) => {
    for (const c of contacts) {
      if (c.lid && c.id?.endsWith('@s.whatsapp.net')) {
        recordLidMapping(c.lid, c.id);
      } else if (c.id?.endsWith('@lid') && c.phoneNumber) {
        recordLidMapping(c.id, c.phoneNumber);
      }
      if (c.id) {
        const key = jidDecode(c.id)?.user || c.id;
        const displayName = c.name || c.notify || c.verifiedName;
        if (key && displayName) {
          contactNameMap.set(key, displayName);
        }
      }
    }
    saveLidCache();
  });

  const upsertSyncedChatStub = (chat: any): boolean => {
    const rawJid = chat?.id;
    if (!rawJid || rawJid.includes('@status') || rawJid.includes('broadcast') || rawJid.includes('@newsletter')) {
      return false;
    }
    if (chat.pnJid && chat.lidJid) {
      recordLidMapping(chat.lidJid, chat.pnJid);
    }
    const rawUser = jidDecode(rawJid)?.user || rawJid.split('@')[0].split(':')[0];
    if (chat.name && rawUser) {
      contactNameMap.set(rawUser, chat.name);
    }

    const mappedPn = rawJid.endsWith('@lid') ? lidToPhoneMap.get(rawUser) : '';
    const pnDigits = chat.pnJid
      ? jidDecode(chat.pnJid)?.user || ''
      : rawJid.endsWith('@s.whatsapp.net') || rawJid.endsWith('@hosted')
        ? rawUser
        : mappedPn || '';

    const canonicalJid =
      pnDigits && /^\d{7,15}$/.test(pnDigits) ? `${pnDigits}@s.whatsapp.net` : rawJid;
    const isGroup = canonicalJid.endsWith('@g.us');
    const isSelfChat = Boolean(metadata.phoneNumber && pnDigits === metadata.phoneNumber);
    const storeKey = `${sessionId}:${canonicalJid}`;
    const existing = conversationMap.get(storeKey);

    const chatTs = normalizeWaTimestampMs(chat.conversationTimestamp || chat.lastMessageRecvTimestamp);
    const resolvedName = isSelfChat
      ? `+${pnDigits || metadata.phoneNumber || ''} (You)`
      : contactNameMap.get(pnDigits) ||
      contactNameMap.get(rawUser) ||
      chat.name ||
      (pnDigits && !isGroup ? `+${pnDigits}` : isGroup ? 'Group Chat' : 'WhatsApp User');

    const bestName =
      isSelfChat
        ? resolvedName
        : (existing?.name && !existing.name.startsWith('+') && existing.name !== 'WhatsApp User' && existing.name !== 'Group Chat'
          ? existing.name
          : '') || resolvedName;

    conversationMap.set(storeKey, {
      id: storeKey,
      sessionId,
      sessionLabel: metadata.label,
      remoteJid: canonicalJid,
      phone: pnDigits || existing?.phone || '',
      phoneResolved: Boolean(pnDigits) || Boolean(existing?.phoneResolved),
      name: bestName,
      lastMessage: existing?.lastMessage || (isSelfChat ? 'Message yourself' : 'Synced WhatsApp chat'),
      timestamp: existing ? Math.max(existing.timestamp, chatTs) : chatTs,
      unreadCount: typeof chat.unreadCount === 'number' && chat.unreadCount >= 0 ? chat.unreadCount : existing?.unreadCount || 0,
      isGroup: isGroup || existing?.isGroup,
      isSelfChat: isSelfChat || existing?.isSelfChat,
      avatarUrl: existing?.avatarUrl || profilePicCache.get(`${sessionId}:${canonicalJid}`)?.url || undefined,
      insight: existing?.insight || leadInsights.get(canonicalJid)
    });
    return true;
  };

  sock.ev.on('chats.upsert', (chats) => {
    let changed = false;
    for (const chat of chats) {
      if (upsertSyncedChatStub(chat)) changed = true;
    }
    if (changed) {
      saveLidCache();
      scheduleSaveChatHistory();
      broadcastSSE('history_synced', {
        sessionId,
        totalCount: conversationMap.size
      });
    }
  });

  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, lidPnMappings }) => {
    if (lidPnMappings) {
      for (const pair of lidPnMappings) {
        recordLidMapping(pair.lid, pair.pn);
      }
    }
    if (contacts) {
      for (const c of contacts) {
        if (c.lid && c.id?.endsWith('@s.whatsapp.net')) {
          recordLidMapping(c.lid, c.id);
        } else if (c.id?.endsWith('@lid') && c.phoneNumber) {
          recordLidMapping(c.id, c.phoneNumber);
        }
        const key = jidDecode(c.id)?.user || c.id;
        const displayName = c.name || c.notify || c.verifiedName;
        if (key && displayName) {
          contactNameMap.set(key, displayName);
        }
      }
    }

    let chatStubsImported = 0;
    if (chats) {
      for (const chat of chats) {
        if (upsertSyncedChatStub(chat)) chatStubsImported++;
      }
    }
    saveLidCache();

    let importedCount = 0;
    if (messages?.length) {
      for (const msg of messages) {
        const added = await ingestWaMessage(sock, sessionId, metadata, msg, {
          runAi: false,
          broadcastLive: false
        });
        if (added) importedCount++;
      }
    }

    if (importedCount > 0 || chatStubsImported > 0) {
      saveChatHistoryNow();
      console.log(
        `[Session ${sessionId}] Synced ${importedCount} historical message(s) and ${chatStubsImported} chat(s) (${conversationMap.size} total chats).`
      );
      broadcastSSE('history_synced', {
        sessionId,
        totalCount: conversationMap.size
      });
      if (pendingQrHistorySync.has(sessionId)) {
        scheduleQrHistoryLeadSync(sessionId, 3000);
      }
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      pendingQrHistorySync.add(sessionId);
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, {
          margin: 4,
          scale: 8,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#FFFFFF' }
        });
        metadata.status = 'qr_ready';
        metadata.qrCodeDataUrl = qrDataUrl;
        broadcastSSE('session_update', metadata);
      } catch (qrErr) {
        console.error(`[Session ${sessionId}] Failed to create QR Data URL:`, qrErr);
      }
    }

    if (connection === 'close') {
      if (intentionallyClosedSockets.has(sock) || activeSockets.get(sessionId) !== sock) {
        return;
      }

      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const errMsg = (lastDisconnect?.error as any)?.message || '';
      const isPairingRestart = statusCode === DisconnectReason.restartRequired || statusCode === 515;
      const hasSavedCreds = fs.existsSync(path.join(sessionDir, 'creds.json'));
      const isQrTimeout = statusCode === 408 && metadata.status === 'qr_ready';
      const nextQrAttempts = isQrTimeout ? (qrTimeoutCounts.get(sessionId) || 0) + 1 : 0;
      qrTimeoutCounts.set(sessionId, nextQrAttempts);

      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut && (!isQrTimeout || nextQrAttempts < 3);
      console.log(
        `[Session ${sessionId}] Connection closed. Code: ${statusCode} (${errMsg}), shouldReconnect: ${shouldReconnect}`
      );

      if (shouldReconnect && (isPairingRestart || hasSavedCreds)) {
        // Keep status 'connecting' during 515 pairing restart so the UI doesn't flash 'QR Session Timed Out'
        metadata.status = 'connecting';
        metadata.qrCodeDataUrl = undefined;
      } else {
        metadata.status = 'disconnected';
        metadata.qrCodeDataUrl = undefined;
      }
      broadcastSSE('session_update', metadata);

      if (shouldReconnect) {
        const delayMs = isPairingRestart ? 300 : 4000;
        if (!reconnectTimers.has(sessionId)) {
          const t = setTimeout(() => {
            reconnectTimers.delete(sessionId);
            if (sessionRegistry.has(sessionId)) {
              initSession(sessionId, metadata.label);
            }
          }, delayMs);
          reconnectTimers.set(sessionId, t);
        }
      } else if (statusCode === DisconnectReason.loggedOut) {
        intentionallyClosedSockets.add(sock);
        activeSockets.delete(sessionId);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (e) { }
        clearSessionHistory(sessionId);
      }
    } else if (connection === 'open') {
      if (intentionallyClosedSockets.has(sock)) return;
      qrTimeoutCounts.set(sessionId, 0);
      console.log(`[Session ${sessionId}] Successfully connected!`);
      const userJid = sock.user?.id || '';
      const rawNumber = userJid.split(':')[0] || userJid.split('@')[0];

      // Record own LID -> Phone mapping too
      if (sock.user?.lid && userJid) {
        recordLidMapping(sock.user.lid, userJid);
      }

      metadata.status = 'connected';
      metadata.phoneNumber = rawNumber;
      metadata.pushName = sock.user?.name || 'WhatsApp Account';
      metadata.qrCodeDataUrl = undefined;
      metadata.lastActive = Date.now();
      saveRegistry();
      broadcastSSE('session_update', metadata);

      if (pendingQrHistorySync.has(sessionId)) {
        scheduleQrHistoryLeadSync(sessionId, 6000);
      }

      // Hydrate own profile picture & About status asynchronously
      if (rawNumber) {
        const ownJid = `${rawNumber}@s.whatsapp.net`;
        Promise.all([resolveAvatarForSessionJid(sock, sessionId, ownJid), resolveContactAbout(sock, ownJid)]).then(
          ([avatar, about]) => {
            if (avatar || about) {
              if (avatar) metadata.avatarUrl = avatar;
              if (about) metadata.aboutStatus = about;
              saveRegistry();
              broadcastSSE('session_update', metadata);
            }
          }
        );
      }
    }
  });

  // Listen to live contact presence (online / typing / recording / last seen)
  sock.ev.on('presence.update', async ({ id, presences }) => {
    if (!id || !presences) return;
    const resolved = await resolvePhoneNumber(sock, id);
    const canonicalJid =
      resolved.resolved && resolved.phone && /^\d{7,15}$/.test(resolved.phone)
        ? `${resolved.phone}@s.whatsapp.net`
        : id;

    const firstEntry = Object.values(presences)[0];
    if (!firstEntry) return;

    const mappedPresence = {
      presence: firstEntry.lastKnownPresence || 'unavailable',
      lastSeen: firstEntry.lastSeen ? normalizeWaTimestampMs(firstEntry.lastSeen) : undefined,
      updatedAt: Date.now()
    };
    presenceMap.set(`${sessionId}:${canonicalJid}`, mappedPresence);

    broadcastSSE('presence_update', {
      sessionId,
      remoteJid: canonicalJid,
      presence: mappedPresence.presence,
      lastSeen: mappedPresence.lastSeen
    });
  });

  // Listen to incoming, outgoing, and offline/history upsert messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const isLive = type === 'notify';
    let batchAdded = false;

    for (const msg of messages) {
      const added = await ingestWaMessage(sock, sessionId, metadata, msg, {
        runAi: isLive,
        broadcastLive: isLive
      });
      if (added) batchAdded = true;
    }

    if (batchAdded && !isLive) {
      scheduleSaveChatHistory();
      broadcastSSE('history_synced', {
        sessionId,
        totalCount: conversationMap.size
      });
      if (pendingQrHistorySync.has(sessionId)) {
        scheduleQrHistoryLeadSync(sessionId, 3000);
      }
    }
  });
}

// Express App
const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

registerReconciliationMailerRoutes(app);

app.get('/api/whatsapp/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    activeSessions: activeSockets.size,
    totalRegistered: sessionRegistry.size,
    timestamp: Date.now()
  });
});

app.get('/api/whatsapp/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  const conversations = getSortedConversations();
  res.write(
    `event: init\ndata: ${JSON.stringify({
      sessions: Array.from(sessionRegistry.values()),
      conversations,
      statuses: getAllRecentStatuses()
    })}\n\n`
  );

  // Replay recent QR-scan bulk batches (within last 3 minutes) so newly mounted tabs still receive them
  const replayCutoff = Date.now() - 3 * 60 * 1000;
  for (const batch of recentQrBulkBatches.values()) {
    if (batch.createdAt >= replayCutoff && batch.leads.length > 0) {
      res.write(
        `event: bulk_leads_ready\ndata: ${JSON.stringify({
          sessionId: batch.sessionId,
          trigger: 'qr_scan',
          totalScanned: batch.totalScanned,
          leads: batch.leads
        })}\n\n`
      );
    }
  }

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.post('/api/whatsapp/import-leads', async (req: Request, res: Response) => {
  try {
    const { sessionId, startDate, endDate, mode } = (req.body || {}) as {
      sessionId?: string;
      startDate?: string;
      endDate?: string;
      mode?: 'range' | 'all';
    };

    const isRange = mode !== 'all' && Boolean(startDate && endDate);
    if (isRange && startDate && endDate && startDate > endDate) {
      return res.status(400).json({ error: 'startDate must be on or before endDate' });
    }

    const result = await extractQualifiedLeadsFromHistory({
      sessionId,
      startDate: isRange ? startDate : undefined,
      endDate: isRange ? endDate : undefined
    });

    res.json({
      success: true,
      totalScanned: result.totalScanned,
      leads: result.leads
    });
  } catch (err: any) {
    console.error('[Import Leads] Failed:', err);
    res.status(500).json({ error: err?.message || 'Failed to import leads from WhatsApp history' });
  }
});

app.get('/api/whatsapp/sessions', (req: Request, res: Response) => {
  res.json({ sessions: Array.from(sessionRegistry.values()) });
});

app.get('/api/whatsapp/conversations', (req: Request, res: Response) => {
  res.json({ conversations: getSortedConversations() });
});

app.post('/api/whatsapp/sessions', async (req: Request, res: Response) => {
  try {
    const { label, id } = req.body;
    const sessionId = id || `session_${Date.now()}`;
    const sessionLabel = label || `WhatsApp Account ${sessionRegistry.size + 1}`;
    await initSession(sessionId, sessionLabel);
    res.json({ success: true, sessionId, session: sessionRegistry.get(sessionId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to initialize session' });
  }
});

app.get('/api/whatsapp/media/:fileName', (req: Request, res: Response) => {
  const safeName = path.basename(String(req.params.fileName || ''));
  if (!safeName) return res.status(400).send('Invalid file name');
  const fullPath = path.join(MEDIA_DIR, safeName);
  if (!fs.existsSync(fullPath)) return res.status(404).send('Media not found');
  res.sendFile(safeName, { root: MEDIA_DIR, dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).send('Media not found');
    }
  });
});

app.get('/api/whatsapp/profile-pic', async (req: Request, res: Response) => {
  const sessionId = String(req.query.sessionId || '');
  const jid = String(req.query.jid || '');
  const forceRefresh = req.query.refresh === '1';
  if (!sessionId || !jid) return res.json({ url: null });

  const sock = activeSockets.get(sessionId);
  if (!sock) return res.json({ url: conversationMap.get(`${sessionId}:${jid}`)?.avatarUrl || null });

  const url = await resolveAvatarForSessionJid(sock, sessionId, jid, forceRefresh);
  res.json({ url });
});

app.get('/api/whatsapp/contact-info', async (req: Request, res: Response) => {
  const sessionId = String(req.query.sessionId || '');
  const jid = String(req.query.jid || '');
  if (!sessionId || !jid) return res.status(400).json({ error: 'sessionId and jid required' });

  const sock = activeSockets.get(sessionId);
  if (!sock) {
    const existingConv = conversationMap.get(`${sessionId}:${jid}`);
    return res.json({
      avatarUrl: existingConv?.avatarUrl || null,
      about: contactAboutMap.get(jid)?.about || null,
      presence: presenceMap.get(`${sessionId}:${jid}`)?.presence || null,
      lastSeen: presenceMap.get(`${sessionId}:${jid}`)?.lastSeen || null
    });
  }

  // Subscribe to real-time online / typing presence updates for this contact
  sock.presenceSubscribe(jid).catch(() => {});

  const [avatarUrl, about] = await Promise.all([
    resolveAvatarForSessionJid(sock, sessionId, jid),
    resolveContactAbout(sock, jid)
  ]);

  const currentPresence = presenceMap.get(`${sessionId}:${jid}`);
  res.json({
    avatarUrl,
    about,
    presence: currentPresence?.presence || null,
    lastSeen: currentPresence?.lastSeen || null
  });
});

app.get('/api/whatsapp/statuses', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;
  res.json({ statuses: getAllRecentStatuses(sessionId) });
});

app.post('/api/whatsapp/conversations/read', (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '');
  const remoteJid = String(req.body?.remoteJid || '');
  if (!sessionId || !remoteJid) return res.status(400).json({ error: 'sessionId and remoteJid are required' });

  const storeKey = `${sessionId}:${remoteJid}`;
  const existing = conversationMap.get(storeKey);
  if (existing && (existing.unreadCount || 0) > 0) {
    existing.unreadCount = 0;
    conversationMap.set(storeKey, existing);
    scheduleSaveChatHistory();
    broadcastSSE('conversation_updated', existing);
  }
  res.json({ success: true });
});

app.get('/api/whatsapp/sessions/:id/qr', (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const session = sessionRegistry.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    id: session.id,
    label: session.label,
    status: session.status,
    qrCodeDataUrl: session.qrCodeDataUrl,
    phoneNumber: session.phoneNumber,
    pushName: session.pushName
  });
});

app.post('/api/whatsapp/sessions/:id/rescan', async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const existing = sessionRegistry.get(sessionId);
  if (!existing) return res.status(404).json({ error: 'Session not found' });

  try {
    if (reconnectTimers.has(sessionId)) {
      clearTimeout(reconnectTimers.get(sessionId));
      reconnectTimers.delete(sessionId);
    }
    qrTimeoutCounts.set(sessionId, 0);

    const sock = activeSockets.get(sessionId);
    if (sock) {
      intentionallyClosedSockets.add(sock);
      activeSockets.delete(sessionId);
      try {
        await sock.logout();
      } catch (e) { }
      try {
        sock.end(undefined);
      } catch (e) { }
    }

    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    await initSession(sessionId, existing.label);
    res.json({ success: true, session: sessionRegistry.get(sessionId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to restart QR pairing' });
  }
});

app.post('/api/whatsapp/sessions/:id/pairing-code', async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const existing = sessionRegistry.get(sessionId);
  if (!existing) return res.status(404).json({ error: 'Session not found' });

  const rawDigits = String(req.body?.phoneNumber || '').replace(/[^0-9]/g, '');
  if (!rawDigits || rawDigits.length < 10) {
    return res.status(400).json({ error: 'Enter a valid WhatsApp phone number with country code (e.g. 918148936699).' });
  }
  const phoneDigits = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits;

  try {
    if (reconnectTimers.has(sessionId)) {
      clearTimeout(reconnectTimers.get(sessionId));
      reconnectTimers.delete(sessionId);
    }
    let sock = activeSockets.get(sessionId);
    if (!sock || existing.status === 'disconnected') {
      const sessionDir = path.join(SESSIONS_DIR, sessionId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
      await initSession(sessionId, existing.label);
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const s = sessionRegistry.get(sessionId);
        if (s?.status === 'qr_ready') break;
      }
      sock = activeSockets.get(sessionId);
    }

    if (!sock) {
      return res.status(500).json({ error: 'WhatsApp socket not initialized yet.' });
    }

    const code = await sock.requestPairingCode(phoneDigits);
    const formatted = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
    res.json({ success: true, pairingCode: formatted });
  } catch (err: any) {
    console.error(`[Session ${sessionId}] Failed to generate pairing code:`, err);
    res.status(500).json({ error: err.message || 'Failed to generate pairing code. Try again cleanly.' });
  }
});

app.delete('/api/whatsapp/sessions/:id', async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  try {
    if (reconnectTimers.has(sessionId)) {
      clearTimeout(reconnectTimers.get(sessionId));
      reconnectTimers.delete(sessionId);
    }
    qrTimeoutCounts.delete(sessionId);

    const sock = activeSockets.get(sessionId);
    if (sock) {
      intentionallyClosedSockets.add(sock);
      activeSockets.delete(sessionId);
      try {
        await sock.logout();
      } catch (e) { }
      try {
        sock.end(undefined);
      } catch (e) { }
    }
    sessionRegistry.delete(sessionId);
    saveRegistry();
    clearSessionHistory(sessionId);

    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    broadcastSSE('session_deleted', { id: sessionId });
    res.json({ success: true, message: `Session ${sessionId} deleted.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete session' });
  }
});

// Get messages by sessionId and remoteJid (or fallback to phone)
app.get('/api/whatsapp/messages', (req: Request, res: Response) => {
  const { sessionId, remoteJid, phone } = req.query as { sessionId?: string; remoteJid?: string; phone?: string };
  if (!sessionId || (!remoteJid && !phone)) {
    return res.status(400).json({ error: 'sessionId and remoteJid (or phone) are required' });
  }

  let targetJid = remoteJid || '';
  if (!targetJid && phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    // Search matching conversation first (supports both @s.whatsapp.net and resolved @lid threads)
    for (const conv of conversationMap.values()) {
      if (conv.sessionId === sessionId && (conv.phone === cleanPhone || conv.remoteJid.includes(cleanPhone))) {
        targetJid = conv.remoteJid;
        break;
      }
    }
    if (!targetJid) {
      for (const key of messageStore.keys()) {
        if (key.startsWith(`${sessionId}:`) && key.includes(cleanPhone)) {
          targetJid = key.slice(sessionId.length + 1);
          break;
        }
      }
    }
    if (!targetJid) targetJid = `${cleanPhone}@s.whatsapp.net`;
  }

  const storeKey = `${sessionId}:${targetJid}`;
  const messages = messageStore.get(storeKey) || [];
  const insight = leadInsights.get(targetJid) || conversationMap.get(storeKey)?.insight || null;

  res.json({
    sessionId,
    remoteJid: targetJid,
    messages,
    insight
  });
});

app.post('/api/whatsapp/send', async (req: Request, res: Response) => {
  try {
    const { sessionId, remoteJid: passedJid, phone, message, documentUrl, fileDataUrl, mimeType, fileName } = req.body;
    if ((!passedJid && !phone) || (!message && !documentUrl && !fileDataUrl)) {
      return res.status(400).json({ error: 'remoteJid/phone and message or attachment are required' });
    }

    let targetSessionId = sessionId;
    if (!targetSessionId || !activeSockets.has(targetSessionId)) {
      for (const [id, s] of sessionRegistry.entries()) {
        if (s.status === 'connected' && activeSockets.has(id)) {
          targetSessionId = id;
          break;
        }
      }
    }

    const sock = targetSessionId ? activeSockets.get(targetSessionId) : null;
    if (!sock) {
      return res.status(400).json({ error: 'No active WhatsApp session connected.' });
    }

    let targetJid = passedJid;
    if (!targetJid && phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      targetJid = `${formattedPhone}@s.whatsapp.net`;
    }

    let sentResult: any = null;
    let sentMediaType: string | undefined;
    let savedMediaUrl: string | undefined;
    const msgCaption = message || '';

    if (fileDataUrl && typeof fileDataUrl === 'string' && fileDataUrl.includes(',')) {
      const base64Part = fileDataUrl.split(',')[1];
      const detectedMime = mimeType || fileDataUrl.split(';')[0].replace('data:', '') || 'application/octet-stream';
      const fileBuffer = Buffer.from(base64Part, 'base64');

      if (detectedMime.startsWith('image/')) {
        sentMediaType = 'image';
        sentResult = await sock.sendMessage(targetJid, {
          image: fileBuffer,
          mimetype: detectedMime,
          caption: msgCaption
        });
      } else if (detectedMime.startsWith('video/')) {
        sentMediaType = 'video';
        sentResult = await sock.sendMessage(targetJid, {
          video: fileBuffer,
          mimetype: detectedMime,
          caption: msgCaption
        });
      } else if (detectedMime.startsWith('audio/')) {
        sentMediaType = 'audio';
        sentResult = await sock.sendMessage(targetJid, {
          audio: fileBuffer,
          mimetype: detectedMime
        });
      } else {
        sentMediaType = 'document';
        sentResult = await sock.sendMessage(targetJid, {
          document: fileBuffer,
          mimetype: detectedMime,
          fileName: fileName || 'Attachment',
          caption: msgCaption
        });
      }

      savedMediaUrl = saveMediaBuffer(fileBuffer, sentResult?.key?.id || `${Date.now()}`, detectedMime, fileName);
    } else if (documentUrl) {
      sentMediaType = 'document';
      sentResult = await sock.sendMessage(targetJid, {
        document: { url: documentUrl },
        mimetype: 'application/pdf',
        fileName: fileName || 'Document.pdf',
        caption: msgCaption
      });
    } else {
      sentResult = await sock.sendMessage(targetJid, { text: msgCaption });
    }

    const storeKey = `${targetSessionId}:${targetJid}`;
    const displayText =
      msgCaption ||
      (sentMediaType === 'image' ? 'Photo' : sentMediaType === 'video' ? 'Video' : fileName || 'Document');

    const newMsg: ChatMessage = {
      id: sentResult?.key?.id || `${Date.now()}`,
      sessionId: targetSessionId,
      remoteJid: targetJid,
      fromMe: true,
      senderPhone: '',
      senderName: 'You',
      text: displayText,
      timestamp: Date.now(),
      hasMedia: Boolean(sentMediaType),
      mediaType: sentMediaType,
      mediaUrl: savedMediaUrl,
      fileName: fileName || undefined,
      mimeType: mimeType || undefined
    };
    upsertMessageIntoStore(storeKey, newMsg);

    const existingConv = conversationMap.get(storeKey);
    const digits = targetJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const sessionMeta = sessionRegistry.get(targetSessionId);
    const isSelfChat = Boolean(sessionMeta?.phoneNumber && digits === sessionMeta.phoneNumber);
    const updatedConv: ConversationSummary = existingConv
      ? {
        ...existingConv,
        lastMessage: newMsg.text,
        timestamp: newMsg.timestamp
      }
      : {
        id: storeKey,
        sessionId: targetSessionId,
        sessionLabel: sessionMeta?.label || 'WhatsApp Account',
        remoteJid: targetJid,
        phone: digits,
        phoneResolved: Boolean(digits),
        name: isSelfChat
          ? `+${digits} (You)`
          : contactNameMap.get(digits) || (digits ? `+${digits}` : targetJid),
        lastMessage: newMsg.text,
        timestamp: newMsg.timestamp,
        isSelfChat
      };
    conversationMap.set(storeKey, updatedConv);
    scheduleSaveChatHistory();

    broadcastSSE('incoming_message', {
      sessionId: targetSessionId,
      remoteJid: targetJid,
      conversation: updatedConv,
      message: newMsg
    });

    res.json({
      success: true,
      sessionId: targetSessionId,
      remoteJid: targetJid,
      messageId: sentResult?.key?.id,
      message: newMsg
    });
  } catch (err: any) {
    console.error('[Send] Failed to send WhatsApp message:', err);
    res.status(500).json({ error: err.message || 'Failed to send WhatsApp message' });
  }
});

app.post('/api/whatsapp/agent/analyze', async (req: Request, res: Response) => {
  try {
    const { text, phone, senderName, sessionId, remoteJid } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const recentContext =
      sessionId && remoteJid
        ? (messageStore.get(`${sessionId}:${remoteJid}`) || [])
            .slice(-6)
            .map((m) => `${m.fromMe ? 'Agent' : 'Customer'}: ${m.text}`)
            .join('\n')
        : '';
    const insight = await analyzeMessageForLead(text, phone || '', senderName || 'Customer', recentContext);
    if (sessionId && remoteJid) {
      leadInsights.set(remoteJid, insight);
      const conv = conversationMap.get(`${sessionId}:${remoteJid}`);
      if (conv) {
        conv.insight = insight;
        conversationMap.set(`${sessionId}:${remoteJid}`, conv);
        scheduleSaveChatHistory();
      }
    }
    res.json({ success: true, insight });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

// EcoBill Electron Desktop Window Control Routes (works from Chrome browser tab)
const DESKTOP_CONTROL_PORT = 45921;

function callDesktopControl(
  method: 'GET' | 'POST',
  controlPath: string,
  body?: Record<string, any>,
  timeoutMs = 1200
): Promise<{ ok: boolean; data?: any }> {
  return new Promise((resolve) => {
    const serialized = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: DESKTOP_CONTROL_PORT,
        path: controlPath,
        method,
        timeout: timeoutMs,
        headers: serialized
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(serialized)
            }
          : undefined
      },
      (res) => {
        let bodyText = '';
        res.on('data', (chunk) => {
          bodyText += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ ok: (res.statusCode || 500) < 300, data: JSON.parse(bodyText || '{}') });
          } catch {
            resolve({ ok: (res.statusCode || 500) < 300 });
          }
        });
      }
    );
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
    if (serialized) req.write(serialized);
    req.end();
  });
}

app.get('/api/desktop/status', async (_req: Request, res: Response) => {
  const ctrl = await callDesktopControl('GET', '/status');
  const vbsPath = path.resolve(process.cwd(), 'Open-EcoBill-Browser.vbs');
  res.json({
    running: ctrl.ok,
    minimized: Boolean(ctrl.data?.minimized),
    visible: Boolean(ctrl.data?.visible),
    sandboxed: isRunningInsideSandboxDesktop(),
    vbsPath,
    winRCommand: `wscript "${vbsPath}"`
  });
});

let cachedSandboxCheck: boolean | null = null;
function isRunningInsideSandboxDesktop(): boolean {
  if (process.platform !== 'win32') return false;
  if (cachedSandboxCheck !== null) return cachedSandboxCheck;
  try {
    const psScript = `
      Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;using System.Text;public class DeskDetect{[DllImport("kernel32.dll")]public static extern uint GetCurrentThreadId();[DllImport("user32.dll")]public static extern IntPtr GetThreadDesktop(uint i);[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern bool GetUserObjectInformation(IntPtr h,int idx,StringBuilder p,int l,out int n);public static string N(){var s=new StringBuilder(256);int z;GetUserObjectInformation(GetThreadDesktop(GetCurrentThreadId()),2,s,256,out z);return s.ToString();}}'
      [DeskDetect]::N()
    `;
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const out = execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
      encoding: 'utf8',
      timeout: 5000
    }).trim();
    cachedSandboxCheck = Boolean(out) && out.toLowerCase() !== 'default';
  } catch {
    cachedSandboxCheck = false;
  }
  return cachedSandboxCheck;
}

app.post('/api/desktop/open', async (_req: Request, res: Response) => {
  const ctrl = await callDesktopControl('POST', '/open');
  if (ctrl.ok) {
    return res.json({ success: true, alreadyRunning: true });
  }

  if (isRunningInsideSandboxDesktop()) {
    const vbsPath = path.resolve(process.cwd(), 'Open-EcoBill-Browser.vbs');
    return res.json({
      success: false,
      sandboxed: true,
      vbsPath,
      winRCommand: `wscript "${vbsPath}"`,
      error: 'Press Win+R and paste the copied command, or double-click Open-EcoBill-Browser.vbs in File Explorer.'
    });
  }

  try {
    const isWin = process.platform === 'win32';
    const electronExe = path.resolve(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe');
    const cleanEnv: NodeJS.ProcessEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;

    if (isWin && fs.existsSync(electronExe)) {
      const child = spawn(electronExe, ['.'], {
        cwd: process.cwd(),
        env: cleanEnv,
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();
      return res.json({ success: true, started: true, pid: child.pid });
    }

    const launcherPath = path.resolve(process.cwd(), 'electron', 'dev-launcher.mjs');
    const child = spawn(process.execPath, [launcherPath], {
      cwd: process.cwd(),
      env: cleanEnv,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();

    return res.json({ success: true, started: true, pid: child.pid });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Could not start Desktop app' });
  }
});

app.post('/api/desktop/minimize', async (_req: Request, res: Response) => {
  const ctrl = await callDesktopControl('POST', '/minimize');
  if (!ctrl.ok) {
    return res.json({ success: false, notRunning: true, error: 'EcoBill Desktop window is not currently running' });
  }
  res.json({ success: true });
});

app.post('/api/desktop/close', async (_req: Request, res: Response) => {
  const ctrl = await callDesktopControl('POST', '/close');
  if (!ctrl.ok) {
    return res.json({ success: false, notRunning: true, error: 'EcoBill Desktop window is not currently running' });
  }
  res.json({ success: true });
});

app.post('/api/desktop/send-whatsapp', async (req: Request, res: Response) => {
  const { targetPhone, contactName, message, sourceWhatsappNumber, sourceSessionId } = req.body || {};
  if ((!targetPhone && !contactName) || !message) {
    return res.status(400).json({ ok: false, error: 'message and either targetPhone or contactName are required' });
  }
  const ctrl = await callDesktopControl(
    'POST',
    '/send-whatsapp',
    { targetPhone: targetPhone || '', contactName: contactName || '', message, sourceWhatsappNumber, sourceSessionId },
    42000
  );
  if (!ctrl.ok) {
    return res.json({
      ok: false,
      notRunning: true,
      error: 'EcoBill Desktop app is not open on this PC. Open EcoBill Desktop to send from your logged-in WhatsApp Web tab.'
    });
  }
  return res.json(ctrl.data || { ok: false, error: 'No response from EcoBill Desktop' });
});

// Restore persisted state synchronously before accepting HTTP/SSE connections
loadLidCache();
loadRegistry();
loadChatHistory();

const handleProcessShutdown = () => {
  saveChatHistoryNow();
  process.exit(0);
};
process.on('SIGINT', handleProcessShutdown);
process.on('SIGTERM', handleProcessShutdown);

const server = app.listen(PORT, '127.0.0.1', async () => {
  console.log(`=======================================================`);
  console.log(`⚡ EcoBill Multi-WhatsApp Baileys Service running on port ${PORT}`);
  console.log(`=======================================================`);

  const registered = Array.from(sessionRegistry.values());
  const pairedSessions = registered.filter((s) => fs.existsSync(path.join(SESSIONS_DIR, s.id, 'creds.json')));
  if (pairedSessions.length > 0) {
    console.log(`[Startup] Found ${pairedSessions.length} paired session(s). Auto-reconnecting...`);
    for (const session of pairedSessions) {
      await initSession(session.id, session.label);
    }
  } else {
    console.log(`[Startup] No paired sessions found. Ready to add new accounts via UI.`);
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[Startup] Port ${PORT} already in use; assuming WhatsApp service is already running.`);
    process.exit(0);
  }
  console.error('[Startup] Server error:', err);
  process.exit(1);
});

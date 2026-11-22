const { ipcRenderer } = require('electron');

const IS_WHATSAPP_WEB = typeof window !== 'undefined' && window.location.origin === 'https://web.whatsapp.com';
const PENDING_SEND_STORAGE_KEY = 'ecobill_pending_wa_send';

const SYSTEM_BOT_NAMES = new Set([
  'meta ai',
  'whatsapp',
  'whatsapp business',
  'whatsapp surveys',
  'official business account',
  'status',
  'archived',
  'locked chats'
]);

let cachedIdbOwnPhone = '';
let idbLookupStarted = false;
const cachedContactPhonesByName = new Map();
// Maps phone last-10 digits → customer's own WhatsApp display name (pushname), NOT the sales-team-saved name
const cachedPushnameByPhone = new Map();
let contactsIdbLastRefreshAt = 0;

function indexSavedContactRecord(row) {
  if (!row || typeof row !== 'object') return;
  const rawJid = String(row.id?._serialized || row.id || row.phoneNumber || '').replace(/:\d+@/, '@');
  const phone = extractPhoneFromUrlOrAttr(rawJid) || (typeof row.phoneNumber === 'string' ? normalizePhoneDigits(row.phoneNumber) : '');
  if (!phone) return;
  [row.name, row.shortName, row.pushname, row.verifiedName, row.formattedName].forEach((candidate) => {
    const key = String(candidate || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (key && key.length >= 2) {
      cachedContactPhonesByName.set(key, phone);
    }
  });
  // Store customer's own pushname separately so we never mix it with the sales-team-saved contact name
  const pushname = String(row.pushname || '').trim();
  if (phone && pushname) {
    cachedPushnameByPhone.set(phone.slice(-10), pushname);
  }
}

function refreshSavedContactsFromIndexedDB() {
  if (!IS_WHATSAPP_WEB || typeof window.indexedDB === 'undefined') return;
  const now = Date.now();
  if (now - contactsIdbLastRefreshAt < 20000) return;
  contactsIdbLastRefreshAt = now;

  ['model-storage', 'wawc'].forEach((dbName) => {
    try {
      const req = window.indexedDB.open(dbName);
      req.onsuccess = () => {
        try {
          const db = req.result;
          const storeName = db.objectStoreNames.contains('contact')
            ? 'contact'
            : db.objectStoreNames.contains('participant')
              ? 'participant'
              : null;
          if (!storeName) return;
          const tx = db.transaction(storeName, 'readonly');
          const allReq = tx.objectStore(storeName).getAll();
          allReq.onsuccess = () => {
            const rows = Array.isArray(allReq.result) ? allReq.result : [];
            for (const r of rows) indexSavedContactRecord(r);
          };
        } catch {
          // ignore store read issues
        }
      };
    } catch {
      // ignore DB open errors
    }
  });
}

function refreshCachedOwnPhoneFromIndexedDB() {
  if (!IS_WHATSAPP_WEB || idbLookupStarted || typeof window.indexedDB === 'undefined') return;
  idbLookupStarted = true;
  try {
    const req = window.indexedDB.open('wawc');
    req.onsuccess = () => {
      try {
        const db = req.result;
        const storeName = db.objectStoreNames.contains('user')
          ? 'user'
          : db.objectStoreNames.contains('kv')
            ? 'kv'
            : null;
        if (!storeName) return;
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const allReq = store.getAll();
        allReq.onsuccess = () => {
          const rows = Array.isArray(allReq.result) ? allReq.result : [];
          for (const row of rows) {
            const rawStr = typeof row === 'string' ? row : JSON.stringify(row || '');
            if (!rawStr) continue;
            const parsed =
              extractPhoneFromUrlOrAttr(rawStr.replace(/:\d+@/, '@')) ||
              extractPhoneFromText(rawStr);
            if (parsed) {
              cachedIdbOwnPhone = parsed;
              emitState();
              break;
            }
          }
        };
      } catch {
        // ignore IDB read issues
      }
    };
  } catch {
    // ignore IDB errors
  }
}

function extractOwnAccountInfo() {
  if (!IS_WHATSAPP_WEB) return { ownPhone: '', ownName: '' };
  let ownPhone = '';
  let ownName = '';

  try {
    const rawPushName = window.localStorage.getItem('pushname');
    if (rawPushName) {
      ownName = String(rawPushName).replace(/^"+|"+$/g, '').trim();
    }

    const widKeys = ['last-wid-md', 'last-wid', 'WAWebUserJid'];
    for (const key of widKeys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const cleaned = String(raw).replace(/^"+|"+$/g, '').replace(/:\d+@/, '@');
      const parsed = extractPhoneFromUrlOrAttr(cleaned) || normalizePhoneDigits(cleaned.split('@')[0]);
      if (parsed) {
        ownPhone = parsed;
        break;
      }
    }

    // Fallback: scan any localStorage key carrying a WhatsApp phone JID (never LIDs)
    if (!ownPhone) {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        const val = window.localStorage.getItem(key) || '';
        if (!val.includes('@c.us') && !val.includes('@s.whatsapp.net')) continue;
        if (/chat|recent|draft|msg|peer/i.test(key)) continue;
        const parsed = extractPhoneFromUrlOrAttr(val.replace(/:\d+@/, '@'));
        if (parsed) {
          ownPhone = parsed;
          break;
        }
      }
    }
  } catch {
    // localStorage access may throw on restricted frames
  }

  // Fallback: inspect left-sidebar header avatar URL (`u=9198...@c.us`)
  if (!ownPhone) {
    try {
      const headerImgs = document.querySelectorAll('header img[src], #app header img[src]');
      for (const img of headerImgs) {
        const src = img.getAttribute('src') || '';
        const parsed = extractPhoneFromUrlOrAttr(src);
        if (parsed) {
          ownPhone = parsed;
          break;
        }
      }
    } catch {
      // ignore DOM fallback errors
    }
  }

  if (!ownPhone) {
    refreshCachedOwnPhoneFromIndexedDB();
    if (cachedIdbOwnPhone) ownPhone = cachedIdbOwnPhone;
  }

  return { ownPhone, ownName };
}

function parseUnreadFromTitle(title) {
  const match = String(title || '').match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

function normalizePhoneDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return '';
}

function extractPhoneFromText(text) {
  const match = String(text || '').match(/(?:\+?\d[\d\s\-()]{8,16}\d)/);
  if (!match) return '';
  return normalizePhoneDigits(match[0]);
}

function extractPhoneFromUrlOrAttr(value) {
  if (!value) return '';
  let decoded = String(value);
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // keep raw string
  }
  const jidMatch = decoded.match(/(\d{7,15})@(?:c\.us|s\.whatsapp\.net)/);
  if (jidMatch) return normalizePhoneDigits(jidMatch[1]);
  const waMeMatch = decoded.match(/wa\.me\/(\d{7,15})/);
  if (waMeMatch) return normalizePhoneDigits(waMeMatch[1]);
  return '';
}

function extractPhoneFromContainer(container) {
  if (!container) return '';

  const imgEls = container.querySelectorAll('img[src]');
  for (const img of imgEls) {
    const found = extractPhoneFromUrlOrAttr(img.getAttribute('src'));
    if (found) return found;
  }

  const dataIdEl = container.querySelector('[data-id*="@c.us"], [data-id*="@s.whatsapp.net"]');
  if (dataIdEl) {
    const found = extractPhoneFromUrlOrAttr(dataIdEl.getAttribute('data-id'));
    if (found) return found;
  }

  const waLink = container.querySelector('a[href*="wa.me/"]');
  if (waLink) {
    const found = extractPhoneFromUrlOrAttr(waLink.getAttribute('href'));
    if (found) return found;
  }

  return '';
}

function isSystemContactName(name) {
  const norm = String(name || '').trim().toLowerCase();
  if (!norm) return true;
  if (SYSTEM_BOT_NAMES.has(norm)) return true;
  if (/^meta ai\b/i.test(norm)) return true;
  return false;
}

function isGroupContainer(container, headerSubtitle = '', iconScope = container) {
  if (!container) return false;
  if (container.querySelector('[data-id*="@g.us"], img[src*="g.us"]')) return true;
  if (
    iconScope &&
    iconScope.querySelector(
      '[data-icon*="group" i], [data-icon*="community" i], [data-testid*="group" i]'
    )
  ) {
    return true;
  }
  if (
    headerSubtitle &&
    (/^you,\s/i.test(headerSubtitle) ||
      /,\s*you$/i.test(headerSubtitle) ||
      /\b\d+\s+participants?\b/i.test(headerSubtitle) ||
      /click here for group info/i.test(headerSubtitle))
  ) {
    return true;
  }
  return false;
}

function isTodayOrYesterdayTimestamp(timeText, hasUnreadBadge) {
  if (hasUnreadBadge) return true;

  const t = String(timeText || '').trim().toLowerCase();
  if (!t) return false;

  // Today formats in WhatsApp Web: "11:24 AM", "11:24 a.m.", "14:05", "today", "just now", "1m ago"
  if (/\b\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?\b/i.test(t) || t === 'today' || t === 'just now' || t === 'now') {
    return true;
  }
  return false;
}

function extractActiveChatSnapshot() {
  try {
    const mainEl = document.querySelector('#main');
    if (!mainEl) return null;

    const headerEl = mainEl.querySelector('header');
    let contactName = '';
    let headerSubtitle = '';

    if (headerEl) {
      const titleSpan =
        headerEl.querySelector('span[title][dir="auto"]') ||
        headerEl.querySelector('span[title]') ||
        headerEl.querySelector('[dir="auto"]');
      contactName = (titleSpan?.getAttribute('title') || titleSpan?.textContent || '').trim();

      const headerLines = Array.from(headerEl.querySelectorAll('span'))
        .map((s) => (s.textContent || '').trim())
        .filter((t) => t && t !== contactName);
      headerSubtitle = headerLines[headerLines.length - 1] || '';
    }

    // Check only header icons/subtitles and explicit @g.us JIDs in #main so forwarded business posts
    // or "Add to list" controls never falsely flag a 1-on-1 customer chat as a group.
    const isGroup = isGroupContainer(mainEl, headerSubtitle, headerEl);
    const isSystemBot = isSystemContactName(contactName);

    let msgNodes = Array.from(mainEl.querySelectorAll('div.message-in, div.message-out'));
    if (msgNodes.length === 0) {
      msgNodes = Array.from(mainEl.querySelectorAll('[data-id^="false_"], [data-id^="true_"]'));
    }
    msgNodes = msgNodes.slice(-15);

    const messages = [];
    for (const node of msgNodes) {
      const dataId = node.getAttribute('data-id') || '';
      const isOutbound = node.classList.contains('message-out') || dataId.startsWith('true_');
      const copyable = node.querySelector('[data-pre-plain-text]');
      const meta = copyable?.getAttribute('data-pre-plain-text') || '';
      const textEls = Array.from(node.querySelectorAll('span.selectable-text')).filter(
        (el) => !el.parentElement?.closest('span.selectable-text')
      );
      let text = textEls
        .map((el) => el.textContent || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!text) {
        const docTitle = node.querySelector('span[title*="."]')?.getAttribute('title');
        const imgAlt = node.querySelector('img[alt]')?.getAttribute('alt');
        if (docTitle) text = `[Attachment] ${docTitle}`;
        else if (imgAlt && imgAlt.length > 2 && !/emoji/i.test(imgAlt)) text = `[Media] ${imgAlt}`;
      }

      if (text) {
        messages.push({
          fromMe: isOutbound,
          meta,
          text
        });
      }
    }

    refreshSavedContactsFromIndexedDB();
    let phone =
      extractPhoneFromText(contactName) ||
      extractPhoneFromText(headerSubtitle) ||
      extractPhoneFromContainer(mainEl) ||
      cachedContactPhonesByName.get(normalizeContactTitle(contactName)) ||
      '';

    let aboutText = '';
    const drawerSection = document.querySelector('div[data-animate-modal-body], section span[title*="+"]');
    if (drawerSection) {
      const phoneNode = document.querySelector('span[title*="+"], a[href*="wa.me/"]');
      if (!phone && phoneNode) {
        phone = extractPhoneFromText(phoneNode.getAttribute('title') || phoneNode.textContent || '');
      }
      const aboutEl = document.querySelector('span[title][data-testid="about"], div[title*="About"] + div span');
      if (aboutEl) {
        aboutText = (aboutEl.getAttribute('title') || aboutEl.textContent || '').trim();
      }
    }

    // Look up customer's own pushname (NOT the sales-team-saved contact name)
    const pushname = (phone ? cachedPushnameByPhone.get(phone.slice(-10)) : '') || '';

    return {
      contactName,
      headerSubtitle,
      phone,
      pushname,
      aboutText,
      isGroup,
      isSystemBot,
      messages
    };
  } catch {
    return null;
  }
}

const QR_SEEN_SESSION_KEY = 'ecobill_wa_saw_qr';

function readSessionSawQr() {
  try {
    return window.sessionStorage.getItem(QR_SEEN_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSessionSawQr(val) {
  try {
    if (val) {
      window.sessionStorage.setItem(QR_SEEN_SESSION_KEY, '1');
    } else {
      window.sessionStorage.removeItem(QR_SEEN_SESSION_KEY);
    }
  } catch {
    // ignore storage restriction
  }
}

let lastStatusKey = '';
let lastChatSig = '';
let lastUserInputAt = 0;
let lastAutoChatsSwitchAt = 0;
let sawQrLoginScreen = readSessionSawQr();
let autoQrScanTriggered = false;
let qrScanTimer = null;
let bulkScanInFlight = false;
const emittedSidebarSigs = new Set();

const WEEKDAY_INDEX = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};

function parseSidebarTimeHint(timeText, nowMs = Date.now(), dateOrderHint = null) {
  const raw = String(timeText || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const now = new Date(nowMs);

  if (lower === 'today' || lower === 'just now' || lower === 'now') {
    return nowMs;
  }

  const timeMatch = lower.match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?$/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const min = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === 'p' && hour < 12) hour += 12;
    if (ampm === 'a' && hour === 12) hour = 0;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);
    return d.getTime();
  }

  if (lower === 'yesterday') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0, 0);
    return d.getTime();
  }

  if (Object.prototype.hasOwnProperty.call(WEEKDAY_INDEX, lower)) {
    const targetDay = WEEKDAY_INDEX[lower];
    const todayDay = now.getDay();
    let diff = (todayDay - targetDay + 7) % 7;
    if (diff === 0) diff = 7;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 12, 0, 0, 0);
    return d.getTime();
  }

  const numericMatch = raw.match(/^(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})$/);
  if (numericMatch) {
    const p1 = parseInt(numericMatch[1], 10);
    const p2 = parseInt(numericMatch[2], 10);
    const p3 = parseInt(numericMatch[3], 10);
    let year;
    let month;
    let day;

    if (numericMatch[1].length === 4) {
      year = p1;
      month = p2;
      day = p3;
    } else {
      year = p3 < 100 ? 2000 + p3 : p3;
      const preferUs =
        dateOrderHint === 'MDY'
          ? true
          : dateOrderHint === 'DMY'
            ? false
            : /^en-(us|ca|ph)\b/i.test(navigator.language || '');
      if (p1 > 12) {
        day = p1;
        month = p2;
      } else if (p2 > 12) {
        month = p1;
        day = p2;
      } else if (preferUs) {
        month = p1;
        day = p2;
      } else {
        day = p1;
        month = p2;
      }
      // If inferred date lies in the future, try swapping day/month
      const testDate = new Date(year, month - 1, day, 12, 0, 0, 0);
      if (testDate.getTime() > nowMs + 86400000 && day <= 12 && month <= 12) {
        const swapped = day;
        day = month;
        month = swapped;
      }
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
      if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
    }
  }

  const fallbackParsed = Date.parse(raw);
  if (!Number.isNaN(fallbackParsed)) return fallbackParsed;
  return null;
}

function isTimeHintText(txt) {
  return Boolean(
    /^\d{1,2}:\d{2}(\s*[ap]\.?m\.?)?$/i.test(txt) ||
    /^(today|yesterday|just now|now)$/i.test(txt) ||
    /^\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}$/.test(txt) ||
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)$/i.test(txt) ||
    /^(?:\d{1,2}\s+[a-z]{3,9}(?:\s+\d{2,4})?|[a-z]{3,9}\s+\d{1,2}(?:,\s*\d{2,4})?)$/i.test(txt)
  );
}

function inferDateOrderFromTexts(timeTexts) {
  let sawDmy = false;
  let sawMdy = false;
  for (const txt of timeTexts) {
    const raw = (txt || '').trim();
    const m = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (!m) continue;
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    if (p1 > 12 && p2 <= 12) sawDmy = true;
    else if (p2 > 12 && p1 <= 12) sawMdy = true;
  }
  if (sawDmy && !sawMdy) return 'DMY';
  if (sawMdy && !sawDmy) return 'MDY';
  return null;
}

function parsePrePlainTextTimestamp(metaStr, nowMs = Date.now(), dateOrderHint = null) {
  const meta = String(metaStr || '').trim();
  if (!meta) return null;
  const bracketMatch = meta.match(/\[([^\]]+)\]/);
  if (!bracketMatch) return null;
  const inside = bracketMatch[1];
  const dateMatch = inside.match(/(\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4})/);
  if (!dateMatch) return null;
  return parseSidebarTimeHint(dateMatch[1], nowMs, dateOrderHint);
}

function normalizeWaMs(ts) {
  const n = Number(ts || 0);
  if (!n || Number.isNaN(n)) return 0;
  return n < 1e12 ? n * 1000 : n;
}

function readIndexedDbHistory(startMs, endMs) {
  return new Promise((resolve) => {
    const empty = { chatsByKey: new Map(), inboundByKey: new Map() };
    if (!IS_WHATSAPP_WEB || typeof window.indexedDB === 'undefined') {
      resolve(empty);
      return;
    }

    let settled = false;
    const done = (res) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };
    const timer = setTimeout(() => done(empty), 2500);

    try {
      const req = window.indexedDB.open('model-storage');
      req.onerror = () => {
        clearTimeout(timer);
        done(empty);
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const storeNames = Array.from(db.objectStoreNames || []);
          const wantStores = ['contact', 'chat', 'message'].filter((s) => storeNames.includes(s));
          if (wantStores.length === 0) {
            clearTimeout(timer);
            done(empty);
            return;
          }

          const tx = db.transaction(wantStores, 'readonly');
          const resultMap = {};
          let pending = wantStores.length;

          const finalize = () => {
            pending -= 1;
            if (pending > 0) return;
            clearTimeout(timer);

            const chatsByKey = new Map();
            const inboundByKey = new Map();
            const contactsByJid = new Map();
            const lidAliasMap = new Map();

            const contactRows = Array.isArray(resultMap.contact) ? resultMap.contact : [];
            for (const c of contactRows) {
              indexSavedContactRecord(c);
              const cid = String(c?.id?._serialized || c?.id || '').replace(/:\d+@/, '@');
              const lid = String(c?.lid?._serialized || c?.lid || '').replace(/:\d+@/, '@');
              const phoneDigits = extractPhoneFromUrlOrAttr(c?.phoneNumber || cid) || '';
              const cname = String(c?.name || c?.shortName || c?.pushname || c?.verifiedName || '').trim();
              if (cid && cname) contactsByJid.set(cid, cname);
              if (lid && cname && !contactsByJid.has(lid)) contactsByJid.set(lid, cname);
              if (lid && (cid || phoneDigits)) {
                lidAliasMap.set(lid, { jid: cid, phone: phoneDigits, name: cname });
              }
            }

            const chatRows = Array.isArray(resultMap.chat) ? resultMap.chat : [];
            for (const ch of chatRows) {
              const rawId = String(ch?.id?._serialized || ch?.id || '').replace(/:\d+@/, '@');
              if (!rawId || rawId.includes('@g.us') || rawId.includes('@broadcast') || rawId.includes('@newsletter') || rawId === 'status@broadcast') {
                continue;
              }
              const lid = String(ch?.lid?._serialized || ch?.lid || '').replace(/:\d+@/, '@');
              const alias = lidAliasMap.get(rawId) || (lid ? lidAliasMap.get(lid) : null);
              const phone = extractPhoneFromUrlOrAttr(ch?.phoneNumber || alias?.phone || rawId) || '';
              const name = String(ch?.name || contactsByJid.get(rawId) || alias?.name || '').trim();
              if (name && isSystemContactName(name)) continue;
              const tsMs = normalizeWaMs(ch?.t || ch?.lastMessageRecvTimestamp);
              const entry = {
                rawId,
                phone,
                name,
                timestampMs: tsMs
              };
              if (rawId) chatsByKey.set(rawId, entry);
              if (lid) chatsByKey.set(lid, entry);
              if (phone) chatsByKey.set(`phone:${phone.slice(-10)}`, entry);
              if (name) chatsByKey.set(`name:${normalizeContactTitle(name)}`, entry);
            }

            const msgRows = Array.isArray(resultMap.message) ? resultMap.message : [];
            for (const m of msgRows) {
              const idObj = m?.id;
              const idStr = String(idObj?._serialized || idObj || '');
              const isFromMe =
                typeof m?.fromMe === 'boolean'
                  ? m.fromMe
                  : typeof idObj?.fromMe === 'boolean'
                    ? idObj.fromMe
                    : idStr.startsWith('true_');
              if (isFromMe) continue;

              const idRemoteMatch = idStr.match(/^(?:true|false)_([^_@]+@[^_]+)/);
              const rawChatId = String(
                idObj?.remote?._serialized ||
                idObj?.remote ||
                (idRemoteMatch ? idRemoteMatch[1] : '') ||
                m?.chatId?._serialized ||
                m?.chatId ||
                m?.from?._serialized ||
                m?.from ||
                ''
              ).replace(/:\d+@/, '@');
              if (!rawChatId || rawChatId.includes('@g.us') || rawChatId.includes('@broadcast') || rawChatId.includes('@newsletter') || rawChatId === 'status@broadcast') {
                continue;
              }

              const alias = lidAliasMap.get(rawChatId);
              const chatId = alias?.jid && !alias.jid.includes('@lid') ? alias.jid : rawChatId;

              const tsMs = normalizeWaMs(m?.t);
              if (startMs && tsMs && tsMs < startMs) continue;
              if (endMs && tsMs && tsMs > endMs) continue;

              const body = String(m?.body || m?.caption || m?.text || '').replace(/\s+/g, ' ').trim();
              if (!body || body.length < 2) continue;
              if (m?.type && /^(ciphertext|e2e_notification|notification_template|gp2|protocol|revoked)$/i.test(String(m.type))) {
                continue;
              }

              const phone = alias?.phone || extractPhoneFromUrlOrAttr(chatId) || '';
              const chatEntry =
                chatsByKey.get(chatId) ||
                chatsByKey.get(rawChatId) ||
                (phone ? chatsByKey.get(`phone:${phone.slice(-10)}`) : null);
              const resolvedName = chatEntry?.name || alias?.name || contactsByJid.get(rawChatId) || '';
              const nameKey = resolvedName ? `name:${normalizeContactTitle(resolvedName)}` : '';
              const keys = [chatId, rawChatId, phone ? `phone:${phone.slice(-10)}` : '', nameKey].filter(Boolean);
              const item = { text: body, timestampMs: tsMs };

              for (const k of keys) {
                if (!inboundByKey.has(k)) inboundByKey.set(k, []);
                inboundByKey.get(k).push(item);
              }
            }

            for (const [k, list] of inboundByKey.entries()) {
              list.sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
              if (list.length > 8) {
                inboundByKey.set(k, list.slice(-8));
              }
            }

            done({ chatsByKey, inboundByKey });
          };

          for (const sName of wantStores) {
            try {
              const getAllReq = tx.objectStore(sName).getAll();
              getAllReq.onsuccess = () => {
                resultMap[sName] = getAllReq.result || [];
                finalize();
              };
              getAllReq.onerror = () => finalize();
            } catch {
              finalize();
            }
          }
        } catch {
          clearTimeout(timer);
          done(empty);
        }
      };
    } catch {
      clearTimeout(timer);
      done(empty);
    }
  });
}

function extractSidebarRowData(row, nowMs) {
  const unreadEl = row.querySelector('[aria-label*="unread" i], [data-icon*="unread"]');
  const isUnread = Boolean(unreadEl);

  const titleNodes = Array.from(row.querySelectorAll('span[title]'))
    .map((n) => (n.getAttribute('title') || '').trim())
    .filter(Boolean);
  const contactName = titleNodes[0] || '';
  if (!contactName || isSystemContactName(contactName)) return null;
  if (isGroupContainer(row)) return null;

  const hasOutboundTick = Boolean(
    row.querySelector(
      '[data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-icon="msg-time"], [data-icon="status-check"], [data-icon="status-dblcheck"]'
    )
  );

  const spanTexts = Array.from(row.querySelectorAll('span[dir="ltr"], span[dir="auto"], span[title], div > span'))
    .filter((n) => !n.closest('[data-icon]') && !n.hasAttribute('data-icon'))
    .map((n) => (n.getAttribute('title') || n.textContent || '').trim())
    .filter(
      (t) =>
        t &&
        t !== contactName &&
        !/^\d{1,3}$/.test(t) &&
        !/^(ic|wds|default|msg|status)-[a-z0-9-]+$/i.test(t)
    );

  let timeText = '';
  for (const txt of spanTexts) {
    if (isTimeHintText(txt)) {
      timeText = txt;
      break;
    }
  }

  const contentLines = spanTexts.filter((t) => t !== timeText);
  let previewText = contentLines[contentLines.length - 1] || titleNodes[1] || '';
  if (!previewText && isUnread) {
    previewText = '[New WhatsApp Message]';
  }

  refreshSavedContactsFromIndexedDB();
  const normalizedContactKey = normalizeContactTitle(contactName);
  const phone =
    extractPhoneFromText(contactName) ||
    extractPhoneFromContainer(row) ||
    cachedContactPhonesByName.get(normalizedContactKey) ||
    '';

  const parsedTimestampMs = parseSidebarTimeHint(timeText, nowMs);

  return {
    contactName,
    normalizedContactKey,
    phone,
    previewText,
    timeText,
    parsedTimestampMs,
    isUnread,
    hasOutboundTick
  };
}

async function scanChatsForImport(opts) {
  const { requestId, mode = 'all', startDate = '', endDate = '', trigger = 'manual_range' } = opts || {};
  if (!IS_WHATSAPP_WEB || bulkScanInFlight) {
    if (requestId) {
      ipcRenderer.sendToHost('wa:bulk-chats-scanned', {
        requestId,
        trigger,
        mode,
        startDate,
        endDate,
        totalScanned: 0,
        chats: [],
        busy: bulkScanInFlight
      });
    }
    return;
  }

  bulkScanInFlight = true;
  ipcRenderer.sendToHost('wa:bulk-scan-started', { requestId, trigger, mode, startDate, endDate });

  try {
    await new Promise((resolve) => ensureChatsPaneReady(resolve));
    const nowMs = Date.now();
    const isRange = mode === 'range' && Boolean(startDate) && Boolean(endDate);
    const startMs = isRange ? new Date(`${startDate}T00:00:00`).getTime() : 0;
    const endMs = isRange ? new Date(`${endDate}T23:59:59.999`).getTime() : nowMs + 86400000;

    const { ownPhone } = extractOwnAccountInfo();
    const own10 = ownPhone ? ownPhone.slice(-10) : '';

    const idbData = await readIndexedDbHistory(isRange ? startMs : 0, isRange ? endMs : 0);

    const collectedByKey = new Map();
    const pane = document.querySelector('#pane-side');
    const savedScrollTop = pane ? pane.scrollTop : 0;

    if (pane) {
      pane.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 140));

      let emptySteps = 0;
      let olderStreak = 0;
      let totalSeenRows = 0;
      const maxSteps = isRange ? 90 : 65;

      for (let step = 0; step < maxSteps; step += 1) {
        const currentScrollTop = pane.scrollTop;
        const rows = Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]'));
        let newInStep = 0;

        for (const row of rows) {
          try {
            const parsed = extractSidebarRowData(row, nowMs);
            if (!parsed) continue;
            if (own10 && parsed.phone && parsed.phone.slice(-10) === own10) continue;

            const key = parsed.phone ? `phone:${parsed.phone.slice(-10)}` : `name:${parsed.normalizedContactKey}`;
            if (!collectedByKey.has(key)) {
              collectedByKey.set(key, { ...parsed, scrollTop: currentScrollTop });
              newInStep += 1;
              totalSeenRows += 1;

              // Only count unambiguous past dates against olderStreak before dateOrderHint is inferred
              const isAmbiguousNumeric = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.test(parsed.timeText || '') &&
                parsed.timeText.split(/[\/.\-]/).slice(0, 2).every((n) => parseInt(n, 10) <= 12);
              if (isRange && totalSeenRows > 6 && !isAmbiguousNumeric && parsed.parsedTimestampMs && parsed.parsedTimestampMs < startMs) {
                olderStreak += 1;
              } else if (parsed.parsedTimestampMs && parsed.parsedTimestampMs >= startMs) {
                olderStreak = 0;
              }
            }
          } catch {
            // ignore row parse errors
          }
        }

        if (isRange && olderStreak >= 6) break;
        if (newInStep === 0) emptySteps += 1;
        else emptySteps = 0;
        if (emptySteps >= 3) break;

        const prevTop = pane.scrollTop;
        const stepSize = Math.max(260, Math.floor(pane.clientHeight * 0.75));
        pane.scrollTop = prevTop + stepSize;
        await new Promise((r) => setTimeout(r, 170));
        if (Math.abs(pane.scrollTop - prevTop) < 4) break;
      }

      pane.scrollTop = savedScrollTop;
    }

    // Merge IDB chats that may sit outside visible scroll range
    for (const [k, ch] of idbData.chatsByKey.entries()) {
      if (!k.startsWith('phone:') && !k.startsWith('name:')) continue;
      if (own10 && ch.phone && ch.phone.slice(-10) === own10) continue;
      if (!collectedByKey.has(k) && (ch.name || ch.phone)) {
        const display = ch.name || `+${ch.phone}`;
        if (!isSystemContactName(display)) {
          collectedByKey.set(k, {
            contactName: display,
            normalizedContactKey: normalizeContactTitle(display),
            phone: ch.phone || '',
            previewText: '',
            timeText: '',
            parsedTimestampMs: ch.timestampMs || null,
            isUnread: false,
            hasOutboundTick: false,
            scrollTop: -1
          });
        }
      }
    }

    // Infer DMY vs MDY date order across all collected sidebar rows (crucial when Electron reports en-US on DD/MM locales)
    const dateOrderHint = inferDateOrderFromTexts(
      Array.from(collectedByKey.values()).map((it) => it.timeText).filter(Boolean)
    );
    if (dateOrderHint) {
      for (const item of collectedByKey.values()) {
        if (item.timeText) {
          const reParsed = parseSidebarTimeHint(item.timeText, nowMs, dateOrderHint);
          if (reParsed) item.parsedTimestampMs = reParsed;
        }
      }
    }

    const candidates = [];
    let mainInspectCount = 0;
    const maxMainInspect = 20;

    for (const [key, item] of collectedByKey.entries()) {
      const idbInbound =
        (item.phone ? idbData.inboundByKey.get(`phone:${item.phone.slice(-10)}`) : null) ||
        idbData.inboundByKey.get(`name:${item.normalizedContactKey}`) ||
        [];
      const idbChat =
        (item.phone ? idbData.chatsByKey.get(`phone:${item.phone.slice(-10)}`) : null) ||
        idbData.chatsByKey.get(`name:${item.normalizedContactKey}`) ||
        null;

      let phone = item.phone || idbChat?.phone || '';
      if (own10 && phone && phone.slice(-10) === own10) continue;

      const cleanPreview = item.previewText && !/^you\s*:/i.test(item.previewText) && !item.hasOutboundTick
        ? item.previewText
        : '';

      const inboundHistory = idbInbound.map((m) => ({
        direction: 'inbound',
        content: m.text,
        timestampMs: m.timestampMs
      }));

      if (cleanPreview && !inboundHistory.some((h) => h.content === cleanPreview)) {
        inboundHistory.push({
          direction: 'inbound',
          content: cleanPreview,
          timestampMs: item.parsedTimestampMs || idbChat?.timestampMs || nowMs
        });
      }

      let effectiveTs =
        (idbInbound.length > 0 ? idbInbound[idbInbound.length - 1].timestampMs : 0) ||
        item.parsedTimestampMs ||
        idbChat?.timestampMs ||
        0;

      // For explicit date-range / manual imports, briefly open non-unread chats whose sidebar preview is outbound or missing IDB history
      if (
        trigger === 'manual_range' &&
        pane &&
        !item.isUnread &&
        item.scrollTop >= 0 &&
        inboundHistory.length === 0 &&
        mainInspectCount < maxMainInspect &&
        (!isRange || (effectiveTs >= startMs && effectiveTs <= endMs))
      ) {
        mainInspectCount += 1;
        try {
          pane.scrollTop = item.scrollTop;
          await new Promise((r) => setTimeout(r, 120));
          const visibleRows = Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]'));
          const matchingRow = visibleRows.find((r) => {
            const titleEl = r.querySelector('span[title]');
            const rowName = normalizeContactTitle((titleEl?.getAttribute('title') || '').trim());
            const rowPhone = extractPhoneFromContainer(r);
            return (
              (phone && rowPhone && rowPhone.slice(-10) === phone.slice(-10)) ||
              (rowName && rowName === item.normalizedContactKey)
            );
          });
          if (matchingRow) {
            triggerClickElement(getRowClickTarget(matchingRow));
            await new Promise((r) => setTimeout(r, 280));
            const snap = extractActiveChatSnapshot();
            const snapKey = normalizeContactTitle(snap?.contactName || '');
            if (snap && (snapKey === item.normalizedContactKey || (snap.phone && phone && snap.phone.slice(-10) === phone.slice(-10)))) {
              if (!phone && snap.phone) phone = snap.phone;
              const snapInbound = (snap.messages || []).filter((m) => !m.fromMe && m.text);
              for (const m of snapInbound) {
                const msgTs = parsePrePlainTextTimestamp(m.meta, nowMs, dateOrderHint);
                if (isRange && msgTs && (msgTs < startMs || msgTs > endMs)) continue;
                if (!inboundHistory.some((h) => h.content === m.text)) {
                  inboundHistory.push({
                    direction: 'inbound',
                    content: m.text,
                    timestampMs: msgTs || effectiveTs || nowMs
                  });
                }
              }
              if (inboundHistory.length > 0 && !effectiveTs) {
                effectiveTs = inboundHistory[inboundHistory.length - 1].timestampMs;
              }
            }
          }
        } catch {
          // non-blocking #main inspection fallback
        }
      }

      if (isRange) {
        const hasInboundInRange =
          inboundHistory.some((m) => m.timestampMs >= startMs && m.timestampMs <= endMs) ||
          (effectiveTs >= startMs && effectiveTs <= endMs);
        if (!hasInboundInRange) continue;
      }

      const strippedOutboundPreview =
        inboundHistory.length === 0 && item.previewText
          ? item.previewText.replace(/^you\s*:\s*/i, '').trim()
          : '';

      const latestText =
        (inboundHistory.length > 0 ? inboundHistory[inboundHistory.length - 1].text || inboundHistory[inboundHistory.length - 1].content : '') ||
        cleanPreview ||
        (trigger === 'qr_scan' && strippedOutboundPreview.length >= 2 ? strippedOutboundPreview : '');

      if (!latestText || latestText.length < 2) continue;

      const pushname = (phone ? cachedPushnameByPhone.get(phone.slice(-10)) : '') || '';
      candidates.push({
        key,
        contactName: item.contactName,
        pushname,
        phone,
        latestText,
        inboundHistory: inboundHistory.slice(-6).map((h) => ({ direction: 'inbound', content: h.content })),
        timestamp: effectiveTs || nowMs,
        timeHint: item.timeText || ''
      });
    }

    if (pane && mainInspectCount > 0) {
      pane.scrollTop = savedScrollTop;
    }

    ipcRenderer.sendToHost('wa:bulk-chats-scanned', {
      requestId,
      trigger,
      mode,
      startDate,
      endDate,
      totalScanned: collectedByKey.size,
      chats: candidates
    });
  } catch (err) {
    ipcRenderer.sendToHost('wa:bulk-chats-scanned', {
      requestId,
      trigger,
      mode,
      startDate,
      endDate,
      totalScanned: 0,
      chats: [],
      error: err?.message || 'Failed to scan WhatsApp chats'
    });
  } finally {
    bulkScanInFlight = false;
  }
}

function findChatsTabButton() {
  return (
    document.querySelector('[data-testid="menu-bar-chats"]') ||
    document.querySelector('button[aria-label="Chats"], [role="button"][aria-label="Chats"]') ||
    document.querySelector('button[aria-label*="Chats" i], [role="button"][aria-label*="Chats" i]') ||
    document.querySelector('[data-icon="chat-filled-refreshed"], [data-icon="chat-refreshed"], [data-icon="chats-filled"]')?.closest('button, [role="button"]') ||
    null
  );
}

function scanSidebarIncomingChats(isConnected) {
  if (!isConnected) return;

  const pane = document.querySelector('#pane-side');
  if (!pane) return;

  const now = Date.now();
  const rows = Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]'));

  for (const row of rows) {
    try {
      const unreadEl = row.querySelector('[aria-label*="unread" i], [data-icon*="unread"]');
      const isUnread = Boolean(unreadEl);

      // Extract contact name
      const titleNodes = Array.from(row.querySelectorAll('span[title]'))
        .map((n) => (n.getAttribute('title') || '').trim())
        .filter(Boolean);
      const contactName = titleNodes[0] || '';
      if (!contactName || isSystemContactName(contactName)) continue;

      // Skip group chats so internal team groups don't create fake leads
      if (isGroupContainer(row)) continue;

      // Skip outbound-last rows ("You: ..." or checkmarks) unless currently marked unread
      const hasOutboundTick = Boolean(
        row.querySelector(
          '[data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-icon="msg-time"], [data-icon="status-check"], [data-icon="status-dblcheck"]'
        )
      );
      if (hasOutboundTick && !isUnread) continue;

      // Skip icon ligature text (e.g. "ic-expand-more", "wds-ic-*", "msg-dblcheck") so UI icons are never treated as messages
      const spanTexts = Array.from(row.querySelectorAll('span[dir="ltr"], span[dir="auto"], span[title], div > span'))
        .filter((n) => !n.closest('[data-icon]') && !n.hasAttribute('data-icon'))
        .map((n) => (n.getAttribute('title') || n.textContent || '').trim())
        .filter(
          (t) =>
            t &&
            t !== contactName &&
            !/^\d{1,3}$/.test(t) &&
            !/^(ic|wds|default|msg|status)-[a-z0-9-]+$/i.test(t)
        );

      // Timestamp usually matches HH:MM (AM/PM or a.m./p.m.), Today, Yesterday, weekday, or DD/MM/YYYY
      let timeText = '';
      for (const txt of spanTexts) {
        if (
          /^\d{1,2}:\d{2}(\s*[ap]\.?m\.?)?$/i.test(txt) ||
          /^(today|yesterday|just now|now)$/i.test(txt) ||
          /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(txt) ||
          /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(txt)
        ) {
          timeText = txt;
          break;
        }
      }

      // Monitor all unread chats (any date format) AND read incoming chats from Today
      if (!isTodayOrYesterdayTimestamp(timeText, isUnread)) continue;

      const contentLines = spanTexts.filter((t) => t !== timeText);
      let previewText = contentLines[contentLines.length - 1] || titleNodes[1] || '';
      if (!previewText && isUnread) {
        previewText = '[New WhatsApp Message]';
      }
      if (!previewText || (!isUnread && previewText.length < 2)) continue;
      if (/^you\s*:/i.test(previewText)) continue;

      refreshSavedContactsFromIndexedDB();
      const normalizedContactKey = contactName.toLowerCase().replace(/\s+/g, ' ').trim();
      const phone =
        extractPhoneFromText(contactName) ||
        extractPhoneFromContainer(row) ||
        cachedContactPhonesByName.get(normalizedContactKey) ||
        '';
      const sig = `${phone || contactName.toLowerCase()}::${previewText}::${timeText}`;
      if (emittedSidebarSigs.has(sig)) continue;
      emittedSidebarSigs.add(sig);

      // Look up customer's own pushname (NOT the sales-team-saved contact name)
      const pushname = (phone ? cachedPushnameByPhone.get(phone.slice(-10)) : '') || '';

      ipcRenderer.sendToHost('wa:unread-event', {
        contactName,
        pushname,
        phone,
        previewText,
        timeHint: timeText,
        isUnread,
        timestamp: now
      });
    } catch {
      // ignore row parse errors
    }
  }
}

function isLoggedInWhatsAppDom() {
  if (document.querySelector('#pane-side')) return true;
  // QR code canvas appears on the logged-out login screen — never treat that as connected
  if (document.querySelector('canvas[aria-label*="Scan" i], [data-ref] canvas')) return false;
  return Boolean(
    document.querySelector(
      '[aria-label="Chats"], [aria-label="Calls"], [aria-label="Status"], [data-testid="menu-bar-chats"], [data-icon="chat-filled-refreshed"], [data-icon="chats-filled"]'
    )
  );
}

function emitState() {
  if (!IS_WHATSAPP_WEB) return;
  try {
    const title = document.title || 'WhatsApp';
    const unreadCount = parseUnreadFromTitle(title);
    const isConnected = isLoggedInWhatsAppDom();
    const inChatsView = Boolean(document.querySelector('#pane-side'));
    const { ownPhone, ownName } = isConnected ? extractOwnAccountInfo() : { ownPhone: '', ownName: '' };
    const statusKey = `${isConnected}:${inChatsView}:${unreadCount}:${title}:${ownPhone}:${ownName}`;
    if (statusKey !== lastStatusKey) {
      lastStatusKey = statusKey;
      ipcRenderer.sendToHost('wa:status', { isConnected, inChatsView, unreadCount, title, ownPhone, ownName });
    }

    const hasQrCanvas = Boolean(
      document.querySelector('canvas[aria-label*="Scan" i], [data-ref] canvas, [data-testid="qrcode"]')
    );
    if (hasQrCanvas && !isConnected) {
      sawQrLoginScreen = true;
      writeSessionSawQr(true);
      autoQrScanTriggered = false;
      if (qrScanTimer) {
        clearTimeout(qrScanTimer);
        qrScanTimer = null;
      }
    }

    // Automatically scan & import all existing leads right after the user scans the WhatsApp QR code
    if (isConnected && inChatsView && sawQrLoginScreen && !autoQrScanTriggered && !qrScanTimer) {
      const hasAnyChatRow = Boolean(document.querySelector('#pane-side [role="listitem"], #pane-side [role="row"]'));
      if (hasAnyChatRow) {
        qrScanTimer = setTimeout(() => {
          qrScanTimer = null;
          if (!isLoggedInWhatsAppDom() || autoQrScanTriggered) return;
          autoQrScanTriggered = true;
          sawQrLoginScreen = false;
          writeSessionSawQr(false);
          scanChatsForImport({
            requestId: `qr_auto_${Date.now()}`,
            mode: 'all',
            trigger: 'qr_scan'
          });
        }, 3500);
      }
    }

    // If unread chats arrive while user left WhatsApp Web on Calls/Status (so #pane-side is absent),
    // gently return to Chats after brief inactivity so incoming leads are captured automatically.
    const now = Date.now();
    if (
      isConnected &&
      !inChatsView &&
      unreadCount > 0 &&
      now - lastUserInputAt > 8000 &&
      now - lastAutoChatsSwitchAt > 15000
    ) {
      const chatsBtn = findChatsTabButton();
      if (chatsBtn) {
        lastAutoChatsSwitchAt = now;
        triggerClickElement(chatsBtn);
      }
    }

    scanSidebarIncomingChats(isConnected);

    const snapshot = extractActiveChatSnapshot();
    if (snapshot && snapshot.contactName && snapshot.messages.length > 0) {
      const lastMsg = snapshot.messages[snapshot.messages.length - 1];
      const chatSig = `${snapshot.contactName}:${snapshot.phone}:${snapshot.messages.length}:${lastMsg?.text || ''}`;
      if (chatSig !== lastChatSig) {
        lastChatSig = chatSig;
        ipcRenderer.sendToHost('wa:active-chat', snapshot);
      }
    }
  } catch {
    // Non-blocking DOM observer
  }
}

function findAttachButton() {
  return (
    document.querySelector('#main footer [data-testid="conversation-clip"]') ||
    document.querySelector('#main footer button[aria-label*="Attach" i]') ||
    document.querySelector('#main footer [role="button"][aria-label*="Attach" i]') ||
    document.querySelector('#main footer span[data-icon="plus-rounded"]')?.closest('button, [role="button"]') ||
    document.querySelector('#main footer span[data-icon="plus"]')?.closest('button, [role="button"]') ||
    document.querySelector('#main footer span[data-icon="clip"]')?.closest('button, [role="button"]') ||
    null
  );
}

function findMediaPreviewBox() {
  const closeBtn = document.querySelector(
    '[data-testid="media-editor"] button[aria-label="Close" i], ' +
    'button[aria-label="Close" i][data-tab], ' +
    'div[role="button"][aria-label="Close" i], ' +
    'span[data-icon="x-viewer"], ' +
    'span[data-icon="close-refreshed"]'
  );
  const sendBtn =
    document.querySelector('[data-testid="media-editor-send"]') ||
    Array.from(
      document.querySelectorAll(
        'div[role="button"][aria-label="Send" i], button[aria-label="Send" i], span[data-icon="wds-ic-send-filled"], span[data-icon="send"]'
      )
    )
      .map((el) => el.closest('button, [role="button"]') || el)
      .find((btn) => {
        if (!btn || btn.offsetParent === null) return false;
        return !btn.closest('#main footer') || Boolean(closeBtn);
      }) ||
    null;

  const captionBox =
    Array.from(document.querySelectorAll('div[contenteditable="true"][aria-placeholder], div[contenteditable="true"][data-tab]'))
      .find((el) => {
        if (!el || el.offsetParent === null || el.closest('#side')) return false;
        const ph = (el.getAttribute('aria-placeholder') || el.getAttribute('title') || '').toLowerCase();
        if (ph.includes('caption') || ph.includes('message')) {
          return !el.closest('#main footer') || Boolean(closeBtn);
        }
        return false;
      }) || null;

  return {
    ready: Boolean(sendBtn && (closeBtn || !sendBtn.closest('#main footer'))),
    sendBtn,
    captionBox
  };
}

function dispatchDropFileOnMain(file) {
  const dropTarget =
    document.querySelector('#main [data-testid="conversation-panel-messages"]') ||
    document.querySelector('#main footer') ||
    document.querySelector('#main');
  if (!dropTarget) return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    for (const evType of ['dragenter', 'dragover', 'drop']) {
      dropTarget.dispatchEvent(
        new DragEvent(evType, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        })
      );
    }
    return true;
  } catch {
    return false;
  }
}

function insertMediaAndClickSend(media, captionText, onDone) {
  try {
    if (!media || !media.bytes) {
      onDone(false, 'Media bytes are missing');
      return;
    }
    const mime = media.mimeType || 'application/octet-stream';
    const file = new File([media.bytes], media.fileName || 'attachment', { type: mime });
    const wantPhotoVideo = media.attachmentType === 'image' || media.attachmentType === 'video' || mime.startsWith('image/') || mime.startsWith('video/');

    const pickBestFileInput = () => {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
      if (inputs.length === 0) return null;
      if (wantPhotoVideo) {
        return inputs.find((inp) => /image|video/i.test(inp.getAttribute('accept') || '')) || inputs[0];
      }
      return (
        inputs.find((inp) => {
          const acc = (inp.getAttribute('accept') || '').trim();
          return !acc || acc === '*' || acc.includes('*/*') || acc.includes('application/');
        }) || inputs[inputs.length - 1]
      );
    };

    const attachBtn = findAttachButton();
    if (attachBtn) {
      triggerClickElement(attachBtn);
    }

    setTimeout(() => {
      let triggered = false;
      const fileInput = pickBestFileInput();
      if (fileInput) {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          triggered = true;
        } catch {
          triggered = false;
        }
      }

      if (!triggered) {
        triggered = dispatchDropFileOnMain(file);
      }

      if (!triggered) {
        onDone(false, 'Could not attach media file to WhatsApp Web chat');
        return;
      }

      let tries = 0;
      const maxTries = 36;
      const pollPreview = () => {
        tries += 1;
        const preview = findMediaPreviewBox();
        if (preview.ready && preview.sendBtn) {
          const cleanCaption = String(captionText || '').trim();
          const finalizeSend = () => {
            const latestPreview = findMediaPreviewBox();
            const btnToClick = latestPreview.sendBtn || preview.sendBtn;
            triggerClickElement(btnToClick);
            const waitAfterClick = wantPhotoVideo ? 1600 : 1200;
            setTimeout(() => {
              if (cleanCaption && !preview.captionBox) {
                insertTextAndClickSend(cleanCaption);
                setTimeout(() => onDone(true), 700);
              } else {
                onDone(true);
              }
            }, waitAfterClick);
          };

          if (cleanCaption && preview.captionBox) {
            setLexicalEditableText(preview.captionBox, cleanCaption, 220, finalizeSend);
          } else {
            setTimeout(finalizeSend, 220);
          }
          return;
        }

        // After 1.5s without preview, retry via DataTransfer drop onto #main
        if (tries === 6) {
          dispatchDropFileOnMain(file);
        }

        if (tries >= maxTries) {
          onDone(false, `WhatsApp Web media preview did not open for "${media.fileName || 'file'}"`);
          return;
        }
        setTimeout(pollPreview, 250);
      };

      setTimeout(pollPreview, 320);
    }, 240);
  } catch (err) {
    onDone(false, err?.message || 'Media attachment failed');
  }
}

function findSendButton() {
  return (
    document.querySelector('[data-testid="compose-btn-send"]') ||
    document.querySelector('#main footer button[aria-label*="Send" i]') ||
    document.querySelector('#main footer div[role="button"][aria-label*="Send" i]') ||
    document.querySelector('#main footer span[data-icon="wds-ic-send-filled"]')?.closest('button, [role="button"]') ||
    document.querySelector('#main footer span[data-icon="send"]')?.closest('button, [role="button"]') ||
    null
  );
}

function triggerClickElement(el) {
  if (!el) return;
  try {
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    const coords = rect
      ? { clientX: rect.left + Math.min(20, rect.width / 2), clientY: rect.top + Math.min(12, rect.height / 2) }
      : {};
    if (typeof PointerEvent !== 'undefined') {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...coords }));
    }
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, ...coords }));
    if (typeof PointerEvent !== 'undefined') {
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...coords }));
    }
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0, ...coords }));
    el.click();
  } catch {
    el.click();
  }
}

function getRowClickTarget(row) {
  if (!row) return null;
  return (
    row.querySelector('[role="gridcell"] span[title]') ||
    row.querySelector('span[title]') ||
    row.querySelector('[role="gridcell"]') ||
    row
  );
}

function findSidebarChatByDigits10(digits10) {
  if (!digits10) return null;
  const rows = document.querySelectorAll('#pane-side [role="row"], #pane-side [role="listitem"]');
  for (const row of rows) {
    const phone = extractPhoneFromContainer(row);
    if (phone && phone.slice(-10) === digits10) {
      return { row, target: getRowClickTarget(row) };
    }
  }
  return null;
}

function normalizeContactTitle(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function findSidebarChatByName(contactName) {
  const target = normalizeContactTitle(contactName);
  if (!target) return null;

  const rows = document.querySelectorAll('#pane-side [role="row"], #pane-side [role="listitem"]');
  let partialMatch = null;

  for (const row of rows) {
    if (isGroupContainer(row)) continue;
    const titleEl = row.querySelector('span[title]');
    const title = normalizeContactTitle(titleEl?.getAttribute('title') || '');
    if (!title || isSystemContactName(title)) continue;

    const matchObj = { row, target: getRowClickTarget(row) };
    if (title === target) return matchObj;
    if (!partialMatch && (title.includes(target) || target.includes(title))) {
      partialMatch = matchObj;
    }
  }
  return partialMatch;
}

function findSidebarSearchBox() {
  return (
    document.querySelector('#side div[contenteditable="true"][data-tab="3"]') ||
    document.querySelector('#side div[contenteditable="true"]') ||
    document.querySelector('[aria-label*="Search input" i]') ||
    null
  );
}

function clearSidebarSearchBox() {
  const cancelBtn = document.querySelector(
    '#side button[aria-label*="Cancel search" i], #side [data-icon="x-alt"], #side [data-icon="back"], #side [aria-label="Back"]'
  );
  if (cancelBtn) {
    triggerClickElement(cancelBtn);
  }
}

function navigateSendViaUrlOrFail(requestId, digits, message, missingReason, openOnly = false) {
  if (!digits) {
    ipcRenderer.sendToHost('wa:send-result', {
      requestId,
      ok: false,
      error: missingReason || 'Could not locate customer chat in WhatsApp Web'
    });
    return;
  }
  try {
    window.sessionStorage.setItem(
      PENDING_SEND_STORAGE_KEY,
      JSON.stringify({ requestId, phone: digits, message: message || '', openOnly: Boolean(openOnly), createdAt: Date.now() })
    );
    const targetUrl = openOnly || !message
      ? `https://web.whatsapp.com/send?phone=${encodeURIComponent(digits)}`
      : `https://web.whatsapp.com/send?phone=${encodeURIComponent(digits)}&text=${encodeURIComponent(message)}`;
    window.location.href = targetUrl;
  } catch (err) {
    ipcRenderer.sendToHost('wa:send-result', {
      requestId,
      ok: false,
      error: err?.message || 'Failed to open WhatsApp Web chat URL'
    });
  }
}

function isTargetChatOpened(openedSnap, targetDigits10, cleanContactName, prevContactName) {
  if (!openedSnap || openedSnap.isGroup) return false;
  const opened10 = openedSnap.phone ? openedSnap.phone.slice(-10) : '';
  const openedName = normalizeContactTitle(openedSnap.contactName || '');
  const targetName = normalizeContactTitle(cleanContactName);
  const prevName = normalizeContactTitle(prevContactName);

  const hasComposeInput = Boolean(
    document.querySelector('#main footer div[contenteditable="true"][data-tab]') ||
    document.querySelector('#main footer div[contenteditable="true"]')
  );
  if (!hasComposeInput) return false;

  return Boolean(
    (targetDigits10 && opened10 === targetDigits10) ||
    (targetName &&
      openedName &&
      (openedName === targetName || openedName.includes(targetName) || targetName.includes(openedName))) ||
    (openedName && prevName && openedName !== prevName)
  );
}

function pollAndSendOpenedChat(opts) {
  const {
    requestId,
    targetDigits10,
    cleanContactName,
    prevContactName,
    message,
    media,
    openOnly,
    digits,
    matchObj,
    clearSearchAfterOpen
  } = opts;

  let attempts = 0;
  let retriedRowClick = false;
  let sendTriggered = false;
  const maxAttempts = 18; // up to ~4.5s

  const tick = () => {
    if (sendTriggered) return;
    attempts += 1;
    const openedSnap = extractActiveChatSnapshot();

    if (isTargetChatOpened(openedSnap, targetDigits10, cleanContactName, prevContactName)) {
      if (clearSearchAfterOpen) clearSidebarSearchBox();
      if (openOnly) {
        sendTriggered = true;
        ipcRenderer.sendToHost('wa:send-result', {
          requestId,
          ok: true,
          resolvedPhone: openedSnap?.phone || digits || ''
        });
        return;
      }
      if (media && media.bytes) {
        sendTriggered = true;
        insertMediaAndClickSend(media, message, (ok, errMsg) => {
          ipcRenderer.sendToHost('wa:send-result', {
            requestId,
            ok,
            resolvedPhone: openedSnap?.phone || digits || '',
            error: errMsg
          });
        });
        return;
      }
      const sent = insertTextAndClickSend(message);
      if (sent) {
        sendTriggered = true;
        setTimeout(() => {
          ipcRenderer.sendToHost('wa:send-result', {
            requestId,
            ok: true,
            resolvedPhone: openedSnap?.phone || digits || ''
          });
        }, 250);
        return;
      }
    }

    // Halfway through polling, retry clicking both row and title if the first target didn't switch #main
    if (!retriedRowClick && attempts === 4 && matchObj?.row) {
      retriedRowClick = true;
      triggerClickElement(matchObj.row);
    }

    if (attempts >= maxAttempts) {
      if (clearSearchAfterOpen) clearSidebarSearchBox();
      const diagHeader = openedSnap?.contactName || 'none';
      const hasInput = Boolean(document.querySelector('#main footer div[contenteditable="true"]'));
      if (media && !openOnly) {
        ipcRenderer.sendToHost('wa:send-result', {
          requestId,
          ok: false,
          error: `Could not open chat for "${cleanContactName || digits}" before attaching media`
        });
        return;
      }
      navigateSendViaUrlOrFail(
        requestId,
        digits,
        message,
        `Could not open WhatsApp chat for "${cleanContactName}" (open header: "${diagHeader}", input ready: ${hasInput})`,
        Boolean(openOnly)
      );
      return;
    }

    setTimeout(tick, 150);
  };

  setTimeout(tick, 60);
}

function ensureChatsPaneReady(onReady) {
  if (document.querySelector('#pane-side')) {
    onReady();
    return;
  }
  const chatsBtn = findChatsTabButton();
  if (chatsBtn) triggerClickElement(chatsBtn);

  let tries = 0;
  const check = () => {
    tries += 1;
    if (document.querySelector('#pane-side') || tries >= 10) {
      onReady();
      return;
    }
    setTimeout(check, 200);
  };
  setTimeout(check, 200);
}

let lastComposeSendSig = '';
let lastComposeSendAt = 0;

function triggerSendAfterInsert(inputBox) {
  const sendBtn = findSendButton();
  if (sendBtn) {
    triggerClickElement(sendBtn);
    return;
  }
  setTimeout(() => {
    const delayedBtn = findSendButton();
    if (delayedBtn) {
      triggerClickElement(delayedBtn);
    } else {
      inputBox.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
      );
    }
  }, 250);
}

/**
 * Replaces text in a WhatsApp Web Lexical contenteditable element once, waiting briefly
 * for React/Lexical to flush execCommand before ever attempting a fallback paste.
 */
function setLexicalEditableText(box, text, waitMs, onDone) {
  const cleanTarget = String(text || '').replace(/\s+/g, ' ').trim();
  const existingNorm = (box.textContent || '').replace(/\s+/g, ' ').trim();

  box.focus();
  try {
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(box);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (existingNorm) {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
    }
    document.execCommand('insertText', false, text);
  } catch {
    // Verified asynchronously after Lexical commits below.
  }

  setTimeout(() => {
    const afterExecNorm = (box.textContent || '').replace(/\s+/g, ' ').trim();
    if (afterExecNorm.length === 0 && cleanTarget.length > 0) {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        box.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
        );
      } catch {
        box.textContent = text;
        box.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (typeof onDone === 'function') setTimeout(onDone, waitMs);
      return;
    }

    if (typeof onDone === 'function') onDone();
  }, waitMs);
}

function insertTextAndClickSend(messageText) {
  const inputBox =
    document.querySelector('#main footer div[contenteditable="true"][data-tab]') ||
    document.querySelector('#main footer div[contenteditable="true"]');
  if (!inputBox) return false;

  const cleanTarget = String(messageText || '').replace(/\s+/g, ' ').trim();
  const now = Date.now();
  if (cleanTarget && lastComposeSendSig === cleanTarget && now - lastComposeSendAt < 1500) {
    return true;
  }
  lastComposeSendSig = cleanTarget;
  lastComposeSendAt = now;

  const existingNorm = (inputBox.textContent || '').replace(/\s+/g, ' ').trim();
  if (cleanTarget && existingNorm.includes(cleanTarget)) {
    inputBox.focus();
    setTimeout(() => triggerSendAfterInsert(inputBox), 60);
    return true;
  }

  setLexicalEditableText(inputBox, messageText, 180, () => triggerSendAfterInsert(inputBox));
  return true;
}

let activePendingSendTimer = null;

function processPendingDirectSend() {
  if (!IS_WHATSAPP_WEB || activePendingSendTimer) return;

  let pending = null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_SEND_STORAGE_KEY);
    if (!raw) return;
    pending = JSON.parse(raw);
  } catch {
    return;
  }

  if (!pending || !pending.requestId || (!pending.message && !pending.openOnly)) {
    window.sessionStorage.removeItem(PENDING_SEND_STORAGE_KEY);
    return;
  }

  if (Date.now() - (pending.createdAt || 0) > 60000) {
    window.sessionStorage.removeItem(PENDING_SEND_STORAGE_KEY);
    ipcRenderer.sendToHost('wa:send-result', {
      requestId: pending.requestId,
      ok: false,
      error: 'Timed out waiting for WhatsApp Web chat to open'
    });
    return;
  }

  const finishSend = (ok, error) => {
    if (activePendingSendTimer) {
      clearInterval(activePendingSendTimer);
      activePendingSendTimer = null;
    }
    window.sessionStorage.removeItem(PENDING_SEND_STORAGE_KEY);
    ipcRenderer.sendToHost('wa:send-result', {
      requestId: pending.requestId,
      ok,
      error
    });
  };

  let attempts = 0;
  activePendingSendTimer = setInterval(() => {
    attempts += 1;

    // Check for WhatsApp "Phone number shared via url is invalid" modal
    const modalText = document.querySelector('[data-animate-modal-popup="true"]')?.textContent || '';
    if (/invalid|not on whatsapp|couldn't find/i.test(modalText)) {
      const okBtn = document.querySelector('[data-animate-modal-popup="true"] button');
      if (okBtn) okBtn.click();
      finishSend(false, 'Customer phone number is not valid on WhatsApp');
      return;
    }

    const inputBox =
      document.querySelector('#main footer div[contenteditable="true"][data-tab]') ||
      document.querySelector('#main footer div[contenteditable="true"]');
    const sendBtn = findSendButton();

    if (inputBox && pending.openOnly) {
      finishSend(true);
      return;
    }

    if (inputBox && sendBtn) {
      clearInterval(activePendingSendTimer);
      activePendingSendTimer = null;

      // If text is already prefilled by ?text= URL param, focus & click Send; otherwise insert
      const currentInput = (inputBox.textContent || '').trim();
      if (currentInput) {
        inputBox.focus();
        triggerClickElement(sendBtn);
        setTimeout(() => finishSend(true), 700);
      } else {
        const triggered = insertTextAndClickSend(pending.message);
        setTimeout(() => finishSend(triggered, triggered ? undefined : 'Could not populate message input'), 950);
      }
      return;
    }

    if (attempts >= 75) {
      finishSend(false, 'WhatsApp Web compose box did not become ready');
    }
  }, 450);
}

ipcRenderer.on('wa:request-snapshot', () => {
  if (!IS_WHATSAPP_WEB) {
    ipcRenderer.sendToHost('wa:active-chat', null);
    return;
  }
  const snapshot = extractActiveChatSnapshot();
  ipcRenderer.sendToHost('wa:active-chat', snapshot);
});

ipcRenderer.on('wa:scan-chats-for-import', (_event, payload) => {
  const { requestId, mode, startDate, endDate, trigger } = payload || {};
  if (!IS_WHATSAPP_WEB || !isLoggedInWhatsAppDom()) {
    ipcRenderer.sendToHost('wa:bulk-chats-scanned', {
      requestId,
      trigger: trigger || 'manual_range',
      mode: mode || 'range',
      startDate: startDate || '',
      endDate: endDate || '',
      totalScanned: 0,
      chats: [],
      error: 'WhatsApp Web is not connected in this tab'
    });
    return;
  }
  scanChatsForImport({
    requestId,
    mode: mode || 'range',
    startDate: startDate || '',
    endDate: endDate || '',
    trigger: trigger || 'manual_range'
  });
});

ipcRenderer.on('wa:send-direct-message', (_event, payload) => {
  const { requestId, phone, contactName, message = '', media = null, openOnly = false } = payload || {};
  const hasMedia = Boolean(media && media.bytes);
  if (!IS_WHATSAPP_WEB || !requestId || (!message && !hasMedia && !openOnly)) {
    ipcRenderer.sendToHost('wa:send-result', {
      requestId,
      ok: false,
      error: 'WhatsApp Web is not active or message payload is empty'
    });
    return;
  }

  refreshSavedContactsFromIndexedDB();
  const cleanContactName = String(contactName || '').trim();
  const resolvedCachedDigits = !phone && cleanContactName
    ? cachedContactPhonesByName.get(normalizeContactTitle(cleanContactName)) || ''
    : '';
  const digits = normalizePhoneDigits(phone || resolvedCachedDigits);
  if (!digits && !cleanContactName) {
    ipcRenderer.sendToHost('wa:send-result', {
      requestId,
      ok: false,
      error: 'Customer phone number and contact name are both missing'
    });
    return;
  }

  const activeSnapshot = extractActiveChatSnapshot();
  const activeDigits10 = activeSnapshot?.phone ? activeSnapshot.phone.slice(-10) : '';
  const targetDigits10 = digits ? digits.slice(-10) : '';
  const activeNameNorm = normalizeContactTitle(activeSnapshot?.contactName || '');
  const targetNameNorm = normalizeContactTitle(cleanContactName);

  // 1. Fast path: target chat (by phone or saved contact name) is already open in #main
  const activeMatchesPhone = Boolean(activeDigits10 && targetDigits10 && activeDigits10 === targetDigits10);
  const activeMatchesName = Boolean(
    targetNameNorm &&
    activeNameNorm &&
    (activeNameNorm === targetNameNorm ||
      activeNameNorm.includes(targetNameNorm) ||
      targetNameNorm.includes(activeNameNorm)) &&
    !activeSnapshot?.isGroup
  );
  if (activeMatchesPhone || activeMatchesName) {
    if (openOnly) {
      ipcRenderer.sendToHost('wa:send-result', {
        requestId,
        ok: true,
        resolvedPhone: activeSnapshot?.phone || digits || ''
      });
      return;
    }
    if (hasMedia) {
      insertMediaAndClickSend(media, message, (ok, errMsg) => {
        ipcRenderer.sendToHost('wa:send-result', {
          requestId,
          ok,
          resolvedPhone: activeSnapshot?.phone || digits || '',
          error: errMsg
        });
      });
      return;
    }
    const sent = insertTextAndClickSend(message);
    setTimeout(() => {
      ipcRenderer.sendToHost('wa:send-result', {
        requestId,
        ok: sent,
        resolvedPhone: activeSnapshot?.phone || digits || '',
        error: sent ? undefined : 'WhatsApp compose input not found in open chat'
      });
    }, 250);
    return;
  }

  const prevContactName = activeSnapshot?.contactName || '';

  ensureChatsPaneReady(() => {
    // 2. Fast SPA path: click matching row directly in #pane-side (by phone or saved contact name)
    const sidebarMatch = findSidebarChatByDigits10(targetDigits10) || findSidebarChatByName(cleanContactName);
    if (sidebarMatch?.target) {
      triggerClickElement(sidebarMatch.target);
      pollAndSendOpenedChat({
        requestId,
        targetDigits10,
        cleanContactName,
        prevContactName,
        message,
        media: hasMedia ? media : null,
        openOnly,
        digits,
        matchObj: sidebarMatch,
        clearSearchAfterOpen: false
      });
      return;
    }

    // 3. Sidebar search path: locate scrolled-down or saved WhatsApp contact via WhatsApp search box
    const searchQuery = cleanContactName || targetDigits10;
    const searchBox = findSidebarSearchBox();
    if (searchBox && searchQuery) {
      setLexicalEditableText(searchBox, searchQuery, 100);

      setTimeout(() => {
        const searchMatch = findSidebarChatByDigits10(targetDigits10) || findSidebarChatByName(cleanContactName);
        if (searchMatch?.target) {
          triggerClickElement(searchMatch.target);
          pollAndSendOpenedChat({
            requestId,
            targetDigits10,
            cleanContactName,
            prevContactName,
            message,
            media: hasMedia ? media : null,
            openOnly,
            digits,
            matchObj: searchMatch,
            clearSearchAfterOpen: true
          });
          return;
        }

        clearSidebarSearchBox();
        if (hasMedia && !openOnly) {
          ipcRenderer.sendToHost('wa:send-result', {
            requestId,
            ok: false,
            error: `Chat for "${cleanContactName || digits}" not found in WhatsApp sidebar`
          });
          return;
        }
        navigateSendViaUrlOrFail(
          requestId,
          digits,
          message,
          `No WhatsApp chat found for "${cleanContactName}" on this account`,
          Boolean(openOnly)
        );
      }, 800);
      return;
    }

    // 4. Direct URL fallback (only available when phone digits exist)
    if (hasMedia && !openOnly) {
      ipcRenderer.sendToHost('wa:send-result', {
        requestId,
        ok: false,
        error: `Chat for "${cleanContactName || digits}" not open in sidebar`
      });
      return;
    }
    navigateSendViaUrlOrFail(
      requestId,
      digits,
      message,
      `No phone number saved for "${cleanContactName}" and chat was not found in WhatsApp Web`,
      Boolean(openOnly)
    );
  });
});

if (IS_WHATSAPP_WEB) {
  let emitTimer = null;
  const scheduleEmit = () => {
    if (emitTimer) return;
    emitTimer = setTimeout(() => {
      emitTimer = null;
      emitState();
    }, 150);
  };

  window.addEventListener('DOMContentLoaded', () => {
    const markUserInput = () => {
      lastUserInputAt = Date.now();
    };
    window.addEventListener('pointerdown', markUserInput, true);
    window.addEventListener('keydown', markUserInput, true);

    emitState();
    processPendingDirectSend();
    const observer = new MutationObserver(scheduleEmit);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    setInterval(emitState, 2500);
  });
}

import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface AiChatMessage {
    id: string;
    type: 'user' | 'ai';
    text: string;
    timestamp: number; // Unix epoch ms
}

export interface AiChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: AiChatMessage[];
    userId?: string;
}

export interface DateGroupedSessions {
    group: string;
    sessions: AiChatSession[];
}

const STORAGE_PREFIX = 'bill_pro_ai_sessions_';

/**
 * Generate a friendly readable title from the first message
 */
export function generateChatTitle(firstMessage: string): string {
    if (!firstMessage) return 'New Conversation';
    const cleaned = firstMessage
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/^(hey bill pro|bill pro|hi|hello|please)\s+/i, '')
        .trim();
    if (!cleaned) return 'New Conversation';
    if (cleaned.length <= 36) {
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    return cleaned.slice(0, 33).trim() + '...';
}

/**
 * Format message timestamp into time string (e.g., 3:45 PM)
 */
export function formatMessageTime(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format session date label (e.g., "Yesterday", "Today", or "11 Oct 2026")
 */
export function formatSessionDateLabel(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

    if (timestamp >= todayStart) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (timestamp >= yesterdayStart) {
        return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Group sessions into ChatGPT categories: Today, Yesterday, Previous 7 Days, Previous 30 Days, Older
 */
export function groupSessionsByDate(sessions: AiChatSession[]): DateGroupedSessions[] {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const sevenDaysAgoStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgoStart = todayStart - 30 * 24 * 60 * 60 * 1000;

    const groups: Record<string, AiChatSession[]> = {
        'Today': [],
        'Yesterday': [],
        'Previous 7 Days': [],
        'Previous 30 Days': [],
        'Older': []
    };

    // Sort newest updated/created first
    const sorted = [...sessions].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

    for (const session of sorted) {
        const time = session.updatedAt || session.createdAt;
        if (time >= todayStart) {
            groups['Today'].push(session);
        } else if (time >= yesterdayStart) {
            groups['Yesterday'].push(session);
        } else if (time >= sevenDaysAgoStart) {
            groups['Previous 7 Days'].push(session);
        } else if (time >= thirtyDaysAgoStart) {
            groups['Previous 30 Days'].push(session);
        } else {
            groups['Older'].push(session);
        }
    }

    return Object.entries(groups)
        .filter(([_, list]) => list.length > 0)
        .map(([group, sessionsList]) => ({ group, sessions: sessionsList }));
}

/**
 * Load local sessions from localStorage
 */
export function loadLocalSessions(userId: string = 'default'): AiChatSession[] {
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed;
        }
    } catch (e) {
        console.warn('Failed to load local AI chat sessions:', e);
    }
    return [];
}

/**
 * Save sessions to localStorage
 */
export function saveLocalSessions(sessions: AiChatSession[], userId: string = 'default'): void {
    try {
        localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(sessions));
    } catch (e) {
        console.warn('Failed to save local AI chat sessions:', e);
    }
}

/**
 * Sync a session to Firestore
 */
export async function syncSessionToFirestore(session: AiChatSession, userId?: string): Promise<void> {
    if (!userId || !db) return;
    try {
        const sessionRef = doc(db, 'users', userId, 'ai_conversations', session.id);
        await setDoc(sessionRef, {
            ...session,
            userId
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to sync session to Firestore:', e);
    }
}

/**
 * Fetch user sessions from Firestore
 */
export async function loadFirestoreSessions(userId?: string): Promise<AiChatSession[]> {
    if (!userId || !db) return [];
    try {
        const colRef = collection(db, 'users', userId, 'ai_conversations');
        const q = query(colRef, orderBy('updatedAt', 'desc'), limit(50));
        const snap = await getDocs(q);
        const results: AiChatSession[] = [];
        snap.forEach(d => {
            const data = d.data() as any;
            results.push({
                id: d.id,
                title: data.title || 'Untitled Chat',
                createdAt: data.createdAt || Date.now(),
                updatedAt: data.updatedAt || Date.now(),
                messages: Array.isArray(data.messages) ? data.messages : [],
                userId: data.userId || userId
            });
        });
        return results;
    } catch (e) {
        console.warn('Failed to fetch sessions from Firestore:', e);
        return [];
    }
}

/**
 * Delete a session from Firestore
 */
export async function deleteFirestoreSession(sessionId: string, userId?: string): Promise<void> {
    if (!userId || !db) return;
    try {
        await deleteDoc(doc(db, 'users', userId, 'ai_conversations', sessionId));
    } catch (e) {
        console.warn('Failed to delete session from Firestore:', e);
    }
}

/**
 * Clear all sessions for a user from Firestore
 */
export async function clearAllFirestoreSessions(userId?: string): Promise<void> {
    if (!userId || !db) return;
    try {
        const colRef = collection(db, 'users', userId, 'ai_conversations');
        const snap = await getDocs(colRef);
        const deletions = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletions);
    } catch (e) {
        console.warn('Failed to clear sessions from Firestore:', e);
    }
}

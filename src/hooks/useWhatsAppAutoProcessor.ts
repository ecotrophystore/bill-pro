import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, getDoc, limit } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { resolveApiUrl } from '../lib/apiBase';
import { processInboundWhatsAppMessage } from '../lib/whatsappInboundProcessor';
import {
  fetchAllSessions,
  subscribeToWhatsAppEvents,
  type SessionInfo,
  type AiLeadInsight
} from '../services/whatsappMultiSessionService';
import {
  getAutoCrmSyncEnabled,
  subscribeAutoCrmSyncChange,
  syncWhatsAppLeadToCrm
} from '../services/whatsappCrmSyncService';

const syncedSseKeys = new Set<string>();
const syncedBulkBatches = new Set<string>();

/**
 * Background auto-processor hook.
 * Listens for new inbound WhatsApp messages (Firestore Meta webhooks + live Baileys WhatsApp Web)
 * and automatically classifies & syncs leads into the right CRM pipeline and stage.
 */
export function useWhatsAppAutoProcessor() {
  const processingRef = useRef<Set<string>>(new Set());
  const sessionsByIdRef = useRef<Record<string, SessionInfo>>({});
  const [autoCrmEnabled, setAutoCrmEnabled] = useState<boolean>(() => getAutoCrmSyncEnabled());

  useEffect(() => {
    return subscribeAutoCrmSyncChange((enabled) => {
      setAutoCrmEnabled(enabled);
    });
  }, []);

  // 1. Live Baileys Multi-WhatsApp Web -> Automatic CRM Pipeline Sync
  useEffect(() => {
    if (!db || !autoCrmEnabled) return;

    const handleDetectedLead = async (payload: {
      sessionId: string;
      remoteJid: string;
      phone?: string;
      name?: string;
      sessionLabel?: string;
      messageText?: string;
      insight: any;
    }) => {
      const { sessionId, remoteJid, insight } = payload;
      const dedupeKey = `${sessionId}:${remoteJid}:${insight?.analyzedAt || ''}:${(payload.messageText || '').slice(0, 30)}`;
      if (syncedSseKeys.has(dedupeKey)) return;
      syncedSseKeys.add(dedupeKey);

      try {
        let matchedSession = sessionsByIdRef.current[sessionId];
        if (!matchedSession?.phoneNumber) {
          const allSessions = await fetchAllSessions();
          allSessions.forEach((s) => {
            sessionsByIdRef.current[s.id] = s;
          });
          matchedSession = sessionsByIdRef.current[sessionId];
        }

        const fallbackInsight: AiLeadInsight = {
          leadName: payload.name || payload.phone || 'WhatsApp Contact',
          company: '',
          phone: payload.phone || '',
          requirement: payload.messageText || '',
          quantity: '',
          budget: '',
          urgency: 'medium',
          stage: 'new',
          isBusinessLead: false,
          suggestedAction: 'Collect requirements from contact',
          suggestedReply: '',
          analyzedAt: Date.now()
        };

        const effectiveInsight = insight || fallbackInsight;

        const outcome = await syncWhatsAppLeadToCrm({
          sessionId,
          sessionLabel: payload.sessionLabel || matchedSession?.label,
          sourceWhatsappNumber: matchedSession?.phoneNumber || '',
          remoteJid,
          phone: payload.phone || effectiveInsight.phone,
          name: payload.name || effectiveInsight.leadName,
          messageText: payload.messageText || effectiveInsight.requirement,
          insight: effectiveInsight,
          forceCreate: false,
          triggeredBy: 'auto'
        });

        if (outcome.action === 'created') {
          toast.success(
            `New WhatsApp Contact & Lead saved: ${outcome.leadName} → ${outcome.pipelineName} (${outcome.stageLabel})`,
            { duration: 5000 }
          );
        } else if (outcome.action === 'updated') {
          toast.success(
            `WhatsApp Lead updated: ${outcome.leadName} (${outcome.pipelineName} • ${outcome.stageLabel})`,
            { duration: 4000 }
          );
        } else if (outcome.action === 'skipped' && outcome.reason?.includes('Waiting for user')) {
          // Trigger the interactive approval modal across all active screens to save contact
          window.dispatchEvent(
            new CustomEvent('ecobill:whatsapp-confirm-lead', {
              detail: {
                sessionId,
                remoteJid,
                phone: payload.phone || effectiveInsight.phone,
                name: payload.name || effectiveInsight.leadName || outcome.leadName,
                messageText: payload.messageText || effectiveInsight.requirement,
                sessionLabel: payload.sessionLabel || matchedSession?.label,
                insight: effectiveInsight,
                messageTimestamp: Date.now()
              }
            })
          );
        }
      } catch (err) {
        console.warn('[AutoProcessor] Baileys CRM sync skipped:', err);
      }
    };

    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    fetch(resolveApiUrl('/api/whatsapp/health'))
      .then((r) => (r.ok ? r.json() : null))
      .then((health) => {
        if (disposed || !health) return;
        unsubscribe = subscribeToWhatsAppEvents({
          onInit: ({ sessions, conversations }) => {
            (sessions || []).forEach((s) => {
              sessionsByIdRef.current[s.id] = s;
            });
            // Only catch fresh live leads analyzed in the last 3 minutes before reload (never bulk-import old chats)
            const recentCutoff = Date.now() - 3 * 60 * 1000;
            (conversations || []).forEach((c) => {
              if (c.insight?.isBusinessLead === true && (c.insight.analyzedAt || 0) >= recentCutoff) {
                handleDetectedLead({
                  sessionId: c.sessionId,
                  remoteJid: c.remoteJid,
                  phone: c.phone,
                  name: c.name,
                  sessionLabel: c.sessionLabel,
                  messageText: c.lastMessage,
                  insight: c.insight
                });
              }
            });
          },
          onSessionUpdate: (session) => {
            sessionsByIdRef.current[session.id] = session;
          },
          onIncomingMessage: (data) => {
            const { message, sessionId, remoteJid, conversation } = data;
            // Ignore messages sent by ourselves or group/newsletter messages
            if (message.fromMe || remoteJid.endsWith('@g.us') || remoteJid.includes('status') || remoteJid.includes('newsletter')) return;

            const text = (message.text || '').trim();
            if (!text) return;

            // Trigger lead evaluation and prompt approval if non-requirement chat
            handleDetectedLead({
              sessionId,
              remoteJid,
              phone: message.senderPhone || conversation?.phone,
              name: message.senderName || conversation?.name,
              sessionLabel: conversation?.sessionLabel,
              messageText: text,
              insight: conversation?.insight || {
                leadName: message.senderName || conversation?.name || 'Customer',
                company: '',
                phone: message.senderPhone || conversation?.phone || '',
                requirement: text,
                quantity: '',
                budget: '',
                urgency: 'medium',
                stage: 'new',
                isBusinessLead: false,
                suggestedAction: 'Collect requirements from contact',
                suggestedReply: '',
                analyzedAt: Date.now()
              }
            });
          },
          onLeadDetected: (data) => {
            handleDetectedLead(data);
          },
          onBulkLeadsReady: async ({ sessionId, leads, totalScanned }) => {
            const batchKey = `${sessionId}:${leads?.length || 0}:${leads?.[0]?.remoteJid || ''}`;
            if (syncedBulkBatches.has(batchKey)) return;
            syncedBulkBatches.add(batchKey);

            if (!Array.isArray(leads) || leads.length === 0) return;

            let created = 0;
            let updated = 0;
            for (const item of leads) {
              try {
                const outcome = await syncWhatsAppLeadToCrm({
                  sessionId: item.sessionId || sessionId,
                  sessionLabel: item.sessionLabel || sessionsByIdRef.current[sessionId]?.label,
                  sourceWhatsappNumber:
                    item.sourceWhatsappNumber || sessionsByIdRef.current[sessionId]?.phoneNumber || '',
                  remoteJid: item.remoteJid,
                  phone: item.phone || item.insight?.phone,
                  name: item.name || item.insight?.leadName,
                  messageText: item.messageText || item.insight?.requirement,
                  insight: item.insight,
                  forceCreate: false,
                  triggeredBy: 'auto',
                  messageTimestamp: item.timestamp
                });
                if (outcome.action === 'created') created += 1;
                else if (outcome.action === 'updated') updated += 1;
              } catch (err) {
                console.warn('[AutoProcessor] Bulk QR lead sync skipped:', err);
              }
            }

            if (created > 0 || updated > 0) {
              toast.success(
                `QR Scan Sync: Added ${created} existing lead(s), updated ${updated} in Pipeline.`,
                { duration: 6000 }
              );
            } else if ((totalScanned || 0) > 0) {
              toast(`QR Scan Sync: Scanned ${totalScanned} chat(s), existing leads are up to date.`);
            }
          }
        });
      })
      .catch(() => {
        // Backend service on port 5001 is optional in Desktop Browser mode
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [autoCrmEnabled]);

  // 2. Legacy Firestore inbound messages listener
  useEffect(() => {
    if (!db) return;

    // Listen for recent inbound messages
    const q = query(
      collection(db, 'messages'),
      where('direction', '==', 'inbound'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' || change.type === 'modified') {
          const msgDoc = change.doc;
          const msgData = msgDoc.data();
          const msgId = msgDoc.id;

          // Avoid processing multiple times in memory
          if (msgData.aiProcessed || processingRef.current.has(msgId)) {
            continue;
          }

          processingRef.current.add(msgId);

          try {
            let senderPhone = msgData.senderPhone || msgData.from || msgData.participantPhone || '';
            let senderName = msgData.senderName || msgData.name || '';
            const content = msgData.content || msgData.body || msgData.text || '';

            // If phone is missing on message, resolve from conversation doc
            if (!senderPhone && msgData.conversationId) {
              try {
                const convSnap = await getDoc(doc(db, 'conversations', msgData.conversationId));
                if (convSnap.exists()) {
                  const cData = convSnap.data();
                  senderPhone = cData.participantPhone || '';
                  if (!senderName) senderName = cData.participantName || '';
                  if (senderPhone) {
                    await updateDoc(doc(db, 'messages', msgId), {
                      senderPhone,
                      from: senderPhone
                    });
                  }
                }
              } catch (e) {
                console.warn('[AutoProcessor] Could not resolve phone from conversation:', e);
              }
            }

            console.log(`[AutoProcessor] Auto-analyzing incoming message from ${senderPhone || 'unknown'}...`);

            if (senderPhone && content) {
              await processInboundWhatsAppMessage({
                senderPhone,
                senderName,
                messageText: content,
                metaMessageId: msgData.metaMessageId || msgId,
              });

              // Mark message as processed so it won't re-run
              await updateDoc(doc(db, 'messages', msgId), {
                aiProcessed: true,
                aiProcessedAt: new Date(),
              });
              console.log(`[AutoProcessor] Inbound message ${msgId} successfully analyzed and pipeline updated.`);
            }
          } catch (err) {
            console.error(`[AutoProcessor] Error auto-processing message ${msgId}:`, err);
          } finally {
            processingRef.current.delete(msgId);
          }
        }
      }
    }, (error) => {
      console.warn('[AutoProcessor] Listener notice:', error);
    });

    return () => unsubscribe();
  }, []);
}

import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { processInboundWhatsAppMessage } from '../lib/whatsappInboundProcessor';

/**
 * Background auto-processor hook.
 * Listens for new inbound WhatsApp messages and automatically analyzes and syncs them into the CRM pipeline.
 */
export function useWhatsAppAutoProcessor() {
  const processingRef = useRef<Set<string>>(new Set());

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
            console.log(`[AutoProcessor] Auto-analyzing incoming message from ${msgData.senderPhone || msgData.from}...`);

            const senderPhone = msgData.senderPhone || msgData.from || msgData.participantPhone || '';
            const senderName = msgData.senderName || msgData.name || '';
            const content = msgData.content || msgData.body || msgData.text || '';

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

import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ChatLabelDef } from '../constants/chatLabels';
import { CHAT_LABELS as DEFAULT_LABELS } from '../constants/chatLabels';

export function useChatLabels() {
  const [labels, setLabels] = useState<ChatLabelDef[]>(DEFAULT_LABELS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'settings', 'chat_labels');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.labels && Array.isArray(data.labels)) {
          setLabels(data.labels);
        } else {
          setLabels(DEFAULT_LABELS);
        }
      } else {
        // Document doesn't exist yet, seed it with defaults
        setDoc(docRef, { labels: DEFAULT_LABELS }).catch(console.error);
        setLabels(DEFAULT_LABELS);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching chat labels:', error);
      setLabels(DEFAULT_LABELS);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { labels, loading };
}

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import type { LeadNote } from '../types';
import {
  playTone,
  startAlarmLoop,
  stopAlarmLoop,
  sendBrowserNotification,
  requestNotificationPermission,
} from '../services/alarmSoundService';
import { snoozeLeadNoteReminder, completeLeadNoteReminder, updateLeadNote } from '../services/leadNoteService';

interface ReminderAlarmContextType {
  activeTriggeredAlarm: LeadNote | null;
  triggeredAlarmsQueue: LeadNote[];
  isAlarmAudioPlaying: boolean;
  muteAlarmSound: () => void;
  dismissAlarm: () => void;
  snoozeAlarm: (minutes: number) => Promise<void>;
  completeAlarm: () => Promise<void>;
  testAlarmSound: (sound?: 'chime' | 'digital' | 'bell' | 'urgent') => void;
  requestPushPermissions: () => Promise<boolean>;
}

const ReminderAlarmContext = createContext<ReminderAlarmContextType>({
  activeTriggeredAlarm: null,
  triggeredAlarmsQueue: [],
  isAlarmAudioPlaying: false,
  muteAlarmSound: () => {},
  dismissAlarm: () => {},
  snoozeAlarm: async () => {},
  completeAlarm: async () => {},
  testAlarmSound: () => {},
  requestPushPermissions: async () => false,
});

export const useReminderAlarm = () => useContext(ReminderAlarmContext);

function getNoteTimeMs(note: LeadNote): number {
  const val = note.snoozed_until || note.reminder_datetime;
  if (!val) return Infinity;
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? Infinity : d.getTime();
}

export function ReminderAlarmProvider({ children }: { children: React.ReactNode }) {
  const { user, dbUser } = useAuth();
  const [activeReminders, setActiveReminders] = useState<LeadNote[]>([]);
  const [activeTriggeredAlarm, setActiveTriggeredAlarm] = useState<LeadNote | null>(null);
  const [triggeredAlarmsQueue, setTriggeredAlarmsQueue] = useState<LeadNote[]>([]);
  const [isAlarmAudioPlaying, setIsAlarmAudioPlaying] = useState(false);

  // Set of note IDs that have already fired in the current session so they don't loop fire
  const firedNoteIdsRef = useRef<Set<string>>(new Set());

  // Listen to active reminders from Firestore
  useEffect(() => {
    if (!db) return;

    const q = query(
      collection(db, 'lead_notes'),
      where('has_reminder', '==', true)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const notes: LeadNote[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as LeadNote;
          const status = data.reminder_status || 'pending';
          if (status === 'pending' || status === 'snoozed') {
            notes.push({ ...data, id: docSnap.id });
          }
        });
        setActiveReminders(notes);
      },
      (err) => {
        console.warn('Error subscribing to active reminder notes:', err);
      }
    );

    return () => unsub();
  }, [user]);

  // Interval check every 3 seconds for overdue / due alarms
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      activeReminders.forEach((note) => {
        const scheduledMs = getNoteTimeMs(note);

        // Check if reminder is due and has not fired yet in this session
        if (scheduledMs <= now && !firedNoteIdsRef.current.has(note.id)) {
          // Check if reminder is meant for current user (tagged or author or general team)
          const isTagged =
            note.tagged_users && note.tagged_users.some((u) => u.id === user?.uid);
          const isAuthor = note.author_id === user?.uid;
          const isBroadcast = !note.tagged_users || note.tagged_users.length === 0;

          if (isTagged || isAuthor || isBroadcast) {
            firedNoteIdsRef.current.add(note.id);
            triggerAlarmForNote(note);
          }
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [activeReminders, user]);

  const triggerAlarmForNote = (note: LeadNote) => {
    // Add to queue and activate if none currently active
    setTriggeredAlarmsQueue((prev) => {
      if (prev.some((n) => n.id === note.id)) return prev;
      return [...prev, note];
    });

    setActiveTriggeredAlarm((curr) => curr || note);

    // Audio sound trigger
    if (note.alarm_enabled) {
      startAlarmLoop(note.alarm_sound || (note.priority === 'urgent' ? 'urgent' : 'digital'));
      setIsAlarmAudioPlaying(true);
    } else {
      playTone(note.alarm_sound || 'chime');
    }

    // Native browser push notification
    sendBrowserNotification(`⏰ Follow-up Reminder: ${note.lead_name || 'Customer Lead'}`, {
      body: `Stage: ${note.stage_name || 'Pipeline'}\n${note.content}`,
      tag: note.id,
      requireInteraction: true,
    });
  };

  const muteAlarmSound = () => {
    stopAlarmLoop();
    setIsAlarmAudioPlaying(false);
  };

  const advanceNextInQueue = () => {
    muteAlarmSound();
    setTriggeredAlarmsQueue((prev) => {
      const remaining = prev.slice(1);
      setActiveTriggeredAlarm(remaining[0] || null);
      return remaining;
    });
  };

  const dismissAlarm = () => {
    if (activeTriggeredAlarm) {
      updateLeadNote(activeTriggeredAlarm.id, { reminder_status: 'dismissed' }, activeTriggeredAlarm.lead_id);
    }
    advanceNextInQueue();
  };

  const snoozeAlarm = async (minutes: number = 15) => {
    if (activeTriggeredAlarm) {
      // Remove from fired set so it can fire again when snoozed time arrives
      firedNoteIdsRef.current.delete(activeTriggeredAlarm.id);
      await snoozeLeadNoteReminder(activeTriggeredAlarm.id, activeTriggeredAlarm.lead_id, minutes);
    }
    advanceNextInQueue();
  };

  const completeAlarm = async () => {
    if (activeTriggeredAlarm) {
      await completeLeadNoteReminder(
        activeTriggeredAlarm.id,
        activeTriggeredAlarm.lead_id,
        dbUser?.name || user?.displayName || 'User'
      );
    }
    advanceNextInQueue();
  };

  const testAlarmSound = (sound: 'chime' | 'digital' | 'bell' | 'urgent' = 'chime') => {
    playTone(sound);
  };

  const requestPushPermissions = async () => {
    return await requestNotificationPermission();
  };

  return (
    <ReminderAlarmContext.Provider
      value={{
        activeTriggeredAlarm,
        triggeredAlarmsQueue,
        isAlarmAudioPlaying,
        muteAlarmSound,
        dismissAlarm,
        snoozeAlarm,
        completeAlarm,
        testAlarmSound,
        requestPushPermissions,
      }}
    >
      {children}
    </ReminderAlarmContext.Provider>
  );
}

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { LeadNote, NoteChecklistItem, NotePriority, ReminderStatus, TaggedUser } from '../types';

export interface CreateNoteInput {
  lead_id: string;
  lead_name?: string;
  company?: string;
  phone?: string;
  pipeline_id?: string;
  stage_id?: string;
  stage_name?: string;
  content: string;
  category: LeadNote['category'];
  priority: NotePriority;
  is_pinned?: boolean;
  tagged_users: TaggedUser[];
  has_reminder: boolean;
  reminder_datetime?: any;
  alarm_enabled?: boolean;
  alarm_sound?: 'chime' | 'digital' | 'bell' | 'urgent';
  checklist?: NoteChecklistItem[];
}

/**
 * Creates a new note and dispatches in-app notifications for any tagged team members
 */
export async function createLeadNote(
  input: CreateNoteInput,
  currentUser: { uid: string; name?: string; email?: string }
): Promise<string> {
  if (!db) throw new Error('Firestore is not initialized');

  const notePayload: Omit<LeadNote, 'id'> = {
    lead_id: input.lead_id,
    lead_name: input.lead_name || 'Customer Lead',
    company: input.company || '',
    phone: input.phone || '',
    pipeline_id: input.pipeline_id || 'regular_order',
    stage_id: input.stage_id || 'new_enquiry',
    stage_name: input.stage_name || 'New Enquiry',
    author_id: currentUser.uid,
    author_name: currentUser.name || currentUser.email || 'Team Member',
    author_email: currentUser.email || '',
    content: input.content.trim(),
    category: input.category || 'general',
    priority: input.priority || 'medium',
    is_pinned: !!input.is_pinned,
    tagged_users: input.tagged_users || [],
    has_reminder: !!input.has_reminder,
    reminder_status: input.has_reminder ? 'pending' : undefined,
    reminder_datetime: input.has_reminder && input.reminder_datetime ? input.reminder_datetime : null,
    alarm_enabled: input.has_reminder ? !!input.alarm_enabled : false,
    alarm_sound: input.alarm_sound || 'chime',
    checklist: input.checklist || [],
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'lead_notes'), notePayload);

  // Sync with Lead document
  try {
    const leadRef = doc(db, 'leads', input.lead_id);
    const leadSnap = await getDoc(leadRef);
    if (leadSnap.exists()) {
      const currentCount = leadSnap.data().notes_count || 0;
      const leadUpdates: any = {
        notes_count: currentCount + 1,
        updated_at: serverTimestamp(),
      };

      if (input.has_reminder && input.reminder_datetime) {
        leadUpdates.active_reminder = {
          note_id: docRef.id,
          datetime: input.reminder_datetime,
          title: input.content.substring(0, 60),
          status: 'pending',
          priority: input.priority,
          alarm_enabled: !!input.alarm_enabled,
        };
      }

      await updateDoc(leadRef, leadUpdates);
    }
  } catch (err) {
    console.warn('Failed to update lead note metadata:', err);
  }

  // Create in-app notifications for tagged members
  if (input.tagged_users && input.tagged_users.length > 0) {
    try {
      const batch = writeBatch(db);
      input.tagged_users.forEach((tagged) => {
        if (tagged.id && tagged.id !== currentUser.uid) {
          const notifRef = doc(collection(db, 'notifications'));
          batch.set(notifRef, {
            title: `Mentioned in ${input.lead_name || 'Lead Note'}`,
            message: `${currentUser.name || 'A teammate'} tagged you: "${input.content.substring(0, 80)}${
              input.content.length > 80 ? '...' : ''
            }"`,
            type: 'lead',
            link: `/leads/${input.lead_id}`,
            user_id: tagged.id,
            is_read: false,
            created_at: serverTimestamp(),
          });
        }
      });
      await batch.commit();
    } catch (err) {
      console.warn('Failed to send mention notifications:', err);
    }
  }

  return docRef.id;
}

/**
 * Update an existing note
 */
export async function updateLeadNote(
  noteId: string,
  updates: Partial<LeadNote>,
  leadId?: string
) {
  if (!db) return;
  const noteRef = doc(db, 'lead_notes', noteId);
  await updateDoc(noteRef, {
    ...updates,
    updated_at: serverTimestamp(),
  });

  if (leadId && updates.has_reminder !== undefined) {
    await refreshLeadActiveReminder(leadId);
  }
}

/**
 * Delete a note
 */
export async function deleteLeadNote(noteId: string, leadId: string) {
  if (!db) return;
  await deleteDoc(doc(db, 'lead_notes', noteId));

  try {
    const leadRef = doc(db, 'leads', leadId);
    const leadSnap = await getDoc(leadRef);
    if (leadSnap.exists()) {
      const currentCount = Math.max(0, (leadSnap.data().notes_count || 1) - 1);
      await updateDoc(leadRef, {
        notes_count: currentCount,
        updated_at: serverTimestamp(),
      });
      await refreshLeadActiveReminder(leadId);
    }
  } catch (err) {
    console.warn('Failed to update lead note count on delete:', err);
  }
}

/**
 * Snooze reminder by specified minutes
 */
export async function snoozeLeadNoteReminder(
  noteId: string,
  leadId: string,
  minutes: number = 15
) {
  if (!db) return;
  const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000);
  await updateDoc(doc(db, 'lead_notes', noteId), {
    reminder_status: 'snoozed',
    snoozed_until: snoozedUntil,
    updated_at: serverTimestamp(),
  });

  await refreshLeadActiveReminder(leadId);
}

/**
 * Mark reminder as completed
 */
export async function completeLeadNoteReminder(
  noteId: string,
  leadId: string,
  completedBy?: string
) {
  if (!db) return;
  await updateDoc(doc(db, 'lead_notes', noteId), {
    reminder_status: 'completed',
    completed_at: serverTimestamp(),
    completed_by: completedBy || 'User',
    updated_at: serverTimestamp(),
  });

  await refreshLeadActiveReminder(leadId);
}

/**
 * Toggle pin status of a note
 */
export async function togglePinLeadNote(noteId: string, isPinned: boolean) {
  if (!db) return;
  await updateDoc(doc(db, 'lead_notes', noteId), {
    is_pinned: isPinned,
    updated_at: serverTimestamp(),
  });
}

/**
 * Toggle a single checklist item inside a note
 */
export async function toggleNoteChecklistItem(
  noteId: string,
  checklist: NoteChecklistItem[],
  itemId: string
) {
  if (!db) return;
  const updatedChecklist = checklist.map((item) =>
    item.id === itemId ? { ...item, completed: !item.completed } : item
  );

  await updateDoc(doc(db, 'lead_notes', noteId), {
    checklist: updatedChecklist,
    updated_at: serverTimestamp(),
  });
}

/**
 * Recalculate lead's next active reminder
 */
export async function refreshLeadActiveReminder(leadId: string) {
  if (!db || !leadId) return;
  try {
    const q = query(
      collection(db, 'lead_notes'),
      where('lead_id', '==', leadId),
      where('has_reminder', '==', true)
    );
    const snap = await getDocs(q);
    const pendingNotes: LeadNote[] = [];

    snap.forEach((d) => {
      const data = d.data() as LeadNote;
      if (data.reminder_status === 'pending' || data.reminder_status === 'snoozed') {
        pendingNotes.push({ ...data, id: d.id });
      }
    });

    // Sort by soonest reminder
    pendingNotes.sort((a, b) => {
      const aTime = getTimeMs(a.snoozed_until || a.reminder_datetime);
      const bTime = getTimeMs(b.snoozed_until || b.reminder_datetime);
      return aTime - bTime;
    });

    const leadRef = doc(db, 'leads', leadId);
    if (pendingNotes.length > 0) {
      const nextNote = pendingNotes[0];
      await updateDoc(leadRef, {
        active_reminder: {
          note_id: nextNote.id,
          datetime: nextNote.snoozed_until || nextNote.reminder_datetime,
          title: nextNote.content.substring(0, 60),
          status: nextNote.reminder_status,
          priority: nextNote.priority,
          alarm_enabled: !!nextNote.alarm_enabled,
        },
      });
    } else {
      await updateDoc(leadRef, {
        active_reminder: null,
      });
    }
  } catch (e) {
    console.warn('Error refreshing active reminder:', e);
  }
}

function getTimeMs(val: any): number {
  if (!val) return Infinity;
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? Infinity : d.getTime();
}

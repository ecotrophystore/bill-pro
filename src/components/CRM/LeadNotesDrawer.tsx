import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  Send,
  Bell,
  Clock,
  Pin,
  PinOff,
  CheckCircle2,
  Calendar,
  User,
  Users,
  AtSign,
  AlertCircle,
  Tag,
  Trash2,
  Mic,
  MicOff,
  Volume2,
  ExternalLink,
  Download,
  ListTodo,
  CheckSquare,
  Square,
  MessageSquare,
  Phone,
  Building,
  Sparkles,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useVoice } from '../../hooks/useVoice';
import { useReminderAlarm } from '../../contexts/ReminderAlarmContext';
import type { Lead, LeadNote, NoteCategory, NoteChecklistItem, NotePriority, TaggedUser, User as DBUser } from '../../types';
import {
  createLeadNote,
  deleteLeadNote,
  snoozeLeadNoteReminder,
  completeLeadNoteReminder,
  togglePinLeadNote,
  toggleNoteChecklistItem,
} from '../../services/leadNoteService';
import { generateGoogleCalendarUrl, downloadIcsFile } from '../../services/calendarExportService';

interface LeadNotesDrawerProps {
  isOpen: boolean;
  lead: Lead | null;
  stageName?: string;
  onClose: () => void;
  onNoteAdded?: () => void;
}

const CATEGORY_CONFIG: Record<NoteCategory, { label: string; icon: string; bg: string }> = {
  general: { label: 'General', icon: '📝', bg: 'bg-slate-100 text-slate-800 border-slate-200' },
  call: { label: 'Call Log', icon: '📞', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  whatsapp: { label: 'WhatsApp', icon: '💬', bg: 'bg-teal-100 text-teal-800 border-teal-200' },
  meeting: { label: 'Meeting', icon: '🤝', bg: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  task: { label: 'Follow-up Task', icon: '⏰', bg: 'bg-amber-100 text-amber-800 border-amber-200' },
  stage_blocker: { label: 'Stage Blocker', icon: '🚨', bg: 'bg-rose-100 text-rose-800 border-rose-200' },
};

const PRIORITY_CONFIG: Record<NotePriority, { label: string; bg: string }> = {
  low: { label: 'Low', bg: 'bg-slate-100 text-slate-700 border-slate-200' },
  medium: { label: 'Medium', bg: 'bg-blue-100 text-blue-800 border-blue-200' },
  high: { label: 'High', bg: 'bg-amber-100 text-amber-800 border-amber-200' },
  urgent: { label: 'Urgent 🔥', bg: 'bg-rose-100 text-rose-800 border-rose-200 font-bold animate-pulse' },
};

function formatDateTime(val: any): string {
  if (!val) return '-';
  const d =
    typeof val.toDate === 'function'
      ? val.toDate()
      : typeof val.seconds === 'number'
      ? new Date(val.seconds * 1000)
      : new Date(val);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getRelativeTimeLabel(val: any): { label: string; isOverdue: boolean; isSoon: boolean } {
  if (!val) return { label: '', isOverdue: false, isSoon: false };
  const d =
    typeof val.toDate === 'function'
      ? val.toDate()
      : typeof val.seconds === 'number'
      ? new Date(val.seconds * 1000)
      : new Date(val);
  if (Number.isNaN(d.getTime())) return { label: '', isOverdue: false, isSoon: false };

  const diffMs = d.getTime() - Date.now();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) {
    const minsAgo = Math.abs(diffMins);
    if (minsAgo < 60) return { label: `Overdue by ${minsAgo}m`, isOverdue: true, isSoon: false };
    const hrsAgo = Math.round(minsAgo / 60);
    if (hrsAgo < 24) return { label: `Overdue by ${hrsAgo}h`, isOverdue: true, isSoon: false };
    return { label: `Overdue by ${Math.round(hrsAgo / 24)}d`, isOverdue: true, isSoon: false };
  }

  if (diffMins < 60) {
    return { label: `Due in ${diffMins}m`, isOverdue: false, isSoon: true };
  }
  const diffHrs = Math.round(diffMins / 60);
  if (diffHrs < 24) {
    return { label: `Due in ${diffHrs}h`, isOverdue: false, isSoon: false };
  }
  return { label: `Due in ${Math.round(diffHrs / 24)}d`, isOverdue: false, isSoon: false };
}

function getPresetDateTime(preset: '15m' | '1h' | 'tomorrow_10am' | '2d'): string {
  const d = new Date();
  if (preset === '15m') {
    d.setMinutes(d.getMinutes() + 15);
  } else if (preset === '1h') {
    d.setHours(d.getHours() + 1);
  } else if (preset === 'tomorrow_10am') {
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
  } else if (preset === '2d') {
    d.setDate(d.getDate() + 2);
    d.setHours(10, 0, 0, 0);
  }

  const pad = (num: number) => String(num).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function LeadNotesDrawer({ isOpen, lead, stageName, onClose, onNoteAdded }: LeadNotesDrawerProps) {
  const { user, dbUser } = useAuth();
  const { testAlarmSound, requestPushPermissions } = useReminderAlarm();
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [usersList, setUsersList] = useState<TaggedUser[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);

  // Form State
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<NoteCategory>('general');
  const [priority, setPriority] = useState<NotePriority>('medium');
  const [isPinned, setIsPinned] = useState(false);
  const [selectedTaggedUsers, setSelectedTaggedUsers] = useState<TaggedUser[]>([]);
  const [hasReminder, setHasReminder] = useState(false);
  const [reminderDatetime, setReminderDatetime] = useState(getPresetDateTime('1h'));
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [alarmSound, setAlarmSound] = useState<'chime' | 'digital' | 'bell' | 'urgent'>('chime');
  const [checklists, setChecklists] = useState<NoteChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Autocomplete state for @mentions
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState<number>(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter state for notes stream
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [onlyReminders, setOnlyReminders] = useState(false);

  // Voice dictation hook
  const { isListening, transcript, startListening, stopListening } = useVoice();

  // Load team members from Firestore
  useEffect(() => {
    if (!db) return;
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const users: TaggedUser[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || data.email?.split('@')[0] || 'Member',
            email: data.email || '',
            role: data.role || 'Member',
          };
        });

        // Fallback default team roles if collection is small
        const defaults: TaggedUser[] = [
          { id: 'sales_team', name: 'Sales Rep', role: 'sales' },
          { id: 'design_team', name: 'Design Lead', role: 'designer' },
          { id: 'accounts_team', name: 'Accounts Officer', role: 'accounts' },
          { id: 'production_team', name: 'Production Unit', role: 'production' },
          { id: 'admin_team', name: 'Manager / Admin', role: 'admin' },
        ];

        const existingIds = new Set(users.map((u) => u.id));
        defaults.forEach((def) => {
          if (!existingIds.has(def.id)) users.push(def);
        });

        setUsersList(users);
      } catch (e) {
        console.warn('Error loading users list for mentions:', e);
      }
    };
    fetchUsers();
  }, []);

  // Voice transcript listener
  useEffect(() => {
    if (transcript) {
      setContent((prev) => `${prev} ${transcript}`.trim());
    }
  }, [transcript]);

  // Real-time subscription to notes for current lead
  useEffect(() => {
    if (!db || !lead?.id || !isOpen) {
      setNotes([]);
      setLoadingNotes(false);
      return;
    }

    setLoadingNotes(true);
    const q = query(collection(db, 'lead_notes'), where('lead_id', '==', lead.id));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const rows: LeadNote[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as LeadNote[];

        // Sort: Pinned first, then newest
        rows.sort((a, b) => {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
          const aTime = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
          const bTime = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
          return bTime - aTime;
        });

        setNotes(rows);
        setLoadingNotes(false);
      },
      (err) => {
        console.warn('Error fetching notes:', err);
        setLoadingNotes(false);
      }
    );

    return () => unsub();
  }, [lead?.id, isOpen]);

  // Handle @mention key input in textarea
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(val);

    // Look back from cursor to find if user typed @
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1 && (lastAtIndex === 0 || /\s/.test(textBeforeCursor[lastAtIndex - 1]))) {
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      if (!/\s/.test(query)) {
        setMentionQuery(query.toLowerCase());
        setMentionIndex(lastAtIndex);
        return;
      }
    }
    setMentionQuery(null);
  };

  const handleSelectMentionUser = (targetUser: TaggedUser) => {
    if (mentionIndex === -1) return;
    const before = content.slice(0, mentionIndex);
    const after = content.slice(textareaRef.current?.selectionStart || mentionIndex);
    const newContent = `${before}@${targetUser.name} ${after}`;
    setContent(newContent);
    setMentionQuery(null);

    // Add to tagged list if not present
    if (!selectedTaggedUsers.some((u) => u.id === targetUser.id)) {
      setSelectedTaggedUsers((prev) => [...prev, targetUser]);
    }

    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const toggleTagUserChip = (targetUser: TaggedUser) => {
    if (selectedTaggedUsers.some((u) => u.id === targetUser.id)) {
      setSelectedTaggedUsers((prev) => prev.filter((u) => u.id !== targetUser.id));
    } else {
      setSelectedTaggedUsers((prev) => [...prev, targetUser]);
    }
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    setChecklists((prev) => [
      ...prev,
      { id: `item_${Date.now()}`, text: newChecklistText.trim(), completed: false },
    ]);
    setNewChecklistText('');
  };

  const handleRemoveChecklistItem = (id: string) => {
    setChecklists((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !lead || submitting) return;

    setSubmitting(true);
    try {
      if (hasReminder) {
        await requestPushPermissions();
      }

      await createLeadNote(
        {
          lead_id: lead.id,
          lead_name: lead.name,
          company: lead.company || lead.organization || '',
          phone: lead.phone || '',
          pipeline_id: lead.pipeline_id || 'regular_order',
          stage_id: lead.status || 'new_enquiry',
          stage_name: stageName || lead.status || 'Stage',
          content: content.trim(),
          category,
          priority,
          is_pinned: isPinned,
          tagged_users: selectedTaggedUsers,
          has_reminder: hasReminder,
          reminder_datetime: hasReminder && reminderDatetime ? new Date(reminderDatetime) : null,
          alarm_enabled: hasReminder && alarmEnabled,
          alarm_sound: alarmSound,
          checklist: checklists,
        },
        {
          uid: user?.uid || 'user',
          name: dbUser?.name || user?.displayName || 'User',
          email: user?.email || '',
        }
      );

      // Reset form
      setContent('');
      setIsPinned(false);
      setSelectedTaggedUsers([]);
      setHasReminder(false);
      setChecklists([]);
      onNoteAdded?.();
    } catch (err: any) {
      console.error('Failed to create note:', err);
      alert('Error creating note: ' + (err?.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    return usersList.filter(
      (u) =>
        u.name.toLowerCase().includes(mentionQuery) ||
        (u.role && u.role.toLowerCase().includes(mentionQuery))
    );
  }, [mentionQuery, usersList]);

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (filterCategory !== 'all' && n.category !== filterCategory) return false;
      if (onlyReminders && !n.has_reminder) return false;
      return true;
    });
  }, [notes, filterCategory, onlyReminders]);

  if (!isOpen || !lead) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex justify-end animate-fade-in">
      <div className="w-full max-w-2xl bg-surface h-full shadow-2xl flex flex-col border-l border-shadow-darker/20 animate-slide-left overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-shadow-darker/10 bg-surface/90 backdrop-blur flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Pipeline Stage Notes & Reminders
              </span>
              {stageName && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  📍 {stageName}
                </span>
              )}
            </div>
            <h2 className="text-xl font-extrabold text-primary-dark flex items-center gap-2">
              {lead.name}
            </h2>
            <div className="flex items-center gap-3 text-xs text-secondary flex-wrap">
              {lead.company && (
                <span className="flex items-center gap-1">
                  <Building size={12} /> {lead.company}
                </span>
              )}
              {lead.phone && (
                <span className="flex items-center gap-1 font-mono text-emerald-700">
                  <Phone size={12} /> {lead.phone}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-secondary hover:text-primary-dark hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Main Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-sidebar-scrollbar">
          {/* Note Creation Composer Box */}
          <form onSubmit={handleSubmitNote} className="neo-card space-y-4 border border-shadow-darker/10">
            <div className="flex items-center justify-between gap-2 border-b border-shadow-darker/10 pb-2.5">
              <span className="text-xs font-bold text-primary-dark flex items-center gap-1.5">
                <MessageSquare size={14} className="text-primary" />
                Add Stage Note / Follow-up Task
              </span>

              {/* Pin Note Toggle */}
              <button
                type="button"
                onClick={() => setIsPinned(!isPinned)}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all ${
                  isPinned
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'text-secondary hover:text-primary-dark hover:bg-slate-100'
                }`}
                title={isPinned ? 'Note will be pinned to top' : 'Pin note'}
              >
                {isPinned ? <Pin size={13} className="fill-amber-600 text-amber-600" /> : <Pin size={13} />}
                <span>{isPinned ? 'Pinned' : 'Pin'}</span>
              </button>
            </div>

            {/* Note Category & Priority Strip */}
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
              {/* Category Pills */}
              <div className="flex items-center gap-1 flex-wrap">
                {(Object.keys(CATEGORY_CONFIG) as NoteCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                      category === cat
                        ? CATEGORY_CONFIG[cat].bg + ' shadow-xs ring-1 ring-primary/40'
                        : 'bg-surface text-secondary border-shadow-darker/10 hover:bg-slate-50'
                    }`}
                  >
                    <span>{CATEGORY_CONFIG[cat].icon}</span> {CATEGORY_CONFIG[cat].label}
                  </button>
                ))}
              </div>

              {/* Priority Select */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-secondary uppercase">Priority:</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as NotePriority)}
                  className="neo-input !py-1 !px-2 !text-xs font-bold"
                >
                  <option value="low">🌱 Low</option>
                  <option value="medium">⚡ Medium</option>
                  <option value="high">🔥 High</option>
                  <option value="urgent">🚨 Urgent</option>
                </select>
              </div>
            </div>

            {/* Quick Tag Member Picker Strip */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-primary-dark flex items-center gap-1">
                  <AtSign size={12} className="text-primary" /> Tag Team Members (@mentions):
                </label>
                <span className="text-[10px] text-secondary">Click to tag / type @ in note</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {usersList.map((u) => {
                  const isTagged = selectedTaggedUsers.some((sel) => sel.id === u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleTagUserChip(u)}
                      className={`text-[11px] px-2.5 py-0.5 rounded-full border font-bold transition-all flex items-center gap-1 ${
                        isTagged
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      <User size={10} />
                      <span>{u.name}</span>
                      {u.role && <span className="opacity-70 text-[9px]">({u.role})</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Textarea with Mention Autocomplete Container */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                className="neo-input w-full min-h-[90px] text-xs resize-y leading-relaxed font-sans"
                placeholder="Write note or instructions... (Type @ to mention team members, e.g. @sales, @designer)"
                value={content}
                onChange={handleContentChange}
                required
              />

              {/* Voice Dictation Mic Button in Corner */}
              <div className="absolute right-2 bottom-2.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`p-1.5 rounded-lg border transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white border-rose-600 animate-pulse'
                      : 'bg-surface text-secondary hover:text-primary-dark border-shadow-darker/15 hover:bg-slate-100'
                  }`}
                  title={isListening ? 'Stop voice recording' : 'Dictate note with microphone'}
                >
                  {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              </div>

              {/* Autocomplete Dropdown Popup */}
              {mentionQuery !== null && filteredMentions.length > 0 && (
                <div className="absolute left-0 top-full mt-1 w-64 bg-surface rounded-2xl shadow-xl border border-shadow-darker/20 p-1.5 z-30 space-y-1 animate-scale-up text-xs">
                  <div className="px-2 py-1 text-[10px] font-bold text-secondary uppercase border-b border-shadow-darker/10">
                    Team Members
                  </div>
                  {filteredMentions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectMentionUser(u)}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-primary/10 text-primary-dark font-medium transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold">{u.name}</span>
                      </div>
                      <span className="text-[10px] text-secondary font-mono">{u.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive Checklist Builder */}
            <div className="space-y-2 pt-1 border-t border-shadow-darker/10">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-primary-dark flex items-center gap-1">
                  <ListTodo size={13} className="text-primary" /> Action Items / Checklist:
                </span>
                <span className="text-[10px] text-secondary">{checklists.length} tasks</span>
              </div>

              {checklists.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 border border-shadow-darker/5 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-800">
                    <CheckSquare size={13} className="text-emerald-600" />
                    <span>{item.text}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveChecklistItem(item.id)}
                    className="text-secondary hover:text-rose-600 p-1"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="neo-input flex-1 !py-1.5 !text-xs"
                  placeholder="Add actionable subtask (e.g. Verify advance payment, Send trophy sample mockup)..."
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChecklistItem();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddChecklistItem}
                  className="neo-btn !py-1.5 !px-3 text-xs font-bold text-primary"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* Reminder & Alarm Settings Section */}
            <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasReminder}
                    onChange={(e) => setHasReminder(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                  />
                  <Bell size={14} className={hasReminder ? 'text-amber-600 animate-bounce' : 'text-secondary'} />
                  Set Reminder & Alarm Notification
                </label>

                {hasReminder && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                    Active Alarm
                  </span>
                )}
              </div>

              {hasReminder && (
                <div className="space-y-3 pt-2 border-t border-amber-200/50 animate-fade-in text-xs">
                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-amber-900 uppercase">Quick Presets:</span>
                    {[
                      { label: '+15 Mins', preset: '15m' as const },
                      { label: '+1 Hour', preset: '1h' as const },
                      { label: 'Tomorrow 10 AM', preset: 'tomorrow_10am' as const },
                      { label: 'In 2 Days', preset: '2d' as const },
                    ].map((btn) => (
                      <button
                        key={btn.preset}
                        type="button"
                        onClick={() => setReminderDatetime(getPresetDateTime(btn.preset))}
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-semibold text-[11px] transition-colors"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Calendar Date & Time Input */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-amber-900 block text-[11px]">
                        📅 Reminder Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        className="neo-input w-full !py-1.5 !text-xs font-semibold"
                        value={reminderDatetime}
                        onChange={(e) => setReminderDatetime(e.target.value)}
                        required={hasReminder}
                      />
                    </div>

                    {/* Alarm Sound Selector */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-amber-900 block text-[11px]">
                          🔊 Alarm Sound Tone
                        </label>
                        <button
                          type="button"
                          onClick={() => testAlarmSound(alarmSound)}
                          className="text-[10px] font-bold text-amber-800 hover:underline flex items-center gap-0.5"
                        >
                          <Volume2 size={11} /> Test Sound
                        </button>
                      </div>

                      <select
                        value={alarmSound}
                        onChange={(e) => setAlarmSound(e.target.value as any)}
                        className="neo-input w-full !py-1.5 !text-xs font-semibold"
                      >
                        <option value="chime">🔔 Gentle Chime</option>
                        <option value="digital">⏱️ Digital Watch Beep</option>
                        <option value="bell">🛎️ Harmonic Bell</option>
                        <option value="urgent">🚨 Urgent Pulse</option>
                      </select>
                    </div>
                  </div>

                  {/* Calendar Export Helper Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href={generateGoogleCalendarUrl(
                        {
                          lead_id: lead.id,
                          content,
                          category,
                          priority,
                          reminder_datetime: new Date(reminderDatetime),
                          tagged_users: selectedTaggedUsers,
                        },
                        lead.name,
                        lead.phone,
                        stageName
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Calendar size={12} /> Add to Google Calendar
                    </a>

                    <span>•</span>

                    <button
                      type="button"
                      onClick={() =>
                        downloadIcsFile(
                          {
                            lead_id: lead.id,
                            content,
                            category,
                            priority,
                            reminder_datetime: new Date(reminderDatetime),
                            tagged_users: selectedTaggedUsers,
                          },
                          lead.name,
                          lead.phone,
                          stageName
                        )
                      }
                      className="text-[11px] font-bold text-secondary hover:text-primary-dark flex items-center gap-1"
                    >
                      <Download size={12} /> Download .ics File
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Action Button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className="neo-btn-primary text-xs px-5 py-2.5 font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>Save Note & Notify Members</span>
              </button>
            </div>
          </form>

          {/* Notes History Stream Filter Header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap border-b border-shadow-darker/10 pb-2">
              <h3 className="text-sm font-extrabold text-primary-dark flex items-center gap-2">
                <span>Notes & Reminder Thread</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {notes.length}
                </span>
              </h3>

              <div className="flex items-center gap-2 text-xs">
                {/* Reminders Only Toggle */}
                <button
                  type="button"
                  onClick={() => setOnlyReminders(!onlyReminders)}
                  className={`px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1 transition-colors ${
                    onlyReminders
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-surface text-secondary border-shadow-darker/10 hover:bg-slate-100'
                  }`}
                >
                  <Bell size={12} /> Reminders Only
                </button>

                {/* Category Filter */}
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="neo-input !py-1 !px-2 !text-xs font-semibold"
                >
                  <option value="all">All Categories</option>
                  <option value="general">📝 General</option>
                  <option value="call">📞 Call Log</option>
                  <option value="whatsapp">💬 WhatsApp</option>
                  <option value="meeting">🤝 Meeting</option>
                  <option value="task">⏰ Tasks</option>
                  <option value="stage_blocker">🚨 Blockers</option>
                </select>
              </div>
            </div>

            {/* Notes List */}
            {loadingNotes ? (
              <div className="py-12 text-center text-secondary text-xs">
                <Loader2 size={20} className="animate-spin mx-auto mb-2 text-primary" />
                Loading notes...
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="py-12 text-center text-xs text-secondary space-y-1.5">
                <MessageSquare size={28} className="mx-auto text-secondary/40" />
                <p className="font-bold text-primary-dark">No notes recorded yet.</p>
                <p className="text-[11px] text-secondary">
                  Add instructions, reminders, or mention team members above.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredNotes.map((n) => {
                  const relative = getRelativeTimeLabel(n.snoozed_until || n.reminder_datetime);
                  const isCompleted = n.reminder_status === 'completed';

                  return (
                    <div
                      key={n.id}
                      className={`p-4 rounded-2xl border transition-all space-y-3 ${
                        n.is_pinned
                          ? 'bg-amber-50/50 border-amber-300 shadow-xs'
                          : 'bg-surface border-shadow-darker/10 shadow-sm'
                      }`}
                    >
                      {/* Note Header: Author, Stage, Category & Pin Action */}
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-primary-dark">{n.author_name}</span>
                            {n.stage_name && (
                              <span className="text-[10px] font-semibold px-2 py-0.2 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                {n.stage_name}
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${
                                CATEGORY_CONFIG[n.category]?.bg || ''
                              }`}
                            >
                              {CATEGORY_CONFIG[n.category]?.icon} {CATEGORY_CONFIG[n.category]?.label || n.category}
                            </span>
                            {n.priority && (
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-md border ${
                                  PRIORITY_CONFIG[n.priority]?.bg || ''
                                }`}
                              >
                                {PRIORITY_CONFIG[n.priority]?.label}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-secondary">{formatDateTime(n.created_at)}</div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => togglePinLeadNote(n.id, !n.is_pinned)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              n.is_pinned
                                ? 'text-amber-600 hover:bg-amber-100'
                                : 'text-secondary hover:text-primary-dark hover:bg-slate-100'
                            }`}
                            title={n.is_pinned ? 'Unpin note' : 'Pin note'}
                          >
                            <Pin size={13} className={n.is_pinned ? 'fill-amber-600' : ''} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Delete this note?')) {
                                deleteLeadNote(n.id, lead.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-secondary hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete note"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Note Content */}
                      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
                        {n.content}
                      </p>

                      {/* Tagged Members Chips */}
                      {n.tagged_users && n.tagged_users.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1">
                          <span className="text-[10px] font-bold text-secondary uppercase">Tagged:</span>
                          {n.tagged_users.map((u) => (
                            <span
                              key={u.id}
                              className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold inline-flex items-center gap-1"
                            >
                              <User size={10} /> {u.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Interactive Checklist Items */}
                      {n.checklist && n.checklist.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-shadow-darker/5">
                          <div className="text-[10px] font-bold text-secondary uppercase">
                            Checklist (
                            {n.checklist.filter((i) => i.completed).length}/{n.checklist.length} done):
                          </div>
                          <div className="space-y-1">
                            {n.checklist.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleNoteChecklistItem(n.id, n.checklist || [], item.id)}
                                className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 text-left transition-colors group"
                              >
                                {item.completed ? (
                                  <CheckSquare size={14} className="text-emerald-600 shrink-0" />
                                ) : (
                                  <Square size={14} className="text-secondary group-hover:text-primary shrink-0" />
                                )}
                                <span
                                  className={`text-xs ${
                                    item.completed ? 'line-through text-secondary' : 'text-slate-800 font-medium'
                                  }`}
                                >
                                  {item.text}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reminder & Alarm Action Strip */}
                      {n.has_reminder && (
                        <div
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs flex-wrap ${
                            isCompleted
                              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                              : relative.isOverdue
                              ? 'bg-rose-50 border-rose-300 text-rose-900'
                              : 'bg-amber-50/70 border-amber-200 text-amber-900'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isCompleted ? (
                              <CheckCircle2 size={15} className="text-emerald-600" />
                            ) : (
                              <Bell size={15} className={relative.isOverdue ? 'text-rose-600 animate-pulse' : 'text-amber-600'} />
                            )}
                            <div>
                              <span className="font-bold block text-[11px]">
                                {isCompleted
                                  ? `Completed by ${n.completed_by || 'User'}`
                                  : `Reminder: ${formatDateTime(n.snoozed_until || n.reminder_datetime)}`}
                              </span>
                              {!isCompleted && relative.label && (
                                <span
                                  className={`text-[10px] font-bold ${
                                    relative.isOverdue ? 'text-rose-700' : 'text-amber-700'
                                  }`}
                                >
                                  ({relative.label})
                                </span>
                              )}
                            </div>
                          </div>

                          {!isCompleted && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => snoozeLeadNoteReminder(n.id, lead.id, 15)}
                                className="px-2 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-[10px] hover:bg-amber-100 transition-colors"
                              >
                                Snooze 15m
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  completeLeadNoteReminder(
                                    n.id,
                                    lead.id,
                                    dbUser?.name || user?.displayName || 'User'
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[10px] hover:bg-emerald-700 transition-colors shadow-xs flex items-center gap-1"
                              >
                                <CheckCircle2 size={11} /> Done
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

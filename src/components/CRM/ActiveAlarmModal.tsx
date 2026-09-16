import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Clock,
  CheckCircle2,
  X,
  ExternalLink,
  ChevronDown,
  User,
  Building,
  Phone,
  Calendar,
  AlertCircle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useReminderAlarm } from '../../contexts/ReminderAlarmContext';

export function ActiveAlarmModal() {
  const {
    activeTriggeredAlarm,
    triggeredAlarmsQueue,
    isAlarmAudioPlaying,
    muteAlarmSound,
    dismissAlarm,
    snoozeAlarm,
    completeAlarm,
  } = useReminderAlarm();

  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);
  const navigate = useNavigate();

  if (!activeTriggeredAlarm) return null;

  const note = activeTriggeredAlarm;
  const isUrgent = note.priority === 'urgent' || note.priority === 'high';

  const handleOpenLead = () => {
    muteAlarmSound();
    dismissAlarm();
    navigate(`/leads/${note.lead_id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className={`relative w-full max-w-lg bg-surface rounded-3xl shadow-2xl border ${
          isUrgent ? 'border-rose-500 shadow-rose-500/20' : 'border-amber-500 shadow-amber-500/20'
        } p-6 overflow-hidden animate-scale-up`}
      >
        {/* Animated Glow Header Stripe */}
        <div
          className={`absolute top-0 left-0 right-0 h-2 ${
            isUrgent
              ? 'bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600 animate-pulse'
              : 'bg-gradient-to-r from-amber-500 via-teal-500 to-emerald-500 animate-pulse'
          }`}
        />

        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 pt-1 pb-3 border-b border-shadow-darker/10">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg animate-bounce ${
                isUrgent
                  ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-rose-500/30'
                  : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-500/30'
              }`}
            >
              <Bell size={24} className="animate-spin-slow" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  ⏰ Scheduled Reminder Alert
                </span>
                {note.priority && (
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                      note.priority === 'urgent'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : note.priority === 'high'
                        ? 'bg-orange-100 text-orange-800 border-orange-300'
                        : 'bg-blue-100 text-blue-800 border-blue-300'
                    }`}
                  >
                    {note.priority} Priority
                  </span>
                )}
                {triggeredAlarmsQueue.length > 1 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-800">
                    +{triggeredAlarmsQueue.length - 1} more
                  </span>
                )}
              </div>
              <h3 className="text-lg font-extrabold text-primary-dark mt-1">
                {note.lead_name || 'Customer Follow-up'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Mute Audio Button */}
            {isAlarmAudioPlaying && (
              <button
                onClick={muteAlarmSound}
                className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 transition-colors"
                title="Silence Alarm Sound"
              >
                <VolumeX size={18} className="text-rose-600" />
              </button>
            )}

            <button
              onClick={dismissAlarm}
              className="p-2 rounded-xl text-secondary hover:text-primary-dark hover:bg-slate-100 transition-colors"
              title="Dismiss"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Customer Context Strip */}
        <div className="grid grid-cols-2 gap-2 my-3.5 p-3 rounded-2xl bg-slate-50 border border-shadow-darker/5 text-xs">
          {note.stage_name && (
            <div>
              <span className="text-secondary text-[10px] uppercase font-bold block">Pipeline Stage</span>
              <span className="font-extrabold text-primary-dark">{note.stage_name}</span>
            </div>
          )}
          {note.company && (
            <div>
              <span className="text-secondary text-[10px] uppercase font-bold block">Company</span>
              <span className="font-bold text-slate-800 truncate block">{note.company}</span>
            </div>
          )}
          {note.phone && (
            <div>
              <span className="text-secondary text-[10px] uppercase font-bold block">Phone</span>
              <span className="font-mono font-bold text-emerald-700">{note.phone}</span>
            </div>
          )}
          {note.author_name && (
            <div>
              <span className="text-secondary text-[10px] uppercase font-bold block">Created By</span>
              <span className="font-semibold text-slate-700">{note.author_name}</span>
            </div>
          )}
        </div>

        {/* Note Content Body */}
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap max-h-36 overflow-y-auto mb-4 font-sans">
          {note.content}
        </div>

        {/* Tagged Members Badges */}
        {note.tagged_users && note.tagged_users.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-4 text-xs">
            <span className="text-[10px] font-bold text-secondary uppercase">Tagged Members:</span>
            {note.tagged_users.map((u) => (
              <span
                key={u.id}
                className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold inline-flex items-center gap-1"
              >
                <User size={10} /> {u.name}
              </span>
            ))}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-shadow-darker/10 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setSnoozeMenuOpen(!snoozeMenuOpen)}
              className="neo-btn text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 text-secondary hover:text-primary-dark"
            >
              <Clock size={14} /> Snooze <ChevronDown size={14} />
            </button>

            {snoozeMenuOpen && (
              <div className="absolute left-0 bottom-full mb-1 w-44 bg-surface rounded-2xl shadow-xl border border-shadow-darker/15 p-1.5 z-20 space-y-1 animate-scale-up text-xs">
                {[
                  { label: '5 Minutes', mins: 5 },
                  { label: '15 Minutes', mins: 15 },
                  { label: '30 Minutes', mins: 30 },
                  { label: '1 Hour', mins: 60 },
                  { label: 'Tomorrow 10 AM', mins: 1440 },
                ].map((s) => (
                  <button
                    key={s.mins}
                    onClick={() => {
                      setSnoozeMenuOpen(false);
                      snoozeAlarm(s.mins);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl font-medium hover:bg-slate-100 text-slate-800 transition-colors flex items-center justify-between"
                  >
                    <span>{s.label}</span>
                    <Clock size={12} className="text-secondary" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={completeAlarm}
              className="neo-btn text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
            >
              <CheckCircle2 size={14} /> Mark Done
            </button>

            <button
              onClick={handleOpenLead}
              className="neo-btn-primary text-xs px-4 py-2 font-bold inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
            >
              <ExternalLink size={14} /> View Lead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

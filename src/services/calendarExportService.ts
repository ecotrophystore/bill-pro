import type { LeadNote } from '../types';

function formatToIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes()
  )}${pad(d.getUTCSeconds())}Z`;
}

function parseNoteDate(val: any): Date {
  if (!val) return new Date(Date.now() + 3600 * 1000);
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date(Date.now() + 3600 * 1000) : d;
}

/**
 * Generate 1-click Google Calendar web link
 */
export function generateGoogleCalendarUrl(
  note: Partial<LeadNote>,
  leadName: string,
  leadPhone?: string,
  stageName?: string
): string {
  const startDate = parseNoteDate(note.reminder_datetime || note.snoozed_until);
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 minutes duration

  const startIso = formatToIcsDate(startDate);
  const endIso = formatToIcsDate(endDate);

  const title = encodeURIComponent(
    `[EcoBill CRM] Follow-up: ${leadName}${stageName ? ` (${stageName})` : ''}`
  );

  let details = `Customer: ${leadName}\n`;
  if (leadPhone) details += `Phone: ${leadPhone}\n`;
  if (stageName) details += `Pipeline Stage: ${stageName}\n`;
  if (note.category) details += `Category: ${note.category.toUpperCase()}\n`;
  if (note.priority) details += `Priority: ${note.priority.toUpperCase()}\n`;
  if (note.content) details += `\nNote / Instructions:\n${note.content}\n`;

  if (note.tagged_users && note.tagged_users.length > 0) {
    details += `\nTagged Team Members: ${note.tagged_users.map((u) => u.name).join(', ')}\n`;
  }

  details += `\nOpen Lead: ${window.location.origin}/leads/${note.lead_id || ''}`;

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${encodeURIComponent(
    details
  )}`;
}

/**
 * Generate and download standard .ics calendar file for Apple/Outlook/Mobile
 */
export function downloadIcsFile(
  note: Partial<LeadNote>,
  leadName: string,
  leadPhone?: string,
  stageName?: string
) {
  const startDate = parseNoteDate(note.reminder_datetime || note.snoozed_until);
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

  const startIso = formatToIcsDate(startDate);
  const endIso = formatToIcsDate(endDate);
  const createdIso = formatToIcsDate(new Date());

  const summary = `Follow-up: ${leadName}${stageName ? ` (${stageName})` : ''}`;
  let desc = `Customer: ${leadName}\\nPhone: ${leadPhone || 'N/A'}\\nStage: ${stageName || 'N/A'}\\nCategory: ${
    note.category || 'General'
  }\\nPriority: ${note.priority || 'Medium'}\\n\\nNote:\\n${(note.content || '').replace(/\n/g, '\\n')}`;

  if (note.tagged_users && note.tagged_users.length > 0) {
    desc += `\\n\\nTagged Members: ${note.tagged_users.map((u) => u.name).join(', ')}`;
  }

  const uid = `${note.id || 'crm-note'}-${Date.now()}@ecobillpro.com`;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EcoBill Pro CRM//Follow-up Reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${createdIso}`,
    `DTSTART:${startIso}`,
    `DTEND:${endIso}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    `URL:${window.location.origin}/leads/${note.lead_id || ''}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${summary}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `reminder-${leadName.replace(/\s+/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

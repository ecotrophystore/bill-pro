export interface ChatLabelDef {
  id: string;
  text: string;
  colorClass: string;
}

export const LABEL_COLORS = [
  { id: 'rose', name: 'Rose Red', class: 'bg-rose-100 text-rose-700 border-rose-200' },
  { id: 'emerald', name: 'Emerald Green', class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { id: 'amber', name: 'Amber Yellow', class: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'blue', name: 'Sky Blue', class: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'purple', name: 'Deep Purple', class: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'fuchsia', name: 'Fuchsia Pink', class: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
  { id: 'orange', name: 'Sunset Orange', class: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'slate', name: 'Slate Gray', class: 'bg-transparent text-slate-700 border-slate-200' }
];

export const CHAT_LABELS: ChatLabelDef[] = [
  { id: 'urgent', text: '🔴 Urgent', colorClass: 'bg-rose-100 text-rose-700 border-rose-200' },
  { id: 'paid', text: '🟢 Paid', colorClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { id: 'pending_quote', text: '🟡 Pending Quotation', colorClass: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'vip', text: '🔵 VIP Customer', colorClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'follow_up', text: '🟣 Follow Up', colorClass: 'bg-purple-100 text-purple-700 border-purple-200' }
];


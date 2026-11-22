import React, { useEffect, useState } from 'react';
import { Calendar, CalendarRange, CheckCircle2, Columns3, Loader2, Sparkles, X } from 'lucide-react';

export interface WhatsAppImportAccountOption {
  id: string;
  label: string;
  connected?: boolean;
}

export interface WhatsAppImportSummary {
  scanned: number;
  qualified: number;
  created: number;
  updated: number;
  skipped: number;
}

interface WhatsAppDateImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountOptions?: WhatsAppImportAccountOption[];
  defaultAccountId?: string;
  importing: boolean;
  progressText?: string;
  resultSummary?: WhatsAppImportSummary | null;
  onStartImport: (opts: {
    mode: 'range' | 'all';
    startDate?: string;
    endDate?: string;
    accountId: string;
  }) => void;
  onOpenPipeline?: () => void;
}

function toLocalDateInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysAgoInput(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalDateInput(d);
}

export function WhatsAppDateImportModal({
  isOpen,
  onClose,
  accountOptions = [],
  defaultAccountId = 'all',
  importing,
  progressText,
  resultSummary,
  onStartImport,
  onOpenPipeline
}: WhatsAppDateImportModalProps) {
  const todayStr = toLocalDateInput(new Date());
  const [preset, setPreset] = useState<'today' | '7d' | '30d' | 'custom' | 'all'>('custom');
  const [startDate, setStartDate] = useState<string>(() => daysAgoInput(7));
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(defaultAccountId);

  useEffect(() => {
    if (isOpen) {
      setSelectedAccountId(defaultAccountId || 'all');
    }
  }, [isOpen, defaultAccountId]);

  if (!isOpen) return null;

  const isRangeMode = preset !== 'all';
  const hasDateError = isRangeMode && (!startDate || !endDate || startDate > endDate);

  const applyPreset = (nextPreset: 'today' | '7d' | '30d' | 'custom' | 'all') => {
    setPreset(nextPreset);
    const today = toLocalDateInput(new Date());
    if (nextPreset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (nextPreset === '7d') {
      setStartDate(daysAgoInput(7));
      setEndDate(today);
    } else if (nextPreset === '30d') {
      setStartDate(daysAgoInput(30));
      setEndDate(today);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (importing || hasDateError) return;
    onStartImport({
      mode: isRangeMode ? 'range' : 'all',
      startDate: isRangeMode ? startDate : undefined,
      endDate: isRangeMode ? endDate : undefined,
      accountId: selectedAccountId
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-surface rounded-card shadow-neo-raised border border-shadow-dark overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-shadow-dark flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary text-surface flex items-center justify-center shadow-neo-surface shrink-0">
              <CalendarRange size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-primary-dark truncate">
                Import WhatsApp Leads to Pipeline
              </h2>
              <p className="text-[11px] text-secondary truncate">
                Select a custom date range or import all existing leads automatically
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark disabled:opacity-50"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Quick Presets */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-secondary block">
              Import Period
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'custom' as const, label: 'Custom Range' },
                { id: 'today' as const, label: 'Today' },
                { id: '7d' as const, label: 'Last 7 Days' },
                { id: '30d' as const, label: 'Last 30 Days' },
                { id: 'all' as const, label: 'All Existing Chats' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={importing}
                  onClick={() => applyPreset(opt.id)}
                  className={`px-3 py-1.5 rounded-btn text-xs font-bold transition-all ${
                    preset === opt.id
                      ? 'bg-primary text-surface shadow-neo-surface'
                      : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Start & End Date */}
          {isRangeMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-primary-dark flex items-center gap-1.5">
                  <Calendar size={12} className="text-primary" /> Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  max={todayStr}
                  disabled={importing}
                  onChange={(e) => {
                    setPreset('custom');
                    setStartDate(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-input bg-surface shadow-neo-inset text-xs font-semibold text-primary-dark outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-primary-dark flex items-center gap-1.5">
                  <Calendar size={12} className="text-primary" /> End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  max={todayStr}
                  disabled={importing}
                  onChange={(e) => {
                    setPreset('custom');
                    setEndDate(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-input bg-surface shadow-neo-inset text-xs font-semibold text-primary-dark outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-card bg-surface shadow-neo-inset text-xs text-secondary leading-relaxed">
              Scans all synced WhatsApp conversations across your account, qualifies genuine business enquiries, deduplicates against existing CRM leads, and adds them into the right pipeline &amp; stage.
            </div>
          )}

          {hasDateError && (
            <p className="text-xs font-semibold text-error">
              Start date must be on or before the end date.
            </p>
          )}

          {/* Account / Tab Selector */}
          {accountOptions.length > 1 && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-secondary block">
                WhatsApp Account
              </label>
              <select
                value={selectedAccountId}
                disabled={importing}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-input bg-surface shadow-neo-inset text-xs font-semibold text-primary-dark outline-none"
              >
                <option value="all">All Connected WhatsApp Accounts</option>
                {accountOptions.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label} {acc.connected === false ? '(Not Connected)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Progress */}
          {importing && (
            <div className="p-3.5 rounded-card bg-surface shadow-neo-inset flex items-center gap-3 text-xs">
              <Loader2 size={18} className="text-primary animate-spin shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-primary-dark">Scanning &amp; Importing Leads...</p>
                <p className="text-[11px] text-secondary truncate">
                  {progressText || 'Checking WhatsApp chats and classifying enquiries into pipeline stages...'}
                </p>
              </div>
            </div>
          )}

          {/* Result Summary */}
          {!importing && resultSummary && (
            <div className="p-3.5 rounded-card bg-surface shadow-neo-inset space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-primary flex items-center gap-1.5">
                  <CheckCircle2 size={15} /> Import Complete
                </span>
                <span className="text-[11px] font-semibold text-secondary">
                  {resultSummary.scanned} chat(s) scanned
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-card bg-surface shadow-neo-surface">
                  <span className="text-[10px] text-secondary block font-semibold">Added</span>
                  <strong className="text-sm font-extrabold text-primary">{resultSummary.created}</strong>
                </div>
                <div className="p-2 rounded-card bg-surface shadow-neo-surface">
                  <span className="text-[10px] text-secondary block font-semibold">Updated</span>
                  <strong className="text-sm font-extrabold text-primary-dark">{resultSummary.updated}</strong>
                </div>
                <div className="p-2 rounded-card bg-surface shadow-neo-surface">
                  <span className="text-[10px] text-secondary block font-semibold">Skipped</span>
                  <strong className="text-sm font-extrabold text-secondary">{resultSummary.skipped}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            {!importing && resultSummary && onOpenPipeline && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPipeline();
                }}
                className="neo-btn px-3.5 py-2 text-xs font-bold text-primary flex items-center gap-1.5"
              >
                <Columns3 size={14} /> Open Pipeline
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="neo-btn px-3.5 py-2 text-xs font-bold text-secondary hover:text-primary-dark disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={importing || hasDateError}
              className="neo-btn-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>{importing ? 'Importing...' : 'Import Leads to Pipeline'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


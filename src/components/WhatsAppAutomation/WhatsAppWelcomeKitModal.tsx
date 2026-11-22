import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import {
  loadAppCustomizedTemplates,
  saveWelcomeKitConfig,
  type AppCustomizedTemplateOption,
  type WelcomeKitAttachmentType,
  type WelcomeKitConfig,
  type WelcomeKitItem
} from '../../services/whatsappWelcomeKitService';

interface WhatsAppWelcomeKitModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: WelcomeKitConfig;
  activeChatLabel?: string;
  sendingNow?: boolean;
  runningNoReplyCheck?: boolean;
  onSaved?: (next: WelcomeKitConfig) => void;
  onSendNowToActiveChat?: (draftConfig: WelcomeKitConfig) => Promise<void>;
  onRunNoReplySweepNow?: (draftConfig: WelcomeKitConfig) => Promise<void>;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function itemBadgeLabel(item: WelcomeKitItem): string {
  switch (item.kind) {
    case 'nff':
      return 'NFF';
    case 'brochure':
      return 'Brochure';
    case 'testimonial_video':
      return 'Testimonial Video';
    case 'app_template':
      return 'App Template';
    case 'custom_media':
      return 'Media File';
    default:
      return 'Custom Message';
  }
}

export function WhatsAppWelcomeKitModal({
  isOpen,
  onClose,
  config,
  activeChatLabel,
  sendingNow = false,
  runningNoReplyCheck = false,
  onSaved,
  onSendNowToActiveChat,
  onRunNoReplySweepNow
}: WhatsAppWelcomeKitModalProps) {
  const [draft, setDraft] = useState<WelcomeKitConfig>(config);
  const [saving, setSaving] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [appTemplates, setAppTemplates] = useState<AppCustomizedTemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [urlEditorItemId, setUrlEditorItemId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(config);
      setUrlEditorItemId(null);
      setShowTemplatePicker(false);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const isElectron = Boolean(window.electronAPI?.isElectron && window.electronAPI?.pickMediaFile);

  const updateItem = (itemId: string, patch: Partial<WelcomeKitItem>) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it))
    }));
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    setDraft((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.items.length) return prev;
      const next = [...prev.items];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return { ...prev, items: next };
    });
  };

  const removeItem = (itemId: string) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.id !== itemId)
    }));
  };

  const handleAddCustomItem = () => {
    const newItem: WelcomeKitItem = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind: 'custom_text',
      title: 'Custom Follow-up Content',
      enabled: true,
      messageText: '',
      attachmentType: 'none'
    };
    setDraft((prev) => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const handleOpenTemplatePicker = async () => {
    const nextOpen = !showTemplatePicker;
    setShowTemplatePicker(nextOpen);
    if (nextOpen && appTemplates.length === 0) {
      setLoadingTemplates(true);
      try {
        const loaded = await loadAppCustomizedTemplates();
        setAppTemplates(loaded);
      } finally {
        setLoadingTemplates(false);
      }
    }
  };

  const handleImportAppTemplate = (tpl: AppCustomizedTemplateOption) => {
    const imported: WelcomeKitItem = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      kind: 'app_template',
      title: tpl.title,
      enabled: true,
      messageText: tpl.body,
      attachmentType: 'none',
      sourceTemplateId: tpl.id,
      sourceCollection: tpl.sourceCollection
    };
    setDraft((prev) => ({ ...prev, items: [...prev.items, imported] }));
    setShowTemplatePicker(false);
    toast.success(`Added "${tpl.title}" to Welcome Kit`);
  };

  const handlePickAttachment = async (item: WelcomeKitItem) => {
    if (isElectron && window.electronAPI?.pickMediaFile) {
      const filterKind = item.kind === 'testimonial_video' ? 'video' : 'all';
      const picked = await window.electronAPI.pickMediaFile(filterKind);
      if (picked.canceled || !picked.filePath) return;

      updateItem(item.id, {
        localFilePath: picked.filePath,
        fileName: picked.fileName || 'attachment',
        mimeType: picked.mimeType || 'application/octet-stream',
        attachmentType: picked.attachmentType || 'document',
        fileSizeBytes: picked.size,
        fileUrl: undefined
      });
      toast.success(`Attached ${picked.fileName}`);
      return;
    }

    // Standard browser fallback: upload to Firebase Storage
    const input = document.createElement('input');
    input.type = 'file';
    input.accept =
      item.kind === 'testimonial_video'
        ? 'video/*,.mp4,.mov'
        : '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,video/*,image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!storage) {
        toast.error('Cloud Storage unavailable. Paste a public HTTPS file URL instead.');
        return;
      }
      setUploadingItemId(item.id);
      try {
        const sRef = storageRef(storage, `shared_documents/whatsapp_welcome_kit/${Date.now()}_${file.name.replace(/\s+/g, '_')}`);
        const snap = await uploadBytes(sRef, file);
        const url = await getDownloadURL(snap.ref);
        let attachmentType: WelcomeKitAttachmentType = 'document';
        if (file.type.startsWith('image/')) attachmentType = 'image';
        else if (file.type.startsWith('video/')) attachmentType = 'video';

        updateItem(item.id, {
          fileUrl: url,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          attachmentType,
          fileSizeBytes: file.size,
          localFilePath: undefined
        });
        toast.success(`Uploaded ${file.name}`);
      } catch (err: any) {
        toast.error(err?.message || 'File upload failed');
      } finally {
        setUploadingItemId(null);
      }
    };
    input.click();
  };

  const clearAttachment = (itemId: string) => {
    updateItem(itemId, {
      attachmentType: 'none',
      fileName: undefined,
      mimeType: undefined,
      fileUrl: undefined,
      localFilePath: undefined,
      fileSizeBytes: undefined
    });
  };

  const updateNoReply = (patch: Partial<WelcomeKitConfig['noReplyFollowUp']>) => {
    setDraft((prev) => ({
      ...prev,
      noReplyFollowUp: {
        ...prev.noReplyFollowUp,
        ...patch
      }
    }));
  };

  const handlePickNoReplyVideo = async () => {
    if (isElectron && window.electronAPI?.pickMediaFile) {
      const picked = await window.electronAPI.pickMediaFile('video');
      if (picked.canceled || !picked.filePath) return;
      updateNoReply({
        useTestimonialKitItem: false,
        localFilePath: picked.filePath,
        fileName: picked.fileName || 'testimonial-video.mp4',
        mimeType: picked.mimeType || 'video/mp4',
        attachmentType: picked.attachmentType || 'video',
        fileSizeBytes: picked.size,
        fileUrl: undefined
      });
      toast.success(`Attached ${picked.fileName} for no-reply follow-up`);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,.mp4,.mov';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!storage) {
        toast.error('Cloud Storage unavailable. Paste a direct HTTPS video URL or reuse the Welcome Kit video.');
        return;
      }
      setUploadingItemId('no_reply_video');
      try {
        const sRef = storageRef(storage, `shared_documents/whatsapp_welcome_kit/followup_${Date.now()}_${file.name.replace(/\s+/g, '_')}`);
        const snap = await uploadBytes(sRef, file);
        const url = await getDownloadURL(snap.ref);
        updateNoReply({
          useTestimonialKitItem: false,
          fileUrl: url,
          fileName: file.name,
          mimeType: file.type || 'video/mp4',
          attachmentType: 'video',
          fileSizeBytes: file.size,
          localFilePath: undefined
        });
        toast.success(`Uploaded ${file.name}`);
      } catch (err: any) {
        toast.error(err?.message || 'Video upload failed');
      } finally {
        setUploadingItemId(null);
      }
    };
    input.click();
  };

  const kitTestimonialItem = draft.items.find((it) => it.kind === 'testimonial_video');

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveWelcomeKitConfig(draft);
      onSaved?.(saved);
      toast.success(
        saved.enabled
          ? 'Welcome Kit saved! New leads will receive your pack automatically.'
          : 'Welcome Kit saved (Auto-Send is currently OFF).'
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save Welcome Kit configuration');
    } finally {
      setSaving(false);
    }
  };

  const enabledItemCount = draft.items.filter(
    (it) => it.enabled && (it.messageText.trim() || it.localFilePath || it.fileUrl)
  ).length;

  return (
    <div className="fixed inset-0 z-[100] bg-primary-dark/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="w-full max-w-3xl max-h-[90vh] bg-surface rounded-card shadow-neo-raised flex flex-col overflow-hidden border border-shadow-dark">
        {/* Header */}
        <div className="px-5 py-4 border-b border-shadow-dark flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-btn bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-primary-dark truncate">
                New Lead Auto-Send Pack (Welcome Kit)
              </h2>
              <p className="text-[11px] text-secondary truncate">
                Automatically sends your NFF, Brochure, Testimonial Video &amp; customized templates to every new lead.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark shrink-0"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Global Controls */}
        <div className="px-5 py-3 bg-surface border-b border-shadow-dark flex flex-wrap items-center justify-between gap-3 shrink-0">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="w-4 h-4 accent-primary rounded"
            />
            <span className="text-xs font-extrabold text-primary-dark">
              Auto-Send to Every New Lead in WhatsApp Browser
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                draft.enabled ? 'bg-primary text-surface' : 'bg-surface shadow-neo-inset text-secondary'
              }`}
            >
              {draft.enabled ? 'ACTIVE' : 'OFF'}
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-secondary hover:text-primary-dark">
            <input
              type="checkbox"
              checked={draft.includeStageNewEnquiry}
              onChange={(e) => setDraft((prev) => ({ ...prev, includeStageNewEnquiry: e.target.checked }))}
              className="w-3.5 h-3.5 accent-primary rounded"
            />
            Also send Stage Automation &ldquo;New Enquiry&rdquo; greeting first
          </label>
        </div>

        {/* Items Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-sidebar-scrollbar">
          {/* Quick Action Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-secondary">
              Variables supported:{' '}
              <code className="px-1.5 py-0.5 rounded bg-surface shadow-neo-inset text-primary-dark">
                {'{{customer_name}}'}
              </code>{' '}
              <code className="px-1.5 py-0.5 rounded bg-surface shadow-neo-inset text-primary-dark">
                {'{{quantity}}'}
              </code>{' '}
              <code className="px-1.5 py-0.5 rounded bg-surface shadow-neo-inset text-primary-dark">
                {'{{event_name}}'}
              </code>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenTemplatePicker}
                className="neo-btn !px-3 !py-1.5 text-[11px] font-bold text-primary flex items-center gap-1.5"
              >
                <MessageSquare size={12} /> Import Customized App Content
              </button>
              <button
                type="button"
                onClick={handleAddCustomItem}
                className="neo-btn !px-3 !py-1.5 text-[11px] font-bold text-primary-dark flex items-center gap-1"
              >
                <Plus size={12} /> Add Step
              </button>
            </div>
          </div>

          {/* App Template Picker Panel */}
          {showTemplatePicker && (
            <div className="p-3.5 rounded-card bg-surface shadow-neo-inset space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-primary-dark">
                  Pick Customized Message Templates or Stage Messages from EcoBill
                </span>
                <button
                  type="button"
                  onClick={() => setShowTemplatePicker(false)}
                  className="text-[11px] text-secondary hover:text-primary-dark font-semibold"
                >
                  Close
                </button>
              </div>
              {loadingTemplates ? (
                <div className="py-4 flex items-center justify-center gap-2 text-xs text-secondary">
                  <Loader2 size={14} className="animate-spin text-primary" /> Loading templates...
                </div>
              ) : appTemplates.length === 0 ? (
                <p className="text-[11px] text-secondary py-2">
                  No saved WhatsApp templates found yet. Add templates in Message Templates or Stage Automation, or click
                  &ldquo;+ Add Step&rdquo; above.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {appTemplates.map((tpl) => (
                    <button
                      key={`${tpl.sourceCollection}:${tpl.id}`}
                      type="button"
                      onClick={() => handleImportAppTemplate(tpl)}
                      className="text-left p-2.5 rounded-card bg-surface shadow-neo-surface hover:shadow-neo-hover transition-all space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-primary-dark truncate">{tpl.title}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold shrink-0">
                          {tpl.categoryLabel}
                        </span>
                      </div>
                      <p className="text-[10px] text-secondary line-clamp-2">{tpl.body}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ordered Welcome Kit Steps */}
          <div className="space-y-3">
            {draft.items.map((item, idx) => {
              const hasAttachment = Boolean(item.localFilePath || item.fileUrl);
              const isUploading = uploadingItemId === item.id;
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-card bg-surface transition-all space-y-3 border ${
                    item.enabled
                      ? 'shadow-neo-surface border-primary/20'
                      : 'shadow-neo-inset opacity-75 border-shadow-dark'
                  }`}
                >
                  {/* Row Header */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(e) => updateItem(item.id, { enabled: e.target.checked })}
                        className="w-4 h-4 accent-primary shrink-0"
                        title="Enable or disable this step"
                      />
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-extrabold shrink-0">
                        #{idx + 1} &bull; {itemBadgeLabel(item)}
                      </span>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateItem(item.id, { title: e.target.value })}
                        placeholder="Step title (e.g. NFF, Brochure, Testimonial Video)"
                        className="bg-transparent text-xs font-extrabold text-primary-dark outline-none border-b border-transparent focus:border-primary/40 flex-1 min-w-[140px]"
                      />
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark disabled:opacity-35"
                        title="Move up"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === draft.items.length - 1}
                        className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-primary-dark disabled:opacity-35"
                        title="Move down"
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="p-1.5 rounded-full bg-surface shadow-neo-surface text-secondary hover:text-error"
                        title="Remove step"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Message / Caption */}
                  <textarea
                    rows={2}
                    value={item.messageText}
                    onChange={(e) => updateItem(item.id, { messageText: e.target.value })}
                    placeholder={
                      hasAttachment
                        ? 'Optional caption to send along with this file...'
                        : 'Type WhatsApp message or paste link (e.g. NFF Google Form link)...'
                    }
                    className="neo-input w-full text-xs resize-y"
                  />

                  {/* Attachment Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      {hasAttachment ? (
                        <div className="px-2.5 py-1.5 rounded-btn bg-surface shadow-neo-inset flex items-center gap-2 text-[11px] max-w-full">
                          {item.attachmentType === 'video' ? (
                            <Film size={13} className="text-primary shrink-0" />
                          ) : item.attachmentType === 'image' ? (
                            <ImageIcon size={13} className="text-primary shrink-0" />
                          ) : (
                            <FileText size={13} className="text-primary shrink-0" />
                          )}
                          <span className="font-bold text-primary-dark truncate max-w-[240px]">
                            {item.fileName || item.fileUrl || item.localFilePath}
                          </span>
                          {item.fileSizeBytes ? (
                            <span className="text-[10px] text-secondary shrink-0">
                              ({formatFileSize(item.fileSizeBytes)})
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => clearAttachment(item.id)}
                            className="text-secondary hover:text-error shrink-0"
                            title="Remove attachment"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-secondary flex items-center gap-1">
                          <Paperclip size={11} /> No file attached (text/link only)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePickAttachment(item)}
                        disabled={isUploading}
                        className="neo-btn !px-2.5 !py-1.5 text-[11px] font-bold text-primary flex items-center gap-1"
                      >
                        {isUploading ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Upload size={12} />
                        )}
                        {hasAttachment ? 'Replace File' : 'Attach File (PDF / Video / Image)'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setUrlEditorItemId((cur) => (cur === item.id ? null : item.id))
                        }
                        className="neo-btn !px-2.5 !py-1.5 text-[11px] font-bold text-secondary hover:text-primary-dark flex items-center gap-1"
                        title="Attach via direct HTTPS file URL"
                      >
                        <Link2 size={12} /> URL
                      </button>
                    </div>
                  </div>

                  {/* Direct HTTPS Media URL Input */}
                  {urlEditorItemId === item.id && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="url"
                        value={item.fileUrl || ''}
                        onChange={(e) => {
                          const url = e.target.value.trim();
                          const lower = url.toLowerCase();
                          const attachmentType: WelcomeKitAttachmentType = /\.(mp4|mov|webm|avi|mkv)(\?|$)/.test(lower)
                            ? 'video'
                            : /\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(lower)
                              ? 'image'
                              : url
                                ? 'document'
                                : 'none';
                          updateItem(item.id, {
                            fileUrl: url || undefined,
                            localFilePath: url ? undefined : item.localFilePath,
                            attachmentType,
                            fileName: url ? url.split('/').pop()?.split('?')[0] || 'media-file' : undefined
                          });
                        }}
                        placeholder="https://... direct link to PDF, image, or MP4 video"
                        className="neo-input flex-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setUrlEditorItemId(null)}
                        className="neo-btn !px-2.5 !py-1.5 text-[11px] font-bold text-primary"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 1-2 Day No-Reply Testimonial Video Auto Follow-Up */}
          <div
            className={`p-4 rounded-card bg-surface border space-y-3 ${
              draft.noReplyFollowUp.enabled
                ? 'shadow-neo-surface border-primary/25'
                : 'shadow-neo-inset border-shadow-dark opacity-90'
            }`}
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.noReplyFollowUp.enabled}
                  onChange={(e) => updateNoReply({ enabled: e.target.checked })}
                  className="w-4 h-4 accent-primary rounded"
                />
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-primary shrink-0" />
                  <span className="text-xs font-extrabold text-primary-dark">
                    Auto-Send Testimonial Video if Customer Doesn&rsquo;t Reply
                  </span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                    draft.noReplyFollowUp.enabled
                      ? 'bg-primary text-surface'
                      : 'bg-surface shadow-neo-inset text-secondary'
                  }`}
                >
                  {draft.noReplyFollowUp.enabled ? `AFTER ${draft.noReplyFollowUp.afterDays}D` : 'OFF'}
                </span>
              </label>

              <div className="flex items-center gap-1">
                {[1, 2, 3].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => updateNoReply({ afterDays: days })}
                    className={`px-2.5 py-1 rounded-btn text-[11px] font-bold transition-all ${
                      draft.noReplyFollowUp.afterDays === days
                        ? 'bg-primary text-surface shadow-neo-surface'
                        : 'bg-surface shadow-neo-surface text-secondary hover:text-primary-dark'
                    }`}
                  >
                    {days} {days === 1 ? 'Day' : 'Days'}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-secondary leading-relaxed">
              Automatically checks every 5 minutes while WhatsApp Browser is connected. If a WhatsApp lead stays silent
              for{' '}
              <strong>
                {draft.noReplyFollowUp.afterDays} {draft.noReplyFollowUp.afterDays === 1 ? 'day (24h)' : 'days'}
              </strong>{' '}
              (up to 14 days old), your Testimonial Video &amp; message below are sent automatically once.
            </p>

            <textarea
              rows={2}
              value={draft.noReplyFollowUp.messageText}
              onChange={(e) => updateNoReply({ messageText: e.target.value })}
              placeholder="Follow-up message / video caption (supports {{customer_name}}, {{quantity}})..."
              className="neo-input w-full text-xs resize-y"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-primary-dark cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.noReplyFollowUp.useTestimonialKitItem}
                  onChange={(e) => updateNoReply({ useTestimonialKitItem: e.target.checked })}
                  className="w-3.5 h-3.5 accent-primary rounded"
                />
                Use Testimonial Video from Step #3 above
                {kitTestimonialItem?.fileName ? (
                  <span className="text-primary font-bold">({kitTestimonialItem.fileName})</span>
                ) : null}
              </label>

              <label className="flex items-center gap-2 text-[11px] font-semibold text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.noReplyFollowUp.onlyEarlyStages}
                  onChange={(e) => updateNoReply({ onlyEarlyStages: e.target.checked })}
                  className="w-3.5 h-3.5 accent-primary rounded"
                />
                Skip Production / Completed / Lost leads
              </label>
            </div>

            {!draft.noReplyFollowUp.useTestimonialKitItem && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {draft.noReplyFollowUp.localFilePath || draft.noReplyFollowUp.fileUrl ? (
                  <div className="px-2.5 py-1.5 rounded-btn bg-surface shadow-neo-inset flex items-center gap-2 text-[11px]">
                    <Film size={13} className="text-primary shrink-0" />
                    <span className="font-bold text-primary-dark truncate max-w-[240px]">
                      {draft.noReplyFollowUp.fileName || draft.noReplyFollowUp.fileUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateNoReply({
                          localFilePath: undefined,
                          fileUrl: undefined,
                          fileName: undefined,
                          mimeType: undefined,
                          fileSizeBytes: undefined
                        })
                      }
                      className="text-secondary hover:text-error"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-secondary">No separate follow-up video selected yet</span>
                )}

                <button
                  type="button"
                  onClick={handlePickNoReplyVideo}
                  disabled={uploadingItemId === 'no_reply_video'}
                  className="neo-btn !px-2.5 !py-1.5 text-[11px] font-bold text-primary flex items-center gap-1"
                >
                  {uploadingItemId === 'no_reply_video' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Upload size={12} />
                  )}
                  Select Testimonial Video
                </button>
              </div>
            )}

            {onRunNoReplySweepNow && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={runningNoReplyCheck}
                  onClick={() => onRunNoReplySweepNow({ ...draft, noReplyFollowUp: { ...draft.noReplyFollowUp, enabled: true } })}
                  className="neo-btn !px-3 !py-1.5 text-[11px] font-bold text-primary flex items-center gap-1.5 disabled:opacity-50"
                >
                  {runningNoReplyCheck ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                  Check &amp; Send Due Follow-Ups Now
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-shadow-dark flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-secondary">
            <CheckCircle2 size={14} className="text-primary shrink-0" />
            <span>
              <strong>{enabledItemCount}</strong> active item(s) ready &bull; Note: bulk QR/date-range historical
              imports never auto-blast past contacts.
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {onSendNowToActiveChat && activeChatLabel && (
              <button
                type="button"
                disabled={sendingNow || enabledItemCount === 0}
                onClick={() => onSendNowToActiveChat(draft)}
                className="neo-btn !px-3.5 !py-2 text-xs font-bold text-primary flex items-center gap-1.5 disabled:opacity-50"
                title={`Test & send Welcome Kit now to "${activeChatLabel}"`}
              >
                {sendingNow ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Send Now to &ldquo;{activeChatLabel}&rdquo;
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="neo-btn-primary !px-4 !py-2 text-xs font-bold flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Welcome Kit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


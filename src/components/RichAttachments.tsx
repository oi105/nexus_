import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Youtube,
} from 'lucide-react';
import type { RichAttachment } from '../types/nexus';
import {
  formatFileSize,
  formatTimestampRange,
  isSafeExternalUrl,
  MAX_ATTACHMENTS_PER_POST,
  parseTimestampInput,
  parseYouTubeUrl,
  validateAttachmentFile,
} from '../utils/nexusLogic';
import {
  fetchLinkPreview,
  uploadAttachmentToCloudinary,
} from '../services/nexusService';

interface PendingUpload {
  localId: string;
  file: File;
  kind: 'image' | 'document';
  previewUrl?: string;
  progress: number;
  stage: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface AttachmentComposerProps {
  attachments: RichAttachment[];
  onChange: (next: RichAttachment[]) => void;
  uid: string;
  cloudinaryConfigured: boolean;
  compact?: boolean;
  disabled?: boolean;
  onOpenCamera?: () => void;
}

export function AttachmentComposer({
  attachments,
  onChange,
  uid,
  cloudinaryConfigured,
  compact = false,
  disabled = false,
  onOpenCamera,
}: AttachmentComposerProps) {
  const [pendingUploads, setPendingUploads] = React.useState<PendingUpload[]>([]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeInput, setActiveInput] = React.useState<'youtube' | 'link' | null>(null);
  const [urlValue, setUrlValue] = React.useState('');
  const [ytStartRaw, setYtStartRaw] = React.useState('');
  const [ytEndRaw, setYtEndRaw] = React.useState('');
  const [ytNote, setYtNote] = React.useState('');
  const [urlLoading, setUrlLoading] = React.useState(false);
  const [composerError, setComposerError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const docInputRef = React.useRef<HTMLInputElement | null>(null);
  const attachmentsRef = React.useRef<RichAttachment[]>(attachments);
  attachmentsRef.current = attachments;

  const totalCount = attachments.length + pendingUploads.length;
  const remainingSlots = Math.max(0, MAX_ATTACHMENTS_PER_POST - totalCount);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const startUpload = async (file: File, kind: 'image' | 'document') => {
    const localId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined;

    setPendingUploads((prev) => [
      ...prev,
      {
        localId,
        file,
        kind,
        previewUrl,
        progress: 8,
        stage: 'Initializing stream',
        status: 'uploading',
      },
    ]);

    try {
      const uploaded = await uploadAttachmentToCloudinary(file, uid || 'anonymous', kind, {
        cloudinaryConfigured,
        onProgress: (pct, stage) => {
          setPendingUploads((prev) =>
            prev.map((item) =>
              item.localId === localId ? { ...item, progress: pct, stage } : item,
            ),
          );
        },
      });

      setPendingUploads((prev) =>
        prev.map((item) =>
          item.localId === localId
            ? { ...item, progress: 100, stage: 'Uploaded', status: 'done' }
            : item,
        ),
      );

      const nextList = [...attachmentsRef.current, uploaded].slice(0, MAX_ATTACHMENTS_PER_POST);
      attachmentsRef.current = nextList;
      onChange(nextList);

      window.setTimeout(() => {
        setPendingUploads((prev) => prev.filter((item) => item.localId !== localId));
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }, 650);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'File upload failed.';
      setPendingUploads((prev) =>
        prev.map((item) =>
          item.localId === localId ? { ...item, status: 'error', error: message } : item,
        ),
      );
    }
  };

  const processFileList = async (files: File[], preferredKind?: 'image' | 'document') => {
    setComposerError(null);
    if (files.length === 0) return;

    if (remainingSlots <= 0) {
      setComposerError(`Maximum ${MAX_ATTACHMENTS_PER_POST} attachments allowed.`);
      return;
    }

    for (const file of files.slice(0, remainingSlots)) {
      const inferredKind: 'image' | 'document' =
        preferredKind ??
        (file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name)
          ? 'image'
          : 'document');
      const check = validateAttachmentFile(file, inferredKind);
      if (!check.valid) {
        setComposerError(check.error);
        continue;
      }
      await startUpload(file, inferredKind);
    }
  };

  const handleFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'image' | 'document',
  ) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    await processFileList(files, kind);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || remainingSlots <= 0) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    await processFileList(files);
  };

  const handleRetryUpload = async (item: PendingUpload) => {
    setPendingUploads((prev) =>
      prev.map((p) =>
        p.localId === item.localId
          ? { ...p, status: 'uploading', progress: 10, stage: 'Retrying upload', error: undefined }
          : p,
      ),
    );
    try {
      const uploaded = await uploadAttachmentToCloudinary(
        item.file,
        uid || 'anonymous',
        item.kind,
        {
          cloudinaryConfigured,
          onProgress: (pct, stage) => {
            setPendingUploads((prev) =>
              prev.map((p) =>
                p.localId === item.localId ? { ...p, progress: pct, stage } : p,
              ),
            );
          },
        },
      );
      setPendingUploads((prev) =>
        prev.map((p) =>
          p.localId === item.localId
            ? { ...p, progress: 100, stage: 'Uploaded', status: 'done' }
            : p,
        ),
      );
      const nextList = [...attachmentsRef.current, uploaded].slice(0, MAX_ATTACHMENTS_PER_POST);
      attachmentsRef.current = nextList;
      onChange(nextList);

      window.setTimeout(() => {
        setPendingUploads((prev) => prev.filter((p) => p.localId !== item.localId));
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }, 650);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload retry failed.';
      setPendingUploads((prev) =>
        prev.map((p) =>
          p.localId === item.localId ? { ...p, status: 'error', error: message } : p,
        ),
      );
    }
  };

  const handleDismissPending = (item: PendingUpload) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setPendingUploads((prev) => prev.filter((p) => p.localId !== item.localId));
  };

  const previewStart = ytStartRaw.trim() ? parseTimestampInput(ytStartRaw) : null;
  const previewEnd = ytEndRaw.trim() ? parseTimestampInput(ytEndRaw) : null;
  const previewRangeLabel =
    previewStart !== null || previewEnd !== null
      ? formatTimestampRange(previewStart ?? 0, previewEnd ?? undefined)
      : null;

  const handleAttachUrl = async () => {
    setComposerError(null);
    if (remainingSlots <= 0) {
      setComposerError(`Maximum ${MAX_ATTACHMENTS_PER_POST} attachments allowed.`);
      return;
    }

    const trimmed = urlValue.trim();
    if (!trimmed) return;

    if (activeInput === 'youtube') {
      const yt = parseYouTubeUrl(trimmed);
      if (!yt) {
        setComposerError(
          'Enter a valid YouTube link (youtube.com/watch?v=..., youtu.be/..., or youtube.com/shorts/...).',
        );
        return;
      }

      let startSeconds: number | undefined;
      let endSeconds: number | undefined;

      if (ytStartRaw.trim()) {
        const parsed = parseTimestampInput(ytStartRaw);
        if (parsed === null) {
          setComposerError('Start timestamp must be MM:SS, HH:MM:SS, or seconds (e.g. 04:32).');
          return;
        }
        startSeconds = parsed;
      }

      if (ytEndRaw.trim()) {
        const parsed = parseTimestampInput(ytEndRaw);
        if (parsed === null) {
          setComposerError('End timestamp must be MM:SS, HH:MM:SS, or seconds (e.g. 06:15).');
          return;
        }
        const effectiveStart = startSeconds ?? 0;
        if (parsed <= effectiveStart) {
          setComposerError('End timestamp must be after the start timestamp.');
          return;
        }
        startSeconds = effectiveStart;
        endSeconds = parsed;
      }

      setUrlLoading(true);
      try {
        let title = 'YouTube Study Video';
        let description = ytNote.trim() || 'YouTube video reference';
        try {
          const preview = await fetchLinkPreview(yt.canonicalUrl);
          if (preview.title) title = preview.title;
          if (!ytNote.trim() && preview.description) description = preview.description;
        } catch {
          // Graceful fallback without failing attachment
        }

        const item: RichAttachment = {
          id: `att_yt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          type: 'youtube',
          fileName: title,
          secureUrl: yt.canonicalUrl,
          mimeType: 'text/uri-list',
          fileSize: 0,
          uploadedBy: uid || 'anonymous',
          createdAtMs: Date.now(),
          youtubeId: yt.videoId,
          startSeconds,
          endSeconds,
          linkTitle: title,
          linkDomain: 'youtube.com',
          linkDescription: description,
          thumbnailUrl: yt.thumbnailUrl,
        };
        onChange([...attachments, item]);
        setUrlValue('');
        setYtStartRaw('');
        setYtEndRaw('');
        setYtNote('');
        setActiveInput(null);
      } finally {
        setUrlLoading(false);
      }
      return;
    }

    const safeUrl = isSafeExternalUrl(trimmed);
    if (!safeUrl) {
      setComposerError('Only valid http:// or https:// URLs are allowed.');
      return;
    }

    setUrlLoading(true);
    try {
      const preview = await fetchLinkPreview(safeUrl);
      const item: RichAttachment = {
        id: `att_link_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        type: 'link',
        fileName: preview.domain,
        secureUrl: preview.url,
        mimeType: 'text/uri-list',
        fileSize: 0,
        uploadedBy: uid || 'anonymous',
        createdAtMs: Date.now(),
        linkTitle: preview.title || preview.domain,
        linkDomain: preview.domain,
        linkDescription: preview.description || undefined,
        thumbnailUrl: preview.thumbnailUrl || undefined,
      };
      onChange([...attachments, item]);
      setUrlValue('');
      setActiveInput(null);
    } catch (err) {
      setComposerError(
        err instanceof Error ? err.message : 'Unable to attach external URL.',
      );
    } finally {
      setUrlLoading(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && remainingSlots > 0) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => void handleDrop(e)}
      className={`space-y-2 rounded-[10px] transition-colors ${
        isDragging
          ? 'p-2 border-2 border-dashed border-[#365BEE] bg-[#365BEE]/5'
          : ''
      }`}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => void handleFiles(e, 'image')}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
        multiple
        className="sr-only"
        onChange={(e) => void handleFiles(e, 'document')}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex flex-wrap items-center gap-1.5" ref={menuRef}>
          <button
            type="button"
            disabled={disabled || remainingSlots <= 0}
            aria-expanded={menuOpen}
            onClick={() => {
              setComposerError(null);
              setMenuOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#F5F5F0] dark:bg-[#222838] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[8px] text-[#172033] dark:text-[#F3F5FB] hover:border-[#365BEE] disabled:opacity-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#365BEE] dark:text-[#7AA2FF]" />
            <span>Add media</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          {onOpenCamera && (
            <button
              type="button"
              disabled={disabled || remainingSlots <= 0}
              onClick={onOpenCamera}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#F5F5F0] dark:bg-[#222838] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[8px] text-[#172033] dark:text-[#F3F5FB] hover:border-[#365BEE] disabled:opacity-50 transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-[#365BEE] dark:text-[#7AA2FF]" />
              <span>Camera</span>
            </button>
          )}

          {menuOpen && (
            <div
              role="menu"
              aria-label="Media attachment options"
              className="absolute left-0 bottom-full mb-1.5 z-50 w-52 bg-white dark:bg-[#1A1F2C] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[10px] shadow-xl py-1 text-xs"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  imageInputRef.current?.click();
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-[#172033] dark:text-[#F3F5FB] hover:bg-[#F5F5F0] dark:hover:bg-[#222838]"
              >
                <ImageIcon className="w-3.5 h-3.5 text-[#365BEE] dark:text-[#7AA2FF]" />
                <span>Image (JPG, PNG, WEBP)</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  docInputRef.current?.click();
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-[#172033] dark:text-[#F3F5FB] hover:bg-[#F5F5F0] dark:hover:bg-[#222838]"
              >
                <FileText className="w-3.5 h-3.5 text-[#687386] dark:text-[#9BA5B8]" />
                <span>Document / PDF</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveInput('youtube');
                  setUrlValue('');
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-[#172033] dark:text-[#F3F5FB] hover:bg-[#F5F5F0] dark:hover:bg-[#222838]"
              >
                <Youtube className="w-3.5 h-3.5 text-[#FF694F]" />
                <span>YouTube + Timestamp</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setActiveInput('link');
                  setUrlValue('');
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-[#172033] dark:text-[#F3F5FB] hover:bg-[#F5F5F0] dark:hover:bg-[#222838]"
              >
                <Link2 className="w-3.5 h-3.5 text-[#365BEE] dark:text-[#7AA2FF]" />
                <span>External Reference URL</span>
              </button>
            </div>
          )}
        </div>

        {!compact && (
          <span className="font-mono text-[11px] text-[#687386] dark:text-[#9BA5B8]">
            Drag & drop images, PDFs, YouTube, or URLs · max 10 MB
          </span>
        )}
      </div>

      {activeInput === 'youtube' && (
        <div className="p-3 bg-[#F5F5F0]/80 dark:bg-[#222838] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[10px] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#172033] dark:text-[#F3F5FB]">
              <Youtube className="w-3.5 h-3.5 text-[#FF694F]" />
              Attach YouTube Clip & Optional Timestamp Range
            </span>
            <button
              type="button"
              aria-label="Close YouTube form"
              onClick={() => {
                setActiveInput(null);
                setUrlValue('');
                setYtStartRaw('');
                setYtEndRaw('');
                setYtNote('');
              }}
              className="p-1 text-[#687386] hover:text-[#172033] dark:text-[#9BA5B8] dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
            aria-label="YouTube video URL"
            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#141824] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[7px] text-[#172033] dark:text-[#F3F5FB] focus:outline-none focus:border-[#365BEE]"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#687386] dark:text-[#9BA5B8] mb-0.5">
                Start (MM:SS)
              </label>
              <input
                type="text"
                value={ytStartRaw}
                onChange={(e) => setYtStartRaw(e.target.value)}
                placeholder="01:15"
                aria-label="Start timestamp"
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-[#141824] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[7px] text-[#172033] dark:text-[#F3F5FB] focus:outline-none focus:border-[#365BEE]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#687386] dark:text-[#9BA5B8] mb-0.5">
                End (MM:SS)
              </label>
              <input
                type="text"
                value={ytEndRaw}
                onChange={(e) => setYtEndRaw(e.target.value)}
                placeholder="02:45"
                aria-label="End timestamp"
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-[#141824] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[7px] text-[#172033] dark:text-[#F3F5FB] focus:outline-none focus:border-[#365BEE]"
              />
            </div>
            <div className="col-span-2 sm:col-span-1 flex items-end">
              <button
                type="button"
                disabled={urlLoading || !urlValue.trim()}
                onClick={() => void handleAttachUrl()}
                className="w-full px-3 py-1.5 text-xs font-medium bg-[#365BEE] text-white rounded-[7px] hover:bg-[#294AD4] disabled:opacity-50 whitespace-nowrap"
              >
                {urlLoading ? 'Checking...' : 'Attach Clip'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              value={ytNote}
              onChange={(e) => setYtNote(e.target.value)}
              placeholder="Optional note (e.g., Explains pointer swap at 01:15)"
              aria-label="Timestamp explanation note"
              className="flex-1 min-w-[180px] px-2.5 py-1 text-xs bg-white dark:bg-[#141824] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[7px] text-[#172033] dark:text-[#F3F5FB] focus:outline-none focus:border-[#365BEE]"
            />
            {previewRangeLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FF694F]/15 text-[#C4422C] dark:text-[#FCA5A5] font-mono text-[11px]">
                <Clock className="w-3 h-3" />
                {previewRangeLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {activeInput === 'link' && (
        <div className="flex items-center gap-2 p-2 bg-[#F5F5F0]/80 dark:bg-[#222838] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[8px]">
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAttachUrl();
              }
            }}
            placeholder="https://github.com/... or reference documentation URL"
            aria-label="External reference URL"
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white dark:bg-[#141824] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[7px] text-[#172033] dark:text-[#F3F5FB] focus:outline-none focus:border-[#365BEE]"
          />
          <button
            type="button"
            disabled={urlLoading || !urlValue.trim()}
            onClick={() => void handleAttachUrl()}
            className="px-3 py-1.5 text-xs font-medium bg-[#365BEE] text-white rounded-[7px] hover:bg-[#294AD4] disabled:opacity-50 whitespace-nowrap"
          >
            {urlLoading ? 'Checking...' : 'Attach'}
          </button>
          <button
            type="button"
            aria-label="Cancel attachment URL"
            onClick={() => {
              setActiveInput(null);
              setUrlValue('');
            }}
            className="p-1 text-[#687386] hover:text-[#172033] dark:text-[#9BA5B8] dark:hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {composerError && (
        <p role="alert" className="text-xs text-[#C4422C] dark:text-[#FCA5A5] flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{composerError}</span>
        </p>
      )}

      {(pendingUploads.length > 0 || attachments.length > 0) && (
        <div className="space-y-2">
          <AnimatePresence>
            {pendingUploads.map((item) => (
              <motion.div
                key={item.localId}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94, y: -4 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className={`relative overflow-hidden rounded-[12px] border p-3 text-xs ${
                  item.status === 'done'
                    ? 'border-emerald-500/60 bg-emerald-50/70 dark:bg-emerald-950/35'
                    : item.status === 'error'
                      ? 'border-[#EF233C]/60 bg-[#EF233C]/10'
                      : 'border-[#365BEE]/50 dark:border-[#EF233C]/50 bg-[#0B0D14]/[0.03] dark:bg-[#131620]'
                }`}
              >
                {/* Animated glowing sweep shimmer while uploading */}
                {item.status === 'uploading' && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ x: '-100%' }}
                    animate={{ x: '200%' }}
                    transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
                    className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-[#EF233C]/15 to-transparent"
                  />
                )}

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative w-11 h-11 rounded-[9px] overflow-hidden border border-[#DFE5F0] dark:border-white/15 shrink-0 bg-[#172033]/5 dark:bg-black/40 flex items-center justify-center">
                      {item.previewUrl ? (
                        <>
                          <img
                            src={item.previewUrl}
                            alt={item.file.name}
                            className={`w-full h-full object-cover transition-all duration-300 ${
                              item.status === 'uploading' ? 'scale-105 brightness-90' : 'scale-100'
                            }`}
                          />
                          {item.status === 'uploading' && (
                            <motion.div
                              aria-hidden="true"
                              initial={{ top: '-15%' }}
                              animate={{ top: '110%' }}
                              transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
                              className="absolute inset-x-0 h-1 bg-gradient-to-r from-[#365BEE] via-[#EF233C] to-[#365BEE] shadow-[0_0_10px_#EF233C]"
                            />
                          )}
                        </>
                      ) : (
                        <motion.div
                          animate={item.status === 'uploading' ? { y: [-2, 2, -2] } : { y: 0 }}
                          transition={{ repeat: Infinity, duration: 1.1 }}
                        >
                          <FileText className="w-5 h-5 text-[#EF233C]" />
                        </motion.div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-[#172033] dark:text-[#F8FAFC] truncate">
                          {item.file.name}
                        </p>
                        {item.status === 'uploading' && (
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#EF233C]/15 text-[#EF233C] shrink-0">
                            {item.progress}%
                          </span>
                        )}
                        {item.status === 'done' && (
                          <motion.span
                            initial={{ scale: 0.7 }}
                            animate={{ scale: [0.8, 1.15, 1] }}
                            className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white shrink-0"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Uploaded
                          </motion.span>
                        )}
                      </div>

                      {item.status === 'uploading' ? (
                        <div className="space-y-1">
                          <div className="w-full h-1.5 rounded-full bg-[#DFE5F0] dark:bg-white/10 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-gradient-to-r from-[#365BEE] via-[#EF233C] to-[#FF694F]"
                              initial={{ width: '8%' }}
                              animate={{ width: `${Math.max(8, item.progress)}%` }}
                              transition={{ duration: 0.25, ease: 'easeOut' }}
                            />
                          </div>
                          <p className="text-[11px] font-mono text-[#365BEE] dark:text-[#FCA5A5] inline-flex items-center gap-1.5">
                            <UploadCloud className="w-3 h-3 animate-pulse" />
                            <span>{item.stage}</span>
                            <Sparkles className="w-3 h-3 text-[#EF233C] animate-spin" />
                          </p>
                        </div>
                      ) : item.status === 'done' ? (
                        <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                          Ready and attached to post · {formatFileSize(item.file.size)}
                        </p>
                      ) : (
                        <p className="text-[11px] text-[#C4422C] dark:text-[#FCA5A5]">
                          {item.error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {item.status === 'error' && (
                      <button
                        type="button"
                        aria-label={`Retry ${item.file.name}`}
                        onClick={() => void handleRetryUpload(item)}
                        className="p-1.5 text-[#365BEE] dark:text-[#FCA5A5] hover:bg-white dark:hover:bg-white/10 rounded"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${item.file.name}`}
                      onClick={() => handleDismissPending(item)}
                      className="p-1.5 text-[#687386] hover:text-[#EF233C] rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => {
                const rangeLabel =
                  att.type === 'youtube'
                    ? formatTimestampRange(att.startSeconds, att.endSeconds)
                    : null;
                return (
                  <div
                    key={att.id}
                    className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-[#1A1F2C] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[8px] text-xs max-w-full"
                  >
                    {att.type === 'image' ? (
                      <img
                        src={att.secureUrl}
                        alt={att.fileName}
                        className="w-6 h-6 rounded object-cover border border-[#DFE5F0] shrink-0"
                      />
                    ) : att.type === 'youtube' ? (
                      <Youtube className="w-3.5 h-3.5 text-[#FF694F] shrink-0" />
                    ) : att.type === 'document' ? (
                      <FileText className="w-3.5 h-3.5 text-[#687386] shrink-0" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5 text-[#365BEE] shrink-0" />
                    )}
                    <span className="truncate max-w-[160px] text-[#172033] dark:text-[#F3F5FB] font-medium">
                      {att.linkTitle || att.fileName}
                    </span>
                    {rangeLabel && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#FF694F]/15 text-[#C4422C] dark:text-[#FCA5A5]">
                        {rangeLabel}
                      </span>
                    )}
                    {att.fileSize > 0 && (
                      <span className="font-mono text-[10px] text-[#687386] dark:text-[#9BA5B8]">
                        {formatFileSize(att.fileSize)}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${att.fileName}`}
                      onClick={() =>
                        onChange(attachments.filter((item) => item.id !== att.id))
                      }
                      className="text-[#687386] hover:text-[#FF694F] p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AttachmentRendererProps {
  attachments: RichAttachment[];
  compact?: boolean;
}

export function AttachmentRenderer({
  attachments,
  compact = false,
}: AttachmentRendererProps) {
  const [lightboxImage, setLightboxImage] = React.useState<RichAttachment | null>(null);
  const [docPreview, setDocPreview] = React.useState<RichAttachment | null>(null);
  const [playingVideos, setPlayingVideos] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!lightboxImage && !docPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxImage(null);
        setDocPreview(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxImage, docPreview]);

  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {attachments.map((att) => {
        if (att.type === 'image') {
          return (
            <div
              key={att.id}
              className="border border-[#DFE5F0] dark:border-[#2C3448] rounded-[10px] overflow-hidden bg-[#F5F5F0]/50 dark:bg-[#141824]"
            >
              <button
                type="button"
                onClick={() => setLightboxImage(att)}
                className="block w-full text-left group relative"
              >
                <img
                  src={att.secureUrl}
                  alt={att.fileName}
                  loading="lazy"
                  className={`w-full object-contain bg-[#F5F5F0] dark:bg-[#141824] ${
                    compact ? 'max-h-52' : 'max-h-80'
                  }`}
                />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[#172033]/85 text-white text-[11px] font-medium opacity-90 group-hover:opacity-100">
                  <Eye className="w-3 h-3" />
                  Expand
                </span>
              </button>
              <div className="px-3 py-1.5 border-t border-[#DFE5F0] dark:border-[#2C3448] bg-white dark:bg-[#1A1F2C] flex items-center justify-between text-[11px] text-[#687386] dark:text-[#9BA5B8]">
                <span className="truncate font-medium text-[#172033] dark:text-[#F3F5FB]">
                  {att.fileName}
                </span>
                {att.fileSize > 0 && (
                  <span className="font-mono shrink-0">{formatFileSize(att.fileSize)}</span>
                )}
              </div>
            </div>
          );
        }

        if (att.type === 'youtube' && att.youtubeId) {
          const isPlaying = Boolean(playingVideos[att.id]);
          const thumb =
            att.thumbnailUrl || `https://i.ytimg.com/vi/${att.youtubeId}/hqdefault.jpg`;
          const rangeLabel = formatTimestampRange(att.startSeconds, att.endSeconds);
          const params = new URLSearchParams({ rel: '0' });
          if (typeof att.startSeconds === 'number' && att.startSeconds >= 0) {
            params.set('start', String(Math.floor(att.startSeconds)));
          }
          if (typeof att.endSeconds === 'number' && att.endSeconds > (att.startSeconds ?? 0)) {
            params.set('end', String(Math.floor(att.endSeconds)));
          }
          const embedUrl = `https://www.youtube-nocookie.com/embed/${att.youtubeId}?${params.toString()}`;
          const externalHref =
            typeof att.startSeconds === 'number' && att.startSeconds > 0
              ? `${att.secureUrl}&t=${Math.floor(att.startSeconds)}s`
              : att.secureUrl;

          return (
            <div
              key={att.id}
              className="border border-[#DFE5F0] dark:border-[#2C3448] rounded-[10px] overflow-hidden bg-white dark:bg-[#1A1F2C]"
            >
              {isPlaying ? (
                <div className="aspect-video bg-[#172033]">
                  <iframe
                    src={embedUrl}
                    title={att.linkTitle || 'YouTube video player'}
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setPlayingVideos((prev) => ({ ...prev, [att.id]: true }))
                  }
                  className="relative block w-full aspect-video bg-[#172033] group overflow-hidden"
                >
                  <img
                    src={thumb}
                    alt={att.linkTitle || 'YouTube video thumbnail'}
                    loading="lazy"
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                  />
                  <div className="absolute inset-0 bg-[#172033]/25 flex items-center justify-center">
                    <span className="w-12 h-12 rounded-full bg-[#FF694F] text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </span>
                  </div>
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#172033]/85 text-white text-[11px] font-mono">
                      <Youtube className="w-3.5 h-3.5 text-[#FF694F]" />
                      YouTube
                    </span>
                    {rangeLabel && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#FF694F] text-white text-[11px] font-mono font-medium">
                        <Clock className="w-3 h-3" />
                        {rangeLabel}
                      </span>
                    )}
                  </div>
                </button>
              )}

              <div className="px-3.5 py-2.5 flex items-center justify-between gap-3 border-t border-[#DFE5F0] dark:border-[#2C3448]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-[#172033] dark:text-[#F3F5FB] truncate">
                      {att.linkTitle || 'YouTube Video'}
                    </p>
                    {rangeLabel && (
                      <span className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#FF694F]/15 text-[#C4422C] dark:text-[#FCA5A5]">
                        {rangeLabel}
                      </span>
                    )}
                  </div>
                  {att.linkDescription && (
                    <p className="text-[11px] text-[#687386] dark:text-[#9BA5B8] truncate">
                      {att.linkDescription}
                    </p>
                  )}
                </div>
                <a
                  href={externalHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-medium text-[#365BEE] dark:text-[#7AA2FF] hover:underline whitespace-nowrap shrink-0"
                >
                  Open on YouTube
                </a>
              </div>
            </div>
          );
        }

        if (att.type === 'document') {
          const isPdf =
            att.mimeType === 'application/pdf' ||
            att.fileName.toLowerCase().endsWith('.pdf');
          const ext = att.fileName.split('.').pop()?.toUpperCase() || 'DOC';

          return (
            <div
              key={att.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-[#F5F5F0]/70 dark:bg-[#222838] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[10px]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="px-2 py-1 rounded-[6px] bg-white dark:bg-[#1A1F2C] border border-[#DFE5F0] dark:border-[#2C3448] font-mono text-[10px] font-semibold text-[#172033] dark:text-[#F3F5FB] shrink-0">
                  {ext}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#172033] dark:text-[#F3F5FB] truncate">
                    {att.fileName}
                  </p>
                  {att.fileSize > 0 && (
                    <p className="font-mono text-[11px] text-[#687386] dark:text-[#9BA5B8]">
                      {formatFileSize(att.fileSize)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isPdf && att.secureUrl && (
                  <button
                    type="button"
                    onClick={() => setDocPreview(att)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white dark:bg-[#1A1F2C] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[7px] text-[#172033] dark:text-[#F3F5FB] hover:border-[#365BEE]"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                )}
                <a
                  href={att.secureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={att.fileName}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white dark:bg-[#1A1F2C] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[7px] text-[#365BEE] dark:text-[#7AA2FF] hover:border-[#365BEE]"
                >
                  <Download className="w-3.5 h-3.5" />
                  Open
                </a>
              </div>
            </div>
          );
        }

        const safeHref = isSafeExternalUrl(att.secureUrl);
        if (!safeHref) return null;

        return (
          <a
            key={att.id}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start justify-between gap-3 p-3 bg-[#F5F5F0]/70 dark:bg-[#222838] border border-[#DFE5F0] dark:border-[#2C3448] rounded-[10px] hover:border-[#365BEE] transition-colors group"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#687386] dark:text-[#9BA5B8]">
                <ExternalLink className="w-3 h-3 text-[#365BEE] dark:text-[#7AA2FF] shrink-0" />
                <span className="truncate">{att.linkDomain || att.fileName}</span>
              </div>
              <p className="text-xs font-medium text-[#172033] dark:text-[#F3F5FB] group-hover:text-[#365BEE] line-clamp-1">
                {att.linkTitle || att.secureUrl}
              </p>
              {att.linkDescription && (
                <p className="text-[11px] text-[#687386] dark:text-[#9BA5B8] line-clamp-2">
                  {att.linkDescription}
                </p>
              )}
            </div>
            {att.thumbnailUrl && (
              <img
                src={att.thumbnailUrl}
                alt=""
                loading="lazy"
                className="w-14 h-14 rounded-[7px] object-cover border border-[#DFE5F0] dark:border-[#2C3448] shrink-0"
              />
            )}
          </a>
        );
      })}

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Image preview: ${lightboxImage.fileName}`}
          className="fixed inset-0 z-[80] bg-[#172033]/85 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-white dark:bg-[#1A1F2C] rounded-[14px] overflow-hidden border border-[#DFE5F0] dark:border-[#2C3448]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#DFE5F0] dark:border-[#2C3448] flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[#172033] dark:text-[#F3F5FB] truncate">
                {lightboxImage.fileName}
              </span>
              <button
                type="button"
                aria-label="Close image lightbox"
                onClick={() => setLightboxImage(null)}
                className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[#687386] hover:bg-[#F5F5F0] hover:text-[#172033]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-[#F5F5F0] dark:bg-[#12151E] flex items-center justify-center">
              <img
                src={lightboxImage.secureUrl}
                alt={lightboxImage.fileName}
                className="max-h-[75vh] w-auto object-contain rounded-[8px]"
              />
            </div>
          </div>
        </div>
      )}

      {/* PDF Document Preview Modal */}
      {docPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Document preview: ${docPreview.fileName}`}
          className="fixed inset-0 z-[80] bg-[#172033]/80 flex items-center justify-center p-4"
          onClick={() => setDocPreview(null)}
        >
          <div
            className="max-w-4xl w-full h-[85vh] bg-white dark:bg-[#1A1F2C] rounded-[14px] overflow-hidden border border-[#DFE5F0] dark:border-[#2C3448] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#DFE5F0] dark:border-[#2C3448] flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[#172033] dark:text-[#F3F5FB] truncate">
                {docPreview.fileName}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={docPreview.secureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#365BEE] hover:underline"
                >
                  Open externally
                </a>
                <button
                  type="button"
                  aria-label="Close document preview"
                  onClick={() => setDocPreview(null)}
                  className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[#687386] hover:bg-[#F5F5F0] hover:text-[#172033]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe
              src={docPreview.secureUrl}
              title={docPreview.fileName}
              className="flex-1 w-full border-0 bg-[#F5F5F0]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

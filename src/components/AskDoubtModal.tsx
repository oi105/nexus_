import React from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  Camera,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  SUPPORTED_TOPICS,
  type IntegrationStatus,
  type RichAttachment,
  type UrgencyLevel,
} from '../types/nexus';
import {
  formatFileSize,
  MAX_ATTACHMENTS_PER_POST,
  validateAttachmentFile,
  validateQuestionDraft,
} from '../utils/nexusLogic';
import { uploadAttachmentToCloudinary } from '../services/nexusService';
import { CameraCaptureModal } from './CameraCaptureModal';
import { AttachmentComposer } from './RichAttachments';

interface StagedCameraPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

interface AskDoubtModalProps {
  open: boolean;
  currentUser: User | null;
  integrations: IntegrationStatus;
  onClose: () => void;
  onSignInGoogle: () => Promise<void>;
  onPublish: (input: {
    title: string;
    description: string;
    topic: string;
    tags: string[];
    urgency: UrgencyLevel;
    attachments: RichAttachment[];
    generateAiInsight: boolean;
  }) => Promise<void>;
}

const TOPICS_ONLY = SUPPORTED_TOPICS.filter((t) => t !== 'All Topics');

export function AskDoubtModal({
  open,
  currentUser,
  integrations,
  onClose,
  onSignInGoogle,
  onPublish,
}: AskDoubtModalProps) {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [topic, setTopic] = React.useState<string>('DSA');
  const [tagInput, setTagInput] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [urgency, setUrgency] = React.useState<UrgencyLevel>('normal');
  const [attachments, setAttachments] = React.useState<RichAttachment[]>([]);
  const [stagedPhotos, setStagedPhotos] = React.useState<StagedCameraPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [generateAiInsight, setGenerateAiInsight] = React.useState(true);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadStatus, setUploadStatus] = React.useState<string | null>(null);

  const fallbackImageInputRef = React.useRef<HTMLInputElement | null>(null);
  const isVerifiedGoogle = Boolean(currentUser && !currentUser.isAnonymous);

  React.useEffect(() => {
    return () => {
      stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [stagedPhotos]);

  if (!open) return null;

  const totalAttachmentsCount = attachments.length + stagedPhotos.length;
  const remainingSlots = Math.max(0, MAX_ATTACHMENTS_PER_POST - totalAttachmentsCount);

  const handleAddTag = () => {
    const clean = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (!clean || tags.includes(clean) || tags.length >= 8) {
      setTagInput('');
      return;
    }
    setTags([...tags, clean.slice(0, 40)]);
    setTagInput('');
  };

  const handleStageCameraFile = (file: File) => {
    if (remainingSlots <= 0) {
      setErrors([`Maximum ${MAX_ATTACHMENTS_PER_POST} attachments allowed.`]);
      return;
    }
    const check = validateAttachmentFile(file, 'image');
    if (!check.valid) {
      setErrors([check.error]);
      return;
    }
    setErrors([]);
    const id = `cam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const previewUrl = URL.createObjectURL(file);
    setStagedPhotos((prev) => [...prev, { id, file, previewUrl }]);
  };

  const handleRemoveStagedPhoto = (id: string) => {
    setStagedPhotos((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleFallbackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    handleStageCameraFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateQuestionDraft({
      title,
      description,
      topic,
      tags,
      urgency,
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors([]);
    setSubmitting(true);
    setUploadStatus(null);

    try {
      let finalAttachments = [...attachments];

      if (stagedPhotos.length > 0) {
        setUploadStatus(
          `Uploading ${stagedPhotos.length} captured ${stagedPhotos.length === 1 ? 'photo' : 'photos'}...`,
        );
        const uploadedPhotos: RichAttachment[] = [];
        for (const photo of stagedPhotos) {
          const uploaded = await uploadAttachmentToCloudinary(
            photo.file,
            currentUser?.uid ?? 'anonymous',
            'image',
            { cloudinaryConfigured: integrations.cloudinaryConfigured },
          );
          uploadedPhotos.push(uploaded);
        }
        finalAttachments = [...finalAttachments, ...uploadedPhotos].slice(
          0,
          MAX_ATTACHMENTS_PER_POST,
        );
      }

      setUploadStatus('Publishing doubt...');
      await onPublish({
        title,
        description,
        topic,
        tags,
        urgency,
        attachments: finalAttachments,
        generateAiInsight,
      });

      stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setTitle('');
      setDescription('');
      setTags([]);
      setAttachments([]);
      setStagedPhotos([]);
      setUploadStatus(null);
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Unable to publish doubt.']);
    } finally {
      setSubmitting(false);
      setUploadStatus(null);
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-doubt-title"
        className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      >
        <div className="bg-white border border-[#DFE5F0] rounded-[14px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
          <div className="sticky top-0 z-10 bg-white border-b border-[#DFE5F0] px-6 py-4 flex items-center justify-between">
            <div>
              <h2
                id="ask-doubt-title"
                className="font-display font-semibold text-lg text-[#172033]"
              >
                Ask a Doubt
              </h2>
              <p className="text-xs text-[#687386]">
                Clear context or a quick photo helps peers and NEXUS AI evaluate your problem accurately.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close composer"
              onClick={onClose}
              className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[#687386] hover:bg-[#F5F5F0] hover:text-[#172033] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {!isVerifiedGoogle && (
              <div className="bg-[#365BEE]/[0.06] border border-[#365BEE]/25 rounded-[10px] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-[#172033]">
                    Google sign-in is required to publish a doubt
                  </p>
                  <p className="text-xs text-[#687386]">
                    {currentUser?.isAnonymous
                      ? 'Upgrade your temporary guest session to publish doubts and mark solutions as solved.'
                      : 'Sign in with Google so peers can answer your doubts and earn verified solver credits.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onSignInGoogle()}
                  className="px-3.5 py-2 text-xs font-medium bg-[#365BEE] text-white rounded-[8px] hover:bg-[#294AD4] transition-colors whitespace-nowrap"
                >
                  Sign in with Google
                </button>
              </div>
            )}

            {/* Title */}
            <div>
              <label
                htmlFor="doubt-title"
                className="block text-xs font-medium text-[#172033] mb-1.5"
              >
                Question title
              </label>
              <input
                id="doubt-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Why does my B+ tree split lose the leaf sibling pointer?"
                className="w-full px-3.5 py-2.5 text-sm border border-[#DFE5F0] rounded-[9px] focus:outline-none focus:border-[#365BEE]"
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="doubt-description"
                className="block text-xs font-medium text-[#172033] mb-1.5"
              >
                Detailed description
              </label>
              <textarea
                id="doubt-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you expected, what actually happened, and what you have tried so far..."
                className="w-full px-3.5 py-2.5 text-sm border border-[#DFE5F0] rounded-[9px] focus:outline-none focus:border-[#365BEE] resize-y"
              />
            </div>

            {/* Category & Urgency (Manual bounty removed; governed by NEXUS AI Reward Engine) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="doubt-topic"
                  className="block text-xs font-medium text-[#172033] mb-1.5"
                >
                  Category
                </label>
                <select
                  id="doubt-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#DFE5F0] rounded-[9px] focus:outline-none focus:border-[#365BEE]"
                >
                  {TOPICS_ONLY.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="doubt-urgency"
                  className="block text-xs font-medium text-[#172033] mb-1.5"
                >
                  Urgency
                </label>
                <select
                  id="doubt-urgency"
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#DFE5F0] rounded-[9px] focus:outline-none focus:border-[#365BEE]"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent (Lab / Exam soon)</option>
                  <option value="critical">Critical (Blocked now)</option>
                </select>
              </div>
            </div>

            {/* Skill Tags */}
            <div>
              <label
                htmlFor="doubt-tags"
                className="block text-xs font-medium text-[#172033] mb-1.5"
              >
                Skill tags (up to 8)
              </label>
              <div className="flex gap-2">
                <input
                  id="doubt-tags"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="e.g., pointers, recursion, normalization"
                  className="flex-1 px-3 py-2 text-sm border border-[#DFE5F0] rounded-[9px] focus:outline-none focus:border-[#365BEE]"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-3 py-2 text-xs font-medium border border-[#DFE5F0] rounded-[8px] hover:bg-[#F5F5F0] transition-colors inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-[#F5F5F0] border border-[#DFE5F0] rounded-[7px] text-[#172033]"
                    >
                      #{t}
                      <button
                        type="button"
                        aria-label={`Remove tag ${t}`}
                        onClick={() => setTags(tags.filter((item) => item !== t))}
                        className="text-[#687386] hover:text-[#FF694F]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Live Camera Capture + Unified Rich Media Attachments */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-medium text-[#172033]">
                  Visual & Reference Attachments ({totalAttachmentsCount}/{MAX_ATTACHMENTS_PER_POST})
                </label>

                <input
                  ref={fallbackImageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleFallbackFileChange}
                />

                <button
                  type="button"
                  disabled={submitting || remainingSlots <= 0}
                  onClick={() => {
                    setErrors([]);
                    setCameraOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#172033] text-white rounded-[8px] hover:bg-[#27334D] disabled:opacity-50 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Capture a photo</span>
                </button>
              </div>

              {stagedPhotos.length > 0 && (
                <div className="space-y-2 p-3 rounded-[10px] bg-[#F5F5F0] border border-[#DFE5F0]">
                  <p className="text-[11px] font-mono text-[#687386]">
                    Captured photos staged locally (uploads when you publish):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {stagedPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="bg-white border border-[#DFE5F0] rounded-[9px] p-2 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={photo.previewUrl}
                            alt={photo.file.name}
                            className="w-12 h-12 rounded-[7px] object-cover border border-[#DFE5F0] shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[#172033] truncate">
                              {photo.file.name}
                            </p>
                            <p className="font-mono text-[10px] text-[#687386]">
                              {formatFileSize(photo.file.size)} · Ready to upload
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${photo.file.name}`}
                          onClick={() => handleRemoveStagedPhoto(photo.id)}
                          className="p-1.5 text-[#687386] hover:text-[#FF694F] rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <AttachmentComposer
                attachments={attachments}
                onChange={setAttachments}
                uid={currentUser?.uid ?? 'anonymous'}
                cloudinaryConfigured={integrations.cloudinaryConfigured}
                disabled={submitting}
              />
            </div>

            {/* Automatic AI Difficulty & Reward Notice + Insight Toggle */}
            <div className="space-y-2.5">
              <div className="px-3.5 py-2.5 rounded-[10px] bg-[#F5F5F0] border border-[#DFE5F0] text-xs text-[#687386]">
                <span className="font-medium text-[#172033]">NEXUS AI Reward Engine:</span>{' '}
                Difficulty tier and solver credit reward (5, 10, 20, or 30 credits) are assessed automatically on publish based on technical complexity.
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-[10px] bg-[#8676E8]/[0.06] border border-[#8676E8]/25 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateAiInsight}
                  onChange={(e) => setGenerateAiInsight(e.target.checked)}
                  className="mt-0.5 rounded border-[#8676E8] text-[#8676E8] focus:ring-[#8676E8]"
                />
                <div className="text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-[#172033]">
                    <Sparkles className="w-3.5 h-3.5 text-[#6755D8]" />
                    <span>Generate NEXUS AI study insight on publish</span>
                  </div>
                  <p className="text-[#687386] mt-0.5">
                    {integrations.geminiConfigured
                      ? 'Attaches a structured Gemini study breakdown alongside community answers.'
                      : 'Gemini API key is currently not configured on the server; you can retry assessment and insights later.'}
                  </p>
                </div>
              </label>
            </div>

            {errors.length > 0 && (
              <div
                role="alert"
                className="p-3.5 rounded-[9px] bg-[#FF694F]/10 border border-[#FF694F]/30 space-y-1"
              >
                {errors.map((err, idx) => (
                  <p key={idx} className="text-xs text-[#C4422C] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{err}</span>
                  </p>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-[#DFE5F0] flex items-center justify-between gap-3">
              <div className="text-xs text-[#365BEE] font-medium">
                {uploadStatus && (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {uploadStatus}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-[#687386] hover:text-[#172033] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isVerifiedGoogle || submitting}
                  className="px-5 py-2 text-sm font-medium bg-[#365BEE] text-white rounded-[8px] hover:bg-[#294AD4] disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Publishing...' : 'Publish Doubt'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onConfirmPhoto={handleStageCameraFile}
        onFallbackFileUpload={() => fallbackImageInputRef.current?.click()}
      />
    </>
  );
}

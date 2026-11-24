import React from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  CornerDownRight,
  Flag,
  Heart,
  MessageSquare,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import type {
  AiInsight,
  Answer,
  AnswerReply,
  IntegrationStatus,
  Question,
  RichAttachment,
} from '../types/nexus';
import {
  formatAiRewardLabel,
  formatFileSize,
  formatRelativeTime,
  MAX_ATTACHMENTS_PER_POST,
  sortAnswers,
  validateAttachmentFile,
} from '../utils/nexusLogic';
import { uploadAttachmentToCloudinary } from '../services/nexusService';
import { UserAvatar } from '../components/NexusBrand';
import { NexusAiPanel } from '../components/NexusAiPanel';
import { CameraCaptureModal } from '../components/CameraCaptureModal';
import { AttachmentComposer, AttachmentRenderer } from '../components/RichAttachments';
import { soundManager } from './audio';

interface StagedCameraPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

interface ChamberProps {
  question: Question;
  answers: Answer[];
  repliesMap: Record<string, AnswerReply[]>;
  isQuestionLiked: boolean;
  likedAnswerIds: Record<string, boolean>;
  currentUser: User | null;
  aiInsight: AiInsight | null;
  aiLoading: boolean;
  aiError: string | null;
  integrations: IntegrationStatus;
  theme: 'light' | 'dark';
  onClose: () => void;
  onToggleQuestionLike: (question: Question) => Promise<void> | void;
  onToggleAnswerLike: (answer: Answer) => Promise<void> | void;
  onLoadAnswerReplies: (answerId: string) => void;
  onSubmitAnswerReply: (answer: Answer, body: string) => Promise<void>;
  onRequestAiInsight: () => void;
  onRetryRewardAssessment: (question: Question) => Promise<void>;
  onSubmitAnswer: (body: string, attachments: RichAttachment[]) => Promise<void>;
  onMarkAsSolved: (answer: Answer) => Promise<void>;
  onOpenReport: (
    targetType: 'question' | 'answer' | 'reward',
    targetId: string,
    preview: string,
  ) => void;
  onSignInGoogle: () => Promise<void>;
  onSignInGuest: () => Promise<{ ok: boolean; error?: string }>;
}

export function Chamber({
  question,
  answers,
  repliesMap,
  isQuestionLiked,
  likedAnswerIds,
  currentUser,
  aiInsight,
  aiLoading,
  aiError,
  integrations,
  theme,
  onClose,
  onToggleQuestionLike,
  onToggleAnswerLike,
  onLoadAnswerReplies,
  onSubmitAnswerReply,
  onRequestAiInsight,
  onRetryRewardAssessment,
  onSubmitAnswer,
  onMarkAsSolved,
  onOpenReport,
  onSignInGoogle,
  onSignInGuest,
}: ChamberProps) {
  const [sortBy, setSortBy] = React.useState<'helpful' | 'newest'>('helpful');
  const [newAnswerBody, setNewAnswerBody] = React.useState('');
  const [attachments, setAttachments] = React.useState<RichAttachment[]>([]);
  const [stagedPhotos, setStagedPhotos] = React.useState<StagedCameraPhoto[]>([]);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [answerError, setAnswerError] = React.useState<string | null>(null);
  const [solveError, setSolveError] = React.useState<string | null>(null);
  const [solvingAnswerId, setSolvingAnswerId] = React.useState<string | null>(null);
  const [retryingAssessment, setRetryingAssessment] = React.useState(false);

  const [activeReplyAnswerId, setActiveReplyAnswerId] = React.useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});
  const [replySubmittingId, setReplySubmittingId] = React.useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = React.useState<Record<string, boolean>>({});
  const fallbackImageInputRef = React.useRef<HTMLInputElement | null>(null);

  const isDark = theme === 'dark';

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cameraOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, cameraOpen]);

  React.useEffect(() => {
    return () => {
      stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [stagedPhotos]);

  const sortedAnswers = React.useMemo(
    () => sortAnswers(answers, sortBy),
    [answers, sortBy],
  );

  const isQuestionAuthor = Boolean(
    currentUser && !currentUser.isAnonymous && currentUser.uid === question.authorId,
  );
  const canAcceptSolution = question.isDemo || isQuestionAuthor;

  const rewardLabel = formatAiRewardLabel(question);
  const rewardReady = question.assessmentStatus === 'completed' && question.assignedCredits > 0;

  const handleStageCameraFile = (file: File) => {
    if (attachments.length + stagedPhotos.length >= MAX_ATTACHMENTS_PER_POST) {
      setAnswerError(`Maximum ${MAX_ATTACHMENTS_PER_POST} attachments allowed.`);
      return;
    }
    const check = validateAttachmentFile(file, 'image');
    if (!check.valid) {
      setAnswerError(check.error);
      return;
    }
    setAnswerError(null);
    const id = `cam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const previewUrl = URL.createObjectURL(file);
    setStagedPhotos((prev) => [...prev, { id, file, previewUrl }]);
  };

  const handlePostAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnswerError(null);
    const trimmed = newAnswerBody.trim();
    if (trimmed.length < 3 && attachments.length === 0 && stagedPhotos.length === 0) {
      setAnswerError('Write an explanation or attach media before posting.');
      return;
    }

    setSubmitting(true);
    try {
      let finalAttachments = [...attachments];
      if (stagedPhotos.length > 0) {
        const uploaded: RichAttachment[] = [];
        for (const p of stagedPhotos) {
          const res = await uploadAttachmentToCloudinary(
            p.file,
            currentUser?.uid ?? 'anonymous',
            'image',
            { cloudinaryConfigured: integrations.cloudinaryConfigured },
          );
          uploaded.push(res);
        }
        finalAttachments = [...finalAttachments, ...uploaded].slice(
          0,
          MAX_ATTACHMENTS_PER_POST,
        );
      }

      await onSubmitAnswer(trimmed || 'Shared a resource.', finalAttachments);
      stagedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setNewAnswerBody('');
      setAttachments([]);
      setStagedPhotos([]);
      soundManager.playChime();
    } catch (err) {
      setAnswerError(err instanceof Error ? err.message : 'Unable to post answer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSolveClick = async (answer: Answer) => {
    setSolveError(null);
    setSolvingAnswerId(answer.id);
    try {
      await onMarkAsSolved(answer);
      soundManager.playChime();
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : 'Unable to mark answer as solved.');
    } finally {
      setSolvingAnswerId(null);
    }
  };

  const handleToggleReplyBox = (answerId: string) => {
    setExpandedReplies((prev) => ({ ...prev, [answerId]: true }));
    onLoadAnswerReplies(answerId);
    setActiveReplyAnswerId((curr) => (curr === answerId ? null : answerId));
  };

  const handleSendReply = async (answer: Answer) => {
    const text = (replyDrafts[answer.id] ?? '').trim();
    if (text.length < 2) return;
    setReplySubmittingId(answer.id);
    try {
      await onSubmitAnswerReply(answer, text);
      setReplyDrafts((prev) => ({ ...prev, [answer.id]: '' }));
      setExpandedReplies((prev) => ({ ...prev, [answer.id]: true }));
      setActiveReplyAnswerId(null);
    } finally {
      setReplySubmittingId(null);
    }
  };

  const handleRetryAssessment = async () => {
    setRetryingAssessment(true);
    try {
      await onRetryRewardAssessment(question);
    } finally {
      setRetryingAssessment(false);
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Doubt Chamber: ${question.title}`}
        data-testid="doubt-chamber-modal"
        className={`fixed inset-0 z-50 overflow-y-auto p-4 sm:p-8 flex flex-col ${
          isDark
            ? 'bg-[#12151E]/96 text-[#F3F5FB]'
            : 'bg-[#F5F5F0]/96 text-[#172033]'
        }`}
      >
        {/* Top Bar */}
        <div className="max-w-4xl mx-auto w-full flex flex-wrap items-center justify-between gap-3 mb-6">
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
              isDark
                ? 'bg-[#1A1F2C] border-[#2C3448] text-[#F3F5FB] hover:border-[#4F74FF]'
                : 'bg-white border-[#DFE5F0] text-[#172033] hover:border-[#365BEE]'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Corridor</span>
          </button>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-lg text-xs font-mono font-medium border ${
                isDark
                  ? 'bg-[#26304A] text-[#93B4FF] border-[#3B4B75]'
                  : 'bg-[#EEF2FD] text-[#2445C2] border-[#D4DDF9]'
              }`}
            >
              {question.topic} Chamber
            </span>

            {!question.isDemo && (
              <button
                type="button"
                aria-label="Report doubt"
                onClick={() => onOpenReport('question', question.id, question.title)}
                className={`p-2 rounded-lg border transition-colors ${
                  isDark
                    ? 'bg-[#1A1F2C] border-[#2C3448] text-[#9BA5B8] hover:text-[#FF694F]'
                    : 'bg-white border-[#DFE5F0] text-[#687386] hover:text-[#FF694F]'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Chamber Container */}
        <div className="max-w-4xl mx-auto w-full space-y-6 flex-1 pb-16">
          {/* Doubt Core Card */}
          <article
            className={`rounded-2xl border p-5 sm:p-7 shadow-lg space-y-4 ${
              isDark
                ? 'bg-[#1A1F2C] border-[#2C3448]'
                : 'bg-white border-[#DFE5F0]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <UserAvatar
                  name={question.authorName}
                  photoURL={question.authorPhotoURL}
                  size="sm"
                />
                <div>
                  <p className="text-xs font-semibold">{question.authorName}</p>
                  <p className="text-[11px] font-mono text-[#687386] dark:text-[#9BA5B8]">
                    {question.authorBranch || 'Student'} · {formatRelativeTime(question.createdAtMs)}
                  </p>
                </div>
              </div>

              {/* Clear Credit Bounty Banner */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold border ${
                    rewardReady
                      ? isDark
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        : 'bg-[#C8ED62]/35 text-[#224414] border-[#A6D33D]/60'
                      : isDark
                        ? 'bg-[#222838] text-[#9BA5B8] border-[#2C3448]'
                        : 'bg-[#F5F5F0] text-[#687386] border-[#DFE5F0]'
                  }`}
                >
                  <Award className="w-3.5 h-3.5 shrink-0" />
                  <span>{rewardLabel}</span>
                </span>

                {!question.isDemo && !rewardReady && (
                  <button
                    type="button"
                    disabled={retryingAssessment}
                    onClick={() => void handleRetryAssessment()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#365BEE] dark:text-[#7AA2FF] hover:underline"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${retryingAssessment ? 'animate-spin' : ''}`}
                    />
                    <span>{retryingAssessment ? 'Assessing...' : 'Retry AI'}</span>
                  </button>
                )}
              </div>
            </div>

            <h1 className="font-display font-extrabold text-xl sm:text-2xl leading-snug">
              {question.title}
            </h1>

            <p
              className={`text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap ${
                isDark ? 'text-[#CBD5E1]' : 'text-[#334155]'
              }`}
            >
              {question.description}
            </p>

            {question.difficultyReason && (
              <p
                className={`text-xs px-3 py-2 rounded-lg border ${
                  isDark
                    ? 'bg-[#12151E] border-[#2C3448] text-[#9BA5B8]'
                    : 'bg-[#F5F5F0] border-[#DFE5F0] text-[#687386]'
                }`}
              >
                <span className="font-mono font-semibold">Reward assessment:</span>{' '}
                {question.difficultyReason}
              </p>
            )}

            {question.attachments.length > 0 && (
              <AttachmentRenderer attachments={question.attachments} />
            )}

            {question.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#687386] dark:text-[#9BA5B8]">
                {question.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-[#DFE5F0] dark:border-[#2C3448] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-pressed={isQuestionLiked}
                  onClick={() => void onToggleQuestionLike(question)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    isQuestionLiked
                      ? 'bg-[#FF694F]/15 border-[#FF694F]/40 text-[#FF694F]'
                      : isDark
                        ? 'bg-[#222838] border-[#2C3448] text-[#F3F5FB] hover:border-[#FF694F]'
                        : 'bg-[#F5F5F0] border-[#DFE5F0] text-[#172033] hover:border-[#FF694F]'
                  }`}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${isQuestionLiked ? 'fill-[#FF694F] text-[#FF694F]' : ''}`}
                  />
                  <span>
                    {isQuestionLiked ? 'You have this doubt too' : 'I have this doubt too'}
                  </span>
                </button>
                <span className="text-xs font-mono text-[#687386] dark:text-[#9BA5B8]">
                  {question.likeCount} students
                </span>
              </div>

              <span
                className={`text-xs font-mono font-semibold ${
                  question.status === 'resolved'
                    ? 'text-emerald-500'
                    : 'text-[#687386] dark:text-[#9BA5B8]'
                }`}
              >
                {question.status === 'resolved' ? 'Resolved' : 'Open Doubt'}
              </span>
            </div>
          </article>

          {/* NEXUS AI Study Insight */}
          <NexusAiPanel
            question={question}
            insight={aiInsight}
            loading={aiLoading}
            error={aiError}
            geminiConfigured={integrations.geminiConfigured}
            onRequestInsight={onRequestAiInsight}
          />

          {/* Answers Section */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-bold text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#365BEE]" />
                <span>Community Answers ({sortedAnswers.length})</span>
              </h2>

              <div
                role="tablist"
                aria-label="Sort chamber answers"
                className={`inline-flex items-center gap-1 p-0.5 rounded-lg border ${
                  isDark
                    ? 'bg-[#1A1F2C] border-[#2C3448]'
                    : 'bg-white border-[#DFE5F0]'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={sortBy === 'helpful'}
                  onClick={() => setSortBy('helpful')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                    sortBy === 'helpful'
                      ? 'bg-[#365BEE] text-white'
                      : 'text-[#687386] dark:text-[#9BA5B8]'
                  }`}
                >
                  Most helpful
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sortBy === 'newest'}
                  onClick={() => setSortBy('newest')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                    sortBy === 'newest'
                      ? 'bg-[#365BEE] text-white'
                      : 'text-[#687386] dark:text-[#9BA5B8]'
                  }`}
                >
                  Newest
                </button>
              </div>
            </div>

            {solveError && (
              <p
                role="alert"
                className="px-3.5 py-2.5 rounded-xl bg-[#FF694F]/15 border border-[#FF694F]/40 text-xs text-[#C4422C] dark:text-[#FCA5A5]"
              >
                {solveError}
              </p>
            )}

            {sortedAnswers.length === 0 ? (
              <div
                className={`rounded-2xl border p-6 text-center space-y-1 ${
                  isDark
                    ? 'bg-[#1A1F2C] border-[#2C3448]'
                    : 'bg-white border-[#DFE5F0]'
                }`}
              >
                <p className="font-display font-semibold text-sm">No answers yet</p>
                <p className="text-xs text-[#687386] dark:text-[#9BA5B8]">
                  Share the first solution, diagram, or YouTube clip below.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedAnswers.map((answer) => {
                  const ansLiked = Boolean(likedAnswerIds[answer.id]);
                  const replies = repliesMap[answer.id] ?? [];
                  const repliesExpanded = Boolean(expandedReplies[answer.id]);
                  const replyCount = Math.max(answer.replyCount || 0, replies.length);

                  return (
                    <article
                      key={answer.id}
                      className={`p-5 rounded-2xl border space-y-3 ${
                        answer.isAccepted
                          ? isDark
                            ? 'bg-emerald-950/35 border-emerald-600/60'
                            : 'bg-emerald-50/70 border-emerald-400'
                          : isDark
                            ? 'bg-[#1A1F2C] border-[#2C3448]'
                            : 'bg-white border-[#DFE5F0]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            name={answer.authorName}
                            photoURL={answer.authorPhotoURL}
                            size="xs"
                          />
                          <span className="text-xs font-semibold">{answer.authorName}</span>
                          <span className="text-[11px] font-mono text-[#687386] dark:text-[#9BA5B8]">
                            · {answer.authorIsGuest ? 'Guest' : answer.authorBranch || 'Student'} ·{' '}
                            {formatRelativeTime(answer.createdAtMs)}
                          </span>
                        </div>

                        {answer.isAccepted && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-600 text-white text-[11px] font-mono font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Accepted by asker
                          </span>
                        )}
                      </div>

                      <p
                        className={`text-sm leading-relaxed whitespace-pre-wrap ${
                          isDark ? 'text-[#E2E8F0]' : 'text-[#1E293B]'
                        }`}
                      >
                        {answer.body}
                      </p>

                      {answer.attachments.length > 0 && (
                        <AttachmentRenderer attachments={answer.attachments} compact />
                      )}

                      <div className="pt-2.5 border-t border-[#DFE5F0] dark:border-[#2C3448] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            aria-pressed={ansLiked}
                            onClick={() => void onToggleAnswerLike(answer)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                              ansLiked
                                ? 'bg-[#FF694F]/15 text-[#FF694F] font-medium'
                                : 'text-[#687386] dark:text-[#9BA5B8] hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                          >
                            <Heart
                              className={`w-3.5 h-3.5 ${ansLiked ? 'fill-[#FF694F] text-[#FF694F]' : ''}`}
                            />
                            <span className="font-mono">{answer.likeCount}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleReplyBox(answer.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[#687386] dark:text-[#9BA5B8] hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Reply</span>
                            {replyCount > 0 && <span className="font-mono">({replyCount})</span>}
                          </button>

                          {replyCount > 0 && !repliesExpanded && (
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedReplies((prev) => ({ ...prev, [answer.id]: true }));
                                onLoadAnswerReplies(answer.id);
                              }}
                              className="text-[11px] font-medium text-[#365BEE] dark:text-[#7AA2FF] hover:underline"
                            >
                              View {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                            </button>
                          )}

                          {canAcceptSolution && question.status !== 'resolved' && (
                            <button
                              type="button"
                              disabled={solvingAnswerId === answer.id}
                              onClick={() => void handleSolveClick(answer)}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                {solvingAnswerId === answer.id
                                  ? 'Marking solved...'
                                  : 'Mark as Solved'}
                              </span>
                            </button>
                          )}
                        </div>

                        {!question.isDemo && (
                          <button
                            type="button"
                            onClick={() => onOpenReport('answer', answer.id, answer.body)}
                            className="inline-flex items-center gap-1 text-[11px] text-[#687386] dark:text-[#9BA5B8] hover:text-[#FF694F]"
                          >
                            <Flag className="w-3 h-3" />
                            <span>Report</span>
                          </button>
                        )}
                      </div>

                      {/* Threaded Replies */}
                      {(repliesExpanded || activeReplyAnswerId === answer.id) && (
                        <div className="pl-3.5 border-l-2 border-[#DFE5F0] dark:border-[#2C3448] space-y-2 pt-1">
                          {replies.map((rep) => (
                            <div key={rep.id} className="text-xs space-y-0.5">
                              <div className="flex items-center gap-1.5 text-[#687386] dark:text-[#9BA5B8]">
                                <CornerDownRight className="w-3 h-3 shrink-0" />
                                <span className="font-semibold text-[#172033] dark:text-[#F3F5FB]">
                                  {rep.authorName}
                                </span>
                                <span className="font-mono text-[10px]">
                                  · {formatRelativeTime(rep.createdAtMs)}
                                </span>
                              </div>
                              <p className="pl-4">{rep.body}</p>
                            </div>
                          ))}

                          {activeReplyAnswerId === answer.id && (
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                type="text"
                                value={replyDrafts[answer.id] ?? ''}
                                onChange={(e) =>
                                  setReplyDrafts((prev) => ({
                                    ...prev,
                                    [answer.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleSendReply(answer);
                                  }
                                }}
                                placeholder="Write a quick reply..."
                                aria-label="Reply to answer"
                                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-[#DFE5F0] dark:border-[#2C3448] bg-[#F5F5F0] dark:bg-[#12151E] focus:outline-none focus:border-[#365BEE]"
                              />
                              <button
                                type="button"
                                disabled={
                                  replySubmittingId === answer.id ||
                                  (replyDrafts[answer.id] ?? '').trim().length < 2
                                }
                                onClick={() => void handleSendReply(answer)}
                                className="px-3 py-1.5 text-xs font-medium bg-[#365BEE] text-white rounded-lg hover:bg-[#294AD4] disabled:opacity-50"
                              >
                                {replySubmittingId === answer.id ? '...' : 'Send'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {/* Answer Composer with Full Media Support */}
            <form
              onSubmit={handlePostAnswer}
              className={`rounded-2xl border p-5 space-y-3.5 ${
                isDark
                  ? 'bg-[#1A1F2C] border-[#2C3448]'
                  : 'bg-white border-[#DFE5F0]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display font-semibold text-base">
                  Contribute an Answer
                </h3>
                {!currentUser && !question.isDemo && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => void onSignInGuest()}
                      className="text-[#687386] dark:text-[#9BA5B8] hover:underline"
                    >
                      Guest mode
                    </button>
                    <button
                      type="button"
                      onClick={() => void onSignInGoogle()}
                      className="font-medium text-[#365BEE] dark:text-[#7AA2FF] hover:underline"
                    >
                      Sign in with Google
                    </button>
                  </div>
                )}
              </div>

              <textarea
                rows={4}
                value={newAnswerBody}
                onChange={(e) => setNewAnswerBody(e.target.value)}
                placeholder="Write a clear explanation, debugging steps, or code walkthrough..."
                aria-label="Answer body"
                className={`w-full rounded-xl border p-3.5 text-sm focus:outline-none focus:border-[#365BEE] resize-y ${
                  isDark
                    ? 'bg-[#12151E] border-[#2C3448] text-[#F3F5FB] placeholder:text-[#6B768B]'
                    : 'bg-[#F5F5F0]/70 border-[#DFE5F0] text-[#172033] placeholder:text-[#687386]'
                }`}
              />

              {stagedPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {stagedPhotos.map((p) => (
                    <div
                      key={p.id}
                      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#DFE5F0] dark:border-[#2C3448] text-xs"
                    >
                      <img
                        src={p.previewUrl}
                        alt={p.file.name}
                        className="w-7 h-7 rounded object-cover"
                      />
                      <span className="max-w-[120px] truncate">{p.file.name}</span>
                      <span className="font-mono text-[10px] opacity-70">
                        {formatFileSize(p.file.size)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${p.file.name}`}
                        onClick={() =>
                          setStagedPhotos((prev) => prev.filter((item) => item.id !== p.id))
                        }
                        className="text-[#687386] hover:text-[#FF694F]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <AttachmentComposer
                attachments={attachments}
                onChange={setAttachments}
                uid={currentUser?.uid ?? 'anonymous'}
                cloudinaryConfigured={integrations.cloudinaryConfigured}
                disabled={submitting}
                onOpenCamera={() => setCameraOpen(true)}
              />

              {answerError && (
                <p
                  role="alert"
                  className="text-xs text-[#C4422C] dark:text-[#FCA5A5] font-medium"
                >
                  {answerError}
                </p>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#365BEE] hover:bg-[#294AD4] text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'Posting...' : 'Post Answer'}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>

      <input
        ref={fallbackImageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleStageCameraFile(file);
        }}
      />

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onConfirmPhoto={handleStageCameraFile}
        onFallbackFileUpload={() => fallbackImageInputRef.current?.click()}
      />
    </>
  );
}

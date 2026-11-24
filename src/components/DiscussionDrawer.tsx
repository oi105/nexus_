import React from 'react';
import type { User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  CheckCircle2,
  CornerDownRight,
  Flag,
  Heart,
  MessageSquare,
  RefreshCw,
  Send,
  X,
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
  formatRelativeTime,
  sortAnswers,
} from '../utils/nexusLogic';
import { UserAvatar } from './NexusBrand';
import { NexusAiPanel } from './NexusAiPanel';
import { AttachmentComposer, AttachmentRenderer } from './RichAttachments';

interface DiscussionDrawerProps {
  open: boolean;
  question: Question | null;
  answers: Answer[];
  repliesMap: Record<string, AnswerReply[]>;
  isQuestionLiked: boolean;
  likedAnswerIds: Record<string, boolean>;
  currentUser: User | null;
  aiInsight: AiInsight | null;
  aiLoading: boolean;
  aiError: string | null;
  integrations: IntegrationStatus;
  onClose: () => void;
  onToggleQuestionLike: (question: Question) => void;
  onToggleAnswerLike: (answer: Answer) => void;
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

export function DiscussionDrawer({
  open,
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
}: DiscussionDrawerProps) {
  const [sortBy, setSortBy] = React.useState<'helpful' | 'newest'>('helpful');
  const [answerDraft, setAnswerDraft] = React.useState('');
  const [answerAttachments, setAnswerAttachments] = React.useState<RichAttachment[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [answerError, setAnswerError] = React.useState<string | null>(null);
  const [guestPromptError, setGuestPromptError] = React.useState<string | null>(null);
  const [solvingAnswerId, setSolvingAnswerId] = React.useState<string | null>(null);
  const [solveError, setSolveError] = React.useState<string | null>(null);
  const [retryingAssessment, setRetryingAssessment] = React.useState(false);

  const [activeReplyAnswerId, setActiveReplyAnswerId] = React.useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});
  const [replySubmittingId, setReplySubmittingId] = React.useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = React.useState<Record<string, boolean>>({});

  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setAnswerDraft('');
    setAnswerAttachments([]);
    setAnswerError(null);
    setSolveError(null);
    setGuestPromptError(null);
    setActiveReplyAnswerId(null);
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0;
    }
  }, [question?.id]);

  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const sortedAnswers = React.useMemo(
    () => sortAnswers(answers, sortBy),
    [answers, sortBy],
  );

  const isQuestionAuthor = Boolean(
    question &&
      currentUser &&
      !currentUser.isAnonymous &&
      currentUser.uid === question.authorId,
  );

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question) return;
    setAnswerError(null);
    const trimmed = answerDraft.trim();

    if (trimmed.length < 3 && answerAttachments.length === 0) {
      setAnswerError('Write an explanation or attach a helpful resource before posting.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitAnswer(
        trimmed || 'Shared an attachment.',
        answerAttachments,
      );
      setAnswerDraft('');
      setAnswerAttachments([]);
    } catch (err) {
      setAnswerError(err instanceof Error ? err.message : 'Unable to post answer.');
    } finally {
      setSubmitting(false);
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

  const handleSolveClick = async (answer: Answer) => {
    setSolveError(null);
    setSolvingAnswerId(answer.id);
    try {
      await onMarkAsSolved(answer);
    } catch (err) {
      setSolveError(
        err instanceof Error ? err.message : 'Unable to mark this doubt as solved.',
      );
    } finally {
      setSolvingAnswerId(null);
    }
  };

  const handleRetryAssessment = async () => {
    if (!question) return;
    setRetryingAssessment(true);
    try {
      await onRetryRewardAssessment(question);
    } finally {
      setRetryingAssessment(false);
    }
  };

  const rewardLabel = question ? formatAiRewardLabel(question) : '';
  const rewardReady = Boolean(
    question && question.assessmentStatus === 'completed' && question.assignedCredits > 0,
  );

  return (
    <AnimatePresence>
      {open && question && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Discussion for ${question.title}`}
          data-testid="discussion-drawer"
          className="fixed inset-0 z-50 flex justify-end items-end md:items-stretch"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#172033]/35 backdrop-blur-[1.5px]"
          />

          <motion.section
            initial={{ opacity: 0, x: 40, y: 24 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 32, y: 24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full md:w-[560px] lg:w-[620px] h-[92dvh] md:h-full bg-[#F5F5F0] md:border-l border-[#DFE5F0] rounded-t-[18px] md:rounded-none shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Mobile Drag Handle */}
            <div className="md:hidden pt-2.5 pb-1 bg-white flex justify-center shrink-0">
              <span className="w-10 h-1 rounded-full bg-[#DFE5F0]" aria-hidden="true" />
            </div>

            {/* Fixed Panel Header (No 15-minute session button) */}
            <header className="px-4 sm:px-5 py-3 bg-white border-b border-[#DFE5F0] flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-mono text-[#687386]">
                  <span className="text-[#365BEE] font-medium">{question.topic}</span>
                  <span aria-hidden="true">·</span>
                  <span>Discussion</span>
                  {question.isDemo && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Demo Data</span>
                    </>
                  )}
                </div>
                <p className="font-display font-semibold text-sm text-[#172033] truncate">
                  {question.title}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  aria-label="Report question"
                  onClick={() => onOpenReport('question', question.id, question.title)}
                  className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[#687386] hover:text-[#FF694F] hover:bg-[#F5F5F0] transition-colors"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  aria-label="Close discussion"
                  onClick={onClose}
                  className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[#687386] hover:text-[#172033] hover:bg-[#F5F5F0] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Scrollable Thread Content */}
            <div
              ref={scrollAreaRef}
              className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4"
            >
              {/* Question Context Card */}
              <article className="bg-white border border-[#DFE5F0] rounded-[12px] p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#687386]">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      name={question.authorName}
                      photoURL={question.authorPhotoURL}
                      size="sm"
                    />
                    <div>
                      <span className="font-medium text-[#172033]">
                        {question.authorName}
                      </span>
                      {question.authorBranch && (
                        <span className="ml-1.5 text-[#687386]">
                          · {question.authorBranch}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span>{formatRelativeTime(question.createdAtMs)}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        question.status === 'resolved'
                          ? 'text-[#2D6218] font-medium'
                          : 'text-[#172033] font-medium'
                      }
                    >
                      {question.status === 'resolved' ? 'Resolved' : 'Open'}
                    </span>
                  </div>
                </div>

                <h2 className="font-display font-semibold text-lg leading-snug text-[#172033]">
                  {question.title}
                </h2>

                <p className="text-[14px] leading-relaxed text-[#172033] whitespace-pre-wrap">
                  {question.description}
                </p>

                {question.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono text-[#687386]">
                    {question.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}

                {/* AI Reward Classification Strip */}
                <div className="p-3 rounded-[9px] bg-[#F5F5F0] border border-[#DFE5F0] space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-mono font-medium ${
                        rewardReady ? 'text-[#224414]' : 'text-[#687386]'
                      }`}
                    >
                      <Award className="w-3.5 h-3.5" />
                      <span>{rewardLabel}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      {!question.isDemo && !rewardReady && (
                        <button
                          type="button"
                          disabled={retryingAssessment}
                          onClick={() => void handleRetryAssessment()}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#365BEE] hover:underline disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${retryingAssessment ? 'animate-spin' : ''}`}
                          />
                          <span>{retryingAssessment ? 'Assessing...' : 'Retry AI assessment'}</span>
                        </button>
                      )}
                      {!question.isDemo && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenReport(
                              'reward',
                              question.id,
                              `${rewardLabel} — ${question.title}`,
                            )
                          }
                          className="text-[11px] text-[#687386] hover:text-[#FF694F]"
                        >
                          Report reward issue
                        </button>
                      )}
                    </div>
                  </div>

                  {question.difficultyReason && (
                    <p className="text-[11px] text-[#687386] leading-relaxed">
                      {question.difficultyReason}
                    </p>
                  )}
                </div>

                {question.attachments.length > 0 && (
                  <div className="pt-1">
                    <AttachmentRenderer attachments={question.attachments} compact />
                  </div>
                )}

                {/* NEXUS Like Action Row */}
                <div className="pt-3 border-t border-[#DFE5F0] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      aria-pressed={isQuestionLiked}
                      onClick={() => onToggleQuestionLike(question)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border text-xs font-medium transition-colors whitespace-nowrap ${
                        isQuestionLiked
                          ? 'bg-[#FF694F]/10 border-[#FF694F]/35 text-[#C4422C]'
                          : 'bg-white border-[#DFE5F0] text-[#172033] hover:border-[#FF694F]/50'
                      }`}
                    >
                      <motion.span
                        animate={{ scale: isQuestionLiked ? [1, 1.25, 1] : 1 }}
                        transition={{ duration: 0.25 }}
                        className="inline-flex"
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${
                            isQuestionLiked
                              ? 'fill-[#FF694F] text-[#FF694F]'
                              : 'text-[#687386]'
                          }`}
                        />
                      </motion.span>
                      <span>
                        {isQuestionLiked
                          ? 'You have this doubt too'
                          : 'I have this doubt too'}
                      </span>
                    </motion.button>

                    <span className="text-xs text-[#687386] whitespace-nowrap">
                      <span className="font-mono font-medium text-[#172033] tabular-nums">
                        {question.likeCount}
                      </span>{' '}
                      students have this doubt
                    </span>
                  </div>
                </div>
              </article>

              {/* Expandable NEXUS AI Panel */}
              <NexusAiPanel
                question={question}
                insight={aiInsight}
                loading={aiLoading}
                error={aiError}
                geminiConfigured={integrations.geminiConfigured}
                onRequestInsight={onRequestAiInsight}
              />

              {/* Community Answers Section */}
              <section aria-label="Community answers" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-semibold text-sm text-[#172033]">
                    Answers{' '}
                    <span className="font-mono font-normal text-[#687386] tabular-nums">
                      ({sortedAnswers.length})
                    </span>
                  </h3>

                  <div
                    role="tablist"
                    aria-label="Sort answers"
                    className="inline-flex items-center gap-1 p-0.5 bg-white border border-[#DFE5F0] rounded-[8px]"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={sortBy === 'helpful'}
                      onClick={() => setSortBy('helpful')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-[6px] transition-colors ${
                        sortBy === 'helpful'
                          ? 'bg-[#172033] text-white'
                          : 'text-[#687386] hover:text-[#172033]'
                      }`}
                    >
                      Most helpful
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={sortBy === 'newest'}
                      onClick={() => setSortBy('newest')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-[6px] transition-colors ${
                        sortBy === 'newest'
                          ? 'bg-[#172033] text-white'
                          : 'text-[#687386] hover:text-[#172033]'
                      }`}
                    >
                      Newest
                    </button>
                  </div>
                </div>

                {solveError && (
                  <p
                    role="alert"
                    className="px-3 py-2 rounded-[8px] bg-[#FF694F]/10 border border-[#FF694F]/30 text-xs text-[#C4422C]"
                  >
                    {solveError}
                  </p>
                )}

                {sortedAnswers.length === 0 ? (
                  <div className="bg-white border border-[#DFE5F0] rounded-[12px] p-5 text-center space-y-1">
                    <p className="font-display font-medium text-sm text-[#172033]">
                      No answers yet
                    </p>
                    <p className="text-xs text-[#687386]">
                      Add the first explanation, image, or reference link below.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {sortedAnswers.map((answer) => {
                      const ansLiked = Boolean(likedAnswerIds[answer.id]);
                      const replies = repliesMap[answer.id] ?? [];
                      const repliesExpanded = Boolean(expandedReplies[answer.id]);
                      const replyCount = Math.max(answer.replyCount || 0, replies.length);
                      const isSelfAnswer = answer.authorId === question.authorId;

                      return (
                        <article
                          key={answer.id}
                          className={`bg-white border rounded-[12px] p-4 space-y-2.5 ${
                            answer.isAccepted
                              ? 'border-[#89B724] ring-1 ring-[#C8ED62]/50'
                              : 'border-[#DFE5F0]'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#687386]">
                            <div className="flex items-center gap-2 min-w-0">
                              <UserAvatar
                                name={answer.authorName}
                                photoURL={answer.authorPhotoURL}
                                size="xs"
                              />
                              <span className="font-medium text-[#172033] truncate">
                                {answer.authorName}
                              </span>
                              <span className="font-mono text-[11px] truncate">
                                · {answer.authorIsGuest ? 'Guest' : answer.authorBranch || 'Student'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                              {answer.isAccepted && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#C8ED62] text-[#172033] font-semibold dark:bg-emerald-600 dark:text-white">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Solved Solution
                                </span>
                              )}
                              <span>{formatRelativeTime(answer.createdAtMs)}</span>
                            </div>
                          </div>

                          <p className="text-[14px] leading-relaxed text-[#172033] whitespace-pre-wrap">
                            {answer.body}
                          </p>

                          {answer.attachments.length > 0 && (
                            <AttachmentRenderer attachments={answer.attachments} compact />
                          )}

                          {/* Compact Answer Interactions */}
                          <div className="pt-2 border-t border-[#DFE5F0] flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.92 }}
                                aria-pressed={ansLiked}
                                onClick={() => onToggleAnswerLike(answer)}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-[7px] transition-colors ${
                                  ansLiked
                                    ? 'bg-[#FF694F]/10 text-[#C4422C] font-medium'
                                    : 'text-[#687386] hover:bg-[#F5F5F0] hover:text-[#172033]'
                                }`}
                              >
                                <Heart
                                  className={`w-3.5 h-3.5 ${
                                    ansLiked
                                      ? 'fill-[#FF694F] text-[#FF694F]'
                                      : 'text-[#687386]'
                                  }`}
                                />
                                <span className="font-mono tabular-nums">{answer.likeCount}</span>
                              </motion.button>

                              <button
                                type="button"
                                onClick={() => handleToggleReplyBox(answer.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-[7px] text-[#687386] hover:bg-[#F5F5F0] hover:text-[#172033] transition-colors"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Reply</span>
                                {replyCount > 0 && (
                                  <span className="font-mono tabular-nums">({replyCount})</span>
                                )}
                              </button>

                              {replyCount > 0 && !repliesExpanded && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedReplies((prev) => ({
                                      ...prev,
                                      [answer.id]: true,
                                    }));
                                    onLoadAnswerReplies(answer.id);
                                  }}
                                  className="text-[11px] font-medium text-[#365BEE] hover:underline"
                                >
                                  View {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                                </button>
                              )}

                              {isQuestionAuthor &&
                                !question.isDemo &&
                                question.status !== 'resolved' && (
                                  <button
                                    type="button"
                                    disabled={solvingAnswerId === answer.id}
                                    onClick={() => void handleSolveClick(answer)}
                                    title={
                                      isSelfAnswer
                                        ? 'Mark as solved (self-answers do not award solver credits)'
                                        : rewardReady
                                          ? `Mark as solved and award ${question.assignedCredits} credits`
                                          : 'Mark as solved'
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] bg-[#C8ED62]/45 text-[#172033] font-medium hover:bg-[#C8ED62]/70 dark:bg-emerald-950 dark:text-emerald-300 dark:border dark:border-emerald-700 dark:hover:bg-emerald-900 disabled:opacity-50 transition-colors"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-[#2D6218] dark:text-emerald-400" />
                                    <span>
                                      {solvingAnswerId === answer.id
                                        ? 'Marking solved...'
                                        : 'Mark as Solved'}
                                    </span>
                                  </button>
                                )}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                onOpenReport('answer', answer.id, answer.body)
                              }
                              className="inline-flex items-center gap-1 text-[11px] text-[#687386] hover:text-[#FF694F]"
                            >
                              <Flag className="w-3 h-3" />
                              <span>Report</span>
                            </button>
                          </div>

                          {/* Compact Inline Replies */}
                          {(repliesExpanded || activeReplyAnswerId === answer.id) && (
                            <div className="pl-3 border-l-2 border-[#DFE5F0] space-y-2 pt-1">
                              {replies.map((rep) => (
                                <div key={rep.id} className="text-xs space-y-0.5">
                                  <div className="flex items-center gap-1.5 text-[#687386]">
                                    <CornerDownRight className="w-3 h-3 text-[#687386] shrink-0" />
                                    <span className="font-medium text-[#172033]">
                                      {rep.authorName}
                                    </span>
                                    <span className="font-mono text-[10px]">
                                      · {formatRelativeTime(rep.createdAtMs)}
                                    </span>
                                  </div>
                                  <p className="pl-4 text-[#172033] leading-relaxed">
                                    {rep.body}
                                  </p>
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
                                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-[#F5F5F0]/70 border border-[#DFE5F0] rounded-[7px] focus:outline-none focus:border-[#365BEE] focus:bg-white"
                                  />
                                  <button
                                    type="button"
                                    aria-label="Send reply"
                                    disabled={
                                      replySubmittingId === answer.id ||
                                      (replyDrafts[answer.id] ?? '').trim().length < 2
                                    }
                                    onClick={() => void handleSendReply(answer)}
                                    className="px-2.5 py-1.5 text-xs font-medium bg-[#365BEE] text-white rounded-[7px] hover:bg-[#294AD4] disabled:opacity-50"
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
              </section>
            </div>

            {/* Fixed Bottom Answer Composer */}
            <form
              onSubmit={handleAnswerSubmit}
              className="px-4 sm:px-5 py-3 bg-white border-t border-[#DFE5F0] space-y-2.5 shrink-0"
            >
              <AttachmentComposer
                attachments={answerAttachments}
                onChange={setAnswerAttachments}
                uid={currentUser?.uid ?? 'guest'}
                cloudinaryConfigured={integrations.cloudinaryConfigured}
                compact
                disabled={submitting}
              />

              {answerError && (
                <p role="alert" className="text-xs text-[#C4422C]">
                  {answerError}
                </p>
              )}
              {guestPromptError && (
                <p role="alert" className="text-xs text-[#C4422C]">
                  {guestPromptError}
                </p>
              )}

              <div className="flex items-end gap-2">
                <textarea
                  id="drawer-answer-composer"
                  rows={2}
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                  placeholder="Write an answer, debugging step, or explanation..."
                  aria-label="Answer body"
                  className="flex-1 min-w-0 px-3 py-2 text-sm text-[#172033] bg-[#F5F5F0]/70 border border-[#DFE5F0] rounded-[9px] focus:outline-none focus:border-[#365BEE] focus:bg-white resize-none"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3.5 py-2.5 text-xs font-medium bg-[#365BEE] text-white rounded-[9px] hover:bg-[#294AD4] disabled:opacity-60 inline-flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Posting...' : 'Post'}</span>
                </button>
              </div>

              {!currentUser && !question.isDemo && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#687386]">
                  <span>Guest participation supported · or sign in to earn verified credits</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setGuestPromptError(null);
                        const res = await onSignInGuest();
                        if (!res.ok && res.error) setGuestPromptError(res.error);
                      }}
                      className="font-medium text-[#172033] hover:underline"
                    >
                      Continue as Guest
                    </button>
                    <button
                      type="button"
                      onClick={() => void onSignInGoogle()}
                      className="font-medium text-[#365BEE] hover:underline"
                    >
                      Sign in with Google
                    </button>
                  </div>
                </div>
              )}
            </form>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}

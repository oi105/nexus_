import React from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  AdminMessage,
  Answer,
  CreditTransaction,
  PersonalMailActivityResponse,
  Question,
  UserProfile,
} from '../types/nexus';
import {
  buildMailDigestContent,
  computeVaultStats,
  DIFFICULTY_LABELS,
  formatRelativeTime,
  summarizeUploadedDoubtResponses,
} from '../utils/nexusLogic';
import {
  fetchPersonalMailActivity,
  sendPersonalMailAlert,
} from '../services/nexusService';

type ActivityFilter =
  | 'my_questions'
  | 'personal_mail'
  | 'my_answers'
  | 'solved_credits'
  | 'messages';

interface EmailDraftModalState {
  to: string;
  subject: string;
  body: string;
}

interface ActivityViewProps {
  currentUser: User | null;
  profile: UserProfile | null;
  questions: Question[];
  uploadedDoubtAnswersMap: Record<string, Answer[]>;
  myAnswers: Answer[];
  creditTransactions: CreditTransaction[];
  adminMessages: AdminMessage[];
  hasGmailAccess: boolean;
  onConnectGmail: () => Promise<boolean>;
  onRefreshGmailState: () => void;
  onOpenQuestion: (q: Question) => void;
  onOpenAskDoubt: () => void;
  onMarkMessageRead: (messageId: string) => Promise<void>;
  onSignInGoogle: () => Promise<void>;
}

export function ActivityView({
  currentUser,
  profile,
  questions,
  uploadedDoubtAnswersMap,
  myAnswers,
  creditTransactions,
  adminMessages,
  hasGmailAccess,
  onConnectGmail,
  onRefreshGmailState,
  onOpenQuestion,
  onOpenAskDoubt,
  onMarkMessageRead,
  onSignInGoogle,
}: ActivityViewProps) {
  const [filter, setFilter] = React.useState<ActivityFilter>('my_questions');
  const [expandedDoubts, setExpandedDoubts] = React.useState<Record<string, boolean>>({});

  // Personal Gmail state (in-memory session only)
  const [mailLoading, setMailLoading] = React.useState(false);
  const [mailError, setMailError] = React.useState<string | null>(null);
  const [mailData, setMailData] = React.useState<PersonalMailActivityResponse | null>(null);
  const [notifyOnResponses, setNotifyOnResponses] = React.useState(true);
  const [notifyOnResolved, setNotifyOnResolved] = React.useState(true);

  // Explicit confirmation modal before ANY Gmail send
  const [emailConfirmDraft, setEmailConfirmDraft] =
    React.useState<EmailDraftModalState | null>(null);
  const [sendingEmail, setSendingEmail] = React.useState(false);
  const [emailSendStatus, setEmailSendStatus] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const uid = currentUser?.uid ?? '';
  const isVerifiedGoogle = Boolean(currentUser && !currentUser.isAnonymous);

  const myQuestions = React.useMemo(
    () => questions.filter((q) => !q.isDemo && q.authorId === uid),
    [questions, uid],
  );
  const myTransactions = React.useMemo(
    () => creditTransactions.filter((tx) => tx.userId === uid),
    [creditTransactions, uid],
  );

  const doubtSummary = React.useMemo(
    () => summarizeUploadedDoubtResponses(myQuestions, uploadedDoubtAnswersMap),
    [myQuestions, uploadedDoubtAnswersMap],
  );
  const vault = React.useMemo(
    () => computeVaultStats(creditTransactions, uid || undefined),
    [creditTransactions, uid],
  );

  const unreadCount = adminMessages.filter((m) => !m.isRead).length;

  const loadMailActivity = React.useCallback(async () => {
    setMailLoading(true);
    setMailError(null);
    try {
      const res = await fetchPersonalMailActivity();
      setMailData(res);
    } catch (err) {
      setMailError(err instanceof Error ? err.message : 'Unable to load Gmail activity.');
      setMailData(null);
      onRefreshGmailState();
    } finally {
      setMailLoading(false);
    }
  }, [onRefreshGmailState]);

  React.useEffect(() => {
    if (filter === 'personal_mail' && hasGmailAccess && !mailData && !mailLoading) {
      void loadMailActivity();
    }
  }, [filter, hasGmailAccess, mailData, mailLoading, loadMailActivity]);

  React.useEffect(() => {
    if (!hasGmailAccess) {
      setMailData(null);
    }
  }, [hasGmailAccess]);

  const handleConnectGmailClick = async () => {
    setMailError(null);
    try {
      const granted = await onConnectGmail();
      if (granted) {
        await loadMailActivity();
      } else {
        setMailError(
          'Google sign-in succeeded, but Gmail permission was not granted. Click Connect Gmail and check the Gmail boxes.',
        );
      }
    } catch (err) {
      setMailError(err instanceof Error ? err.message : 'Gmail authorization cancelled.');
    }
  };

  const openDigestConfirm = (subset?: Question[]) => {
    setEmailSendStatus(null);
    const targetDoubts = subset && subset.length > 0 ? subset : myQuestions;
    const digest = buildMailDigestContent({
      recipientName: profile?.displayName || currentUser?.displayName || 'NEXUS Student',
      doubts: targetDoubts,
      answersByDoubt: uploadedDoubtAnswersMap,
    });
    setEmailConfirmDraft({
      to: mailData?.connectedEmail || currentUser?.email || '',
      subject: digest.subject,
      body: digest.body,
    });
  };

  const handleConfirmSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailConfirmDraft) return;
    setSendingEmail(true);
    setEmailSendStatus(null);
    try {
      if (!hasGmailAccess) {
        const granted = await onConnectGmail();
        if (!granted) {
          throw new Error('Gmail send permission is required before sending.');
        }
      }
      await sendPersonalMailAlert({
        to: emailConfirmDraft.to,
        subject: emailConfirmDraft.subject,
        body: emailConfirmDraft.body,
        confirmed: true,
      });
      setEmailSendStatus({
        type: 'success',
        text: `Email delivered to ${emailConfirmDraft.to} via Gmail.`,
      });
      setEmailConfirmDraft(null);
      if (hasGmailAccess) {
        void loadMailActivity();
      }
    } catch (err) {
      setEmailSendStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send email.',
      });
      onRefreshGmailState();
    } finally {
      setSendingEmail(false);
    }
  };

  const filters: { id: ActivityFilter; label: string }[] = [
    { id: 'my_questions', label: `Uploaded Doubts (${myQuestions.length})` },
    {
      id: 'personal_mail',
      label: hasGmailAccess ? 'Personal Mail (Connected)' : 'Personal Mail',
    },
    { id: 'my_answers', label: `My Answers (${myAnswers.length})` },
    { id: 'solved_credits', label: `Credits (${myTransactions.length})` },
    {
      id: 'messages',
      label:
        unreadCount > 0
          ? `Admin (${unreadCount} new)`
          : `Admin (${adminMessages.length})`,
    },
  ];

  return (
    <div className="space-y-5">
      <header className="pt-1 pb-3 border-b border-[#DFE5F0] dark:border-white/15 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#EF233C] font-semibold">
            Personal Doubt & Mail Hub
          </p>
          <h1 className="font-display font-extrabold text-2xl text-[#172033] dark:text-white">
            Uploaded Doubts & Mail Activity
          </h1>
          <p className="mt-1 text-sm text-[#687386] dark:text-[#A3AFC8]">
            Monitor responses on doubts you uploaded, sync your personal Gmail inbox, and dispatch confirmed email updates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFilter('personal_mail');
            if (isVerifiedGoogle) {
              openDigestConfirm();
            }
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-[#EF233C] hover:bg-[#DC2626] text-white rounded-[9px] shadow-sm transition-colors shrink-0"
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Email Doubt Digest</span>
        </button>
      </header>

      {/* Live Dashboard KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-3.5">
          <p className="text-[11px] font-mono text-[#687386] dark:text-[#A3AFC8]">
            UPLOADED DOUBTS
          </p>
          <p className="mt-1 font-display font-bold text-xl text-[#172033] dark:text-white tabular-nums">
            {doubtSummary.totalDoubts}
          </p>
          <p className="text-[11px] text-[#687386] dark:text-[#A3AFC8]">
            {doubtSummary.openDoubts} open · {doubtSummary.resolvedDoubts} solved
          </p>
        </div>

        <div className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-3.5">
          <p className="text-[11px] font-mono text-[#687386] dark:text-[#A3AFC8]">
            PEER RESPONSES
          </p>
          <p className="mt-1 font-display font-bold text-xl text-[#EF233C] tabular-nums">
            {doubtSummary.totalIncomingResponses}
          </p>
          <p className="text-[11px] text-[#687386] dark:text-[#A3AFC8]">
            {doubtSummary.unansweredDoubts} awaiting reply
          </p>
        </div>

        <div className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-3.5">
          <p className="text-[11px] font-mono text-[#687386] dark:text-[#A3AFC8]">
            SOLVER CREDITS
          </p>
          <p className="mt-1 font-display font-bold text-xl text-emerald-700 dark:text-emerald-400 tabular-nums">
            {vault.verifiedCredits}
          </p>
          <p className="text-[11px] text-[#687386] dark:text-[#A3AFC8]">
            {vault.solvedCount} solutions accepted
          </p>
        </div>

        <div className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-3.5">
          <p className="text-[11px] font-mono text-[#687386] dark:text-[#A3AFC8]">
            GMAIL ALERTS
          </p>
          <p className="mt-1 font-display font-bold text-sm text-[#172033] dark:text-white truncate">
            {hasGmailAccess
              ? mailData?.connectedEmail || currentUser?.email || 'Connected'
              : 'Not Linked'}
          </p>
          <button
            type="button"
            onClick={() => setFilter('personal_mail')}
            className="mt-0.5 text-[11px] font-semibold text-[#DC2626] dark:text-[#FCA5A5] hover:underline"
          >
            {hasGmailAccess ? 'Open mail feed →' : 'Connect Gmail →'}
          </button>
        </div>
      </div>

      {!isVerifiedGoogle && (
        <div className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#172033] dark:text-white">
              Sign in with Google to view your uploaded doubts & personal Gmail activity
            </p>
            <p className="text-xs text-[#687386] dark:text-[#A3AFC8]">
              Connect your Google account to sync uploaded doubts, peer replies, and Gmail response alerts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onSignInGoogle()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white dark:bg-[#131620] text-[#090B10] dark:text-white border border-[#CBD5E1] dark:border-white/20 rounded-[8px] hover:border-[#EF233C] shadow-sm transition-colors"
          >
            <GoogleColorIcon />
            <span>Sign in with Google</span>
          </button>
        </div>
      )}

      {emailSendStatus && (
        <div
          role="status"
          className={`px-4 py-3 rounded-[10px] border text-xs flex items-center justify-between gap-2 ${
            emailSendStatus.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
              : 'bg-[#EF233C]/10 border-[#EF233C]/40 text-[#C4422C] dark:text-[#FCA5A5]'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {emailSendStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{emailSendStatus.text}</span>
          </span>
          <button
            type="button"
            aria-label="Dismiss email notification status"
            onClick={() => setEmailSendStatus(null)}
            className="p-1 opacity-70 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter Strip */}
      <div
        role="tablist"
        aria-label="Activity dashboard tabs"
        className="flex flex-wrap items-center gap-1.5 p-1 bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[10px]"
      >
        {filters.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-[7px] transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#172033] dark:bg-[#EF233C] text-white'
                  : 'text-[#687386] dark:text-[#A3AFC8] hover:text-[#172033] dark:hover:text-white'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Uploaded Doubts & Live Peer Responses */}
      {filter === 'my_questions' && (
        <div className="space-y-3">
          {myQuestions.length === 0 ? (
            <EmptyBlock
              title="You have not uploaded any doubts yet"
              subtitle="Ask a doubt with an image, diagram, PDF, or YouTube timestamp to track peer solutions and email alerts here."
              ctaLabel="Ask a Doubt"
              onCta={onOpenAskDoubt}
            />
          ) : (
            myQuestions.map((q) => {
              const answers = uploadedDoubtAnswersMap[q.id] ?? [];
              const totalReplies = Math.max(q.answerCount || 0, answers.length);
              const isExpanded = Boolean(expandedDoubts[q.id]);
              const imageAtt = q.attachments.find((a) => a.type === 'image');

              return (
                <article
                  key={q.id}
                  className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {imageAtt && (
                        <img
                          src={imageAtt.secureUrl}
                          alt={imageAtt.fileName}
                          className="w-12 h-12 rounded-[8px] object-cover border border-[#DFE5F0] dark:border-white/15 shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#687386] dark:text-[#A3AFC8]">
                          <span className="font-semibold text-[#EF233C]">{q.topic}</span>
                          <span>·</span>
                          <span
                            className={
                              q.status === 'resolved'
                                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                : 'text-[#172033] dark:text-white font-semibold'
                            }
                          >
                            {q.status === 'resolved' ? 'Resolved' : 'Open'}
                          </span>
                          <span>·</span>
                          <span>{totalReplies} peer {totalReplies === 1 ? 'response' : 'responses'}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(q.createdAtMs)}</span>
                        </div>
                        <h3 className="mt-1 font-display font-semibold text-sm text-[#172033] dark:text-white">
                          {q.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openDigestConfirm([q])}
                        title="Email update for this doubt"
                        aria-label={`Email update for ${q.title}`}
                        className="p-2 rounded-[8px] border border-[#DFE5F0] dark:border-white/15 text-[#687386] dark:text-[#A3AFC8] hover:border-[#EF233C] hover:text-[#EF233C] transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenQuestion(q)}
                        className="px-3 py-1.5 text-xs font-semibold border border-[#DFE5F0] dark:border-white/15 rounded-[8px] hover:border-[#EF233C] text-[#365BEE] dark:text-[#FCA5A5] transition-colors"
                      >
                        Open Thread
                      </button>
                    </div>
                  </div>

                  {/* Live Incoming Peer Responses Toggle */}
                  <div className="pt-2 border-t border-[#DFE5F0] dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDoubts((prev) => ({
                          ...prev,
                          [q.id]: !prev[q.id],
                        }))
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] hover:text-[#EF233C]"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#EF233C]" />
                      <span>
                        {answers.length > 0
                          ? `Inspect ${answers.length} incoming ${answers.length === 1 ? 'response' : 'responses'}`
                          : totalReplies > 0
                            ? `${totalReplies} responses (open thread to inspect)`
                            : 'No peer responses yet'}
                      </span>
                      {answers.length > 0 &&
                        (isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ))}
                    </button>

                    {q.assignedCredits > 0 && (
                      <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                        +{q.assignedCredits} credit bounty
                      </span>
                    )}
                  </div>

                  {isExpanded && answers.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {answers.map((ans) => (
                        <div
                          key={ans.id}
                          className="p-3 rounded-[9px] bg-[#F5F5F0] dark:bg-[#131620] border border-[#DFE5F0] dark:border-white/10 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#172033] dark:text-white">
                              {ans.authorName}
                              {ans.isAccepted && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-mono">
                                  Solved
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[10px] text-[#687386] dark:text-[#A3AFC8]">
                              {formatRelativeTime(ans.createdAtMs)}
                            </span>
                          </div>
                          <p className="text-[#3F4A5F] dark:text-[#CBD5E1] line-clamp-3 leading-relaxed">
                            {ans.body}
                          </p>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono text-[#687386] dark:text-[#A3AFC8]">
                              ♥ {ans.likeCount} · {ans.replyCount || 0} replies
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpenQuestion(q)}
                              className="font-semibold text-[#EF233C] hover:underline"
                            >
                              Reply in thread →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Personal Mail & Gmail Activity */}
      {filter === 'personal_mail' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-[#EF233C]" />
                  <h2 className="font-display font-bold text-base text-[#172033] dark:text-white">
                    Personal Gmail Account & Alert Controls
                  </h2>
                </div>
                <p className="text-xs text-[#687386] dark:text-[#A3AFC8]">
                  {hasGmailAccess
                    ? `Active Gmail session for ${mailData?.connectedEmail || currentUser?.email || 'your Google account'}. Tokens remain strictly in-memory for this session.`
                    : 'Authorize read & send access to view recent personal mail activity and send confirmed doubt alerts to your inbox.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!hasGmailAccess ? (
                  <button
                    type="button"
                    onClick={() => void handleConnectGmailClick()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white dark:bg-[#131620] text-[#090B10] dark:text-white border border-[#CBD5E1] dark:border-white/20 rounded-[8px] hover:border-[#EF233C] shadow-sm transition-colors"
                  >
                    <GoogleColorIcon />
                    <span>Connect Personal Gmail</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={mailLoading}
                      onClick={() => void loadMailActivity()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#DFE5F0] dark:border-white/15 rounded-[8px] text-[#172033] dark:text-white hover:border-[#EF233C] disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${mailLoading ? 'animate-spin' : ''}`}
                      />
                      <span>Refresh Mail</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openDigestConfirm()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#EF233C] hover:bg-[#DC2626] text-white rounded-[8px]"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Compose / Send Digest</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Alert Preferences */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#DFE5F0] dark:border-white/10">
              <label className="flex items-start gap-2.5 p-3 rounded-[9px] bg-[#F5F5F0] dark:bg-[#131620] border border-[#DFE5F0] dark:border-white/10 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={notifyOnResponses}
                  onChange={(e) => setNotifyOnResponses(e.target.checked)}
                  className="mt-0.5 rounded border-[#CBD5E1] text-[#EF233C] focus:ring-[#EF233C]"
                />
                <div>
                  <span className="font-semibold text-[#172033] dark:text-white inline-flex items-center gap-1">
                    <Bell className="w-3 h-3 text-[#EF233C]" />
                    Include new peer responses in digests
                  </span>
                  <p className="text-[#687386] dark:text-[#A3AFC8] mt-0.5">
                    Summarizes recent answers and reply counts across your uploaded doubts.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-[9px] bg-[#F5F5F0] dark:bg-[#131620] border border-[#DFE5F0] dark:border-white/10 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={notifyOnResolved}
                  onChange={(e) => setNotifyOnResolved(e.target.checked)}
                  className="mt-0.5 rounded border-[#CBD5E1] text-[#EF233C] focus:ring-[#EF233C]"
                />
                <div>
                  <span className="font-semibold text-[#172033] dark:text-white inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                    Include solved credit payouts
                  </span>
                  <p className="text-[#687386] dark:text-[#A3AFC8] mt-0.5">
                    Always previews the message for your confirmation before sending.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {mailError && (
            <div
              role="alert"
              className="p-3.5 rounded-[10px] bg-[#EF233C]/10 border border-[#EF233C]/40 text-xs text-[#C4422C] dark:text-[#FCA5A5] flex flex-wrap items-center justify-between gap-2"
            >
              <span className="inline-flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{mailError}</span>
              </span>
              <button
                type="button"
                onClick={() => void handleConnectGmailClick()}
                className="px-3 py-1 rounded-[7px] bg-[#EF233C] text-white font-semibold"
              >
                Reconnect Gmail
              </button>
            </div>
          )}

          {mailLoading && (
            <div className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-8 flex items-center justify-center gap-2 text-xs text-[#687386] dark:text-[#A3AFC8]">
              <Loader2 className="w-4 h-4 animate-spin text-[#EF233C]" />
              <span>Fetching recent personal mail activity...</span>
            </div>
          )}

          {hasGmailAccess && mailData && !mailLoading && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono text-[#687386] dark:text-[#A3AFC8] px-1">
                <span>RECENT PERSONAL MAIL ({mailData.messages.length})</span>
                <span>Total mailbox threads: {mailData.messagesTotal}</span>
              </div>

              {mailData.messages.length === 0 ? (
                <EmptyBlock
                  title="No recent messages returned"
                  subtitle="Your connected Gmail account has no recent messages in the primary query."
                />
              ) : (
                mailData.messages.map((msg) => (
                  <article
                    key={msg.id}
                    className={`bg-white dark:bg-[#0B0D14] border rounded-[12px] p-4 space-y-1.5 ${
                      msg.unread
                        ? 'border-[#EF233C]/60'
                        : 'border-[#DFE5F0] dark:border-white/15'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#687386] dark:text-[#A3AFC8]">
                      <span className="truncate font-semibold text-[#172033] dark:text-white max-w-[320px]">
                        {msg.from || 'Unknown sender'}
                      </span>
                      <div className="flex items-center gap-2">
                        {msg.unread && (
                          <span className="px-1.5 py-0.5 rounded bg-[#EF233C] text-white text-[10px] font-bold">
                            UNREAD
                          </span>
                        )}
                        <span>{msg.date ? msg.date.slice(0, 22) : ''}</span>
                      </div>
                    </div>
                    <h3 className="font-display font-semibold text-sm text-[#172033] dark:text-white">
                      {msg.subject}
                    </h3>
                    <p className="text-xs text-[#687386] dark:text-[#A3AFC8] line-clamp-2 leading-relaxed">
                      {msg.snippet}
                    </p>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: My Answers */}
      {filter === 'my_answers' && (
        <div className="space-y-3">
          {myAnswers.length === 0 ? (
            <EmptyBlock
              title="No answers submitted in this session"
              subtitle="Browse the Doubt Library and help unblock a peer's question."
            />
          ) : (
            myAnswers.map((ans) => {
              const parent = questions.find((q) => q.id === ans.questionId);
              return (
                <div
                  key={ans.id}
                  className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-[#687386] dark:text-[#A3AFC8]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#172033] dark:text-white">
                      <MessageSquare className="w-3.5 h-3.5 text-[#EF233C]" />
                      {parent ? parent.title : 'Discussion reply'}
                    </span>
                    <span className="font-mono">{formatRelativeTime(ans.createdAtMs)}</span>
                  </div>
                  <p className="text-sm text-[#687386] dark:text-[#A3AFC8] line-clamp-2">
                    {ans.body}
                  </p>
                  {parent && (
                    <button
                      type="button"
                      onClick={() => onOpenQuestion(parent)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#365BEE] dark:text-[#FCA5A5] hover:underline"
                    >
                      Open thread <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 4: Solved & Verified Credit Transactions */}
      {filter === 'solved_credits' && (
        <div className="space-y-3">
          {myTransactions.length === 0 ? (
            <EmptyBlock
              title="No verified credit payouts yet"
              subtitle="When a doubt author clicks Mark as Solved on your answer, your AI-assessed credit reward is permanently logged here."
            />
          ) : (
            myTransactions.map((tx) => {
              const parent = questions.find((q) => q.id === tx.doubtId);
              return (
                <div
                  key={tx.id}
                  className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#687386] dark:text-[#A3AFC8]">
                      <span className="inline-flex items-center gap-1 text-[#224414] dark:text-emerald-300 font-semibold">
                        <Award className="w-3.5 h-3.5 text-[#3F7F24] dark:text-emerald-400" />
                        +{tx.credits} credits
                      </span>
                      <span>·</span>
                      <span>{DIFFICULTY_LABELS[tx.difficultyTier] ?? tx.difficultyTier}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(tx.createdAtMs)}</span>
                    </div>
                    <h3 className="font-display font-medium text-sm text-[#172033] dark:text-white truncate">
                      {tx.doubtTitle}
                    </h3>
                  </div>

                  {parent && (
                    <button
                      type="button"
                      onClick={() => onOpenQuestion(parent)}
                      className="px-3 py-1.5 text-xs font-medium border border-[#DFE5F0] dark:border-white/15 rounded-[8px] hover:border-[#EF233C] text-[#365BEE] dark:text-[#FCA5A5] shrink-0"
                    >
                      View doubt
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 5: Admin Messages */}
      {filter === 'messages' && (
        <div className="space-y-3">
          {adminMessages.length === 0 ? (
            <EmptyBlock
              title="No administrator messages"
              subtitle="Direct messages or community announcements from NEXUS administrators appear here."
            />
          ) : (
            adminMessages.map((msg) => {
              const relatedQuestion = msg.relatedDoubtId
                ? questions.find((q) => q.id === msg.relatedDoubtId)
                : undefined;
              return (
                <article
                  key={msg.id}
                  className={`bg-white dark:bg-[#0B0D14] border rounded-[12px] p-4 space-y-2 ${
                    !msg.isRead && msg.recipientId === uid
                      ? 'border-[#EF233C]'
                      : 'border-[#DFE5F0] dark:border-white/15'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#687386] dark:text-[#A3AFC8]">
                    <span className="inline-flex items-center gap-1.5 text-[#172033] dark:text-white font-medium">
                      <Mail className="w-3.5 h-3.5 text-[#EF233C]" />
                      {msg.senderName}
                      {msg.recipientId === 'ALL' && (
                        <span className="px-1.5 py-0.5 rounded bg-[#F5F5F0] dark:bg-[#131620] text-[10px]">
                          Announcement
                        </span>
                      )}
                    </span>
                    <span>{formatRelativeTime(msg.createdAtMs)}</span>
                  </div>

                  <h3 className="font-display font-semibold text-sm text-[#172033] dark:text-white">
                    {msg.subject}
                  </h3>
                  <p className="text-xs leading-relaxed text-[#687386] dark:text-[#A3AFC8] whitespace-pre-wrap">
                    {msg.body}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {relatedQuestion && (
                      <button
                        type="button"
                        onClick={() => onOpenQuestion(relatedQuestion)}
                        className="text-xs font-medium text-[#365BEE] dark:text-[#FCA5A5] hover:underline"
                      >
                        Open related doubt
                      </button>
                    )}
                    {!msg.isRead && msg.recipientId === uid && (
                      <button
                        type="button"
                        onClick={() => void onMarkMessageRead(msg.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-[#DFE5F0] dark:border-white/15 rounded-[7px] text-[#172033] dark:text-white hover:bg-[#F5F5F0] dark:hover:bg-white/10"
                      >
                        <Check className="w-3 h-3" />
                        Mark read
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Mandatory Explicit Confirmation Modal before sending any Gmail message */}
      {emailConfirmDraft && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-mail-send-title"
          className="fixed inset-0 z-[70] bg-[#090B10]/60 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleConfirmSendEmail}
            className="w-full max-w-lg bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/20 rounded-[14px] shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#DFE5F0] dark:border-white/15 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#EF233C]" />
                <h2
                  id="confirm-mail-send-title"
                  className="font-display font-bold text-base text-[#172033] dark:text-white"
                >
                  Confirm & Send Email Notification
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close email confirmation"
                onClick={() => setEmailConfirmDraft(null)}
                className="p-1.5 rounded-[7px] text-[#687386] hover:text-[#EF233C]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <p className="text-[#687386] dark:text-[#A3AFC8]">
                Review the recipient and content below. NEXUS never sends emails without your explicit confirmation.
              </p>

              <div>
                <label
                  htmlFor="mail-recipient"
                  className="block font-semibold text-[#172033] dark:text-white mb-1"
                >
                  Recipient Email
                </label>
                <input
                  id="mail-recipient"
                  type="email"
                  required
                  value={emailConfirmDraft.to}
                  onChange={(e) =>
                    setEmailConfirmDraft((prev) =>
                      prev ? { ...prev, to: e.target.value } : prev,
                    )
                  }
                  placeholder="you@gmail.com"
                  className="w-full px-3 py-2 border border-[#DFE5F0] dark:border-white/15 rounded-[8px] bg-[#F8FAFC] dark:bg-[#131620] text-[#172033] dark:text-white focus:outline-none focus:border-[#EF233C]"
                />
              </div>

              <div>
                <label
                  htmlFor="mail-subject"
                  className="block font-semibold text-[#172033] dark:text-white mb-1"
                >
                  Subject
                </label>
                <input
                  id="mail-subject"
                  type="text"
                  required
                  value={emailConfirmDraft.subject}
                  onChange={(e) =>
                    setEmailConfirmDraft((prev) =>
                      prev ? { ...prev, subject: e.target.value } : prev,
                    )
                  }
                  className="w-full px-3 py-2 border border-[#DFE5F0] dark:border-white/15 rounded-[8px] bg-[#F8FAFC] dark:bg-[#131620] text-[#172033] dark:text-white focus:outline-none focus:border-[#EF233C]"
                />
              </div>

              <div>
                <label
                  htmlFor="mail-body"
                  className="block font-semibold text-[#172033] dark:text-white mb-1"
                >
                  Message Preview
                </label>
                <textarea
                  id="mail-body"
                  rows={7}
                  required
                  value={emailConfirmDraft.body}
                  onChange={(e) =>
                    setEmailConfirmDraft((prev) =>
                      prev ? { ...prev, body: e.target.value } : prev,
                    )
                  }
                  className="w-full px-3 py-2 border border-[#DFE5F0] dark:border-white/15 rounded-[8px] bg-[#F8FAFC] dark:bg-[#131620] text-[#172033] dark:text-white focus:outline-none focus:border-[#EF233C] font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-[#DFE5F0] dark:border-white/15 flex items-center justify-end gap-2.5 bg-[#F8FAFC] dark:bg-[#131620]">
              <button
                type="button"
                onClick={() => setEmailConfirmDraft(null)}
                className="px-4 py-2 text-xs font-semibold text-[#687386] dark:text-[#A3AFC8] hover:text-[#172033] dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendingEmail}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#EF233C] hover:bg-[#DC2626] text-white rounded-[8px] disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingEmail ? 'Sending...' : 'Confirm & Send Email'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function EmptyBlock({
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <div className="bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[12px] p-7 text-center space-y-2">
      <p className="font-display font-medium text-sm text-[#172033] dark:text-white">{title}</p>
      <p className="text-xs text-[#687386] dark:text-[#A3AFC8] max-w-md mx-auto">{subtitle}</p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-2 px-4 py-2 text-xs font-bold bg-[#EF233C] text-white rounded-[8px] hover:bg-[#DC2626]"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

function GoogleColorIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

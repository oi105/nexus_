import React from 'react';
import type { User } from 'firebase/auth';
import { Check, Lock, ShieldAlert, Trash2, UserCheck, UserX } from 'lucide-react';
import type {
  AdminMessage,
  CreditTransaction,
  DifficultyTier,
  ModerationReport,
  ModerationStatus,
  Question,
  RewardAdjustment,
  UserProfile,
} from '../types/nexus';
import { formatRelativeTime } from '../utils/nexusLogic';

interface AdminViewProps {
  currentUser: User | null;
  isAdmin: boolean;
  reports: ModerationReport[];
  users: UserProfile[];
  questions: Question[];
  creditTransactions: CreditTransaction[];
  rewardAdjustments: RewardAdjustment[];
  adminMessages: AdminMessage[];
  onSignInGoogle: () => Promise<void>;
  onResolveReport: (report: ModerationReport, action: 'dismissed' | 'actioned') => Promise<void>;
  onToggleSuspendUser: (userProfile: UserProfile) => Promise<void>;
  onSetQuestionVisibility: (questionId: string, moderationStatus: ModerationStatus, isPublic: boolean) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
  onAdjustReward: (question: Question, newTier: DifficultyTier, reason: string) => Promise<void>;
  onSendMessage: (recipientId: string, recipientName: string, subject: string, body: string, doubtId?: string) => Promise<void>;
}

type AdminTab = 'overview' | 'reports' | 'users' | 'questions';

export function AdminView({
  currentUser,
  isAdmin,
  reports,
  users,
  questions,
  creditTransactions: _creditTransactions,
  rewardAdjustments: _rewardAdjustments,
  adminMessages: _adminMessages,
  onSignInGoogle,
  onResolveReport,
  onToggleSuspendUser,
  onSetQuestionVisibility: _onSetQuestionVisibility,
  onDeleteQuestion,
  onAdjustReward: _onAdjustReward,
  onSendMessage: _onSendMessage,
}: AdminViewProps) {
  const [tab, setTab] = React.useState<AdminTab>('overview');

  if (!currentUser || !isAdmin) {
    return (
      <div className="bg-white border border-[#DFE5F0] rounded-[12px] p-7 space-y-3">
        <div className="flex items-center gap-2.5 text-[#FF694F]">
          <Lock className="w-5 h-5" />
          <h1 className="font-display font-semibold text-lg text-[#172033]">
            Protected Route · Administrator Access Required
          </h1>
        </div>
        <p className="text-sm text-[#687386] leading-relaxed">
          The NEXUS Control Centre enforces permissions through Firestore Security Rules. Only verified administrators listed in the server ruleset or <span className="font-mono">/admins</span> registry can read moderation reports or execute moderation actions.
        </p>
        {!currentUser && (
          <button
            type="button"
            onClick={() => void onSignInGoogle()}
            className="px-4 py-2 text-xs font-medium bg-[#365BEE] text-white rounded-[8px] hover:bg-[#294AD4]"
          >
            Sign in with Administrator Google Account
          </button>
        )}
      </div>
    );
  }

  const liveQuestions = questions.filter((q) => !q.isDemo);
  const liveUsers = users.filter((u) => !u.isDemo);
  const openReports = reports.filter((r) => r.status === 'open');
  const questionReports = reports.filter((r) => r.targetType === 'question');
  const answerReports = reports.filter((r) => r.targetType === 'answer');

  return (
    <div className="space-y-5">
      <header className="pt-1 pb-2 border-b border-[#DFE5F0] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-semibold text-2xl text-[#172033]">
            Admin Control Centre
          </h1>
          <p className="mt-1 text-sm text-[#687386]">
            Moderation, user governance, and live platform overview.
          </p>
        </div>
        <span className="font-mono text-xs px-2.5 py-1 rounded-[7px] bg-[#172033] text-white">
          Verified Admin
        </span>
      </header>

      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex flex-wrap gap-1.5 p-1 bg-white border border-[#DFE5F0] rounded-[10px]"
      >
        {(
          [
            ['overview', 'Overview'],
            ['reports', `Reports (${openReports.length})`],
            ['users', `Users (${liveUsers.length})`],
            ['questions', `Questions (${liveQuestions.length})`],
          ] as [AdminTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-[7px] transition-colors whitespace-nowrap ${
              tab === id
                ? 'bg-[#365BEE] text-white'
                : 'text-[#687386] hover:text-[#172033]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 bg-white border border-[#DFE5F0] rounded-[12px] divide-y sm:divide-y-0 sm:divide-x divide-[#DFE5F0]">
            <AdminMetric label="Live Questions" value={liveQuestions.length} />
            <AdminMetric label="Registered Users" value={liveUsers.length} />
            <AdminMetric label="Open Reports" value={openReports.length} />
            <AdminMetric
              label="Resolved Doubts"
              value={liveQuestions.filter((q) => q.status === 'resolved').length}
            />
          </div>

          <div className="bg-white border border-[#DFE5F0] rounded-[12px] p-5 space-y-2">
            <h2 className="font-display font-semibold text-sm text-[#172033]">
              Moderation Summary
            </h2>
            <p className="text-xs text-[#687386]">
              Reported questions: <span className="font-mono text-[#172033]">{questionReports.length}</span> · Reported answers:{' '}
              <span className="font-mono text-[#172033]">{answerReports.length}</span> · Suspended users:{' '}
              <span className="font-mono text-[#172033]">{liveUsers.filter((u) => u.isSuspended).length}</span>
            </p>
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="bg-white border border-[#DFE5F0] rounded-[12px] p-6 text-xs text-[#687386]">
              No reported questions or answers in the queue.
            </div>
          ) : (
            reports.map((rep) => (
              <div
                key={rep.id}
                className="bg-white border border-[#DFE5F0] rounded-[12px] p-4 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <span className="inline-flex items-center gap-1.5 text-[#FF694F] font-medium">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {rep.targetType.toUpperCase()} REPORT · {rep.status}
                  </span>
                  <span className="text-[#687386]">
                    {formatRelativeTime(rep.createdAtMs)}
                  </span>
                </div>
                <p className="text-sm font-medium text-[#172033]">{rep.targetPreview}</p>
                <p className="text-xs text-[#687386]">Reason: {rep.reason}</p>

                {rep.status === 'open' && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void onResolveReport(rep, 'dismissed')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-[#DFE5F0] rounded-[7px] hover:bg-[#F5F5F0]"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => void onResolveReport(rep, 'actioned')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#FF694F] text-white rounded-[7px] hover:bg-[#E7563E]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Content
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-white border border-[#DFE5F0] rounded-[12px] divide-y divide-[#DFE5F0]">
          {liveUsers.length === 0 ? (
            <p className="p-5 text-xs text-[#687386]">No registered users yet.</p>
          ) : (
            liveUsers.map((u) => (
              <div
                key={u.uid}
                className="p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-[#172033]">
                    {u.displayName}{' '}
                    {u.isSuspended && (
                      <span className="font-mono text-xs text-[#FF694F]">· Suspended</span>
                    )}
                  </p>
                  <p className="font-mono text-xs text-[#687386]">
                    {u.branch} · {u.reputation} rep · {u.contributions} contributions
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onToggleSuspendUser(u)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[8px] border ${
                    u.isSuspended
                      ? 'border-[#3F7F24] text-[#2D6218] hover:bg-[#C8ED62]/20'
                      : 'border-[#DFE5F0] text-[#FF694F] hover:bg-[#FF694F]/10'
                  }`}
                >
                  {u.isSuspended ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5" />
                      Restore
                    </>
                  ) : (
                    <>
                      <UserX className="w-3.5 h-3.5" />
                      Suspend
                    </>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'questions' && (
        <div className="bg-white border border-[#DFE5F0] rounded-[12px] divide-y divide-[#DFE5F0]">
          {liveQuestions.length === 0 ? (
            <p className="p-5 text-xs text-[#687386]">No live questions in Firestore yet.</p>
          ) : (
            liveQuestions.map((q) => (
              <div
                key={q.id}
                className="p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-[#687386]">
                    {q.topic} · {q.authorName} · {q.moderationStatus}
                  </p>
                  <p className="text-sm font-medium text-[#172033] truncate">
                    {q.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onDeleteQuestion(q.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#FF694F] border border-[#DFE5F0] rounded-[8px] hover:bg-[#FF694F]/10 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AdminMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4">
      <span className="block font-mono text-[11px] uppercase tracking-wider text-[#687386]">
        {label}
      </span>
      <span className="mt-1 block font-display font-semibold text-xl tabular-nums text-[#172033]">
        {value}
      </span>
    </div>
  );
}

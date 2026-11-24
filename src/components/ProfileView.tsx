import React from 'react';
import type { User } from 'firebase/auth';
import { Award, Check, Edit3, Plus, ShieldCheck, Vault, X } from 'lucide-react';
import type { CreditTransaction, Question, UserProfile } from '../types/nexus';
import {
  computeTopSolvers,
  computeVaultStats,
  DIFFICULTY_LABELS,
  formatAiRewardLabel,
  formatRelativeTime,
} from '../utils/nexusLogic';
import { UserAvatar } from './NexusBrand';

interface ProfileViewProps {
  currentUser: User | null;
  profile: UserProfile | null;
  questions: Question[];
  liveUsers: UserProfile[];
  creditTransactions: CreditTransaction[];
  onSignInGoogle: () => Promise<void>;
  onUpdateProfile: (updates: {
    displayName: string;
    branch: string;
    year: string;
    bio: string;
    skills: string[];
    availableToHelp: boolean;
  }) => Promise<void>;
  onOpenQuestion: (q: Question) => void;
}

export function ProfileView({
  currentUser,
  profile,
  questions,
  liveUsers,
  creditTransactions,
  onSignInGoogle,
  onUpdateProfile,
  onOpenQuestion,
}: ProfileViewProps) {
  const [editing, setEditing] = React.useState(false);
  const [displayName, setDisplayName] = React.useState(profile?.displayName ?? '');
  const [branch, setBranch] = React.useState(profile?.branch ?? '');
  const [year, setYear] = React.useState(profile?.year ?? '');
  const [bio, setBio] = React.useState(profile?.bio ?? '');
  const [skills, setSkills] = React.useState<string[]>(profile?.skills ?? []);
  const [skillInput, setSkillInput] = React.useState('');
  const [availableToHelp, setAvailableToHelp] = React.useState(
    profile?.availableToHelp ?? true,
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setBranch(profile.branch);
      setYear(profile.year);
      setBio(profile.bio);
      setSkills(profile.skills);
      setAvailableToHelp(profile.availableToHelp);
    }
  }, [profile]);

  const myTransactions = React.useMemo(() => {
    if (!profile) return [];
    return creditTransactions.filter((tx) => tx.userId === profile.uid);
  }, [creditTransactions, profile]);

  const leaderboardRank = React.useMemo(() => {
    if (!profile) return null;
    const board = computeTopSolvers(creditTransactions, liveUsers, 'all_time');
    const found = board.find((s) => s.userId === profile.uid);
    return found ? found.rank : null;
  }, [creditTransactions, liveUsers, profile]);

  const vaultStats = React.useMemo(
    () => computeVaultStats(creditTransactions, profile?.uid),
    [creditTransactions, profile?.uid],
  );

  if (!currentUser || currentUser.isAnonymous || !profile) {
    return (
      <div className="space-y-5">
        <header className="pt-1 pb-2 border-b border-[#DFE5F0]">
          <h1 className="font-display font-semibold text-2xl text-[#172033]">
            Student Profile
          </h1>
          <p className="mt-1 text-sm text-[#687386]">
            Maintain your permanent skills, solved doubt credits, and leaderboard rank.
          </p>
        </header>

        <div className="bg-white border border-[#DFE5F0] rounded-[12px] p-6 space-y-3">
          <div className="flex items-center gap-2 text-[#365BEE]">
            <ShieldCheck className="w-5 h-5" />
            <h2 className="font-display font-semibold text-base text-[#172033]">
              {currentUser?.isAnonymous
                ? 'Guest session active'
                : 'Sign in with Google for a permanent profile'}
            </h2>
          </div>
          <p className="text-sm text-[#687386] leading-relaxed">
            {currentUser?.isAnonymous
              ? 'You are currently browsing and answering with a temporary anonymous identity. Link your Google account to preserve your contributions and solver credits across devices.'
              : 'Visitors can browse, like doubts, and answer freely. Sign in with Google to set up your student profile, publish doubts, and earn verified solver credits.'}
          </p>
          <button
            type="button"
            onClick={() => void onSignInGoogle()}
            className="px-4 py-2 text-sm font-medium bg-[#365BEE] text-white rounded-[8px] hover:bg-[#294AD4] transition-colors"
          >
            {currentUser?.isAnonymous ? 'Link Google Account' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  const myContributions = questions.filter(
    (q) => !q.isDemo && q.authorId === profile.uid,
  );

  const verifiedCreditsFromTx = myTransactions.reduce((acc, tx) => acc + tx.credits, 0);
  const displayCredits = Math.max(profile.totalCreditsEarned || 0, verifiedCreditsFromTx);
  const displaySolvedCount = Math.max(profile.totalDoubtsSolved || 0, myTransactions.length);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onUpdateProfile({
        displayName,
        branch,
        year,
        bio,
        skills,
        availableToHelp,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Compact Profile Header */}
      <section className="bg-white border border-[#DFE5F0] rounded-[12px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <UserAvatar
              name={profile.displayName}
              photoURL={profile.photoURL}
              size="lg"
            />
            <div className="space-y-1">
              <h1 className="font-display font-semibold text-xl text-[#172033]">
                {profile.displayName}
              </h1>
              <p className="font-mono text-xs text-[#687386]">
                {profile.branch} · {profile.year} ·{' '}
                <span className={profile.availableToHelp ? 'text-[#2D6218]' : 'text-[#687386]'}>
                  {profile.availableToHelp ? 'Available to answer' : 'Busy'}
                </span>
              </p>
              {profile.bio && (
                <p className="text-sm text-[#172033] max-w-xl leading-relaxed pt-1">
                  {profile.bio}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#DFE5F0] rounded-[8px] text-[#172033] hover:bg-[#F5F5F0]"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{editing ? 'Cancel' : 'Edit Profile'}</span>
          </button>
        </div>

        {/* Unboxed Skills List */}
        {profile.skills.length > 0 && !editing && (
          <div className="pt-2 border-t border-[#DFE5F0] flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#687386]">
              Skills:
            </span>
            {profile.skills.map((skill) => (
              <span key={skill} className="font-medium text-[#365BEE]">
                {skill}
              </span>
            ))}
          </div>
        )}

        {/* Inline Edit Form */}
        {editing && (
          <form
            onSubmit={handleSave}
            className="pt-4 border-t border-[#DFE5F0] space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#172033] mb-1">
                  Display name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#DFE5F0] rounded-[8px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172033] mb-1">
                  Branch
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#DFE5F0] rounded-[8px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#172033] mb-1">
                  Year
                </label>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#DFE5F0] rounded-[8px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#172033] mb-1">
                Short bio
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#DFE5F0] rounded-[8px]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#172033] mb-1">
                Skills
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  placeholder="Add a skill (e.g., DSA)"
                  className="flex-1 px-3 py-1.5 text-sm border border-[#DFE5F0] rounded-[8px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = skillInput.trim();
                    if (clean && !skills.includes(clean) && skills.length < 12) {
                      setSkills([...skills, clean]);
                      setSkillInput('');
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium border border-[#DFE5F0] rounded-[8px] inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#F5F5F0] border border-[#DFE5F0] rounded-[7px]"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => setSkills(skills.filter((item) => item !== s))}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-[#172033]">
              <input
                type="checkbox"
                checked={availableToHelp}
                onChange={(e) => setAvailableToHelp(e.target.checked)}
              />
              <span>List me in Peers Ready to Help for asynchronous doubt threads</span>
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#365BEE] text-white rounded-[8px] hover:bg-[#294AD4]"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Compact 4-Column Solver Statistics Strip */}
      <section
        aria-label="Profile solver statistics"
        className="grid grid-cols-2 sm:grid-cols-4 bg-white border border-[#DFE5F0] rounded-[12px] divide-y sm:divide-y-0 sm:divide-x divide-[#DFE5F0]"
      >
        <StatCell label="Total Credits Earned" value={String(displayCredits)} />
        <StatCell label="Doubts Solved" value={String(displaySolvedCount)} />
        <StatCell label="Questions Published" value={String(myContributions.length)} />
        <StatCell
          label="Leaderboard Rank"
          value={leaderboardRank ? `#${leaderboardRank}` : 'Unranked'}
        />
      </section>

      {/* Credit Vault Breakdown */}
      <section
        data-testid="credit-vault-section"
        className="bg-white border border-[#DFE5F0] rounded-[12px] p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Vault className="w-4 h-4 text-[#365BEE]" />
            <h2 className="font-display font-semibold text-base text-[#172033]">
              Credit Vault
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[#687386]">
            Credits are a verified record of help, not money.
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-[9px] bg-[#F5F5F0] border border-[#DFE5F0]">
            <span className="block font-mono text-[10px] uppercase text-[#687386]">
              Quick Fix (+5)
            </span>
            <span className="mt-1 block font-display font-semibold text-lg tabular-nums text-[#172033]">
              {vaultStats.tierCounts.QUICK_FIX} solved
            </span>
          </div>
          <div className="p-3 rounded-[9px] bg-[#F5F5F0] border border-[#DFE5F0]">
            <span className="block font-mono text-[10px] uppercase text-[#687386]">
              Standard (+10)
            </span>
            <span className="mt-1 block font-display font-semibold text-lg tabular-nums text-[#172033]">
              {vaultStats.tierCounts.STANDARD} solved
            </span>
          </div>
          <div className="p-3 rounded-[9px] bg-[#F5F5F0] border border-[#DFE5F0]">
            <span className="block font-mono text-[10px] uppercase text-[#687386]">
              Challenging (+20)
            </span>
            <span className="mt-1 block font-display font-semibold text-lg tabular-nums text-[#172033]">
              {vaultStats.tierCounts.CHALLENGING} solved
            </span>
          </div>
          <div className="p-3 rounded-[9px] bg-[#F5F5F0] border border-[#DFE5F0]">
            <span className="block font-mono text-[10px] uppercase text-[#687386]">
              Advanced (+30)
            </span>
            <span className="mt-1 block font-display font-semibold text-lg tabular-nums text-[#172033]">
              {vaultStats.tierCounts.ADVANCED} solved
            </span>
          </div>
        </div>

        {(vaultStats.pendingCredits > 0 || vaultStats.heldCredits > 0) && (
          <div className="px-3.5 py-2.5 rounded-[9px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex flex-wrap items-center gap-4 font-mono">
            {vaultStats.pendingCredits > 0 && (
              <span>Pending account link: +{vaultStats.pendingCredits} credits</span>
            )}
            {vaultStats.heldCredits > 0 && (
              <span>Under review (held): {vaultStats.heldCredits} credits</span>
            )}
          </div>
        )}
      </section>

      {/* Transaction-backed Solved Doubts History */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-base text-[#172033]">
          Verified Solved Doubts History
        </h2>
        {myTransactions.length === 0 ? (
          <div className="bg-white border border-[#DFE5F0] rounded-[12px] p-6 text-xs text-[#687386]">
            Answer a peer&apos;s doubt on NEXUS. Once the author marks your answer as solved, your earned credits and difficulty tier are recorded here.
          </div>
        ) : (
          <div className="space-y-2.5">
            {myTransactions.map((tx) => {
              const parent = questions.find((q) => q.id === tx.doubtId);
              return (
                <div
                  key={tx.id}
                  className="bg-white border border-[#DFE5F0] rounded-[12px] p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#224414] font-semibold">
                      <Award className="w-3.5 h-3.5 text-[#3F7F24]" />
                      +{tx.credits} credits · {DIFFICULTY_LABELS[tx.difficultyTier] ?? tx.difficultyTier} · {formatRelativeTime(tx.createdAtMs)}
                    </span>
                    <h3 className="mt-0.5 text-sm font-medium text-[#172033] truncate">
                      {tx.doubtTitle}
                    </h3>
                  </div>
                  {parent && (
                    <button
                      type="button"
                      onClick={() => onOpenQuestion(parent)}
                      className="px-3 py-1.5 text-xs font-medium text-[#365BEE] border border-[#DFE5F0] rounded-[8px] shrink-0"
                    >
                      Open
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Published Doubts History */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-base text-[#172033]">
          Published Doubts History
        </h2>
        {myContributions.length === 0 ? (
          <div className="bg-white border border-[#DFE5F0] rounded-[12px] p-6 text-xs text-[#687386]">
            Questions you publish on NEXUS will appear here.
          </div>
        ) : (
          <div className="space-y-2.5">
            {myContributions.map((q) => (
              <div
                key={q.id}
                className="bg-white border border-[#DFE5F0] rounded-[12px] p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[11px] text-[#687386]">
                    {q.topic} · {formatAiRewardLabel(q)} · {formatRelativeTime(q.createdAtMs)} · {q.answerCount} answers
                  </span>
                  <h3 className="text-sm font-medium text-[#172033] truncate">
                    {q.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenQuestion(q)}
                  className="px-3 py-1.5 text-xs font-medium text-[#365BEE] border border-[#DFE5F0] rounded-[8px] shrink-0"
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
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

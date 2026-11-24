import React from 'react';
import { Award, Box, CheckCircle2, Sparkles, Trophy } from 'lucide-react';
import { DEMO_HALL_LEADERS } from '../data/demoData';
import type { CreditTransaction, Question, UserProfile } from '../types/nexus';
import { computeTopSolvers, type LeaderboardPeriod } from '../utils/nexusLogic';
import { UserAvatar } from './NexusBrand';
import type { HallLeaderDisplay } from '../3d/HallOfSolvers';
import { getTopicAccent, getTopicLightInk } from '../3d/topicTheme';

export function buildCombinedHallLeaders(
  creditTransactions: CreditTransaction[],
  liveUsers: UserProfile[],
  period: LeaderboardPeriod,
): { liveSolversCount: number; combinedLeaders: HallLeaderDisplay[] } {
  const liveSolvers = computeTopSolvers(creditTransactions, liveUsers, period);
  const liveIds = new Set(liveSolvers.map((s) => s.userId));
  const userMap = new Map(liveUsers.map((u) => [u.uid, u]));

  const mappedLive: HallLeaderDisplay[] = liveSolvers.map((s) => {
    const prof = userMap.get(s.userId);
    return {
      ...s,
      branch: prof?.branch || 'Engineering',
      year: prof?.year || 'Contributor',
      topics: prof?.skills?.length ? prof.skills.slice(0, 3) : ['C++', 'DSA', 'Debugging'],
      highlightQuote:
        prof?.bio || 'Verified peer solver helping fellow students unblock tricky concepts.',
      featuredDoubt: 'Verified Firestore Doubt Solution',
      isDemo: false,
    };
  });

  const showcaseList: HallLeaderDisplay[] = DEMO_HALL_LEADERS.filter(
    (d) => !liveIds.has(d.userId),
  ).map((d, idx) => ({
    userId: d.userId,
    displayName: d.displayName,
    totalCredits: period === 'month' ? Math.round(d.totalCredits * 0.45) : d.totalCredits,
    solvedCount: period === 'month' ? Math.max(2, Math.round(d.solvedCount * 0.45)) : d.solvedCount,
    latestAchievementMs: Date.now() - (idx + 1) * 86_400_000,
    rank: idx + 1,
    branch: d.branch,
    year: d.year,
    topics: d.topics,
    highlightQuote: d.highlightQuote,
    featuredDoubt: d.featuredDoubt,
    isDemo: true,
  }));

  const combinedLeaders = [...mappedLive, ...showcaseList].map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));

  return { liveSolversCount: liveSolvers.length, combinedLeaders };
}

interface HallOfFameViewProps {
  creditTransactions: CreditTransaction[];
  liveUsers: UserProfile[];
  questions: Question[];
  theme: 'light' | 'dark';
  period: LeaderboardPeriod;
  hasWebGl?: boolean;
  onChangePeriod: (period: LeaderboardPeriod) => void;
  onEnter3dHall?: () => void;
}

export function HallOfFameView({
  creditTransactions,
  liveUsers,
  questions,
  theme,
  period,
  hasWebGl = false,
  onChangePeriod,
  onEnter3dHall,
}: HallOfFameViewProps) {
  const { liveSolversCount, combinedLeaders } = React.useMemo(
    () => buildCombinedHallLeaders(creditTransactions, liveUsers, period),
    [creditTransactions, liveUsers, period],
  );

  const liveSolvers = React.useMemo(
    () => computeTopSolvers(creditTransactions, liveUsers, period),
    [creditTransactions, liveUsers, period],
  );
  const totalLiveCredits = liveSolvers.reduce((acc, s) => acc + s.totalCredits, 0);
  const resolvedCount = questions.filter((q) => q.status === 'resolved').length;

  return (
    <div className="space-y-6" data-testid="hall-of-fame-2d-view">
      {/* Golden + Obsidian Contrast Header */}
      <div className="rounded-[20px] p-6 sm:p-7 border-2 border-[#090B10] dark:border-[#F5B82E]/50 bg-gradient-to-br from-[#FFFDF5] via-[#FEF3C7] to-[#FDE68A] dark:from-[#090B10] dark:via-[#1C1206] dark:to-[#3A2207] text-[#090B10] dark:text-[#FFF8E7] shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#090B10] text-[#FFD166] dark:bg-[#F5B82E] dark:text-[#0B0804]">
              <Trophy className="w-3.5 h-3.5" />
              <span>HALL OF FAME · 2D STANDINGS</span>
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight">
              Hall of Fame
            </h1>
            <p className="text-sm text-[#3F4A5F] dark:text-[#E7C878] max-w-xl">
              Ranked peer solvers and showcase gallery leaders. Switch anytime to the Golden 3D Hall to walk their framed portraits and topic collages.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasWebGl && onEnter3dHall && (
              <button
                type="button"
                onClick={onEnter3dHall}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EF233C] hover:bg-[#DC2626] text-white text-xs font-bold shadow-md transition-colors"
              >
                <Box className="w-3.5 h-3.5" />
                <span>Enter 3D Hall</span>
              </button>
            )}

            <div
              role="tablist"
              aria-label="Hall of Fame period"
              className="inline-flex items-center gap-1 p-1 bg-white dark:bg-[#0B0804] border-2 border-[#090B10]/20 dark:border-[#F5B82E]/40 rounded-xl"
            >
              <button
                type="button"
                role="tab"
                aria-selected={period === 'all_time'}
                onClick={() => onChangePeriod('all_time')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  period === 'all_time'
                    ? 'bg-[#090B10] text-[#FFD166] dark:bg-[#F5B82E] dark:text-[#0B0804]'
                    : 'text-[#3F4A5F] dark:text-[#D4B872] hover:text-[#090B10] dark:hover:text-white'
                }`}
              >
                All Time
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={period === 'month'}
                onClick={() => onChangePeriod('month')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  period === 'month'
                    ? 'bg-[#090B10] text-[#FFD166] dark:bg-[#F5B82E] dark:text-[#0B0804]'
                    : 'text-[#3F4A5F] dark:text-[#D4B872] hover:text-[#090B10] dark:hover:text-white'
                }`}
              >
                This Month
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Metrics (explicitly distinguishing live Firestore payouts vs showcase gallery) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-[#0C101E] border-2 border-[#CBD5E1] dark:border-white/20 rounded-xl p-4">
          <span className="font-mono text-[11px] font-semibold uppercase text-[#3F4A5F] dark:text-[#9AA6C4]">
            Gallery Frames ({liveSolversCount} Live · {combinedLeaders.length - liveSolversCount} Showcase)
          </span>
          <p className="mt-1 font-display font-extrabold text-2xl tabular-nums text-[#090B10] dark:text-[#F3F5FB]">
            {combinedLeaders.length}
          </p>
        </div>
        <div className="bg-white dark:bg-[#0C101E] border-2 border-[#CBD5E1] dark:border-white/20 rounded-xl p-4">
          <span className="font-mono text-[11px] font-semibold uppercase text-[#3F4A5F] dark:text-[#9AA6C4]">
            Live Verified Credits Awarded
          </span>
          <p className="mt-1 font-display font-extrabold text-2xl tabular-nums text-[#B45309] dark:text-[#FFD166]">
            {totalLiveCredits}
          </p>
        </div>
        <div className="bg-white dark:bg-[#0C101E] border-2 border-[#CBD5E1] dark:border-white/20 rounded-xl p-4">
          <span className="font-mono text-[11px] font-semibold uppercase text-[#3F4A5F] dark:text-[#9AA6C4]">
            Resolved Doubts in Library
          </span>
          <p className="mt-1 font-display font-extrabold text-2xl tabular-nums text-[#DC2626] dark:text-[#EF233C]">
            {resolvedCount}
          </p>
        </div>
      </div>

      {/* Pure 2D Ranked Standings */}
      <section
        data-testid="top-solvers-leaderboard"
        className="bg-white dark:bg-[#0C101E] border-2 border-[#090B10]/15 dark:border-[#F5B82E]/35 rounded-2xl overflow-hidden shadow-sm"
      >
        <div className="px-5 py-3.5 border-b border-[#CBD5E1] dark:border-white/15 flex flex-wrap items-center justify-between gap-2 bg-[#FCF8EC]/60 dark:bg-[#140E05]/60">
          <h2 className="font-display font-bold text-sm text-[#090B10] dark:text-[#FFF8E7]">
            Hall of Fame Standings ({period === 'all_time' ? 'All Time' : 'This Month'})
          </h2>
          <span className="text-[11px] font-mono font-medium text-[#3F4A5F] dark:text-[#D4B872]">
            Live Firestore payouts rank first · Demo Showcase leaders populate gallery walls
          </span>
        </div>

        <div className="divide-y divide-[#CBD5E1] dark:divide-white/10">
          {combinedLeaders.map((solver) => (
            <div
              key={solver.userId}
              className="px-5 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-[#FEF8E6]/60 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span
                  className={`w-8 h-8 rounded-lg inline-flex items-center justify-center font-mono text-xs font-extrabold shrink-0 border ${
                    solver.rank === 1
                      ? 'bg-[#FFD166] text-[#090B10] border-[#090B10]'
                      : solver.rank === 2
                        ? 'bg-[#F59E0B] text-[#090B10] border-[#090B10]'
                        : solver.rank === 3
                          ? 'bg-[#EF233C] text-white border-[#090B10]'
                          : 'bg-[#F1F5F9] dark:bg-white/10 text-[#090B10] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-white/15'
                  }`}
                >
                  #{solver.rank}
                </span>
                <UserAvatar
                  name={solver.displayName}
                  photoURL={solver.photoURL}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[#090B10] dark:text-[#F3F5FB] truncate">
                      {solver.displayName}
                    </p>
                    {solver.isDemo && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#FEF2F2] text-[#B91C1C] border border-[#EF233C]/40 dark:bg-[#EF233C]/20 dark:text-[#FCA5A5]">
                        <Sparkles className="w-2.5 h-2.5" />
                        Showcase
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#3F4A5F] dark:text-[#9AA6C4] mt-0.5 line-clamp-1">
                    “{solver.highlightQuote}” · {solver.featuredDoubt}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs font-mono font-semibold text-[#090B10] dark:text-[#CBD5E1] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      {solver.solvedCount} {solver.solvedCount === 1 ? 'doubt' : 'doubts'} solved
                    </span>
                    {solver.topics.slice(0, 3).map((tp) => (
                      <span
                        key={tp}
                        className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border"
                        style={{
                          borderColor: theme === 'dark' ? getTopicAccent(tp) : getTopicLightInk(tp),
                          color: theme === 'dark' ? getTopicAccent(tp) : getTopicLightInk(tp),
                        }}
                      >
                        {tp}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#090B10] text-[#FFD166] dark:bg-[#F5B82E]/20 dark:border dark:border-[#F5B82E]/50 dark:text-[#FFD166] font-mono text-xs font-bold shrink-0 tabular-nums">
                <Award className="w-3.5 h-3.5" />
                <span>{solver.totalCredits} credits</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

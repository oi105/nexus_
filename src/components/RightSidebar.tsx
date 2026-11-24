import React from 'react';
import { Award, Trophy } from 'lucide-react';
import type { CreditTransaction, Question, UserProfile } from '../types/nexus';
import { computeTopSolvers, type LeaderboardPeriod } from '../utils/nexusLogic';
import { UserAvatar } from './NexusBrand';

interface RightSidebarProps {
  peers: UserProfile[];
  liveUsers: UserProfile[];
  creditTransactions: CreditTransaction[];
  questions: Question[];
}

export function RightSidebar({
  peers,
  liveUsers,
  creditTransactions,
  questions,
}: RightSidebarProps) {
  const [period, setPeriod] = React.useState<LeaderboardPeriod>('all_time');

  const topSolvers = React.useMemo(
    () => computeTopSolvers(creditTransactions, liveUsers, period).slice(0, 6),
    [creditTransactions, liveUsers, period],
  );

  const liveCount = questions.filter((q) => !q.isDemo).length;
  const demoCount = questions.filter((q) => q.isDemo).length;
  const openCount = questions.filter((q) => q.status === 'open').length;
  const resolvedCount = questions.filter((q) => q.status === 'resolved').length;

  return (
    <aside
      aria-label="Contextual community sidebar"
      className="space-y-5 text-sm"
    >
      {/* Top Solvers Leaderboard (Real Firestore creditTransactions only) */}
      <section
        data-testid="top-solvers-leaderboard"
        className="bg-white border border-[#DFE5F0] rounded-[12px] p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-[#365BEE]" />
            <h2 className="font-display font-semibold text-xs uppercase tracking-wider text-[#687386]">
              Top Solvers
            </h2>
          </div>

          <div
            role="tablist"
            aria-label="Leaderboard time period"
            className="inline-flex items-center gap-0.5 p-0.5 bg-[#F5F5F0] border border-[#DFE5F0] rounded-[7px]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={period === 'all_time'}
              onClick={() => setPeriod('all_time')}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-[5px] transition-colors ${
                period === 'all_time'
                  ? 'bg-[#172033] text-white'
                  : 'text-[#687386] hover:text-[#172033]'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={period === 'month'}
              onClick={() => setPeriod('month')}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-[5px] transition-colors ${
                period === 'month'
                  ? 'bg-[#172033] text-white'
                  : 'text-[#687386] hover:text-[#172033]'
              }`}
            >
              This Month
            </button>
          </div>
        </div>

        {topSolvers.length === 0 ? (
          <div className="p-3 rounded-[9px] bg-[#F5F5F0]/80 border border-[#DFE5F0] space-y-1">
            <p className="text-xs font-medium text-[#172033]">
              {period === 'month'
                ? 'No solved doubts recorded this month yet.'
                : 'No verified doubt solutions yet.'}
            </p>
            <p className="text-[11px] text-[#687386] leading-relaxed">
              Earn solver credits when a doubt author marks your answer as solved.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#DFE5F0]">
            {topSolvers.map((solver) => (
              <div
                key={solver.userId}
                className="py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-[6px] inline-flex items-center justify-center font-mono text-[11px] font-semibold shrink-0 ${
                      solver.rank === 1
                        ? 'bg-[#C8ED62] text-[#172033]'
                        : solver.rank === 2
                          ? 'bg-[#365BEE]/15 text-[#2445C2]'
                          : 'bg-[#F5F5F0] text-[#687386]'
                    }`}
                  >
                    #{solver.rank}
                  </span>
                  <UserAvatar
                    name={solver.displayName}
                    photoURL={solver.photoURL}
                    size="xs"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#172033] truncate">
                      {solver.displayName}
                    </p>
                    <p className="text-[10px] font-mono text-[#687386]">
                      {solver.solvedCount} {solver.solvedCount === 1 ? 'doubt' : 'doubts'} solved
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#224414] shrink-0 tabular-nums">
                  <Award className="w-3 h-3 text-[#3F7F24]" />
                  {solver.totalCredits}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Students Available to Help */}
      <section className="bg-white border border-[#DFE5F0] rounded-[12px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-xs uppercase tracking-wider text-[#687386]">
            Peers Ready to Help
          </h2>
        </div>
        <div className="space-y-3">
          {peers.slice(0, 3).map((peer) => (
            <div key={peer.uid} className="flex items-start gap-2.5">
              <UserAvatar
                name={peer.displayName}
                photoURL={peer.photoURL}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[#172033] truncate">
                  {peer.displayName}{' '}
                  {peer.isDemo && (
                    <span className="font-mono text-[10px] text-[#687386]">
                      · Demo
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-[#687386] truncate">
                  {peer.skills.slice(0, 2).join(' · ') || peer.branch}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Factual Feed Snapshot */}
      <section className="px-1 space-y-1.5 text-[11px] font-mono text-[#687386]">
        <div className="flex items-center justify-between">
          <span>Open doubts</span>
          <span className="tabular-nums text-[#172033]">{openCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Resolved doubts</span>
          <span className="tabular-nums text-[#172033]">{resolvedCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Live Firestore posts</span>
          <span className="tabular-nums text-[#172033]">{liveCount}</span>
        </div>
        {demoCount > 0 && (
          <div className="flex items-center justify-between">
            <span>Demo showcase threads</span>
            <span className="tabular-nums text-[#172033]">{demoCount}</span>
          </div>
        )}
      </section>
    </aside>
  );
}

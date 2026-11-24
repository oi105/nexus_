import React from 'react';
import type { User } from 'firebase/auth';
import { Award, LayoutGrid, LogOut, Moon, Search, Sparkles, Sun } from 'lucide-react';
import { SUPPORTED_TOPICS, type FeedTab, type UserProfile } from '../../types/nexus';
import { UserAvatar, NexusLogo } from '../../components/NexusBrand';
import { useCorridorStore } from '../store';
import { getTopicAccent } from '../topicTheme';

interface CommandBarProps {
  currentUser: User | null;
  profile: UserProfile | null;
  theme: 'light' | 'dark';
  totalCount: number;
  onToggleTheme: () => void;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

const FEED_TABS: { id: FeedTab; label: string }[] = [
  { id: 'most_liked', label: 'Most Liked' },
  { id: 'newest', label: 'Newest' },
  { id: 'unanswered', label: 'Unanswered' },
  { id: 'resolved', label: 'Solved' },
];

const DARK_TEXT_ACCENTS = new Set(['Python', 'C++', 'CAD and AutoCAD', 'DBMS', 'Mathematics', 'UI/UX', 'Engineering concepts']);

export function CommandBar({
  currentUser,
  profile,
  theme,
  totalCount,
  onToggleTheme,
  onSignInGoogle,
  onSignOut,
}: CommandBarProps) {
  const {
    searchQuery,
    setSearchQuery,
    activeTopic,
    setActiveTopic,
    activeFeedTab,
    setActiveFeedTab,
    setClassicMode,
  } = useCorridorStore();

  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const isDark = theme === 'dark';

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const displayName = currentUser?.isAnonymous
    ? 'Guest'
    : profile?.displayName || currentUser?.displayName || 'Student';
  const vaultCredits = profile?.totalCreditsEarned ?? 0;

  const barBg = isDark
    ? 'bg-[#08090F]/92 border-white/20 text-[#F8FAFC]'
    : 'bg-white/95 border-2 border-[#090B10]/20 text-[#090B10]';

  return (
    <header className="absolute top-3 inset-x-0 z-40 px-3 sm:px-6 pointer-events-none">
      <div className="max-w-[1400px] mx-auto space-y-2">
        {/* Top Row: Brand, Search, Theme, 2D View, Google Sign-In */}
        <div
          className={`pointer-events-auto flex flex-wrap items-center justify-between gap-2.5 px-4 py-2 rounded-2xl border shadow-xl ${barBg}`}
        >
          <div className="flex items-center gap-2.5 shrink-0">
            <NexusLogo size={26} />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-display font-extrabold text-sm tracking-tight">NEXUS</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    isDark
                      ? 'bg-[#EF233C]/20 text-[#FCA5A5] border-[#EF233C]/50'
                      : 'bg-[#090B10] text-white border-[#090B10]'
                  }`}
                >
                  3D CORRIDOR
                </span>
              </div>
              <p
                className={`text-[10px] font-mono hidden sm:block ${
                  isDark ? 'text-[#A3AFC8]' : 'text-[#3F4A5F]'
                }`}
              >
                {totalCount} doubts · Scroll, drag or W/S to walk
              </p>
            </div>
          </div>

          <div className="flex-1 min-w-[180px] max-w-md order-3 sm:order-2 w-full sm:w-auto">
            <div className="relative">
              <Search
                className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                  isDark ? 'text-[#A3AFC8]' : 'text-[#3F4A5F]'
                }`}
              />
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Search doubt library"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search doubts, C++, DBMS, pointers... (Ctrl+K)"
                className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-full border focus:outline-none focus:border-[#EF233C] ${
                  isDark
                    ? 'bg-[#050609] border-white/20 text-[#F8FAFC] placeholder:text-[#6B768B]'
                    : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#090B10] placeholder:text-[#475569]'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 order-2 sm:order-3 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
              title={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                isDark
                  ? 'bg-white/10 border-white/20 text-[#FFD166] hover:bg-white/15'
                  : 'bg-[#F8FAFC] border-[#090B10]/20 text-[#090B10] hover:border-[#090B10]'
              }`}
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{isDark ? 'Light' : 'Dark'}</span>
            </button>

            <button
              type="button"
              onClick={() => setClassicMode(true)}
              title="Switch to 2D Classic List View"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                isDark
                  ? 'bg-white/10 border-white/20 text-[#F8FAFC] hover:border-[#EF233C]'
                  : 'bg-[#F8FAFC] border-[#090B10]/20 text-[#090B10] hover:border-[#EF233C]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[#EF233C]" />
              <span className="hidden sm:inline">2D View</span>
            </button>

            {currentUser && !currentUser.isAnonymous ? (
              <div className="flex items-center gap-1.5">
                <div
                  className={`inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border text-xs ${
                    isDark ? 'bg-white/10 border-white/20' : 'bg-[#F8FAFC] border-[#090B10]/20'
                  }`}
                >
                  <UserAvatar
                    name={displayName}
                    photoURL={profile?.photoURL || currentUser.photoURL || undefined}
                    size="xs"
                  />
                  <span className="hidden lg:inline font-semibold max-w-[90px] truncate">
                    {displayName}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#C8ED62]">
                    <Award className="w-3 h-3" />
                    {vaultCredits}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Sign out"
                  onClick={() => void onSignOut()}
                  className={`w-8 h-8 rounded-full border inline-flex items-center justify-center transition-colors ${
                    isDark
                      ? 'bg-white/10 border-white/20 text-[#A3AFC8] hover:text-white'
                      : 'bg-[#F8FAFC] border-[#090B10]/20 text-[#3F4A5F] hover:text-[#090B10]'
                  }`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onSignInGoogle()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#EF233C] hover:bg-[#DC2626] text-white text-xs font-bold transition-colors whitespace-nowrap shadow-md"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{currentUser?.isAnonymous ? 'Guest · Sign in' : 'Sign in with Google'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Second Row: Topic Wing Pills + Feed Tabs */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Topic wings"
            className="flex items-center gap-1.5 overflow-x-auto max-w-full py-0.5 no-scrollbar"
          >
            {SUPPORTED_TOPICS.map((topic) => {
              const selected = activeTopic === topic;
              const accent = getTopicAccent(topic);
              const selectedText = DARK_TEXT_ACCENTS.has(topic) ? '#050609' : '#FFFFFF';
              return (
                <button
                  key={topic}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveTopic(topic)}
                  style={
                    selected
                      ? {
                          backgroundColor: accent,
                          color: selectedText,
                          borderColor: isDark ? '#FFFFFF' : '#090B10',
                        }
                      : undefined
                  }
                  className={`whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    selected
                      ? 'font-bold shadow-sm'
                      : isDark
                        ? 'bg-[#08090F]/90 border-white/20 text-[#E2E8F0] hover:border-white/45'
                        : 'bg-white/95 border-[#090B10]/20 text-[#090B10] hover:border-[#090B10]'
                  }`}
                >
                  {topic === 'All Topics' ? 'All' : topic}
                </button>
              );
            })}
          </nav>

          <div
            role="tablist"
            aria-label="3D Library feed sorting"
            className={`inline-flex items-center gap-1 p-1 rounded-full border shadow-sm shrink-0 ${barBg}`}
          >
            {FEED_TABS.map((tab) => {
              const active = activeFeedTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveFeedTab(tab.id)}
                  className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-full transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#EF233C] text-white'
                      : isDark
                        ? 'text-[#A3AFC8] hover:text-white'
                        : 'text-[#3F4A5F] hover:text-[#090B10]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}

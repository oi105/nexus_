import React from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  Award,
  Box,
  ChevronDown,
  ChevronUp,
  Compass,
  LogOut,
  Moon,
  Plus,
  Search,
  Shield,
  Sun,
  Trophy,
  User as UserIcon,
} from 'lucide-react';
import type { NavView, UserProfile } from '../types/nexus';
import { NexusLogo, UserAvatar } from './NexusBrand';

interface AppShellProps {
  activeView: NavView;
  currentUser: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  unreadMessagesCount: number;
  searchQuery: string;
  theme: 'light' | 'dark';
  hasWebGl?: boolean;
  onToggleTheme: () => void;
  onEnter3d?: () => void;
  onSearchChange: (value: string) => void;
  onNavigate: (view: NavView) => void;
  onOpenAskDoubt: () => void;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  rightSidebar: React.ReactNode;
  children: React.ReactNode;
}


export function AppShell({
  activeView,
  currentUser,
  profile,
  isAdmin,
  unreadMessagesCount,
  searchQuery,
  theme,
  hasWebGl = true,
  onToggleTheme,
  onEnter3d,
  onSearchChange,
  onNavigate,
  onOpenAskDoubt,
  onSignInGoogle,
  onSignOut,
  rightSidebar,
  children,
}: AppShellProps) {
  const [mobileContextOpen, setMobileContextOpen] = React.useState(false);

  const navItems: {
    id: NavView;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    { id: 'discover', label: 'Library', icon: <Compass className="w-4 h-4" /> },
    { id: 'leaders', label: 'Hall of Fame', icon: <Trophy className="w-4 h-4" /> },
    {
      id: 'activity',
      label: 'Doubts & Mail',
      icon: <Activity className="w-4 h-4" />,
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
    },
    { id: 'profile', label: 'Profile', icon: <UserIcon className="w-4 h-4" /> },
  ];

  const mobileNavItems = isAdmin
    ? [
        ...navItems,
        { id: 'admin' as NavView, label: 'Admin', icon: <Shield className="w-4 h-4" /> },
      ]
    : navItems;

  const displayName = currentUser?.isAnonymous
    ? 'Guest'
    : profile?.displayName || currentUser?.displayName || 'Guest';

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#050609] text-[#090B10] dark:text-[#F8FAFC] flex flex-col">
      {/* Compact Top Navigation */}
      <header className="sticky top-0 z-30 h-13 md:h-14 bg-white/95 dark:bg-[#0B0D14]/95 backdrop-blur border-b-[1.5px] border-[#CBD5E1] dark:border-white/15">
        <div className="max-w-[1280px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('discover')}
            className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 focus:outline-none"
          >
            <NexusLogo size={26} />
            <span className="font-display font-extrabold text-[17px] tracking-tight text-[#090B10] dark:text-white">
              NEXUS
            </span>
          </button>

          {/* Zone 2: Search Input */}
          <div className="flex-1 max-w-md hidden sm:block">
            <label htmlFor="nexus-global-search" className="sr-only">
              Search doubts, topics, or tags
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-[#3F4A5F] dark:text-[#A3AFC8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="nexus-global-search"
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  if (activeView !== 'discover') {
                    onNavigate('discover');
                  }
                }}
                placeholder="Search doubts, C++, DBMS, pointers..."
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#F8FAFC] dark:bg-[#131620] border-[1.5px] border-[#CBD5E1] dark:border-white/15 rounded-[8px] text-[#090B10] dark:text-white placeholder:text-[#475569] dark:placeholder:text-[#6B768B] focus:outline-none focus:bg-white dark:focus:bg-[#181C28] focus:border-[#EF233C] transition-colors"
              />
            </div>
          </div>

          {/* Zone 3: 3D Library + Ask Doubt + Theme Toggle + Auth / Avatar */}
          <div className="flex items-center gap-2 shrink-0">
            {hasWebGl && onEnter3d && (
              <button
                type="button"
                onClick={onEnter3d}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-[1.5px] border-[#090B10]/25 dark:border-white/20 bg-white dark:bg-[#131620] text-[#090B10] dark:text-[#F8FAFC] rounded-[8px] hover:border-[#EF233C] transition-colors whitespace-nowrap shrink-0"
              >
                <Box className="w-3.5 h-3.5 text-[#EF233C]" />
                <span>3D Library</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenAskDoubt}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-[#EF233C] text-white rounded-[8px] hover:bg-[#DC2626] transition-colors whitespace-nowrap shrink-0 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ask Doubt</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[#687386] dark:text-[#A3AFC8] hover:text-[#172033] dark:hover:text-white hover:bg-[#F5F5F0] dark:hover:bg-white/10 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {currentUser && !currentUser.isAnonymous ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('profile')}
                  aria-label="Open profile"
                  className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-[8px] hover:bg-[#F5F5F0] dark:hover:bg-white/10 transition-colors"
                >
                  <UserAvatar
                    name={displayName}
                    photoURL={profile?.photoURL || currentUser.photoURL || undefined}
                    size="sm"
                  />
                  <span className="hidden md:inline text-xs font-medium text-[#172033] dark:text-white max-w-[100px] truncate">
                    {displayName}
                  </span>
                  <span className="hidden lg:inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#224414] dark:text-emerald-400">
                    <Award className="w-3 h-3" />
                    {profile?.totalCreditsEarned ?? 0}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Sign out"
                  onClick={() => void onSignOut()}
                  className="w-8 h-8 rounded-[8px] inline-flex items-center justify-center text-[#687386] dark:text-[#A3AFC8] hover:text-[#172033] dark:hover:text-white hover:bg-[#F5F5F0] dark:hover:bg-white/10"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onSignInGoogle()}
                className="px-3 py-1.5 text-xs font-medium border border-[#DFE5F0] dark:border-white/20 bg-white dark:bg-[#131620] text-[#172033] dark:text-white rounded-[8px] hover:bg-[#F5F5F0] dark:hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
              >
                {currentUser?.isAnonymous ? 'Guest · Sign in' : 'Sign in'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Search Bar (visible on < sm) */}
      <div className="sm:hidden bg-white dark:bg-[#0B0D14] border-b border-[#DFE5F0] dark:border-white/15 px-4 py-2">
        <div className="relative">
          <Search
            className="w-4 h-4 text-[#687386] dark:text-[#A3AFC8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search doubts"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              if (activeView !== 'discover') onNavigate('discover');
            }}
            placeholder="Search doubts, topics, or tags..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#F5F5F0] dark:bg-[#131620] border border-[#DFE5F0] dark:border-white/15 rounded-[8px] text-[#090B10] dark:text-white focus:outline-none focus:border-[#EF233C]"
          />
        </div>
      </div>

      {/* Main 3-Column Desktop Shell */}
      <div className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-10 flex items-start justify-center gap-7">
        {/* Slim Left Navigation */}
        <aside className="hidden md:flex flex-col w-[200px] shrink-0 sticky top-20 space-y-6">
          <nav aria-label="Primary navigation" className="space-y-1">
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-[8px] transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#090B10] dark:bg-[#EF233C]/20 border border-[#090B10] dark:border-[#EF233C]/50 font-semibold text-white'
                      : 'text-[#3F4A5F] dark:text-[#A3AFC8] hover:text-[#090B10] dark:hover:text-white hover:bg-white dark:hover:bg-white/10'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <span className={active ? 'text-[#EF233C]' : 'text-[#3F4A5F] dark:text-[#A3AFC8]'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-[#FF694F] text-white rounded-[5px]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {isAdmin && (
            <div className="pt-4 border-t border-[#DFE5F0] dark:border-white/15">
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-[8px] transition-colors whitespace-nowrap ${
                  activeView === 'admin'
                    ? 'bg-[#172033] dark:bg-[#EF233C]/20 border border-[#172033] dark:border-[#EF233C]/50 text-white font-semibold'
                    : 'text-[#687386] dark:text-[#A3AFC8] hover:text-[#172033] dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Admin Control</span>
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-[#DFE5F0] dark:border-white/15 px-3 space-y-1">
            <p className="font-display font-semibold text-xs text-[#172033] dark:text-white">
              NEXUS
            </p>
            <p className="text-[11px] text-[#687386] dark:text-[#A3AFC8] leading-relaxed">
              Knowledge moves. Asynchronous peer problem-solving and AI-assessed solver rewards.
            </p>
          </div>
        </aside>

        {/* Centered Main Content (650–700px) */}
        <main className="w-full max-w-[700px] min-w-0 flex-1 space-y-5">
          {/* Collapsible Contextual Info on Mobile/Tablet */}
          <div className="lg:hidden">
            <button
              type="button"
              aria-expanded={mobileContextOpen}
              onClick={() => setMobileContextOpen((v) => !v)}
              className="w-full px-3.5 py-2 bg-white dark:bg-[#0B0D14] border border-[#DFE5F0] dark:border-white/15 rounded-[9px] flex items-center justify-between text-xs font-medium text-[#172033] dark:text-white"
            >
              <span>Top Solvers & Peers Ready to Help</span>
              {mobileContextOpen ? (
                <ChevronUp className="w-4 h-4 text-[#687386] dark:text-[#A3AFC8]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#687386] dark:text-[#A3AFC8]" />
              )}
            </button>
            {mobileContextOpen && <div className="mt-3">{rightSidebar}</div>}
          </div>

          {children}
        </main>

        {/* Contextual Right Sidebar (240–280px) */}
        <div className="hidden lg:block w-[264px] shrink-0 sticky top-20">
          {rightSidebar}
        </div>
      </div>

      {/* Minimal Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className={`md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white dark:bg-[#0B0D14] border-t border-[#DFE5F0] dark:border-white/15 grid ${
          mobileNavItems.length === 5
            ? 'grid-cols-5'
            : mobileNavItems.length === 4
              ? 'grid-cols-4'
              : 'grid-cols-3'
        }`}
      >
        {mobileNavItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                active ? 'text-[#EF233C] font-semibold' : 'text-[#687386] dark:text-[#A3AFC8]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {'badge' in item && item.badge !== undefined && (
                <span className="absolute top-1.5 right-1/4 w-2 h-2 rounded-full bg-[#FF694F]" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

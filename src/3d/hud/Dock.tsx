import React from 'react';
import {
  Activity,
  Compass,
  Plus,
  Shield,
  Trophy,
  User as UserIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { NavView } from '../../types/nexus';
import { useCorridorStore } from '../store';
import { soundManager } from '../audio';

interface DockProps {
  activeView: NavView;
  isAdmin: boolean;
  unreadMessagesCount: number;
  theme: 'light' | 'dark';
  onNavigate: (view: NavView) => void;
  onOpenAskDoubt: () => void;
}

export function Dock({
  activeView,
  isAdmin,
  unreadMessagesCount,
  theme,
  onNavigate,
  onOpenAskDoubt,
}: DockProps) {
  const { soundEnabled, setSoundEnabled, setActiveChamberId } = useCorridorStore();
  const isDark = theme === 'dark';

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundManager.toggleSound(next);
  };

  const dockClass = isDark
    ? 'bg-[#08090F]/92 border-white/20 text-[#F8FAFC]'
    : 'bg-white/95 border-2 border-[#090B10]/20 text-[#090B10]';

  const inactiveBtn = isDark
    ? 'text-[#A3AFC8] hover:text-white hover:bg-white/10'
    : 'text-[#3F4A5F] hover:text-[#090B10] hover:bg-[#F1F5F9]';

  const activeBtn = isDark
    ? 'bg-[#EF233C]/20 text-[#FCA5A5] border border-[#EF233C]/50'
    : 'bg-[#090B10] text-white border border-[#090B10]';

  return (
    <nav
      aria-label="3D Library Dock"
      className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-auto max-w-[95vw]"
    >
      <div
        className={`flex items-center gap-1.5 sm:gap-2 border rounded-full px-3 sm:px-4 py-2 shadow-xl ${dockClass}`}
      >
        <button
          type="button"
          onClick={() => {
            setActiveChamberId(null);
            onNavigate('discover');
          }}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            activeView === 'discover' ? activeBtn : inactiveBtn
          }`}
        >
          <Compass className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Library</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveChamberId(null);
            onNavigate('leaders');
          }}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            activeView === 'leaders' ? activeBtn : inactiveBtn
          }`}
        >
          <Trophy className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Hall of Fame</span>
        </button>

        <button
          type="button"
          onClick={onOpenAskDoubt}
          aria-label="Ask a Doubt"
          title="Ask a Doubt"
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#EF233C] hover:bg-[#DC2626] rounded-full text-white text-xs font-bold shadow-md hover:scale-105 transition-transform shrink-0 mx-0.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Doubt</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveChamberId(null);
            onNavigate('activity');
          }}
          className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            activeView === 'activity' ? activeBtn : inactiveBtn
          }`}
        >
          <Activity className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Doubts & Mail</span>
          {unreadMessagesCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-[#EF233C]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveChamberId(null);
            onNavigate('profile');
          }}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            activeView === 'profile' ? activeBtn : inactiveBtn
          }`}
        >
          <UserIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Profile</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setActiveChamberId(null);
              onNavigate('admin');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              activeView === 'admin' ? activeBtn : inactiveBtn
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">Admin</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleToggleSound}
          aria-label={soundEnabled ? 'Mute spatial audio' : 'Enable spatial audio'}
          title={soundEnabled ? 'Mute spatial audio' : 'Enable spatial audio'}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${inactiveBtn}`}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-[#EF233C]" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </button>
      </div>
    </nav>
  );
}

import React from 'react';
import { useCorridorStore } from '../store';

interface DepthRailProps {
  totalDoubts: number;
  theme: 'light' | 'dark';
}

/** Minimal monospace depth readout in the bottom-left corner (no clunky vertical slider bar). */
export function DepthRail({ totalDoubts, theme }: DepthRailProps) {
  const cameraZ = useCorridorStore((s) => s.cameraZ);

  const safeTotal = Math.max(1, totalDoubts);
  const rawStep = Math.max(1, Math.floor(Math.max(0, 4.8 - cameraZ) / 9) + 1);
  const displayIdx = ((rawStep - 1) % safeTotal) + 1;
  const isDark = theme === 'dark';

  return (
    <div
      className={`absolute left-4 sm:left-6 bottom-6 z-30 hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full border font-mono text-xs font-semibold pointer-events-none ${
        isDark
          ? 'bg-[#08090F]/90 border-white/20 text-[#E2E8F0]'
          : 'bg-white/95 border-2 border-[#090B10]/20 text-[#090B10]'
      }`}
    >
      <span>
        Doubt {displayIdx} / {totalDoubts} · ∞
      </span>
    </div>
  );
}

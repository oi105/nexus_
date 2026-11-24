import { create } from 'zustand';
import type { FeedTab } from '../types/nexus';

export const FRAME_SPACING = 9;
export const POOL_SIZE = 8;

export function getPooledSlots(windowAnchor: number) {
  return Array.from({ length: POOL_SIZE }, (_, poolIdx) => {
    const offset = (poolIdx - (windowAnchor % POOL_SIZE) + POOL_SIZE) % POOL_SIZE;
    const slotIdx = windowAnchor + offset;
    return { poolIdx, slotIdx };
  });
}

interface CorridorStoreState {
  cameraZ: number;
  targetZ: number;
  windowAnchor: number;
  activeTopic: string;
  activeFeedTab: FeedTab;
  activeChamberId: string | null;
  soundEnabled: boolean;
  classicMode: boolean;
  hallClassicMode: boolean;
  searchQuery: string;
  setCameraZ: (z: number) => void;
  setTargetZ: (z: number) => void;
  setWindowAnchor: (anchor: number) => void;
  stepWalkZ: (deltaZ: number) => void;
  setActiveTopic: (topic: string) => void;
  setActiveFeedTab: (tab: FeedTab) => void;
  setActiveChamberId: (id: string | null) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setClassicMode: (classic: boolean) => void;
  setHallClassicMode: (classic: boolean) => void;
  setSearchQuery: (q: string) => void;
}

export const useCorridorStore = create<CorridorStoreState>((set) => ({
  cameraZ: 4,
  targetZ: 4,
  windowAnchor: 0,
  activeTopic: 'All Topics',
  activeFeedTab: 'most_liked',
  activeChamberId: null,
  soundEnabled: false,
  classicMode: false,
  hallClassicMode: false,
  searchQuery: '',
  setCameraZ: (cameraZ) => set({ cameraZ }),
  setTargetZ: (z) => set({ targetZ: Math.min(4, z) }),
  setWindowAnchor: (windowAnchor) => set({ windowAnchor }),
  stepWalkZ: (deltaZ) =>
    set((state) => ({
      targetZ: Math.min(4, state.targetZ + deltaZ),
    })),
  setActiveTopic: (activeTopic) => set({ activeTopic, targetZ: 4, windowAnchor: 0 }),
  setActiveFeedTab: (activeFeedTab) => set({ activeFeedTab, targetZ: 4, windowAnchor: 0 }),
  setActiveChamberId: (activeChamberId) => set({ activeChamberId }),
  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setClassicMode: (classicMode) => set({ classicMode }),
  setHallClassicMode: (hallClassicMode) => set({ hallClassicMode }),
  setSearchQuery: (searchQuery) => set({ searchQuery, targetZ: 4, windowAnchor: 0 }),
}));

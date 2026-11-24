import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { User } from 'firebase/auth';
import type {
  AiInsight,
  Answer,
  AnswerReply,
  IntegrationStatus,
  NavView,
  Question,
  RichAttachment,
  UserProfile,
} from '../types/nexus';
import { filterAndSortQuestions } from '../utils/nexusLogic';
import { useCorridorStore } from './store';
import { Corridor } from './Corridor';
import { Chamber } from './Chamber';
import { CommandBar } from './hud/CommandBar';
import { DepthRail } from './hud/DepthRail';
import { Dock } from './hud/Dock';
import { detectSoftwareWebGL } from './webgl';

interface ExperienceProps {
  questions: Question[];
  selectedQuestion: Question | null;
  answers: Answer[];
  repliesMap: Record<string, AnswerReply[]>;
  likedQuestionIds: Record<string, boolean>;
  likedAnswerIds: Record<string, boolean>;
  currentUser: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  unreadMessagesCount: number;
  aiInsightsMap: Record<string, AiInsight>;
  aiLoading: boolean;
  aiError: string | null;
  integrations: IntegrationStatus;
  theme: 'light' | 'dark';
  activeView: NavView;
  onToggleTheme: () => void;
  onNavigate: (view: NavView) => void;
  onOpenAskDoubt: () => void;
  onOpenChamber: (questionId: string) => void;
  onCloseChamber: () => void;
  onToggleQuestionLike: (question: Question) => Promise<void> | void;
  onToggleAnswerLike: (answer: Answer) => Promise<void> | void;
  onLoadAnswerReplies: (answerId: string) => void;
  onSubmitAnswerReply: (answer: Answer, body: string) => Promise<void>;
  onRequestAiInsight: () => void;
  onRetryRewardAssessment: (question: Question) => Promise<void>;
  onSubmitAnswer: (body: string, attachments: RichAttachment[]) => Promise<void>;
  onMarkAsSolved: (answer: Answer) => Promise<void>;
  onOpenReport: (
    targetType: 'question' | 'answer' | 'reward',
    targetId: string,
    preview: string,
  ) => void;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSignInGuest: () => Promise<{ ok: boolean; error?: string }>;
}

export function Experience({
  questions,
  selectedQuestion,
  answers,
  repliesMap,
  likedQuestionIds,
  likedAnswerIds,
  currentUser,
  profile,
  isAdmin,
  unreadMessagesCount,
  aiInsightsMap,
  aiLoading,
  aiError,
  integrations,
  theme,
  activeView,
  onToggleTheme,
  onNavigate,
  onOpenAskDoubt,
  onOpenChamber,
  onCloseChamber,
  onToggleQuestionLike,
  onToggleAnswerLike,
  onLoadAnswerReplies,
  onSubmitAnswerReply,
  onRequestAiInsight,
  onRetryRewardAssessment,
  onSubmitAnswer,
  onMarkAsSolved,
  onOpenReport,
  onSignInGoogle,
  onSignOut,
  onSignInGuest,
}: ExperienceProps) {
  const {
    activeChamberId,
    activeTopic,
    activeFeedTab,
    searchQuery,
    stepWalkZ,
    setActiveChamberId,
  } = useCorridorStore();

  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);
  const isDark = theme === 'dark';

  const filteredQuestions = useMemo(
    () =>
      filterAndSortQuestions(questions, {
        tab: activeFeedTab,
        topic: activeTopic,
        searchQuery,
      }),
    [questions, activeFeedTab, activeTopic, searchQuery],
  );

  const dragRef = React.useRef<{ active: boolean; lastY: number }>({
    active: false,
    lastY: 0,
  });

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (activeChamberId) return;
    stepWalkZ(-e.deltaY * 0.025);
  };

  const stageBg = isDark ? '#050609' : '#FFFFFF';

  return (
    <div
      data-testid="nexus-3d-corridor"
      onWheel={handleWheel}
      onPointerDown={(e) => {
        if (activeChamberId || (e.target as HTMLElement).closest('button,input,header,nav')) return;
        dragRef.current = { active: true, lastY: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current.active || activeChamberId) return;
        const dy = e.clientY - dragRef.current.lastY;
        dragRef.current.lastY = e.clientY;
        stepWalkZ(dy * 0.055);
      }}
      onPointerUp={() => {
        dragRef.current.active = false;
      }}
      onPointerLeave={() => {
        dragRef.current.active = false;
      }}
      className="relative w-full h-screen overflow-hidden select-none"
      style={{ backgroundColor: stageBg }}
    >
      {/* Top HUD Command Bar */}
      <CommandBar
        currentUser={currentUser}
        profile={profile}
        theme={theme}
        totalCount={filteredQuestions.length}
        onToggleTheme={onToggleTheme}
        onSignInGoogle={onSignInGoogle}
        onSignOut={onSignOut}
      />

      {/* Minimal Bottom-Left Depth Readout */}
      <DepthRail totalDoubts={filteredQuestions.length} theme={theme} />

      {/* Bottom Floating Navigation Dock */}
      <Dock
        activeView={activeView}
        isAdmin={isAdmin}
        unreadMessagesCount={unreadMessagesCount}
        theme={theme}
        onNavigate={onNavigate}
        onOpenAskDoubt={onOpenAskDoubt}
      />

      {/* Keyboard / Screen-Reader Accessible Index for 3D Doubt Stations */}
      <div className="sr-only" aria-label="Accessible 3D Doubt Index">
        {filteredQuestions.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => {
              setActiveChamberId(q.id);
              onOpenChamber(q.id);
            }}
          >
            {q.title}
          </button>
        ))}
        <button type="button" onClick={onOpenAskDoubt}>
          Forge a New Doubt
        </button>
      </div>

      {/* Empty Search / Filter Floating Prompt */}
      {filteredQuestions.length === 0 && !activeChamberId && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none px-4">
          <div
            className={`pointer-events-auto max-w-sm w-full rounded-2xl border p-6 text-center space-y-3 shadow-2xl ${
              isDark
                ? 'bg-[#08090F] border-white/20 text-[#F8FAFC]'
                : 'bg-white border-2 border-[#090B10] text-[#090B10]'
            }`}
          >
            <p className="font-display font-bold text-base">
              No doubts in this wing yet
            </p>
            <p className="text-xs text-[#3F4A5F] dark:text-[#A3AFC8]">
              Try switching topics or launch a new doubt into this corridor wing.
            </p>
            <button
              type="button"
              onClick={onOpenAskDoubt}
              className="px-4 py-2 text-xs font-semibold bg-[#EF233C] text-white rounded-full hover:bg-[#DC2626]"
            >
              Ask a Doubt
            </button>
          </div>
        </div>
      )}

      {/* 3D Corridor Stage */}
      <Canvas
        dpr={isSoftwareGl ? 1 : [1, 1.75]}
        gl={{ antialias: !isSoftwareGl, powerPreference: 'high-performance' }}
        camera={{ position: [0, 1.65, 4], fov: 55, near: 0.1, far: 140 }}
      >
        <color attach="background" args={[stageBg]} />
        <fogExp2 attach="fog" args={[stageBg, isDark ? 0.028 : 0.01]} />

        <hemisphereLight
          args={[isDark ? '#8899BB' : '#FFFFFF', isDark ? '#050609' : '#F1F5F9', isDark ? 0.72 : 2.1]}
        />
        <directionalLight
          position={[6, 14, 10]}
          intensity={isDark ? 0.8 : 1.55}
          color={isDark ? '#FFE4E6' : '#FFFFFF'}
        />

        <Suspense fallback={null}>
          <Corridor
            questions={filteredQuestions}
            theme={theme}
            isSoftwareGl={isSoftwareGl}
            onOpenChamber={(qId) => {
              setActiveChamberId(qId);
              onOpenChamber(qId);
            }}
            onOpenAskDoubt={onOpenAskDoubt}
          />
        </Suspense>
      </Canvas>

      {/* Doubt Chamber Overlay */}
      {activeChamberId && selectedQuestion && (
        <Chamber
          question={selectedQuestion}
          answers={answers}
          repliesMap={repliesMap}
          isQuestionLiked={Boolean(likedQuestionIds[selectedQuestion.id])}
          likedAnswerIds={likedAnswerIds}
          currentUser={currentUser}
          aiInsight={aiInsightsMap[selectedQuestion.id] ?? null}
          aiLoading={aiLoading}
          aiError={aiError}
          integrations={integrations}
          theme={theme}
          onClose={() => {
            setActiveChamberId(null);
            onCloseChamber();
          }}
          onToggleQuestionLike={onToggleQuestionLike}
          onToggleAnswerLike={onToggleAnswerLike}
          onLoadAnswerReplies={onLoadAnswerReplies}
          onSubmitAnswerReply={onSubmitAnswerReply}
          onRequestAiInsight={onRequestAiInsight}
          onRetryRewardAssessment={onRetryRewardAssessment}
          onSubmitAnswer={onSubmitAnswer}
          onMarkAsSolved={onMarkAsSolved}
          onOpenReport={onOpenReport}
          onSignInGoogle={onSignInGoogle}
          onSignInGuest={onSignInGuest}
        />
      )}
    </div>
  );
}

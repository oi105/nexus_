import React from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import { ActivityView } from './components/ActivityView';
import { AdminView } from './components/AdminView';
import { AppShell } from './components/AppShell';
import { AskDoubtModal } from './components/AskDoubtModal';
import { DiscoverFeed } from './components/DiscoverFeed';
import { DiscussionDrawer } from './components/DiscussionDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HallOfFameView, buildCombinedHallLeaders } from './components/HallOfFameView';
import { ProfileView } from './components/ProfileView';
import { ReportModal } from './components/ReportModal';
import { RightSidebar } from './components/RightSidebar';
import { Experience } from './3d/Experience';
import { HallOfSolversExperience } from './3d/HallOfSolvers';
import { useCorridorStore } from './3d/store';
import { checkWebGL2Available } from './3d/webgl';
import {
  DEMO_ANSWERS,
  DEMO_PEERS,
  DEMO_QUESTIONS,
  DEMO_REPLIES,
} from './data/demoData';
import {
  auth,
  getCachedGmailAccessToken,
  setCachedGmailAccessToken,
} from './lib/firebase';
import {
  adminAdjustDoubtReward,
  adminSetQuestionVisibility,
  adminToggleUserSuspension,
  checkAnswerLiked,
  checkIsAdmin,
  connectGmailAccount,
  createQuestion,
  deleteQuestionAsAdmin,
  ensureUserProfile,
  fetchIntegrationStatus,
  fetchLikedQuestionIds,
  getStoredAiInsight,
  markAdminMessageRead,
  requestAndStoreAiInsight,
  resolveDoubtWithAcceptedAnswer,
  resolveReportAction,
  retryDoubtAiAssessment,
  sendAdminMessage,
  signInAsGuest,
  signInWithGoogle,
  signOutUser,
  submitAnswer,
  submitAnswerReply,
  submitModerationReport,
  subscribeAllAdminMessages,
  subscribeAllQuestionsForAdmin,
  subscribeAllReports,
  subscribeAnswerReplies,
  subscribeAnswers,
  subscribeAnswersForMyDoubts,
  subscribeCreditTransactions,
  subscribeMyAdminMessages,
  subscribePublicUsers,
  subscribeQuestions,
  subscribeRewardAdjustments,
  toggleAnswerLike,
  toggleQuestionLike,
  updateUserProfile,
} from './services/nexusService';
import type {
  AdminMessage,
  AiInsight,
  Answer,
  AnswerReply,
  CreditTransaction,
  FeedTab,
  IntegrationStatus,
  ModerationReport,
  NavView,
  Question,
  RewardAdjustment,
  RichAttachment,
  UrgencyLevel,
  UserProfile,
} from './types/nexus';
import {
  computeLikeTransition,
  filterAndSortQuestions,
  type LeaderboardPeriod,
} from './utils/nexusLogic';

function initialViewFromPath(): NavView {
  const p = window.location.pathname;
  if (p === '/admin') return 'admin';
  if (p === '/leaders') return 'leaders';
  if (p === '/activity') return 'activity';
  if (p === '/profile') return 'profile';
  return 'discover';
}

function NexusWorkspace() {
  const [activeView, setActiveView] = React.useState<NavView>(initialViewFromPath);
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);

  const [liveQuestions, setLiveQuestions] = React.useState<Question[]>([]);
  const [adminAllQuestions, setAdminAllQuestions] = React.useState<Question[]>([]);
  const [demoQuestions, setDemoQuestions] = React.useState<Question[]>(DEMO_QUESTIONS);
  const [questionsLoading, setQuestionsLoading] = React.useState(true);

  const [liveUsers, setLiveUsers] = React.useState<UserProfile[]>([]);
  const [creditTransactions, setCreditTransactions] = React.useState<CreditTransaction[]>([]);
  const [rewardAdjustments, setRewardAdjustments] = React.useState<RewardAdjustment[]>([]);
  const [reports, setReports] = React.useState<ModerationReport[]>([]);
  const [adminMessages, setAdminMessages] = React.useState<AdminMessage[]>([]);

  const [feedTab, setFeedTab] = React.useState<FeedTab>('most_liked');
  const [selectedTopic, setSelectedTopic] = React.useState<string>('All Topics');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  const [selectedQuestionId, setSelectedQuestionId] = React.useState<string | null>(null);
  const [liveAnswers, setLiveAnswers] = React.useState<Answer[]>([]);
  const [demoAnswersMap, setDemoAnswersMap] =
    React.useState<Record<string, Answer[]>>(DEMO_ANSWERS);
  const [demoRepliesMap, setDemoRepliesMap] =
    React.useState<Record<string, AnswerReply[]>>(DEMO_REPLIES);
  const [liveRepliesMap, setLiveRepliesMap] = React.useState<Record<string, AnswerReply[]>>({});
  const [uploadedDoubtAnswersMap, setUploadedDoubtAnswersMap] = React.useState<
    Record<string, Answer[]>
  >({});
  const [mySubmittedAnswers, setMySubmittedAnswers] = React.useState<Answer[]>([]);
  const [hasGmailAccess, setHasGmailAccess] = React.useState<boolean>(() =>
    Boolean(getCachedGmailAccessToken()),
  );

  const [likedQuestionIds, setLikedQuestionIds] = React.useState<Record<string, boolean>>({});
  const [likedAnswerIds, setLikedAnswerIds] = React.useState<Record<string, boolean>>({});

  const [aiInsightsMap, setAiInsightsMap] = React.useState<Record<string, AiInsight>>({});
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);

  const [integrations, setIntegrations] = React.useState<IntegrationStatus>({
    geminiConfigured: false,
    cloudinaryConfigured: false,
    cloudinaryCloudName: null,
    cloudinaryMode: null,
    directUploadReady: true,
  });

  const [askModalOpen, setAskModalOpen] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState<{
    type: 'question' | 'answer' | 'reward';
    id: string;
    preview: string;
  } | null>(null);

  const [hallPeriod, setHallPeriod] = React.useState<LeaderboardPeriod>('all_time');
  const [notice, setNotice] = React.useState<string | null>(null);
  const replyUnsubMapRef = React.useRef<Record<string, () => void>>({});

  const {
    classicMode,
    setClassicMode,
    hallClassicMode,
    setHallClassicMode,
    setActiveChamberId,
    setActiveFeedTab,
    setActiveTopic,
    setTargetZ,
  } = useCorridorStore();

  const hasWebGl = React.useMemo(() => checkWebGL2Available(), []);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!hasWebGl || params.get('classic') === '1') {
      setClassicMode(true);
      setHallClassicMode(true);
    }
  }, [hasWebGl, setClassicMode, setHallClassicMode]);

  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('nexus_theme') as 'light' | 'dark') || 'dark';
  });

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('nexus_theme', next);
      return next;
    });
  }, []);

  const showNotice = React.useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((curr) => (curr === msg ? null : curr));
    }, 4500);
  }, []);

  const navigateTo = React.useCallback(
    (view: NavView) => {
      setActiveView(view);
      setSelectedQuestionId(null);
      setActiveChamberId(null);
      const nextPath = view === 'discover' ? '/' : `/${view}`;
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, '', nextPath);
      }
    },
    [setActiveChamberId],
  );

  React.useEffect(() => {
    const onPop = () => {
      setActiveView(initialViewFromPath());
      setSelectedQuestionId(null);
      setActiveChamberId(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setActiveChamberId]);

  React.useEffect(() => {
    void fetchIntegrationStatus().then(setIntegrations).catch(() => {});
  }, []);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user && !user.isAnonymous) {
        try {
          const prof = await ensureUserProfile(user);
          setProfile(prof);
          const adminFlag = await checkIsAdmin(user);
          setIsAdmin(adminFlag);
        } catch (err) {
          console.error('Profile sync error:', err);
        }
      } else {
        setCachedGmailAccessToken(null);
        setHasGmailAccess(false);
        setProfile(null);
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    const fallbackTimer = window.setTimeout(() => {
      setQuestionsLoading(false);
    }, 1500);
    const unsubQuestions = subscribeQuestions((qs) => {
      window.clearTimeout(fallbackTimer);
      setLiveQuestions(qs);
      setQuestionsLoading(false);
    });
    const unsubUsers = subscribePublicUsers((users) => {
      setLiveUsers(users);
    });
    const unsubTxs = subscribeCreditTransactions((txs) => {
      setCreditTransactions(txs);
    });
    return () => {
      window.clearTimeout(fallbackTimer);
      unsubQuestions();
      unsubUsers();
      unsubTxs();
    };
  }, []);

  React.useEffect(() => {
    if (!currentUser || liveQuestions.length === 0) return;
    void fetchLikedQuestionIds(
      liveQuestions.map((q) => q.id),
      currentUser.uid,
    ).then((likedMap) => {
      setLikedQuestionIds((prev) => ({ ...prev, ...likedMap }));
    });
  }, [currentUser, liveQuestions]);

  React.useEffect(() => {
    if (!isAdmin) {
      setReports([]);
      setRewardAdjustments([]);
      setAdminAllQuestions([]);
      setAdminMessages([]);
      return;
    }
    const unsubReports = subscribeAllReports(setReports);
    const unsubAdjs = subscribeRewardAdjustments(setRewardAdjustments);
    const unsubAllQ = subscribeAllQuestionsForAdmin(setAdminAllQuestions);
    const unsubMsgs = subscribeAllAdminMessages(setAdminMessages);
    return () => {
      unsubReports();
      unsubAdjs();
      unsubAllQ();
      unsubMsgs();
    };
  }, [isAdmin]);

  React.useEffect(() => {
    if (!currentUser || currentUser.isAnonymous || isAdmin) {
      if (!isAdmin) setAdminMessages([]);
      return;
    }
    return subscribeMyAdminMessages(currentUser.uid, setAdminMessages);
  }, [currentUser, isAdmin]);

  const myUploadedDoubtIdsKey = React.useMemo(() => {
    const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : '';
    if (!uid) return '';
    return liveQuestions
      .filter((q) => q.authorId === uid)
      .map((q) => q.id)
      .slice(0, 15)
      .join(',');
  }, [liveQuestions, currentUser]);

  React.useEffect(() => {
    if (!myUploadedDoubtIdsKey) {
      setUploadedDoubtAnswersMap({});
      return;
    }
    const ids = myUploadedDoubtIdsKey.split(',').filter(Boolean);
    return subscribeAnswersForMyDoubts(ids, setUploadedDoubtAnswersMap);
  }, [myUploadedDoubtIdsKey]);

  const allQuestions = React.useMemo(() => {
    const map = new Map<string, Question>();
    for (const q of liveQuestions) map.set(q.id, q);
    for (const q of demoQuestions) {
      if (!map.has(q.id)) map.set(q.id, q);
    }
    return Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [liveQuestions, demoQuestions]);

  const visibleFeedQuestions = React.useMemo(
    () =>
      filterAndSortQuestions(allQuestions, {
        tab: feedTab,
        topic: selectedTopic,
        searchQuery,
      }),
    [allQuestions, feedTab, selectedTopic, searchQuery],
  );

  const selectedQuestion = React.useMemo(
    () => allQuestions.find((q) => q.id === selectedQuestionId) ?? null,
    [allQuestions, selectedQuestionId],
  );

  // Answers & AI insight subscription for selected question (both 3D Chamber and 2D Drawer)
  React.useEffect(() => {
    setAiError(null);
    Object.values(replyUnsubMapRef.current).forEach((unsub) => unsub());
    replyUnsubMapRef.current = {};
    setLiveRepliesMap({});

    if (!selectedQuestion) {
      setLiveAnswers([]);
      return;
    }
    if (selectedQuestion.isDemo) {
      setLiveAnswers([]);
      return;
    }

    const unsub = subscribeAnswers(selectedQuestion.id, setLiveAnswers);
    void getStoredAiInsight(selectedQuestion.id).then((ins) => {
      if (ins) {
        setAiInsightsMap((prev) => ({ ...prev, [selectedQuestion.id]: ins }));
      }
    });
    return () => unsub();
  }, [selectedQuestion]);

  React.useEffect(() => {
    if (!currentUser || !selectedQuestion || selectedQuestion.isDemo || liveAnswers.length === 0) {
      return;
    }
    void Promise.all(
      liveAnswers.map(async (ans) => [
        ans.id,
        await checkAnswerLiked(selectedQuestion.id, ans.id, currentUser.uid),
      ] as const),
    ).then((entries) => {
      setLikedAnswerIds((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [currentUser, selectedQuestion, liveAnswers]);

  const activeAnswers = React.useMemo(() => {
    if (!selectedQuestion) return [];
    if (selectedQuestion.isDemo) {
      return demoAnswersMap[selectedQuestion.id] ?? [];
    }
    return liveAnswers;
  }, [selectedQuestion, demoAnswersMap, liveAnswers]);

  const activeRepliesMap = React.useMemo(() => {
    if (!selectedQuestion) return {};
    return selectedQuestion.isDemo ? demoRepliesMap : liveRepliesMap;
  }, [selectedQuestion, demoRepliesMap, liveRepliesMap]);

  const combinedPeers = React.useMemo(() => {
    const availableLive = liveUsers.filter((u) => u.availableToHelp && !u.isSuspended);
    return [...availableLive, ...DEMO_PEERS];
  }, [liveUsers]);

  // Auth handlers
  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      setHasGmailAccess(Boolean(getCachedGmailAccessToken()));
      showNotice('Signed in with Google.');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Google sign-in cancelled.');
    }
  };

  const handleConnectGmail = async (): Promise<boolean> => {
    const res = await connectGmailAccount();
    setHasGmailAccess(res.hasMailAccess);
    if (res.hasMailAccess) {
      showNotice('Personal Gmail access connected for this session.');
    }
    return res.hasMailAccess;
  };

  const handleGuestSignIn = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await signInAsGuest();
    if (res.user) {
      showNotice('Temporary guest identity active.');
      return { ok: true };
    }
    return { ok: false, error: res.error };
  };

  const handleSignOut = async () => {
    await signOutUser();
    setHasGmailAccess(false);
    setLikedQuestionIds({});
    setLikedAnswerIds({});
    showNotice('Signed out.');
  };

  // Like handler
  const handleToggleQuestionLike = async (question: Question) => {
    const currentlyLiked = Boolean(likedQuestionIds[question.id]);

    if (question.isDemo) {
      const next = computeLikeTransition(currentlyLiked, question.likeCount);
      setLikedQuestionIds((prev) => ({ ...prev, [question.id]: next.liked }));
      setDemoQuestions((prev) =>
        prev.map((q) =>
          q.id === question.id ? { ...q, likeCount: next.likeCount } : q,
        ),
      );
      return;
    }

    let actor = currentUser;
    if (!actor) {
      const guest = await signInAsGuest();
      if (!guest.user) {
        showNotice(
          guest.error || 'Sign in with Google or enable Guest auth to like doubts.',
        );
        return;
      }
      actor = guest.user;
    }

    const result = await toggleQuestionLike(question.id, actor.uid);
    setLikedQuestionIds((prev) => ({ ...prev, [question.id]: result.liked }));
  };

  // Publish new question
  const handlePublishDoubt = async (input: {
    title: string;
    description: string;
    topic: string;
    tags: string[];
    urgency: UrgencyLevel;
    attachments: RichAttachment[];
    generateAiInsight: boolean;
  }) => {
    if (!currentUser || currentUser.isAnonymous) {
      throw new Error('Google sign-in is required to publish a doubt.');
    }
    const created = await createQuestion({
      user: currentUser,
      profile,
      ...input,
    });
    setSelectedTopic('All Topics');
    setSearchQuery('');
    setFeedTab('newest');
    setActiveTopic('All Topics');
    setActiveFeedTab('newest');
    setTargetZ(2);
    navigateTo('discover');
    setSelectedQuestionId(created.id);
    if (!classicMode && hasWebGl) {
      setActiveChamberId(created.id);
    }
    showNotice('Doubt published to NEXUS.');
  };

  // Submit answer (works in both 3D Chamber and 2D DiscussionDrawer)
  const handleSubmitAnswer = async (body: string, attachments: RichAttachment[]) => {
    if (!selectedQuestion) {
      throw new Error('No doubt selected.');
    }

    if (selectedQuestion.isDemo) {
      const newAns: Answer = {
        id: `demo-ans-${Date.now()}`,
        questionId: selectedQuestion.id,
        authorId: currentUser?.uid ?? 'guest-local',
        authorName:
          currentUser && !currentUser.isAnonymous
            ? profile?.displayName || currentUser.displayName || 'Student'
            : 'Guest Contributor',
        authorIsGuest: !currentUser || currentUser.isAnonymous,
        body,
        attachments,
        likeCount: 0,
        replyCount: 0,
        isAccepted: false,
        isPublic: true,
        moderationStatus: 'active',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        isDemo: true,
      };
      setDemoAnswersMap((prev) => ({
        ...prev,
        [selectedQuestion.id]: [newAns, ...(prev[selectedQuestion.id] ?? [])],
      }));
      setDemoQuestions((prev) =>
        prev.map((q) =>
          q.id === selectedQuestion.id
            ? { ...q, answerCount: q.answerCount + 1 }
            : q,
        ),
      );
      setMySubmittedAnswers((prev) => [newAns, ...prev]);
      showNotice('Answer added to discussion.');
      return;
    }

    let responder = currentUser;
    if (!responder) {
      const guest = await signInAsGuest();
      if (!guest.user) {
        throw new Error(
          guest.error || 'Sign in with Google or enable Guest auth to submit answers.',
        );
      }
      responder = guest.user;
    }

    await submitAnswer({
      question: selectedQuestion,
      user: responder,
      profile,
      body,
      attachments,
    });
    setMySubmittedAnswers((prev) => [
      {
        id: `local-${Date.now()}`,
        questionId: selectedQuestion.id,
        authorId: responder!.uid,
        authorName: responder!.isAnonymous
          ? 'Guest Contributor'
          : profile?.displayName || 'Student',
        authorIsGuest: responder!.isAnonymous,
        body,
        attachments,
        likeCount: 0,
        replyCount: 0,
        isAccepted: false,
        isPublic: true,
        moderationStatus: 'active',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      },
      ...prev,
    ]);
    showNotice('Answer posted.');
  };

  const handleToggleAnswerLike = async (answer: Answer) => {
    if (!selectedQuestion) return;
    const currentlyLiked = Boolean(likedAnswerIds[answer.id]);

    if (selectedQuestion.isDemo) {
      const next = computeLikeTransition(currentlyLiked, answer.likeCount);
      setLikedAnswerIds((prev) => ({ ...prev, [answer.id]: next.liked }));
      setDemoAnswersMap((prev) => ({
        ...prev,
        [selectedQuestion.id]: (prev[selectedQuestion.id] ?? []).map((a) =>
          a.id === answer.id ? { ...a, likeCount: next.likeCount } : a,
        ),
      }));
      return;
    }

    let actor = currentUser;
    if (!actor) {
      const guest = await signInAsGuest();
      if (!guest.user) {
        showNotice(guest.error || 'Sign in to like answers.');
        return;
      }
      actor = guest.user;
    }

    const result = await toggleAnswerLike(selectedQuestion.id, answer.id, actor.uid);
    setLikedAnswerIds((prev) => ({ ...prev, [answer.id]: result.liked }));
  };

  const handleLoadAnswerReplies = (answerId: string) => {
    if (!selectedQuestion || selectedQuestion.isDemo) return;
    if (replyUnsubMapRef.current[answerId]) return;

    const unsub = subscribeAnswerReplies(selectedQuestion.id, answerId, (replies) => {
      setLiveRepliesMap((prev) => ({ ...prev, [answerId]: replies }));
    });
    replyUnsubMapRef.current[answerId] = unsub;
  };

  const handleSubmitAnswerReply = async (answer: Answer, body: string) => {
    if (!selectedQuestion) return;

    if (selectedQuestion.isDemo) {
      const newReply: AnswerReply = {
        id: `demo-rep-${Date.now()}`,
        questionId: selectedQuestion.id,
        answerId: answer.id,
        authorId: currentUser?.uid ?? 'guest-local',
        authorName:
          currentUser && !currentUser.isAnonymous
            ? profile?.displayName || currentUser.displayName || 'Student'
            : 'Guest Contributor',
        authorIsGuest: !currentUser || currentUser.isAnonymous,
        body,
        isPublic: true,
        createdAtMs: Date.now(),
        isDemo: true,
      };
      setDemoRepliesMap((prev) => ({
        ...prev,
        [answer.id]: [...(prev[answer.id] ?? []), newReply],
      }));
      setDemoAnswersMap((prev) => ({
        ...prev,
        [selectedQuestion.id]: (prev[selectedQuestion.id] ?? []).map((a) =>
          a.id === answer.id ? { ...a, replyCount: (a.replyCount || 0) + 1 } : a,
        ),
      }));
      return;
    }

    let responder = currentUser;
    if (!responder) {
      const guest = await signInAsGuest();
      if (!guest.user) {
        showNotice(guest.error || 'Sign in to reply.');
        return;
      }
      responder = guest.user;
    }

    handleLoadAnswerReplies(answer.id);
    await submitAnswerReply({
      questionId: selectedQuestion.id,
      answer,
      user: responder,
      profile,
      body,
    });
  };

  const handleRequestAiInsight = async () => {
    if (!selectedQuestion) return;
    setAiError(null);
    setAiLoading(true);
    try {
      const insight = await requestAndStoreAiInsight(selectedQuestion);
      setAiInsightsMap((prev) => ({ ...prev, [selectedQuestion.id]: insight }));
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Unable to fetch NEXUS AI insight.',
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleRetryRewardAssessment = async (question: Question) => {
    if (question.isDemo) {
      showNotice('Demo questions have completed AI rewards.');
      return;
    }
    const res = await retryDoubtAiAssessment(question);
    if (res.status === 'completed') {
      showNotice(`AI reward assessed: ${res.assignedCredits} credits (${res.difficultyTier}).`);
    } else {
      showNotice(res.error || 'AI assessment is still pending.');
    }
  };

  const handleMarkAsSolved = async (answer: Answer) => {
    if (!selectedQuestion) return;

    if (selectedQuestion.isDemo) {
      setDemoQuestions((prev) =>
        prev.map((q) =>
          q.id === selectedQuestion.id
            ? { ...q, status: 'resolved', acceptedAnswerId: answer.id }
            : q,
        ),
      );
      setDemoAnswersMap((prev) => ({
        ...prev,
        [selectedQuestion.id]: (prev[selectedQuestion.id] ?? []).map((a) => ({
          ...a,
          isAccepted: a.id === answer.id,
        })),
      }));
      showNotice('Doubt marked as solved.');
      return;
    }

    const res = await resolveDoubtWithAcceptedAnswer(selectedQuestion, answer);
    if (res.credited) {
      showNotice(`Doubt resolved! ${res.creditsAwarded} solver credits awarded to ${answer.authorName}.`);
    } else {
      showNotice(res.reason || 'Doubt marked as solved.');
    }
  };

  const handleSubmitReport = async (reason: string) => {
    if (!reportTarget || !selectedQuestion) return;
    if (selectedQuestion.isDemo) {
      showNotice('Demo content cannot be reported to live moderation.');
      return;
    }
    let reporter = currentUser;
    if (!reporter) {
      const guest = await signInAsGuest();
      if (!guest.user) {
        throw new Error(guest.error || 'Sign in to submit a report.');
      }
      reporter = guest.user;
    }
    await submitModerationReport({
      reporterId: reporter.uid,
      targetType: reportTarget.type,
      targetId: reportTarget.id,
      questionId: selectedQuestion.id,
      targetPreview: reportTarget.preview,
      reason,
    });
    showNotice('Moderation report submitted.');
  };

  const unreadMessagesCount = adminMessages.filter(
    (m) => !m.isRead && m.recipientId === currentUser?.uid,
  ).length;

  const rightSidebarNode = (
    <RightSidebar
      peers={combinedPeers}
      liveUsers={liveUsers}
      creditTransactions={creditTransactions}
      questions={allQuestions}
    />
  );

  const { combinedLeaders } = React.useMemo(
    () => buildCombinedHallLeaders(creditTransactions, liveUsers, hallPeriod),
    [creditTransactions, liveUsers, hallPeriod],
  );

  const is3dCorridorActive = activeView === 'discover' && !classicMode && hasWebGl;
  const is3dHallActive = activeView === 'leaders' && !hallClassicMode && hasWebGl;

  return (
    <div
      className={
        theme === 'dark'
          ? 'dark bg-[#07080D] text-[#F8FAFC] min-h-screen transition-colors'
          : 'bg-[#F8FAFC] text-[#090B10] min-h-screen transition-colors'
      }
    >
      {notice && (
        <div
          role="status"
          className="fixed top-20 right-4 z-[90] px-4 py-2.5 bg-[#172033] dark:bg-[#222838] border border-white/15 text-white text-xs font-medium rounded-[9px] flex items-center justify-between gap-3 shadow-xl max-w-sm"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[#DFE5F0] hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {is3dCorridorActive ? (
        <Experience
          questions={allQuestions}
          selectedQuestion={selectedQuestion}
          answers={activeAnswers}
          repliesMap={activeRepliesMap}
          likedQuestionIds={likedQuestionIds}
          likedAnswerIds={likedAnswerIds}
          currentUser={currentUser}
          profile={profile}
          isAdmin={isAdmin}
          unreadMessagesCount={unreadMessagesCount}
          aiInsightsMap={aiInsightsMap}
          aiLoading={aiLoading}
          aiError={aiError}
          integrations={integrations}
          theme={theme}
          activeView={activeView}
          onToggleTheme={toggleTheme}
          onNavigate={navigateTo}
          onOpenAskDoubt={() => setAskModalOpen(true)}
          onOpenChamber={(qId) => setSelectedQuestionId(qId)}
          onCloseChamber={() => setSelectedQuestionId(null)}
          onToggleQuestionLike={handleToggleQuestionLike}
          onToggleAnswerLike={handleToggleAnswerLike}
          onLoadAnswerReplies={handleLoadAnswerReplies}
          onSubmitAnswerReply={handleSubmitAnswerReply}
          onRequestAiInsight={handleRequestAiInsight}
          onRetryRewardAssessment={handleRetryRewardAssessment}
          onSubmitAnswer={handleSubmitAnswer}
          onMarkAsSolved={handleMarkAsSolved}
          onOpenReport={(type, id, preview) =>
            setReportTarget({ type, id, preview })
          }
          onSignInGoogle={handleGoogleSignIn}
          onSignOut={handleSignOut}
          onSignInGuest={handleGuestSignIn}
        />
      ) : is3dHallActive ? (
        <HallOfSolversExperience
          leaders={combinedLeaders}
          theme={theme}
          period={hallPeriod}
          onChangePeriod={setHallPeriod}
          activeView={activeView}
          isAdmin={isAdmin}
          unreadMessagesCount={unreadMessagesCount}
          currentUser={currentUser}
          profile={profile}
          onToggleTheme={toggleTheme}
          onSwitchTo2d={() => setHallClassicMode(true)}
          onNavigate={navigateTo}
          onOpenAskDoubt={() => setAskModalOpen(true)}
          onSignInGoogle={handleGoogleSignIn}
          onSignOut={handleSignOut}
        />
      ) : (
        <AppShell
          activeView={activeView}
          currentUser={currentUser}
          profile={profile}
          isAdmin={isAdmin}
          unreadMessagesCount={unreadMessagesCount}
          searchQuery={searchQuery}
          theme={theme}
          hasWebGl={hasWebGl}
          onToggleTheme={toggleTheme}
          onEnter3d={() => {
            setClassicMode(false);
            navigateTo('discover');
          }}
          onSearchChange={setSearchQuery}
          onNavigate={navigateTo}
          onOpenAskDoubt={() => setAskModalOpen(true)}
          onSignInGoogle={handleGoogleSignIn}
          onSignOut={handleSignOut}
          rightSidebar={rightSidebarNode}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeView === 'discover' ? (
                <DiscoverFeed
                  questions={visibleFeedQuestions}
                  loading={questionsLoading}
                  feedTab={feedTab}
                  selectedTopic={selectedTopic}
                  searchQuery={searchQuery}
                  likedQuestionIds={likedQuestionIds}
                  hasDemoContent={demoQuestions.length > 0}
                  onChangeTab={setFeedTab}
                  onChangeTopic={setSelectedTopic}
                  onClearFilters={() => {
                    setSelectedTopic('All Topics');
                    setSearchQuery('');
                    setFeedTab('most_liked');
                  }}
                  onToggleLike={handleToggleQuestionLike}
                  onOpenDetail={(q) => setSelectedQuestionId(q.id)}
                  onOpenAskDoubt={() => setAskModalOpen(true)}
                  onEnter3dCorridor={hasWebGl ? () => setClassicMode(false) : undefined}
                />
              ) : activeView === 'leaders' ? (
                <HallOfFameView
                  creditTransactions={creditTransactions}
                  liveUsers={liveUsers}
                  questions={allQuestions}
                  theme={theme}
                  period={hallPeriod}
                  hasWebGl={hasWebGl}
                  onChangePeriod={setHallPeriod}
                  onEnter3dHall={() => setHallClassicMode(false)}
                />
              ) : activeView === 'activity' ? (
                <ActivityView
                  currentUser={currentUser}
                  profile={profile}
                  questions={allQuestions}
                  uploadedDoubtAnswersMap={uploadedDoubtAnswersMap}
                  myAnswers={mySubmittedAnswers}
                  creditTransactions={creditTransactions}
                  adminMessages={adminMessages}
                  hasGmailAccess={hasGmailAccess}
                  onConnectGmail={handleConnectGmail}
                  onRefreshGmailState={() => setHasGmailAccess(Boolean(getCachedGmailAccessToken()))}
                  onOpenQuestion={(q) => setSelectedQuestionId(q.id)}
                  onOpenAskDoubt={() => setAskModalOpen(true)}
                  onMarkMessageRead={async (id) => {
                    await markAdminMessageRead(id);
                    showNotice('Message marked as read.');
                  }}
                  onSignInGoogle={handleGoogleSignIn}
                />
              ) : activeView === 'profile' ? (
                <ProfileView
                  currentUser={currentUser}
                  profile={profile}
                  questions={allQuestions}
                  liveUsers={liveUsers}
                  creditTransactions={creditTransactions}
                  onSignInGoogle={handleGoogleSignIn}
                  onUpdateProfile={async (updates) => {
                    if (!currentUser) return;
                    await updateUserProfile(currentUser.uid, updates);
                    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
                    showNotice('Profile updated.');
                  }}
                  onOpenQuestion={(q) => setSelectedQuestionId(q.id)}
                />
              ) : (
                <AdminView
                  currentUser={currentUser}
                  isAdmin={isAdmin}
                  reports={reports}
                  users={liveUsers}
                  questions={adminAllQuestions.length > 0 ? adminAllQuestions : allQuestions}
                  creditTransactions={creditTransactions}
                  rewardAdjustments={rewardAdjustments}
                  adminMessages={adminMessages}
                  onSignInGoogle={handleGoogleSignIn}
                  onResolveReport={async (rep, action) => {
                    await resolveReportAction(rep, action);
                    showNotice(`Report marked ${action}.`);
                  }}
                  onToggleSuspendUser={async (u) => {
                    await adminToggleUserSuspension(u);
                    showNotice(u.isSuspended ? 'User restored.' : 'User suspended.');
                  }}
                  onSetQuestionVisibility={async (id, status, isPublic) => {
                    await adminSetQuestionVisibility(id, status, isPublic);
                    showNotice('Question visibility updated.');
                  }}
                  onDeleteQuestion={async (id) => {
                    await deleteQuestionAsAdmin(id);
                    showNotice('Question deleted.');
                  }}
                  onAdjustReward={async (q, newTier, reason) => {
                    if (!currentUser) return;
                    await adminAdjustDoubtReward({
                      question: q,
                      newTier,
                      adminUser: currentUser,
                      adminName: profile?.displayName || currentUser.displayName || 'Admin',
                      reason,
                    });
                    showNotice(`Doubt reward adjusted to ${newTier}.`);
                  }}
                  onSendMessage={async (recipientId, recipientName, subject, body, doubtId) => {
                    if (!currentUser) return;
                    await sendAdminMessage({
                      recipientId,
                      recipientName,
                      senderUser: currentUser,
                      senderName: profile?.displayName || currentUser.displayName || 'NEXUS Admin',
                      subject,
                      body,
                      relatedDoubtId: doubtId,
                    });
                    showNotice('Admin message sent successfully.');
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* 2D Discussion Drawer */}
          <DiscussionDrawer
            open={Boolean(selectedQuestion)}
            question={selectedQuestion}
            answers={activeAnswers}
            repliesMap={activeRepliesMap}
            isQuestionLiked={
              selectedQuestion ? Boolean(likedQuestionIds[selectedQuestion.id]) : false
            }
            likedAnswerIds={likedAnswerIds}
            currentUser={currentUser}
            aiInsight={selectedQuestion ? aiInsightsMap[selectedQuestion.id] ?? null : null}
            aiLoading={aiLoading}
            aiError={aiError}
            integrations={integrations}
            onClose={() => setSelectedQuestionId(null)}
            onToggleQuestionLike={handleToggleQuestionLike}
            onToggleAnswerLike={handleToggleAnswerLike}
            onLoadAnswerReplies={handleLoadAnswerReplies}
            onSubmitAnswerReply={handleSubmitAnswerReply}
            onRequestAiInsight={handleRequestAiInsight}
            onRetryRewardAssessment={handleRetryRewardAssessment}
            onSubmitAnswer={handleSubmitAnswer}
            onMarkAsSolved={handleMarkAsSolved}
            onOpenReport={(type, id, preview) =>
              setReportTarget({ type, id, preview })
            }
            onSignInGoogle={handleGoogleSignIn}
            onSignInGuest={handleGuestSignIn}
          />
        </AppShell>
      )}

      <AskDoubtModal
        open={askModalOpen}
        currentUser={currentUser}
        integrations={integrations}
        onClose={() => setAskModalOpen(false)}
        onSignInGoogle={handleGoogleSignIn}
        onPublish={handlePublishDoubt}
      />

      <ReportModal
        open={Boolean(reportTarget)}
        targetType={reportTarget?.type ?? 'question'}
        preview={reportTarget?.preview ?? ''}
        onClose={() => setReportTarget(null)}
        onSubmit={handleSubmitReport}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <NexusWorkspace />
    </ErrorBoundary>
  );
}

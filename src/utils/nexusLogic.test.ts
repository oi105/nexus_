import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMailDigestContent,
  computeAssignedCredits,
  computeLikeTransition,
  computeTopSolvers,
  computeVaultStats,
  DIFFICULTY_REWARD_MAP,
  filterAndSortQuestions,
  formatAiRewardLabel,
  formatFileSize,
  formatRelativeTime,
  formatTimestampRange,
  getInitials,
  isSafeExternalUrl,
  isValidCloudinaryCredentialPair,
  parseTimestampInput,
  parseYouTubeUrl,
  resolveLegacyLikeCount,
  sanitizeAttachmentTimestamps,
  sortAnswers,
  summarizeUploadedDoubtResponses,
  validateAttachmentFile,
  validateQuestionDraft,
} from './nexusLogic';
import type { Answer, CreditTransaction, Question, UserProfile } from '../types/nexus';

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    authorId: 'u1',
    authorName: 'Aarav Sharma',
    title: 'How to avoid memory leaks in doubly linked list deletion?',
    description: 'Working through C++ pointers and valgrind flags.',
    topic: 'C++',
    tags: ['pointers', 'memory'],
    urgency: 'normal',
    status: 'open',
    difficultyTier: 'STANDARD',
    assignedCredits: 10,
    assessmentStatus: 'completed',
    attachments: [],
    likeCount: 4,
    answerCount: 2,
    hasAiInsight: false,
    isPublic: true,
    moderationStatus: 'active',
    createdAtMs: 1_000_000,
    updatedAtMs: 1_000_000,
    ...overrides,
  };
}

test('DIFFICULTY_REWARD_MAP and computeAssignedCredits enforce fixed tier rewards', () => {
  assert.deepEqual(DIFFICULTY_REWARD_MAP, {
    QUICK_FIX: 5,
    STANDARD: 10,
    CHALLENGING: 20,
    ADVANCED: 30,
  });
  assert.equal(computeAssignedCredits('QUICK_FIX'), 5);
  assert.equal(computeAssignedCredits('STANDARD'), 10);
  assert.equal(computeAssignedCredits('CHALLENGING'), 20);
  assert.equal(computeAssignedCredits('ADVANCED'), 30);
  assert.equal(computeAssignedCredits('INVALID_TIER'), 0);

  assert.equal(
    formatAiRewardLabel({
      assessmentStatus: 'completed',
      difficultyTier: 'CHALLENGING',
      assignedCredits: 20,
    }),
    'AI estimated · Challenging · 20 credits',
  );
  assert.equal(
    formatAiRewardLabel({ assessmentStatus: 'pending', assignedCredits: 0 }),
    'AI assessment pending',
  );
});

test('computeTopSolvers ranks by credits desc, solvedCount desc, earlier achievement asc, and filters This Month', () => {
  const now = new Date(2026, 10, 23, 12, 0, 0).getTime(); // Nov 23, 2026
  const lastMonth = new Date(2026, 9, 15, 12, 0, 0).getTime(); // Oct 15, 2026

  const users: UserProfile[] = [
    {
      uid: 'u1',
      displayName: 'Devansh Joshi',
      branch: 'CSE',
      year: '4th',
      bio: '',
      skills: [],
      reputation: 0,
      contributions: 0,
      creditsEarned: 30,
      totalCreditsEarned: 30,
      totalDoubtsSolved: 2,
      availableToHelp: true,
      isSuspended: false,
      isPublic: true,
      createdAtMs: lastMonth,
      updatedAtMs: now,
    },
  ];

  const txs: CreditTransaction[] = [
    {
      id: 'q1',
      userId: 'u1',
      userName: 'Devansh',
      doubtId: 'q1',
      doubtTitle: 'Doubt 1',
      acceptedAnswerId: 'a1',
      credits: 10,
      difficultyTier: 'STANDARD',
      transactionType: 'DOUBT_SOLVED',
      createdAtMs: lastMonth,
    },
    {
      id: 'q2',
      userId: 'u1',
      userName: 'Devansh',
      doubtId: 'q2',
      doubtTitle: 'Doubt 2',
      acceptedAnswerId: 'a2',
      credits: 20,
      difficultyTier: 'CHALLENGING',
      transactionType: 'DOUBT_SOLVED',
      createdAtMs: now - 10_000,
    },
    {
      id: 'q3',
      userId: 'u2',
      userName: 'Meera Nair',
      doubtId: 'q3',
      doubtTitle: 'Doubt 3',
      acceptedAnswerId: 'a3',
      credits: 30,
      difficultyTier: 'ADVANCED',
      transactionType: 'DOUBT_SOLVED',
      createdAtMs: now - 5_000,
    },
    {
      id: 'q4',
      userId: 'u3',
      userName: 'Kabir Malhotra',
      doubtId: 'q4',
      doubtTitle: 'Doubt 4',
      acceptedAnswerId: 'a4',
      credits: 30,
      difficultyTier: 'ADVANCED',
      transactionType: 'DOUBT_SOLVED',
      createdAtMs: now - 20_000,
    },
  ];

  // All Time: u1 has 30 (2 solved), u2 has 30 (1 solved), u3 has 30 (1 solved) -> u1 #1 (more solves), then u3 #2 (earlier timestamp than u2)
  const allTime = computeTopSolvers(txs, users, 'all_time', now);
  assert.deepEqual(
    allTime.map((s) => [s.rank, s.userId, s.totalCredits, s.solvedCount]),
    [
      [1, 'u1', 30, 2],
      [2, 'u3', 30, 1],
      [3, 'u2', 30, 1],
    ],
  );
  assert.equal(allTime[0].displayName, 'Devansh Joshi');

  // This Month: excludes q1 (Oct), so u1 has 20, while u3 (30, earlier) is #1 and u2 (30, later) is #2
  const thisMonth = computeTopSolvers(txs, users, 'month', now);
  assert.deepEqual(
    thisMonth.map((s) => [s.rank, s.userId, s.totalCredits]),
    [
      [1, 'u3', 30],
      [2, 'u2', 30],
      [3, 'u1', 20],
    ],
  );
});

test('computeLikeTransition enforces 1-like toggle and non-negative counts', () => {
  assert.deepEqual(computeLikeTransition(false, 5), { liked: true, likeCount: 6 });
  assert.deepEqual(computeLikeTransition(true, 6), { liked: false, likeCount: 5 });
  assert.deepEqual(computeLikeTransition(true, 0), { liked: false, likeCount: 0 });
});

test('resolveLegacyLikeCount migrates old vote/sameDoubt fields safely', () => {
  assert.equal(resolveLegacyLikeCount({ likeCount: 12, sameDoubtCount: 3 }), 12);
  assert.equal(resolveLegacyLikeCount({ sameDoubtCount: 7, upvoteCount: 9 }), 7);
  assert.equal(resolveLegacyLikeCount({ upvoteCount: 4 }), 4);
  assert.equal(resolveLegacyLikeCount({}), 0);
});

test('filterAndSortQuestions defaults to most_liked and breaks ties by newer question', () => {
  const questions: Question[] = [
    makeQuestion({ id: 'q1', topic: 'C++', answerCount: 2, likeCount: 4, createdAtMs: 500 }),
    makeQuestion({ id: 'q2', topic: 'DSA', answerCount: 0, likeCount: 12, createdAtMs: 200 }),
    makeQuestion({ id: 'q3', topic: 'DBMS', answerCount: 1, likeCount: 12, createdAtMs: 900 }),
    makeQuestion({
      id: 'q4',
      topic: 'Python',
      moderationStatus: 'removed',
      isPublic: false,
      likeCount: 99,
      createdAtMs: 1000,
    }),
  ];

  const mostLiked = filterAndSortQuestions(questions, {
    tab: 'most_liked',
    topic: 'All Topics',
    searchQuery: '',
  });
  assert.deepEqual(
    mostLiked.map((q) => q.id),
    ['q3', 'q2', 'q1'],
  );

  const newest = filterAndSortQuestions(questions, {
    tab: 'newest',
    topic: 'All Topics',
    searchQuery: '',
  });
  assert.deepEqual(
    newest.map((q) => q.id),
    ['q3', 'q1', 'q2'],
  );

  const unanswered = filterAndSortQuestions(questions, {
    tab: 'unanswered',
    topic: 'All Topics',
    searchQuery: '',
  });
  assert.deepEqual(
    unanswered.map((q) => q.id),
    ['q2'],
  );
});

test('sortAnswers prioritizes accepted answer then likeCount or newest', () => {
  const base: Omit<Answer, 'id' | 'likeCount' | 'isAccepted' | 'createdAtMs'> = {
    questionId: 'q1',
    authorId: 'u2',
    authorName: 'Meera Nair',
    authorIsGuest: false,
    body: 'Check boundary pointers before freeing head.',
    attachments: [],
    replyCount: 0,
    isPublic: true,
    moderationStatus: 'active',
    updatedAtMs: 1000,
  };

  const answers: Answer[] = [
    { ...base, id: 'a1', likeCount: 2, isAccepted: false, createdAtMs: 500 },
    { ...base, id: 'a2', likeCount: 8, isAccepted: false, createdAtMs: 200 },
    { ...base, id: 'a3', likeCount: 1, isAccepted: true, createdAtMs: 100 },
  ];

  assert.deepEqual(
    sortAnswers(answers, 'helpful').map((a) => a.id),
    ['a3', 'a2', 'a1'],
  );
  assert.deepEqual(
    sortAnswers(answers, 'newest').map((a) => a.id),
    ['a3', 'a1', 'a2'],
  );
});

test('parseYouTubeUrl handles watch, youtu.be, shorts and rejects non-YouTube domains', () => {
  const watch = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s');
  assert.equal(watch?.videoId, 'dQw4w9WgXcQ');
  assert.equal(watch?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');

  const shortLink = parseYouTubeUrl('https://youtu.be/8hly31xKli0');
  assert.equal(shortLink?.videoId, '8hly31xKli0');

  const shorts = parseYouTubeUrl('https://youtube.com/shorts/abcdefghijk');
  assert.equal(shorts?.videoId, 'abcdefghijk');

  assert.equal(parseYouTubeUrl('https://notyoutube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseYouTubeUrl('javascript:alert(1)'), null);
  assert.equal(parseYouTubeUrl('https://youtube.com/watch?v=invalid'), null);
});

test('isSafeExternalUrl blocks dangerous schemes and accepts http/https', () => {
  assert.equal(isSafeExternalUrl('https://cp-algorithms.com/graph/dijkstra.html'), 'https://cp-algorithms.com/graph/dijkstra.html');
  assert.equal(isSafeExternalUrl('http://example.edu/notes.pdf'), 'http://example.edu/notes.pdf');
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), null);
  assert.equal(isSafeExternalUrl('data:text/html,<script>'), null);
});

test('validateAttachmentFile enforces allowed formats and 10 MB limit', () => {
  assert.equal(
    validateAttachmentFile({ name: 'diagram.png', type: 'image/png', size: 250_000 }, 'image').valid,
    true,
  );
  assert.equal(
    validateAttachmentFile({ name: 'huge.jpg', type: 'image/jpeg', size: 12 * 1024 * 1024 }, 'image').valid,
    false,
  );
  assert.equal(
    validateAttachmentFile({ name: 'script.exe', type: 'application/x-msdownload', size: 1000 }, 'document').valid,
    false,
  );
  assert.equal(
    validateAttachmentFile({ name: 'lab-report.pdf', type: 'application/pdf', size: 512_000 }, 'document').valid,
    true,
  );
  assert.equal(formatFileSize(1536), '2 KB');
  assert.equal(formatFileSize(2 * 1024 * 1024), '2.0 MB');
});

test('formatRelativeTime, getInitials, and validateQuestionDraft work cleanly without manual bounty', () => {
  assert.equal(formatRelativeTime(10_000, 10_000 + 5 * 60_000), '5m ago');
  assert.equal(getInitials('Rohan Verma'), 'RV');

  const invalid = validateQuestionDraft({
    title: 'Hi',
    description: 'Too short',
    topic: 'All Topics',
    tags: [],
    urgency: 'normal',
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 3);

  const valid = validateQuestionDraft({
    title: 'How does BCNF decomposition check dependency preservation?',
    description: 'Working through functional dependencies on relation R(A,B,C,D,E).',
    topic: 'DBMS',
    tags: ['bcnf'],
    urgency: 'normal',
  });
  assert.equal(valid.valid, true);
});

test('parseTimestampInput, formatTimestampRange, and computeVaultStats work accurately', () => {
  assert.equal(parseTimestampInput('04:32'), 272);
  assert.equal(parseTimestampInput('01:02:03'), 3723);
  assert.equal(parseTimestampInput('90'), 90);
  assert.equal(parseTimestampInput('04:75'), null);
  assert.equal(parseTimestampInput('bad'), null);

  assert.equal(formatTimestampRange(272, 310), '04:32–05:10 · 38s');
  assert.equal(formatTimestampRange(45), 'Starts at 00:45');
  assert.equal(formatTimestampRange(undefined, 10), null);

  const txs: CreditTransaction[] = [
    {
      id: 't1',
      userId: 'u1',
      userName: 'A',
      doubtId: 'd1',
      doubtTitle: 'D1',
      acceptedAnswerId: 'a1',
      credits: 10,
      difficultyTier: 'STANDARD',
      transactionType: 'DOUBT_SOLVED',
      status: 'completed',
      createdAtMs: 1000,
    },
    {
      id: 't2',
      userId: 'u1',
      userName: 'A',
      doubtId: 'd2',
      doubtTitle: 'D2',
      acceptedAnswerId: 'a2',
      credits: 20,
      difficultyTier: 'CHALLENGING',
      transactionType: 'DOUBT_SOLVED',
      status: 'pending_link',
      createdAtMs: 2000,
    },
    {
      id: 't3',
      userId: 'u1',
      userName: 'A',
      doubtId: 'd3',
      doubtTitle: 'D3',
      acceptedAnswerId: 'a3',
      credits: 30,
      difficultyTier: 'ADVANCED',
      transactionType: 'DOUBT_SOLVED',
      status: 'held',
      createdAtMs: 3000,
    },
  ];

  const vault = computeVaultStats(txs, 'u1');
  assert.equal(vault.verifiedCredits, 10);
  assert.equal(vault.pendingCredits, 20);
  assert.equal(vault.heldCredits, 30);
  assert.equal(vault.solvedCount, 1);
  assert.equal(vault.tierCounts.STANDARD, 1);
});

test('isValidCloudinaryCredentialPair rejects placeholder/non-numeric apiKey like Gourav', () => {
  assert.deepEqual(
    isValidCloudinaryCredentialPair({
      cloudName: 'demo-cloud',
      apiKey: 'Gourav',
      apiSecret: 'secret_value_123',
    }),
    { configured: false, mode: null },
  );

  assert.deepEqual(
    isValidCloudinaryCredentialPair({
      cloudName: 'demo-cloud',
      apiKey: '123456789012345',
      apiSecret: 'validSecret9876',
    }),
    { configured: true, mode: 'signed' },
  );

  assert.deepEqual(
    isValidCloudinaryCredentialPair({
      cloudName: 'Gourav',
      uploadPreset: 'nexus_preset',
    }),
    { configured: false, mode: null },
  );

  assert.deepEqual(
    isValidCloudinaryCredentialPair({
      cloudName: 'demo-cloud',
      uploadPreset: 'nexus_preset',
    }),
    { configured: true, mode: 'unsigned' },
  );
});

test('sanitizeAttachmentTimestamps preserves valid ranges and drops invalid ends', () => {
  assert.deepEqual(sanitizeAttachmentTimestamps(65, 130), {
    startSeconds: 65,
    endSeconds: 130,
  });
  assert.deepEqual(sanitizeAttachmentTimestamps(100, 80), {
    startSeconds: 100,
  });
  assert.deepEqual(sanitizeAttachmentTimestamps(undefined, 90), {
    startSeconds: 0,
    endSeconds: 90,
  });
  assert.deepEqual(sanitizeAttachmentTimestamps(-5, NaN), {});
});

test('summarizeUploadedDoubtResponses and buildMailDigestContent summarize uploaded doubts accurately', () => {
  const d1 = makeQuestion({
    id: 'd1',
    title: 'How do smart pointers avoid cycles in C++?',
    topic: 'C++',
    status: 'resolved',
    answerCount: 2,
    assignedCredits: 20,
  });
  const d2 = makeQuestion({
    id: 'd2',
    title: 'Why is my B+ tree rebalance failing?',
    topic: 'DBMS',
    status: 'open',
    answerCount: 0,
    assignedCredits: 10,
  });

  const ans: Answer = {
    id: 'a1',
    questionId: 'd1',
    authorId: 'u2',
    authorName: 'Riya Kulkarni',
    authorIsGuest: false,
    body: 'Use std::weak_ptr on the back-reference edge.',
    attachments: [],
    likeCount: 3,
    replyCount: 0,
    isAccepted: true,
    isPublic: true,
    moderationStatus: 'active',
    createdAtMs: 5000,
    updatedAtMs: 5000,
  };

  const summary = summarizeUploadedDoubtResponses([d1, d2], { d1: [ans] });
  assert.equal(summary.totalDoubts, 2);
  assert.equal(summary.resolvedDoubts, 1);
  assert.equal(summary.openDoubts, 1);
  assert.equal(summary.totalIncomingResponses, 2);
  assert.equal(summary.unansweredDoubts, 1);

  const digest = buildMailDigestContent({
    recipientName: 'Gourav',
    doubts: [d1, d2],
    answersByDoubt: { d1: [ans] },
  });
  assert.match(digest.subject, /2 peer responses across 2 uploaded doubts/);
  assert.match(digest.body, /Hi Gourav,/);
  assert.match(digest.body, /Riya Kulkarni/);
});



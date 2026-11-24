import type {
  Answer,
  CreditTransaction,
  DifficultyTier,
  FeedTab,
  Question,
  TopSolverEntry,
  UrgencyLevel,
  UserProfile,
} from '../types/nexus';

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_POST = 6;

export const DIFFICULTY_REWARD_MAP: Record<DifficultyTier, number> = {
  QUICK_FIX: 5,
  STANDARD: 10,
  CHALLENGING: 20,
  ADVANCED: 30,
};

export const DIFFICULTY_LABELS: Record<DifficultyTier, string> = {
  QUICK_FIX: 'Quick Fix',
  STANDARD: 'Standard',
  CHALLENGING: 'Challenging',
  ADVANCED: 'Advanced',
};

export function computeAssignedCredits(tier: DifficultyTier | string | undefined): number {
  if (!tier || !(tier in DIFFICULTY_REWARD_MAP)) {
    return 0;
  }
  return DIFFICULTY_REWARD_MAP[tier as DifficultyTier];
}

export function formatAiRewardLabel(question: {
  assessmentStatus?: string;
  difficultyTier?: DifficultyTier;
  assignedCredits?: number;
}): string {
  if (question.assessmentStatus === 'completed' && question.difficultyTier) {
    const label = DIFFICULTY_LABELS[question.difficultyTier] ?? 'Standard';
    const credits = question.assignedCredits ?? computeAssignedCredits(question.difficultyTier);
    return `AI estimated · ${label} · ${credits} credits`;
  }
  return 'AI assessment pending';
}

export type LeaderboardPeriod = 'all_time' | 'month';

export function computeTopSolvers(
  transactions: CreditTransaction[],
  users: UserProfile[],
  period: LeaderboardPeriod,
  nowMs: number = Date.now(),
): TopSolverEntry[] {
  const nowDate = new Date(nowMs);
  const monthStartMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();

  const userLookup = new Map<string, UserProfile>();
  for (const u of users) {
    if (!u.isDemo) {
      userLookup.set(u.uid, u);
    }
  }

  const buckets = new Map<
    string,
    {
      userId: string;
      displayName: string;
      photoURL?: string;
      totalCredits: number;
      solvedCount: number;
      latestAchievementMs: number;
    }
  >();

  for (const tx of transactions) {
    if (tx.transactionType !== 'DOUBT_SOLVED' || tx.credits <= 0 || !tx.userId) {
      continue;
    }
    if (tx.status === 'held' || tx.status === 'pending_link') {
      continue;
    }
    if (period === 'month' && tx.createdAtMs < monthStartMs) {
      continue;
    }

    const profile = userLookup.get(tx.userId);
    const existing = buckets.get(tx.userId);
    if (!existing) {
      buckets.set(tx.userId, {
        userId: tx.userId,
        displayName: profile?.displayName || tx.userName || 'NEXUS Solver',
        photoURL: profile?.photoURL || tx.userPhotoURL,
        totalCredits: tx.credits,
        solvedCount: 1,
        latestAchievementMs: tx.createdAtMs,
      });
    } else {
      existing.totalCredits += tx.credits;
      existing.solvedCount += 1;
      existing.latestAchievementMs = Math.max(existing.latestAchievementMs, tx.createdAtMs);
      if (profile?.displayName) existing.displayName = profile.displayName;
      if (profile?.photoURL) existing.photoURL = profile.photoURL;
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => {
    if (b.totalCredits !== a.totalCredits) {
      return b.totalCredits - a.totalCredits;
    }
    if (b.solvedCount !== a.solvedCount) {
      return b.solvedCount - a.solvedCount;
    }
    // Earlier achievement timestamp wins ties
    return a.latestAchievementMs - b.latestAchievementMs;
  });

  return sorted.map((entry, idx) => ({
    rank: idx + 1,
    ...entry,
  }));
}

export interface LikeTransitionResult {
  liked: boolean;
  likeCount: number;
}

export function computeLikeTransition(
  currentlyLiked: boolean,
  currentCount: number,
): LikeTransitionResult {
  const safeCount = Math.max(0, Math.floor(currentCount));
  if (currentlyLiked) {
    return {
      liked: false,
      likeCount: Math.max(0, safeCount - 1),
    };
  }
  return {
    liked: true,
    likeCount: safeCount + 1,
  };
}

export function resolveLegacyLikeCount(data: Record<string, unknown>): number {
  if (typeof data.likeCount === 'number' && Number.isFinite(data.likeCount)) {
    return Math.max(0, Math.floor(data.likeCount));
  }
  const sameDoubt = typeof data.sameDoubtCount === 'number' ? data.sameDoubtCount : 0;
  const upvotes = typeof data.upvoteCount === 'number' ? data.upvoteCount : 0;
  return Math.max(0, Math.floor(sameDoubt > 0 ? sameDoubt : upvotes));
}

export interface FeedFilterOptions {
  tab: FeedTab;
  topic: string;
  searchQuery: string;
}

export function filterAndSortQuestions(
  questions: Question[],
  options: FeedFilterOptions,
): Question[] {
  const query = options.searchQuery.trim().toLowerCase();
  const topicFilter = options.topic;

  const filtered = questions.filter((q) => {
    if (q.moderationStatus === 'removed' || !q.isPublic) {
      return false;
    }

    if (topicFilter && topicFilter !== 'All Topics') {
      if (q.topic.toLowerCase() !== topicFilter.toLowerCase()) {
        return false;
      }
    }

    if (options.tab === 'unanswered' && q.answerCount > 0) {
      return false;
    }
    if (options.tab === 'resolved' && q.status !== 'resolved') {
      return false;
    }

    if (query.length > 0) {
      const haystack = [
        q.title,
        q.description,
        q.topic,
        q.authorName,
        ...q.tags,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });

  const sorted = [...filtered];

  if (options.tab === 'newest') {
    sorted.sort((a, b) => b.createdAtMs - a.createdAtMs);
  } else {
    // 'most_liked' (default) and 'unanswered': rank by total like count descending, tie-break newer
    sorted.sort((a, b) => {
      if (b.likeCount !== a.likeCount) {
        return b.likeCount - a.likeCount;
      }
      return b.createdAtMs - a.createdAtMs;
    });
  }

  return sorted;
}

export function sortAnswers(
  answers: Answer[],
  sortBy: 'helpful' | 'newest',
): Answer[] {
  const visible = answers.filter(
    (a) => a.moderationStatus !== 'removed' && a.isPublic,
  );
  return [...visible].sort((a, b) => {
    if (a.isAccepted !== b.isAccepted) {
      return a.isAccepted ? -1 : 1;
    }
    if (sortBy === 'newest') {
      return b.createdAtMs - a.createdAtMs;
    }
    if (b.likeCount !== a.likeCount) {
      return b.likeCount - a.likeCount;
    }
    return b.createdAtMs - a.createdAtMs;
  });
}

export interface ParsedYouTubeInfo {
  videoId: string;
  canonicalUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
}

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function parseYouTubeUrl(rawUrl: string): ParsedYouTubeInfo | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  let videoId: string | null = null;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const seg = parsed.pathname.split('/').filter(Boolean)[0];
    if (seg) videoId = seg;
  } else if (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com'
  ) {
    if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    } else if (parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1] ?? null;
    } else if (parsed.pathname.startsWith('/embed/')) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1] ?? null;
    }
  } else {
    return null;
  }

  if (!videoId || !YOUTUBE_ID_REGEX.test(videoId)) {
    return null;
  }

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export function isSafeExternalUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt'];

export function inferDocumentMimeType(fileName: string, reportedType: string): string {
  if (reportedType && (IMAGE_MIME_TYPES.has(reportedType.toLowerCase()) || DOCUMENT_MIME_TYPES.has(reportedType.toLowerCase()))) {
    return reportedType.toLowerCase();
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (lower.endsWith('.txt')) return 'text/plain';
  return reportedType || 'application/octet-stream';
}

export function validateAttachmentFile(
  file: { name: string; type: string; size: number },
  kind: 'image' | 'document',
): { valid: true; mimeType: string } | { valid: false; error: string } {
  const lowerName = file.name.toLowerCase();
  const mime = inferDocumentMimeType(file.name, file.type);

  if (file.size <= 0) {
    return { valid: false, error: `${file.name} is empty.` };
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: `${file.name} exceeds the 10 MB maximum file size.`,
    };
  }

  if (kind === 'image') {
    const extOk = IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!IMAGE_MIME_TYPES.has(mime) && !extOk) {
      return {
        valid: false,
        error: `${file.name} is not a supported image (JPG, JPEG, PNG, WEBP).`,
      };
    }
    return { valid: true, mimeType: mime };
  }

  const docExtOk = DOCUMENT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!DOCUMENT_MIME_TYPES.has(mime) && !docExtOk) {
    return {
      valid: false,
      error: `${file.name} is not a supported document (PDF, DOC, DOCX, PPT, PPTX, TXT).`,
    };
  }
  return { valid: true, mimeType: mime };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.max(1, Math.round(kb))} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function formatRelativeTime(
  timestampMs: number,
  nowMs: number = Date.now(),
): string {
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NX';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_TONES = [
  { bg: '#EEF2FD', text: '#2445C2', border: '#D4DDF9' },
  { bg: '#FFF0ED', text: '#C4422C', border: '#FAD5CE' },
  { bg: '#F2F0FC', text: '#5D4CC2', border: '#DED9F8' },
  { bg: '#EDF3EA', text: '#2F5E24', border: '#D4E4CD' },
  { bg: '#F1F3F7', text: '#172033', border: '#DFE5F0' },
];

export function getAvatarTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export interface QuestionDraftInput {
  title: string;
  description: string;
  topic: string;
  tags: string[];
  urgency: UrgencyLevel;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateQuestionDraft(draft: QuestionDraftInput): ValidationResult {
  const errors: string[] = [];
  const title = draft.title.trim();
  const description = draft.description.trim();

  if (title.length < 5 || title.length > 180) {
    errors.push('Question title must be between 5 and 180 characters.');
  }
  if (description.length < 10 || description.length > 5000) {
    errors.push('Detailed description must be between 10 and 5,000 characters.');
  }
  if (!draft.topic || draft.topic === 'All Topics') {
    errors.push('Select a valid engineering or academic topic.');
  }
  if (draft.tags.length > 8) {
    errors.push('You can attach up to 8 skill tags.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function parseTimestampInput(raw: string): number | null {
  const clean = raw.trim();
  if (!clean) return null;
  if (/^\d+$/.test(clean)) {
    const val = Number(clean);
    return Number.isFinite(val) && val >= 0 ? val : null;
  }
  const parts = clean.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (parts.length === 2) {
    const [m, s] = nums;
    if (s >= 60) return null;
    return m * 60 + s;
  }
  const [h, m, s] = nums;
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}

export function formatSecondsClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatTimestampRange(startSeconds?: number, endSeconds?: number): string | null {
  if (typeof startSeconds !== 'number' || startSeconds < 0) return null;
  const startLabel = formatSecondsClock(startSeconds);
  if (typeof endSeconds === 'number' && endSeconds > startSeconds) {
    const dur = endSeconds - startSeconds;
    return `${startLabel}–${formatSecondsClock(endSeconds)} · ${dur}s`;
  }
  return `Starts at ${startLabel}`;
}

export interface VaultStats {
  verifiedCredits: number;
  pendingCredits: number;
  heldCredits: number;
  solvedCount: number;
  tierCounts: Record<DifficultyTier, number>;
}

export function computeVaultStats(
  transactions: CreditTransaction[],
  uid: string | undefined,
): VaultStats {
  const stats: VaultStats = {
    verifiedCredits: 0,
    pendingCredits: 0,
    heldCredits: 0,
    solvedCount: 0,
    tierCounts: {
      QUICK_FIX: 0,
      STANDARD: 0,
      CHALLENGING: 0,
      ADVANCED: 0,
    },
  };
  if (!uid) return stats;
  for (const tx of transactions) {
    if (tx.userId !== uid || tx.transactionType !== 'DOUBT_SOLVED') continue;
    if (tx.status === 'pending_link') {
      stats.pendingCredits += tx.credits;
    } else if (tx.status === 'held') {
      stats.heldCredits += tx.credits;
    } else {
      stats.verifiedCredits += tx.credits;
      stats.solvedCount += 1;
      if (tx.difficultyTier in stats.tierCounts) {
        stats.tierCounts[tx.difficultyTier] += 1;
      }
    }
  }
  return stats;
}

export function isValidCloudinaryCredentialPair(params: {
  cloudName?: string | null;
  apiKey?: string | null;
  apiSecret?: string | null;
  uploadPreset?: string | null;
}): { configured: boolean; mode: 'signed' | 'unsigned' | null } {
  const cloudName = (params.cloudName ?? '').trim();
  const apiKey = (params.apiKey ?? '').trim();
  const apiSecret = (params.apiSecret ?? '').trim();
  const uploadPreset = (params.uploadPreset ?? '').trim();

  const validCloudName = /^[a-z0-9][a-z0-9_-]{2,48}$/.test(cloudName);
  if (!validCloudName || /^(your_|my_|placeholder|cloud_name)/i.test(cloudName)) {
    return { configured: false, mode: null };
  }

  const validSigned =
    /^\d{6,24}$/.test(apiKey) &&
    apiSecret.length >= 8 &&
    !/^(your_|my_|placeholder|test)/i.test(apiSecret);

  if (validSigned) {
    return { configured: true, mode: 'signed' };
  }

  const validUnsigned =
    /^[a-z0-9_-]{2,64}$/i.test(uploadPreset) &&
    !/^(your_|my_|placeholder)/i.test(uploadPreset);

  if (validUnsigned) {
    return { configured: true, mode: 'unsigned' };
  }

  return { configured: false, mode: null };
}

export function sanitizeAttachmentTimestamps(
  startSeconds?: unknown,
  endSeconds?: unknown,
): { startSeconds?: number; endSeconds?: number } {
  const validStart =
    typeof startSeconds === 'number' &&
    Number.isFinite(startSeconds) &&
    startSeconds >= 0
      ? Math.floor(startSeconds)
      : undefined;
  const validEnd =
    typeof endSeconds === 'number' &&
    Number.isFinite(endSeconds) &&
    endSeconds > (validStart ?? 0)
      ? Math.floor(endSeconds)
      : undefined;

  if (validStart === undefined && validEnd !== undefined) {
    return { startSeconds: 0, endSeconds: validEnd };
  }
  return {
    ...(validStart !== undefined ? { startSeconds: validStart } : {}),
    ...(validEnd !== undefined ? { endSeconds: validEnd } : {}),
  };
}

export interface UploadedDoubtSummary {
  totalDoubts: number;
  resolvedDoubts: number;
  openDoubts: number;
  totalIncomingResponses: number;
  unansweredDoubts: number;
}

export function summarizeUploadedDoubtResponses(
  doubts: Question[],
  answersByDoubt: Record<string, Answer[]>,
): UploadedDoubtSummary {
  let resolvedDoubts = 0;
  let totalIncomingResponses = 0;
  let unansweredDoubts = 0;

  for (const d of doubts) {
    if (d.status === 'resolved') {
      resolvedDoubts += 1;
    }
    const loadedAnswers = answersByDoubt[d.id]?.length ?? 0;
    const count = Math.max(d.answerCount || 0, loadedAnswers);
    totalIncomingResponses += count;
    if (count === 0) {
      unansweredDoubts += 1;
    }
  }

  return {
    totalDoubts: doubts.length,
    resolvedDoubts,
    openDoubts: Math.max(0, doubts.length - resolvedDoubts),
    totalIncomingResponses,
    unansweredDoubts,
  };
}

export function buildMailDigestContent(params: {
  recipientName: string;
  doubts: Question[];
  answersByDoubt: Record<string, Answer[]>;
}): { subject: string; body: string } {
  const summary = summarizeUploadedDoubtResponses(params.doubts, params.answersByDoubt);
  const name = params.recipientName.trim() || 'NEXUS Student';
  const subject = `NEXUS Doubt Digest: ${summary.totalIncomingResponses} peer ${
    summary.totalIncomingResponses === 1 ? 'response' : 'responses'
  } across ${summary.totalDoubts} uploaded ${
    summary.totalDoubts === 1 ? 'doubt' : 'doubts'
  }`;

  const lines: string[] = [
    `Hi ${name},`,
    '',
    'Here is your live NEXUS uploaded doubts & response activity digest:',
    `- Uploaded doubts: ${summary.totalDoubts}`,
    `- Open doubts: ${summary.openDoubts}`,
    `- Resolved doubts: ${summary.resolvedDoubts}`,
    `- Total peer responses: ${summary.totalIncomingResponses}`,
    '',
  ];

  if (params.doubts.length === 0) {
    lines.push('You have not uploaded any doubts yet.');
  } else {
    lines.push('Recent Uploaded Doubts:');
    for (const q of params.doubts.slice(0, 6)) {
      const answers = answersByDoubtSafe(params.answersByDoubt, q.id);
      const count = Math.max(q.answerCount || 0, answers.length);
      lines.push(
        `* [${q.topic}] ${q.title} — ${q.status.toUpperCase()} (${count} ${
          count === 1 ? 'response' : 'responses'
        }${q.assignedCredits > 0 ? `, +${q.assignedCredits} credits` : ''})`,
      );
      if (answers.length > 0) {
        const latest = answers[0];
        const preview = latest.body.replace(/\s+/g, ' ').trim().slice(0, 140);
        lines.push(`  Latest from ${latest.authorName}: "${preview}"`);
      }
    }
  }

  lines.push('', '— Sent via NEXUS Peer Doubt Library');
  return {
    subject: subject.slice(0, 180),
    body: lines.join('\n').slice(0, 6000),
  };
}

function answersByDoubtSafe(
  map: Record<string, Answer[]>,
  doubtId: string,
): Answer[] {
  return Array.isArray(map[doubtId]) ? map[doubtId] : [];
}



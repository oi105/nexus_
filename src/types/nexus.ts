export type NavView = 'discover' | 'leaders' | 'activity' | 'profile' | 'admin';

export type FeedTab = 'most_liked' | 'newest' | 'unanswered' | 'resolved';

export const SUPPORTED_TOPICS = [
  'All Topics',
  'Programming',
  'C++',
  'Python',
  'DSA',
  'Debugging',
  'CAD and AutoCAD',
  'UI/UX',
  'Mathematics',
  'DBMS',
  'Engineering concepts',
] as const;

export type TopicName = (typeof SUPPORTED_TOPICS)[number];

export type UrgencyLevel = 'normal' | 'urgent' | 'critical';
export type QuestionStatus = 'open' | 'resolved';
export type ModerationStatus = 'active' | 'flagged' | 'removed';

export type DifficultyTier = 'QUICK_FIX' | 'STANDARD' | 'CHALLENGING' | 'ADVANCED';
export type AssessmentStatus = 'pending' | 'completed' | 'failed';

export type RichAttachmentType = 'image' | 'document' | 'youtube' | 'link';

export interface RichAttachment {
  id: string;
  type: RichAttachmentType;
  fileName: string;
  secureUrl: string;
  cloudinaryPublicId?: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  createdAtMs: number;
  youtubeId?: string;
  startSeconds?: number;
  endSeconds?: number;
  linkTitle?: string;
  linkDomain?: string;
  linkDescription?: string;
  thumbnailUrl?: string;
}

export interface AiInsight {
  questionId: string;
  suggestedExplanation: string;
  importantClues: string[];
  stepByStepApproach: string[];
  possibleErrors: string[];
  helpfulNextSteps: string[];
  analyzedAttachments?: string[];
  skippedAttachments?: string[];
  model: string;
  generatedAtMs: number;
}

export interface Question {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  authorBranch?: string;
  title: string;
  description: string;
  topic: string;
  tags: string[];
  urgency: UrgencyLevel;
  status: QuestionStatus;
  difficultyTier?: DifficultyTier;
  difficultyReason?: string;
  estimatedComplexity?: string;
  assignedCredits: number;
  assessmentStatus: AssessmentStatus;
  assessmentTimestampMs?: number;
  acceptedAnswerId?: string;
  resolvedAtMs?: number;
  attachments: RichAttachment[];
  likeCount: number;
  answerCount: number;
  hasAiInsight: boolean;
  isPublic: boolean;
  moderationStatus: ModerationStatus;
  createdAtMs: number;
  updatedAtMs: number;
  isDemo?: boolean;
}

export interface AnswerReply {
  id: string;
  questionId: string;
  answerId: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  authorIsGuest: boolean;
  body: string;
  isPublic: boolean;
  createdAtMs: number;
  isDemo?: boolean;
}

export interface Answer {
  id: string;
  questionId: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  authorIsGuest: boolean;
  authorBranch?: string;
  body: string;
  attachments: RichAttachment[];
  likeCount: number;
  replyCount: number;
  isAccepted: boolean;
  isPublic: boolean;
  moderationStatus: ModerationStatus;
  createdAtMs: number;
  updatedAtMs: number;
  isDemo?: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  branch: string;
  year: string;
  bio: string;
  skills: string[];
  reputation: number;
  contributions: number;
  creditsEarned: number;
  totalCreditsEarned: number;
  totalDoubtsSolved: number;
  availableToHelp: boolean;
  isSuspended: boolean;
  isPublic: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  isDemo?: boolean;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  doubtId: string;
  doubtTitle: string;
  acceptedAnswerId: string;
  credits: number;
  difficultyTier: DifficultyTier;
  transactionType: 'DOUBT_SOLVED';
  status?: 'completed' | 'pending_link' | 'held';
  flag?: string;
  createdAtMs: number;
}

export interface AiConsent {
  version: string;
  atMs: number;
}

export interface SimilarityMatch {
  doubtId: string;
  title: string;
  status: 'open' | 'answered' | 'solved' | 'disputed';
  likeCount: number;
  answerCount: number;
  reason: string;
  isSolved: boolean;
  similarity: number;
  verdict?: 'same_problem' | 'related' | 'different';
}

export interface ImageAnalysisResult {
  legible: boolean;
  confidence: 'low' | 'medium' | 'high';
  contentType: string;
  subject: string;
  transcribedText: string;
  suggestedTitle: string;
  suggestedDescription: string;
  stuckPoint: string;
  suggestedCategory: string;
  suggestedTags: string[];
  missingInfoQuestions: string[];
  containsPersonalInfo: boolean;
}


export interface RewardAdjustment {
  id: string;
  doubtId: string;
  doubtTitle?: string;
  previousTier: string;
  newTier: DifficultyTier;
  previousCredits: number;
  newCredits: number;
  adminUserId: string;
  adminName?: string;
  reason: string;
  createdAtMs: number;
}

export interface AdminMessage {
  id: string;
  recipientId: string;
  recipientName: string;
  senderId: string;
  senderName: string;
  subject: string;
  body: string;
  relatedDoubtId?: string;
  isRead: boolean;
  createdAtMs: number;
}

export interface TopSolverEntry {
  rank: number;
  userId: string;
  displayName: string;
  photoURL?: string;
  totalCredits: number;
  solvedCount: number;
  latestAchievementMs: number;
}

export interface ModerationReport {
  id: string;
  targetType: 'question' | 'answer' | 'reward';
  targetId: string;
  questionId: string;
  targetPreview: string;
  reason: string;
  reporterId: string;
  status: 'open' | 'dismissed' | 'actioned';
  createdAtMs: number;
  updatedAtMs: number;
}

export interface IntegrationStatus {
  geminiConfigured: boolean;
  cloudinaryConfigured: boolean;
  cloudinaryCloudName: string | null;
  cloudinaryMode?: 'signed' | 'unsigned' | null;
  directUploadReady?: boolean;
}

export interface PersonalMailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  unread: boolean;
  labelIds: string[];
}

export interface PersonalMailActivityResponse {
  connectedEmail: string;
  messagesTotal: number;
  messages: PersonalMailMessage[];
}


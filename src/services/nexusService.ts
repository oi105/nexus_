import {
  browserLocalPersistence,
  GoogleAuthProvider,
  linkWithPopup,
  setPersistence,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  getCachedGmailAccessToken,
  googleProvider,
  handleFirestoreError,
  OperationType,
  setCachedGmailAccessToken,
} from '../lib/firebase';
import type {
  AdminMessage,
  AiInsight,
  Answer,
  AnswerReply,
  CreditTransaction,
  DifficultyTier,
  IntegrationStatus,
  ModerationReport,
  ModerationStatus,
  PersonalMailActivityResponse,
  Question,
  RewardAdjustment,
  RichAttachment,
  UrgencyLevel,
  UserProfile,
} from '../types/nexus';
import {
  computeAssignedCredits,
  inferDocumentMimeType,
  isSafeExternalUrl,
  resolveLegacyLikeCount,
  sanitizeAttachmentTimestamps,
} from '../utils/nexusLogic';

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  return Date.now();
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function sanitizeAttachments(items: RichAttachment[]): RichAttachment[] {
  return items.slice(0, 6).map((item) => {
    const clean: RichAttachment = {
      id: item.id.slice(0, 64),
      type: item.type,
      fileName: item.fileName.slice(0, 140),
      secureUrl: item.secureUrl.slice(0, 600),
      mimeType: item.mimeType.slice(0, 120),
      fileSize: Math.max(0, Math.floor(item.fileSize || 0)),
      uploadedBy: item.uploadedBy.slice(0, 128),
      createdAtMs: item.createdAtMs || Date.now(),
    };
    if (item.cloudinaryPublicId) clean.cloudinaryPublicId = item.cloudinaryPublicId.slice(0, 200);
    if (item.youtubeId) clean.youtubeId = item.youtubeId.slice(0, 20);
    const ts = sanitizeAttachmentTimestamps(item.startSeconds, item.endSeconds);
    if (ts.startSeconds !== undefined) clean.startSeconds = ts.startSeconds;
    if (ts.endSeconds !== undefined) clean.endSeconds = ts.endSeconds;
    if (item.linkTitle) clean.linkTitle = item.linkTitle.slice(0, 180);
    if (item.linkDomain) clean.linkDomain = item.linkDomain.slice(0, 120);
    if (item.linkDescription) clean.linkDescription = item.linkDescription.slice(0, 280);
    if (item.thumbnailUrl) clean.thumbnailUrl = item.thumbnailUrl.slice(0, 600);
    return clean;
  });
}

function mapRichAttachmentsFromDoc(data: Record<string, unknown>): RichAttachment[] {
  if (Array.isArray(data.attachments) && data.attachments.length > 0) {
    return data.attachments
      .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === 'object'))
      .map((a, idx) => {
        const ts = sanitizeAttachmentTimestamps(a.startSeconds, a.endSeconds);
        return {
          id: String(a.id ?? `att-${idx}`),
          type: (a.type as RichAttachment['type']) || 'link',
          fileName: String(a.fileName ?? 'Attachment'),
          secureUrl: String(a.secureUrl ?? ''),
          cloudinaryPublicId: typeof a.cloudinaryPublicId === 'string' ? a.cloudinaryPublicId : undefined,
          mimeType: String(a.mimeType ?? 'application/octet-stream'),
          fileSize: Number(a.fileSize ?? 0),
          uploadedBy: String(a.uploadedBy ?? ''),
          createdAtMs: Number(a.createdAtMs ?? Date.now()),
          youtubeId: typeof a.youtubeId === 'string' ? a.youtubeId : undefined,
          ...(ts.startSeconds !== undefined ? { startSeconds: ts.startSeconds } : {}),
          ...(ts.endSeconds !== undefined ? { endSeconds: ts.endSeconds } : {}),
          linkTitle: typeof a.linkTitle === 'string' ? a.linkTitle : undefined,
          linkDomain: typeof a.linkDomain === 'string' ? a.linkDomain : undefined,
          linkDescription: typeof a.linkDescription === 'string' ? a.linkDescription : undefined,
          thumbnailUrl: typeof a.thumbnailUrl === 'string' ? a.thumbnailUrl : undefined,
        };
      });
  }

  const legacy: RichAttachment[] = [];
  if (Array.isArray(data.externalLinks)) {
    data.externalLinks.forEach((raw, idx) => {
      if (typeof raw !== 'string') return;
      const safe = isSafeExternalUrl(raw);
      if (!safe) return;
      try {
        const domain = new URL(safe).hostname.replace(/^www\./, '');
        legacy.push({
          id: `legacy-link-${idx}`,
          type: 'link',
          fileName: domain,
          secureUrl: safe,
          mimeType: 'text/uri-list',
          fileSize: 0,
          uploadedBy: String(data.authorId ?? ''),
          createdAtMs: toMillis(data.createdAt),
          linkTitle: domain,
          linkDomain: domain,
        });
      } catch {
        // ignore invalid legacy URL
      }
    });
  }
  return legacy;
}

let isGooglePopupInFlight = false;

export async function signInWithGoogle(): Promise<User> {
  if (isGooglePopupInFlight && auth.currentUser && !auth.currentUser.isAnonymous) {
    return auth.currentUser;
  }
  isGooglePopupInFlight = true;
  try {
    await setPersistence(auth, browserLocalPersistence);
    const current = auth.currentUser;
    if (current && current.isAnonymous) {
      try {
        const linked = await linkWithPopup(current, googleProvider);
        const cred = GoogleAuthProvider.credentialFromResult(linked);
        if (cred?.accessToken) {
          setCachedGmailAccessToken(cred.accessToken);
        }
        await ensureUserProfile(linked.user);
        return linked.user;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== 'auth/credential-already-in-use' && code !== 'auth/email-already-in-use') {
          throw err;
        }
      }
    }
    const res = await signInWithPopup(auth, googleProvider);
    const cred = GoogleAuthProvider.credentialFromResult(res);
    if (cred?.accessToken) {
      setCachedGmailAccessToken(cred.accessToken);
    }
    await ensureUserProfile(res.user);
    return res.user;
  } finally {
    isGooglePopupInFlight = false;
  }
}

export async function connectGmailAccount(): Promise<{ user: User; hasMailAccess: boolean }> {
  const user = await signInWithGoogle();
  return {
    user,
    hasMailAccess: Boolean(getCachedGmailAccessToken()),
  };
}

export async function signInAsGuest(): Promise<{ user: User | null; error?: string }> {
  try {
    const res = await signInAnonymously(auth);
    return { user: res.user };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
      return {
        user: null,
        error:
          'Anonymous guest authentication is disabled in the Firebase Console. Enable Anonymous sign-in under Authentication > Sign-in method, or sign in with Google.',
      };
    }
    return {
      user: null,
      error: err instanceof Error ? err.message : 'Unable to start anonymous guest session.',
    };
  }
}

export async function signOutUser(): Promise<void> {
  setCachedGmailAccessToken(null);
  await signOut(auth);
}

function mapUserProfile(data: Record<string, unknown>): UserProfile {
  const creditsEarned = Number(data.creditsEarned ?? 0);
  const totalCreditsEarned =
    typeof data.totalCreditsEarned === 'number'
      ? data.totalCreditsEarned
      : creditsEarned;
  const totalDoubtsSolved = Number(data.totalDoubtsSolved ?? 0);

  return {
    uid: String(data.uid ?? ''),
    displayName: String(data.displayName ?? 'Student'),
    photoURL: typeof data.photoURL === 'string' && data.photoURL ? data.photoURL : undefined,
    branch: String(data.branch ?? 'Engineering'),
    year: String(data.year ?? 'Student'),
    bio: String(data.bio ?? ''),
    skills: Array.isArray(data.skills) ? data.skills.map(String) : [],
    reputation: Number(data.reputation ?? 0),
    contributions: Number(data.contributions ?? 0),
    creditsEarned,
    totalCreditsEarned,
    totalDoubtsSolved,
    availableToHelp: Boolean(data.availableToHelp ?? true),
    isSuspended: Boolean(data.isSuspended ?? false),
    isPublic: Boolean(data.isPublic ?? true),
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

export async function ensureUserProfile(user: User): Promise<UserProfile | null> {
  if (user.isAnonymous) return null;
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const profilePayload = {
        uid: user.uid,
        displayName: (user.displayName || 'NEXUS Student').slice(0, 80),
        photoURL: (user.photoURL || '').slice(0, 500),
        branch: 'Engineering',
        year: 'Undergraduate',
        bio: 'Learning and solving doubts collaboratively on NEXUS.',
        skills: ['Programming'],
        reputation: 0,
        contributions: 0,
        creditsEarned: 0,
        totalCreditsEarned: 0,
        totalDoubtsSolved: 0,
        availableToHelp: true,
        isSuspended: false,
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, profilePayload);

      if (user.email) {
        try {
          await setDoc(privateRef, {
            uid: user.uid,
            email: user.email.slice(0, 160),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.warn('Non-fatal private profile sync warning:', err);
        }
      }

      const fresh = await getDoc(userRef);
      return fresh.exists() ? mapUserProfile(fresh.data()) : mapUserProfile(profilePayload);
    }

    if (user.email) {
      try {
        await setDoc(
          privateRef,
          {
            uid: user.uid,
            email: user.email.slice(0, 160),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        console.warn('Non-fatal private profile sync warning:', err);
      }
    }

    return mapUserProfile(snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: {
    displayName: string;
    branch: string;
    year: string;
    bio: string;
    skills: string[];
    availableToHelp: boolean;
  },
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: updates.displayName.trim().slice(0, 80) || 'Student',
      branch: updates.branch.trim().slice(0, 60),
      year: updates.year.trim().slice(0, 30),
      bio: updates.bio.trim().slice(0, 300),
      skills: updates.skills.map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 12),
      availableToHelp: updates.availableToHelp,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribePublicUsers(
  onData: (users: UserProfile[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'users'), where('isPublic', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => mapUserProfile(d.data()));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    },
  );
}

export function subscribeAllUsersForAdmin(
  onData: (users: UserProfile[]) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users'),
    (snapshot) => {
      onData(snapshot.docs.map((d) => mapUserProfile(d.data())));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    },
  );
}

export async function checkIsAdmin(user: User | null): Promise<boolean> {
  if (!user || user.isAnonymous || !user.emailVerified) return false;
  if (user.email === 'gouravsurajwani685@gmail.com') return true;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

function mapQuestion(id: string, data: Record<string, unknown>): Question {
  const rawStatus = String(data.status ?? 'open');
  const status: Question['status'] = rawStatus === 'resolved' ? 'resolved' : 'open';

  const rawTier = typeof data.difficultyTier === 'string' ? data.difficultyTier : undefined;
  const difficultyTier: DifficultyTier | undefined =
    rawTier === 'QUICK_FIX' ||
    rawTier === 'STANDARD' ||
    rawTier === 'CHALLENGING' ||
    rawTier === 'ADVANCED'
      ? rawTier
      : undefined;

  const assessmentStatus: Question['assessmentStatus'] =
    data.assessmentStatus === 'completed'
      ? 'completed'
      : data.assessmentStatus === 'failed'
        ? 'failed'
        : 'pending';

  const assignedCredits =
    typeof data.assignedCredits === 'number'
      ? data.assignedCredits
      : difficultyTier && assessmentStatus === 'completed'
        ? computeAssignedCredits(difficultyTier)
        : 0;

  return {
    id,
    authorId: String(data.authorId ?? ''),
    authorName: String(data.authorName ?? 'Student'),
    authorPhotoURL:
      typeof data.authorPhotoURL === 'string' && data.authorPhotoURL
        ? data.authorPhotoURL
        : undefined,
    authorBranch: typeof data.authorBranch === 'string' ? data.authorBranch : undefined,
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    topic: String(data.topic ?? 'Programming'),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    urgency: (data.urgency as UrgencyLevel) || 'normal',
    status,
    difficultyTier,
    difficultyReason:
      typeof data.difficultyReason === 'string' && data.difficultyReason
        ? data.difficultyReason
        : undefined,
    estimatedComplexity:
      typeof data.estimatedComplexity === 'string' && data.estimatedComplexity
        ? data.estimatedComplexity
        : undefined,
    assignedCredits,
    assessmentStatus,
    assessmentTimestampMs: data.assessmentTimestamp
      ? toMillis(data.assessmentTimestamp)
      : undefined,
    acceptedAnswerId:
      typeof data.acceptedAnswerId === 'string' && data.acceptedAnswerId
        ? data.acceptedAnswerId
        : undefined,
    resolvedAtMs: data.resolvedAt ? toMillis(data.resolvedAt) : undefined,
    attachments: mapRichAttachmentsFromDoc(data),
    likeCount: resolveLegacyLikeCount(data),
    answerCount: Number(data.answerCount ?? 0),
    hasAiInsight: Boolean(data.hasAiInsight ?? false),
    isPublic: Boolean(data.isPublic ?? true),
    moderationStatus: (data.moderationStatus as ModerationStatus) || 'active',
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

export function subscribeQuestions(
  onData: (questions: Question[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'questions'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => mapQuestion(d.id, d.data())));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'questions');
    },
  );
}

export function subscribeAllQuestionsForAdmin(
  onData: (questions: Question[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => mapQuestion(d.id, d.data())));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'questions');
    },
  );
}

export async function assessAndPersistDoubtReward(
  question: Question,
  options: { isRetry?: boolean } = {},
): Promise<{
  status: 'completed' | 'pending';
  difficultyTier?: DifficultyTier;
  assignedCredits?: number;
  error?: string;
}> {
  if (question.isDemo) {
    return { status: 'completed', difficultyTier: question.difficultyTier, assignedCredits: question.assignedCredits };
  }

  const res = await fetch('/api/nexus-ai/assess-doubt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      questionId: question.id,
      title: question.title,
      description: question.description,
      topic: question.topic,
      tags: question.tags,
      attachments: question.attachments,
      isRetry: Boolean(options.isRetry),
    }),
  });

  const payload = await res.json();
  if (!res.ok || payload.assessmentStatus !== 'completed' || !payload.difficultyTier) {
    return {
      status: 'pending',
      error: payload?.error || 'NEXUS AI difficulty assessment is currently pending.',
    };
  }

  const tier = payload.difficultyTier as DifficultyTier;
  const assignedCredits = computeAssignedCredits(tier);
  if (assignedCredits <= 0) {
    return { status: 'pending', error: 'Invalid difficulty tier returned by AI assessor.' };
  }

  try {
    const mergedTags = Array.from(
      new Set([
        ...question.tags,
        ...(Array.isArray(payload.relevantSkillTags)
          ? payload.relevantSkillTags
              .map((t: unknown) => String(t).trim().slice(0, 40))
              .filter(Boolean)
          : []),
      ]),
    ).slice(0, 8);

    await updateDoc(doc(db, 'questions', question.id), {
      difficultyTier: tier,
      difficultyReason: String(payload.difficultyReason || 'Assessed by NEXUS AI.').slice(0, 480),
      estimatedComplexity: String(payload.estimatedComplexity || 'Standard reasoning').slice(0, 110),
      assignedCredits,
      assessmentStatus: 'completed',
      assessmentTimestamp: serverTimestamp(),
      tags: mergedTags,
      updatedAt: serverTimestamp(),
    });

    return {
      status: 'completed',
      difficultyTier: tier,
      assignedCredits,
    };
  } catch (err) {
    console.warn('Could not persist AI reward assessment to Firestore:', err);
    return {
      status: 'pending',
      error: err instanceof Error ? err.message : 'Unable to save AI assessment.',
    };
  }
}

export const retryDoubtAiAssessment = assessAndPersistDoubtReward;


export async function createQuestion(params: {
  user: User;
  profile: UserProfile | null;
  title: string;
  description: string;
  topic: string;
  tags: string[];
  urgency: UrgencyLevel;
  attachments: RichAttachment[];
  generateAiInsight: boolean;
}): Promise<Question> {
  const id = makeId('q');
  const path = `questions/${id}`;
  const cleanTags = params.tags
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 8);
  const cleanAttachments = sanitizeAttachments(params.attachments);

  const safeAuthorName =
    (params.profile?.displayName || params.user.displayName || 'NEXUS Student')
      .trim()
      .slice(0, 80) || 'NEXUS Student';
  const safePhoto = (params.profile?.photoURL || params.user.photoURL || '').trim().slice(0, 500);
  const safeBranch = `${params.profile?.branch || 'Engineering'} · ${params.profile?.year || 'Student'}`
    .trim()
    .slice(0, 60);

  // Strictly match isValidQuestion allow/create rules in firestore.rules
  const payload = {
    id,
    authorId: params.user.uid,
    authorName: safeAuthorName,
    authorPhotoURL: safePhoto,
    authorBranch: safeBranch,
    title: params.title.trim().slice(0, 180),
    description: params.description.trim().slice(0, 5000),
    topic: params.topic.trim().slice(0, 40),
    tags: cleanTags,
    urgency: params.urgency,
    status: 'open',
    assignedCredits: 0,
    assessmentStatus: 'pending',
    attachments: cleanAttachments,
    likeCount: 0,
    answerCount: 0,
    hasAiInsight: false,
    isPublic: true,
    moderationStatus: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'questions', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  // Secondary profile stats increment is strictly isolated so it never aborts or misreports question creation
  try {
    if (!params.profile) {
      await ensureUserProfile(params.user);
    }
    await updateDoc(doc(db, 'users', params.user.uid), {
      contributions: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Non-fatal user contribution counter update warning:', err);
  }

  let question: Question = {
    id,
    authorId: params.user.uid,
    authorName: safeAuthorName,
    authorPhotoURL: safePhoto || undefined,
    authorBranch: safeBranch,
    title: payload.title,
    description: payload.description,
    topic: payload.topic,
    tags: cleanTags,
    urgency: params.urgency,
    status: 'open',
    assignedCredits: 0,
    assessmentStatus: 'pending',
    attachments: cleanAttachments,
    likeCount: 0,
    answerCount: 0,
    hasAiInsight: false,
    isPublic: true,
    moderationStatus: 'active',
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  };

  try {
    const createdSnap = await getDoc(doc(db, 'questions', id));
    if (createdSnap.exists()) {
      question = mapQuestion(id, createdSnap.data());
    }
  } catch (err) {
    console.warn('Post-create readback skipped:', err);
  }

  // Server-side AI difficulty & reward assessment runs asynchronously on publish
  void assessAndPersistDoubtReward(question, { isRetry: false }).catch((err) => {
    console.warn('Background AI difficulty assessment pending:', err);
  });

  if (params.generateAiInsight) {
    void requestAndStoreAiInsight(question).catch((e) => {
      console.warn('Background AI insight failed:', e);
    });
  }

  return question;
}

export async function checkQuestionLiked(questionId: string, uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'questions', questionId, 'likes', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function fetchLikedQuestionIds(
  questionIds: string[],
  uid: string,
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    questionIds.map(async (id) => [id, await checkQuestionLiked(id, uid)] as const),
  );
  return Object.fromEntries(entries);
}

// Race-safe atomic transaction: strictly 1 like ("I have this doubt too") per user per doubt
export async function toggleQuestionLike(
  questionId: string,
  uid: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const likeRef = doc(db, 'questions', questionId, 'likes', uid);
  const questionRef = doc(db, 'questions', questionId);

  try {
    return await runTransaction(db, async (tx) => {
      const [qSnap, likeSnap] = await Promise.all([tx.get(questionRef), tx.get(likeRef)]);
      if (!qSnap.exists()) {
        throw new Error('Question no longer exists.');
      }
      const qData = qSnap.data();
      const currentLikes = resolveLegacyLikeCount(qData);

      if (likeSnap.exists()) {
        const nextCount = Math.max(0, currentLikes - 1);
        tx.delete(likeRef);
        tx.update(questionRef, {
          likeCount: nextCount,
          updatedAt: serverTimestamp(),
        });
        return { liked: false, likeCount: nextCount };
      } else {
        const nextCount = currentLikes + 1;
        tx.set(likeRef, {
          userId: uid,
          createdAt: serverTimestamp(),
        });
        tx.update(questionRef, {
          likeCount: nextCount,
          updatedAt: serverTimestamp(),
        });
        return { liked: true, likeCount: nextCount };
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `questions/${questionId}/likes/${uid}`);
  }
}

export function subscribeAnswers(
  questionId: string,
  onData: (answers: Answer[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'questions', questionId, 'answers'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Answer[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          questionId: String(data.questionId ?? questionId),
          authorId: String(data.authorId ?? ''),
          authorName: String(data.authorName ?? 'Student'),
          authorPhotoURL:
            typeof data.authorPhotoURL === 'string' && data.authorPhotoURL
              ? data.authorPhotoURL
              : undefined,
          authorIsGuest: Boolean(data.authorIsGuest ?? false),
          authorBranch: typeof data.authorBranch === 'string' ? data.authorBranch : undefined,
          body: String(data.body ?? ''),
          attachments: mapRichAttachmentsFromDoc(data),
          likeCount: Number(data.likeCount ?? data.helpfulCount ?? 0),
          replyCount: Number(data.replyCount ?? 0),
          isAccepted: Boolean(data.isAccepted ?? false),
          isPublic: Boolean(data.isPublic ?? true),
          moderationStatus: (data.moderationStatus as ModerationStatus) || 'active',
          createdAtMs: toMillis(data.createdAt),
          updatedAtMs: toMillis(data.updatedAt),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `questions/${questionId}/answers`);
    },
  );
}

export function subscribeAnswersForMyDoubts(
  questionIds: string[],
  onData: (answersByDoubt: Record<string, Answer[]>) => void,
): Unsubscribe {
  const uniqueIds = Array.from(new Set(questionIds.filter(Boolean))).slice(0, 15);
  if (uniqueIds.length === 0) {
    onData({});
    return () => {};
  }

  const state: Record<string, Answer[]> = {};
  const unsubs = uniqueIds.map((qId) =>
    subscribeAnswers(qId, (list) => {
      state[qId] = list;
      onData({ ...state });
    }),
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function submitAnswer(params: {
  question: Question;
  user: User;
  profile: UserProfile | null;
  body: string;
  attachments: RichAttachment[];
}): Promise<void> {
  const answerId = makeId('ans');
  const batch = writeBatch(db);
  const ansRef = doc(db, 'questions', params.question.id, 'answers', answerId);
  const qRef = doc(db, 'questions', params.question.id);
  const cleanAttachments = sanitizeAttachments(params.attachments);

  batch.set(ansRef, {
    id: answerId,
    questionId: params.question.id,
    authorId: params.user.uid,
    authorName: params.user.isAnonymous
      ? 'Guest Contributor'
      : (params.profile?.displayName || params.user.displayName || 'Student').slice(0, 80),
    authorPhotoURL: (params.user.photoURL || '').slice(0, 500),
    authorIsGuest: params.user.isAnonymous,
    authorBranch: params.user.isAnonymous
      ? 'Temporary Guest Identity'
      : `${params.profile?.branch || 'Engineering'} · ${params.profile?.year || 'Student'}`.slice(0, 60),
    body: params.body.trim().slice(0, 5000),
    attachments: cleanAttachments,
    likeCount: 0,
    replyCount: 0,
    isAccepted: false,
    isPublic: true,
    moderationStatus: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(qRef, {
    answerCount: params.question.answerCount + 1,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `questions/${params.question.id}/answers/${answerId}`,
    );
  }
}

export async function checkAnswerLiked(
  questionId: string,
  answerId: string,
  uid: string,
): Promise<boolean> {
  try {
    const snap = await getDoc(
      doc(db, 'questions', questionId, 'answers', answerId, 'likes', uid),
    );
    return snap.exists();
  } catch {
    return false;
  }
}

export async function toggleAnswerLike(
  questionId: string,
  answerId: string,
  uid: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const ansRef = doc(db, 'questions', questionId, 'answers', answerId);
  const likeRef = doc(db, 'questions', questionId, 'answers', answerId, 'likes', uid);

  try {
    return await runTransaction(db, async (tx) => {
      const [ansSnap, likeSnap] = await Promise.all([tx.get(ansRef), tx.get(likeRef)]);
      if (!ansSnap.exists()) {
        throw new Error('Answer no longer exists.');
      }
      const data = ansSnap.data();
      const current = Number(data.likeCount ?? data.helpfulCount ?? 0);

      if (likeSnap.exists()) {
        const nextCount = Math.max(0, current - 1);
        tx.delete(likeRef);
        tx.update(ansRef, {
          likeCount: nextCount,
          updatedAt: serverTimestamp(),
        });
        return { liked: false, likeCount: nextCount };
      } else {
        const nextCount = current + 1;
        tx.set(likeRef, {
          userId: uid,
          createdAt: serverTimestamp(),
        });
        tx.update(ansRef, {
          likeCount: nextCount,
          updatedAt: serverTimestamp(),
        });
        return { liked: true, likeCount: nextCount };
      }
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `questions/${questionId}/answers/${answerId}/likes/${uid}`,
    );
  }
}

export function subscribeAnswerReplies(
  questionId: string,
  answerId: string,
  onData: (replies: AnswerReply[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'questions', questionId, 'answers', answerId, 'replies'),
    where('isPublic', '==', true),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            questionId: String(data.questionId ?? questionId),
            answerId: String(data.answerId ?? answerId),
            authorId: String(data.authorId ?? ''),
            authorName: String(data.authorName ?? 'Student'),
            authorPhotoURL:
              typeof data.authorPhotoURL === 'string' && data.authorPhotoURL
                ? data.authorPhotoURL
                : undefined,
            authorIsGuest: Boolean(data.authorIsGuest ?? false),
            body: String(data.body ?? ''),
            isPublic: Boolean(data.isPublic ?? true),
            createdAtMs: toMillis(data.createdAt),
          };
        }),
      );
    },
    (error) => {
      handleFirestoreError(
        error,
        OperationType.LIST,
        `questions/${questionId}/answers/${answerId}/replies`,
      );
    },
  );
}

export async function submitAnswerReply(params: {
  questionId: string;
  answer: Answer;
  user: User;
  profile: UserProfile | null;
  body: string;
}): Promise<void> {
  const replyId = makeId('rep');
  const batch = writeBatch(db);
  const replyRef = doc(
    db,
    'questions',
    params.questionId,
    'answers',
    params.answer.id,
    'replies',
    replyId,
  );
  const ansRef = doc(db, 'questions', params.questionId, 'answers', params.answer.id);

  batch.set(replyRef, {
    id: replyId,
    questionId: params.questionId,
    answerId: params.answer.id,
    authorId: params.user.uid,
    authorName: params.user.isAnonymous
      ? 'Guest Contributor'
      : (params.profile?.displayName || params.user.displayName || 'Student').slice(0, 80),
    authorPhotoURL: (params.user.photoURL || '').slice(0, 500),
    authorIsGuest: params.user.isAnonymous,
    body: params.body.trim().slice(0, 1500),
    isPublic: true,
    createdAt: serverTimestamp(),
  });

  batch.update(ansRef, {
    replyCount: (params.answer.replyCount || 0) + 1,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `questions/${params.questionId}/answers/${params.answer.id}/replies/${replyId}`,
    );
  }
}

// Atomic, idempotent resolution + credit payout keyed by doubtId
export async function resolveDoubtWithAcceptedAnswer(
  question: Question,
  answer: Answer,
): Promise<{
  credited: boolean;
  creditsAwarded: number;
  reason?: string;
}> {
  const actor = auth.currentUser;
  if (!actor || actor.isAnonymous) {
    throw new Error('Verified Google sign-in is required to mark a doubt as solved.');
  }
  if (actor.uid !== question.authorId) {
    throw new Error('Only the author of this doubt can mark an answer as solved.');
  }

  const qRef = doc(db, 'questions', question.id);
  const aRef = doc(db, 'questions', question.id, 'answers', answer.id);
  const txRef = doc(db, 'creditTransactions', question.id);
  const solverRef = doc(db, 'users', answer.authorId);

  try {
    return await runTransaction(db, async (tx) => {
      const [qSnap, aSnap, txSnap] = await Promise.all([
        tx.get(qRef),
        tx.get(aRef),
        tx.get(txRef),
      ]);

      if (!qSnap.exists()) {
        throw new Error('This doubt no longer exists.');
      }
      if (!aSnap.exists()) {
        throw new Error('The selected answer no longer exists.');
      }

      const qData = qSnap.data();
      const aData = aSnap.data();

      if (qData.status === 'resolved') {
        throw new Error('This doubt has already been marked as solved.');
      }

      const solverId = String(aData.authorId ?? answer.authorId);
      const isSelfAnswer = solverId === String(qData.authorId);
      const assessmentCompleted = qData.assessmentStatus === 'completed';
      const tier =
        typeof qData.difficultyTier === 'string'
          ? (qData.difficultyTier as DifficultyTier)
          : undefined;
      const credits =
        tier && assessmentCompleted
          ? Number(qData.assignedCredits ?? computeAssignedCredits(tier))
          : 0;

      const canAwardCredits =
        !isSelfAnswer &&
        !txSnap.exists() &&
        assessmentCompleted &&
        Boolean(tier) &&
        credits > 0;

      const solverSnap = canAwardCredits ? await tx.get(solverRef) : null;

      tx.update(aRef, {
        isAccepted: true,
        updatedAt: serverTimestamp(),
      });

      tx.update(qRef, {
        status: 'resolved',
        acceptedAnswerId: answer.id,
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (canAwardCredits && tier) {
        const txPayload: Record<string, unknown> = {
          id: question.id,
          userId: solverId,
          userName: String(aData.authorName ?? answer.authorName ?? 'Student').slice(0, 80),
          doubtId: question.id,
          doubtTitle: String(qData.title ?? question.title).slice(0, 180),
          acceptedAnswerId: answer.id,
          credits,
          difficultyTier: tier,
          transactionType: 'DOUBT_SOLVED',
          createdAt: serverTimestamp(),
        };
        const solverPhoto = String(aData.authorPhotoURL ?? answer.authorPhotoURL ?? '').slice(0, 500);
        if (solverPhoto) {
          txPayload.userPhotoURL = solverPhoto;
        }
        tx.set(txRef, txPayload);

        if (solverSnap && solverSnap.exists()) {
          const sData = solverSnap.data();
          const nextCreditsEarned = Number(sData.creditsEarned ?? 0) + credits;
          const nextReputation = Number(sData.reputation ?? 0) + credits;
          const nextTotalCredits =
            typeof sData.totalCreditsEarned === 'number'
              ? sData.totalCreditsEarned + credits
              : credits;
          const nextSolved =
            typeof sData.totalDoubtsSolved === 'number'
              ? sData.totalDoubtsSolved + 1
              : 1;

          tx.update(solverRef, {
            reputation: nextReputation,
            creditsEarned: nextCreditsEarned,
            totalCreditsEarned: nextTotalCredits,
            totalDoubtsSolved: nextSolved,
            lastRewardDoubtId: question.id,
            updatedAt: serverTimestamp(),
          });
        }

        return {
          credited: true,
          creditsAwarded: credits,
        };
      }

      return {
        credited: false,
        creditsAwarded: 0,
        reason: isSelfAnswer
          ? 'Self-accepted answers do not award credits.'
          : txSnap.exists()
            ? 'Credits were already issued for this doubt.'
            : 'Doubt solved while AI reward assessment was still pending.',
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `questions/${question.id}`);
  }
}

export function subscribeCreditTransactions(
  onData: (transactions: CreditTransaction[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'creditTransactions'),
    where('transactionType', '==', 'DOUBT_SOLVED'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CreditTransaction[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: String(data.userId ?? ''),
          userName: String(data.userName ?? 'NEXUS Solver'),
          userPhotoURL:
            typeof data.userPhotoURL === 'string' && data.userPhotoURL
              ? data.userPhotoURL
              : undefined,
          doubtId: String(data.doubtId ?? d.id),
          doubtTitle: String(data.doubtTitle ?? ''),
          acceptedAnswerId: String(data.acceptedAnswerId ?? ''),
          credits: Number(data.credits ?? 0),
          difficultyTier: (data.difficultyTier as DifficultyTier) || 'STANDARD',
          transactionType: 'DOUBT_SOLVED',
          createdAtMs: toMillis(data.createdAt),
        };
      });
      list.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'creditTransactions');
    },
  );
}

export function subscribeRewardAdjustments(
  onData: (adjustments: RewardAdjustment[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'rewardAdjustments'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            doubtId: String(data.doubtId ?? ''),
            doubtTitle: typeof data.doubtTitle === 'string' ? data.doubtTitle : undefined,
            previousTier: String(data.previousTier ?? 'PENDING'),
            newTier: (data.newTier as DifficultyTier) || 'STANDARD',
            previousCredits: Number(data.previousCredits ?? 0),
            newCredits: Number(data.newCredits ?? 0),
            adminUserId: String(data.adminUserId ?? ''),
            adminName: typeof data.adminName === 'string' ? data.adminName : undefined,
            reason: String(data.reason ?? ''),
            createdAtMs: toMillis(data.createdAt),
          };
        }),
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rewardAdjustments');
    },
  );
}

export async function adminAdjustDoubtReward(params: {
  question: Question;
  newTier: DifficultyTier;
  adminUser: User;
  adminName: string;
  reason: string;
}): Promise<void> {
  const adjId = makeId('adj');
  const nextCredits = computeAssignedCredits(params.newTier);
  const batch = writeBatch(db);

  batch.update(doc(db, 'questions', params.question.id), {
    difficultyTier: params.newTier,
    assignedCredits: nextCredits,
    difficultyReason: `Admin adjusted: ${params.reason.trim()}`.slice(0, 480),
    assessmentStatus: 'completed',
    assessmentTimestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'rewardAdjustments', adjId), {
    id: adjId,
    doubtId: params.question.id,
    doubtTitle: params.question.title.slice(0, 180),
    previousTier: params.question.difficultyTier ?? 'PENDING',
    newTier: params.newTier,
    previousCredits: params.question.assignedCredits ?? 0,
    newCredits: nextCredits,
    adminUserId: params.adminUser.uid,
    adminName: params.adminName.slice(0, 80),
    reason: params.reason.trim().slice(0, 500),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rewardAdjustments/${adjId}`);
  }
}

function mapAdminMessage(id: string, data: Record<string, unknown>): AdminMessage {
  return {
    id,
    recipientId: String(data.recipientId ?? ''),
    recipientName: String(data.recipientName ?? 'Student'),
    senderId: String(data.senderId ?? ''),
    senderName: String(data.senderName ?? 'NEXUS Admin'),
    subject: String(data.subject ?? ''),
    body: String(data.body ?? ''),
    relatedDoubtId:
      typeof data.relatedDoubtId === 'string' && data.relatedDoubtId
        ? data.relatedDoubtId
        : undefined,
    isRead: Boolean(data.isRead ?? false),
    createdAtMs: toMillis(data.createdAt),
  };
}

export function subscribeMyAdminMessages(
  uid: string,
  onData: (messages: AdminMessage[]) => void,
): Unsubscribe {
  const directQuery = query(collection(db, 'adminMessages'), where('recipientId', '==', uid));
  const broadcastQuery = query(collection(db, 'adminMessages'), where('recipientId', '==', 'ALL'));

  let directMap = new Map<string, AdminMessage>();
  let broadcastMap = new Map<string, AdminMessage>();

  const emit = () => {
    const merged = new Map<string, AdminMessage>([...directMap, ...broadcastMap]);
    onData(Array.from(merged.values()).sort((a, b) => b.createdAtMs - a.createdAtMs));
  };

  const u1 = onSnapshot(
    directQuery,
    (snap) => {
      directMap = new Map(snap.docs.map((d) => [d.id, mapAdminMessage(d.id, d.data())]));
      emit();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'adminMessages');
    },
  );

  const u2 = onSnapshot(
    broadcastQuery,
    (snap) => {
      broadcastMap = new Map(snap.docs.map((d) => [d.id, mapAdminMessage(d.id, d.data())]));
      emit();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'adminMessages');
    },
  );

  return () => {
    u1();
    u2();
  };
}

export function subscribeAllAdminMessages(
  onData: (messages: AdminMessage[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'adminMessages'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => mapAdminMessage(d.id, d.data())));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'adminMessages');
    },
  );
}

export async function sendAdminMessage(params: {
  recipientId: string;
  recipientName: string;
  senderUser: User;
  senderName: string;
  subject: string;
  body: string;
  relatedDoubtId?: string;
}): Promise<void> {
  const id = makeId('msg');
  const payload: Record<string, unknown> = {
    id,
    recipientId: params.recipientId.trim().slice(0, 128),
    recipientName: params.recipientName.trim().slice(0, 80) || 'Student',
    senderId: params.senderUser.uid,
    senderName: params.senderName.trim().slice(0, 80) || 'NEXUS Admin',
    subject: params.subject.trim().slice(0, 140),
    body: params.body.trim().slice(0, 2000),
    isRead: false,
    createdAt: serverTimestamp(),
  };
  if (params.relatedDoubtId && params.relatedDoubtId.trim()) {
    payload.relatedDoubtId = params.relatedDoubtId.trim().slice(0, 128);
  }

  try {
    await setDoc(doc(db, 'adminMessages', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `adminMessages/${id}`);
  }
}

export async function markAdminMessageRead(messageId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'adminMessages', messageId), {
      isRead: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `adminMessages/${messageId}`);
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read file payload.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadDirectToNexusServer(
  file: File,
  uid: string,
  kind: 'image' | 'document',
  mimeType: string,
  onProgress?: (pct: number, stage: string) => void,
): Promise<RichAttachment> {
  onProgress?.(18, 'Preparing media stream');
  const dataBase64 = await readFileAsBase64(file);
  onProgress?.(36, 'Uploading media');

  const payloadJson = await new Promise<{
    secureUrl?: string;
    mimeType?: string;
    fileSize?: number;
    error?: string;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads/direct');
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        const pct = Math.min(92, Math.max(38, Math.round(36 + (evt.loaded / evt.total) * 56)));
        onProgress?.(pct, 'Uploading media');
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && parsed.secureUrl) {
          resolve(parsed);
        } else {
          reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Server returned an invalid upload response.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading attachment.'));
    xhr.send(
      JSON.stringify({
        fileName: file.name.slice(0, 140),
        mimeType,
        dataBase64,
      }),
    );
  });

  onProgress?.(100, 'Complete');
  return {
    id: makeId('att'),
    type: kind,
    fileName: file.name.slice(0, 140),
    secureUrl: String(payloadJson.secureUrl),
    mimeType: String(payloadJson.mimeType || mimeType),
    fileSize: Number(payloadJson.fileSize || file.size),
    uploadedBy: uid,
    createdAtMs: Date.now(),
  };
}

let cloudinaryRejectedForSession = false;

export async function uploadAttachmentToCloudinary(
  file: File,
  uid: string,
  kind: 'image' | 'document',
  options?: {
    cloudinaryConfigured?: boolean;
    onProgress?: (pct: number, stage: string) => void;
  },
): Promise<RichAttachment> {
  const mimeType = inferDocumentMimeType(file.name, file.type);
  const onProgress = options?.onProgress;
  onProgress?.(10, 'Validating file');

  if (options?.cloudinaryConfigured !== false && !cloudinaryRejectedForSession) {
    try {
      const signRes = await fetch('/api/uploads/cloudinary-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType,
          fileSize: file.size,
          folder: 'nexus_attachments',
          uid,
        }),
      });

      if (signRes.ok) {
        const signPayload = await signRes.json();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', signPayload.folder || 'nexus_attachments');

        if (signPayload.mode === 'signed') {
          formData.append('api_key', String(signPayload.apiKey));
          formData.append('timestamp', String(signPayload.timestamp));
          formData.append('signature', String(signPayload.signature));
        } else if (signPayload.uploadPreset) {
          formData.append('upload_preset', String(signPayload.uploadPreset));
        }

        onProgress?.(45, 'Uploading to media CDN');
        const uploadRes = await fetch(String(signPayload.uploadUrl), {
          method: 'POST',
          body: formData,
        });

        const uploadJson = await uploadRes.json().catch(() => ({}));
        if (uploadRes.ok && uploadJson.secure_url) {
          onProgress?.(100, 'Complete');
          return {
            id: makeId('att'),
            type: kind,
            fileName: file.name.slice(0, 140),
            secureUrl: String(uploadJson.secure_url),
            cloudinaryPublicId:
              typeof uploadJson.public_id === 'string' ? uploadJson.public_id : undefined,
            mimeType,
            fileSize: file.size,
            uploadedBy: uid,
            createdAtMs: Date.now(),
          };
        }
        cloudinaryRejectedForSession = true;
      } else {
        cloudinaryRejectedForSession = true;
      }
    } catch {
      cloudinaryRejectedForSession = true;
      // Automatically fall through to reliable NEXUS direct storage
    }
  }

  return uploadDirectToNexusServer(file, uid, kind, mimeType, onProgress);
}

export interface LinkPreviewResponse {
  url: string;
  domain: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  metadataFetched: boolean;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewResponse> {
  const res = await fetch('/api/links/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error || 'Unable to validate link.');
  }
  return payload as LinkPreviewResponse;
}

export async function getStoredAiInsight(questionId: string): Promise<AiInsight | null> {
  try {
    const snap = await getDoc(doc(db, 'questions', questionId, 'insights', 'nexus_ai'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      questionId,
      suggestedExplanation: String(d.suggestedExplanation ?? ''),
      importantClues: Array.isArray(d.importantClues) ? d.importantClues.map(String) : [],
      stepByStepApproach: Array.isArray(d.stepByStepApproach) ? d.stepByStepApproach.map(String) : [],
      possibleErrors: Array.isArray(d.possibleErrors) ? d.possibleErrors.map(String) : [],
      helpfulNextSteps: Array.isArray(d.helpfulNextSteps) ? d.helpfulNextSteps.map(String) : [],
      analyzedAttachments: Array.isArray(d.analyzedAttachments)
        ? d.analyzedAttachments.map(String)
        : undefined,
      skippedAttachments: Array.isArray(d.skippedAttachments)
        ? d.skippedAttachments.map(String)
        : undefined,
      model: String(d.model ?? 'gemini-4-hydrogen'),
      generatedAtMs: toMillis(d.generatedAt),
    };
  } catch {
    return null;
  }
}

export async function requestAndStoreAiInsight(question: Question): Promise<AiInsight> {
  const response = await fetch('/api/nexus-ai/insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: question.title,
      description: question.description,
      topic: question.topic,
      tags: question.tags,
      attachments: question.attachments,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'NEXUS AI could not generate an insight right now.');
  }

  const insight: AiInsight = {
    questionId: question.id,
    suggestedExplanation: String(payload.suggestedExplanation ?? ''),
    importantClues: Array.isArray(payload.importantClues) ? payload.importantClues.map(String) : [],
    stepByStepApproach: Array.isArray(payload.stepByStepApproach) ? payload.stepByStepApproach.map(String) : [],
    possibleErrors: Array.isArray(payload.possibleErrors) ? payload.possibleErrors.map(String) : [],
    helpfulNextSteps: Array.isArray(payload.helpfulNextSteps) ? payload.helpfulNextSteps.map(String) : [],
    analyzedAttachments: Array.isArray(payload.analyzedAttachments)
      ? payload.analyzedAttachments.map(String)
      : [],
    skippedAttachments: Array.isArray(payload.skippedAttachments)
      ? payload.skippedAttachments.map(String)
      : [],
    model: String(payload.model ?? 'gemini-4-hydrogen'),
    generatedAtMs: Date.now(),
  };

  if (!question.isDemo && auth.currentUser) {
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'questions', question.id, 'insights', 'nexus_ai'), {
        questionId: question.id,
        suggestedExplanation: insight.suggestedExplanation.slice(0, 3000),
        importantClues: insight.importantClues.slice(0, 8),
        stepByStepApproach: insight.stepByStepApproach.slice(0, 10),
        possibleErrors: insight.possibleErrors.slice(0, 8),
        helpfulNextSteps: insight.helpfulNextSteps.slice(0, 8),
        analyzedAttachments: (insight.analyzedAttachments ?? []).slice(0, 6),
        skippedAttachments: (insight.skippedAttachments ?? []).slice(0, 6),
        model: insight.model.slice(0, 80),
        generatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'questions', question.id), {
        hasAiInsight: true,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      console.warn('Could not persist AI insight to Firestore:', err);
    }
  }

  return insight;
}

export async function submitModerationReport(params: {
  reporterId: string;
  targetType: 'question' | 'answer' | 'reward';
  targetId: string;
  questionId: string;
  targetPreview: string;
  reason: string;
}): Promise<void> {
  const id = makeId('rep');
  try {
    await setDoc(doc(db, 'reports', id), {
      id,
      targetType: params.targetType,
      targetId: params.targetId,
      questionId: params.questionId,
      targetPreview: params.targetPreview.slice(0, 200),
      reason: params.reason.trim().slice(0, 500),
      reporterId: params.reporterId,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${id}`);
  }
}

export function subscribeAllReports(
  onData: (reports: ModerationReport[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list: ModerationReport[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          targetType: (data.targetType as ModerationReport['targetType']) || 'question',
          targetId: String(data.targetId ?? ''),
          questionId: String(data.questionId ?? ''),
          targetPreview: String(data.targetPreview ?? ''),
          reason: String(data.reason ?? ''),
          reporterId: String(data.reporterId ?? ''),
          status: (data.status as ModerationReport['status']) || 'open',
          createdAtMs: toMillis(data.createdAt),
          updatedAtMs: toMillis(data.updatedAt),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
    },
  );
}

export async function resolveReportAction(
  report: ModerationReport,
  action: 'dismissed' | 'actioned',
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'reports', report.id), {
      status: action,
      updatedAt: serverTimestamp(),
    });
    if (action === 'actioned') {
      if (report.targetType === 'question') {
        batch.update(doc(db, 'questions', report.targetId), {
          moderationStatus: 'removed',
          isPublic: false,
          updatedAt: serverTimestamp(),
        });
      } else if (report.targetType === 'answer') {
        batch.update(
          doc(db, 'questions', report.questionId, 'answers', report.targetId),
          {
            moderationStatus: 'removed',
            isPublic: false,
            updatedAt: serverTimestamp(),
          },
        );
      }
      // For 'reward' reports, marking actioned closes the ticket after admin adjusts reward
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${report.id}`);
  }
}

export async function adminToggleUserSuspension(
  userProfile: UserProfile,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', userProfile.uid), {
      isSuspended: !userProfile.isSuspended,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userProfile.uid}`);
  }
}

export async function adminSetQuestionVisibility(
  questionId: string,
  moderationStatus: ModerationStatus,
  isPublic: boolean,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'questions', questionId), {
      moderationStatus,
      isPublic,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `questions/${questionId}`);
  }
}

export async function deleteQuestionAsAdmin(questionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'questions', questionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `questions/${questionId}`);
  }
}

export async function fetchIntegrationStatus(): Promise<IntegrationStatus> {
  const res = await fetch('/api/integrations/status');
  if (!res.ok) {
    return {
      geminiConfigured: false,
      cloudinaryConfigured: false,
      cloudinaryCloudName: null,
      cloudinaryMode: null,
      directUploadReady: true,
    };
  }
  return res.json();
}

export async function fetchPersonalMailActivity(): Promise<PersonalMailActivityResponse> {
  const token = getCachedGmailAccessToken();
  if (!token) {
    throw new Error('Connect Gmail to read your personal mail activity.');
  }

  const res = await fetch('/api/mail/activity', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await res.json().catch(() => ({}));
  if (res.status === 401 || payload?.needsGmailAuth) {
    setCachedGmailAccessToken(null);
    throw new Error(payload?.error || 'Gmail session expired. Please reconnect Gmail.');
  }
  if (!res.ok) {
    throw new Error(payload?.error || 'Unable to load Gmail activity.');
  }
  return payload as PersonalMailActivityResponse;
}

export async function sendPersonalMailAlert(params: {
  to: string;
  subject: string;
  body: string;
  confirmed: boolean;
}): Promise<{ ok: boolean; id: string; threadId: string }> {
  if (!params.confirmed) {
    throw new Error('Explicit user confirmation is required before sending email.');
  }
  const token = getCachedGmailAccessToken();
  if (!token) {
    throw new Error('Connect Gmail before sending an email notification.');
  }

  const res = await fetch('/api/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  const payload = await res.json().catch(() => ({}));
  if (res.status === 401 || payload?.needsGmailAuth) {
    setCachedGmailAccessToken(null);
    throw new Error(payload?.error || 'Gmail send permission expired. Please reconnect Gmail.');
  }
  if (!res.ok) {
    throw new Error(payload?.error || 'Failed to send email via Gmail.');
  }
  return payload as { ok: boolean; id: string; threadId: string };
}


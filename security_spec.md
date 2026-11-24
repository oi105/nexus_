# NEXUS Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation**: Student email addresses exist ONLY in `/users/{userId}/private/info` and are readable/writable strictly by `request.auth.uid == userId` or `isAdmin()`. Public `/users/{userId}` documents contain zero email/phone/PII fields.
2. **No Self-Assigned Roles or Arbitrary Credit Inflation**: Users cannot write to `/admins/{uid}`, cannot set `assignedCredits` on question create (`assignedCredits == 0`, `assessmentStatus == 'pending'`), and cannot write to `/users/{uid}` credit/solve counters unless atomically linked to a valid `/creditTransactions/{doubtId}` created by the doubt owner (`userId != request.auth.uid`).
3. **One Like Per Identity Per Doubt/Answer**: Like documents are keyed by `/questions/{questionId}/likes/{userId}` and `/questions/{questionId}/answers/{answerId}/likes/{userId}` where `userId == request.auth.uid`.
4. **Fixed AI Reward Mapping**: Firestore Security Rules enforce exact tier-to-credit mapping (`QUICK_FIX=5`, `STANDARD=10`, `CHALLENGING=20`, `ADVANCED=30`) on initial `pending -> completed` transition and lock `difficultyTier`/`assignedCredits` against non-admin modification thereafter.
5. **Atomic Idempotent Payout**: `/creditTransactions/{txId}` requires `txId == doubtId`, `!exists(...)`, `question.authorId == request.auth.uid`, `question.status != 'resolved'`, `answer.authorId == userId`, `userId != request.auth.uid`, and `getAfter` atomic resolution of the question.
6. **Admin Messaging & Audit Logs**: `/rewardAdjustments/{adjId}` and `/adminMessages/{messageId}` creation are strictly restricted to `isAdmin()`; message reads are scoped by `resource.data.recipientId == request.auth.uid || resource.data.recipientId == 'ALL' || isAdmin()`.
7. **Temporal Integrity & ID Guard**: All `createdAt` / `updatedAt` timestamps must match `request.time`; IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars).

## 2. Dirty Dozen Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Self-Assigned High Bounty on Question Create**: User creates `/questions/{id}` with `assignedCredits: 30` or `difficultyTier: 'ADVANCED'` directly from client.
2. **Mismatched Tier & Credits**: Payload attempts `difficultyTier: 'QUICK_FIX'` with `assignedCredits: 30`.
3. **Self-Awarded Credits**: Doubt owner answers their own doubt and writes `/creditTransactions/{doubtId}` with `userId == request.auth.uid`.
4. **Duplicate Credit Payout**: Doubt owner attempts to write `/creditTransactions/{doubtId}` twice or after `question.status == 'resolved'`.
5. **Client Credit Balance Tampering**: User updates `/users/{uid}` `totalCreditsEarned: 9999` without an atomic `creditTransactions` creation.
6. **Non-Owner Resolution**: User B attempts to resolve User A's doubt and issue `/creditTransactions/{doubtId}`.
7. **Non-Admin Reward Override**: Question author modifies `assignedCredits` after `assessmentStatus == 'completed'` or writes to `/rewardAdjustments/{id}`.
8. **Non-Admin Broadcast Message**: Regular user creates `/adminMessages/{id}` with `recipientId: 'ALL'`.
9. **Message Scraping**: User B attempts `list` on `/adminMessages` without filtering `recipientId == uid` or `'ALL'`.
10. **Email PII Leak**: User B reads `/users/user_A/private/info`.
11. **Shadow Field Injection**: User creates `/users/{uid}` with `isAdmin: true`.
12. **Cross-User Like Tampering**: User A writes `/questions/q1/likes/user_B`.

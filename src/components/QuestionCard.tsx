import React from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  Award,
  CheckCircle2,
  Heart,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import type { Question } from '../types/nexus';
import { formatAiRewardLabel, formatRelativeTime } from '../utils/nexusLogic';
import { UserAvatar } from './NexusBrand';
import { AttachmentRenderer } from './RichAttachments';

interface QuestionCardProps {
  question: Question;
  isLiked: boolean;
  onToggleLike: (question: Question) => void;
  onOpenDetail: (question: Question) => void;
}

export function QuestionCard({
  question,
  isLiked,
  onToggleLike,
  onOpenDetail,
}: QuestionCardProps) {
  const urgencyLabel =
    question.urgency === 'critical'
      ? 'Critical'
      : question.urgency === 'urgent'
        ? 'Urgent'
        : null;

  const statusText = question.status === 'resolved' ? 'Resolved' : 'Open';
  const rewardLabel = formatAiRewardLabel(question);
  const rewardReady = question.assessmentStatus === 'completed' && question.assignedCredits > 0;

  return (
    <article
      data-testid={`question-card-${question.id}`}
      className="bg-white border-[1.5px] border-[#CBD5E1] rounded-[12px] p-4 sm:px-5 sm:py-4 hover:border-[#090B10] transition-colors duration-150 shadow-xs"
    >
      {/* Quiet unboxed metadata line */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[12px] text-[#3F4A5F]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <UserAvatar
            name={question.authorName}
            photoURL={question.authorPhotoURL}
            size="xs"
          />
          <span className="font-semibold text-[#090B10] whitespace-nowrap">
            {question.authorName}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono whitespace-nowrap">
            {formatRelativeTime(question.createdAtMs)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-bold text-[#DC2626] whitespace-nowrap">
            {question.topic}
          </span>
          {question.isDemo && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[11px] text-[#3F4A5F] whitespace-nowrap">
                Demo Data
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0 font-mono text-[11px]">
          {urgencyLabel && (
            <span
              className={
                question.urgency === 'critical'
                  ? 'text-[#DC2626] font-bold'
                  : 'text-[#B91C1C] font-semibold'
              }
            >
              {urgencyLabel}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 font-semibold ${
              question.status === 'resolved' ? 'text-[#15803D]' : 'text-[#3F4A5F]'
            }`}
          >
            {question.status === 'resolved' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
            )}
            {statusText}
          </span>
        </div>
      </div>

      {/* Question Title & Description */}
      <button
        type="button"
        onClick={() => onOpenDetail(question)}
        className="mt-2.5 block w-full text-left group focus:outline-none"
      >
        <h3 className="font-display font-bold text-[16px] sm:text-[17px] leading-[1.35] text-[#090B10] group-hover:text-[#DC2626] transition-colors">
          {question.title}
        </h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#3F4A5F] line-clamp-2">
          {question.description}
        </p>
      </button>

      {/* Inline Rich Media Attachments */}
      {question.attachments.length > 0 && (
        <div className="mt-3">
          <AttachmentRenderer attachments={question.attachments} compact />
        </div>
      )}

      {/* Compact unboxed tags + AI Reward Classification */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[#687386]">
          {question.tags.map((tag) => (
            <span key={tag} className="text-[#687386]">
              #{tag}
            </span>
          ))}
        </div>

        <span
          title={question.difficultyReason || 'Assessed by NEXUS AI Reward Engine'}
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-[11px] font-medium ${
            rewardReady
              ? 'bg-[#C8ED62]/30 text-[#224414] border border-[#A6D33D]/50 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700'
              : 'bg-[#F5F5F0] text-[#687386] border border-[#DFE5F0] dark:bg-[#27272a] dark:text-slate-300 dark:border-zinc-700'
          }`}
        >
          <Award className="w-3 h-3 shrink-0" />
          <span>{rewardLabel}</span>
        </span>
      </div>

      {/* Hairline Footer Controls: NEXUS Like ("I have this doubt too") + Discussion Trigger */}
      <div className="mt-3.5 pt-3 border-t border-[#CBD5E1] flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-[#3F4A5F]">
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            aria-pressed={isLiked}
            onClick={() => onToggleLike(question)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] border transition-colors whitespace-nowrap ${
              isLiked
                ? 'bg-[#FEF2F2] border-[#EF233C]/60 text-[#B91C1C] font-semibold'
                : 'bg-white border-[#CBD5E1] text-[#090B10] hover:border-[#EF233C]'
            }`}
          >
            <motion.span
              animate={{ scale: isLiked ? [1, 1.25, 1] : 1 }}
              transition={{ duration: 0.25 }}
              className="inline-flex"
            >
              <Heart
                className={`w-3.5 h-3.5 ${
                  isLiked ? 'fill-[#EF233C] text-[#EF233C]' : 'text-[#3F4A5F]'
                }`}
              />
            </motion.span>
            <span>{isLiked ? 'You have this doubt too' : 'I have this doubt too'}</span>
          </motion.button>

          <span className="text-[12px] text-[#3F4A5F] whitespace-nowrap">
            <span
              data-testid={`like-count-${question.id}`}
              className="font-mono font-semibold text-[#090B10] tabular-nums"
            >
              {question.likeCount}
            </span>{' '}
            students have this doubt
          </span>

          <button
            type="button"
            onClick={() => onOpenDetail(question)}
            className="inline-flex items-center gap-1.5 hover:text-[#090B10] transition-colors whitespace-nowrap"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">{question.answerCount}</span>
            <span>{question.answerCount === 1 ? 'answer' : 'answers'}</span>
          </button>

          {question.hasAiInsight && (
            <button
              type="button"
              onClick={() => onOpenDetail(question)}
              className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#6C5CE0] hover:text-[#5544CE] whitespace-nowrap"
            >
              <Sparkles className="w-3 h-3" />
              <span>AI INSIGHT</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenDetail(question)}
          className="inline-flex items-center gap-1 text-[12px] font-bold text-[#DC2626] hover:text-[#991B1B] transition-colors whitespace-nowrap shrink-0"
        >
          <span>View discussion</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}

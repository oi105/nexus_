import React from 'react';
import { Box, Filter, Plus, SearchX } from 'lucide-react';
import {
  SUPPORTED_TOPICS,
  type FeedTab,
  type Question,
} from '../types/nexus';
import { QuestionCard } from './QuestionCard';

interface DiscoverFeedProps {
  questions: Question[];
  loading: boolean;
  feedTab: FeedTab;
  selectedTopic: string;
  searchQuery: string;
  likedQuestionIds: Record<string, boolean>;
  hasDemoContent: boolean;
  onChangeTab: (tab: FeedTab) => void;
  onChangeTopic: (topic: string) => void;
  onClearFilters: () => void;
  onToggleLike: (question: Question) => void;
  onOpenDetail: (question: Question) => void;
  onOpenAskDoubt: () => void;
  onEnter3dCorridor?: () => void;
}

const FEED_TABS: { id: FeedTab; label: string }[] = [
  { id: 'most_liked', label: 'Most Liked' },
  { id: 'newest', label: 'Newest' },
  { id: 'unanswered', label: 'Unanswered' },
  { id: 'resolved', label: 'Solved' },
];

const QUICK_TOPICS = ['All Topics', 'DSA', 'C++', 'Python', 'DBMS', 'CAD and AutoCAD'];

export function DiscoverFeed({
  questions,
  loading,
  feedTab,
  selectedTopic,
  searchQuery,
  likedQuestionIds,
  hasDemoContent,
  onChangeTab,
  onChangeTopic,
  onClearFilters,
  onToggleLike,
  onOpenDetail,
  onOpenAskDoubt,
  onEnter3dCorridor,
}: DiscoverFeedProps) {
  return (
    <div className="space-y-5">
      {/* Editorial Hero Banner — Obsidian Black & Crimson Contrast */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#090B10] via-[#1C0A0E] to-[#991B1B] border-2 border-[#090B10] dark:border-[#EF233C]/45 rounded-[20px] p-6 sm:p-8 shadow-lg text-white">
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-mono font-semibold text-white border border-white/20">
            <span className="w-2 h-2 rounded-full bg-[#EF233C]" />
            <span>NEXUS Doubt Library</span>
          </div>

          <h1 className="font-display font-extrabold text-[30px] sm:text-[40px] tracking-tight leading-[1.1] text-balance">
            Stuck? Someone here gets it.
          </h1>

          <p className="text-white/90 text-[15px] sm:text-[16px] max-w-xl font-normal leading-relaxed">
            Post a specific doubt, earn AI-verified solver credits upon accepted solutions, and explore the 3D Doubt Library.
          </p>

          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenAskDoubt}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#EF233C] hover:bg-[#DC2626] text-white font-bold text-sm rounded-[12px] shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Post a doubt</span>
            </button>

            {onEnter3dCorridor && (
              <button
                type="button"
                onClick={onEnter3dCorridor}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-[#090B10] hover:bg-[#F8FAFC] font-semibold text-sm rounded-[12px] shadow-sm transition-colors"
              >
                <Box className="w-4 h-4 text-[#EF233C]" />
                <span>Enter 3D Corridor</span>
              </button>
            )}
          </div>
        </div>
      </div>


      {/* Feed Controls: Segmented Tabs + Compact Subject Selector */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Feed sorting"
            className="inline-flex items-center gap-1 p-1 bg-white border-[1.5px] border-[#CBD5E1] rounded-[9px]"
          >
            {FEED_TABS.map((tab) => {
              const active = feedTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onChangeTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-[7px] transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#EF233C] text-white'
                      : 'text-[#3F4A5F] hover:text-[#090B10]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#3F4A5F] shrink-0" aria-hidden="true" />
            <label htmlFor="topic-select" className="sr-only">
              Filter by topic
            </label>
            <select
              id="topic-select"
              value={selectedTopic}
              onChange={(e) => onChangeTopic(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-white border-[1.5px] border-[#CBD5E1] rounded-[8px] text-[#090B10] focus:outline-none focus:border-[#EF233C]"
            >
              {SUPPORTED_TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Compact inline subject links */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 text-xs">
          {QUICK_TOPICS.map((topic) => {
            const active = selectedTopic === topic;
            return (
              <button
                key={topic}
                type="button"
                onClick={() => onChangeTopic(topic)}
                className={`whitespace-nowrap shrink-0 pb-1 border-b-2 transition-colors ${
                  active
                    ? 'border-[#EF233C] text-[#DC2626] font-bold'
                    : 'border-transparent text-[#3F4A5F] hover:text-[#090B10]'
                }`}
              >
                {topic}
              </button>
            );
          })}
        </div>
      </div>

      {/* Honest Demo Data Notice when showing showcase posts */}
      {hasDemoContent && (
        <div className="px-3.5 py-2 bg-white border-[1.5px] border-[#CBD5E1] rounded-[9px] flex flex-wrap items-center justify-between gap-2 text-xs text-[#3F4A5F]">
          <span>
            Showing curated <span className="font-mono font-semibold text-[#090B10]">Demo Data</span> showcase threads alongside live Firestore posts.
          </span>
          <button
            type="button"
            onClick={onOpenAskDoubt}
            className="text-[#DC2626] font-semibold hover:underline whitespace-nowrap"
          >
            Publish a live doubt
          </button>
        </div>
      )}

      {/* Feed List */}
      {loading && questions.length === 0 ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading questions">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white border border-[#DFE5F0] rounded-[12px] p-5 space-y-3 animate-pulse"
            >
              <div className="h-3 w-40 bg-[#DFE5F0]/70 rounded" />
              <div className="h-5 w-3/4 bg-[#DFE5F0] rounded" />
              <div className="h-3 w-full bg-[#DFE5F0]/60 rounded" />
            </div>
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div className="bg-white border-2 border-[#CBD5E1] rounded-[12px] p-8 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-[9px] bg-[#F1F5F9] flex items-center justify-center text-[#090B10]">
            <SearchX className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display font-bold text-base text-[#090B10]">
              No matching doubts found
            </h2>
            <p className="text-xs text-[#3F4A5F] max-w-sm mx-auto">
              {searchQuery
                ? `No questions matched "${searchQuery}" in ${selectedTopic}.`
                : `No questions are currently listed under ${selectedTopic}.`}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClearFilters}
              className="px-3.5 py-2 text-xs font-semibold border border-[#090B10]/25 rounded-[8px] text-[#090B10] hover:bg-[#F1F5F9]"
            >
              Reset filters
            </button>
            <button
              type="button"
              onClick={onOpenAskDoubt}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#EF233C] text-white rounded-[8px] hover:bg-[#DC2626]"
            >
              <Plus className="w-3.5 h-3.5" />
              Ask Doubt
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              isLiked={Boolean(likedQuestionIds[question.id])}
              onToggleLike={onToggleLike}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

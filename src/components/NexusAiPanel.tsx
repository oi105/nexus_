import React from 'react';
import { ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import type { AiInsight, Question } from '../types/nexus';

interface NexusAiPanelProps {
  question: Question;
  insight: AiInsight | null;
  loading: boolean;
  error: string | null;
  geminiConfigured: boolean;
  onRequestInsight: () => void;
}

export function NexusAiPanel({
  question,
  insight,
  loading,
  error,
  geminiConfigured,
  onRequestInsight,
}: NexusAiPanelProps) {
  const [expanded, setExpanded] = React.useState(Boolean(insight));

  React.useEffect(() => {
    if (insight) {
      setExpanded(true);
    }
  }, [insight]);

  return (
    <section
      aria-label="NEXUS AI Guidance"
      className="bg-[#8676E8]/[0.06] border border-[#8676E8]/25 rounded-[12px] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[7px] bg-[#8676E8]/15 text-[#6755D8] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm text-[#172033]">
                NEXUS AI
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wide text-[#6755D8]">
                AI-generated guidance
              </span>
            </div>
            <p className="text-[12px] text-[#687386]">
              {insight
                ? `Generated via ${insight.model} · Always verify against human answers below`
                : 'Structured study clues and approach breakdown from Gemini'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!insight && (
            <button
              type="button"
              onClick={onRequestInsight}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#8676E8] text-white rounded-[8px] hover:bg-[#7160DA] disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate AI Insight</span>
                </>
              )}
            </button>
          )}

          {insight && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#5D4CC2] hover:bg-[#8676E8]/10 rounded-[7px] transition-colors whitespace-nowrap"
            >
              <span>{expanded ? 'Collapse' : 'Expand insight'}</span>
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {!geminiConfigured && !insight && (
        <p className="mt-3 text-xs text-[#687386]">
          Server status: <span className="font-mono">GEMINI_API_KEY</span> is not configured yet. Set it in server secrets to generate live AI insights for <span className="font-medium text-[#172033]">{question.topic}</span> doubts.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 px-3 py-2 rounded-[8px] bg-[#FF694F]/10 border border-[#FF694F]/25 text-xs text-[#C4422C]"
        >
          {error}
        </div>
      )}

      {insight && expanded && (
        <div className="mt-4 pt-4 border-t border-[#8676E8]/20 space-y-4 text-[13.5px] text-[#172033]">
          {((insight.analyzedAttachments && insight.analyzedAttachments.length > 0) ||
            (insight.skippedAttachments && insight.skippedAttachments.length > 0)) && (
            <div className="px-3 py-2 rounded-[8px] bg-white/70 border border-[#8676E8]/20 text-[11px] text-[#687386] space-y-1">
              {insight.analyzedAttachments && insight.analyzedAttachments.length > 0 && (
                <p>
                  <span className="font-medium text-[#172033]">Analyzed images:</span>{' '}
                  {insight.analyzedAttachments.join(', ')}
                </p>
              )}
              {insight.skippedAttachments && insight.skippedAttachments.length > 0 && (
                <p>
                  <span className="font-medium text-[#172033]">Not parsed by AI:</span>{' '}
                  {insight.skippedAttachments.join(' · ')}
                </p>
              )}
            </div>
          )}

          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-wider text-[#6755D8] font-medium mb-1">
              Suggested explanation
            </h4>
            <p className="leading-relaxed text-[#172033]">{insight.suggestedExplanation}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-[#6755D8] font-medium mb-1.5">
                Important clues
              </h4>
              <ul className="space-y-1 text-[13px] text-[#172033] list-disc pl-4">
                {insight.importantClues.map((clue, idx) => (
                  <li key={idx}>{clue}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-[#6755D8] font-medium mb-1.5">
                Possible errors
              </h4>
              <ul className="space-y-1 text-[13px] text-[#172033] list-disc pl-4">
                {insight.possibleErrors.map((errItem, idx) => (
                  <li key={idx}>{errItem}</li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-wider text-[#6755D8] font-medium mb-1.5">
              Step-by-step approach
            </h4>
            <ol className="space-y-1.5 text-[13px] text-[#172033] list-decimal pl-4">
              {insight.stepByStepApproach.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </div>

          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-wider text-[#6755D8] font-medium mb-1.5">
              Helpful next steps
            </h4>
            <ul className="space-y-1 text-[13px] text-[#687386] list-disc pl-4">
              {insight.helpfulNextSteps.map((next, idx) => (
                <li key={idx}>{next}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

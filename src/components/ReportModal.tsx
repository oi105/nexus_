import React from 'react';
import { Flag, X } from 'lucide-react';

interface ReportModalProps {
  open: boolean;
  targetType: 'question' | 'answer' | 'reward';
  preview: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

export function ReportModal({
  open,
  targetType,
  preview,
  onClose,
  onSubmit,
}: ReportModalProps) {
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('Please describe the issue in at least 5 characters.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  const titleLabel =
    targetType === 'reward'
      ? 'Report AI Reward Classification'
      : `Report ${targetType}`;

  const placeholderText =
    targetType === 'reward'
      ? 'Explain why the AI difficulty tier or credit classification should be reviewed by an administrator...'
      : 'Spam, off-topic content, academic misconduct, or harassment...';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-[70] bg-[#172033]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div className="bg-white border border-[#DFE5F0] rounded-[14px] w-full max-w-md shadow-lg">
        <div className="px-5 py-4 border-b border-[#DFE5F0] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#FF694F]">
            <Flag className="w-4 h-4" />
            <h2
              id="report-modal-title"
              className="font-display font-semibold text-base text-[#172033]"
            >
              {titleLabel}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close report dialog"
            onClick={onClose}
            className="text-[#687386] hover:text-[#172033]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-[#687386] line-clamp-2 bg-[#F5F5F0] p-2.5 rounded-[8px]">
            {preview}
          </p>

          <div>
            <label
              htmlFor="report-reason"
              className="block text-xs font-medium text-[#172033] mb-1.5"
            >
              Reason for review
            </label>
            <textarea
              id="report-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={placeholderText}
              className="w-full px-3 py-2 text-sm border border-[#DFE5F0] rounded-[8px] focus:outline-none focus:border-[#365BEE]"
            />
          </div>

          {error && <p className="text-xs text-[#C4422C]">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-[#687386]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium bg-[#FF694F] text-white rounded-[8px] hover:bg-[#E7563E] disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

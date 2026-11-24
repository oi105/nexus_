import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('NEXUS ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendly = `Database access notice (${parsed.operationType || 'read'} on ${parsed.path || 'record'}): ${parsed.error}`;
        }
      } catch {
        // Not JSON
      }

      return (
        <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#DFE5F0] rounded-[12px] p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-[#FF694F]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="font-display font-semibold text-base text-[#172033]">
                Something interrupted this view
              </h2>
            </div>
            <p className="text-sm text-[#687386] leading-relaxed break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#365BEE] text-white rounded-[8px] hover:bg-[#294AD4] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload NEXUS
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

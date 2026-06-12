import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an uncaught exception:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#0D0D0F] p-6 text-white font-sans">
          <div className="w-full max-w-md bg-[#141417] border border-[var(--border,rgba(255,255,255,0.08))] p-8 rounded-2xl shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-[rgba(239,68,68,0.1)] text-[#EF4444] flex items-center justify-center mx-auto animate-pulse">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold font-display tracking-tight text-white">Something went wrong</h1>
              <p className="text-sm text-[#8E8E93] leading-relaxed">
                An unexpected rendering error occurred. The Zync interface has been safely suspended to prevent data corruption.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-[#0D0D0F] border border-[var(--border,rgba(255,255,255,0.08))] rounded-xl p-4 text-left font-mono text-xs text-[#EF4444] max-h-32 overflow-y-auto whitespace-pre-wrap select-text">
                {this.state.error.toString()}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#6366F1] hover:bg-[#4F46E5] text-white rounded-xl font-medium transition-all duration-200 active:scale-95 shadow-lg shadow-[#6366F1]/20 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

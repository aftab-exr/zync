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
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-base p-6 text-tx-primary font-body">
          <div className="w-full max-w-md bg-surface border-3 border-border p-8 rounded-lg shadow-brutal text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-secondary/10 border-3 border-secondary text-secondary flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold font-display tracking-tight text-tx-primary">Something went wrong</h1>
              <p className="text-sm text-tx-secondary leading-relaxed font-semibold">
                An unexpected rendering error occurred. The Zync interface has been safely suspended to prevent data corruption.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-base border-3 border-border rounded-lg p-4 text-left font-mono text-xs text-secondary max-h-32 overflow-y-auto whitespace-pre-wrap select-text">
                {this.state.error.toString()}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary hover:bg-primary-hover text-tx-primary rounded-lg font-bold border-3 border-border shadow-brutal transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-tx-primary" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PageErrorBoundary]', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const errorId = this.state.error?.message
        ? btoa(this.state.error.message).slice(0, 8).toUpperCase()
        : 'UNKNOWN';

      return (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="max-w-sm w-full text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-6 w-6 text-red-500" aria-hidden="true" />
            </div>
            <h2 className="mb-1 text-lg font-bold text-foreground">Something went wrong</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              An unexpected error occurred while loading this page. You can try again or navigate
              to another page using the sidebar.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors"
              >
                <RefreshCw size={14} />
                Try again
              </button>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <LayoutDashboard size={14} />
                Dashboard
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground font-mono">Error ID: {errorId}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

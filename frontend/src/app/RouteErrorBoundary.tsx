import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary to catch render errors and prevent white screen of death.
 * Logs error to console and shows fallback UI with retry option.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    // Could send to error tracking service here
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-main)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            className="btn btn-primary"
            onClick={this.handleReset}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
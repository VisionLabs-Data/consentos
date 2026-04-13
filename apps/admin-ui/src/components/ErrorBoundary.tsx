import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Top-level React error boundary.
 *
 * Catches unhandled rendering errors so a single bad component cannot
 * take down the whole admin app. Falls back to a simple friendly
 * panel with a reload button. The error is logged to the console for
 * dev debugging; in production, wire this up to an error reporter.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Unhandled error:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif',
            background: '#fafafa',
          }}
        >
          <div
            style={{
              maxWidth: '28rem',
              background: '#fff',
              padding: '2rem',
              borderRadius: '0.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb',
            }}
          >
            <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem', color: '#111' }}>
              Something went wrong
            </h1>
            <p style={{ margin: '0 0 1.5rem', color: '#555', lineHeight: 1.5 }}>
              An unexpected error occurred while rendering this page. The
              error has been logged. Reload to try again.
            </p>
            {this.state.error?.message && (
              <pre
                style={{
                  background: '#f4f4f5',
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.8rem',
                  color: '#7f1d1d',
                  overflow: 'auto',
                  marginBottom: '1.5rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '0.5rem 1rem',
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

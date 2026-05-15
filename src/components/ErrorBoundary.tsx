import React, { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary catches React errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the entire app.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development
    console.error('ErrorBoundary caught error:', error, errorInfo);

    // TODO: Send error to logging service (Sentry, LogRocket, etc.)
    // Example: Sentry.captureException(error, { contexts: { errorInfo } });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Optionally reload the page for a clean slate
    // window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '20px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backgroundColor: '#f5f5f5',
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              padding: '40px',
              maxWidth: '500px',
              textAlign: 'center',
            }}
          >
            <h1 style={{ fontSize: '24px', margin: '0 0 16px 0', color: '#333' }}>
              Oops! Something went wrong
            </h1>
            <p style={{ fontSize: '14px', color: '#666', margin: '0 0 24px 0' }}>
              We're sorry for the inconvenience. An unexpected error occurred.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details
                style={{
                  marginBottom: '24px',
                  padding: '12px',
                  backgroundColor: '#f9f9f9',
                  borderRadius: '4px',
                  textAlign: 'left',
                  border: '1px solid #ddd',
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#666' }}>
                  Error Details (Dev Only)
                </summary>
                <pre
                  style={{
                    marginTop: '12px',
                    fontSize: '12px',
                    overflow: 'auto',
                    color: '#d32f2f',
                  }}
                >
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#4a90e2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#e0e0e0',
                  color: '#333',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  isPermissionError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      isPermissionError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error?.message || 'An unexpected application error occurred.';
    let isPermissionError = false;

    try {
      const parsed = JSON.parse(message);
      if (parsed && typeof parsed === 'object' && parsed.operationType) {
        const op = String(parsed.operationType);
        const path = String(parsed.path || '');
        const errText = String(parsed.error || '');
        if (/permission|insufficient/i.test(errText)) {
          isPermissionError = true;
          message = `Access denied for ${op} on ${path || 'your private record'}. Please verify your email and sign in with the account that owns this data.`;
        } else {
          message = `Unable to complete ${op} (${errText || 'network/data error'}).`;
        }
      }
    } catch {
      if (/permission|insufficient/i.test(message)) {
        isPermissionError = true;
      }
    }

    return {
      hasError: true,
      errorMessage: message,
      isPermissionError,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, errorMessage: '', isPermissionError: false });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-purple-50 px-4 py-8">
          <div className="max-w-md w-full rounded-3xl bg-white border border-rose-200 shadow-xl p-7 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900">
              {this.state.isPermissionError ? 'Private Account Access Protected' : 'Something Went Wrong'}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reload BloomCampus
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = process.env.NODE_ENV === 'development';

      return (
        <div className="flex h-screen flex-col items-center justify-center bg-zinc-50 gap-4">
          <AlertTriangle className="h-10 w-10 text-zinc-400" />
          <p className="text-[16px] font-semibold text-zinc-800">Something went wrong</p>
          {isDev && this.state.error ? (
            <p className="text-[12px] text-zinc-500 font-mono max-w-md text-center">
              {this.state.error.message}
            </p>
          ) : (
            <p className="text-[12px] text-zinc-500 font-mono max-w-md text-center">
              An unexpected error occurred.
            </p>
          )}
          <button
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

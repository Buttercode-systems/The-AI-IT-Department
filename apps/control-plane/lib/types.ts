import { ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

export interface SessionValidatorProps {
  onSessionExpired?: () => void;
  children: React.ReactNode;
}

export interface ApiClientOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  code?: string;
  isNetworkError?: boolean;
  isTimeout?: boolean;
  isServerError?: boolean;
}

export interface ErrorContext {
  code?: string;
  isNetworkError?: boolean;
  isTimeout?: boolean;
  isServerError?: boolean;
  originalError?: Error | string;
}

/**
 * Error handling utilities for consistent error messaging
 */

export interface ErrorContext {
  code?: string;
  isNetworkError?: boolean;
  isTimeout?: boolean;
  isServerError?: boolean;
  originalError?: Error | string;
}

/**
 * Get a user-friendly error message based on error code
 */
export function getFriendlyErrorMessage(error: unknown, context?: ErrorContext): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    // Handle specific error codes
    const message = error.message;

    if (message === 'SESSION_EXPIRED') {
      return 'Your session has expired. Please sign in again.';
    }

    if (message === 'START_FAILED' || message === 'REQUEST_FAILED') {
      return 'AID could not start your request. Please try again.';
    }

    if (context?.isTimeout) {
      return 'Your request took too long. Please try again.';
    }

    if (context?.isNetworkError) {
      return 'Network error. Check your connection and try again.';
    }

    if (context?.isServerError) {
      return 'Server error. AID is experiencing issues. Please try again in a moment.';
    }

    // Google-related errors
    if (message.includes('GOOGLE') || message.includes('google')) {
      if (message.includes('GMAIL')) {
        return 'Could not access Gmail. Check your Google connection in Settings.';
      }
      if (message.includes('CALENDAR')) {
        return 'Could not access Calendar. Check your Google connection in Settings.';
      }
      if (message.includes('DRIVE')) {
        return 'Could not access Drive. Check your Google connection in Settings.';
      }
      return 'Google Workspace error. Try reconnecting in Settings.';
    }

    return message.replaceAll('_', ' ').toLowerCase();
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Check if an error is recoverable (user should try again)
 */
export function isRecoverableError(error: unknown, context?: ErrorContext): boolean {
  if (context?.isNetworkError || context?.isTimeout) {
    return true;
  }

  if (context?.isServerError) {
    return true;
  }

  if (typeof error === 'string') {
    return [
      'SESSION_EXPIRED',
      'START_FAILED',
      'REQUEST_FAILED',
      'TIMEOUT',
      'NETWORK_ERROR',
    ].some(code => error.includes(code));
  }

  if (error instanceof Error) {
    return isRecoverableError(error.message, context);
  }

  return false;
}

/**
 * Extract error code for logging and analytics
 */
export function getErrorCode(error: unknown, context?: ErrorContext): string {
  if (context?.code) {
    return context.code;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'UNKNOWN_ERROR';
}

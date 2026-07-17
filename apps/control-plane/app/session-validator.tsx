'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase';

interface Props {
  onSessionExpired?: () => void;
  children: React.ReactNode;
}

/**
 * Validates session and refreshes token before expiration
 * Shows re-auth prompt if session expires
 */
export function SessionValidator({ onSessionExpired, children }: Props) {
  const supabase = createSupabaseBrowserClient();
  const [showReauth, setShowReauth] = useState(false);

  useEffect(() => {
    let tokenRefreshInterval: NodeJS.Timeout;
    let sessionCheckInterval: NodeJS.Timeout;

    const startTokenRefresh = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setShowReauth(true);
          onSessionExpired?.();
          return;
        }

        // Refresh token 5 minutes before expiration
        const expiresAt = data.session.expires_at ?? 0;
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiration = expiresAt - now;

        if (timeUntilExpiration < 300) {
          // Less than 5 minutes, refresh now
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            setShowReauth(true);
            onSessionExpired?.();
          }
        }
      } catch (error) {
        console.error('Token refresh failed:', error);
        setShowReauth(true);
        onSessionExpired?.();
      }
    };

    // Check and refresh token every minute
    tokenRefreshInterval = setInterval(startTokenRefresh, 60000);
    sessionCheckInterval = setInterval(startTokenRefresh, 5000);

    // Initial check
    void startTokenRefresh();

    // Listen for auth state changes
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setShowReauth(true);
        onSessionExpired?.();
      }
    });

    return () => {
      clearInterval(tokenRefreshInterval);
      clearInterval(sessionCheckInterval);
      data.subscription.unsubscribe();
    };
  }, [supabase, onSessionExpired]);

  if (showReauth) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          maxWidth: '400px',
          textAlign: 'center',
        }}>
          <h2 style={{ marginBottom: '1rem' }}>Session expired</h2>
          <p style={{ marginBottom: '2rem', color: '#666' }}>
            Your session has expired. Please sign in again to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

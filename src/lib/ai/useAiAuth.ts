import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../supabase/client';

// Sign-in for the AI features (photo/message import, secure Capture) that does
// NOT turn on the sync engine and does NOT put a login wall on the field app.
// It talks to the Supabase auth client directly; the session persists across
// reloads (persistSession), so requestIntake's own getSession() keeps working.
// The full sync engine remains gated by VITE_ENABLE_SYNC inside sync.ts.

export interface AiAuthState {
  /** The Supabase client exists (an AI feature is enabled + configured). */
  available: boolean;
  /** Initial session lookup finished. */
  ready: boolean;
  signedIn: boolean;
  email: string | null;
  error: string | null;
  busy: boolean;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const friendlySignInError = (message: string): string => {
  const lower = message.toLowerCase();
  if (lower.includes('email logins are disabled') || lower.includes('email logins')) {
    return 'Email sign-in is turned off in Supabase. Enable the Email provider, then try again.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'That email and password did not match. Check both and try again.';
  }
  return 'Sign-in could not be completed. Check your connection and try again.';
};

export const useAiAuth = (): AiAuthState => {
  const client = useMemo(() => getSupabaseClient(), []);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) {
      setReady(true);
      return undefined;
    }
    let active = true;
    void client.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setEmail(data.session?.user?.email ?? null);
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(
    async (emailInput: string, password: string): Promise<boolean> => {
      if (!client) return false;
      setBusy(true);
      setError(null);
      try {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: emailInput.trim(),
          password,
        });
        if (signInError) {
          setError(friendlySignInError(signInError.message));
          return false;
        }
        return true;
      } catch {
        setError('Sign-in could not be completed. Check your connection and try again.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [client],
  );

  const signOut = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    try {
      await client.auth.signOut();
    } finally {
      setBusy(false);
    }
  }, [client]);

  return {
    available: Boolean(client),
    ready,
    signedIn: Boolean(email),
    email,
    error,
    busy,
    signIn,
    signOut,
  };
};

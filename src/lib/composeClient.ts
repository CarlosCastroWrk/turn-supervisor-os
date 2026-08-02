// Client for the crew text composer. The server returns a DRAFT; it opens in
// the phone's Messages composer and nothing sends until Los taps send there.

import { getSupabaseClient } from './supabase/client';

export interface ComposeUnitLine {
  unitNumber: string;
  sections: string[];
}

export const composeEnabled = () =>
  import.meta.env.VITE_ENABLE_INTAKE === 'true'
  || import.meta.env.VITE_ENABLE_AI === 'true';

const accessToken = async (): Promise<string | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  return error ? null : data.session?.access_token ?? null;
};

export const requestComposedText = async (payload: {
  crewName: string;
  trade: 'paint' | 'clean';
  language: 'english' | 'spanish';
  isRunner?: boolean;
  units: ComposeUnitLine[];
  instruction?: string;
}): Promise<string> => {
  const token = await accessToken();
  if (!token) throw new Error('Sign in to use the crew composer.');
  const response = await fetch('/api/compose', {
    body: JSON.stringify(payload),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const body = await response.json().catch(() => undefined) as
    | { text?: string; error?: string }
    | undefined;
  if (!response.ok || !body?.text) {
    throw new Error(body?.error ?? 'The composer is unavailable.');
  }
  return body.text;
};

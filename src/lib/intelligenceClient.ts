import { getSupabaseClient } from './supabase/client';

export interface TurnIntent {
  kind: 'release' | 'set-task' | 'remove-room' | 'assign' | 'note' | 'block' | 'unblock';
  unitNumber: string;
  trade?: 'paint' | 'clean' | null;
  sections?: ('common' | 'A' | 'B' | 'C' | 'D' | 'E')[];
  workType?: 'full' | 'touch-up' | 'cut-in' | 'full-cut-in' | 'touch-up-cut-in' | null;
  crewName?: string | null;
  note?: string | null;
  summary: string;
  confidence: 'high' | 'low';
}

export interface InterpretResult {
  intents: TurnIntent[];
  uncertainties: string[];
}

const accessToken = async () => {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  return error ? null : data.session?.access_token ?? null;
};

export interface ChatTurnMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatTurnResult {
  reply: string;
  intents: TurnIntent[];
  uncertainties: string[];
}

// One unified chat turn: conversation tail + board digest + roster in;
// a terse reply AND any proposed actions out. The model only proposes —
// the app applies intents after Los confirms.
export const chatWithTurnOS = async (payload: {
  messages: readonly ChatTurnMessage[];
  digest?: string;
  rosterUnitNumbers?: readonly string[];
  crews?: readonly { name: string; trade: 'paint' | 'clean' }[];
}): Promise<ChatTurnResult> => {
  const token = await accessToken();
  if (!token) {
    throw new Error('Sign in to Sync (More → Storage) to use Turn Chat.');
  }
  const response = await fetch('/api/intelligence/chat', {
    body: JSON.stringify({
      ...payload,
      today: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', weekday: 'short' }),
    }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (body as { error?: string } | null)?.error
        ?? 'Could not answer right now — try again.',
    );
  }
  const result = body as Partial<ChatTurnResult> | null;
  return {
    intents: result?.intents ?? [],
    reply: result?.reply ?? '',
    uncertainties: result?.uncertainties ?? [],
  };
};

export const interpretFieldWords = async (payload: {
  text: string;
  rosterUnitNumbers?: readonly string[];
  crews?: readonly { name: string; trade: 'paint' | 'clean' }[];
}): Promise<InterpretResult> => {
  const token = await accessToken();
  if (!token) {
    throw new Error('Sign in to Sync (More → Storage) to use Tell Turn OS.');
  }
  const response = await fetch('/api/intelligence/interpret', {
    body: JSON.stringify({
      ...payload,
      today: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
    }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (body as { error?: string } | null)?.error
        ?? 'Could not read that — try again or use the buttons.',
    );
  }
  return body as InterpretResult;
};

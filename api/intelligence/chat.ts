import {
  chatFieldWords,
  chatRequestSchema,
} from '../../server/intelligence/chat.js';
import { verifyCaptureUser } from '../../server/ai/captureAuth.js';
import { CaptureRouteError } from '../../server/ai/captureHandler.js';

// Turn Chat's AI turn. Same posture as the interpreter: Supabase sign-in +
// allowed-email BEFORE any AI spend, method/origin/size checks, a per-user
// rate limit, and zero operational writes — the model only talks.

const MAX_BODY_BYTES = 64_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 20;
const windows = new Map<string, number[]>();

const rateLimited = (key: string) => {
  const now = Date.now();
  const active = (windows.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  windows.set(key, active);
  if (active.length >= RATE_LIMIT_REQUESTS) return true;
  active.push(now);
  return false;
};

const bearerTokenFrom = (request: Request) => {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]{16,8192})$/);
  if (!match) {
    throw new CaptureRouteError(401, 'UNAUTHORIZED', 'Sign in to Sync to use Turn Chat.');
  }
  return match[1];
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json', vary: 'Authorization' },
    status,
  });

const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json(405, { error: 'POST only.' });
  }
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) {
    return json(403, { error: 'Cross-origin requests are not allowed.' });
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    return json(403, { error: 'Cross-origin requests are not allowed.' });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { error: 'That message is too long — split it up.' });
  }
  let user;
  try {
    user = await verifyCaptureUser(bearerTokenFrom(request));
  } catch (error) {
    if (error instanceof CaptureRouteError) {
      return json(error.status, { error: error.publicMessage });
    }
    return json(401, { error: 'Sign in to Sync to use Turn Chat.' });
  }
  if (rateLimited(user.id)) {
    return json(429, { error: 'Too many messages at once. Wait a minute and retry.' });
  }
  let parsed;
  try {
    parsed = chatRequestSchema.parse(await request.json());
  } catch {
    return json(400, { error: 'The request was not valid.' });
  }
  try {
    const result = await chatFieldWords(parsed);
    return json(200, result);
  } catch (error) {
    console.error('intelligence-chat-failed', error instanceof Error ? error.name : 'unknown');
    return json(502, { error: 'Could not answer right now — try again.' });
  }
};

export default {
  fetch: handler,
};

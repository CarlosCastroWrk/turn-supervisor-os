import {
  extractIntake,
  intakeRequestSchema,
} from '../../server/importIntake/extractIntake.js';
import { verifyCaptureUser } from '../../server/ai/captureAuth.js';
import { CaptureRouteError } from '../../server/ai/captureHandler.js';

// Turn OS intake extraction. Production is public, so this route CANNOT rely on
// Vercel deployment protection. It requires the same Supabase sign-in +
// allowed-email check as /api/agent/capture before spending any AI credit, then
// enforces method, origin, size, and a per-user rate limit. It performs no
// operational writes — results always go through the client's human review +
// confirm flows.

const MAX_BODY_BYTES = 8_500_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
// Photo imports are heavier than quick captures; allow a modest burst per user.
const RATE_LIMIT_REQUESTS = 8;
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
    throw new CaptureRouteError(401, 'UNAUTHORIZED', 'Sign in to Sync to use photo import.');
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
    return json(403, { error: 'Cross-origin intake requests are not allowed.' });
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    return json(403, { error: 'Cross-origin intake requests are not allowed.' });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { error: 'The photo is too large. Retake or crop it.' });
  }

  // Authenticate BEFORE reading the body or calling any AI provider, so an
  // unauthenticated caller can never spend credit or force an expensive path.
  let user;
  try {
    user = await verifyCaptureUser(bearerTokenFrom(request));
  } catch (error) {
    if (error instanceof CaptureRouteError) {
      return json(error.status, { error: error.publicMessage });
    }
    return json(401, { error: 'Sign in to Sync to use photo import.' });
  }

  if (rateLimited(user.id)) {
    return json(429, { error: 'Too many imports at once. Wait a minute and retry.' });
  }
  let parsed;
  try {
    parsed = intakeRequestSchema.parse(await request.json());
  } catch {
    return json(400, { error: 'The import request was not valid.' });
  }
  try {
    const result = await extractIntake(parsed);
    return json(200, result);
  } catch (error) {
    console.error('intake-extract-failed', error);
    return json(502, {
      error: 'The import reader could not process this source. Use paste or manual selection.',
    });
  }
};

export default {
  fetch: handler,
};

import {
  composeCrewText,
  composeRequestSchema,
} from '../server/compose/composeCrewText.js';
import { verifyCaptureUser } from '../server/ai/captureAuth.js';
import { CaptureRouteError } from '../server/ai/captureHandler.js';

// Crew text composer. Same lockdown as /api/importIntake/extract: Supabase
// sign-in + allowed-email check before any AI spend, method/origin/size
// checks, per-user rate limit. Output is a draft that opens in the phone's
// Messages app — the server never sends anything.

const MAX_BODY_BYTES = 64_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 10;
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
    throw new CaptureRouteError(401, 'UNAUTHORIZED', 'Sign in to use the crew composer.');
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
    return json(403, { error: 'Cross-origin composer requests are not allowed.' });
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    return json(403, { error: 'Cross-origin composer requests are not allowed.' });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { error: 'The composer request is too large.' });
  }

  let user;
  try {
    user = await verifyCaptureUser(bearerTokenFrom(request));
  } catch (error) {
    if (error instanceof CaptureRouteError) {
      return json(error.status, { error: error.publicMessage });
    }
    return json(401, { error: 'Sign in to use the crew composer.' });
  }

  if (rateLimited(user.id)) {
    return json(429, { error: 'Too many drafts at once. Wait a minute and retry.' });
  }
  let parsed;
  try {
    parsed = composeRequestSchema.parse(await request.json());
  } catch {
    return json(400, { error: 'The composer request was not valid.' });
  }
  try {
    const result = await composeCrewText(parsed);
    return json(200, result);
  } catch (error) {
    console.error('compose-failed', error instanceof Error ? error.name : 'unknown');
    return json(502, { error: 'The composer is unavailable. The standard prefilled text still works.' });
  }
};

export default {
  fetch: handler,
};

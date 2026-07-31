import {
  extractIntake,
  intakeRequestSchema,
} from '../../server/importIntake/extractIntake.js';

// Turn OS intake extraction. The deployment sits behind Vercel deployment
// protection; this route additionally enforces method, origin, size, and a
// per-IP rate limit. It performs no operational writes — results always go
// through the client's human review + confirm flows.

const MAX_BODY_BYTES = 8_500_000;
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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
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
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { error: 'The photo is too large. Retake or crop it.' });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) {
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

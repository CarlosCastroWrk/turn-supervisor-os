import {
  appendWalkRequest,
  portalTokenMatches,
  walkRequestSchema,
} from '../../server/portal/portalShared.js';

// Joseph or Paige asks Los for a walk from the portal. Token-gated (same share
// token as the read view) and rate-limited; the payload is unit numbers and a
// name only.

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 12;
const hits: number[] = [];

const rateLimited = () => {
  const now = Date.now();
  while (hits.length > 0 && now - hits[0] > RATE_LIMIT_WINDOW_MS) hits.shift();
  if (hits.length >= RATE_LIMIT_REQUESTS) return true;
  hits.push(now);
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
  const url = new URL(request.url);
  if (!portalTokenMatches(url.searchParams.get('k'))) {
    return json(401, { error: 'This portal link is not valid.' });
  }
  if (rateLimited()) {
    return json(429, { error: 'Too many walk requests right now. Try again in a minute.' });
  }
  let parsed;
  try {
    parsed = walkRequestSchema.parse(await request.json());
  } catch {
    return json(400, { error: 'Pick at least one unit and your name.' });
  }
  try {
    await appendWalkRequest(parsed);
    return json(200, { ok: true });
  } catch (error) {
    console.error('portal-request-walk-failed', error);
    return json(502, { error: 'The request could not be saved. Text Los instead.' });
  }
};

export default {
  fetch: handler,
};

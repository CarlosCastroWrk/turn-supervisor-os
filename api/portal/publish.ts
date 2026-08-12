import { verifyCaptureUser } from '../../server/ai/captureAuth.js';
import { CaptureRouteError } from '../../server/ai/captureHandler.js';
import {
  portalSnapshotSchema,
  portalStoreConfigured,
  writePortalSnapshot,
} from '../../server/portal/portalShared.js';

// Publishes the read-only portal snapshot. Only the signed-in allowed user
// (Los) can publish; the snapshot is unit-grain work status only.

const MAX_BODY_BYTES = 300_000;
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
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json', vary: 'Authorization' },
    status,
  });

const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json(405, { error: 'POST only.' });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { error: 'The portal snapshot is too large.' });
  }
  const match = (request.headers.get('authorization') ?? '')
    .match(/^Bearer\s+([A-Za-z0-9._~-]{16,8192})$/);
  if (!match) {
    return json(401, { error: 'Sign in to update the portal.' });
  }
  let user;
  try {
    user = await verifyCaptureUser(match[1]);
  } catch (error) {
    if (error instanceof CaptureRouteError) {
      return json(error.status, { error: error.publicMessage });
    }
    return json(401, { error: 'Sign in to update the portal.' });
  }
  if (rateLimited(user.id)) {
    return json(429, { error: 'Too many portal updates at once. Wait a minute.' });
  }
  if (!portalStoreConfigured()) {
    return json(503, { error: 'The portal store is not configured.' });
  }
  let parsed;
  try {
    parsed = portalSnapshotSchema.parse(await request.json());
  } catch {
    return json(400, { error: 'The portal snapshot was not valid.' });
  }
  try {
    await writePortalSnapshot(parsed);
  } catch (error) {
    console.error('portal-publish-failed', error instanceof Error ? error.name : 'unknown');
    return json(502, { error: 'The portal could not be updated. Run portal setup once, then retry.' });
  }
  const token = process.env.TURN_OS_PORTAL_TOKEN?.trim();
  const host = request.headers.get('host') ?? 'turn-supervisor-os.vercel.app';
  return json(200, {
    ok: true,
    shareUrl: token ? `https://${host}/portal.html?k=${token}` : undefined,
  });
};

export default {
  fetch: handler,
};

import { verifyCaptureUser } from '../../server/ai/captureAuth.js';
import { CaptureRouteError } from '../../server/ai/captureHandler.js';
import {
  clearWalkRequests,
  listWalkRequests,
} from '../../server/portal/portalShared.js';

// Los's side of walk requests: GET lists them, DELETE acknowledges (clears).
// Locked to the signed-in allowed user like every other write-adjacent route.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json', vary: 'Authorization' },
    status,
  });

const authorize = async (request: Request): Promise<Response | undefined> => {
  const match = (request.headers.get('authorization') ?? '')
    .match(/^Bearer\s+([A-Za-z0-9._~-]{16,8192})$/);
  if (!match) return json(401, { error: 'Sign in to see walk requests.' });
  try {
    await verifyCaptureUser(match[1]);
    return undefined;
  } catch (error) {
    if (error instanceof CaptureRouteError) {
      return json(error.status, { error: error.publicMessage });
    }
    return json(401, { error: 'Sign in to see walk requests.' });
  }
};

const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    return json(405, { error: 'GET or DELETE only.' });
  }
  const denied = await authorize(request);
  if (denied) return denied;
  try {
    if (request.method === 'DELETE') {
      await clearWalkRequests();
      return json(200, { ok: true });
    }
    return json(200, { items: await listWalkRequests() });
  } catch (error) {
    console.error('portal-requests-failed', error instanceof Error ? error.name : 'unknown');
    return json(502, { error: 'Walk requests are briefly unavailable.' });
  }
};

export default {
  fetch: handler,
};

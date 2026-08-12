import {
  portalTokenMatches,
  readPortalSnapshot,
} from '../../server/portal/portalShared.js';

// Read side of the property portal. Joseph & Paige hold a link containing the
// share token; no account needed. Read-only by construction — this route can
// only SELECT the single snapshot row.

const json = (status: number, body: unknown, cache = 'no-store') =>
  new Response(JSON.stringify(body), {
    headers: { 'cache-control': cache, 'content-type': 'application/json' },
    status,
  });

const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') {
    return json(405, { error: 'GET only.' });
  }
  const url = new URL(request.url);
  if (!portalTokenMatches(url.searchParams.get('k'))) {
    return json(401, { error: 'This portal link is not valid.' });
  }
  try {
    const snapshot = await readPortalSnapshot();
    if (!snapshot) {
      return json(200, { empty: true }, 'public, max-age=15');
    }
    return json(
      200,
      { payload: snapshot.payload, updatedAt: snapshot.updatedAt },
      'public, max-age=15',
    );
  } catch (error) {
    console.error('portal-view-failed', error instanceof Error ? error.name : 'unknown');
    return json(502, { error: 'The portal is briefly unavailable.' });
  }
};

export default {
  fetch: handler,
};

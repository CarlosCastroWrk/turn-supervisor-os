import { portalStoreConfigured, withPortalDb } from '../server/portal/portalShared.js';

// Keep the cloud project awake. Supabase's free tier pauses a project after
// seven days with no traffic, and sign-in dies with it (it happened Sep 8
// 2026: the login screen could not get through for a week of off-season).
// A daily Vercel cron calls this route; it makes one Auth request, one REST
// request, and one direct Postgres query — the kinds of traffic the idle
// check counts. No writes, no secrets returned, nothing the app depends on.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status,
  });

type PingResult = 'ok' | 'skipped' | 'failed';

const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') {
    return json(405, { error: 'GET only.' });
  }
  // Vercel sends the cron secret as a bearer token when CRON_SECRET is set.
  // When it is set, nobody else may trigger the pings.
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && (request.headers.get('authorization') ?? '') !== `Bearer ${secret}`) {
    return json(401, { error: 'Not authorized.' });
  }

  const results: Record<string, PingResult> = {};
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (supabaseUrl && anonKey) {
    for (const [name, path] of [['auth', '/auth/v1/health'], ['rest', '/rest/v1/']] as const) {
      try {
        const response = await fetch(new URL(path, supabaseUrl), {
          cache: 'no-store',
          headers: { apikey: anonKey },
          signal: AbortSignal.timeout(8_000),
        });
        results[name] = response.ok ? 'ok' : 'failed';
      } catch {
        results[name] = 'failed';
      }
    }
  } else {
    results.auth = 'skipped';
    results.rest = 'skipped';
  }

  if (portalStoreConfigured()) {
    try {
      await withPortalDb((client) => client.query('select 1'));
      results.db = 'ok';
    } catch {
      results.db = 'failed';
    }
  } else {
    results.db = 'skipped';
  }

  const healthy = Object.values(results).every((value) => value !== 'failed');
  if (!healthy) console.error('keepalive-failed', results);
  return json(healthy ? 200 : 502, { at: new Date().toISOString(), results });
};

export default {
  fetch: handler,
};

import pg from 'pg';
import { verifyCaptureUser } from '../../server/ai/captureAuth.js';
import { CaptureRouteError } from '../../server/ai/captureHandler.js';
import { portalTokenMatches } from '../../server/portal/portalShared.js';

// One-shot, idempotent portal-store setup. Runs ONLY this fixed DDL — there is
// no path to arbitrary SQL. Caller must be the signed-in allowed user OR hold
// the portal admin token. RLS is enabled with NO policies, so only the
// service-role server code can touch the table; anon and authenticated see
// nothing directly.

const PORTAL_DDL = `
create table if not exists public.portal_snapshots (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.portal_snapshots enable row level security;
`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status,
  });

const authorized = async (request: Request): Promise<boolean> => {
  const url = new URL(request.url);
  if (portalTokenMatches(url.searchParams.get('k'))) return true;
  const match = (request.headers.get('authorization') ?? '')
    .match(/^Bearer\s+([A-Za-z0-9._~-]{16,8192})$/);
  if (!match) return false;
  try {
    await verifyCaptureUser(match[1]);
    return true;
  } catch (error) {
    if (error instanceof CaptureRouteError) return false;
    return false;
  }
};

const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json(405, { error: 'POST only.' });
  }
  if (!(await authorized(request))) {
    return json(401, { error: 'Not authorized.' });
  }
  const connectionString = process.env.POSTGRES_URL_NON_POOLING?.trim()
    || process.env.POSTGRES_URL?.trim();
  if (!connectionString) {
    return json(503, { error: 'Database connection is not configured.' });
  }
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    await client.query(PORTAL_DDL);
    return json(200, { ok: true });
  } catch (error) {
    console.error('portal-setup-failed', error);
    return json(502, { error: 'Portal setup failed.' });
  } finally {
    await client.end().catch(() => undefined);
  }
};

export default {
  fetch: handler,
};

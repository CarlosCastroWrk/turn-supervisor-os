import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import keepalive from '../api/keepalive.ts';

// The free-tier database pauses after seven idle days and takes sign-in with
// it. A daily cron hits /api/keepalive so that never happens off-season.
// These pins keep the cron wired to a real route and the route safe to expose.

const ENV_KEYS = ['CRON_SECRET', 'SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING'] as const;
const withEnv = async (env: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => Promise<void>) => {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  try {
    await run();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
};

test('vercel.json schedules the keep-alive daily against a route that exists', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    crons?: { path: string; schedule: string }[];
  };
  const cron = config.crons?.find((entry) => entry.path === '/api/keepalive');
  assert.ok(cron, 'a cron entry points at /api/keepalive');
  assert.match(cron.schedule, /^\d+ \d+ \* \* \*$/, 'runs once a day (Hobby plan allows daily)');
  await access(new URL('../api/keepalive.ts', import.meta.url));
});

test('keep-alive is GET-only and honors CRON_SECRET when it is set', async () => {
  await withEnv({ CRON_SECRET: 'shh' }, async () => {
    const post = await keepalive.fetch(new Request('https://x.test/api/keepalive', { method: 'POST' }));
    assert.equal(post.status, 405);
    const noSecret = await keepalive.fetch(new Request('https://x.test/api/keepalive'));
    assert.equal(noSecret.status, 401);
  });
});

test('with nothing configured every ping is skipped and the route still answers 200', async () => {
  await withEnv({}, async () => {
    const response = await keepalive.fetch(new Request('https://x.test/api/keepalive'));
    assert.equal(response.status, 200);
    const body = await response.json() as { results: Record<string, string> };
    assert.deepEqual(body.results, { auth: 'skipped', rest: 'skipped', db: 'skipped' });
  });
});

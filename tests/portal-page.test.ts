import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { portalSnapshotSchema } from '../server/portal/portalShared.ts';

// The portal page (Joseph & Paige) is served under the site-wide CSP
// `script-src 'self'`, which forbids scripts written inside the HTML. An
// inline version once shipped: the page loaded, showed four zeros, and never
// fetched the board. These pins keep the script external and keep the chips
// the app sends from being stripped by the server schema.

test('portal.html carries no inline script — only /portal.js', async () => {
  const html = await readFile(new URL('../public/portal.html', import.meta.url), 'utf8');
  const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.ok(tags.length >= 1, 'the page loads a script');
  for (const [, attrs, body] of tags) {
    assert.match(attrs, /src="\/portal\.js"/, 'every script tag points at /portal.js');
    assert.equal(body.trim(), '', 'no inline script body');
  }
  assert.doesNotMatch(html, /\son[a-z]+="/i, 'no inline event handlers either');
});

test('the CSP that governs the portal still forbids inline scripts (so the pin above matters)', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const csp = config.headers[0].headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
  assert.match(csp, /script-src 'self'(;|$)/, 'script-src is exactly self');
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
});

test('portal.js parses and still does everything the page needs', async () => {
  const js = await readFile(new URL('../public/portal.js', import.meta.url), 'utf8');
  for (const needle of ['/api/portal/view', '/api/portal/request-walk', 'esc(', "el('list')", 'setInterval(load']) {
    assert.ok(js.includes(needle), `portal.js keeps ${needle}`);
  }
});

test('the snapshot schema keeps the ready-room counts and hold flag the app sends', () => {
  const parsed = portalSnapshotSchema.parse({
    propertyName: 'Moon Tower',
    generatedAt: '2026-09-09T12:00:00.000Z',
    units: [{ n: '1205', p: 'working', c: 'none', pr: 2, cr: 0, bk: true, cb: false, partial: true }],
  });
  assert.deepEqual(parsed.units[0], {
    n: '1205', p: 'working', c: 'none', pr: 2, cr: 0, bk: true, cb: false, partial: true,
  });
});

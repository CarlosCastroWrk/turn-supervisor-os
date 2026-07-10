import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

interface VercelConfig {
  headers?: HeaderRule[];
}

const configPath = new URL('../vercel.json', import.meta.url);

const loadHeaders = async () => {
  const config = JSON.parse(await readFile(configPath, 'utf8')) as VercelConfig;
  assert.equal(config.headers?.length, 1);
  assert.equal(config.headers?.[0]?.source, '/(.*)');
  const headers = new Map(config.headers?.[0]?.headers.map(({ key, value }) => [key, value]));
  assert.equal(headers.size, 5);
  return headers;
};

test('production responses use the required security headers', async () => {
  const headers = await loadHeaders();

  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headers.get('X-Frame-Options'), 'DENY');
  assert.equal(headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(headers.get('Permissions-Policy'), 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
});

test('content security policy preserves required field-app capabilities without unsafe scripts', async () => {
  const policy = (await loadHeaders()).get('Content-Security-Policy') ?? '';

  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ]) {
    assert.match(policy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(policy, /unsafe-eval|script-src[^;]*unsafe-inline/);
});

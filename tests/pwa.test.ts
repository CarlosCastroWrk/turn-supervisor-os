import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const serviceWorkerPath = new URL('../public/service-worker.js', import.meta.url);
const manifestPath = new URL('../public/manifest.webmanifest', import.meta.url);
const indexPath = new URL('../index.html', import.meta.url);

const cacheKey = (input: string | { url: string }) =>
  typeof input === 'string' ? input : new URL(input.url).pathname;

const loadServiceWorker = async ({
  cached = new Map<string, Response>(),
  fetchImpl,
}: {
  cached?: Map<string, Response>;
  fetchImpl: typeof fetch;
}) => {
  const source = (await readFile(serviceWorkerPath, 'utf8')).replace(
    'const NAVIGATION_TIMEOUT_MS = 4_000;',
    'const NAVIGATION_TIMEOUT_MS = 5;',
  );
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  let skipWaitingCalled = false;
  const cache = {
    async match(input: string | { url: string }) {
      return cached.get(cacheKey(input))?.clone();
    },
    async put(input: string | { url: string }, response: Response) {
      cached.set(cacheKey(input), response.clone());
    },
  };
  const caches = {
    async delete() {
      return true;
    },
    async keys() {
      return ['turn-supervisor-os-v0-4'];
    },
    async match(input: string | { url: string }) {
      return cached.get(cacheKey(input))?.clone();
    },
    async open() {
      return cache;
    },
  };
  const self = {
    clients: { claim: async () => undefined },
    location: { origin: 'https://turn.test' },
    addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
      listeners.set(type, listener);
    },
    async skipWaiting() {
      skipWaitingCalled = true;
    },
  };

  vm.runInNewContext(source, {
    AbortController,
    Response,
    URL,
    caches,
    clearTimeout,
    console,
    fetch: fetchImpl,
    self,
    setTimeout,
  });

  return { cached, listeners, skipWaitingCalled: () => skipWaitingCalled };
};

const pngDimensions = async (path: URL) => {
  const bytes = await readFile(path);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
};

test('manifest and iOS metadata provide install-safe PNG icons without locking orientation', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    icons: Array<{ purpose: string; sizes: string; src: string; type: string }>;
    orientation?: string;
    scope: string;
  };
  const html = await readFile(indexPath, 'utf8');

  assert.equal(manifest.scope, '/');
  assert.equal(manifest.orientation, undefined);
  assert.deepEqual(
    manifest.icons.map(({ purpose, sizes, type }) => ({ purpose, sizes, type })),
    [
      { purpose: 'any', sizes: '192x192', type: 'image/png' },
      { purpose: 'any', sizes: '512x512', type: 'image/png' },
      { purpose: 'maskable', sizes: '512x512', type: 'image/png' },
    ],
  );
  assert.match(html, /apple-touch-icon-180\.png/);
  assert.deepEqual(await pngDimensions(new URL('../public/icon-192.png', import.meta.url)), { height: 192, width: 192 });
  assert.deepEqual(await pngDimensions(new URL('../public/icon-512.png', import.meta.url)), { height: 512, width: 512 });
  assert.deepEqual(await pngDimensions(new URL('../public/icon-maskable-512.png', import.meta.url)), {
    height: 512,
    width: 512,
  });
  assert.deepEqual(await pngDimensions(new URL('../public/apple-touch-icon-180.png', import.meta.url)), {
    height: 180,
    width: 180,
  });
});

test('slow navigation falls back to the cached app shell within the bounded timeout', async () => {
  const cached = new Map([
    [
      '/index.html',
      new Response('<!doctype html><title>Cached Turn OS</title>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    ],
  ]);
  const fetchImpl = ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
    })) as typeof fetch;
  const worker = await loadServiceWorker({ cached, fetchImpl });
  let responsePromise: Promise<Response> | undefined;
  let lifetimePromise: Promise<unknown> | undefined;
  const event = {
    request: { method: 'GET', mode: 'navigate', url: 'https://turn.test/' },
    respondWith(value: Promise<Response>) {
      responsePromise = value;
    },
    waitUntil(value: Promise<unknown>) {
      lifetimePromise = value;
    },
  };

  const startedAt = Date.now();
  worker.listeners.get('fetch')?.(event);
  const response = await responsePromise;
  await lifetimePromise;

  assert.ok(Date.now() - startedAt < 250);
  assert.match(await response?.text(), /Cached Turn OS/);
});

test('an incomplete app-shell install rejects before activating the new worker', async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    if (url === '/index.html') {
      return new Response('<script type="module" src="/assets/app.js"></script>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (url === '/assets/app.js') {
      return new Response('', { status: 503 });
    }
    return new Response('asset');
  }) as typeof fetch;
  const worker = await loadServiceWorker({ fetchImpl });
  let installPromise: Promise<unknown> | undefined;
  worker.listeners.get('install')?.({
    waitUntil(value: Promise<unknown>) {
      installPromise = value;
    },
  });

  await assert.rejects(installPromise ?? Promise.resolve());
  assert.equal(worker.skipWaitingCalled(), false);
  assert.equal(worker.cached.size, 0);
});

test('navigating on the same build does not refetch the cached app assets', async () => {
  const html = '<!doctype html><script type="module" src="/assets/app.js"></script>';
  const cached = new Map([
    ['/index.html', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })],
  ]);
  const fetchCalls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    fetchCalls.push(url);
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }) as typeof fetch;
  const worker = await loadServiceWorker({ cached, fetchImpl });
  let responsePromise: Promise<Response> | undefined;
  let lifetimePromise: Promise<unknown> | undefined;
  worker.listeners.get('fetch')?.({
    request: { method: 'GET', mode: 'navigate', url: 'https://turn.test/' },
    respondWith(value: Promise<Response>) {
      responsePromise = value;
    },
    waitUntil(value: Promise<unknown>) {
      lifetimePromise = value;
    },
  });

  await responsePromise;
  await lifetimePromise;

  assert.deepEqual(fetchCalls, ['/']);
});

test('same-origin application data endpoints are never intercepted or cached', async () => {
  let networkCalls = 0;
  const worker = await loadServiceWorker({
    fetchImpl: (async () => {
      networkCalls += 1;
      return new Response('{"private":true}');
    }) as typeof fetch,
  });
  let intercepted = false;

  worker.listeners.get('fetch')?.({
    request: { method: 'GET', mode: 'cors', url: 'https://turn.test/api/private' },
    respondWith() {
      intercepted = true;
    },
    waitUntil() {
      throw new Error('Private data request should not extend the service worker lifetime.');
    },
  });

  assert.equal(intercepted, false);
  assert.equal(networkCalls, 0);
  assert.equal(worker.cached.size, 0);
});

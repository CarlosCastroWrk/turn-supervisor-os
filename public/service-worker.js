const CACHE_NAME = 'turn-supervisor-os-v0-5';
const NAVIGATION_TIMEOUT_MS = 4_000;
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon-180.png',
];

const isSameOrigin = (request) => new URL(request.url).origin === self.location.origin;

const isBuildAsset = (request) => {
  const { pathname } = new URL(request.url);
  return pathname.startsWith('/assets/');
};

const isStaticAppAsset = (request) => {
  const { pathname } = new URL(request.url);
  return APP_SHELL.includes(pathname);
};

const assetUrlsFromHtml = (html) => {
  const urls = new Set(APP_SHELL);
  const assetPattern = /\b(?:src|href)="([^"]+)"/g;
  let match;

  while ((match = assetPattern.exec(html))) {
    const value = match[1];
    if (value.startsWith('/assets/') || APP_SHELL.includes(value)) {
      urls.add(value);
    }
  }

  return [...urls];
};

const fetchCacheable = async (cache, url) => {
  if (url.startsWith('/assets/')) {
    const cached = await cache.match(url);
    if (cached) {
      return { response: cached, url };
    }
  }

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to cache ${url}: ${response.status}`);
  }
  return { response, url };
};

const matchCached = async (requestOrUrl) => {
  const directMatch = await caches.match(requestOrUrl);
  if (directMatch) {
    return directMatch;
  }

  const url = typeof requestOrUrl === 'string' ? requestOrUrl : new URL(requestOrUrl.url).pathname;
  return caches.match(url);
};

const offlineMiss = () => new Response('', { status: 504, statusText: 'Offline cache miss' });

const offlineDocument = () =>
  new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Turn OS offline</title><body><main><h1>Turn OS is offline</h1><p>Reconnect once so this device can restore the app shell.</p></main></body></html>',
    {
      status: 503,
      statusText: 'Offline app shell unavailable',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );

const cacheShellResponse = async (indexResponse) => {
  const html = await indexResponse.clone().text();
  const cache = await caches.open(CACHE_NAME);
  const cachedIndex = await cache.match('/index.html');
  if (cachedIndex && (await cachedIndex.text()) === html) {
    return;
  }

  const urls = assetUrlsFromHtml(html).filter((url) => url !== '/' && url !== '/index.html');
  const resources = await Promise.all(urls.map((url) => fetchCacheable(cache, url)));

  await Promise.all(resources.map(({ response, url }) => cache.put(url, response)));
  await cache.put('/index.html', indexResponse.clone());
  await cache.put('/', indexResponse);
};

const cacheCurrentAppShell = async () => {
  const indexResponse = await fetch('/index.html', { cache: 'no-store' });
  if (!indexResponse.ok) {
    throw new Error(`Failed to cache app shell: ${indexResponse.status}`);
  }
  await cacheShellResponse(indexResponse);
};

const fetchWithTimeout = async (request, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCurrentAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !isSameOrigin(event.request)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    const { pathname } = new URL(event.request.url);
    const isAppShellNavigation = pathname === '/' || pathname === '/index.html';
    if (!isAppShellNavigation) {
      // Standalone documents (the portal page) are network-only: never cached
      // here, never answered with the app shell. A stale copy of one of these
      // once poisoned the shell cache and haunted every slow load after it.
      event.respondWith(fetch(event.request).catch(() => offlineDocument()));
      return;
    }
    const networkResponse = fetchWithTimeout(event.request, NAVIGATION_TIMEOUT_MS).then((response) => {
      if (!response.ok) {
        throw new Error(`Navigation failed: ${response.status}`);
      }
      return response;
    });
    event.waitUntil(
      networkResponse
        .then((response) => {
          const contentType = response.headers.get('content-type') ?? '';
          return contentType.includes('text/html') ? cacheShellResponse(response.clone()) : undefined;
        })
        .catch(() => undefined),
    );
    event.respondWith(
      networkResponse.catch(async () => (await matchCached('/index.html')) ?? offlineDocument()),
    );
    return;
  }

  if (isBuildAsset(event.request)) {
    event.respondWith(
      matchCached(event.request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(event.request)
          .then(async (response) => {
            if (!response.ok) {
              return response;
            }
            const clone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, clone);
            return response;
          })
          .catch(() => offlineMiss());
      }),
    );
    return;
  }

  if (!isStaticAppAsset(event.request)) {
    return;
  }

  event.respondWith(
    matchCached(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then(async (response) => {
          if (!response.ok) {
            return response;
          }
          const clone = response.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, clone);
          return response;
        })
        .catch(() => offlineMiss());
    }),
  );
});

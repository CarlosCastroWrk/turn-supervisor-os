const CACHE_NAME = 'turn-supervisor-os-v0-3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

const isSameOrigin = (request) => new URL(request.url).origin === self.location.origin;

const isBuildAsset = (request) => {
  const { pathname } = new URL(request.url);
  return pathname.startsWith('/assets/');
};

const assetUrlsFromHtml = (html) => {
  const urls = new Set(APP_SHELL);
  const assetPattern = /\b(?:src|href)="([^"]+)"/g;
  let match;

  while ((match = assetPattern.exec(html))) {
    const value = match[1];
    if (value.startsWith('/assets/') || value === '/manifest.webmanifest' || value === '/icon.svg') {
      urls.add(value);
    }
  }

  return [...urls];
};

const fetchAndCache = async (cache, url) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to cache ${url}: ${response.status}`);
  }

  await cache.put(url, response);
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

const cacheCurrentAppShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch('/index.html', { cache: 'no-store' });

  if (!indexResponse.ok) {
    throw new Error(`Failed to cache app shell: ${indexResponse.status}`);
  }

  const html = await indexResponse.clone().text();
  await cache.put('/index.html', indexResponse.clone());
  await cache.put('/', indexResponse);

  const urls = assetUrlsFromHtml(html).filter((url) => url !== '/' && url !== '/index.html');
  await Promise.allSettled(urls.map((url) => fetchAndCache(cache, url)));
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheCurrentAppShell()
      .catch(() => caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
      .then(() => self.skipWaiting()),
  );
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
  if (event.request.method !== 'GET') {
    return;
  }

  if (!isSameOrigin(event.request)) {
    return;
  }

  // Network-first for page navigations so new builds reach the device;
  // fall back to the cached shell when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put('/index.html', clone);
            cache.put('/', response.clone());
          });
          response
            .clone()
            .text()
            .then((html) => {
              caches.open(CACHE_NAME).then((cache) => {
                assetUrlsFromHtml(html).forEach((url) => fetchAndCache(cache, url).catch(() => undefined));
              });
            })
            .catch(() => undefined);
          return response;
        })
        .catch(() => matchCached('/index.html')),
    );
    return;
  }

  if (isBuildAsset(event.request)) {
    event.respondWith(
      matchCached(event.request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        }).catch(() => offlineMiss());
      }),
    );
    return;
  }

  event.respondWith(
    matchCached(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => offlineMiss());
    }),
  );
});

/**
 * sw.js — ScoreKeep Pro Service Worker
 * Strategy: Cache-first for static assets, network-first for fonts
 * Provides full offline support once installed
 */

const CACHE_NAME    = 'scorekeep-pro-v1.2';
const FONT_CACHE    = 'scorekeep-fonts-v1';

// Core app shell files to pre-cache
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './accounts.js',
  './manifest.json',
];

// Google Fonts patterns
const FONT_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

/* =============================================
   INSTALL — pre-cache app shell
   ============================================= */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
});

/* =============================================
   ACTIVATE — clean up old caches
   ============================================= */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== FONT_CACHE)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

/* =============================================
   FETCH — serve from cache, fall back to network
   ============================================= */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and chrome-extension URLs
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  // Font caching: network-first with long cache
  if (FONT_PATTERNS.some(p => url.hostname.includes(p))) {
    event.respondWith(fontStrategy(request));
    return;
  }

  // App shell: cache-first
  event.respondWith(cacheFirst(request));
});

/* =============================================
   STRATEGIES
   ============================================= */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline fallback if available
    const fallback = await caches.match('./index.html');
    return fallback || new Response('Offline — ScoreKeep Pro', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function fontStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(FONT_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

/* =============================================
   BACKGROUND SYNC (future-ready)
   ============================================= */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-scores') {
    // Reserved for future backend sync
    console.log('[SW] Background sync triggered');
  }
});

/* =============================================
   PUSH NOTIFICATIONS (future-ready)
   ============================================= */
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'ScoreKeep Pro', {
      body: data.body || 'Match update!',
      icon: data.icon || './icons/icon-192.png',
    })
  );
});

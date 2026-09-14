/* ============================================================================
   تيسير — Service Worker (SW-1c)  ·  SHELL-ONLY offline foundation

   PURPOSE
   -------
   Pre-cache the small set of *stable, public, non-versioned* shell assets so
   that /library can still render when the network is unavailable. That is the
   ENTIRE scope of this worker. It is deliberately minimal and conservative:
   the offline experience is "the shell paints", not "the whole app works".

   WHAT IS **NOT** CACHED (on purpose)
   -----------------------------------
   - /react/*  — the React SPA bundle. Its filenames are content-hashed and
     rotate on every frontend build; caching them here would either go stale
     instantly or bloat the cache with dead entries.
   - PDF.js and any viewer runtime — large, lazily loaded, and coupled to the
     Range/206 streaming path below, which this worker must never touch.
   - Web fonts (.woff/.woff2, Google Fonts) — big binaries with their own
     long-lived HTTP caching; no benefit in duplicating them here.
   - /api/*  — private, per-user, auth-gated JSON. Caching it in the shared
     Cache Storage could leak one user's data to the next user of the device
     and would serve stale subscription/entitlement state.
   - File content / the viewer route — see the never-intercept rules below.

   NEVER-INTERCEPT RULES (why each one exists)
   -------------------------------------------
   1. Non-GET requests (POST/PUT/DELETE …) — mutations must always reach the
      server; a Cache Storage response is meaningless and dangerous here.
   2. Requests carrying a `Range` header — the file viewer streams bytes with
      HTTP Range requests and expects 206 Partial Content. A Service Worker
      that answers (or even re-issues) those requests can collapse a 206 into
      a 200, break byte-range seeking, and corrupt progressive rendering. We
      stay completely out of that path.
   3. /api/ — private gated data (auth, subscription, library listings). Must
      always be revalidated by the server, never served from a shared cache.
   4. /library/view/ — the gated file-content / viewer route. Access is
      enforced server-side per request; caching would both leak private
      content and bypass those checks.
   5. /admin — admin-only surface; must never be served from cache.
   6. Cross-origin requests — third-party responses (fonts, analytics, Drive)
      are opaque to us; caching or proxying them buys nothing and can break
      CORS/credentials semantics.
   7. The user-scoped IndexedDB file cache (see /static/file-cache.js) is the
      ONLY component allowed to persist file bytes. It is keyed per signed-in
      user and cleared on identity change. This Service Worker must never sit
      in front of it or duplicate it — otherwise a Cache Storage hit would
      bypass that per-user scoping and its eviction/budget logic entirely.

   Anything not explicitly handled below falls through: we simply return
   without calling event.respondWith(), and the browser performs its normal
   network fetch. Fail-open by construction.
   ========================================================================== */
'use strict';

// Bump this on EVERY future shell change (any edit to a SHELL_ASSETS file or
// to this list). The activate handler deletes every cache whose name differs,
// so a bump is what actually ships the new shell to returning visitors.
const CACHE_NAME = 'taysir-shell-v6';

// Exactly the 6 stable shell assets + the web app manifest. Nothing else.
const SHELL_ASSETS = [
  '/library',
  '/static/tokens.css',
  '/static/library.css',
  '/static/file-cache.js',
  '/static/library.js',
  '/static/favicon.svg',
  '/manifest.json'
];

// Fast lookup set for the fetch handler (pathname → is a shell asset?).
const SHELL_PATHS = new Set(SHELL_ASSETS);

// Paths this worker must NEVER intercept. See rules 3–5 above.
const NEVER_INTERCEPT_PREFIXES = ['/api/', '/library/view/', '/admin'];

/* ------------------------------------------------------------------ install */
// Pre-cache the shell, then take over immediately (skipWaiting) so the very
// first visit already has an offline-capable shell on the next navigation.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

/* ----------------------------------------------------------------- activate */
// Drop every cache from a previous CACHE_NAME, then claim open clients so the
// new worker controls already-loaded pages without a manual reload.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.map((name) => (name === CACHE_NAME ? undefined : caches.delete(name)))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* -------------------------------------------------------------------- fetch */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Rule 1 — only GET is ever eligible. Mutations always go to the network.
  if (request.method !== 'GET') return;

  // Rule 2 — Range requests belong to the viewer's 206 streaming path.
  // Touching them would break byte-range seeking / progressive rendering.
  let hasRange = false;
  try {
    hasRange = request.headers.has('range');
  } catch (e) {
    // Header access should never throw, but if it does we bail out (fail-open).
    hasRange = true;
  }
  if (hasRange) return;

  // Rule 6 — same-origin only. Cross-origin responses stay untouched.
  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // Rules 3–5 — private gated data (/api/), gated file content and the viewer
  // (/library/view/), and the admin surface (/admin) are never intercepted.
  for (const prefix of NEVER_INTERCEPT_PREFIXES) {
    if (path.startsWith(prefix)) return;
  }

  // NAVIGATION to /library → NETWORK-FIRST, cached '/library' as the fallback.
  // Network-first keeps the live page authoritative (fresh markup, fresh
  // session state); the cache only rescues a failed navigation (offline).
  if (request.mode === 'navigate') {
    if (path === '/library') {
      event.respondWith(networkFirstLibrary(request));
    }
    // Any other navigation falls through to the network untouched.
    return;
  }

  // Shell assets → STALE-WHILE-REVALIDATE: answer from cache instantly, then
  // refresh the cached copy in the background. A background failure is
  // swallowed, so serving can never break because the network is down.
  if (SHELL_PATHS.has(path)) {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }

  // Everything else (React bundle, PDF.js, fonts, images, …): no respondWith,
  // no caching — the browser handles it exactly as if no worker existed.
});

/* ------------------------------------------------------------------ helpers */

// Network-first for the /library document, falling back to the pre-cached
// shell when the network fails. A successful response also refreshes the
// cached '/library' entry so the offline fallback stays reasonably current.
function networkFirstLibrary(request) {
  return fetch(request).then(
    (response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put('/library', copy))
          .catch(() => { /* cache refresh is best-effort — never fatal */ });
      }
      return response;
    },
    () =>
      // Offline (or the request errored): serve the pre-cached shell. If even
      // that is missing, re-throw so the browser shows its own offline page.
      caches
        .match('/library', { cacheName: CACHE_NAME })
        .then((cached) => cached || Promise.reject(new Error('offline: no cached /library')))
  );
}

// Stale-while-revalidate for the fixed shell asset list: serve the cached copy
// immediately when present, and kick off a background refresh either way. All
// network/cache errors in the refresh path are swallowed on purpose.
function staleWhileRevalidate(event, request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            return cache.put(request, response.clone()).then(
              () => response,
              () => response // put() failed (quota?) → still return the response
            );
          }
          return response;
        })
        .catch(() => undefined); // network down → background update is a no-op

      if (cached) {
        // Keep the background refresh alive past the response we just returned.
        if (event && typeof event.waitUntil === 'function') {
          event.waitUntil(refresh);
        }
        return cached;
      }

      // Nothing cached yet (e.g. install partially failed): go to the network,
      // and if that also fails let the error surface as a normal fetch failure.
      return refresh.then((response) => response || fetch(request));
    })
  );
}

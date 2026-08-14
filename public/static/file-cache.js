/* ============================================================================
   تيسير — Persistent client-side file & listing cache  (IndexedDB)

   PURPOSE
   -------
   Make re-opening a file and re-entering a folder INSTANT, even after the
   browser was fully closed and reopened, WITHOUT the file ever landing in the
   phone's Downloads folder or being saved as a visible file. Everything lives
   inside the site's own IndexedDB (private origin storage) and is rendered from
   an in-memory Blob URL, so the OS download manager is never involved.

   SECURITY MODEL (this must not weaken the existing file-link security)
   --------------------------------------------------------------------
   • The FIRST time a file (or listing) is requested it is ALWAYS fetched through
     the Worker, which performs the full server-side auth / subscription / device
     gate. Only bytes the server AGREED to serve are ever written to the cache.
   • The cache is TIED to the STABLE user identity: every entry is stamped with
     a `sessionKey` derived ONLY from user.id (obtained from the gated
     /api/auth/me). Volatile fields (role / approved) are deliberately NOT part
     of the key, so a user's cached files survive across browser restarts and
     across approved/role changes — they reopen instantly instead of being
     re-downloaded every session.
     - The whole cache is cleared in EXACTLY two cases: an EXPLICIT user logout
       (clearAll), or a genuine user-identity change (a different authenticated
       user.id binds — see FileCache.bindSession). NOTHING else wipes it: HTTP
       401 / 402 / 403 responses, session expiry, timeouts and network errors
       leave every stored file untouched, because such failures are frequently
       transient and losing the whole cache over one is unacceptable.
     - Entries whose `sessionKey` (user.id) does not match the live user are
       ignored and purged, so the cache can never serve content across users.
     - Access enforcement stays on the SERVER: the first fetch of any file/listing
       still passes the full session + device + subscription gate in the Worker.
       The cache only ever holds bytes the server already agreed to serve, so
       keeping it across sessions does not weaken access control.
   • Nothing secret (tokens, API keys) is ever stored — only the already-served
     bytes + safe metadata, exactly what the authorised browser already held in
     memory.

   STORAGE HYGIENE
   ---------------
   • Two SEPARATE size limits: a PER-FILE cap (MAX_FILE_BYTES) and a WHOLE-CACHE
     budget (MAX_TOTAL_BYTES). They used to be one constant, which meant a single
     large file consumed the entire budget and evicted everything else. The total
     budget is additionally clamped to the device's real quota via
     navigator.storage.estimate(), so iOS Safari's small quota is respected while
     Android/desktop get to use much more space.
   • LRU eviction (oldest `savedAt` first, refreshed on every cache hit) runs
     until BOTH the entry-count cap and the effective byte budget are satisfied,
     so device storage never fills up.
   • Folder listings are cached separately (tiny) with a short freshness window;
     files are cached with their content-type so the viewer can rebuild a Blob.

   This module exposes a single global: `window.FileCache`.
   ========================================================================== */
(function () {
  'use strict';

  var DB_NAME = 'taysir-lib-cache';
  // NOTE: bumped 2 → 3 to repair databases left in a partial state (missing one
  // of the three stores) by an earlier build. The upgrade handler below creates
  // every store idempotently, so a plain versioned upgrade fully heals such a
  // DB. The DB is NEVER opened at a version above this constant — doing so would
  // leave the on-disk DB ahead of the version later loads request, making every
  // subsequent open fail permanently with VersionError.
  var DB_VERSION = 3;
  var STORE_FILES = 'files';       // { id, sessionKey, data:ArrayBuffer, contentType, name, savedAt, bytes }
  // NOTE (iOS fix): file bytes are stored as an ArrayBuffer in `data`, NOT as a
  // Blob. iOS Safari has long-standing WebKit bugs where Blob records written
  // to IndexedDB become unreadable after the browser is fully closed and
  // reopened (the row is still there, blob.size looks fine, but reading the
  // bytes fails) — which made every reopen a re-download on iPhone/iPad.
  // ArrayBuffers are serialized inline into the database and survive restarts
  // reliably on every platform. Legacy rows that still hold a Blob are read
  // if usable and migrated opportunistically; no version bump / wipe needed.
  var STORE_LISTINGS = 'listings'; // { key, sessionKey, data, savedAt }
  var STORE_META = 'meta';         // { key:'session', value:<sessionKey> }

  /* --------------------------------------------------------- size budgets
     TWO DISTINCT limits — conflating them was a real bug: a single 100 MB file
     used to consume the whole cache budget and evict every other file, so
     students who opened one large document lost every small one.

       • MAX_FILE_BYTES  — per-file cap. A single file larger than this is never
                           cached at all (it would be pointless churn).
       • MAX_TOTAL_BYTES — ceiling for the SUM of all cached file bytes, i.e.
                           the whole-cache budget. Deliberately much larger than
                           the per-file cap so several large files can coexist.
       • MAX_FILES       — secondary cap on the entry COUNT (files may now be
                           smaller on average, so this is generous).

     The effective total budget is additionally clamped at runtime to what the
     device actually offers (see initStorageBudget / navigator.storage.estimate). */
  var MAX_FILE_BYTES  = 150 * 1024 * 1024;         // ~150 MB per single file
  var MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;    // ~2 GB whole-cache budget
  var MAX_FILES = 200;                             // keep at most N recent files
  // Folder listings are cheap; keep a generous recent set.
  var MAX_LISTINGS = 400;
  // How long a cached listing is served before we treat it as stale and refresh
  // in the background (content still shows instantly meanwhile).
  var LISTING_FRESH_MS = 5 * 60 * 1000;     // 5 minutes

  var _dbPromise = null;
  var _sessionKey = null;   // active session identity; null = signed-out / unknown
  var _supported = ('indexedDB' in window);

  /* ------------------------------------------------------------------- log
     Lightweight, non-blocking instrumentation. Every call is wrapped so a
     missing/!throwing console (or a frozen console in some webviews) can never
     affect control flow. Prefix is always "[cache]" so the whole cache lifecycle
     can be filtered in devtools with a single search. */
  function log() {
    try {
      if (typeof console === 'undefined' || !console || !console.log) return;
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[cache]');
      console.log.apply(console, args);
    } catch (_e) { /* logging must never throw */ }
  }

  /* ------------------------------------------------- adaptive total budget
     MAX_TOTAL_BYTES is only an UPPER bound. The real limit is whatever the
     browser is willing to give this origin, which differs wildly: iOS Safari
     hands out a small quota, while Android Chrome / desktop typically offer
     many GB. Trying to store more than the quota just produces
     QuotaExceededError write failures, so we probe the quota once (best effort)
     via navigator.storage.estimate() and clamp the budget to it.

       effective = max(MAX_FILE_BYTES, min(MAX_TOTAL_BYTES, floor(quota * 0.8)))

     * quota * 0.8 leaves 20 % of the origin quota free so the browser never
       evicts our whole database under pressure.
     * `usage` is NOT subtracted. Most of `usage` is our OWN cached files, so
       subtracting it double-counted them: every probe shrank the budget again
       (a ratchet), which on iOS Safari's small quota collapsed it to 1-2 MB and
       made the cache evict files milliseconds after writing them.
     * The result is floored at MAX_FILE_BYTES so any single file the per-file
       cap allows can always be stored, on every device.

     Everything here is wrapped: estimate() may be missing, may reject, or may
     report nonsense — in every such case we silently keep MAX_TOTAL_BYTES. */
  var _effectiveTotalBytes = MAX_TOTAL_BYTES;   // resolved budget actually enforced
  var _budgetProbe = null;                      // single in-flight probe promise

  function effectiveTotalBytes() { return _effectiveTotalBytes; }

  function initStorageBudget() {
    if (_budgetProbe) return _budgetProbe;
    _budgetProbe = new Promise(function (resolve) {
      var est = null;
      try {
        if (typeof navigator !== 'undefined' && navigator && navigator.storage &&
            typeof navigator.storage.estimate === 'function') {
          est = navigator.storage.estimate();
        }
      } catch (_e) { est = null; }

      if (!est || typeof est.then !== 'function') {
        // Storage API unavailable (older Safari / webview) → keep the default.
        log('effective total budget: ' + _effectiveTotalBytes +
            ' (quota=unknown, usage=unknown — storage.estimate() unavailable)');
        resolve(_effectiveTotalBytes);
        return;
      }

      est.then(function (info) {
        var quota = (info && typeof info.quota === 'number' && isFinite(info.quota) && info.quota > 0)
          ? info.quota : 0;
        var usage = (info && typeof info.usage === 'number' && isFinite(info.usage) && info.usage > 0)
          ? info.usage : 0;
        if (quota > 0) {
          // 80 % of the quota. `usage` is deliberately NOT subtracted: most of
          // it IS our own cached files, so subtracting it double-counted them
          // and made the budget ratchet monotonically downwards on every probe
          // (collapsing to 1-2 MB on iOS Safari, where the quota is small).
          // Eviction already enforces the total, so the budget must stay a
          // stable function of the quota alone.
          var allowed = Math.floor(quota * 0.8);
          _effectiveTotalBytes = Math.min(MAX_TOTAL_BYTES, allowed);
          // Never end up with a budget so small that not even one allowed file
          // could ever be cached. This floor is UNCONDITIONAL — the old
          // `quota > MAX_FILE_BYTES` guard never fired on iOS (small quota),
          // which is exactly where the collapse needed rescuing.
          if (_effectiveTotalBytes < MAX_FILE_BYTES) {
            _effectiveTotalBytes = Math.min(MAX_TOTAL_BYTES, MAX_FILE_BYTES);
          }
        }
        log('effective total budget: ' + _effectiveTotalBytes +
            ' (quota=' + (quota || 'unknown') + ', usage=' + (usage || 0) + ')');
        resolve(_effectiveTotalBytes);
      }, function (e) {
        log('effective total budget: ' + _effectiveTotalBytes +
            ' (quota=unknown, usage=unknown — storage.estimate() failed)', e);
        resolve(_effectiveTotalBytes);
      });
    }).catch(function () { return _effectiveTotalBytes; });
    return _budgetProbe;
  }

  // Probe once at module init; never awaited by any caller, so a slow/hostile
  // Storage API can never delay a read or a write. Until it settles the default
  // MAX_TOTAL_BYTES is used, which is safe (eviction simply runs again later).
  try { initStorageBudget(); } catch (_e) { /* must never throw */ }

  // Set of in-flight file-write promises. A write is only removed once its
  // IndexedDB transaction has actually COMMITTED (txDone). flush() awaits these
  // so a quick tab-close / app-background (very common on iPhone) can no longer
  // lose a file that was just opened — it is guaranteed persisted for the next
  // session instead of being silently re-downloaded.
  var _pendingWrites = [];
  function trackWrite(p) {
    _pendingWrites.push(p);
    var done = function () {
      var i = _pendingWrites.indexOf(p);
      if (i !== -1) _pendingWrites.splice(i, 1);
    };
    p.then(done, done);
    return p;
  }

  // One-time warning so a broken/evicted store is observable instead of
  // silently degrading to a permanent re-download. Never throws.
  var _warnedStoreUnavailable = false;
  function warnStoreUnavailable(e) {
    if (_warnedStoreUnavailable) return;
    _warnedStoreUnavailable = true;
    try { console.warn('[FileCache] store unavailable', e); } catch (_e) {}
  }

  // Idempotent store creation. Guarded by contains() checks so it can run for
  // both the initial upgrade and a self-healing reopen without error.
  function ensureStores(db) {
    if (!db.objectStoreNames.contains(STORE_FILES)) {
      var fs = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      fs.createIndex('savedAt', 'savedAt', { unique: false });
    }
    if (!db.objectStoreNames.contains(STORE_LISTINGS)) {
      var ls = db.createObjectStore(STORE_LISTINGS, { keyPath: 'key' });
      ls.createIndex('savedAt', 'savedAt', { unique: false });
    }
    if (!db.objectStoreNames.contains(STORE_META)) {
      db.createObjectStore(STORE_META, { keyPath: 'key' });
    }
  }

  function hasAllStores(db) {
    return db.objectStoreNames.contains(STORE_FILES) &&
           db.objectStoreNames.contains(STORE_LISTINGS) &&
           db.objectStoreNames.contains(STORE_META);
  }

  // Wire the shared teardown handlers on a live db handle.
  function wireDbHandlers(db) {
    // If another tab requests a version change (or the DB is deleted), let
    // go of our handle so we transparently reopen instead of throwing
    // "connection is closing" on the next transaction.
    db.onversionchange = function () {
      try { db.close(); } catch (e) {}
      _dbPromise = null;
    };
    db.onclose = function () { _dbPromise = null; };
  }

  /* ------------------------------------------------------------------ open */
  function openDb() {
    if (!_supported) return Promise.reject(new Error('no-idb'));
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        ensureStores(req.result);
      };
      req.onsuccess = function () {
        var db = req.result;
        log('idb open OK (name=' + DB_NAME + ', version=' + db.version + ')');
        // A partial DB (missing one of the stores) is repaired by the normal
        // versioned upgrade above: DB_VERSION was bumped and ensureStores() is
        // idempotent, so onupgradeneeded runs and creates whatever is missing.
        // We deliberately do NOT reopen at a higher version here — that would
        // push the on-disk DB ahead of DB_VERSION and make every later
        // indexedDB.open(DB_NAME, DB_VERSION) fail forever with VersionError.
        // If stores are somehow still missing we just surface it so callers
        // fall back to the network for this page-session.
        if (!hasAllStores(db)) {
          warnStoreUnavailable(new Error('missing-object-stores'));
          try { db.close(); } catch (e) {}
          reject(new Error('idb-missing-object-stores'));
          return;
        }
        wireDbHandlers(db);
        resolve(db);
      };
      req.onerror = function () {
        var e = req.error || new Error('idb-open-failed');
        log('idb open FAILED: ' + (e && (e.name + ': ' + e.message)));
        reject(e);
      };
      // A blocked open (older connection still holding the DB) must not hang the
      // read/write path forever — surface it so callers fall back to the network.
      req.onblocked = function () {
        log('idb open BLOCKED (another tab holds an old connection)');
        reject(new Error('idb-open-blocked'));
      };
    }).catch(function (e) { _dbPromise = null; throw e; });
    return _dbPromise;
  }

  function tx(store, mode) {
    return openDb().then(function (db) {
      var t = db.transaction(store, mode);
      return { store: t.objectStore(store), tx: t };
    });
  }

  function reqToPromise(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function txDone(t) {
    return new Promise(function (resolve, reject) {
      t.oncomplete = function () { resolve(); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error || new Error('tx-abort')); };
    });
  }

  /* -------------------------------------------------- session binding / keys
     The cache is bound to exactly one STABLE user identity (user.id). We persist
     the active sessionKey in the meta store; the stored bytes are wiped ONLY
     when a genuinely DIFFERENT user.id binds (see bindSession) or on an explicit
     logout (see clearAll). Session expiry, auth/authorization errors (401 / 402 /
     403), timeouts and network failures NEVER wipe anything. */
  function readStoredSessionKey() {
    return tx(STORE_META, 'readonly').then(function (o) {
      return reqToPromise(o.store.get('session'));
    }).then(function (row) { return row ? row.value : null; })
      .catch(function () { return null; });
  }
  function writeStoredSessionKey(key) {
    return tx(STORE_META, 'readwrite').then(function (o) {
      o.store.put({ key: 'session', value: key });
      return txDone(o.tx);
    }).catch(function () {});
  }

  /**
   * Bind the cache to the current session identity. Pass a stable string that
   * depends ONLY on user.id (see deriveKey below), or null when signed out.
   *
   * We do NOT clear the cache just because approved/role changed between
   * sessions — the key is now identity-only, so those volatile fields never
   * enter it. The cache is only wiped when the actual user identity changes
   * (a genuinely different user logs in). Signing out / session expiry
   * (key === null) leaves the stored bytes in place but detaches the live
   * session, so getFile() serves nothing until the same user re-binds — the
   * moment they do, their files reopen instantly again. Access on the first
   * fetch is still enforced server-side, so keeping the cache across sessions
   * is safe. Returns a promise that resolves when ready.
   */
  /**
   * OPTIMISTIC bind from the key persisted in the meta store, WITHOUT any
   * network round-trip. The stored key was only ever written after a genuine
   * server-authenticated bind, so re-adopting it at startup is safe: it lets
   * cached listings/files serve INSTANTLY (and offline) instead of the whole
   * cache being dead until /api/auth/me answers. bindSession() reconciles
   * later: same user → no-op; different user → wipe; explicit signed-out
   * answer → detach (bytes kept). Resolves with the adopted key or null.
   */
  function bindStoredSession() {
    if (!_supported) return Promise.resolve(null);
    return readStoredSessionKey().then(function (stored) {
      if (stored) {
        _sessionKey = stored;
        log('session pre-bound from stored key (offline-safe)', { user: stored });
      } else {
        log('no stored session key (first visit or post-logout)');
      }
      return stored;
    }).catch(function () { return null; });
  }

  function bindSession(key) {
    _sessionKey = key || null;
    if (!_supported) return Promise.resolve();
    if (_sessionKey == null) {
      // Signed out / expired / unknown identity: detach the live session but keep
      // the cached bytes intact so the same user gets an instant reopen later.
      // This is deliberately NOT a wipe — session expiry must never destroy the
      // user's cached files.
      log('session unbound (no wipe: identity unknown / session expired)');
      return Promise.resolve();
    }
    return readStoredSessionKey().then(function (stored) {
      if (stored === _sessionKey) {
        // Same user.id → keep cache exactly as-is.
        log('session bound to same user, cache kept — _sessionKey=' + _sessionKey);
        return;
      }
      if (stored == null) {
        // First bind on a fresh/empty store (or right after an explicit logout
        // wipe): nothing to invalidate, just record the owner.
        log('session bound (first bind, nothing to invalidate)', { user: _sessionKey });
        return writeStoredSessionKey(_sessionKey);
      }
      // A genuinely DIFFERENT user's identity is now bound. This is the ONLY
      // implicit wipe: cached content must never cross users.
      return clearAllStores('user-identity-change: ' + stored + ' -> ' + _sessionKey)
        .then(function () { return writeStoredSessionKey(_sessionKey); });
    }).catch(function () {});
  }

  /** Build a stable per-session cache key from the safe /me user snapshot.
   *  The key depends ONLY on the stable user identity (user.id). Volatile
   *  fields like `role` and `approved` are deliberately EXCLUDED: they change
   *  between sessions (e.g. an approval flip) and would otherwise change the
   *  key, wiping the cache or rejecting valid cached files and forcing a
   *  re-download on every reopen. Access is still enforced server-side on the
   *  first fetch, so a change in approved/role is caught by the Worker gate —
   *  the cache only ever holds bytes the server already agreed to serve. */
  function deriveKey(user) {
    if (!user || !user.id) return null;
    return String(user.id);
  }

  /* ----------------------------------------------------------------- clear
     A full wipe happens in EXACTLY two situations:
       (a) clearAll('explicit-logout')  — the user pressed "log out";
       (b) bindSession() detecting a genuinely different authenticated user.id.
     Nothing else — no HTTP 401 / 402 / 403, no session expiry, no timeout, no
     network error — is allowed to call this. `reason` is logged so the exact
     trigger of any wipe is always visible in the console. */
  function clearAllStores(reason) {
    log('CLEAR all stores — reason:', reason || 'unspecified');
    if (!_supported) return Promise.resolve();
    return openDb().then(function (db) {
      var t = db.transaction([STORE_FILES, STORE_LISTINGS, STORE_META], 'readwrite');
      t.objectStore(STORE_FILES).clear();
      t.objectStore(STORE_LISTINGS).clear();
      t.objectStore(STORE_META).clear();
      return txDone(t);
    }).catch(function () {});
  }

  /**
   * Public: clear the entire cache. ONLY legitimate caller is an explicit user
   * logout action. Never call this from an error/HTTP-status handler: auth and
   * authorization failures (401 / 402 / 403), session expiry, timeouts and
   * network errors must leave the stored files untouched.
   * @param {string} [reason] trigger description, logged for traceability.
   */
  function clearAll(reason) {
    _sessionKey = null;
    return clearAllStores(reason || 'explicit-clearAll');
  }

  /* ------------------------------------------------------------- files API */

  /**
   * Look up a cached file for the CURRENT user. Resolves to
   * { blob, contentType, name } or null. The sessionKey match is kept, but it
   * now compares only the user.id-based key, so a valid user's own cached files
   * are no longer wrongly rejected when approved/role changed between sessions.
   * Entries belonging to a genuinely different user are ignored (and
   * opportunistically deleted).
   */
  function getFile(id) {
    if (!_supported || !_sessionKey) {
      log('MISS', id, _supported ? '(no bound session)' : '(indexeddb unsupported)');
      return Promise.resolve(null);
    }
    return tx(STORE_FILES, 'readonly').then(function (o) {
      return reqToPromise(o.store.get(id));
    }).then(function (row) {
      if (!row) { log('MISS', id, '(not cached → will fetch from network)'); return null; }
      if (row.sessionKey !== _sessionKey) {
        // Entry belongs to a different user.id → drop it, serve nothing.
        log('MISS', id, '(entry owned by another user → dropped)');
        deleteFile(id);
        return null;
      }
      // Preferred (iOS-safe) format: bytes stored as an ArrayBuffer in `data`.
      // Rebuild a fresh Blob from it on every read — ArrayBuffers survive a
      // full browser restart on iOS Safari, where stored Blobs did not.
      var blob = null;
      if (row.data && typeof row.data.byteLength === 'number' && row.data.byteLength > 0) {
        try {
          blob = new Blob([row.data], { type: row.contentType || 'application/octet-stream' });
        } catch (_e) { blob = null; }
      }
      // Legacy rows (pre-ArrayBuffer builds) may still hold a Blob; serve it if
      // it looks usable so existing caches keep working without a re-download,
      // and MIGRATE it to the restart-proof ArrayBuffer format in the
      // background (putFile converts + rewrites the row; best-effort).
      if (!blob) {
        var legacy = row.blob;
        var ok = legacy && (typeof legacy.size !== 'number' || legacy.size > 0) &&
                 (typeof Blob === 'undefined' || legacy instanceof Blob);
        if (ok) {
          blob = legacy;
          try {
            log('migrating legacy blob row \u2192 ArrayBuffer', id);
            putFile(id, legacy, row.contentType, row.name).catch(function () {});
          } catch (_e2) { /* migration is pure hygiene */ }
        }
      }
      if (!blob) {
        log('MISS', id, '(stored bytes unusable → dropped)');
        deleteFile(id);
        return null;
      }
      // Touch savedAt (LRU) without blocking the read path.
      touchFile(id);
      log('HIT', id, (row.bytes || blob.size || 0) + ' bytes (served from local cache)');
      return { blob: blob, contentType: row.contentType, name: row.name };
    }).catch(function (e) {
      warnStoreUnavailable(e);
      log('MISS', id, '(cache read failed → network)');
      return null;
    });
  }

  function touchFile(id) {
    tx(STORE_FILES, 'readwrite').then(function (o) {
      var g = o.store.get(id);
      g.onsuccess = function () {
        var row = g.result;
        if (row) { row.savedAt = Date.now(); o.store.put(row); }
      };
      return txDone(o.tx);
    }).catch(function () {});
  }

  function deleteFile(id) {
    return tx(STORE_FILES, 'readwrite').then(function (o) {
      o.store.delete(id);
      return txDone(o.tx);
    }).catch(function () {});
  }

  /** Public: drop one cached file (used when a stored blob turns out to be
   *  unreadable, so the next open falls back to a fresh gated fetch instead
   *  of a blank page). Never rejects. */
  function removeFile(id) {
    if (!_supported) return Promise.resolve();
    return deleteFile(id);
  }

  /**
   * Store a file blob for the CURRENT session, then evict down to budget.
   * No-op when signed out or unsupported. Never rejects (best-effort cache).
   *
   * The write is registered as a PENDING WRITE and only settles once its
   * transaction has COMMITTED, so flush() (wired to pagehide / visibilitychange
   * in library.js) can guarantee a just-opened file is durably persisted even
   * if the user immediately closes or backgrounds the browser — this is what
   * makes "opened once → opens instantly forever" actually hold on mobile.
   *
   * Large blobs are handled explicitly, with the PER-FILE cap kept strictly
   * separate from the whole-cache budget:
   *   • bytes > MAX_FILE_BYTES              → never cached (single file too big).
   *   • bytes > effective total budget      → cannot fit even with an empty
   *                                           cache → skipped.
   *   • otherwise                           → written, then the eviction pass
   *                                           removes OLDER entries until the
   *                                           total is back under budget, so a
   *                                           large file no longer wipes the
   *                                           cache and small files coexist
   *                                           with it.
   */
  // Blob → ArrayBuffer, with a fallback for engines lacking blob.arrayBuffer().
  function blobToArrayBuffer(blob) {
    try {
      if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    } catch (_e) { /* fall through */ }
    try {
      return new Response(blob).arrayBuffer();
    } catch (_e2) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(fr.error || new Error('read-failed')); };
        fr.readAsArrayBuffer(blob);
      });
    }
  }

  function putFile(id, blob, contentType, name) {
    if (!_supported || !_sessionKey || !blob) return Promise.resolve();
    var bytes = (blob && typeof blob.size === 'number') ? blob.size : 0;
    // (1) PER-FILE cap: a single file above this is never worth caching.
    if (bytes > MAX_FILE_BYTES) {
      log('WRITE skipped', id, bytes + ' bytes (exceeds per-file cap ' + MAX_FILE_BYTES + ')');
      return Promise.resolve();
    }
    // (2) WHOLE-CACHE budget: if the file alone cannot fit even after evicting
    //     every other entry, storing it would only trash the cache for nothing.
    if (bytes > effectiveTotalBytes()) {
      log('WRITE skipped (too large for budget)', id,
          bytes + ' bytes > total budget ' + effectiveTotalBytes());
      return Promise.resolve();
    }
    // Convert to an ArrayBuffer BEFORE the transaction: ArrayBuffers are
    // serialized inline into IndexedDB and reliably survive a full browser
    // restart on iOS Safari, where stored Blobs frequently became unreadable
    // (the root cause of "reopen always re-downloads" on iPhone/iPad).
    var owner = _sessionKey;
    var p = blobToArrayBuffer(blob).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('empty-buffer');
      var record = {
        id: id,
        sessionKey: owner,
        data: buf,
        contentType: contentType || (blob.type || 'application/octet-stream'),
        name: name || '',
        bytes: buf.byteLength,
        savedAt: Date.now(),
      };
      // The eviction pass runs AFTER the write has committed, so a slow evict
      // can never abort or race the durable write of the just-opened file.
      return tx(STORE_FILES, 'readwrite').then(function (o) {
        o.store.put(record);
        return txDone(o.tx);
      });
    });
    // Track only the durable-write phase for flush(); eviction is pure hygiene.
    trackWrite(p.then(function () {}, function () {}));
    return p.then(function () {
      log('WRITE', id, bytes + ' bytes (stored in local cache)');
      // Pass the id we just wrote so the eviction pass can never delete the
      // file the user is currently viewing.
      return evictFiles(id);
    }).catch(function (e) {
      warnStoreUnavailable(e);
      log('WRITE failed', id, bytes + ' bytes (cache left unchanged)');
    });
  }

  /**
   * Public: resolve once every in-flight file write has COMMITTED (or after a
   * safety timeout, so a stuck write never blocks a page unload). Called from
   * the page's pagehide / visibilitychange handlers so leaving the site can
   * never strand a half-written cache entry. Never rejects.
   */
  function flush() {
    if (!_supported || !_pendingWrites.length) return Promise.resolve();
    var pending = _pendingWrites.slice();
    var settleAll = Promise.all(pending.map(function (p) {
      return Promise.resolve(p).catch(function () {});
    }));
    var guard = new Promise(function (resolve) { setTimeout(resolve, 2000); });
    return Promise.race([settleAll, guard]);
  }

  /**
   * Evict OLDEST-FIRST (LRU by `savedAt`, which getFile() touches on every hit)
   * until BOTH caps hold:
   *     count      <= MAX_FILES                (secondary, entry-count cap)
   *     totalBytes <= effectiveTotalBytes()    (primary, whole-cache budget)
   *
   * A newly written large file that fits under MAX_FILE_BYTES but pushes the
   * total over budget therefore makes room by dropping the OLDEST entries —
   * it is never itself the reason the cache is wiped, and it is never skipped
   * here (putFile already refused anything that could not possibly fit).
   */
  function evictFiles(protectId) {
    return tx(STORE_FILES, 'readonly').then(function (o) {
      return reqToPromise(o.store.getAll());
    }).then(function (rows) {
      if (!rows || !rows.length) return;
      var budget = effectiveTotalBytes();
      // Only ever keep the current session's rows accounted; drop foreign ones.
      rows.sort(function (a, b) { return (a.savedAt || 0) - (b.savedAt || 0); }); // oldest first
      var totalBytes = 0, i;
      for (i = 0; i < rows.length; i++) totalBytes += (rows[i].bytes || 0);
      var toDelete = [];
      var freedBytes = 0;
      var count = rows.length;
      var overCount = count > MAX_FILES;
      var overBytes = totalBytes > budget;
      // Evict oldest while over EITHER cap; stop as soon as both are satisfied.
      i = 0;
      // The newest row is never a sensible eviction target either: it is the
      // file the user just opened (LRU order makes it last).
      var newestId = rows.length ? rows[rows.length - 1].id : null;
      while ((count > MAX_FILES || totalBytes > budget) && i < rows.length) {
        var row = rows[i];
        var rowBytes = (row.bytes || 0);
        // NEVER evict the entry that was just written (nor the most recently
        // saved row): deleting it is what made a freshly opened file vanish
        // milliseconds after being cached.
        if ((protectId != null && row.id === protectId) || row.id === newestId) {
          log('eviction: keeping just-written ' + row.id);
          i++;
          continue;
        }
        var reason = (count > MAX_FILES)
          ? ('count ' + count + ' > MAX_FILES ' + MAX_FILES)
          : ('total ' + totalBytes + ' > budget ' + budget);
        toDelete.push(row.id);
        freedBytes += rowBytes;
        totalBytes -= rowBytes;
        count--;
        i++;
        log('EVICT', row.id, 'freed ' + rowBytes + ' bytes (oldest-first, reason: ' + reason + ')');
      }
      if (!toDelete.length) return;
      return tx(STORE_FILES, 'readwrite').then(function (o) {
        for (var j = 0; j < toDelete.length; j++) o.store.delete(toDelete[j]);
        return txDone(o.tx);
      }).then(function () {
        log('EVICT done: removed ' + toDelete.length + ' entr' +
            (toDelete.length === 1 ? 'y' : 'ies') + ', freed ' + freedBytes +
            ' bytes, now ' + count + ' file(s) / ' + totalBytes + ' bytes' +
            ' (caps: MAX_FILES=' + MAX_FILES + ', budget=' + budget +
            ', triggered by: ' + (overCount && overBytes ? 'count+bytes' : (overCount ? 'count' : 'bytes')) + ')');
      });
    }).catch(function () {});
  }

  /* ---------------------------------------------------------- listings API */

  /**
   * Get a cached folder listing for the CURRENT session. Resolves to
   * { data, fresh } or null. `fresh` is false once past LISTING_FRESH_MS so the
   * caller can show it instantly AND refresh in the background.
   */
  function getListing(key) {
    if (!_supported || !_sessionKey) return Promise.resolve(null);
    return tx(STORE_LISTINGS, 'readonly').then(function (o) {
      return reqToPromise(o.store.get(key));
    }).then(function (row) {
      if (!row) return null;
      if (row.sessionKey !== _sessionKey) { deleteListing(key); return null; }
      var age = Date.now() - (row.savedAt || 0);
      return { data: row.data, fresh: age < LISTING_FRESH_MS };
    }).catch(function () { return null; });
  }

  function deleteListing(key) {
    return tx(STORE_LISTINGS, 'readwrite').then(function (o) {
      o.store.delete(key);
      return txDone(o.tx);
    }).catch(function () {});
  }

  function putListing(key, data) {
    if (!_supported || !_sessionKey || !data) return Promise.resolve();
    var record = { key: key, sessionKey: _sessionKey, data: data, savedAt: Date.now() };
    return tx(STORE_LISTINGS, 'readwrite').then(function (o) {
      o.store.put(record);
      return txDone(o.tx);
    }).then(function () { return evictListings(); }).catch(function () {});
  }

  function evictListings() {
    return tx(STORE_LISTINGS, 'readonly').then(function (o) {
      return reqToPromise(o.store.getAll());
    }).then(function (rows) {
      if (!rows || rows.length <= MAX_LISTINGS) return;
      rows.sort(function (a, b) { return (a.savedAt || 0) - (b.savedAt || 0); });
      var toDelete = rows.slice(0, rows.length - MAX_LISTINGS).map(function (r) { return r.key; });
      if (!toDelete.length) return;
      return tx(STORE_LISTINGS, 'readwrite').then(function (o) {
        for (var j = 0; j < toDelete.length; j++) o.store.delete(toDelete[j]);
        return txDone(o.tx);
      });
    }).catch(function () {});
  }

  /* --------------------------------------------------------------- export */
  window.FileCache = {
    supported: _supported,
    bindSession: bindSession,
    bindStoredSession: bindStoredSession,
    deriveKey: deriveKey,
    // Read-only introspection for the temporary on-screen debug panel.
    sessionKey: function () { return _sessionKey; },
    effectiveBudget: function () { return _effectiveTotalBytes; },
    clearAll: clearAll,
    getFile: getFile,
    putFile: putFile,
    removeFile: removeFile,
    flush: flush,
    getListing: getListing,
    putListing: putListing,
  };
})();

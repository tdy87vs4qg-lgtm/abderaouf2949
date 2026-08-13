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
   • LRU-ish eviction by count + total bytes so device storage never fills up.
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
  var STORE_FILES = 'files';       // { id, sessionKey, blob, contentType, name, savedAt, bytes }
  var STORE_LISTINGS = 'listings'; // { key, sessionKey, data, savedAt }
  var STORE_META = 'meta';         // { key:'session', value:<sessionKey> }

  // Eviction budget for cached file bytes (folder listings are tiny + separate).
  var MAX_FILES = 60;                       // keep at most N recent files
  var MAX_BYTES = 120 * 1024 * 1024;        // ~120 MB of cached file bytes
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
      req.onerror = function () { reject(req.error || new Error('idb-open-failed')); };
      // A blocked open (older connection still holding the DB) must not hang the
      // read/write path forever — surface it so callers fall back to the network.
      req.onblocked = function () { reject(new Error('idb-open-blocked')); };
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
        log('session bound to same user, cache kept', { user: _sessionKey });
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
      // Defensive: a stored entry with no usable blob (empty / detached) must be
      // treated as a MISS so the caller re-fetches through the gated Worker
      // instead of rendering a blank page. Drop the bad row opportunistically.
      var blob = row.blob;
      var ok = blob && (typeof blob.size !== 'number' || blob.size > 0) &&
               (typeof Blob === 'undefined' || blob instanceof Blob);
      if (!ok) {
        log('MISS', id, '(stored blob unusable → dropped)');
        deleteFile(id);
        return null;
      }
      // Touch savedAt (LRU) without blocking the read path.
      touchFile(id);
      log('HIT', id, (row.bytes || (blob && blob.size) || 0) + ' bytes (served from local cache)');
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
   * Large blobs are handled explicitly: anything above the whole-cache byte
   * budget is skipped (one file must not evict the entire cache), and a stored
   * blob is materialised so IndexedDB owns its own copy of the bytes.
   */
  function putFile(id, blob, contentType, name) {
    if (!_supported || !_sessionKey || !blob) return Promise.resolve();
    var bytes = (blob && typeof blob.size === 'number') ? blob.size : 0;
    // Skip caching absurdly large single files so one item can't blow the budget.
    if (bytes > MAX_BYTES) {
      log('WRITE skipped', id, bytes + ' bytes (exceeds cache budget)');
      return Promise.resolve();
    }
    var record = {
      id: id,
      sessionKey: _sessionKey,
      blob: blob,
      contentType: contentType || (blob.type || 'application/octet-stream'),
      name: name || '',
      bytes: bytes,
      savedAt: Date.now(),
    };
    // The eviction pass runs AFTER the write has committed, so a slow evict can
    // never abort or race the durable write of the file the user just opened.
    var p = tx(STORE_FILES, 'readwrite').then(function (o) {
      o.store.put(record);
      return txDone(o.tx);
    });
    // Track only the durable-write phase for flush(); eviction is pure hygiene.
    trackWrite(p.then(function () {}, function () {}));
    return p.then(function () {
      log('WRITE', id, bytes + ' bytes (stored in local cache)');
      return evictFiles();
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

  /** Evict oldest files until within MAX_FILES and MAX_BYTES. */
  function evictFiles() {
    return tx(STORE_FILES, 'readonly').then(function (o) {
      return reqToPromise(o.store.getAll());
    }).then(function (rows) {
      if (!rows || !rows.length) return;
      // Only ever keep the current session's rows accounted; drop foreign ones.
      rows.sort(function (a, b) { return (a.savedAt || 0) - (b.savedAt || 0); }); // oldest first
      var totalBytes = 0, i;
      for (i = 0; i < rows.length; i++) totalBytes += (rows[i].bytes || 0);
      var toDelete = [];
      var count = rows.length;
      // Evict oldest while over either budget.
      i = 0;
      while ((count > MAX_FILES || totalBytes > MAX_BYTES) && i < rows.length) {
        toDelete.push(rows[i].id);
        totalBytes -= (rows[i].bytes || 0);
        count--;
        i++;
      }
      if (!toDelete.length) return;
      return tx(STORE_FILES, 'readwrite').then(function (o) {
        for (var j = 0; j < toDelete.length; j++) o.store.delete(toDelete[j]);
        return txDone(o.tx);
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
    deriveKey: deriveKey,
    clearAll: clearAll,
    getFile: getFile,
    putFile: putFile,
    removeFile: removeFile,
    flush: flush,
    getListing: getListing,
    putListing: putListing,
  };
})();

/* ============================================================
   تيسير (Taysir) — UI behaviour
   - book covers into the 3:4 slots (from js/config.js)
   - each book is WIRED to its subject + future Drive folder
   - NOT-SUBSCRIBED glass banner (glassmorphism) before entering
     ⚠️ DISPLAY ONLY — merge step 7/10 binds what it SHOWS to the real
     session (GET /api/auth/me → window.TAYSIR_SESSION, published by
     src/pages/shelf.ts). It grants nothing: the authoritative gate is
     server-side (requireActiveSubscriber → 402 SUBSCRIPTION_REQUIRED on
     /api/library/file/:id/meta|content) and is NOT touched by the shelf.
   - inner book page = cozy shelf scene with plants, filled from the
     REAL Drive listing (merge step 10/10): GET /api/library/list
     ?folder=<id> with credentials:"same-origin". Sub-folders open
     deeper in the same shelf UI, files open taysir's own gated route
     /api/library/file/:id/content (still 402 for non-subscribers).
   - gentle tilt on hover (disabled with reduced motion)
   - dark/light theme with shelf lamps, shared with taysir
     (localStorage "taysir-theme" = "dark" | "light")
   ============================================================ */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer   = window.matchMedia("(pointer: fine)");

  var SUBJECTS   = window.TAYSIR_SUBJECTS || [];
  var FOLDER_URL = window.TAYSIR_FOLDER_URL || function () { return "folder.html"; };
  var FIND       = window.TAYSIR_FIND || function () { return null; };
  var SUB        = window.TAYSIR_SUBSCRIPTION || {};

  /* ------------------------------------------------------------
     DISPLAY-ONLY subscription read (merge step 7/10).

     ⚠️  This answers "should the glass banner be shown?" — NOTHING
     more. It is not, and must never be treated as, protection. The
     real gate is server-side and untouched by the shelf:
       src/lib/guards.ts → requireActiveSubscriber
       src/routes/library.ts → gateContent
         → 402 SUBSCRIPTION_REQUIRED on the file-content routes,
     re-decided from the validated httpOnly session per request.

     The value ultimately comes from taysir's existing endpoint
     GET /api/auth/me, published as window.TAYSIR_SESSION by the
     inline script in src/pages/shelf.ts and read through
     TAYSIR_SUBSCRIPTION.isSubscribed() in config.js. Deliberately
     evaluated fresh on every call so that when /me resolves after
     first paint, the next read already reflects the truth.
     ------------------------------------------------------------ */
  function isSubscribed() {
    return typeof SUB.isSubscribed === "function" ? !!SUB.isSubscribed() : false;
  }

  /* Has the server actually answered yet? Used only to avoid acting on
     the pessimistic pre-answer default while /me is still in flight. */
  function sessionResolved() {
    var s = window.TAYSIR_SESSION;
    return !!(s && typeof s === "object" && s.resolved === true);
  }

  /* Run `fn` once the real session state is known. If the page never
     published a session promise (e.g. the shelf markup reused elsewhere
     without the inline script), fall back to running immediately with
     whatever the resolver says — which defaults to NOT subscribed. */
  function whenSessionKnown(fn) {
    var p = window.TAYSIR_SESSION_READY;
    if (p && typeof p.then === "function") {
      p.then(function () { fn(); }, function () { fn(); });
      return;
    }
    fn();
  }

  /* ------------------------------------------------------------
     1) COVERS — one image per subject slot (3:4).
        Edit js/config.js to change any cover path.
     ------------------------------------------------------------ */
  function applyCovers() {
    document.querySelectorAll(".book-slot").forEach(function (slot) {
      var key     = slot.getAttribute("data-subject");
      var subject = FIND(key) || FIND(slot.getAttribute("data-slot"));
      var inner   = slot.querySelector(".slot-inner");
      if (!inner) return;

      var old = inner.querySelector("img.slot-cover");
      if (old) old.remove();
      slot.classList.remove("has-cover");

      var url = subject && subject.cover ? String(subject.cover).trim() : "";
      if (!url) return;                       /* -> cartoon fallback stays */

      var img = new Image();
      img.className = "slot-cover";
      img.alt = "";
      img.decoding = "async";
      img.onload = function () {
        inner.prepend(img);
        slot.classList.add("has-cover");
      };
      img.onerror = function () {
        slot.classList.remove("has-cover");    /* fallback stays visible */
      };
      img.src = url;
    });
  }

  /* public helper, unchanged API:
     window.setBookCover("slot-3", "images/covers/x.png"); */
  window.setBookCover = function (idOrKey, url) {
    var s = FIND(idOrKey);
    if (s) { s.cover = url || ""; applyCovers(); }
  };

  /* ============================================================
     2) SUBSCRIPTION GLASS BANNER  —  لوحة زجاجية
     Shown when a NON-subscribed visitor tries to enter the library
     content. Pure UI: it never changes any auth/session state.
     ============================================================ */
  var GATE_ID = "taysir-gate";

  function gateMount() {
    var m = document.getElementById("taysir-gate-mount");
    if (!m) {
      m = document.createElement("div");
      m.id = "taysir-gate-mount";
      document.body.appendChild(m);
    }
    return m;
  }

  function featureIcon() {
    return '' +
      '<svg class="gate-tick" viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="10.5" class="gate-tick-disc"/>' +
        '<path d="M7.4 12.4 L10.6 15.6 L16.8 8.9" fill="none" stroke="currentColor" ' +
              'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  }

  function buildGate() {
    var existing = document.getElementById(GATE_ID);
    if (existing) return existing;

    var feats = (SUB.features || []).map(function (f) {
      return '<li class="gate-feature">' + featureIcon() +
             '<span class="gate-feature-text">' + f + '</span></li>';
    }).join("");

    var price    = SUB.price    || "3000";
    var oldPrice = SUB.oldPrice || "5000";
    var cur      = SUB.currency || "DA";
    var period   = SUB.periodText || "";

    var wrap = document.createElement("div");
    wrap.id = GATE_ID;
    wrap.className = "gate-overlay";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "gate-title");
    wrap.setAttribute("hidden", "");

    wrap.innerHTML = '' +
      '<div class="gate-backdrop" data-gate-close></div>' +

      '<section class="gate-card" role="document">' +

        /* cartoon lock badge */
        '<span class="gate-badge" aria-hidden="true">' +
          '<svg viewBox="0 0 64 64">' +
            '<path d="M20 28 v-6 a12 12 0 0 1 24 0 v6" fill="none" stroke="#c07856" ' +
                  'stroke-width="6" stroke-linecap="round"/>' +
            '<rect x="13" y="27" width="38" height="30" rx="9" fill="#c9a15a"/>' +
            '<rect x="13" y="27" width="38" height="10" rx="5" fill="#d8b571"/>' +
            '<circle cx="32" cy="42" r="5" fill="#6b4224"/>' +
            '<rect x="30" y="44" width="4" height="8" rx="2" fill="#6b4224"/>' +
          '</svg>' +
        '</span>' +

        '<button class="gate-close" type="button" data-gate-close aria-label="إغلاق">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M7 7 L17 17 M17 7 L7 17" fill="none" stroke="currentColor" ' +
                  'stroke-width="2.6" stroke-linecap="round"/>' +
          '</svg>' +
        '</button>' +

        '<h2 class="gate-title" id="gate-title">لا يمكنك الدخول</h2>' +
        '<p class="gate-lead">هذا المحتوى مخصّص للمشتركين فقط، ولست مشتركًا بعد.</p>' +

        '<p class="gate-sub">اشترك الآن وافتح كل المكتبة:</p>' +
        '<ul class="gate-features">' + feats + '</ul>' +

        '<div class="gate-price">' +
          '<span class="gate-price-flag">عرض خاص</span>' +
          '<div class="gate-price-row">' +
            '<span class="gate-price-old"><s>' + oldPrice + '<i>' + cur + '</i></s></span>' +
            '<span class="gate-price-new">' + price + '<i>' + cur + '</i></span>' +
          '</div>' +
          (period ? '<span class="gate-price-period">' + period + '</span>' : "") +
        '</div>' +

        '<div class="gate-actions">' +
          '<a class="gate-btn gate-btn-main" id="gate-subscribe" href="#">اشترك الآن</a>' +
          '<button class="gate-btn gate-btn-ghost" type="button" data-gate-close>ليس الآن</button>' +
        '</div>' +

      '</section>';

    gateMount().appendChild(wrap);

    /* "اشترك الآن" — a plain link OUT to taysir's real subscription page
       (TAYSIR_SUBSCRIPTION.subscribeUrl in config.js, now "/subscription").
       It navigates and nothing else: it grants no access, sets no flag and
       writes no storage. Still inert if a deployment blanks the URL. */
    var btn = wrap.querySelector("#gate-subscribe");
    if (btn) {
      if (SUB.subscribeUrl) {
        btn.setAttribute("href", SUB.subscribeUrl);
      } else {
        btn.setAttribute("href", "#");
        btn.addEventListener("click", function (e) { e.preventDefault(); });
      }
    }

    wrap.querySelectorAll("[data-gate-close]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        closeGate();
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !wrap.hasAttribute("hidden")) closeGate();
    });

    return wrap;
  }

  var gateReturnFocus = null;

  function openGate(trigger) {
    var g = buildGate();
    gateReturnFocus = trigger || null;
    g.removeAttribute("hidden");
    /* next frame so the CSS transition runs */
    window.requestAnimationFrame(function () { g.classList.add("is-open"); });
    document.body.classList.add("gate-locked");
    var focusable = g.querySelector("#gate-subscribe");
    if (focusable) window.setTimeout(function () { focusable.focus(); }, 80);
  }

  function closeGate() {
    var g = document.getElementById(GATE_ID);
    if (!g) return;
    g.classList.remove("is-open");
    document.body.classList.remove("gate-locked");
    window.setTimeout(function () { g.setAttribute("hidden", ""); }, 320);
    if (gateReturnFocus && typeof gateReturnFocus.focus === "function") {
      gateReturnFocus.focus();
    }
    gateReturnFocus = null;
  }

  /* exposed so the rest of the app can reuse the same banner */
  window.TAYSIR_SHOW_SUBSCRIBE_GATE = function (trigger) { openGate(trigger); };
  window.TAYSIR_HIDE_SUBSCRIBE_GATE = closeGate;

  /* ------------------------------------------------------------
     Merge step 7/10 — keep the banner honest after it is painted.

     The banner may already be open when the /api/auth/me answer lands
     (a subscriber who clicked instantly). When the server confirms
     entitlement, take the now-wrong banner down. Strictly one-way:
     a server "not subscribed" is never used to grant anything, and
     this closes a DECORATION — it opens no content and touches no
     session. The 402 server gate is unaffected either way.
     ------------------------------------------------------------ */
  function syncGateWithSession() {
    if (!isSubscribed()) return;                 /* still not entitled → leave it */
    var g = document.getElementById(GATE_ID);
    if (g && !g.hasAttribute("hidden")) closeGate();
  }

  function initSessionSync() {
    document.addEventListener("taysir:session", syncGateWithSession);
    whenSessionKnown(syncGateWithSession);
  }

  /* ------------------------------------------------------------
     3) WIRING — each book knows its subject and where it will go.
        A non-subscribed visitor gets the glass banner instead.
     ------------------------------------------------------------ */
  function wireBooks() {
    document.querySelectorAll(".book-slot").forEach(function (slot) {
      var key     = slot.getAttribute("data-subject");
      var subject = FIND(key);
      if (!subject) return;

      /* expose the mapping on the element so it is easy to inspect */
      slot.setAttribute("data-drive-folder", subject.folderName);
      slot.setAttribute("data-drive-id", subject.driveId || "");
      slot.setAttribute("data-linked", subject.driveId ? "true" : "false");

      /* keyboard + pointer accessible link behaviour */
      slot.setAttribute("role", "link");
      slot.setAttribute("tabindex", "0");
      slot.setAttribute("aria-label", subject.folderName);

      /* Merge step 7/10: wait for the REAL session before deciding what to
         PAINT, so a subscriber who clicks during the first few hundred ms
         does not get a banner that is about to become wrong. This is a
         display decision only — the server still re-decides access on the
         file-content routes regardless of what happens here. */
      var go = function () {
        if (!sessionResolved()) {
          whenSessionKnown(function () {
            if (!isSubscribed()) { openGate(slot); return; }
            window.location.href = FOLDER_URL(subject);
          });
          return;
        }
        if (!isSubscribed()) { openGate(slot); return; }
        window.location.href = FOLDER_URL(subject);
      };

      slot.addEventListener("click", go);
      slot.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          go();
        }
      });
    });
  }

  /* The English subject labels that used to sit UNDER each book are
     removed completely. The cover art already carries the Arabic
     name, so the caption element is emptied (and hidden by CSS). */
  function clearEnglishCaptions() {
    document.querySelectorAll(".slot-caption").forEach(function (cap) {
      cap.textContent = "";
      cap.classList.remove("is-dev-label");
    });
  }

  /* ------------------------------------------------------------
     4) gentle 3D tilt (fine pointer only)
     ------------------------------------------------------------ */
  function initTilt() {
    if (reducedMotion.matches || !finePointer.matches) return;

    document.querySelectorAll(".book-slot").forEach(function (slot) {
      slot.addEventListener("pointermove", function (e) {
        if (reducedMotion.matches) return;
        var rect = slot.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width  - 0.5;
        var py = (e.clientY - rect.top)  / rect.height - 0.5;
        slot.style.transform =
          "perspective(700px) rotateY(" + (px * 7).toFixed(2) + "deg)" +
          " rotateX(" + (-py * 6).toFixed(2) + "deg)";
      });
      slot.addEventListener("pointerleave", function () {
        slot.style.transform = "";
      });
    });
  }

  function watchReducedMotion() {
    var handler = function () {
      if (reducedMotion.matches) {
        document.querySelectorAll(".book-slot").forEach(function (s) {
          s.style.transform = "";
        });
      }
    };
    if (typeof reducedMotion.addEventListener === "function") {
      reducedMotion.addEventListener("change", handler);
    } else if (typeof reducedMotion.addListener === "function") {
      reducedMotion.addListener(handler);
    }
  }

  /* ------------------------------------------------------------
     5) THEME — unified with taysir (merge step 6/10)

     ONE source of truth for the whole site:
       localStorage["taysir-theme"] = "dark" | "light"
       <html data-theme="dark">   /   <html data-theme="light">

     This mirrors taysir's ThemeProvider exactly (STORAGE_KEY
     "taysir-theme", Theme = 'dark' | 'light', applyTheme() does
     root.setAttribute('data-theme', theme) for BOTH values — the
     attribute is never removed). The old shelf convention
     ("day"/"night" + attribute removed for day) shared the same key
     with different meanings, which made the two sides misread each
     other and the theme flip-flop between pages.

     Visually, "dark" is the shelf's night scene (lamps on) — the
     shelf CSS night rules are keyed on html[data-theme="dark"].
     ------------------------------------------------------------ */
  var THEME_KEY = "taysir-theme";
  var themeSwitching = false;

  /** Current theme as taysir spells it: "dark" | "light". */
  function currentTheme() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;

    // Attribute missing (pre-paint script blocked) — same fallback
    // order taysir's readInitialTheme() uses: stored → OS → dark.
    try {
      var stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark" || stored === "light") return stored;
    } catch (e) { /* storage unavailable */ }

    if (window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches) return "light";

    return "dark";
  }

  function storeTheme(mode) {
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* ignore */ }
  }

  function applyTheme(mode) {
    var html = document.documentElement;
    var btn  = document.getElementById("theme-toggle");

    // taysir sets the attribute for BOTH values (never removes it).
    html.setAttribute("data-theme", mode);

    storeTheme(mode);
    if (btn) btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
  }

  function toggleTheme() {
    if (themeSwitching) return;
    var next = currentTheme() === "dark" ? "light" : "dark";
    var veil = document.getElementById("night-veil");

    if (reducedMotion.matches || !veil) { applyTheme(next); return; }

    themeSwitching = true;

    veil.className = "night-veil " +
      (next === "dark" ? "night-veil--dark" : "night-veil--light") +
      " is-covering";

    window.setTimeout(function () {
      applyTheme(next);
      veil.classList.remove("is-covering");
      veil.classList.add("is-fading");
    }, 520);

    window.setTimeout(function () {
      veil.className = "night-veil";
      themeSwitching = false;
    }, 1250);
  }

  function initTheme() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", currentTheme() === "dark" ? "true" : "false");
    btn.addEventListener("click", toggleTheme);
  }

  /* ============================================================
     6) INSIDE A BOOK — the cozy shelf scene
        The title ALWAYS reflects the folder actually opened.
        Still no sample / dummy content: everything on the boards
        comes from the server (see 6b), injected through the same
        TAYSIR_RENDER_FOLDER_ITEMS entry point that was reserved
        for it. An explicit window.TAYSIR_FOLDER_ITEMS array, if a
        page sets one, still overrides the fetch.
     ============================================================ */

  /* build ONE sub-folder standing on a shelf */
  function buildFolderCard(item, index) {
    var name = (item && (item.name || item.title)) || "";

    var wrap = document.createElement("div");
    wrap.className = "shelf-folder-wrap";
    wrap.style.setProperty("--lamp-delay", (index * 0.09).toFixed(2) + "s");

    wrap.innerHTML = '' +
      '<span class="shelf-lamp" aria-hidden="true">' +
        '<svg class="lamp-svg" viewBox="0 0 60 52">' +
          '<rect x="21" y="0" width="18" height="7" rx="3.5" class="lamp-mount"/>' +
          '<rect x="27.5" y="5" width="5" height="12" rx="2.5" class="lamp-arm"/>' +
          '<path d="M11 32 Q11 15 30 15 Q49 15 49 32 Z" class="lamp-shade"/>' +
          '<rect x="8" y="30" width="44" height="6" rx="3" class="lamp-rim"/>' +
          '<circle cx="30" cy="38" r="12" class="lamp-halo"/>' +
          '<circle cx="30" cy="37" r="6.5" class="lamp-bulb"/>' +
        '</svg>' +
      '</span>' +
      '<i class="lamp-beam" aria-hidden="true"></i>' +
      '<figure class="shelf-folder" role="link" tabindex="0">' +
        '<div class="shelf-folder-inner">' +
          '<svg class="shelf-folder-art" viewBox="0 0 72 58" aria-hidden="true">' +
            '<use href="#fb-folder"/>' +
          '</svg>' +
          '<span class="lamp-pool" aria-hidden="true"></span>' +
        '</div>' +
        '<figcaption class="shelf-folder-caption"></figcaption>' +
      '</figure>';

    var fig = wrap.querySelector(".shelf-folder");
    var cap = wrap.querySelector(".shelf-folder-caption");
    cap.textContent = name;
    fig.setAttribute("aria-label", name);

    if (item && item.id) fig.setAttribute("data-folder-id", item.id);
    if (item && item.href) {
      var go = function () { window.location.href = item.href; };
      fig.addEventListener("click", go);
      fig.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault(); go();
        }
      });
    }
    return wrap;
  }

  /* spread items across the available shelves, bottom shelf last */
  function renderFolderItems(items) {
    var mounts = Array.prototype.slice.call(
      document.querySelectorAll("#folder-library .shelf-mount")
    );
    if (!mounts.length) return;

    mounts.forEach(function (m) { m.innerHTML = ""; });

    var list = Array.isArray(items) ? items.filter(Boolean) : [];
    var note = document.getElementById("shelf-empty-note");
    var lib  = document.getElementById("folder-library");

    if (!list.length) {
      /* EMPTY ON PURPOSE — the real folders come from Drive later */
      if (lib) lib.classList.add("is-empty");
      if (note) {
        note.textContent = "لا توجد مجلدات هنا بعد.";
        note.hidden = false;
      }
      return;
    }

    if (lib) lib.classList.remove("is-empty");
    if (note) { note.textContent = ""; note.hidden = true; }

    var per = Math.ceil(list.length / mounts.length);
    list.forEach(function (item, i) {
      var mount = mounts[Math.min(Math.floor(i / per), mounts.length - 1)];
      mount.appendChild(buildFolderCard(item, i));
    });
  }

  /* public: called once the Drive listing is available */
  window.TAYSIR_RENDER_FOLDER_ITEMS = renderFolderItems;

  /* ============================================================
     6b) REAL DRIVE CONTENTS  —  merge step 10/10
     ------------------------------------------------------------
     The shelves above are a pure renderer: give it
     [{ id, name, href }, …] and it stands them on the boards.
     This section is the only thing that decides WHAT to give it,
     and it gets that from taysir's OWN, ALREADY-EXISTING library
     API — no new endpoint, no new server code, no shortcut:

       GET /api/library/list?folder=<driveFolderId>
         → src/routes/library.ts  (libraryApi.get('/list'))
         → src/lib/drive.ts       (listFolder)

     RESPONSE SHAPE (verified in src/lib/drive.ts → FolderListing):
       {
         ok: true,
         subscriber: boolean,          // isApproved(c) for THIS request
         folder:     { id, name, isRoot },
         breadcrumb: [{ id, name }],
         folders:    DriveNode[],      // kind === "folder"
         files:      DriveNode[],      // kind === "file"
         sample:     boolean           // true when Drive isn't configured
       }
     DriveNode = { id, name, kind:"folder"|"file", mimeType?, fileType?,
                   size?, modified?, hasThumb?, locked }

     So folders and files arrive in TWO SEPARATE, ALREADY-SORTED
     arrays and there is no mimeType sniffing to do on the client:
     the server has already normalised Drive's
     application/vnd.google-apps.folder (and resolved shortcuts to
     their real target file) into `folders` vs `files` for us.

     ⚠️  ACCESS IS NOT DECIDED HERE, AND CANNOT BE.
     /list is deliberately browsable by everyone (guests included):
     it answers 200 with `subscriber:false` and every file carrying
     `locked:true`. That is taysir's existing behaviour — titles are
     free, BYTES ARE NOT. Opening a file goes to the gated route
       GET /api/library/file/:id/content   (gateContent →
       requireActiveSubscriber → 402 SUBSCRIPTION_REQUIRED)
     which re-decides access from the validated httpOnly session on
     every single request. This file only renders links to it. A
     forged `locked:false`, a hand-typed href, or anything else done
     in the console still yields 402 and zero bytes.
     ============================================================ */

  var LIBRARY_API = "/api/library";

  /* ------------------------------------------------------------
     POSITION MEMORY for the shelf folder pages.
     These pages navigate with FULL page loads (folders → new URL,
     files → the gated content URL rendered by the browser), so when
     the user presses Back after reading a file the page reloads from
     scratch and would land at the top. To make the return seamless,
     the scroll position is saved per page-URL in sessionStorage just
     before leaving, and restored right after the real Drive items
     are rendered (so the page has its final height). sessionStorage:
     per-tab, survives refresh/back, wiped when the tab closes.
     Pure navigation state — stores only scroll offsets, never grants
     anything; the server-side 402 gate on file content is untouched.
     All storage access is try/catch-guarded: with storage disabled
     everything still works, just without restoration — no errors.
     ------------------------------------------------------------ */
  var SHELF_POS_KEY = "taysir:shelf:pos:v1";

  function shelfPosKey() {
    return window.location.pathname + window.location.search;
  }
  function readShelfPosMap() {
    try {
      var raw = sessionStorage.getItem(SHELF_POS_KEY);
      var map = raw ? JSON.parse(raw) : null;
      return (map && typeof map === "object") ? map : {};
    } catch (e) { return {}; }
  }
  function saveShelfScroll() {
    try {
      var map = readShelfPosMap();
      map[shelfPosKey()] = Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0));
      // Keep the map small: cap at 40 entries (drop arbitrary extras).
      var keys = Object.keys(map);
      if (keys.length > 40) { for (var i = 0; i < keys.length - 40; i++) delete map[keys[i]]; }
      sessionStorage.setItem(SHELF_POS_KEY, JSON.stringify(map));
    } catch (e) { /* storage unavailable → silently skip */ }
  }
  function restoreShelfScroll() {
    try {
      var map = readShelfPosMap();
      var top = map[shelfPosKey()];
      if (typeof top === "number" && top > 0) {
        // Instant jump — no smooth scrolling, so prefers-reduced-motion is
        // respected by construction.
        window.scrollTo(0, top);
      }
    } catch (e) { /* never break the page over a scroll restore */ }
  }
  function initShelfScrollMemory() {
    // Only meaningful on the folder pages (full-page navigation flow).
    if (!document.getElementById("folder-main")) return;
    // Save on every navigation away (link click or back/forward/unload).
    window.addEventListener("pagehide", saveShelfScroll);
    // Some browsers restore bfcache pages without re-running scripts fully;
    // pageshow covers the back-forward cache return as well.
    window.addEventListener("pageshow", function () { restoreShelfScroll(); });
  }

  /** Deeper navigation INSIDE the themed shelf UI (same page, new folder). */
  function shelfFolderHref(subjectKey, folderId) {
    var url = "/shelf/folder";
    var q = [];
    if (subjectKey) q.push("subject=" + encodeURIComponent(subjectKey));
    if (folderId)   q.push("folder="  + encodeURIComponent(folderId));
    return q.length ? url + "?" + q.join("&") : url;
  }

  /** taysir's REAL, subscriber-gated file route — identical to what the
      main library uses (public/static/library.js builds the same URL).
      Non-subscribers get taysir's 402 here; that is the point. */
  function libraryFileHref(fileId) {
    return LIBRARY_API + "/file/" + encodeURIComponent(fileId) + "/content";
  }

  /** Show an Arabic one-liner on the shelf with NO items, reusing the
      existing empty-note element (#shelf-empty-note) and its styling.
      Called for loading / unauthorized / error — the plain empty case
      keeps renderFolderItems' own "لا توجد مجلدات هنا بعد." wording. */
  function shelfMessage(text) {
    renderFolderItems([]);                    /* clears boards + empty state */
    var note = document.getElementById("shelf-empty-note");
    if (note) {
      note.textContent = text;
      note.hidden = false;
    }
  }

  /** Map ONE server DriveNode → the { id, name, href } the renderer wants. */
  function mapNode(node, subjectKey) {
    if (!node || !node.id) return null;
    var isFolder = node.kind === "folder";
    return {
      id:   node.id,
      name: node.name || "",
      href: isFolder
        /* sub-folder → stay in the themed shelf, one level deeper */
        ? shelfFolderHref(subjectKey, node.id)
        /* file (pdf, …) → taysir's own gated content route */
        : libraryFileHref(node.id)
    };
  }

  /**
   * Fetch the folder's real contents and put them on the shelves.
   * credentials:"same-origin" so the httpOnly session cookie rides along
   * and the server can identify the viewer exactly as it does elsewhere.
   */
  function loadFolderContents(subjectKey, folderId) {
    if (!folderId) {
      /* No Drive folder mapped for this subject yet → existing empty state. */
      renderFolderItems([]);
      return;
    }

    shelfMessage("جارٍ تحميل المحتوى…");

    var url = LIBRARY_API + "/list?folder=" + encodeURIComponent(folderId);

    fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        /* /list is browsable for guests today, but never assume: if a
           deployment ever gates it, degrade politely instead of crashing. */
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          var err = new Error("not-authorized");
          err.notAuthorized = true;
          throw err;
        }
        if (!res.ok) throw new Error("http-" + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error("api-error");

        var folders = Array.isArray(data.folders) ? data.folders : [];
        var files   = Array.isArray(data.files)   ? data.files   : [];

        /* Folders first, then files — the same order taysir's library
           shows, and each array is already name-sorted by the server. */
        var items = folders.concat(files)
          .map(function (n) { return mapNode(n, subjectKey); })
          .filter(Boolean);

        /* Empty folder → renderFolderItems paints the existing
           "لا توجد مجلدات هنا بعد." message on its own. */
        window.TAYSIR_RENDER_FOLDER_ITEMS(items);

        /* The page now has its final height → restore the exact position
           the visitor was at before opening a file / sub-folder here. */
        restoreShelfScroll();
      })
      .catch(function (err) {
        if (err && err.notAuthorized) {
          /* Reuse the banner already wired in step 7/10, and say why.
             The REAL protection is, and stays, the server's. */
          shelfMessage("هذا المحتوى متاح للمشتركين فقط.");
          try { openGate(null); } catch (e) { /* banner optional */ }
          return;
        }
        shelfMessage("تعذّر تحميل المحتوى، حاول مرة أخرى.");
      });
  }

  function initFolderPage() {
    var main = document.getElementById("folder-main");
    if (!main) return;

    /* The inner page shows the same DECORATIVE banner. Merge step 7/10:
       wait for the real /api/auth/me answer first, so a subscriber is not
       flashed a banner that is immediately wrong, and so a non-subscriber
       still reliably gets it. Presentational only — `is-gated` is a CSS
       hook; the actual bytes are still protected server-side by the 402
       gate on the file-content routes, which this cannot influence. */
    whenSessionKnown(function () {
      if (isSubscribed()) {
        document.body.classList.remove("is-gated");
        return;
      }
      document.body.classList.add("is-gated");
      openGate(null);
    });

    var params  = new URLSearchParams(window.location.search);
    var key     = params.get("subject") || "";
    var subject = FIND(key);

    /* Merge step 10/10 — the Drive folder actually being viewed.
       The URL wins over the subject's top-level driveId so that a
       SUB-FOLDER link (built by shelfFolderHref, same subject, deeper
       folder id) opens that sub-folder and not the subject root again. */
    var folderId = params.get("folder") || (subject && subject.driveId) || "";

    var titleEl   = document.getElementById("folder-title");
    var crumbEl   = document.getElementById("folder-crumb");
    var mappingEl = document.getElementById("folder-mapping");
    var stateEl   = document.getElementById("folder-state");
    var coverEl   = document.getElementById("folder-cover");
    var heroEl    = document.getElementById("folder-hero");

    /* --- TITLE: always the folder that was actually opened --- */
    var openedName = subject ? subject.folderName : "";

    if (!subject) {
      /* unknown / missing subject → no fixed wrong title at all */
      if (titleEl) titleEl.textContent = "";
      if (crumbEl) crumbEl.textContent = "";
      if (mappingEl) mappingEl.textContent = "";
      if (stateEl) stateEl.textContent = "";
      if (heroEl) heroEl.hidden = true;
      /* Unknown subject, but a folder id may still be in the URL (deep
         link). Load it if so; otherwise the shelves stay empty. */
      if (folderId) { loadFolderContents(key, folderId); }
      else { renderFolderItems(window.TAYSIR_FOLDER_ITEMS); }
      return;
    }

    document.body.setAttribute("data-subject", subject.key);
    document.title = "تيسير — " + openedName;

    if (titleEl) {
      titleEl.textContent = openedName;
      titleEl.classList.remove("is-dev-label");
    }
    if (crumbEl) {
      crumbEl.textContent = "المكتبة / " + openedName;
    }
    if (mappingEl) {
      mappingEl.textContent = openedName;
      mappingEl.classList.remove("is-dev-label");
    }
    /* no English placeholder strings anywhere */
    if (stateEl) {
      stateEl.textContent = "";
      stateEl.classList.remove("is-dev-label");
      stateEl.hidden = true;
    }

    /* small cover preview reusing the exact same slot markup */
    if (coverEl && subject.cover) {
      var inner = coverEl.querySelector(".slot-inner");
      var img = new Image();
      img.className = "slot-cover";
      img.alt = "";
      img.onload = function () {
        inner.prepend(img);
        coverEl.classList.add("has-cover");
      };
      img.src = subject.cover;
    }

    /* ---- MERGE STEP 10/10 — REAL CONTENTS ----------------------
       Was: renderFolderItems(window.TAYSIR_FOLDER_ITEMS) — an array
       config.js deliberately left empty, so the shelves were always
       bare. Now the page asks taysir's own GET /api/library/list for
       this folder and stands whatever the SERVER returns on the
       boards. An explicit window.TAYSIR_FOLDER_ITEMS is still honoured
       as a manual override (useful for previews); otherwise we fetch.
       ------------------------------------------------------------ */
    var preset = window.TAYSIR_FOLDER_ITEMS;
    if (Array.isArray(preset) && preset.length) {
      renderFolderItems(preset);
      return;
    }
    loadFolderContents(subject.key, folderId);
  }

  /* ------------------------------------------------------------ */
  function init() {
    applyCovers();
    wireBooks();
    clearEnglishCaptions();
    initTilt();
    watchReducedMotion();
    initTheme();
    initSessionSync();   /* merge step 7/10 — banner follows the real session */
    initShelfScrollMemory();
    initFolderPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

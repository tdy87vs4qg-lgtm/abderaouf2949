// ============================================================================
// تيسير — Subject (folder) page  ·  merge step 9/10
//
// Server-rendered shell for the "inside a book" folder scene, adapted from the
// staged design source at library-src/folder.html so it can be served by Hono
// at GET /shelf/folder (see src/index.tsx). EXACTLY the same pattern as
// src/pages/shelf.ts: this module exports a plain HTML string and the route
// hands it to `c.html(...)` — no session read, no guard, no Drive call.
//
// This is the page a book on /shelf opens. config.js builds that link in
// window.TAYSIR_FOLDER_URL, which in this step was repointed from the raw
// staged file "folder.html?..." to the served route "/shelf/folder?...".
// The query string is UNCHANGED — ?subject=<key>&folder=<driveId> — because
// app.js reads both params client-side:
//   public/static/shelf/js/app.js → initFolderPage()
//     new URLSearchParams(window.location.search).get("subject")
// so the server does not need to know or validate them here.
//
// WHAT WAS ADAPTED FROM THE SOURCE FILE (paths + isolation only — no design,
// no theme, no subscription and no Drive logic was changed in this step):
//
//   • ISOLATION — the whole folder markup is wrapped in <div class="shelf-root">.
//     public/static/shelf.css is scoped entirely under `.shelf-root` (step 2–3),
//     so without this wrapper NOTHING would be styled. The source put its page
//     class on <body class="folder-page">; that rule is now
//     `.shelf-root .folder-page`, so the class moved onto the wrapper and the
//     page background/min-height comes from `.shelf-root` itself. The wrapper
//     also contains the night veil and the gate mount, because those are styled
//     as `.shelf-root .night-veil` / `.shelf-root .gate-*`.
//
//   • STYLESHEET — `css/style.css` → `/static/shelf.css` (the isolated build).
//
//   • SCRIPTS — `js/config.js` + `js/app.js` → `/static/shelf/js/config.js` then
//     `/static/shelf/js/app.js` (the same served copies /shelf uses).
//     config.js MUST load first: app.js reads window.TAYSIR_* from it.
//
//   • TOGGLE CLASS — the theme button is `class="shelf-theme-toggle"`, the
//     renamed class from step 3/10 (taysir already owns a `.theme-toggle`).
//     Its `id` is unchanged: app.js binds the button via
//     document.getElementById("theme-toggle"), not via a class selector.
//
//   • BACK BUTTON — `href="index.html"` → `href="/shelf"`, the served shelf
//     home from step 5/10. Same reason as TAYSIR_FOLDER_URL: the staged
//     relative filenames are not routes on taysir.
//
//   • THEME PRE-PAINT — the source still carried the OLD pre-paint script
//     (taysir-theme === "night", attribute only set for night). That is the
//     exact bug step 6/10 removed from the shelf. The <head> below is a
//     VERBATIM COPY of the <head> in src/pages/shelf.ts, so both pages run the
//     identical "dark"/"light" pre-paint against localStorage["taysir-theme"]
//     and cannot disagree about the theme when navigating between them.
//
//   • REAL SESSION — the inline block before config.js is likewise a VERBATIM
//     COPY of the step 7/10 block in src/pages/shelf.ts: it calls taysir's
//     EXISTING endpoint GET /api/auth/me (src/routes/auth.ts) with
//     credentials:"same-origin" and publishes window.TAYSIR_SESSION, whose
//     `isSubscribed` mirrors src/lib/guards.ts → requireActiveSubscriber
//     (admin, OR subscriber with approved === true). Copied rather than
//     re-derived precisely so the two pages can never drift apart.
//
//     THIS ADDS NO PROTECTION AND WEAKENS NONE. The glass banner is decoration.
//     The real gate is untouched and stays entirely server-side:
//     requireActiveSubscriber → gateContent → 402 SUBSCRIPTION_REQUIRED on
//     GET /api/library/file/:id/meta|content, re-decided from the validated
//     httpOnly session on every single request.
//
// NOT DONE HERE — NO DRIVE WIRING (that is step 10/10). Nothing on this page
// fetches or lists Drive contents. app.js → initFolderPage() runs and renders
// the scene from config.js alone: the subject title + breadcrumb ("المكتبة /
// <name>") and the small cover, then calls renderFolderItems() with
// window.TAYSIR_FOLDER_ITEMS, which config.js still defines as []. So the
// shelves stay empty and app.js prints its own Arabic note,
// "لا توجد مجلدات هنا بعد." — by design for this step. The `folder` query
// param is carried in the URL but deliberately not consumed yet.
// ============================================================================

export const shelfFolderPage = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>تيسير</title>
  <meta name="description" content="تيسير — مكتبة كرتونية (RTL)" />

  <!-- تطبيق الوضع المحفوظ قبل الرسم لتجنّب وميض التبديل
       يستعمل نفس مفتاح تيسير وقيمه: taysir-theme = "dark" | "light" -->
  <script>
    (function () {
      // Mirrors taysir's ThemeProvider: same key ("taysir-theme"), same
      // values ("dark" / "light"), same fallback order (stored → OS →
      // dark) and the same application (data-theme is always set, for
      // BOTH values — never removed).
      var t;
      try { t = localStorage.getItem("taysir-theme"); } catch (e) { /* storage unavailable */ }

      if (t !== "dark" && t !== "light") {
        t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches)
          ? "light" : "dark";
      }

      document.documentElement.setAttribute("data-theme", t);
      document.documentElement.style.colorScheme = t;
    })();
  </script>

  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Marhey:wght@400;600;700&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />

  <!-- isolated shelf skin — every rule inside is scoped under .shelf-root -->
  <link rel="stylesheet" href="/static/shelf.css" />
</head>
<body>

<!-- ISOLATION CONTAINER — required: all of shelf.css lives under .shelf-root.
     "folder-page" moved here off <body> (the rule is ".shelf-root .folder-page"). -->
<div class="shelf-root folder-page">

    <div class="room folder-room">

      <header class="room-header folder-header">
        <div class="title-row">
          <!-- back to the shelf -->
          <a class="back-btn" href="/shelf" id="folder-back" aria-label="رجوع">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5 L16 12 L9 19" fill="none" stroke="currentColor"
                    stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>

          <!-- FOLDER TITLE — always reflects the folder actually opened -->
          <h1 class="room-title folder-title" id="folder-title"></h1>

          <button id="theme-toggle" class="shelf-theme-toggle" type="button"
                  aria-pressed="false" aria-label="تبديل الوضع" title="تبديل الوضع">
            <svg class="toggle-icon icon-sun" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="5" fill="#f6d98a"/>
              <g stroke="#f6d98a" stroke-width="2" stroke-linecap="round">
                <path d="M12 2.5 V5"/><path d="M12 19 V21.5"/>
                <path d="M2.5 12 H5"/><path d="M19 12 H21.5"/>
                <path d="M5.3 5.3 L7 7"/><path d="M17 17 L18.7 18.7"/>
                <path d="M18.7 5.3 L17 7"/><path d="M7 17 L5.3 18.7"/>
              </g>
            </svg>
            <svg class="toggle-icon icon-moon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 14.5 A8.5 8.5 0 1 1 9.5 4 A7 7 0 0 0 20 14.5 Z" fill="#f6e7b8"/>
              <circle cx="10" cy="9" r="1.2" fill="#d9c48c"/>
              <circle cx="13.5" cy="13.5" r="0.9" fill="#d9c48c"/>
            </svg>
          </button>
        </div>

        <!-- breadcrumb of the opened folder (Arabic only) -->
        <p class="room-subtitle folder-crumb" id="folder-crumb"></p>
      </header>

      <main class="folder-main" id="folder-main">

        <!-- the book this page belongs to (cover shown small, Arabic name only) -->
        <section class="folder-hero" id="folder-hero">
          <figure class="folder-cover" id="folder-cover">
            <div class="slot-inner">
              <div class="slot-fallback" aria-hidden="true">
                <svg class="fallback-art" viewBox="0 0 60 80"><use href="#fb-book"/></svg>
              </div>
            </div>
          </figure>
          <div class="folder-meta">
            <p class="folder-mapping" id="folder-mapping"></p>
            <p class="folder-state" id="folder-state"></p>
          </div>
        </section>

        <!-- ============================================================
             THE SHELF SCENE INSIDE A BOOK
             Cozy shelves + plants. Sub-folders (when they exist) are
             rendered ON the boards by js/app.js — nothing is hard-coded,
             there is NO sample content on purpose.
             ============================================================ -->
        <div class="library folder-library" id="folder-library">

          <!-- ───────────── INNER SHELF 1 ───────────── -->
          <section class="shelf-unit" aria-label="رف">
            <div class="shelf-items" data-shelf="1">

              <!-- deco: hanging trailing plant -->
              <figure class="deco deco-hanging" aria-hidden="true">
                <svg viewBox="0 0 96 150" class="deco-svg">
                  <path d="M28 4 Q48 22 68 4" fill="none" stroke="#9a7a52" stroke-width="2.4"/>
                  <path d="M48 12 V26" stroke="#9a7a52" stroke-width="2.4"/>
                  <path d="M22 26 h52 l-7 26 a12 12 0 0 1 -38 0 Z" fill="#c07856"/>
                  <path d="M22 26 h52 v8 h-52 Z" fill="#d2896a"/>
                  <path class="vine vine-a" d="M34 52 Q28 78 36 100 Q42 118 34 136"
                        fill="none" stroke="#5c7550" stroke-width="3" stroke-linecap="round"/>
                  <path class="vine vine-b" d="M60 52 Q68 76 60 96 Q54 114 62 128"
                        fill="none" stroke="#6b8459" stroke-width="3" stroke-linecap="round"/>
                  <g fill="#7d9668">
                    <ellipse cx="29" cy="66" rx="7" ry="5" transform="rotate(-20 29 66)"/>
                    <ellipse cx="40" cy="82" rx="7" ry="5" transform="rotate(18 40 82)"/>
                    <ellipse cx="31" cy="98" rx="6.4" ry="4.6" transform="rotate(-16 31 98)"/>
                    <ellipse cx="40" cy="116" rx="6" ry="4.4" transform="rotate(22 40 116)"/>
                    <ellipse cx="31" cy="132" rx="5.6" ry="4" transform="rotate(-14 31 132)"/>
                  </g>
                  <g fill="#8fa878">
                    <ellipse cx="67" cy="64" rx="6.6" ry="4.8" transform="rotate(20 67 64)"/>
                    <ellipse cx="57" cy="80" rx="6.6" ry="4.8" transform="rotate(-18 57 80)"/>
                    <ellipse cx="66" cy="98" rx="6" ry="4.4" transform="rotate(16 66 98)"/>
                    <ellipse cx="57" cy="114" rx="5.6" ry="4.2" transform="rotate(-20 57 114)"/>
                  </g>
                </svg>
              </figure>

              <!-- ITEMS MOUNT: sub-folders land here (empty until Drive is linked) -->
              <div class="shelf-mount" data-mount="1"></div>

              <!-- deco: monstera in a terracotta pot -->
              <figure class="deco deco-plant deco-monstera" aria-hidden="true">
                <svg viewBox="0 0 104 132" class="deco-svg">
                  <g class="leaf-sway">
                    <path d="M52 96 Q50 62 52 44" stroke="#5c7550" stroke-width="3.4" fill="none" stroke-linecap="round"/>
                    <path d="M52 74 Q36 66 26 50" stroke="#5c7550" stroke-width="3" fill="none" stroke-linecap="round"/>
                    <path d="M52 70 Q68 62 78 46" stroke="#5c7550" stroke-width="3" fill="none" stroke-linecap="round"/>
                    <path d="M52 44 Q34 40 32 24 Q44 12 56 18 Q70 26 66 42 Q60 48 52 44 Z" fill="#6f8c5b"/>
                    <path d="M40 30 h10 M44 38 h12 M50 22 h8" stroke="#5c7550" stroke-width="2" stroke-linecap="round"/>
                    <path d="M26 50 Q12 46 10 32 Q20 22 30 28 Q40 36 36 48 Q32 52 26 50 Z" fill="#7d9668"/>
                    <path d="M18 36 h8 M20 44 h9" stroke="#63805a" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M78 46 Q92 42 94 28 Q84 18 74 24 Q64 32 68 44 Q72 48 78 46 Z" fill="#7d9668"/>
                    <path d="M78 32 h8 M76 40 h9" stroke="#63805a" stroke-width="1.8" stroke-linecap="round"/>
                  </g>
                  <path d="M26 94 h52 l-8 34 a10 10 0 0 1 -36 0 Z" fill="#c07856"/>
                  <rect x="22" y="88" width="60" height="12" rx="5" fill="#d2896a"/>
                  <path d="M34 112 h36" stroke="#a75f3f" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
                  <ellipse cx="52" cy="130" rx="26" ry="3.4" fill="#5b3a27" opacity="0.16"/>
                </svg>
              </figure>

            </div>
            <div class="shelf-board" aria-hidden="true"></div>
          </section>

          <!-- ───────────── INNER SHELF 2 ───────────── -->
          <section class="shelf-unit" aria-label="رف">
            <div class="shelf-items" data-shelf="2">

              <!-- deco: small succulent -->
              <figure class="deco deco-plant deco-succulent" aria-hidden="true">
                <svg viewBox="0 0 84 96" class="deco-svg">
                  <g class="leaf-sway">
                    <ellipse cx="42" cy="40" rx="10" ry="16" fill="#7d9668"/>
                    <ellipse cx="26" cy="48" rx="9" ry="14" transform="rotate(-26 26 48)" fill="#6f8c5b"/>
                    <ellipse cx="58" cy="48" rx="9" ry="14" transform="rotate(26 58 48)" fill="#6f8c5b"/>
                    <ellipse cx="34" cy="34" rx="6" ry="10" transform="rotate(-14 34 34)" fill="#8fa878"/>
                    <ellipse cx="50" cy="34" rx="6" ry="10" transform="rotate(14 50 34)" fill="#8fa878"/>
                    <circle cx="42" cy="30" r="5" fill="#a8b39a"/>
                  </g>
                  <path d="M20 62 h44 l-6 26 a9 9 0 0 1 -32 0 Z" fill="#c9a15a"/>
                  <rect x="16" y="56" width="52" height="11" rx="5" fill="#d8b571"/>
                  <path d="M28 74 q6 -5 12 0 q6 5 12 0" stroke="#a8843f" stroke-width="2.4" fill="none" stroke-linecap="round"/>
                  <ellipse cx="42" cy="94" rx="22" ry="3" fill="#5b3a27" opacity="0.16"/>
                </svg>
              </figure>

              <div class="shelf-mount" data-mount="2"></div>

              <!-- deco: stack of closed books + a mug -->
              <figure class="deco deco-stack" aria-hidden="true">
                <svg viewBox="0 0 112 78" class="deco-svg">
                  <rect x="6" y="58" width="70" height="14" rx="4" fill="#7e3b47"/>
                  <rect x="10" y="46" width="64" height="13" rx="4" fill="#a8b39a"/>
                  <rect x="8" y="34" width="68" height="13" rx="4" fill="#c99a72"/>
                  <rect x="14" y="22" width="56" height="13" rx="4" fill="#8d9bb0"/>
                  <path d="M14 65 h54 M18 52 h48 M16 41 h52 M22 29 h40"
                        stroke="rgba(255,248,235,0.5)" stroke-width="2" stroke-linecap="round"/>
                  <path d="M80 48 h22 v16 a8 8 0 0 1 -8 8 h-6 a8 8 0 0 1 -8 -8 Z" fill="#efe4cd"/>
                  <path d="M102 52 q10 4 0 12" fill="none" stroke="#efe4cd" stroke-width="4" stroke-linecap="round"/>
                  <path d="M80 48 h22 v5 h-22 Z" fill="#c07856"/>
                  <path class="mug-steam" d="M88 44 q4 -6 0 -12 M96 44 q4 -6 0 -12"
                        fill="none" stroke="#c9b28e" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
                  <ellipse cx="56" cy="74" rx="48" ry="3.4" fill="#5b3a27" opacity="0.15"/>
                </svg>
              </figure>

            </div>
            <div class="shelf-board" aria-hidden="true"></div>
          </section>

          <!-- ───────────── INNER DESK (bottom shelf with legs) ───────────── -->
          <section class="shelf-unit shelf-unit-desk" aria-label="طاولة">
            <div class="shelf-items" data-shelf="3">

              <!-- deco: watering can -->
              <figure class="deco deco-can" aria-hidden="true">
                <svg viewBox="0 0 108 74" class="deco-svg">
                  <path d="M22 26 h50 l-5 42 a8 8 0 0 1 -8 7 H35 a8 8 0 0 1 -8 -7 Z" fill="#8d9bb0"/>
                  <rect x="18" y="20" width="58" height="10" rx="5" fill="#9fadc0"/>
                  <path d="M72 34 L100 16 l6 8 -30 20 Z" fill="#9fadc0"/>
                  <ellipse cx="102" cy="19" rx="7" ry="5" transform="rotate(-32 102 19)" fill="#7d8fae"/>
                  <path d="M30 20 Q34 2 52 6" fill="none" stroke="#7d8fae" stroke-width="6" stroke-linecap="round"/>
                  <path d="M32 46 h30" stroke="rgba(255,248,235,0.45)" stroke-width="3" stroke-linecap="round"/>
                  <ellipse cx="50" cy="73" rx="34" ry="3" fill="#5b3a27" opacity="0.15"/>
                </svg>
              </figure>

              <div class="shelf-mount" data-mount="3"></div>

              <!-- deco: tall snake plant -->
              <figure class="deco deco-plant deco-snake" aria-hidden="true">
                <svg viewBox="0 0 88 140" class="deco-svg">
                  <g class="leaf-sway">
                    <path d="M44 104 Q38 60 42 22 Q48 50 48 104 Z" fill="#6f8c5b"/>
                    <path d="M44 104 Q28 68 20 36 Q34 62 40 104 Z" fill="#7d9668"/>
                    <path d="M44 104 Q60 70 70 40 Q56 66 50 104 Z" fill="#7d9668"/>
                    <path d="M44 104 Q34 78 30 56 Q40 78 42 104 Z" fill="#8fa878"/>
                    <path d="M44 104 Q54 80 60 60 Q50 82 48 104 Z" fill="#8fa878"/>
                    <path d="M42 26 q2 30 2 74 M22 42 q8 30 16 60 M68 46 q-8 28 -16 56"
                          stroke="#c9a15a" stroke-width="1.6" fill="none" opacity="0.55"/>
                  </g>
                  <path d="M20 100 h48 l-5 32 a9 9 0 0 1 -9 6 H34 a9 9 0 0 1 -9 -6 Z" fill="#efe4cd"/>
                  <rect x="16" y="94" width="56" height="11" rx="5" fill="#f6efe2"/>
                  <path d="M28 116 h32" stroke="#d6c8b0" stroke-width="3" stroke-linecap="round"/>
                  <ellipse cx="44" cy="138" rx="26" ry="3.2" fill="#5b3a27" opacity="0.16"/>
                </svg>
              </figure>

            </div>
            <div class="shelf-board shelf-board-desk" aria-hidden="true">
              <i class="desk-leg desk-leg-start"></i>
              <i class="desk-leg desk-leg-end"></i>
            </div>
            <div class="rug" aria-hidden="true"></div>
          </section>

        </div>

        <!-- shown while the shelves carry no sub-folder yet (Arabic only) -->
        <p class="shelf-empty-note" id="shelf-empty-note"></p>

      </main>

      <footer class="room-footer">
        <p class="footer-line" data-placeholder="footer"></p>
      </footer>

    </div>

    <!-- ============================================================
         NOT-SUBSCRIBED GLASS BANNER (glassmorphism)
         Rendered by js/app.js into this mount when a non-subscribed
         visitor tries to open the library content.
         ============================================================ -->
    <div id="taysir-gate-mount"></div>

    <div class="night-veil" id="night-veil" aria-hidden="true"></div>

    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <symbol id="fb-book" viewBox="0 0 60 80">
        <rect x="12" y="16" width="36" height="46" rx="4" fill="#e3d3b6"/>
        <path d="M30 20 Q22 16 14 19 V58 Q22 55 30 59 Z" fill="#f6efe2"/>
        <path d="M30 20 Q38 16 46 19 V58 Q38 55 30 59 Z" fill="#efe4cd"/>
        <path d="M30 20 V59" stroke="#c9b28e" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 28 h8 M18 34 h8 M18 40 h6 M34 28 h8 M34 34 h8 M34 40 h6"
              stroke="#c9b28e" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M20 66 h20" stroke="#c9b28e" stroke-width="2.4" stroke-linecap="round" opacity="0.6"/>
      </symbol>

      <!-- cartoon folder used for sub-folders standing on the inner shelves -->
      <symbol id="fb-folder" viewBox="0 0 72 58">
        <path d="M4 12 a5 5 0 0 1 5 -5 h17 l6 7 h31 a5 5 0 0 1 5 5 v31 a5 5 0 0 1 -5 5 H9 a5 5 0 0 1 -5 -5 Z" fill="#c9a15a"/>
        <path d="M4 20 h64 v30 a5 5 0 0 1 -5 5 H9 a5 5 0 0 1 -5 -5 Z" fill="#d8b571"/>
        <path d="M14 30 h30 M14 38 h22" stroke="rgba(255,248,235,0.6)" stroke-width="3" stroke-linecap="round"/>
      </symbol>
    </svg>
</div>
<!-- /.shelf-root -->

  <!-- ============================================================
       REAL SESSION → window.TAYSIR_SESSION    (merge step 7/10)
       ------------------------------------------------------------
       The shelf's glass banner is DECORATION. This block only makes it
       DISPLAY THE TRUTH; it grants nothing and protects nothing.

       THE REAL PROTECTION IS SERVER-SIDE AND IS NOT TOUCHED HERE:
       src/lib/guards.ts → requireActiveSubscriber, re-shaped by
       src/routes/library.ts → gateContent into 402 SUBSCRIPTION_REQUIRED
       on GET /api/library/file/:id/meta|content. Those routes re-decide
       access from the validated httpOnly session on every request, so
       nothing a visitor writes into window.TAYSIR_SESSION from the
       console can ever produce a single byte of file content.

       SOURCE OF TRUTH FOR THE DISPLAY: taysir's existing endpoint
       GET /api/auth/me (src/routes/auth.ts) — no new endpoint is
       introduced. It answers:
         { ok:true, authenticated:false }                                  guest
         { ok:true, authenticated:true, user:{ id, email, role, approved } } signed in
       (/me already refuses to describe a suspended or revoked account:
       getSessionUser → validateSession returns null for those, so an
       "authenticated:true" answer implies an active account.)

       ENTITLEMENT MIRRORS requireActiveSubscriber EXACTLY:
         admin                                → entitled
         subscriber AND approved === true     → entitled
         anything else (incl. guests, and a
         signed-in but not-yet-approved user) → NOT entitled → banner
       Same rule as the server, computed only so the banner matches what
       the server would actually do.

       WHY CLIENT-SIDE FETCH RATHER THAN SERVER INJECTION: /shelf is
       served as a static HTML string (app.get('/shelf', c => c.html(...))
       in src/index.tsx) with NO session read, deliberately — this step
       must not add a server-side gate or touch auth. Fetching /me from
       the page reuses exactly what the React SPA already does
       (frontend/src/lib/useSession.ts), cookie included via
       credentials:"same-origin".

       DEFAULT IS PESSIMISTIC: not subscribed until the server says
       otherwise, so a failed/slow request can only ever SHOW the banner,
       never hide it.

       MUST RUN BEFORE config.js: config.js reads window.TAYSIR_SESSION.
       ============================================================ -->
  <script>
    (function () {
      /* taysir's existing session endpoint — do not invent a new one */
      var SESSION_ENDPOINT = "/api/auth/me";

      /* Pessimistic default: banner shown until the server says otherwise. */
      window.TAYSIR_SESSION = {
        authenticated: false,
        user: null,
        isSubscribed: false,
        resolved: false
      };

      /* Same rule as src/lib/guards.ts → requireActiveSubscriber. */
      function entitled(user) {
        if (!user || typeof user !== "object") return false;
        if (user.role === "admin") return true;
        return user.role === "subscriber" && user.approved === true;
      }

      function publish(next) {
        window.TAYSIR_SESSION = next;
        /* app.js listens for this to drop the banner once the truth lands */
        try {
          document.dispatchEvent(new CustomEvent("taysir:session", { detail: next }));
        } catch (e) { /* no CustomEvent: app.js still reads the object directly */ }
      }

      /* Exposed so app.js can await the first answer instead of polling. */
      window.TAYSIR_SESSION_READY = (function () {
        if (typeof window.fetch !== "function") return null;

        return window.fetch(SESSION_ENDPOINT, {
          method: "GET",
          credentials: "same-origin",          /* httpOnly bac_session cookie */
          headers: { "Accept": "application/json" }
        })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (data) {
            var live = !!(data && data.ok === true && data.authenticated === true && data.user);
            var user = live ? data.user : null;
            publish({
              authenticated: live,
              user: user,
              isSubscribed: live && entitled(user),
              resolved: true
            });
            return window.TAYSIR_SESSION;
          })
          .catch(function () {
            /* Network blip → stay pessimistic (banner shown). Never unlocks. */
            publish({ authenticated: false, user: null, isSubscribed: false, resolved: true });
            return window.TAYSIR_SESSION;
          });
      })();
    })();
  </script>

  <!-- config.js FIRST (defines window.TAYSIR_*), then the behaviour script -->
  <script src="/static/shelf/js/config.js"></script>
  <script src="/static/shelf/js/app.js"></script>
</body>
</html>`

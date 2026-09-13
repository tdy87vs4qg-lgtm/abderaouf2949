// ============================================================================
// _decor.ts  —  SHARED DECORATIVE BACKGROUND MARKUP  (PRESENTATION ONLY)
//
// The finished visual prototype's signature backdrop: eight very faint hand-
// drawn doodles (a loose swirl, two squiggles, a dot grid, a star sparkle,
// concentric circles, an arrow curve and a plus mark) pinned behind the whole
// page at ~6% opacity.
//
// PROVENANCE: the SVG paths below are copied VERBATIM from the prototype's
// index.html `.bg-decor` block. Nothing was redrawn or re-tuned. Their
// placement, size and opacity come from the prototype's styles.css §4, which
// ships unchanged in public/static/taysir-theme.css.
//
// WHY A SHARED CONSTANT: the internal pages (library, shelf, folder, admin,
// file viewer) are separate server-rendered HTML strings. Exporting the markup
// once keeps the backdrop byte-identical across all of them.
//
// THIS FILE IS INERT DECORATION:
//   • `aria-hidden="true"` so it is invisible to assistive technology.
//   • `pointer-events: none` (set in the stylesheet) so it can never intercept
//     a click, tap, drag or focus.
//   • It contains no script, no interactivity and no data.
//   • It is a plain string constant — it registers no route, imports nothing
//     and executes no logic.
// ============================================================================

/**
 * The prototype's faint background doodle layer.
 *
 * Insert as the FIRST child of <body> on a page that also loads
 * /static/taysir-theme.css. The stylesheet positions it at `inset: 0`,
 * `z-index: 0`, and tints it with `--doodle-color` / `--doodle-opacity`, which
 * flip with the light/dark theme.
 */
export const bgDecor = `
  <div class="bg-decor" aria-hidden="true">
    <!-- big loose swirl top-left -->
    <svg class="doodle d1" viewBox="0 0 400 400" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M20 200 C 20 90, 120 20, 220 40 S 380 140, 340 240 S 180 380, 100 320 S 20 220, 60 160" />
      <path d="M80 220 C 100 160, 180 130, 240 160 S 320 240, 280 290" />
    </svg>
    <!-- squiggle line -->
    <svg class="doodle d2" viewBox="0 0 500 100" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M5 50 Q 40 5, 80 50 T 160 50 T 240 50 T 320 50 T 400 50 T 480 50" />
    </svg>
    <!-- dot grid -->
    <svg class="doodle d3" viewBox="0 0 200 200" fill="currentColor">
      <g>
        <circle cx="10" cy="10" r="2"/><circle cx="40" cy="10" r="2"/><circle cx="70" cy="10" r="2"/><circle cx="100" cy="10" r="2"/><circle cx="130" cy="10" r="2"/><circle cx="160" cy="10" r="2"/><circle cx="190" cy="10" r="2"/>
        <circle cx="10" cy="40" r="2"/><circle cx="40" cy="40" r="2"/><circle cx="70" cy="40" r="2"/><circle cx="100" cy="40" r="2"/><circle cx="130" cy="40" r="2"/><circle cx="160" cy="40" r="2"/><circle cx="190" cy="40" r="2"/>
        <circle cx="10" cy="70" r="2"/><circle cx="40" cy="70" r="2"/><circle cx="70" cy="70" r="2"/><circle cx="100" cy="70" r="2"/><circle cx="130" cy="70" r="2"/><circle cx="160" cy="70" r="2"/><circle cx="190" cy="70" r="2"/>
        <circle cx="10" cy="100" r="2"/><circle cx="40" cy="100" r="2"/><circle cx="70" cy="100" r="2"/><circle cx="100" cy="100" r="2"/><circle cx="130" cy="100" r="2"/><circle cx="160" cy="100" r="2"/><circle cx="190" cy="100" r="2"/>
        <circle cx="10" cy="130" r="2"/><circle cx="40" cy="130" r="2"/><circle cx="70" cy="130" r="2"/><circle cx="100" cy="130" r="2"/><circle cx="130" cy="130" r="2"/><circle cx="160" cy="130" r="2"/><circle cx="190" cy="130" r="2"/>
        <circle cx="10" cy="160" r="2"/><circle cx="40" cy="160" r="2"/><circle cx="70" cy="160" r="2"/><circle cx="100" cy="160" r="2"/><circle cx="130" cy="160" r="2"/><circle cx="160" cy="160" r="2"/><circle cx="190" cy="160" r="2"/>
        <circle cx="10" cy="190" r="2"/><circle cx="40" cy="190" r="2"/><circle cx="70" cy="190" r="2"/><circle cx="100" cy="190" r="2"/><circle cx="130" cy="190" r="2"/><circle cx="160" cy="190" r="2"/><circle cx="190" cy="190" r="2"/>
      </g>
    </svg>
    <!-- star sparkle -->
    <svg class="doodle d4" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <path d="M50 10 L50 90 M10 50 L90 50 M22 22 L78 78 M78 22 L22 78" />
    </svg>
    <!-- circle outline -->
    <svg class="doodle d5" viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="1.4">
      <circle cx="100" cy="100" r="90" />
      <circle cx="100" cy="100" r="60" />
    </svg>
    <!-- arrow curve -->
    <svg class="doodle d6" viewBox="0 0 200 120" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 100 C 40 20, 130 20, 180 80" />
      <path d="M170 60 L180 80 L160 84" />
    </svg>
    <!-- squiggle line 2 -->
    <svg class="doodle d7" viewBox="0 0 500 100" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M5 50 Q 40 90, 80 50 T 160 50 T 240 50 T 320 50 T 400 50 T 480 50" />
    </svg>
    <!-- plus mark -->
    <svg class="doodle d8" viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M30 8 L30 52 M8 30 L52 30" />
    </svg>
  </div>`

/**
 * The prototype's animated sun/moon pill switch.
 *
 * PROVENANCE: markup copied verbatim from the prototype's index.html. Its
 * styling (the sliding thumb, the icon cross-fade + rotation, the day/night
 * gradient tracks and the three star pinpricks that fade in on dark) is the
 * prototype's styles.css §6, shipped unchanged.
 *
 * BEHAVIOUR: the button carries `data-theme-toggle`, which
 * /static/illustrations.js listens for via ONE delegated document click
 * handler. That handler flips `<html data-theme>` and persists the choice to
 * localStorage under the SAME key the site already used ('taysir-theme'), so
 * the internal pages, the shelf and the React exterior stay in agreement
 * exactly as they did before this redesign. No new storage key, cookie or
 * request is introduced, and no session state is read or written.
 */
export const themeToggle = `
  <button type="button" class="theme-toggle" data-theme-toggle aria-label="التبديل إلى الوضع الليلي" aria-pressed="false" title="الوضع الليلي / النهاري">
    <span class="theme-toggle-track" aria-hidden="true">
      <span class="theme-toggle-thumb">
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2"/>
          <path d="M12 2.5v2.4M12 19.1v2.4M4.3 4.3l1.7 1.7M18 18l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.3 19.7l1.7-1.7M18 6l1.7-1.7"/>
        </svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20.5 14.2A8.3 8.3 0 0 1 9.8 3.5a8.3 8.3 0 1 0 10.7 10.7Z"/>
        </svg>
      </span>
      <span class="theme-toggle-star s1" aria-hidden="true"></span>
      <span class="theme-toggle-star s2" aria-hidden="true"></span>
      <span class="theme-toggle-star s3" aria-hidden="true"></span>
    </span>
  </button>`

/**
 * Pre-paint theme resolver.
 *
 * Sets `<html data-theme>` from the already-existing 'taysir-theme'
 * localStorage key BEFORE first paint, so a returning visitor never sees a
 * flash of the wrong palette. This mirrors the inline script the React
 * exterior's index.html already shipped — same key, same values, same
 * fallback order — so the two halves of the product cannot disagree.
 *
 * Reads and writes ONLY the theme key. It touches no cookie, no session, and
 * makes no network request.
 */
export const themeBoot = `<script>
  (function () {
    try {
      var t = localStorage.getItem('taysir-theme');
      if (t !== 'light' && t !== 'dark') t = 'light';
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.style.colorScheme = t;
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', t === 'dark' ? '#0E1016' : '#FFFFFF');
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  })();
</script>`

/**
 * The stylesheet + font links every re-skinned page needs, in load order.
 * Google Fonts is kept as a progressive enhancement alongside the self-hosted
 * @font-face declarations in taysir-theme.css.
 */
export const themeHead = `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&display=swap" rel="stylesheet" />
  <link href="/static/taysir-theme.css" rel="stylesheet" />`

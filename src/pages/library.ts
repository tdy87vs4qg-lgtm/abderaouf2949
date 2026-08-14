// ============================================================================
// تيسير — Library browser page  ·  Google Drive–style redesign
//
// Server-rendered shell only. All folder/file listings are fetched client-side
// from the server-side API (/api/library/*) which proxies Google Drive — the
// Google API key never reaches the browser. The lock/subscription gate is
// decided server-side; this page just renders the Drive-like chrome:
//
//   ┌───────────────────────────────────────────────────────────────┐
//   │  top bar: logo · search · account                             │
//   ├───────────┬───────────────────────────────────────────────────┤
//   │  sidebar  │  breadcrumb + view toggle                          │
//   │  (folders)│  ─────────────────────────────────────────────    │
//   │           │  Folders (grid/list)                               │
//   │           │  Files   (grid/list)                               │
//   └───────────┴───────────────────────────────────────────────────┘
//
// Behaviour lives in library.js; styling in library.css (+ design tokens).
// ============================================================================

const TIKTOK_URL = 'https://www.tiktok.com/@abderahmane.lovenature'

/* ---------------------------------------------------------------- icons
   Google-Material-flavoured line/solid icons, kept in one place. */
const icons = {
  search: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>`,
  list: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M4 6h2v2H4zM4 11h2v2H4zM4 16h2v2H4zM9 6h11v2H9zM9 11h11v2H9zM9 16h11v2H9z"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8.6 5.6 14 11l-5.4 5.4L10 18l7-7-7-7z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/></svg>`,
  account: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  tiktok: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.3 0 .58.05.85.13V9.4a6.33 6.33 0 0 0-.85-.05A6.34 6.34 0 0 0 3.15 15.7a6.34 6.34 0 0 0 10.86 4.43 6.3 6.3 0 0 0 1.82-4.45V8.6a8.18 8.18 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.01-.03Z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
}

/* -------------------------------------------------------------- topbar
   Drive-style app bar: brand+wordmark, big search field, account glyph. */
const topbar = `
<header class="gd-topbar" id="gd-topbar">
  <div class="gd-topbar-left">
    <button type="button" class="gd-icon-btn gd-menu-toggle" id="gd-menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="gd-sidebar">${icons.menu}</button>
    <a href="/" class="gd-brand" aria-label="تيسير — الرئيسية">
      <span class="gd-brand-name">تيسير</span>
    </a>
  </div>

  <div class="gd-search" role="search">
    <button type="button" class="gd-search-icon" id="gd-search-icon" aria-label="Search">${icons.search}</button>
    <input type="search" class="gd-search-input" id="lib-search"
           placeholder="Search in Library" autocomplete="off" spellcheck="false"
           aria-label="Search files and folders across the library" />
    <button type="button" class="gd-search-clear" id="lib-search-clear" aria-label="Clear search" hidden>${icons.close}</button>
  </div>

  <div class="gd-topbar-right">
    <a href="/" class="gd-icon-btn gd-hide-mobile" data-tooltip="Home" aria-label="Home">${icons.home}</a>
    <button type="button" class="gd-account js-subscribe" id="subscribe-header" data-tooltip="Account" aria-label="Account">${icons.account}</button>
    <button type="button" class="gd-icon-btn gd-logout" id="lib-logout" data-tooltip="Log out" aria-label="Log out">${icons.logout}</button>
  </div>
</header>`

/* -------------------------------------------------------------- sidebar
   Drive-style navigation rail. "My Library" (root) + top-level subjects. */
const sidebar = `
<aside class="gd-sidebar" id="gd-sidebar" aria-label="Folders">
  <nav class="gd-nav" id="lib-subjects">
    <!-- populated by library.js; skeletons first -->
    <div class="gd-nav-skeleton" aria-hidden="true">
      <span class="gd-skel gd-skel-nav"></span>
      <span class="gd-skel gd-skel-nav"></span>
      <span class="gd-skel gd-skel-nav"></span>
      <span class="gd-skel gd-skel-nav"></span>
      <span class="gd-skel gd-skel-nav"></span>
    </div>
  </nav>

  <div class="gd-storage" id="gd-storage" aria-hidden="true">
    <p class="gd-storage-title">تيسير</p>
    <p class="gd-storage-text" id="gd-storage-text">The complete Baccalaureate study library.</p>
    <a href="${TIKTOK_URL}" target="_blank" rel="noopener noreferrer" class="gd-storage-cta js-subscribe-cta">
      ${icons.tiktok}<span>Get access</span>
    </a>
  </div>
</aside>
<div class="gd-scrim" id="gd-scrim" hidden></div>`

/* --------------------------------------------------- subscribe modal
   Google-Drive-flavoured "locked" dialog → subscription via TikTok. */
const subscribeModal = `
<div class="gd-modal-overlay" id="subscribe-modal" role="dialog" aria-modal="true" aria-labelledby="subscribe-modal-title" dir="rtl" hidden>
  <div class="gd-modal">
    <div class="gd-modal-head">
      <div class="gd-modal-lock" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h3 class="gd-modal-title" id="subscribe-modal-title">هذا الملف متاح للمشتركين فقط</h3>
      <button type="button" class="gd-icon-btn gd-modal-close js-modal-close" aria-label="إغلاق">${icons.close}</button>
    </div>
    <div class="gd-modal-body">
      <p class="gd-modal-lede" id="subscribe-modal-lede">هذا الملف متاح للمشتركين فقط. للاشتراك تواصل مع المالك عبر تيك توك لفتح جميع الملفات داخل الموقع.</p>

      <!-- PRICE BLOCK (display only).
           This is PURE PRESENTATION: the real entitlement check stays entirely
           server-side (requireActiveSubscriber / gateContent in
           src/routes/library.ts). Nothing here unlocks, prices or grants
           anything — it only tells the visitor what the subscription costs.

           Rendered as a separate sibling of #subscribe-modal-lede on purpose:
           library.js rewrites ONLY the lede's innerHTML when a specific file
           name is known, so keeping the price outside it means the price and
           the copy below survive that rewrite untouched. -->
      <div class="gd-price" aria-label="سعر الاشتراك">
        <span class="gd-price-old"><s>3000DA</s></span>
        <span class="gd-price-new">2000DA</span>
      </div>

      <p class="gd-price-note">بعد الدفع تحصل على جميع الملفات والتمارين المصححة والمصادر اللازمة التي توفّر وقتك وتساعدك على رفع معدّلك.</p>
    </div>
    <div class="gd-modal-foot">
      <button type="button" class="gd-btn gd-btn-text js-modal-close">لاحقًا</button>
      <a href="${TIKTOK_URL}" target="_blank" rel="noopener noreferrer" class="gd-btn gd-btn-primary">
        ${icons.tiktok}<span>الاشتراك عبر تيك توك</span>
      </a>
    </div>
  </div>
</div>`

/* ------------------------------------------------------------- full page */
export const libraryPage = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark light" />
  <title>Library — تيسير</title>
  <meta name="description" content="Browse the complete تيسير library: lessons, summaries, corrected exams, exercise series, mock papers and premium books — organised like Google Drive." />
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link href="/static/tokens.css" rel="stylesheet" />
  <link href="/static/library.css" rel="stylesheet" />
</head>
<body class="gd-body">
  ${topbar}

  <div class="gd-shell">
    ${sidebar}

    <main class="gd-main" id="gd-main">

      <!-- Toolbar: breadcrumb + view toggle -->
      <div class="gd-toolbar">
        <nav class="gd-breadcrumb" id="lib-breadcrumb" aria-label="Folder path">
          <span class="gd-skel gd-skel-crumb" aria-hidden="true"></span>
        </nav>
        <div class="gd-toolbar-actions">
          <div class="gd-view-toggle" role="group" aria-label="View mode">
            <button type="button" class="gd-view-btn is-active" id="view-list" aria-pressed="true" data-tooltip="List view" aria-label="List view">${icons.list}</button>
            <button type="button" class="gd-view-btn" id="view-grid" aria-pressed="false" data-tooltip="Grid view" aria-label="Grid view">${icons.grid}</button>
          </div>
        </div>
      </div>

      <!-- (Removed) sample-data notice — the Drive is connected and live, so no
           placeholder banner is ever shown to the user. -->

      <!-- Scroll region: content is injected here by library.js -->
      <div class="gd-scroller" id="gd-scroller">
        <div class="gd-content" id="lib-content" aria-live="polite">
          <!-- Skeleton grid while loading -->
          <div class="gd-skeleton-wrap" id="lib-skeletons" aria-hidden="true">
            <div class="gd-section-label">Loading…</div>
            <div class="gd-grid">
              ${Array.from({ length: 10 })
                .map(
                  () => `
              <div class="gd-card is-skeleton">
                <div class="gd-card-head"><span class="gd-skel gd-skel-dot"></span><span class="gd-skel gd-skel-line" style="width:62%"></span></div>
                <div class="gd-card-thumb gd-skel"></div>
              </div>`
                )
                .join('')}
            </div>
          </div>

          <!-- Global search results (hidden until a query is active) -->
          <div class="gd-search-results" id="lib-search-results" aria-live="polite" hidden>
            <div class="gd-search-head">
              <p class="gd-search-summary" id="lib-search-summary"></p>
              <button type="button" class="gd-btn gd-btn-text" id="lib-search-back">Clear search</button>
            </div>
            <div id="lib-search-body"></div>
            <div class="gd-empty" id="lib-search-empty" hidden>
              <div class="gd-empty-art" aria-hidden="true">${icons.search}</div>
              <p class="gd-empty-title">No matches</p>
              <p class="gd-empty-text">No files or folders match your search. Try a different word.</p>
            </div>
          </div>

          <!-- Empty / error states — kept as clean, silent placeholders.
               Per product decision these no longer surface obsolete
               "empty folder" / "couldn't load" copy to the user. The empty
               node renders nothing; the error node keeps a hidden retry hook
               that library.js can use to recover silently in the background. -->
          <div class="gd-empty gd-empty--silent" id="lib-empty" hidden aria-hidden="true"></div>
          <div class="gd-empty gd-empty--silent" id="lib-error" hidden aria-hidden="true">
            <button type="button" class="gd-btn gd-btn-primary" id="lib-retry" hidden aria-hidden="true"></button>
          </div>
        </div>
      </div>
    </main>
  </div>

  ${subscribeModal}

  <!-- In-app file viewer overlay (SPA). Opening / switching / closing files
       happens here without a full page reload, so navigation stays instant —
       especially on mobile. Access is STILL enforced server-side by the gated
       /api/library/file/:id/* endpoints; this overlay only renders what the
       server agrees to serve. A direct deep link to /library/view/:id remains
       available as a no-JS fallback. -->
  <div class="gd-viewer-overlay" id="gd-viewer" role="dialog" aria-modal="true" aria-labelledby="gd-viewer-title" hidden>
    <header class="gd-viewer-bar">
      <button type="button" class="gd-icon-btn gd-viewer-close" id="gd-viewer-close" aria-label="إغلاق العارض">${icons.close}</button>
      <span class="gd-viewer-title" id="gd-viewer-title"></span>
      <span class="gd-viewer-meta"><span class="gd-viewer-badge" id="gd-viewer-badge"></span></span>

      <!-- Zoom controls (shown only for zoomable content: PDF / image). Kept
           lightweight; the viewer stays full-screen and studying-friendly. -->
      <div class="gd-viewer-zoom" id="gd-viewer-zoom" role="group" aria-label="التحكم في التكبير" hidden>
        <button type="button" class="gd-icon-btn gd-zoom-out" id="gd-zoom-out" aria-label="تصغير" data-tooltip="تصغير">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>
        </button>
        <span class="gd-zoom-level" id="gd-zoom-level" aria-live="polite">ملائم للعرض</span>
        <button type="button" class="gd-icon-btn gd-zoom-in" id="gd-zoom-in" aria-label="تكبير" data-tooltip="تكبير">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button type="button" class="gd-icon-btn gd-zoom-fit" id="gd-zoom-fit" aria-label="ملاءمة العرض للعرض" data-tooltip="ملاءمة العرض">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/></svg>
        </button>
      </div>
    </header>
    <div class="gd-viewer-stage" id="gd-viewer-stage" aria-live="polite">
      <div class="gd-viewer-spinner" id="gd-viewer-spinner" aria-hidden="true"><span class="gd-spin"></span></div>
    </div>
  </div>

  <!-- TEMPORARY DEBUG: on-screen log panel (remove after verification).
       Loaded FIRST (not deferred) so it can mirror the very first [cache]
       logs from file-cache.js; wrapped entirely in try/catch internally. -->
  <script src="/static/debug-panel.js"></script>
  <script src="/static/file-cache.js" defer></script>
  <script src="/static/library.js" defer></script>
</body>
</html>`

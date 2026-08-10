// تيسير — Design System Style Guide page
// A one-page living reference showing every token & component together.

const lockSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`

const searchSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`

const fileSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`

const closeSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`

function swatch(name: string, hex: string, note = ''): string {
  return `<div class="sg-swatch">
    <div class="sg-swatch-chip" style="background-color:${hex}"></div>
    <div class="sg-swatch-info">
      <span class="sg-swatch-name">${name}</span>
      <span class="sg-swatch-hex">${hex}</span>
      ${note ? `<span class="text-caption" style="display:block">${note}</span>` : ''}
    </div>
  </div>`
}

const colorsSection = `
<section class="sg-section" id="colors">
  <div class="container">
    <div class="sg-section-head">
      <p class="overline">01 — Color</p>
      <h2>Palette</h2>
      <p>Restrained and academic. Deep ink blue carries the brand; warm ochre is the single
      accent, used sparingly for key CTAs and highlights. Neutrals are warm-tinted —
      never pure black or pure white. All text/background pairs meet WCAG AA.</p>
    </div>

    <p class="sg-label">Brand</p>
    <div class="sg-swatch-grid">
      ${swatch('Primary — Ink Blue', '#16324F', 'headings, primary buttons, links')}
      ${swatch('Primary Hover', '#0F2438')}
      ${swatch('Primary Soft', '#E9EFF5', 'tints, selected states')}
      ${swatch('Primary Border', '#B9C9D8')}
      ${swatch('Accent — Warm Ochre', '#B97E2C', 'key CTAs only — use sparingly')}
      ${swatch('Accent Hover', '#9A6822')}
      ${swatch('Accent Soft', '#F7EEDD')}
    </div>

    <p class="sg-label">Neutrals</p>
    <div class="sg-swatch-grid">
      ${swatch('Background', '#FAF7F2', 'warm off-white page bg')}
      ${swatch('Surface', '#FFFEFB', 'cards, panels, modals')}
      ${swatch('Surface Sunken', '#F2EEE7', 'wells, stripes')}
      ${swatch('Border', '#E3DED4', 'hairlines')}
      ${swatch('Border Strong', '#C9C2B4', 'inputs, dividers')}
      ${swatch('Ink', '#1F2933', 'primary text')}
      ${swatch('Ink Secondary', '#52606D')}
      ${swatch('Ink Muted', '#8A94A0', 'captions, placeholders')}
    </div>

    <p class="sg-label">States</p>
    <div class="sg-swatch-grid">
      ${swatch('Success', '#2F7D52', 'active subscription')}
      ${swatch('Lock', '#6E6455', 'locked files — quiet, not alarming')}
      ${swatch('Warning', '#A9631A')}
      ${swatch('Danger', '#A63D2F')}
    </div>
  </div>
</section>`

const typographySection = `
<section class="sg-section" id="typography">
  <div class="container">
    <div class="sg-section-head">
      <p class="overline">02 — Typography</p>
      <h2>Type system</h2>
      <p><strong>Fraunces</strong> (editorial serif) for h1–h3 gives the library its credible,
      scholarly voice. <strong>Public Sans</strong> carries everything else — UI, body text,
      labels. h6 doubles as an uppercase overline/eyebrow label.</p>
    </div>

    <div class="sg-type-row">
      <span class="sg-type-meta">h1 · Fraunces 600<br>36–52px / 1.15</span>
      <h1>Every resource. One library.</h1>
    </div>
    <div class="sg-type-row">
      <span class="sg-type-meta">h2 · Fraunces 600<br>28–38px / 1.15</span>
      <h2>Built by students who scored 17+</h2>
    </div>
    <div class="sg-type-row">
      <span class="sg-type-meta">h3 · Fraunces 500<br>22–28px / 1.3</span>
      <h3>Mathematics — Exercise Series</h3>
    </div>
    <div class="sg-type-row">
      <span class="sg-type-meta">h4 · Public Sans 600<br>20px / 1.3</span>
      <h4>End-of-term assignments with full corrections</h4>
    </div>
    <div class="sg-type-row">
      <span class="sg-type-meta">h5 · Public Sans 600<br>17px / 1.3</span>
      <h5>Physics — Unit 3: Electrodynamics</h5>
    </div>
    <div class="sg-type-row">
      <span class="sg-type-meta">h6 / overline · 600<br>15px / caps +0.08em</span>
      <h6>Official school papers</h6>
    </div>
    <div class="sg-type-row">
      <span class="sg-type-meta">body-lg (lede) · 400<br>18px / 1.75</span>
      <p class="text-lede" style="max-width:38rem">Stop hunting scattered, incomplete resources. Everything you need for the Baccalaureate — hand-picked, organized, and corrected — lives in one place.</p>
    </div>
    <div class="sg-type-row">
      <span class="sg-type-meta">body · 400<br>16px / 1.6</span>
      <p style="max-width:38rem">Each section ends with a summary designed to lock in mastery before you move on. Exercise series in Math and Physics come with complete, well-organized solutions.</p>
    </div>
    <div class="sg-type-row">
      <span class="sg-type-meta">body-sm · 400<br>14px / 1.6</span>
      <p style="font-size:var(--text-body-sm);max-width:38rem" class="text-secondary">Used for metadata, table cells and dense UI: “Added June 2026 · PDF · 24 pages”.</p>
    </div>
    <div class="sg-type-row">
      <span class="sg-type-meta">caption · 400<br>13px / 1.3</span>
      <p class="text-caption">Foreign papers adapted by expert teachers — updated weekly.</p>
    </div>
  </div>
</section>`

const spacingSection = `
<section class="sg-section" id="spacing">
  <div class="container">
    <div class="sg-section-head">
      <p class="overline">03 — Space, Radius &amp; Elevation</p>
      <h2>Structure</h2>
      <p>A 4px spacing base keeps rhythm consistent. Radii stay modest — cards at 10px
      maximum; full-round is reserved for avatars and dot indicators only. Shadows are
      soft, warm and low-contrast.</p>
    </div>

    <p class="sg-label">Spacing scale (4px base)</p>
    <div>
      <div class="sg-space-row"><span class="sg-space-meta">--space-1 · 4px</span><div class="sg-space-bar" style="width:4px"></div></div>
      <div class="sg-space-row"><span class="sg-space-meta">--space-2 · 8px</span><div class="sg-space-bar" style="width:8px"></div></div>
      <div class="sg-space-row"><span class="sg-space-meta">--space-3 · 12px</span><div class="sg-space-bar" style="width:12px"></div></div>
      <div class="sg-space-row"><span class="sg-space-meta">--space-4 · 16px</span><div class="sg-space-bar" style="width:16px"></div></div>
      <div class="sg-space-row"><span class="sg-space-meta">--space-5 · 24px</span><div class="sg-space-bar" style="width:24px"></div></div>
      <div class="sg-space-row"><span class="sg-space-meta">--space-6 · 32px</span><div class="sg-space-bar" style="width:32px"></div></div>
      <div class="sg-space-row"><span class="sg-space-meta">--space-7 · 48px</span><div class="sg-space-bar" style="width:48px"></div></div>
      <div class="sg-space-row"><span class="sg-space-meta">--space-8 · 64px</span><div class="sg-space-bar" style="width:64px"></div></div>
      <div class="sg-space-row"><span class="sg-space-meta">--space-9 · 96px</span><div class="sg-space-bar" style="width:96px"></div></div>
    </div>

    <p class="sg-label">Border radius</p>
    <div class="sg-tile-row">
      <div class="sg-tile" style="border-radius:var(--radius-sm)">sm · 4px</div>
      <div class="sg-tile" style="border-radius:var(--radius-md)">md · 6px</div>
      <div class="sg-tile" style="border-radius:var(--radius-lg)">lg · 10px</div>
      <div class="sg-tile" style="border-radius:var(--radius-full);width:88px">full</div>
    </div>

    <p class="sg-label">Elevation</p>
    <div class="sg-tile-row">
      <div class="sg-tile" style="border:none;box-shadow:var(--shadow-xs);border-radius:var(--radius-lg)">shadow-xs</div>
      <div class="sg-tile" style="border:none;box-shadow:var(--shadow-sm);border-radius:var(--radius-lg)">shadow-sm</div>
      <div class="sg-tile" style="border:none;box-shadow:var(--shadow-md);border-radius:var(--radius-lg)">shadow-md</div>
      <div class="sg-tile" style="border:none;box-shadow:var(--shadow-lg);border-radius:var(--radius-lg)">shadow-lg</div>
      <div class="sg-tile" style="border:none;box-shadow:var(--shadow-focus);border-radius:var(--radius-lg)">focus ring</div>
    </div>
  </div>
</section>`

export const styleGuideSections1 = colorsSection + typographySection + spacingSection

const componentsSection = `
<section class="sg-section" id="components">
  <div class="container">
    <div class="sg-section-head">
      <p class="overline">04 — Components</p>
      <h2>Component library</h2>
      <p>The building blocks used across the library, the reader and the admin dashboard.
      One accent button per page maximum; everything else stays in ink blue and neutrals.</p>
    </div>

    <p class="sg-label">Buttons</p>
    <div class="sg-demo-row">
      <button class="btn btn-primary">Browse the library</button>
      <button class="btn btn-accent">Subscribe via TikTok</button>
      <button class="btn btn-secondary">View corrections</button>
      <button class="btn btn-ghost">Cancel</button>
      <button class="btn btn-primary" disabled>Disabled</button>
    </div>
    <div class="sg-demo-row" style="margin-top:var(--space-3)">
      <button class="btn btn-primary btn-lg">Large — hero CTA</button>
      <button class="btn btn-secondary btn-sm">Small — table action</button>
    </div>

    <p class="sg-label">Inputs</p>
    <div class="sg-form-demo">
      <div class="field">
        <label class="field-label" for="demo-search">Search the library</label>
        <div class="search">
          <span class="search-icon">${searchSvg}</span>
          <input class="input" id="demo-search" type="search" placeholder="e.g. Physics — mock exam 2025" />
        </div>
        <p class="field-hint">Search across all 400+ files by title, subject or year.</p>
      </div>
      <div class="field">
        <label class="field-label" for="demo-email">Email</label>
        <input class="input" id="demo-email" type="email" placeholder="you@example.com" />
      </div>
      <div class="field">
        <label class="field-label" for="demo-invalid">Password</label>
        <input class="input is-invalid" id="demo-invalid" type="password" value="123" />
        <p class="field-error">Password must be at least 8 characters.</p>
      </div>
      <div class="field">
        <label class="field-label" for="demo-select">Stream</label>
        <select class="select" id="demo-select">
          <option>Mathematics</option>
          <option>Experimental Sciences</option>
          <option>Technical Mathematics</option>
        </select>
      </div>
    </div>

    <p class="sg-label">Tags &amp; badges</p>
    <div class="sg-demo-row">
      <span class="badge">PDF · 24 pages</span>
      <span class="badge badge-primary">Mathematics</span>
      <span class="badge badge-accent">Premium series</span>
      <span class="badge badge-success">Subscription active</span>
      <span class="badge badge-warning">Expires in 5 days</span>
      <span class="badge badge-danger">Payment failed</span>
      <span class="badge badge-lock">${lockSvg} Subscribers only</span>
    </div>

    <p class="sg-label">Cards &amp; locked state</p>
    <div class="sg-demo-grid">
      <article class="card card-interactive file-card">
        <div class="file-thumb">${fileSvg}</div>
        <div class="card-body">
          <h3 class="card-title">Functions — Complete Lesson</h3>
          <div class="card-meta"><span class="badge badge-primary">Math</span><span>PDF · 32 pages</span></div>
        </div>
      </article>
      <article class="card card-interactive file-card is-locked" data-tooltip="Subscribe to unlock">
        <span class="lock-indicator">${lockSvg}</span>
        <div class="file-thumb">${fileSvg}</div>
        <div class="card-body">
          <h3 class="card-title">Mock Exam 2025 — Full Correction</h3>
          <div class="card-meta"><span class="badge badge-lock">${lockSvg} Locked</span><span>PDF · 18 pages</span></div>
        </div>
      </article>
      <article class="card">
        <div class="card-body">
          <p class="overline" style="margin-bottom:var(--space-2)">Founder</p>
          <h3 class="card-title">Abdellah Ishak</h3>
          <p class="text-secondary" style="font-size:var(--text-body-sm);margin-bottom:var(--space-3)">Experimental Sciences — Baccalaureate 2025</p>
          <span class="badge badge-accent">Average 18.92</span>
        </div>
      </article>
    </div>

    <p class="sg-label">Locked row (list view)</p>
    <div style="display:grid;gap:var(--space-2);max-width:34rem">
      <div class="lock-row">
        <span class="lock-glyph">${lockSvg}</span>
        <span class="row-title">Elite-prep Baccalaureate Paper № 4 — with correction</span>
        <span class="badge badge-lock">Locked</span>
      </div>
      <div class="lock-row">
        <span class="lock-glyph" style="color:var(--color-success)">${fileSvg.replace('width="28" height="28"','width="16" height="16"')}</span>
        <span class="row-title">Section Summary — Sequences &amp; Limits</span>
        <span class="badge badge-success">Free preview</span>
      </div>
    </div>

    <p class="sg-label">Tooltip</p>
    <div class="sg-demo-row">
      <button class="btn btn-secondary" data-tooltip="Opens in the in-app reader">Hover me</button>
      <span class="badge badge-lock" data-tooltip="Contact @abderahmane.lovenature on TikTok" tabindex="0">${lockSvg} Why is this locked?</span>
    </div>

    <p class="sg-label">Modal — subscription prompt</p>
    <div class="sg-demo-row">
      <button class="btn btn-primary" id="open-modal-btn">Open subscription modal</button>
    </div>
  </div>
</section>`

const motionSection = `
<section class="sg-section" id="motion">
  <div class="container">
    <div class="sg-section-head">
      <p class="overline">05 — Motion</p>
      <h2>Motion guidelines</h2>
      <p>Motion is functional, quiet and decisive. Nothing bounces, nothing floats.
      All animation is disabled for users with <code style="font-family:ui-monospace,Menlo,monospace;font-size:var(--text-body-sm);background:var(--color-surface-sunken);padding:2px 6px;border-radius:4px">prefers-reduced-motion</code>.</p>
    </div>
    <div style="overflow-x:auto">
      <table class="sg-motion-table">
        <thead><tr><th>Use case</th><th>Duration</th><th>Easing</th><th>Properties</th></tr></thead>
        <tbody>
          <tr><td>Hovers — buttons, links, rows</td><td><code>150ms</code></td><td><code>ease-out · cubic-bezier(0.16, 1, 0.3, 1)</code></td><td>color, background, border, shadow</td></tr>
          <tr><td>Card lift, dropdowns, tooltips</td><td><code>200ms</code></td><td><code>ease-out</code></td><td>transform (≤2px), opacity, shadow</td></tr>
          <tr><td>Modal open / page transitions</td><td><code>250ms</code></td><td><code>ease-out</code> in · <code>ease-in · cubic-bezier(0.55, 0, 1, 0.45)</code> out</td><td>opacity + translateY(12px) scale(0.98)</td></tr>
          <tr><td>Layout moves / resizes</td><td><code>200ms</code></td><td><code>ease-in-out · cubic-bezier(0.65, 0, 0.35, 1)</code></td><td>height, width, position</td></tr>
        </tbody>
      </table>
    </div>
    <p class="text-caption" style="margin-top:var(--space-4)">Never exceed 250ms. Never use spring/bounce easings. Hover-lift is 2px maximum.</p>
  </div>
</section>`

const avoidSection = `
<section class="sg-section" id="avoid">
  <div class="container">
    <div class="sg-section-head">
      <p class="overline">06 — Guardrails</p>
      <h2>What to avoid</h2>
    </div>
    <div class="sg-avoid">
      <ul>
        <li><strong>No purple/violet gradients</strong> — or any large gradient surface. Brand color is flat ink blue.</li>
        <li><strong>No glassmorphism</strong> — no frosted floating cards, no heavy backdrop blur (the lock chip's 2px blur is the ceiling).</li>
        <li><strong>No emoji in headings or UI labels</strong> — use the line-icon set (1.5–2px stroke SVG) instead.</li>
        <li><strong>No pill-shaped everything</strong> — radius tops out at 10px; full-round is for avatars/dots only.</li>
        <li><strong>No centered giant-gradient-button hero</strong> — heroes are left-aligned, editorial, typography-led.</li>
        <li><strong>No bouncy/spring animations</strong> — 150–250ms ease curves only.</li>
        <li><strong>No pure #FFF / #000</strong> — backgrounds are warm off-white, text is warm near-black.</li>
        <li><strong>No Lorem ipsum</strong> — all demo content uses real library material.</li>
        <li><strong>Accent restraint</strong> — ochre appears on at most one primary CTA per screen, plus small highlights.</li>
        <li><strong>No salesy tone</strong> — persuasion comes from real results (17.42–18.92 averages) and content depth, not urgency banners or countdown timers.</li>
      </ul>
    </div>
  </div>
</section>`

const modalMarkup = `
<div class="modal-overlay" id="sub-modal" role="dialog" aria-modal="true" aria-labelledby="sub-modal-title">
  <div class="modal">
    <div class="modal-header">
      <h3 class="modal-title" id="sub-modal-title">This file is for subscribers</h3>
      <button class="modal-close" id="close-modal-btn" aria-label="Close">${closeSvg}</button>
    </div>
    <div class="modal-body">
      <p class="text-secondary" style="font-size:var(--text-body-sm);margin-bottom:var(--space-3)">
        <em>Mock Exam 2025 — Full Correction</em> is part of the subscriber library:
        400+ hand-picked files, complete corrections, premium books and mind maps.
      </p>
      <p class="text-secondary" style="font-size:var(--text-body-sm);margin-bottom:0">
        To subscribe, contact the founder on TikTok — accounts are created for you personally.
      </p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="cancel-modal-btn">Not now</button>
      <a class="btn btn-accent" href="https://www.tiktok.com/@abderahmane.lovenature" target="_blank" rel="noopener">Contact on TikTok</a>
    </div>
  </div>
</div>`

export const styleGuidePage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>تيسير — Design System</title>
  <meta name="description" content="Design tokens and component library for the تيسير study platform." />
  <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link href="/static/tokens.css" rel="stylesheet" />
  <link href="/static/components.css" rel="stylesheet" />
  <link href="/static/styleguide.css" rel="stylesheet" />
</head>
<body>
  <header class="sg-header">
    <div class="container">
      <p class="overline">تيسير · Design System v1.0</p>
      <h1>One library. One visual language.</h1>
      <p>The complete token set and component styles for the تيسير study platform —
      editorial, trustworthy and calm. Every page built after this must draw exclusively
      from these tokens.</p>
    </div>
  </header>

  <main>
    ${styleGuideSections1}
    ${componentsSection}
    ${motionSection}
    ${avoidSection}
  </main>

  <footer class="sg-footer">
    <div class="container">
      تيسير — founded by Abderrahmane Ben Taleb, Leticia Yahiaoui, Abdellah Ishak &amp; Ines Ben Amghar · Baccalaureate 2025, averages 17.42–18.92
    </div>
  </footer>

  ${modalMarkup}

  <script>
    (function () {
      var overlay = document.getElementById('sub-modal');
      var openBtn = document.getElementById('open-modal-btn');
      function open() { overlay.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
      function close() { overlay.classList.remove('is-open'); document.body.style.overflow = ''; }
      openBtn.addEventListener('click', open);
      document.getElementById('close-modal-btn').addEventListener('click', close);
      document.getElementById('cancel-modal-btn').addEventListener('click', close);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    })();
  </script>
</body>
</html>`

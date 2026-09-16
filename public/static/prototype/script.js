// Mobile hamburger menu
//
// Opens / closes the multi-layer menu that HomePage.tsx renders as
// #mobile-menu.home-mobile-menu (> .mm-scrim, .mm-wave-1..4, .mm-panel >
// .mm-close + nav.mm-links) and that /static/taysir-theme.css paints in §18
// and animates in §19.
//
// WHAT CHANGED AND WHY
// --------------------
// The previous version toggled `data-open` and the `hidden` attribute
// together. That worked for the old flat text menu but breaks the animated
// one in two ways:
//
//   1. `hidden` is `display: none` in the UA stylesheet, so setting it on
//      close removed the element from the box tree on the FIRST frame and
//      the closing animation never rendered.
//   2. Only the hamburger could close the menu. `.mm-close`, the scrim and
//      the Escape key did nothing, so a student who opened the full-screen
//      panel had exactly one way back out.
//
// THE CSS CONTRACT (taysir-theme.css §19)
// ---------------------------------------
//   data-open="true"   the menu is ON SCREEN — sliding in, resting, or
//                      sliding out. §18 paints it for this whole window.
//   .mm-in             the menu is at its RESTING OPEN position. Present =
//                      layers in place; absent = layers parked off-canvas.
//   data-open="false"  fully gone; §5's `display: none` applies again and
//                      the subtree leaves the a11y tree and hit-testing.
//
// So `data-open` is a PAINT flag and `.mm-in` is the MOTION flag. §18 keys
// its geometry AND its entire palette on [data-open="true"], so flipping
// that attribute to "false" at the start of a close would strip the layers'
// position, size and colour mid-animation. The close therefore removes
// `.mm-in` first, lets the transitions run, and only sets data-open="false"
// once the last one has finished.
//
// `hidden` is no longer set at all — `data-open="false"` plus §5's
// `display: none` already hides the menu completely, and `hidden` would
// re-introduce the frame-one cut-off. The attribute is cleared once on boot
// in case the server-rendered markup still carries it.
//
// NO JS ANIMATION. Every value that moves is interpolated by the CSS engine;
// this file only toggles a class and reads the transition duration back out
// of the stylesheet so the fallback timer can never disagree with it.
//
// UNTOUCHED: the theme toggle (applyTheme / themeBoot / the 'taysir-theme'
// localStorage key / the [data-theme-toggle] delegated listener), the Lottie
// module, and the reveal/IntersectionObserver code all live in other IIFEs in
// this file and are not referenced here.
(function () {
  const btn = document.getElementById('hamburger');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;

  const root = document.documentElement;
  const panel = menu.querySelector('.mm-panel');
  const scrim = menu.querySelector('.mm-scrim');
  const closeBtn = menu.querySelector('.mm-close');

  // The old markup may still ship `hidden`. Drop it once: from here on the
  // open state is expressed purely by `data-open`, so that `display: none`
  // can never cut a closing animation off on its first frame.
  menu.hidden = false;
  menu.removeAttribute('hidden');
  if (!menu.hasAttribute('data-open')) menu.setAttribute('data-open', 'false');

  let isOpen = menu.getAttribute('data-open') === 'true';
  let closeTimer = 0;

  // Read the exit duration straight out of §19's `--mm-exit-total` so the
  // fallback timer below can never drift from the stylesheet. Supports both
  // `ms` and `s`. If the property is missing (old cached CSS), fall back to a
  // value comfortably longer than the longest transition in §19.
  function exitDuration() {
    let raw = '';
    try {
      raw = getComputedStyle(menu).getPropertyValue('--mm-exit-total').trim();
    } catch (e) { /* ignore */ }
    if (!raw) return 700;
    const n = parseFloat(raw);
    if (!isFinite(n)) return 700;
    return /ms\s*$/.test(raw) ? n : n * 1000;
  }

  function setExpanded(next) {
    btn.classList.toggle('open', next);
    btn.setAttribute('aria-expanded', String(next));
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    window.clearTimeout(closeTimer);

    // 1. Make the menu rendered and PARKED (§19.2 puts every layer
    //    off-canvas). `hidden` is never set, so this only flips paint on.
    menu.setAttribute('data-open', 'true');
    root.classList.add('mm-open');          // §19.9 scroll lock
    setExpanded(true);

    // 2. A transition cannot start from a `display: none` element — there is
    //    no previous computed style to interpolate from. Force a synchronous
    //    reflow so the parked values are committed, then add `.mm-in` on the
    //    next frame so §19.4's resting values animate from them.
    void menu.offsetWidth;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (isOpen) menu.classList.add('mm-in');
      });
    });
  }

  function finishClose() {
    if (isOpen) return;                     // re-opened mid-close
    window.clearTimeout(closeTimer);
    menu.setAttribute('data-open', 'false');
    menu.classList.remove('mm-in');
  }

  function close(restoreFocus) {
    if (!isOpen) return;
    isOpen = false;

    // Remove the MOTION flag only. `data-open` stays "true" so §18 keeps
    // painting the layers while §19.2/19.3 slide them back out.
    menu.classList.remove('mm-in');
    root.classList.remove('mm-open');
    setExpanded(false);

    // Return focus to the control that opened the menu, so a keyboard user is
    // not dropped at the top of the document. Done immediately rather than
    // after the animation: the menu is already `pointer-events: none` and on
    // its way out, and delaying focus is what makes menus feel unresponsive.
    if (restoreFocus) {
      try { btn.focus({ preventScroll: true }); } catch (e) { btn.focus(); }
    }

    // Hide for real only once the exit has finished. The transitionend
    // listener is the accurate path; the timer is the guarantee — it covers
    // a dropped event, a background tab, and prefers-reduced-motion (where
    // §19.10 zeroes every duration).
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(finishClose, exitDuration() + 60);
  }

  function toggle() {
    if (isOpen) close(true); else open();
  }

  // The panel is the last layer to finish moving on the way out (§19.3 gives
  // it delay 0 but the longest duration), so its transitionend is the signal
  // that the close is visually complete. Guarded on the target and property
  // so a child's opacity transition cannot end the sequence early.
  if (panel) {
    panel.addEventListener('transitionend', function (e) {
      if (e.target !== panel || e.propertyName !== 'transform') return;
      if (!isOpen) finishClose();
    });
  }

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    toggle();
  });

  // Close button inside the panel.
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      close(true);
    });
  }

  // Tapping the dimmed backdrop closes too — the expected behaviour for a
  // full-screen overlay. Bound to the scrim element itself rather than to the
  // root, so a tap anywhere on the waves or the panel does NOT close.
  if (scrim) {
    scrim.addEventListener('click', function () { close(false); });
  }

  // Escape closes from anywhere on the page while the menu is open.
  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      close(true);
    }
  });

  // Close when a link inside the menu is followed. Focus is NOT restored to
  // the hamburger here: the anchors are in-page (#hero / #guide / #account)
  // and the user's attention belongs at the destination.
  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { close(false); });
  });

  // If the viewport grows past the mobile breakpoint while the menu is open,
  // drop it immediately. §19.8 hides it with `display: none` above 900px, and
  // that would otherwise strand the open state (scroll still locked, the
  // hamburger still marked expanded) with no visible way to undo it. The
  // query is the exact complement §17.8c and §19.8 use — `not all and
  // (max-width: 900px)` rather than `min-width: 901px`, because a fractional
  // width like 900.5px satisfies neither of the naive pair.
  const desktop = window.matchMedia('not all and (max-width: 900px)');
  function onBreakpoint(e) {
    if (!e.matches || !isOpen) return;
    close(false);
    finishClose();                          // no animation to wait for
  }
  if (typeof desktop.addEventListener === 'function') {
    desktop.addEventListener('change', onBreakpoint);
  } else if (typeof desktop.addListener === 'function') {
    desktop.addListener(onBreakpoint);      // Safari < 14
  }

  // Normalise the initial state: closed, collapsed, unlocked.
  if (!isOpen) {
    menu.setAttribute('data-open', 'false');
    menu.classList.remove('mm-in');
    root.classList.remove('mm-open');
  }
  setExpanded(isOpen);
})();

// Auth tabs (login / signup)
(function () {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');

      tabs.forEach(t => {
        const active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
      });

      panels.forEach(p => {
        const isActive = p.getAttribute('data-panel') === target;
        p.classList.toggle('active', isActive);
        if (isActive) {
          p.classList.remove('is-switching');
          void p.offsetWidth;
          p.classList.add('is-switching');
        } else {
          p.classList.remove('is-switching');
        }
      });
    });
  });
})();

/* ==========================================================
   THEME TOGGLE (light / dark)
   - Persists to localStorage
   - Applies data-theme="dark" on <html>
   - Sets .theme-transitioning during the ~0.4s fade to
     enable transitions ONLY on toggle (not on load, not
     on layout thrash) — prevents perceived jitter.
   - Respects prefers-reduced-motion for the animation.
   ========================================================== */
(function () {
  const STORAGE_KEY = 'taysir-theme';
  const root = document.documentElement;

  // Read persisted choice (default: light)
  const saved = (function () {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  })();
  const initial = saved === 'dark' ? 'dark' : 'light';
  root.setAttribute('data-theme', initial);

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function applyTheme(next, animate) {
    if (animate && !prefersReduced.matches) {
      root.classList.add('theme-transitioning');
      // Remove the class after transition completes to avoid transitioning
      // during layout changes (resize, scroll-triggered reveals, etc.)
      window.clearTimeout(applyTheme._t);
      applyTheme._t = window.setTimeout(() => {
        root.classList.remove('theme-transitioning');
      }, 500);
    }
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    // Update aria-pressed on all toggles
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
      btn.setAttribute('aria-label', next === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي');
    });
  }

  // Wire up any toggle button (desktop + mobile share the same data attr)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const cur = root.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark', true);
  });

  // Initialise aria state without animation
  applyTheme(initial, false);
})();

// Expose a single IO instance for reveal-on-scroll so that SVGs
// swapped in AFTER page load can also be observed. Set up here
// (before the inline-SVG IIFE runs) so it's available at swap time.
window.__taysirRevealIO = null;
(function () {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced || !('IntersectionObserver' in window)) return;
  window.__taysirRevealIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        requestAnimationFrame(() => entry.target.classList.add('is-visible'));
        window.__taysirRevealIO.unobserve(entry.target);
      }
    });
  }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
})();

/* ==========================================================
   INLINE ILLUSTRATIONS
   - Fetches each <img class="float-illu"> SVG once
   - Replaces it with an inline <svg> so its fills become
     CSS-recolorable via CSS variables.
   - Every hex we care about is remapped to a stable class
     (illu-fill-outline / -accent / -paper / -paperAlt /
      -skin / -mid) which is driven by CSS custom
     properties per theme.
   ========================================================== */
(function () {
  // Map of original hex (lowercased) -> semantic class name.
  // These are the ONLY fills used across the illustration set.
  const FILL_MAP = {
    '#111111': 'illu-fill-outline',
    '#111':    'illu-fill-outline',
    '#222222': 'illu-fill-mid',
    '#222':    'illu-fill-mid',
    '#4a4a4a': 'illu-fill-mid',
    '#6c3ef4': 'illu-fill-accent',
    '#efd9cc': 'illu-fill-skin',
    '#f2f2f5': 'illu-fill-paper',
    '#e8e8ee': 'illu-fill-paperAlt',
    '#ffffff': 'illu-fill-paperPure',
    '#fff':    'illu-fill-paperPure'
  };
  const STROKE_MAP = {
    '#4a4a4a': 'illu-stroke-mid',
    '#111111': 'illu-stroke-outline',
    '#111':    'illu-stroke-outline'
  };

  // Post-process a raw SVG string: swap fill="#xxx" / stroke="#xxx" into
  // class="illu-fill-*" while preserving any existing class attribute.
  function processSvgText(svgText) {
    // Replace fill="#hex" attributes on any element
    svgText = svgText.replace(/fill\s*=\s*"([^"]+)"/gi, (m, val) => {
      const cls = FILL_MAP[val.toLowerCase()];
      if (!cls) return m;
      return `data-fill="${cls}"`;
    });
    svgText = svgText.replace(/stroke\s*=\s*"([^"]+)"/gi, (m, val) => {
      const cls = STROKE_MAP[val.toLowerCase()];
      if (!cls) return m;
      return `data-stroke="${cls}"`;
    });
    return svgText;
  }

  // After inlining, walk the SVG and turn our data-* markers into real
  // class attributes (merging with any pre-existing class). This is
  // safer than regex-mangling the class attribute inside SVG text.
  function applyMarkerClasses(svgEl) {
    svgEl.querySelectorAll('[data-fill]').forEach(el => {
      const cls = el.getAttribute('data-fill');
      el.classList.add(cls);
      el.removeAttribute('data-fill');
      // Kill any inline fill left behind (defensive)
      el.style.fill = '';
    });
    svgEl.querySelectorAll('[data-stroke]').forEach(el => {
      const cls = el.getAttribute('data-stroke');
      el.classList.add(cls);
      el.removeAttribute('data-stroke');
      el.style.stroke = '';
    });
    // Handle the root <svg> itself (rare but possible)
    if (svgEl.hasAttribute('data-fill')) {
      svgEl.classList.add(svgEl.getAttribute('data-fill'));
      svgEl.removeAttribute('data-fill');
    }
  }

  // Copy width/height/class/style from the placeholder img
  function transferAttrs(img, svg) {
    // Preserve classes (float-illu, float-a, illu-primary, ...)
    if (img.className) {
      img.className.split(/\s+/).forEach(c => c && svg.classList.add(c));
    }
    // Deliberately DON'T copy width/height attrs — the SVG's viewBox
    // already carries the aspect ratio, and forcing width="480"/height="480"
    // makes the inline SVG render at an incorrect fixed square size. We let
    // CSS (max-width: 100% + height: auto) size the SVG responsively.
    // Copy inline style
    if (img.getAttribute('style')) svg.setAttribute('style', img.getAttribute('style'));
    // Data attrs like data-reveal
    Array.from(img.attributes).forEach(a => {
      if (a.name.startsWith('data-')) svg.setAttribute(a.name, a.value);
    });
    // If the img was already revealed (is-visible), keep that state
    if (img.classList.contains('is-visible')) {
      svg.classList.add('is-visible');
    }
    // Alt -> aria-label
    if (img.alt) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', img.alt);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    // Force responsive sizing regardless of what the SVG file declared
    svg.setAttribute('width', '100%');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = '100%';
  }

  async function inlineOne(img) {
    const src = img.getAttribute('src');
    if (!src || !src.endsWith('.svg')) return;
    try {
      // Snapshot viewport-intersection BEFORE swap. If the img was
      // already on-screen when the fetch resolved, the SVG replacing
      // it should be visible immediately (no need to wait for IO).
      const rect = img.getBoundingClientRect();
      const wasInViewport = rect.top < (window.innerHeight || 0) + 100 &&
                            rect.bottom > -100;

      const res = await fetch(src);
      if (!res.ok) return;
      let text = await res.text();
      text = processSvgText(text);

      // Parse to DOM
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      const svg = doc.documentElement;
      if (!svg || svg.tagName.toLowerCase() !== 'svg') return;

      applyMarkerClasses(svg);
      transferAttrs(img, svg);

      if (wasInViewport && svg.hasAttribute('data-reveal')) {
        svg.classList.add('is-visible');
      }

      // Swap in place
      img.parentNode.replaceChild(svg, img);

      // If reduced-motion, or IO not available, or the element is already
      // marked visible, do nothing more. Otherwise observe the new SVG
      // so it reveals when it scrolls into view.
      if (svg.hasAttribute('data-reveal') && !svg.classList.contains('is-visible')
          && window.__taysirRevealIO) {
        window.__taysirRevealIO.observe(svg);
      } else if (svg.hasAttribute('data-reveal') && !svg.classList.contains('is-visible')) {
        // No IO — reveal immediately so the element isn't stuck invisible.
        svg.classList.add('is-visible');
      }
    } catch (err) {
      // Silent failure — fallback keeps the original <img>
      // console.warn('SVG inline failed', src, err);
    }
  }

  // Kick off in parallel
  const imgs = document.querySelectorAll('img[src$=".svg"]');
  Promise.allSettled(Array.from(imgs).map(inlineOne)).then(() => {
    // Safety net: any [data-reveal] still hidden but sitting inside the
    // viewport should reveal now (covers slow-fetch races and IO misses).
    document.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < (window.innerHeight || 0) + 80 && r.bottom > -80) {
        el.classList.add('is-visible');
      }
    });
    // Ultimate safety net: after 2 seconds, if any element is STILL hidden
    // and the page has no scrolling activity (implies IO never fires here),
    // reveal it. Guarantees the design is never stuck in an invisible state.
    setTimeout(() => {
      document.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(el => {
        el.classList.add('is-visible');
      });
    }, 2000);
  });
})();

// Reveal-on-scroll: fade + slide-up when entering viewport.
// Uses the shared IntersectionObserver created above (so SVGs swapped in
// after page load also participate). Respects prefers-reduced-motion.
(function () {
  function collect() { return document.querySelectorAll('[data-reveal]:not(.is-visible)'); }

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    collect().forEach(el => el.classList.add('is-visible'));
    return;
  }

  const io = window.__taysirRevealIO;
  if (!io) {
    collect().forEach(el => el.classList.add('is-visible'));
    return;
  }

  function observeAll() { collect().forEach(el => io.observe(el)); }
  observeAll();
})();

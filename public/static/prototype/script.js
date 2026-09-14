// Mobile hamburger menu
(function () {
  const btn = document.getElementById('hamburger');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const isOpen = menu.getAttribute('data-open') === 'true';
    const next = !isOpen;
    menu.setAttribute('data-open', String(next));
    menu.hidden = !next;
    btn.classList.toggle('open', next);
    btn.setAttribute('aria-expanded', String(next));
  });

  // Close mobile menu when clicking a link inside
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      menu.setAttribute('data-open', 'false');
      menu.hidden = true;
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });
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

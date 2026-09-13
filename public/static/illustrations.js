/* ==========================================================
   تيسير — ILLUSTRATION THEME ENGINE  (PRESENTATION ONLY)

   PROVENANCE: this is the finished visual prototype's
   illustration-inlining routine (prototype script.js, the
   "INLINE ILLUSTRATIONS" IIFE plus its shared reveal
   IntersectionObserver), reproduced faithfully. The hex map,
   the semantic class names and the reveal behaviour are the
   prototype's own.

   WHAT IT DOES
   Fetches each <img class="float-illu"> SVG once and replaces
   it with an inline <svg>, remapping every fill/stroke we care
   about onto a stable semantic class (illu-fill-outline /
   -mid / -accent / -skin / -paper / -paperAlt / -paperPure).
   Those classes are driven by the --illu-* CSS custom
   properties, which flip per theme — so an illustration
   recolours itself smoothly when the light/dark toggle fires,
   with no second asset download and no flash.

   SCOPE — THIS FILE IS COSMETIC AND SELF-CONTAINED:
     • It only ever reads <img src="*.svg"> elements and swaps
       them for equivalent inline <svg> nodes.
     • It registers NO routes, performs NO authentication, and
       reads/writes NO cookie, session or storage key other
       than the theme key the prototype already used.
     • It never touches Google Drive, the file list, the file
       viewer's byte stream, or any /api/* endpoint.
     • It is loaded with `defer` AFTER the application's own
       scripts, and it does not modify, wrap or monkey-patch
       any application function.
   ========================================================== */

/* ----------------------------------------------------------
   THEME TOGGLE (light / dark) — prototype behaviour.

   Uses the SAME storage key the site already used before this
   redesign ('taysir-theme') and the SAME representation
   (<html data-theme="light|dark">), so the internal library,
   the shelf and the React exterior continue to agree on the
   current theme exactly as they did before. No key was
   renamed and no new persistence was introduced.

   `.theme-transitioning` is added on <html> only for the
   ~0.4s of an actual toggle, so the colour cross-fade never
   runs on load or during layout work.
   ---------------------------------------------------------- */
(function () {
  var STORAGE_KEY = 'taysir-theme';
  var root = document.documentElement;

  var saved = (function () {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  })();

  // Respect a theme an earlier inline script already resolved (the pages set
  // data-theme before paint to avoid a flash). Otherwise fall back to the
  // stored choice, then to the prototype's default of light.
  var existing = root.getAttribute('data-theme');
  var initial = existing === 'dark' || existing === 'light'
    ? existing
    : (saved === 'dark' ? 'dark' : 'light');
  root.setAttribute('data-theme', initial);

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function applyTheme(next, animate) {
    if (animate && !prefersReduced.matches) {
      root.classList.add('theme-transitioning');
      window.clearTimeout(applyTheme._t);
      applyTheme._t = window.setTimeout(function () {
        root.classList.remove('theme-transitioning');
      }, 500);
    }
    root.setAttribute('data-theme', next);
    root.style.colorScheme = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}

    // Keep the mobile browser chrome in step with the canvas.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#0E1016' : '#FFFFFF');

    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        next === 'dark' ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'
      );
    });
  }

  // Delegated so a toggle rendered at any time (including inside an overlay
  // that is created later) works without re-binding.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var cur = root.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark', true);
  });

  applyTheme(initial, false);

  // Expose for the few places that need to read the theme (e.g. to pick a
  // baked light/dark illustration). Read-only helper; sets nothing.
  window.taysirTheme = function () {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  };
})();

/* ----------------------------------------------------------
   Shared reveal-on-scroll observer.
   Declared before the inlining pass so SVGs swapped in after
   load can also be observed. Prototype behaviour.
   ---------------------------------------------------------- */
window.__taysirRevealIO = null;
(function () {
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced || !('IntersectionObserver' in window)) return;
  window.__taysirRevealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        requestAnimationFrame(function () { entry.target.classList.add('is-visible'); });
        window.__taysirRevealIO.unobserve(entry.target);
      }
    });
  }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
})();

/* ----------------------------------------------------------
   INLINE ILLUSTRATIONS — prototype routine.
   ---------------------------------------------------------- */
(function () {
  // Map of original hex (lowercased) -> semantic class name.
  // These are the ONLY fills used across the illustration set
  // (scripts/build-illustrations.mjs normalises every asset onto them).
  var FILL_MAP = {
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
  var STROKE_MAP = {
    '#4a4a4a': 'illu-stroke-mid',
    '#111111': 'illu-stroke-outline',
    '#111':    'illu-stroke-outline'
  };

  function processSvgText(svgText) {
    svgText = svgText.replace(/fill\s*=\s*"([^"]+)"/gi, function (m, val) {
      var cls = FILL_MAP[val.toLowerCase()];
      if (!cls) return m;
      return 'data-fill="' + cls + '"';
    });
    svgText = svgText.replace(/stroke\s*=\s*"([^"]+)"/gi, function (m, val) {
      var cls = STROKE_MAP[val.toLowerCase()];
      if (!cls) return m;
      return 'data-stroke="' + cls + '"';
    });
    return svgText;
  }

  function applyMarkerClasses(svgEl) {
    svgEl.querySelectorAll('[data-fill]').forEach(function (el) {
      var cls = el.getAttribute('data-fill');
      el.classList.add(cls);
      el.removeAttribute('data-fill');
      el.style.fill = '';
    });
    svgEl.querySelectorAll('[data-stroke]').forEach(function (el) {
      var cls = el.getAttribute('data-stroke');
      el.classList.add(cls);
      el.removeAttribute('data-stroke');
      el.style.stroke = '';
    });
    if (svgEl.hasAttribute('data-fill')) {
      svgEl.classList.add(svgEl.getAttribute('data-fill'));
      svgEl.removeAttribute('data-fill');
    }
  }

  function transferAttrs(img, svg) {
    if (img.className) {
      img.className.split(/\s+/).forEach(function (c) { if (c) svg.classList.add(c); });
    }
    if (img.getAttribute('style')) svg.setAttribute('style', img.getAttribute('style'));
    Array.prototype.slice.call(img.attributes).forEach(function (a) {
      if (a.name.indexOf('data-') === 0) svg.setAttribute(a.name, a.value);
    });
    if (img.classList.contains('is-visible')) svg.classList.add('is-visible');
    if (img.alt) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', img.alt);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    // The viewBox already carries the aspect ratio; let CSS size it.
    svg.setAttribute('width', '100%');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = '100%';
  }

  function inlineOne(img) {
    var src = img.getAttribute('src');
    if (!src || src.slice(-4) !== '.svg') return Promise.resolve();
    var rect = img.getBoundingClientRect();
    var wasInViewport = rect.top < (window.innerHeight || 0) + 100 && rect.bottom > -100;

    return fetch(src).then(function (res) {
      if (!res.ok) return null;
      return res.text();
    }).then(function (text) {
      if (!text) return;
      text = processSvgText(text);
      var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      var svg = doc.documentElement;
      if (!svg || svg.tagName.toLowerCase() !== 'svg') return;

      applyMarkerClasses(svg);
      transferAttrs(img, svg);

      if (wasInViewport && svg.hasAttribute('data-reveal')) svg.classList.add('is-visible');
      if (!img.parentNode) return;
      img.parentNode.replaceChild(svg, img);

      if (svg.hasAttribute('data-reveal') && !svg.classList.contains('is-visible')) {
        if (window.__taysirRevealIO) window.__taysirRevealIO.observe(svg);
        else svg.classList.add('is-visible');
      }
    }).catch(function () {
      /* Silent: the original <img> stays as a perfectly good fallback. */
    });
  }

  /** Inline every not-yet-inlined illustration under `scope`. */
  function run(scope) {
    var host = scope || document;
    var imgs = host.querySelectorAll('img.float-illu[src$=".svg"], img.taysir-illu[src$=".svg"]');
    return Promise.all(Array.prototype.map.call(imgs, inlineOne)).then(function () {
      host.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < (window.innerHeight || 0) + 80 && r.bottom > -80) {
          el.classList.add('is-visible');
        }
      });
      // Safety net: never leave the design stuck in an invisible state.
      setTimeout(function () {
        host.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(function (el) {
          el.classList.add('is-visible');
        });
      }, 2000);
    });
  }

  // Re-exposed so a page that reveals an illustration later (e.g. an overlay
  // opening) can inline it. Purely additive; nothing calls into app logic.
  window.taysirInlineIllustrations = run;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { run(document); });
  } else {
    run(document);
  }

  // Illustrations placed by the app into containers that appear later are
  // picked up by a lightweight MutationObserver. It ONLY looks for
  // `img.taysir-illu` / `img.float-illu` and never inspects or alters
  // anything else in the mutated subtree.
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('img.taysir-illu, img.float-illu')) {
            inlineOne(node);
          } else if (node.querySelectorAll) {
            var nested = node.querySelectorAll('img.taysir-illu[src$=".svg"], img.float-illu[src$=".svg"]');
            for (var k = 0; k < nested.length; k++) inlineOne(nested[k]);
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();

/* ----------------------------------------------------------
   Reveal-on-scroll for non-illustration blocks. Prototype
   behaviour, honouring prefers-reduced-motion.
   ---------------------------------------------------------- */
(function () {
  function collect() { return document.querySelectorAll('[data-reveal]:not(.is-visible)'); }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    collect().forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  var io = window.__taysirRevealIO;
  if (!io) {
    collect().forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  collect().forEach(function (el) { io.observe(el); });
})();

// TEMPORARY DEBUG — on-screen log panel (no dev console needed on iPhone).
// ============================================================================
// Mirrors every console.log/warn/error line that starts with [cache], [auth]
// or [sw] into a small bottom overlay, plus environment facts (IndexedDB open
// state, effective cache budget, bound _sessionKey, storage persistence).
// Includes a COPY button so the owner can paste the log for support.
//
// SAFETY: every single statement is wrapped in try/catch — this panel can
// NEVER break the app or the viewer. Remove this file + its <script> tag and
// the SHELL_ASSETS entry in service-worker.js once verification is done.
// ============================================================================
(function () {
  'use strict';
  try {
    var MAX_LINES = 400;
    var lines = [];
    var bodyEl = null;
    var panelEl = null;
    var collapsed = true;
    var badgeEl = null;

    function ts() {
      try {
        var d = new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      } catch (e) { return ''; }
    }

    function fmt(args) {
      try {
        var out = [];
        for (var i = 0; i < args.length; i++) {
          var a = args[i];
          if (typeof a === 'string') { out.push(a); continue; }
          try { out.push(JSON.stringify(a)); }
          catch (e) { out.push(String(a)); }
        }
        return out.join(' ');
      } catch (e) { return '(unprintable)'; }
    }

    function addLine(kind, text) {
      try {
        lines.push('[' + ts() + '] ' + text);
        if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
        if (bodyEl) {
          var div = document.createElement('div');
          div.textContent = lines[lines.length - 1];
          if (kind === 'err') div.style.color = '#ff9d8f';
          else if (kind === 'warn') div.style.color = '#ffd27a';
          else if (text.indexOf('HIT') !== -1) div.style.color = '#7dffb0';
          else if (text.indexOf('MISS') !== -1) div.style.color = '#9fc4ff';
          bodyEl.appendChild(div);
          while (bodyEl.childNodes.length > MAX_LINES) bodyEl.removeChild(bodyEl.firstChild);
          bodyEl.scrollTop = bodyEl.scrollHeight;
        }
        if (badgeEl && collapsed) {
          badgeEl.textContent = String(lines.length);
        }
      } catch (e) { /* never throw */ }
    }

    // Public hook so other scripts can log directly to the panel.
    try { window.__dbg = function (msg) { addLine('log', String(msg)); }; } catch (e) {}

    // ---- console interception (only mirrors, never swallows) --------------
    function shouldMirror(args) {
      try {
        var first = args && args.length ? args[0] : '';
        if (typeof first !== 'string') return false;
        return first.indexOf('[cache]') === 0 || first.indexOf('[auth]') === 0 ||
               first.indexOf('[sw]') === 0 || first.indexOf('[FileCache]') === 0 ||
               first.indexOf('[dbg]') === 0;
      } catch (e) { return false; }
    }
    try {
      var origLog = console.log, origWarn = console.warn, origErr = console.error;
      console.log = function () {
        try { if (shouldMirror(arguments)) addLine('log', fmt(arguments)); } catch (e) {}
        try { return origLog.apply(console, arguments); } catch (e) {}
      };
      console.warn = function () {
        try { if (shouldMirror(arguments)) addLine('warn', fmt(arguments)); } catch (e) {}
        try { return origWarn.apply(console, arguments); } catch (e) {}
      };
      console.error = function () {
        try { if (shouldMirror(arguments)) addLine('err', fmt(arguments)); } catch (e) {}
        try { return origErr.apply(console, arguments); } catch (e) {}
      };
    } catch (e) { /* console not patchable → panel still shows env facts */ }

    // Catch unhandled errors too (they may explain a cache/auth failure).
    try {
      window.addEventListener('error', function (ev) {
        try { addLine('err', '[dbg] window.onerror: ' + (ev && ev.message)); } catch (e) {}
      });
      window.addEventListener('unhandledrejection', function (ev) {
        try {
          var r = ev && ev.reason;
          addLine('err', '[dbg] unhandledrejection: ' + (r && (r.message || String(r))));
        } catch (e) {}
      });
    } catch (e) {}

    // ---- UI ----------------------------------------------------------------
    function buildUi() {
      try {
        if (panelEl) return;
        panelEl = document.createElement('div');
        panelEl.id = 'tmp-debug-panel';
        panelEl.setAttribute('dir', 'ltr'); // logs are latin — keep them readable in RTL pages
        panelEl.style.cssText =
          'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
          'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;' +
          'background:rgba(8,14,22,.94);color:#cfe3ff;border-top:1px solid rgba(255,255,255,.25);' +
          'box-shadow:0 -4px 18px rgba(0,0,0,.4);';

        var bar = document.createElement('div');
        bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;user-select:none;';

        var title = document.createElement('span');
        title.textContent = 'DEBUG (مؤقت)';
        title.style.cssText = 'font-weight:700;color:#7dd3fc;';

        badgeEl = document.createElement('span');
        badgeEl.style.cssText = 'background:#334155;border-radius:8px;padding:0 7px;color:#fff;';
        badgeEl.textContent = '0';

        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = 'COPY';
        copyBtn.style.cssText =
          'margin-left:auto;background:#1d4ed8;color:#fff;border:0;border-radius:6px;' +
          'padding:4px 12px;font:inherit;font-weight:700;cursor:pointer;';
        copyBtn.addEventListener('click', function (ev) {
          try {
            ev.stopPropagation();
            var text = lines.join('\n');
            var done = function (ok) {
              try { copyBtn.textContent = ok ? 'COPIED ✓' : 'FAILED'; } catch (e) {}
              setTimeout(function () { try { copyBtn.textContent = 'COPY'; } catch (e) {} }, 1500);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
                done(fallbackCopy(text));
              });
            } else {
              done(fallbackCopy(text));
            }
          } catch (e) { /* never throw */ }
        });

        function fallbackCopy(text) {
          try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
          } catch (e) { return false; }
        }

        var toggleHint = document.createElement('span');
        toggleHint.textContent = '▲';
        toggleHint.style.cssText = 'color:#94a3b8;';

        bar.appendChild(title);
        bar.appendChild(badgeEl);
        bar.appendChild(copyBtn);
        bar.appendChild(toggleHint);

        bodyEl = document.createElement('div');
        bodyEl.style.cssText =
          'display:none;max-height:38vh;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
          'padding:6px 10px 10px;white-space:pre-wrap;word-break:break-all;text-align:left;';

        bar.addEventListener('click', function () {
          try {
            collapsed = !collapsed;
            bodyEl.style.display = collapsed ? 'none' : 'block';
            toggleHint.textContent = collapsed ? '▲' : '▼';
            if (!collapsed) {
              // Re-render all buffered lines (some arrived before UI existed).
              bodyEl.innerHTML = '';
              for (var i = 0; i < lines.length; i++) {
                var div = document.createElement('div');
                div.textContent = lines[i];
                bodyEl.appendChild(div);
              }
              bodyEl.scrollTop = bodyEl.scrollHeight;
            }
          } catch (e) {}
        });

        panelEl.appendChild(bar);
        panelEl.appendChild(bodyEl);
        document.body.appendChild(panelEl);
      } catch (e) { /* UI failure must never break the app */ }
    }

    // ---- environment probes (run once the page settles) --------------------
    function probes() {
      try {
        addLine('log', '[dbg] UA: ' + (navigator.userAgent || '?'));
        addLine('log', '[dbg] indexedDB supported: ' + ('indexedDB' in window));
      } catch (e) {}
      try {
        if (navigator.storage && navigator.storage.persisted) {
          navigator.storage.persisted().then(function (p) {
            addLine('log', '[dbg] storage persisted: ' + p);
          }, function () {});
        }
        if (navigator.storage && navigator.storage.estimate) {
          navigator.storage.estimate().then(function (est) {
            addLine('log', '[dbg] quota=' + (est && est.quota) + ' usage=' + (est && est.usage));
          }, function () {});
        }
      } catch (e) {}
      // Poll FileCache introspection a few times (bind + budget resolve async).
      var polls = 0;
      var t = setInterval(function () {
        try {
          polls++;
          var fc = window.FileCache;
          if (fc && fc.sessionKey) {
            addLine('log', '[dbg] FileCache _sessionKey=' + fc.sessionKey() +
              ' budget=' + (fc.effectiveBudget ? fc.effectiveBudget() : '?'));
          }
          if (polls >= 3) clearInterval(t);
        } catch (e) { try { clearInterval(t); } catch (e2) {} }
      }, 2500);
    }

    function start() {
      try { buildUi(); } catch (e) {}
      try { probes(); } catch (e) {}
    }
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
      } else {
        start();
      }
    } catch (e) {}
  } catch (e) { /* the panel must NEVER break the app */ }
})();

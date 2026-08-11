/* ============================================================
   تيسير (Taysir) — UI behaviour
   - book covers into the 3:4 slots (from js/config.js)
   - each book is WIRED to its subject + future Drive folder
   - NOT-SUBSCRIBED glass banner (glassmorphism) before entering
   - inner book page = cozy shelf scene with plants (EMPTY on purpose)
   - gentle tilt on hover (disabled with reduced motion)
   - day/night theme with shelf lamps (choice persisted)
   ============================================================ */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer   = window.matchMedia("(pointer: fine)");

  var SUBJECTS   = window.TAYSIR_SUBJECTS || [];
  var FOLDER_URL = window.TAYSIR_FOLDER_URL || function () { return "folder.html"; };
  var FIND       = window.TAYSIR_FIND || function () { return null; };
  var SUB        = window.TAYSIR_SUBSCRIPTION || {};

  function isSubscribed() {
    return typeof SUB.isSubscribed === "function" ? !!SUB.isSubscribed() : false;
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

    /* subscribe link — inert unless a URL is configured */
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

      var go = function () {
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
     5) THEME — day / night (unchanged logic)
     ------------------------------------------------------------ */
  var THEME_KEY = "taysir-theme";
  var themeSwitching = false;

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "night"
      ? "night" : "day";
  }

  function storeTheme(mode) {
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* ignore */ }
  }

  function applyTheme(mode) {
    var html = document.documentElement;
    var btn  = document.getElementById("theme-toggle");

    if (mode === "night") html.setAttribute("data-theme", "night");
    else html.removeAttribute("data-theme");

    storeTheme(mode);
    if (btn) btn.setAttribute("aria-pressed", mode === "night" ? "true" : "false");
  }

  function toggleTheme() {
    if (themeSwitching) return;
    var next = currentTheme() === "night" ? "day" : "night";
    var veil = document.getElementById("night-veil");

    if (reducedMotion.matches || !veil) { applyTheme(next); return; }

    themeSwitching = true;

    veil.className = "night-veil " +
      (next === "night" ? "night-veil--dark" : "night-veil--light") +
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
    btn.setAttribute("aria-pressed", currentTheme() === "night" ? "true" : "false");
    btn.addEventListener("click", toggleTheme);
  }

  /* ============================================================
     6) INSIDE A BOOK — the cozy shelf scene
        The title ALWAYS reflects the folder actually opened.
        The shelves start EMPTY on purpose: no sample folders,
        no dummy items. Real sub-folders arrive from Drive later
        via window.TAYSIR_FOLDER_ITEMS / TAYSIR_RENDER_FOLDER_ITEMS.
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

  function initFolderPage() {
    var main = document.getElementById("folder-main");
    if (!main) return;

    /* the inner content is library content too → gate it */
    if (!isSubscribed()) {
      document.body.classList.add("is-gated");
      openGate(null);
    }

    var params  = new URLSearchParams(window.location.search);
    var key     = params.get("subject") || "";
    var subject = FIND(key);

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
      renderFolderItems(window.TAYSIR_FOLDER_ITEMS);
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

    /* shelves start empty — real Drive folders are injected later */
    renderFolderItems(window.TAYSIR_FOLDER_ITEMS);
  }

  /* ------------------------------------------------------------ */
  function init() {
    applyCovers();
    wireBooks();
    clearEnglishCaptions();
    initTilt();
    watchReducedMotion();
    initTheme();
    initFolderPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

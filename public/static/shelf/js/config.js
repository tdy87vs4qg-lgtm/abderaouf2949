/* ============================================================
   تيسير (Taysir) — SUBJECTS CONFIG  /  إعدادات المواد
   ------------------------------------------------------------
   THE ONLY FILE YOU NEED TO TOUCH TO:
     (a) change a book cover image
     (b) later link a book to its Google Drive first-level folder

   Each entry = ONE book slot on the shelf.

   key        : internal slug (do not change — used by CSS/JS/URLs)
   slot       : the physical slot on the shelf (slot-1 .. slot-8)
   folderName : EXACT name of the matching first-level Drive folder
                (Arabic subject name — must match the Drive folder name)
                It is ALSO the Arabic title shown at the top of the
                folder page when that book is opened.
   cover      : path to the cover image for this book  (3:4)
   driveId    : LEAVE EMPTY FOR NOW.  When you are ready to merge the
                two Drives, paste the Drive folder ID here — nothing
                else has to change; the book will then open that
                folder's contents page instead of the empty shelf.
   ============================================================ */

window.TAYSIR_SUBJECTS = [
  {
    key: "math",
    slot: "slot-1",
    folderName: "الرياضيات",
    cover: "/static/shelf/covers/math.png",
    driveId: ""                        /* ← Drive folder ID goes here later */
  },
  {
    key: "physics",
    slot: "slot-2",
    folderName: "الفيزياء",
    cover: "/static/shelf/covers/physics.png",
    driveId: ""
  },
  {
    key: "arabic",
    slot: "slot-3",
    folderName: "العربية",
    cover: "/static/shelf/covers/arabic.png",
    driveId: ""
  },
  {
    key: "french",
    slot: "slot-4",
    folderName: "الفرنسية",
    cover: "/static/shelf/covers/french.png",
    driveId: ""
  },
  {
    key: "english",
    slot: "slot-5",
    folderName: "الإنجليزية",
    cover: "/static/shelf/covers/english.png",
    driveId: ""
  },
  {
    key: "islamic",
    slot: "slot-6",
    folderName: "الإسلامية",
    cover: "/static/shelf/covers/islamic.png",
    driveId: ""
  },
  {
    key: "science",
    slot: "slot-7",
    folderName: "العلوم",
    cover: "/static/shelf/covers/science.png",
    driveId: ""
  },
  {
    key: "history-geo",
    slot: "slot-8",
    folderName: "التاريخ والجغرافيا",
    cover: "/static/shelf/covers/history-geo.png",
    driveId: ""
  }
];

/* ------------------------------------------------------------
   Where a book navigates to when clicked.
   NOW      : empty shelf page  ->  folder.html?subject=<key>
   LATER    : same page, but it will receive the Drive folder id too,
              so the contents page can list that folder's sub-folders.
   No other file needs editing when the Drives are merged.
   ------------------------------------------------------------ */
window.TAYSIR_FOLDER_URL = function (subject) {
  var url = "folder.html?subject=" + encodeURIComponent(subject.key);
  if (subject.driveId) {
    url += "&folder=" + encodeURIComponent(subject.driveId);
  }
  return url;
};

/* helper: look a subject up by slot id or by key */
window.TAYSIR_FIND = function (idOrKey) {
  var list = window.TAYSIR_SUBJECTS || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].slot === idOrKey || list[i].key === idOrKey) return list[i];
  }
  return null;
};

/* ============================================================
   SUBSCRIPTION BANNER — DISPLAY STATE  /  بوابة الاشتراك (عرض فقط)
   ------------------------------------------------------------
   ⚠️  THIS IS DECORATION. IT IS NOT A SECURITY BOUNDARY.  ⚠️

   Nothing in this file protects anything, and nothing in it can
   unlock anything. It only decides whether the glass banner is
   PAINTED. The real, authoritative gate lives entirely on the
   server and is not reachable from the browser:

       src/lib/guards.ts  → requireActiveSubscriber
       src/routes/library.ts → gateContent
           → 402 { error: "SUBSCRIPTION_REQUIRED" } on
             GET /api/library/file/:id/meta and .../content

   That gate re-decides access from the validated httpOnly session
   on EVERY request, so forging any window.TAYSIR_* value from the
   console changes the picture and nothing else — not one byte of
   file content is served.

   ── MERGE STEP 7/10 — BOUND TO THE REAL SESSION ───────────────
   The authoritative signal for the DISPLAY is now the server:
   src/pages/shelf.ts fetches taysir's existing endpoint
   GET /api/auth/me (src/routes/auth.ts) before this file runs and
   publishes window.TAYSIR_SESSION = { authenticated, user,
   isSubscribed, resolved }, where `isSubscribed` mirrors
   requireActiveSubscriber exactly (admin, OR subscriber with
   approved === true).

   Resolution order (first answer wins):
     1) window.TAYSIR_IS_SUBSCRIBED            (boolean or function)
     2) window.TAYSIR_SESSION  ← AUTHORITATIVE, set from /api/auth/me
        (.isSubscribed / .subscribed / .subscription.active)
     3) window.TAYSIR_USER.isSubscribed / .subscribed
     4) localStorage "taysir-subscribed" — NON-AUTHORITATIVE CACHE.
        Read ONLY to suppress a banner flash before /me answers, and
        ONLY while the server has not answered yet. It can never
        override a server "not subscribed", and a stale "true" is
        corrected the moment /me resolves.
     5) default → NOT subscribed  (the banner is shown)

   REMOVED IN STEP 7/10: the "?sub=1 / ?sub=0" URL override. It let
   ANY visitor hide the banner by editing the address bar, which was
   pure theatre (it never granted content — the server still returned
   402) but it made the UI lie. Gone; there is no URL flag any more.
   ============================================================ */
window.TAYSIR_SUBSCRIPTION = {
  /* pricing shown on the glass banner */
  price:      "3000",
  oldPrice:   "5000",
  currency:   "DA",
  periodText: "اشتراك كامل",

  /* Arabic feature list shown inside the banner */
  features: [
    "ملخصات مختارة بعناية",
    "سلاسل تمارين بالتصحيح المفصل",
    "باكالوريات أسبوعية",
    "مواضيع ثانوية القبة وأشبال الأمة",
    "العديد من الكتب",
    "كل هذا بجودة عالية"
  ],

  /* Where the "اشترك الآن" button sends the visitor (merge step 7/10).
     taysir's real subscription page: the React SPA route "/subscription"
     (frontend/src/App.tsx <Route path="/subscription">, rendered by
     frontend/src/pages/SubscriptionPage.tsx, and served on a hard load by
     src/index.tsx → PUBLIC_SPA_ROUTES). It is a normal public page — it
     explains the offer and points at the TikTok contact used to arrange
     the subscription. Navigating there grants nothing by itself. */
  subscribeUrl: "/subscription",

  /* ------------------------------------------------------------
     DISPLAY-STATE RESOLVER — read-only, never writes anything, and
     NEVER grants access. Its single job is answering "should the
     glass banner be painted?". The server decides the real thing.
     ------------------------------------------------------------ */
  isSubscribed: function () {
    var v = window.TAYSIR_IS_SUBSCRIBED;
    if (typeof v === "function") { try { v = v(); } catch (e) { v = undefined; } }
    if (typeof v === "boolean") return v;

    /* AUTHORITATIVE: set by src/pages/shelf.ts from GET /api/auth/me.
       Once this object exists, it is the answer — no lower-priority
       source (and in particular no cached localStorage value) may
       override a server "not subscribed". */
    var s = window.TAYSIR_SESSION;
    if (s && typeof s === "object") {
      if (typeof s.isSubscribed === "boolean") return s.isSubscribed;
      if (typeof s.subscribed   === "boolean") return s.subscribed;
      if (s.subscription && typeof s.subscription.active === "boolean") {
        return s.subscription.active;
      }
    }

    var u = window.TAYSIR_USER;
    if (u && typeof u === "object") {
      if (typeof u.isSubscribed === "boolean") return u.isSubscribed;
      if (typeof u.subscribed   === "boolean") return u.subscribed;
    }

    /* NON-AUTHORITATIVE COSMETIC CACHE — anti-flash only.
       Consulted ONLY when no session object exists at all, i.e. before
       /api/auth/me has answered (or on a page that never sets one). The
       moment the server answers, the branch above wins and any stale
       "true" here is overruled. Because the shelf publishes
       window.TAYSIR_SESSION synchronously (pessimistically, before the
       fetch even starts), on /shelf this branch is effectively dead —
       it cannot be used to unlock the banner there. It never affects
       content access anywhere: that is the server's 402. */
    try {
      if (localStorage.getItem("taysir-subscribed") === "true") return true;
    } catch (e) { /* storage unavailable */ }

    /* NOTE: the "?sub=1 / ?sub=0" URL override that used to sit here was
       REMOVED in merge step 7/10. The banner must not be toggleable from
       the address bar. */

    return false;   /* default: not subscribed → glass banner */
  }
};

/* ------------------------------------------------------------
   CONTENTS OF AN OPENED BOOK — intentionally EMPTY.
   The real sub-folders will be injected here from Google Drive
   later:  window.TAYSIR_FOLDER_ITEMS = [{ id, name }, ...]
   or by returning them from window.TAYSIR_LOAD_FOLDER(ctx).
   No sample / dummy items are defined on purpose.
   ------------------------------------------------------------ */
window.TAYSIR_FOLDER_ITEMS = [];

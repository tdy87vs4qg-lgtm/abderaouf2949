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
   SUBSCRIPTION GATE  /  بوابة الاشتراك
   ------------------------------------------------------------
   PURE UI LAYER — no auth/session logic is implemented here.
   It only *reads* the subscription state that the real app
   already exposes, and decides whether to show the glass banner.

   Resolution order (first answer wins):
     1) window.TAYSIR_IS_SUBSCRIBED            (boolean or function)
     2) window.TAYSIR_SESSION.isSubscribed / .subscribed / .subscription.active
     3) window.TAYSIR_USER.isSubscribed / .subscribed
     4) localStorage "taysir-subscribed" === "true"
     5) URL flag ?sub=1 / ?sub=0                (preview / QA only)
     6) default → NOT subscribed  (the banner is shown)

   To plug the real backend in: set window.TAYSIR_IS_SUBSCRIBED
   (or window.TAYSIR_SESSION) before js/app.js runs. Nothing else
   in the UI has to change.
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

  /* where the "اشترك الآن" button points (leave empty to keep it inert) */
  subscribeUrl: "",

  /* read-only state resolver — never writes anything */
  isSubscribed: function () {
    var v = window.TAYSIR_IS_SUBSCRIBED;
    if (typeof v === "function") { try { v = v(); } catch (e) { v = undefined; } }
    if (typeof v === "boolean") return v;

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

    try {
      var ls = localStorage.getItem("taysir-subscribed");
      if (ls === "true")  return true;
      if (ls === "false") return false;
    } catch (e) { /* storage unavailable */ }

    try {
      var q = new URLSearchParams(window.location.search).get("sub");
      if (q === "1") return true;
      if (q === "0") return false;
    } catch (e) { /* ignore */ }

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

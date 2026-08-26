import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BrandLoader, { InlineSpinner } from '../components/BrandLoader'
import ThemeToggle from '../components/ThemeToggle'
import { LazyAnimatePresence, M } from '../lib/lazyMotion'
import { useSession } from '../lib/useSession'
import './home.css'

/**
 * HomePage — "Playful Cream & Green".
 *
 * ONE friendly screen, built on the two primary brand colours:
 * #469C59 (green) and #FAF7ED (warm cream).
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ تيسير                                     ☰  │   ← the only chrome
 *   │                                              │
 *   │                 طريقك نحو                     │
 *   │              النجاح و التفوق                   │  ← green + underline
 *   │             ﹏﹏﹏﹏﹏﹏﹏﹏                      │  ← hand-drawn SVG
 *   │              عام الباكالوريا                   │
 *   │                                              │
 *   │   [ الملفات ]  [ خطط التميز ]  [ النصائح ]     │
 *   │                                              │
 *   │ ─────────────────────────────────────────    │
 *   └──────────────────────────────────────────────┘
 *
 * The eyebrow ("منصّة البكالوريا") and the old lede were removed; the hero
 * is now the three centred lines above, with a wobbly chalk-style stroke
 * under the green line (an inline SVG path, never a border-bottom).
 *
 * Everything visual lives in `home.css`, scoped under `.home-quiet`:
 * the minimal double grid, the two cartoon blobs, the iOS frosted menu
 * material, and the card micro-interactions.
 *
 * IMPORTANT — this file touches NO session, auth, guard, crypto or drive
 * logic. It only *reads* the existing `useSession()` hook to decide where
 * the files card should point (library when signed in, login otherwise),
 * exactly as SiteHeader already does.
 *
 * ── THE "FROZEN APP" FIX ──────────────────────────────────────────────
 * `/library` is a SEPARATE server-rendered page, so entering it is a full
 * document load, not a client route change. Two things used to make that
 * feel like a freeze:
 *
 *   1. THE DOUBLE TRIP. The files card resolved its target from
 *      `session.authenticated`, which is `false` for the first few hundred
 *      ms while `/api/auth/me` is still in flight. A signed-in visitor who
 *      tapped during that window was sent to `/login` first, and only then
 *      bounced on to `/library` — two full page loads instead of one.
 *      FIX: the card is GUARDED on `session.loading`. While the probe is
 *      unresolved it resolves NO target at all: it renders as an inert
 *      element with a small spinner in place of the "ادخل" chip, and it
 *      only becomes a real link once `loading === false`.
 *
 *   2. THE BLANK WAIT. Once the navigation does start, the browser keeps
 *      the old document until the new one arrives — and the SPA had nothing
 *      to show for it. FIX: tapping the card raises `entering`, which
 *      paints a full-screen <BrandLoader variant="overlay" /> so the wait
 *      is branded instead of blank.
 *
 * Nothing about the server-side gate, the session hook, the auth flow or
 * the library itself is changed — this is purely what the UI shows while
 * it waits.
 */

/* Reveal timings — short, soft, GPU-only. Shared so the whole screen
   settles as one gesture rather than a sequence of separate animations. */
const EASE_OUT = [0.32, 0.72, 0, 1] as const
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease: EASE_OUT },
})

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const burgerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Read-only session probe (same hook the header uses). Signed-in visitors
  // go straight to the library; everyone else is routed through /login, which
  // keeps the real server-side gate as the single source of truth.
  const session = useSession()

  /* ── THE GUARD ────────────────────────────────────────────────────
     While the /me probe is in flight we do not yet know who this is, so we
     must not hard-code "/login" — that is what caused the login → library
     double trip for already-signed-in visitors.

     The old code solved that by rendering NO href during the probe, which
     made the card genuinely DEAD: on a slow mobile connection that is the
     whole first second of the page, and a tap in that window did nothing at
     all. The card is now always a real, clickable link:

       • A tap while the probe is still running is CAPTURED, not dropped:
         the branded overlay goes up immediately (so the tap is visibly
         acknowledged) and the intent is remembered. The moment /me answers,
         we navigate to the destination the SERVER reported.
       • `href` is still a real URL (/library) so long-press / middle-click /
         "open in new tab" behave, and so the element is a true link for
         assistive tech.

     No auth decision is made here: the destination always comes from the
     server's own /me answer, and every piece of content behind it stays
     gated server-side. */
  const sessionPending = session.loading
  const PENDING_HREF = '/library'
  const filesHref = sessionPending
    ? PENDING_HREF
    : session.authenticated
      ? session.destination || '/library'
      : '/login'
  // Only the server-rendered library is a real page outside the SPA, so only
  // that one is a full document navigation.
  const filesIsExternal = !sessionPending && session.authenticated

  /* ── THE ENTRY OVERLAY ────────────────────────────────────────────
     Raised the moment a full page navigation to /library starts, so the
     hand-off is a branded loader rather than a blank white screen. */
  const [entering, setEntering] = useState(false)

  // If the navigation never completes (back / bfcache restore, a cancelled
  // load, or the tab being re-shown), drop the overlay so the page can never
  // be left stuck behind it.
  useEffect(() => {
    if (!entering) return
    const clear = () => setEntering(false)
    window.addEventListener('pageshow', clear)
    window.addEventListener('popstate', clear)
    return () => {
      window.removeEventListener('pageshow', clear)
      window.removeEventListener('popstate', clear)
    }
  }, [entering])

  const beginEntering = useCallback(() => setEntering(true), [])

  /* ── DEFERRED ENTRY (the tap that used to be swallowed) ───────────
     Set when the visitor taps the files entry point BEFORE the /me probe
     has answered. We acknowledge the tap instantly (overlay up) and park
     the intent here; the effect below completes it as soon as the server
     tells us where this visitor belongs. */
  const navigate = useNavigate()
  const [pendingEntry, setPendingEntry] = useState(false)

  // Capture a tap made during the probe window: never let it do nothing.
  const requestEntry = useCallback(
    (event: { preventDefault: () => void }) => {
      // The probe is still running — take over the click and remember it.
      event.preventDefault()
      setMenuOpen(false)
      setPendingEntry(true)
      setEntering(true)
    },
    [],
  )

  // The probe answered while an intent was parked → complete the journey to
  // whichever destination the SERVER reported for this visitor.
  useEffect(() => {
    if (!pendingEntry || sessionPending) return
    setPendingEntry(false)
    if (session.authenticated) {
      // Real page outside the SPA → full document navigation (overlay stays
      // up until the browser paints the library).
      window.location.assign(session.destination || '/library')
    } else {
      // Confirmed anonymous → the SPA login route, in-app, no reload.
      setEntering(false)
      navigate('/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEntry, sessionPending, session.authenticated, session.destination])

  /* ── The page ground ─────────────────────────────────────────────
     Flag <html> while home is mounted so the overscroll area, the mobile
     URL bar and the scrollbar match the pristine white / near-black
     ground instead of the site's gray. Cleaned up on unmount. */
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-page', 'home')
    return () => root.removeAttribute('data-page')
  }, [])

  /* ── Menu dismissal: Escape, outside pointer, and focus return ──── */
  useEffect(() => {
    if (!menuOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setMenuOpen(false)
        burgerRef.current?.focus()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || burgerRef.current?.contains(target)) return
      setMenuOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menuOpen])

  return (
    <div className="home-quiet" dir="rtl">
      {/* ── The grid. Fixed, masked, purely decorative. ───────────── */}
      <div className="hq-canvas" aria-hidden="true" />

      {/* ── THE ENTRY LOADER ──────────────────────────────────────────
          Full-screen, branded, and only ever mounted while a real full
          page load to the library is under way. */}
      {entering && <BrandLoader variant="overlay" label="جارٍ فتح المكتبة…" />}

      {/* ── TOP BAR ───────────────────────────────────────────────────
          RTL like the app header (SiteHeader), so the تيسير wordmark sits
          in the SAME corner in both places: the start edge — top-RIGHT —
          with the ☰ at the end edge (top-left). One brand, one anchor. */}
      <header className="hq-bar" dir="rtl">
        <M.div {...rise(0.05)} style={{ display: 'inline-flex' }}>
          <Link to="/" className="hq-brand" aria-label="تيسير — الصفحة الرئيسية">
            تيسير
          </Link>
        </M.div>

        <M.div {...rise(0.1)} style={{ position: 'relative', display: 'inline-flex' }}>
          {/* ── THE HAMBURGER ──────────────────────────────────────────
              Three stacked horizontal rules, clean and minimal, in the
              brand green. When the panel opens the lines morph into a
              close mark (top and bottom rotate onto each other, the
              middle fades) — one gesture, transform-only, so it stays
              composited. Same button, same handler, same a11y contract
              as the ⋮ it replaces. */}
          <button
            ref={burgerRef}
            type="button"
            className="hq-burger"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-controls={menuId}
          >
            <span className="hq-burger__lines" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>

          <LazyAnimatePresence>
            {menuOpen && (
              <>
                {/* A whisper of a scrim — enough to catch the outside tap
                    and lift the sheet, never enough to darken the page. */}
                <M.div
                  key="hq-scrim"
                  className="hq-menu-scrim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  aria-hidden="true"
                />

                {/* The panel: one iOS frosted sheet that fades in while it
                    slides down and scales up a hair from the ☰ corner. The
                    items are stacked vertically and each one settles a beat
                    after the one above it (a pure CSS stagger in home.css),
                    which is what makes the open read as a sheet unfolding
                    rather than a box appearing.

                    SAME items, SAME links, SAME auth conditions as before —
                    only the material and the motion were beautified. */}
                <M.div
                  key="hq-menu"
                  ref={menuRef}
                  id={menuId}
                  role="menu"
                  dir="rtl"
                  className="hq-menu"
                  initial={{ opacity: 0, scale: 0.96, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: -8 }}
                  transition={{ duration: 0.34, ease: EASE_OUT }}
                >
                  {/* SAME three states as the 01 card, deliberately, and via
                      the SAME `requestEntry` handler, so the two entry points
                      can never disagree. This row used to read "تسجيل الدخول"
                      (→ /login) while the probe was in flight, so an
                      already-signed-in visitor who opened the menu early was
                      sent to login only to be bounced back to the library —
                      the double round-trip. It now reads "المكتبة" and defers
                      to the server's own answer. */}
                  {sessionPending ? (
                    <a
                      href={filesHref}
                      role="menuitem"
                      className="hq-menu-item"
                      aria-busy="true"
                      onClick={requestEntry}
                    >
                      <span>المكتبة</span>
                      <MenuChevron />
                    </a>
                  ) : filesIsExternal && filesHref ? (
                    <a
                      href={filesHref}
                      role="menuitem"
                      className="hq-menu-item"
                      onClick={beginEntering}
                    >
                      <span>المكتبة</span>
                      <MenuChevron />
                    </a>
                  ) : (
                    <Link
                      to="/login"
                      role="menuitem"
                      className="hq-menu-item"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>تسجيل الدخول</span>
                      <MenuChevron />
                    </Link>
                  )}

                  {!session.authenticated && (
                    <Link
                      to="/signup"
                      role="menuitem"
                      className="hq-menu-item"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>إنشاء حساب</span>
                      <MenuChevron />
                    </Link>
                  )}

                  <Link
                    to="/subscription"
                    role="menuitem"
                    className="hq-menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>ماذا ستحصل؟</span>
                    <MenuChevron />
                  </Link>

                  <div className="hq-menu-sep" aria-hidden="true" />

                  <div className="hq-menu-row">
                    <span>المظهر</span>
                    <ThemeToggle />
                  </div>
                </M.div>
              </>
            )}
          </LazyAnimatePresence>
        </M.div>
      </header>

      {/* ── CONTENT ──────────────────────────────────────────────── */}
      <main className="hq-main">
        {/* ── THE HERO ───────────────────────────────────────────────
            Three lines, stacked and centred:

              طريقك نحو          ← quiet opener
              النجاح و التفوق     ← GREEN, largest, hand-drawn underline
              عام الباكالوريا     ← ink, the closing statement

            The two blobs behind are pure decoration (cartoon "sticker"
            shapes at ~8% green) and are hidden from assistive tech. */}
        <M.div className="hq-hero" {...rise(0.16)}>
          <span className="hq-hero__blob hq-hero__blob--a" aria-hidden="true" />
          <span className="hq-hero__blob hq-hero__blob--b" aria-hidden="true" />

          <h1 className="hq-hero__stack">
            <span className="hq-hero__line-1">طريقك نحو</span>

            {/* Line 2 owns the underline: the SVG is absolutely positioned
                inside this inline-block span, so it stretches to the exact
                width of the glyphs rather than the column. */}
            <span className="hq-hero__line-2">
              النجاح و التفوق
              <HandDrawnUnderline />
            </span>

            <span className="hq-hero__line-3">عام الباكالوريا</span>
          </h1>
        </M.div>

        {/* ── THE THREE CARDS ─────────────────────────────────────── */}
        <M.div className="hq-cards" {...rise(0.38)}>
          {/* 01 — the one live destination.

              THREE states, in the order they actually occur:
                a) session still resolving → a REAL, CLICKABLE link. It is
                   never inert: the old version rendered no href at all, so
                   an early tap (the common case on mobile, where the probe
                   is still in flight) was silently swallowed and the card
                   felt broken. It still shows the quiet pending indicator,
                   but the tap is now acknowledged instantly and replayed
                   against the server's answer — so there is still no
                   login → library double trip.
                b) signed in → a real <a>, i.e. a full page load into the
                   server-rendered library, with the branded overlay raised
                   on click so the wait is never blank.
                c) signed out → the SPA /login route, unchanged. */}
          {sessionPending ? (
            <a
              href={filesHref}
              className="hq-card hq-card--link"
              aria-busy="true"
              onClick={requestEntry}
            >
              <CardHead index="01" title="جزء الملفات" note="الدروس والملخّصات والتمارين المصحّحة." />
              <div className="hq-card__foot">
                <InlineSpinner label="لحظة…" />
              </div>
            </a>
          ) : filesIsExternal && filesHref ? (
            <a href={filesHref} className="hq-card hq-card--link" onClick={beginEntering}>
              <CardHead index="01" title="جزء الملفات" note="الدروس والملخّصات والتمارين المصحّحة." />
              <CardFoot label="ادخل" />
            </a>
          ) : (
            <Link to={filesHref || '/login'} className="hq-card hq-card--link">
              <CardHead index="01" title="جزء الملفات" note="الدروس والملخّصات والتمارين المصحّحة." />
              <CardFoot label="ادخل" />
            </Link>
          )}

          {/* 02 / 03 — elegant, but unmistakably inert */}
          <div className="hq-card hq-card--disabled" aria-disabled="true">
            <CardHead index="02" title="خطط التميز" note="برنامج مراجعة أسبوعي مُنظّم." />
            <div className="hq-card__foot">
              <span className="hq-card__chip">قريبًا</span>
            </div>
          </div>

          <div className="hq-card hq-card--disabled" aria-disabled="true">
            <CardHead index="03" title="النصائح" note="طرائق مراجعة وإدارة الوقت." />
            <div className="hq-card__foot">
              <span className="hq-card__chip">قريبًا</span>
            </div>
          </div>
        </M.div>
      </main>

      {/* ── FOOT ─────────────────────────────────────────────────── */}
      <M.footer className="hq-foot" {...rise(0.46)}>
        <span>تيسير — منصّة تعليمية للبكالوريا</span>
        <a
          href="https://www.tiktok.com/@abderahmane.lovenature"
          target="_blank"
          rel="noreferrer"
        >
          تواصل معنا
        </a>
      </M.footer>
    </div>
  )
}

/* ── The hand-drawn underline ───────────────────────────────────────
   A chalk / marker sweep under «النجاح و التفوق» — deliberately NOT a
   border-bottom. Two overlapping paths drawn with round caps:

     1. the confident main stroke — it rises, dips, rises again, and
        overshoots slightly past both ends the way a real hand does;
     2. a fainter second pass ("chalk dust") offset a couple of units
        below and traced at a slightly different amplitude, which is what
        reads as hand-made rather than as a decorative wave.

   `preserveAspectRatio="none"` lets the path stretch to the width of the
   Arabic glyphs, while `vector-effect: non-scaling-stroke` (in the CSS)
   keeps the stroke weight honest at any width. Colour comes from
   `currentColor`, which the CSS pins to the brand green #469C59. */
function HandDrawnUnderline() {
  return (
    <svg
      className="hq-hero__underline"
      viewBox="0 0 300 22"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* main sweep — imperfect on purpose */}
      <path
        d="M3 14.5C26 9.8 49 7.6 74 8.4c25 .9 45 4.4 70 5 25 .7 47-2.4 71-5.6 24-3.2 55-3.9 82-1.2"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the fainter chalk pass */}
      <path
        className="hq-chalk"
        d="M11 19.4C38 16.2 62 14.8 88 15.4c26 .7 44 3 68 2.7 24-.3 50-2.9 76-5.4"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── The menu chevron ───────────────────────────────────────────────
   A 1.25px hairline chevron at the end of every menu row. Purely an
   affordance hint: it sits faint at rest and slides a couple of pixels
   forward (leftward, because the panel is RTL) on hover / focus. */
function MenuChevron() {
  return (
    <span className="hq-menu-item__chev" aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m14 6-6 6 6 6" />
      </svg>
    </span>
  )
}

/* ── Card internals ─────────────────────────────────────────────────
   Kept as tiny local components so the three cards stay structurally
   identical and the markup above reads as the layout it describes. */

function CardHead({ index, title, note }: { index: string; title: string; note: string }) {
  return (
    <div>
      <span className="hq-card__index">{index}</span>
      <h2 className="hq-card__title" style={{ marginTop: '0.6rem' }}>
        {title}
      </h2>
      <p className="hq-card__note">{note}</p>
    </div>
  )
}

function CardFoot({ label }: { label: string }) {
  return (
    <div className="hq-card__foot">
      <span className="hq-card__chip">{label}</span>
      <span className="hq-card__arrow" aria-hidden="true">
        {/* A 1.25px hairline arrow — drawn, not iconographic. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      </span>
    </div>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
 *   │ تيسير                                     ⋮  │   ← the only chrome
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
  const dotsRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Read-only session probe (same hook the header uses). Signed-in visitors
  // go straight to the library; everyone else is routed through /login, which
  // keeps the real server-side gate as the single source of truth.
  const session = useSession()
  const filesHref = session.authenticated ? session.destination || '/library' : '/login'
  const filesIsExternal = session.authenticated

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
        dotsRef.current?.focus()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || dotsRef.current?.contains(target)) return
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

      {/* ── TOP BAR ───────────────────────────────────────────────────
          Laid out LTR so the brand sits physically top-LEFT and the ⋮
          top-RIGHT as specified, while the Arabic inside stays RTL. */}
      <header className="hq-bar" dir="ltr">
        <M.div {...rise(0.05)} style={{ display: 'inline-flex' }}>
          <Link to="/" className="hq-brand" dir="rtl" aria-label="تيسير — الصفحة الرئيسية">
            تيسير
          </Link>
        </M.div>

        <M.div {...rise(0.1)} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            ref={dotsRef}
            type="button"
            className="hq-dots"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-controls={menuId}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
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

                {/* The iOS sheet: buttery scale + fade from the ⋮ corner.
                    Only opacity/transform animate, so it stays composited. */}
                <M.div
                  key="hq-menu"
                  ref={menuRef}
                  id={menuId}
                  role="menu"
                  dir="rtl"
                  className="hq-menu"
                  initial={{ opacity: 0, scale: 0.94, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: -6 }}
                  transition={{ duration: 0.34, ease: EASE_OUT }}
                >
                  {filesIsExternal ? (
                    <a href={filesHref} role="menuitem" className="hq-menu-item">
                      <span>المكتبة</span>
                    </a>
                  ) : (
                    <Link
                      to="/login"
                      role="menuitem"
                      className="hq-menu-item"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>تسجيل الدخول</span>
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
                    </Link>
                  )}

                  <Link
                    to="/subscription"
                    role="menuitem"
                    className="hq-menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>ماذا ستحصل؟</span>
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
          {/* 01 — the one live destination */}
          {filesIsExternal ? (
            <a href={filesHref} className="hq-card hq-card--link">
              <CardHead index="01" title="جزء الملفات" note="الدروس والملخّصات والتمارين المصحّحة." />
              <CardFoot label="ادخل" />
            </a>
          ) : (
            <Link to={filesHref} className="hq-card hq-card--link">
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
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the fainter chalk pass */}
      <path
        className="hq-chalk"
        d="M11 19.4C38 16.2 62 14.8 88 15.4c26 .7 44 3 68 2.7 24-.3 50-2.9 76-5.4"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

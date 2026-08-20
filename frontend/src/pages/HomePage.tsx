import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { LazyAnimatePresence, M } from '../lib/lazyMotion'
import { useSession } from '../lib/useSession'
import './home.css'

/**
 * HomePage — "Quiet Luxury / Scandinavian Minimalist".
 *
 * A complete structural rebuild, not a restyle. The page is now ONE calm
 * screen instead of six scrolling acts:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ تيسير                                     ⋮  │   ← the only chrome
 *   │                                              │
 *   │   — منصّة البكالوريا                          │
 *   │   headline · lede                            │
 *   │                                              │
 *   │   [ الملفات ]  [ خطط التميز ]  [ النصائح ]     │
 *   │                                              │
 *   │ ─────────────────────────────────────────    │
 *   └──────────────────────────────────────────────┘
 *
 * Everything visual lives in `home.css`, scoped under `.home-quiet`:
 * the faint double grid, the iOS frosted menu material, and the card
 * micro-interactions. Palette is strictly monochrome.
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
        <M.p className="hq-eyebrow" {...rise(0.16)}>
          منصّة البكالوريا
        </M.p>

        <M.h1 className="hq-title" {...rise(0.22)}>
          كل ما تحتاجه للبكالوريا،
          <br />
          <em>في مكان واحد هادئ.</em>
        </M.h1>

        <M.p className="hq-lede" {...rise(0.3)}>
          دروس، ملخّصات، وتمارين مصحّحة — مرتّبة بعناية حتى يبقى تركيزك على المراجعة وحدها.
        </M.p>

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

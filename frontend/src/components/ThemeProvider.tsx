import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PropsWithChildren } from 'react'

export type Theme = 'dark' | 'light'

/** Optional origin (viewport px) for a circular-reveal switch. */
type ToggleOrigin = { x: number; y: number }

type ThemeContextValue = {
  theme: Theme
  setTheme: (t: Theme, origin?: ToggleOrigin) => void
  toggleTheme: (origin?: ToggleOrigin) => void
}

const STORAGE_KEY = 'taysir-theme'

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Reads the persisted theme choice, falling back to the OS preference and
 * finally to the site's native dark mode. Runs only in the browser.
 */
function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore storage errors (private mode etc.) */
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Applies the theme to <html>: sets `data-theme` (drives the CSS token
 * overrides) and syncs `color-scheme` + the browser theme-color meta so
 * native UI (scrollbars, mobile URL bar) matches the palette.
 */
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  // Kept in lockstep with the pre-paint script in index.html and the home
  // page's ground, so the mobile URL bar never flashes a different colour.
  // Light = the brand cream #FAF7ED; dark = the green-leaning near-black.
  if (meta) meta.setAttribute('content', theme === 'light' ? '#faf7ed' : '#12160f')
}

/**
 * Runs a GPU-friendly **circular reveal** using the native View Transitions
 * API when available. The outgoing theme snapshot stays put while the new
 * theme's paint is unveiled by a `clip-path` circle expanding from the point
 * the user clicked (the toggle). Only `clip-path` on ONE pseudo-layer animates
 * — no layout, no per-element work — so it stays smooth on mobile.
 *
 * When the View Transitions API is unavailable, we add a short body class that
 * cross-fades the palette via cheap paint-only transitions (already declared
 * in styles.css). Reduced-motion users get an instant swap with no animation.
 */
function commitThemeWithTransition(theme: Theme, origin?: ToggleOrigin) {
  if (typeof document === 'undefined') {
    applyTheme(theme)
    return
  }

  const reduce = prefersReducedMotion()

  // Reduced motion → instant, no effect.
  if (reduce) {
    applyTheme(theme)
    return
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> }
  }

  // Preferred path: native circular reveal via View Transitions API.
  if (typeof doc.startViewTransition === 'function') {
    const root = document.documentElement
    // Expand from the toggle if we have coordinates, else the top-left corner.
    const x = origin?.x ?? window.innerWidth - 48
    const y = origin?.y ?? 48
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )

    root.classList.add('theme-vt')
    const transition = doc.startViewTransition(() => {
      applyTheme(theme)
    })

    transition.ready
      .then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 420,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        )
      })
      .catch(() => {
        /* animation not critical — palette already applied */
      })
      .finally(() => {
        // Clean the flag shortly after the transition window.
        window.setTimeout(() => root.classList.remove('theme-vt'), 480)
      })
    return
  }

  // Fallback path: paint-only cross-fade (transitions defined in styles.css).
  const root = document.documentElement
  root.classList.add('theme-crossfade')
  applyTheme(theme)
  window.setTimeout(() => root.classList.remove('theme-crossfade'), 460)
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(() => readInitialTheme())
  // Tracks whether the current change came from a user toggle (animate) vs. the
  // initial mount (apply instantly, no transition).
  const mounted = useRef(false)

  // Apply instantly on first mount (no animation on page load).
  useEffect(() => {
    applyTheme(theme)
    mounted.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const setTheme = useCallback(
    (next: Theme, origin?: ToggleOrigin) => {
      setThemeState((prev) => {
        if (prev === next) return prev
        persist(next)
        commitThemeWithTransition(next, origin)
        return next
      })
    },
    [persist],
  )

  const toggleTheme = useCallback(
    (origin?: ToggleOrigin) => {
      setThemeState((prev) => {
        const next: Theme = prev === 'dark' ? 'light' : 'dark'
        persist(next)
        commitThemeWithTransition(next, origin)
        return next
      })
    },
    [persist],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

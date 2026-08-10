/**
 * lazyMotion — keep Framer Motion OFF the first-paint critical path.
 *
 * Framer Motion is the single biggest dependency (~133 kB). Previously every
 * shell component (App, SiteHeader, ThemeToggle, PageTransition, Reveal)
 * imported it *statically*, so the entry chunk pulled framer-motion in as a
 * render-blocking `modulepreload` before a single pixel could paint.
 *
 * This module lets those shell components import framer-motion **lazily**: the
 * heavy library is fetched with a dynamic `import()` AFTER the app has mounted
 * and painted. Until it resolves, the animated wrappers degrade to plain DOM
 * elements (already in their "animate"/visible state), so:
 *   • nothing is blocked on first paint,
 *   • no animation/feature is removed — motion simply "turns on" a beat later,
 *   • there is no layout shift (the static fallback renders the final state).
 *
 * The single dynamic import is shared/cached across every consumer, so
 * framer-motion is downloaded once and reused everywhere.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type PropsWithChildren,
  type ReactNode,
} from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */

type MotionModule = typeof import('framer-motion')

let motionPromise: Promise<MotionModule> | null = null
let motionModule: MotionModule | null = null

/** Load framer-motion once, lazily, and cache the module + promise. */
export function loadMotion(): Promise<MotionModule> {
  if (motionModule) return Promise.resolve(motionModule)
  if (!motionPromise) {
    motionPromise = import('framer-motion').then((mod) => {
      motionModule = mod
      return mod
    })
  }
  return motionPromise
}

/**
 * Hook: returns the framer-motion module once it has loaded (else null).
 * Kicks off the (deferred) load on mount, after first paint.
 */
export function useMotion(): MotionModule | null {
  const [mod, setMod] = useState<MotionModule | null>(motionModule)

  useEffect(() => {
    if (mod) return
    let alive = true
    // Defer to idle time so we never contend with the first paint / hydration.
    const kick = () => {
      loadMotion().then((m) => {
        if (alive) setMod(m)
      })
    }
    const ric: any = (window as any).requestIdleCallback
    const id = ric ? ric(kick, { timeout: 1200 }) : window.setTimeout(kick, 200)
    return () => {
      alive = false
      const cic: any = (window as any).cancelIdleCallback
      if (ric && cic) cic(id)
      else clearTimeout(id as number)
    }
  }, [mod])

  return mod
}

// ── AnimatePresence facade ────────────────────────────────────────────────
// Before framer-motion loads, just render children (no exit animations yet).
export function LazyAnimatePresence({
  children,
  mode,
  initial,
}: PropsWithChildren<{ mode?: 'sync' | 'wait' | 'popLayout'; initial?: boolean }>) {
  const mod = useMotion()
  if (!mod) return <>{children}</>
  const AP = mod.AnimatePresence as ComponentType<any>
  return (
    <AP mode={mode} initial={initial}>
      {children}
    </AP>
  )
}

// ── motion.<tag> facade ───────────────────────────────────────────────────
// A tiny factory that returns a component which renders a plain element in the
// element's FINAL (animate) state until framer-motion is ready, then swaps to
// the real `motion.<tag>` so entrance/exit animations run. Motion-only props
// (initial/animate/exit/transition/variants/whileInView/…) are stripped from
// the static fallback so they never hit the DOM.
const MOTION_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'whileHover',
  'whileTap',
  'whileInView',
  'whileFocus',
  'whileDrag',
  'viewport',
  'layout',
  'layoutId',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'onAnimationComplete',
  'custom',
  'style',
])

function splitProps(props: Record<string, any>) {
  const dom: Record<string, any> = {}
  for (const key of Object.keys(props)) {
    if (key === 'children') continue
    if (MOTION_PROPS.has(key)) {
      // Preserve inline style (non-animated CSS) on the static fallback.
      if (key === 'style' && props.style && typeof props.style === 'object') {
        dom.style = props.style
      }
      continue
    }
    dom[key] = props[key]
  }
  return dom
}

function makeLazyTag<T extends keyof HTMLElementTagNameMap>(tag: T) {
  return function LazyMotionTag(props: Record<string, any> & { children?: ReactNode }) {
    const mod = useMotion()
    if (mod) {
      const MotionEl = (mod.motion as any)[tag] as ComponentType<any>
      return <MotionEl {...props} />
    }
    // Static fallback: plain element, motion props stripped, final state shown.
    const Tag = tag as any
    return <Tag {...splitProps(props)}>{props.children}</Tag>
  }
}

/** Lazy stand-ins for the framer-motion tags used across the shell. */
export const M = {
  div: makeLazyTag('div'),
  span: makeLazyTag('span'),
  main: makeLazyTag('main'),
  nav: makeLazyTag('nav'),
  section: makeLazyTag('section'),
  header: makeLazyTag('header'),
  ul: makeLazyTag('ul'),
  li: makeLazyTag('li'),
  a: makeLazyTag('a'),
  button: makeLazyTag('button'),
  p: makeLazyTag('p'),
}

/**
 * useReducedMotion facade — framer-motion's version relies on its own context,
 * but the underlying signal is just the media query. We read it directly so
 * shell components don't have to import framer-motion just for this hook.
 */
const ReducedMotionContext = createContext<boolean | null>(null)

export function useLazyReducedMotion(): boolean | null {
  const ctx = useContext(ReducedMotionContext)
  const [reduce, setReduce] = useState<boolean | null>(() => {
    if (ctx != null) return ctx
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduce
}

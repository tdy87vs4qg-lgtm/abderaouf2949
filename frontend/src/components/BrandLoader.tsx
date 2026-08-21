/**
 * BrandLoader — the ONE real loading indicator for the whole app.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Two places used to show a blank white screen, which reads as a frozen app:
 *
 *   1. `<Suspense fallback={<div className="route-loading" aria-hidden />}>`
 *      in App.tsx — an empty, aria-hidden box while a lazy route chunk is
 *      still downloading. Nothing to look at, nothing announced.
 *   2. The jump from the React SPA into `/library`, which is a *separate
 *      server-rendered page*, i.e. a full document load. The browser tears
 *      the SPA down and paints nothing until the new document arrives.
 *
 * In both cases the visitor sees white. This component fills that gap with
 * the brand instead: the تيسير wordmark with a soft pulse plus a thin
 * indeterminate ring, on the green / cream palette. It is intentionally the
 * same visual language as the static `#app-boot` shell in `index.html`, so
 * boot → route change → library entry all feel like one continuous handoff.
 *
 * TWO VARIANTS
 *   • `variant="route"`   (default) — fills the route slot; used as the
 *                          Suspense fallback so the layout never jumps.
 *   • `variant="overlay"` — fixed, on top of everything, frosted. Used the
 *                          moment a full page navigation to /library starts,
 *                          while the old document is still on screen.
 *
 * ACCESSIBILITY: `role="status"` + `aria-live="polite"` so screen readers
 * announce the wait, and the label is real text (not an aria-hidden shell).
 * Motion is CSS-only (opacity/transform) and fully disabled under
 * `prefers-reduced-motion`.
 *
 * This component contains NO session, auth or routing logic whatsoever — it
 * only renders. Deciding *when* to show it is the caller's job.
 */

type BrandLoaderProps = {
  /** Visible + announced wait message. */
  label?: string
  /** `route` fills the page slot; `overlay` floats above the current page. */
  variant?: 'route' | 'overlay'
}

export default function BrandLoader({
  label = 'جارٍ التحميل…',
  variant = 'route',
}: BrandLoaderProps) {
  return (
    <div
      className={`brand-loader brand-loader--${variant}`}
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="brand-loader__inner">
        <span className="brand-loader__brand">تيسير</span>
        <span className="brand-loader__ring" aria-hidden="true" />
        <span className="brand-loader__label">{label}</span>
      </div>
    </div>
  )
}

/**
 * A 14px inline ring for *in-place* pending states (e.g. the files card while
 * the session probe is still resolving). Same green, same timing — just small
 * enough to sit inside a chip without changing its box.
 */
export function InlineSpinner({ label }: { label?: string }) {
  return (
    <span className="inline-spinner" role="status" aria-live="polite">
      <span className="inline-spinner__ring" aria-hidden="true" />
      {label ? <span className="inline-spinner__label">{label}</span> : null}
    </span>
  )
}

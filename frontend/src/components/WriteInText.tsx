import { useEffect, useMemo, useRef, useState } from 'react'
import type { ElementType, ReactNode } from 'react'

type Segment = {
  text: string
  /** mark a portion as the emphasised brand word */
  brand?: boolean
}

type WriteInTextProps = {
  segments: Segment[]
  as?: ElementType
  className?: string
  /** where the reveal starts relative to viewport (kept for API compatibility) */
  start?: string
  ariaLabel?: string
  /**
   * When true, the text is revealed with a true left-to-right "typewriter"
   * wipe. Because the site is Arabic (RTL) the wipe is driven with a single
   * `clip-path` inset that opens from the RIGHT edge toward the left, so the
   * text appears to be written in natural reading order.
   *
   * The animation is a single GPU-composited `clip-path` on ONE element,
   * driven by one `requestAnimationFrame` loop that only mutates a CSS custom
   * property (`--wipe`). There are no per-word/per-glyph DOM nodes, no
   * `transition-delay` fan-out and no layout reads — so there is zero layout
   * thrashing and the whole reveal composites in a single pass.
   *
   * When false (default) the whole block does one cheap opacity/rise reveal.
   */
  writeIn?: boolean
  /** total duration (seconds) of the typewriter wipe when `writeIn` is on */
  duration?: number
  children?: ReactNode
}

/**
 * WriteInText
 * ------------------------------------------------------------------
 * Two reveal modes, both triggered once by a lightweight IntersectionObserver:
 *
 *  • default  → one cheap opacity + translateY rise on the whole block
 *               (long paragraphs — keeps phones smooth).
 *
 *  • writeIn  → an ultra-light RTL "typewriter" wipe. A single element is
 *               clipped with `clip-path: inset(0 0 0 var(--wipe))` where
 *               `--wipe` animates from 100% → 0%. Since `inset()`'s 4th value
 *               is the LEFT inset, shrinking it from 100→0 uncovers the line
 *               starting at the right edge (correct for RTL Arabic) and
 *               finishing at the left. Only `clip-path` changes, so the browser
 *               composites it on the GPU with no reflow and no repaint of the
 *               surrounding layout.
 *
 * Honours prefers-reduced-motion (shows instantly).
 */
export default function WriteInText({
  segments,
  as: Tag = 'p',
  className = '',
  ariaLabel,
  writeIn = false,
  duration = 1.1,
}: WriteInTextProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const wipeRef = useRef<HTMLSpanElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [shown, setShown] = useState(false)

  // Reveal-on-scroll trigger (cheap: disconnects after first intersection).
  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            observer.disconnect()
            break
          }
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Drive the typewriter wipe with ONE rAF loop mutating a single CSS var.
  useEffect(() => {
    if (!writeIn || !shown) return
    const el = wipeRef.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--wipe', '0%')
      return
    }

    const totalMs = Math.max(200, duration * 1000)
    let startTs = 0

    const tick = (ts: number) => {
      if (!startTs) startTs = ts
      const t = Math.min(1, (ts - startTs) / totalMs)
      // easeOutCubic — quick start, gentle settle (feels like handwriting).
      const eased = 1 - Math.pow(1 - t, 3)
      // 100% left-inset (fully hidden) → 0% (fully shown), opening from right.
      el.style.setProperty('--wipe', `${(1 - eased) * 100}%`)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [writeIn, shown, duration])

  // Render segments as plain inline text — NO per-word wrappers. Line breaks
  // are preserved. Arabic letter-joining/ligatures stay perfectly intact
  // because the text is never split into separate nodes.
  const rendered = useMemo(() => {
    return segments.map((seg, si) => {
      const cls = seg.brand ? 'write-in__brand' : 'write-in__plain'
      return (
        <span key={si} className={cls}>
          {seg.text.split('\n').map((line, li, arr) => (
            <span key={li}>
              {line}
              {li < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </span>
      )
    })
  }, [segments])

  return (
    <Tag
      ref={rootRef as never}
      className={`write-in ${writeIn ? 'write-in--type' : ''} ${shown ? 'write-in--shown' : ''} ${className}`}
      aria-label={ariaLabel}
    >
      {writeIn ? (
        <span ref={wipeRef} className="write-in__wipe" aria-hidden="true">
          {rendered}
        </span>
      ) : (
        <span aria-hidden="true">{rendered}</span>
      )}
    </Tag>
  )
}

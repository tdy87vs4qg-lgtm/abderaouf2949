import { useEffect, useRef, useState } from 'react'

/**
 * useBlink
 * ------------------------------------------------------------------
 * Returns a boolean that flips to `true` for a brief moment at natural,
 * irregular intervals — a believable blink. Occasionally fires a quick
 * double-blink for extra life. Pauses while `enabled` is false (e.g. when
 * the eyes are already covered by the hands).
 */
export function useBlink(enabled = true): boolean {
  const [blinking, setBlinking] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (!enabled) {
      setBlinking(false)
      return
    }

    let cancelled = false
    const clearAll = () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }

    const doBlink = (closeMs = 110) => {
      if (cancelled) return
      setBlinking(true)
      timers.current.push(window.setTimeout(() => setBlinking(false), closeMs))
    }

    const schedule = () => {
      if (cancelled) return
      // Random interval between ~2.6s and ~6s — humans blink irregularly.
      const wait = 2600 + Math.random() * 3400
      timers.current.push(
        window.setTimeout(() => {
          doBlink()
          // ~25% chance of a charming double blink
          if (Math.random() < 0.25) {
            timers.current.push(window.setTimeout(() => doBlink(90), 260))
          }
          schedule()
        }, wait),
      )
    }

    schedule()
    return () => {
      cancelled = true
      clearAll()
    }
  }, [enabled])

  return blinking
}

import { useEffect, useRef, useState } from 'react'

/**
 * useEarTwitch
 * ------------------------------------------------------------------
 * Returns a boolean that briefly flips to `true` at random, relaxed
 * intervals so the fox's ear gives an occasional lifelike flick. Pauses
 * while `enabled` is false (e.g. the fox is busy covering its eyes).
 *
 * Deliberately rarer and more irregular than the blink so the two
 * "alive" tics never look synchronised or mechanical.
 */
export function useEarTwitch(enabled = true): boolean {
  const [twitch, setTwitch] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (!enabled) {
      setTwitch(false)
      return
    }

    let cancelled = false
    const clearAll = () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }

    const schedule = () => {
      if (cancelled) return
      // Long, irregular gap: ~4s–9s between flicks.
      const wait = 4000 + Math.random() * 5000
      timers.current.push(
        window.setTimeout(() => {
          if (cancelled) return
          setTwitch(true)
          // The flick lasts about as long as the ear animation.
          timers.current.push(
            window.setTimeout(() => setTwitch(false), 600),
          )
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

  return twitch
}

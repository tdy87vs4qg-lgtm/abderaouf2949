import { useEffect, useRef, useState } from 'react'

export interface Gaze {
  /** normalised gaze offset, each axis in [-1, 1] */
  x: number
  y: number
}

/**
 * useCursorGaze
 * ------------------------------------------------------------------
 * Tracks the global mouse position and reports a normalised gaze vector
 * relative to a reference element (the mascot's head). The vector is
 * clamped to [-1, 1] on each axis so consumers can multiply it by their
 * own range. Falls back gracefully on touch devices (no pointer = centre).
 *
 * We keep the raw target in a ref and smooth it toward the pointer on each
 * animation frame, so the eyes glide instead of snapping.
 */
export function useCursorGaze(
  ref: React.RefObject<HTMLElement | null>,
  smoothing = 0.12,
): Gaze {
  const [gaze, setGaze] = useState<Gaze>({ x: 0, y: 0 })
  const target = useRef<Gaze>({ x: 0, y: 0 })
  const current = useRef<Gaze>({ x: 0, y: 0 })
  const raf = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onMove = (clientX: number, clientY: number) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      // Distance from head centre, normalised by a comfortable radius so
      // the pupils reach their extreme a bit before the pointer hits the edge.
      const nx = (clientX - cx) / (window.innerWidth * 0.5)
      const ny = (clientY - cy) / (window.innerHeight * 0.5)
      target.current = {
        x: Math.max(-1, Math.min(1, nx)),
        y: Math.max(-1, Math.min(1, ny)),
      }
    }

    const onMouse = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY)
    }

    window.addEventListener('mousemove', onMouse, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })

    const tick = () => {
      const nextX = current.current.x + (target.current.x - current.current.x) * smoothing
      const nextY = current.current.y + (target.current.y - current.current.y) * smoothing
      // Only re-render when the gaze actually moves enough to notice. This
      // avoids a React state update (and full SVG re-render) on every single
      // animation frame, which is the main perf cost of the mascot.
      if (
        Math.abs(nextX - current.current.x) > 0.002 ||
        Math.abs(nextY - current.current.y) > 0.002
      ) {
        current.current = { x: nextX, y: nextY }
        setGaze({ x: nextX, y: nextY })
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('touchmove', onTouch)
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [ref, smoothing])

  return gaze
}

import { Moon, Sun } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useTheme } from './ThemeProvider'
import { LazyAnimatePresence, M, useLazyReducedMotion } from '../lib/lazyMotion'

type ThemeToggleProps = {
  className?: string
}

/**
 * ThemeToggle — a premium sliding sun/moon switch.
 *
 * PERFORMANCE: the moving knob and the icon crossfade animate ONLY transform
 * (x / scale / rotate) and opacity — both GPU-composited — with short springs
 * (< 400ms feel). No layout properties animate. Honours prefers-reduced-motion
 * by snapping instantly. The whole control is a single <button>.
 *
 * The click's viewport coordinates are handed to the ThemeProvider so the
 * page-wide circular-reveal transition can expand from exactly this button.
 *
 * RTL: the track is laid out with the knob resting on the RIGHT for dark
 * (moon) and sliding LEFT for light (sun), matching the Arabic reading flow.
 */
export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const reduce = useLazyReducedMotion()
  const isLight = theme === 'light'

  // Knob travel distance across the track (px). In RTL the knob starts pinned
  // to the right; a negative x slides it toward the left for light mode.
  const travel = -30

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Use the geometric centre of the control as the reveal origin so the
    // circle grows symmetrically from the toggle regardless of where it was
    // tapped. Falls back to the raw pointer if the rect is unavailable.
    const rect = event.currentTarget.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    toggleTheme({ x, y })
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      onClick={handleClick}
      className={`theme-toggle ${isLight ? 'theme-toggle--light' : ''} ${className}`}
      aria-label={isLight ? 'التبديل إلى الوضع الداكن' : 'التبديل إلى الوضع الفاتح'}
      title={isLight ? 'الوضع الداكن' : 'الوضع الفاتح'}
    >
      {/* soft ambient glow that tints with the mode */}
      <span className="theme-toggle__glow" aria-hidden="true" />

      {/* sliding knob */}
      <M.span
        className="theme-toggle__knob"
        aria-hidden="true"
        initial={false}
        animate={{ x: isLight ? travel : 0 }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: 'spring', stiffness: 520, damping: 32, mass: 0.6 }
        }
      >
        <LazyAnimatePresence mode="wait" initial={false}>
          {isLight ? (
            <M.span
              key="sun"
              className="theme-toggle__icon"
              initial={reduce ? false : { rotate: -90, scale: 0.3, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { rotate: 90, scale: 0.3, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <Sun size={15} strokeWidth={2.4} />
            </M.span>
          ) : (
            <M.span
              key="moon"
              className="theme-toggle__icon"
              initial={reduce ? false : { rotate: 90, scale: 0.3, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { rotate: -90, scale: 0.3, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <Moon size={14} strokeWidth={2.4} />
            </M.span>
          )}
        </LazyAnimatePresence>
      </M.span>
    </button>
  )
}

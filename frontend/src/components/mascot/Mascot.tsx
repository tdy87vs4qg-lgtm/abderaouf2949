import { useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import { MASCOT_ASPECT } from './mascot.geometry'
import { useCursorGaze } from './useCursorGaze'
import { useBlink } from './useBlink'
import { useEarTwitch } from './useEarTwitch'
import FoxMascot from './FoxMascot'
import type { MascotState } from './types'

/* -------------------------------------------------------------------------
 * Mascot — the living wrapper around the code-drawn fox.
 * -------------------------------------------------------------------------
 * There is NO artwork file involved: `FoxMascot` draws the entire character
 * as layered SVG. This component's job is to give it life:
 *
 *   • continuous "breathing" (slow scale) + gentle sway (rotate/float)
 *   • cursor-following gaze          → useCursorGaze
 *   • natural irregular blinking     → useBlink
 *   • occasional ear twitch          → useEarTwitch
 *   • state-driven cover / peek      → passed straight to FoxMascot
 *
 * The mascot no longer takes any image `src` props — those were removed
 * along with the old PNG assets.
 * ---------------------------------------------------------------------- */

export interface MascotProps {
  state: MascotState
  className?: string
}

export default function Mascot({ state, className = '' }: MascotProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  // Gaze follows the cursor whenever the fox can actually see — idle, and
  // also while peeking (it secretly looks through the gap in its paws).
  const rawGaze = useCursorGaze(rootRef)
  const eyesActive = state === 'idle' || state === 'peeking'
  const gaze = eyesActive && !reduce ? rawGaze : { x: 0, y: 0 }

  // Blink only while fully open — never mid-cover (that would read as a twitch).
  const blinking = useBlink(state === 'idle')

  // Occasional ear flick, only when relaxed & idle.
  const earTwitch = useEarTwitch(state === 'idle')

  // Continuous "alive" breathing for the whole character — a single, subtle
  // scale loop (no rotate/translate) so it stays light on low-end phones.
  const idleAnim = useMemo(
    () => (reduce ? {} : { scale: [1, 1.02, 1] }),
    [reduce],
  )

  return (
    <div
      ref={rootRef}
      className={`relative select-none ${className}`}
      style={{ aspectRatio: `${MASCOT_ASPECT}` }}
      aria-hidden="true"
    >
      {/* Breathing / sway wrapper — animates the whole mascot as one unit.
          transform-only + willChange keeps it on the GPU compositor so the
          idle loop stays light on low-end phones. */}
      <motion.div
        className="absolute inset-0"
        animate={idleAnim}
        transition={{
          duration: 6,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'loop',
        }}
        style={{ transformOrigin: '50% 88%', willChange: 'transform' }}
      >
        <FoxMascot
          state={state}
          gaze={gaze}
          blinking={blinking}
          earTwitch={earTwitch}
          reduce={reduce}
        />
      </motion.div>
    </div>
  )
}

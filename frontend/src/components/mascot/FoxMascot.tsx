import { motion, AnimatePresence } from 'framer-motion'

import {
  VIEW_W,
  VIEW_H,
  EYE_LEFT,
  EYE_RIGHT,
  GAZE_RANGE,
  PAW_LEFT,
  PAW_RIGHT,
  PAW_LEFT_REST,
  PAW_RIGHT_REST,
  PEEK_SPREAD,
  PEEK_DROP,
  type EyeGeometry,
  type HandGeometry,
} from './mascot.geometry'
import type { MascotState } from './types'
import type { Gaze } from './useCursorGaze'

/* -------------------------------------------------------------------------
 * FoxMascot — a 100% code-drawn cartoon fox.
 * -------------------------------------------------------------------------
 * NO image files are used anywhere. The whole character is vector art built
 * from independent, separately-animated layers:
 *
 *   • <Ears>   – two triangular ears, the near one twitches on idle.
 *   • <Head>   – face silhouette, cheek ruffs, white muzzle mask.
 *   • <Eyes>   – white orbs + gaze-tracking pupils + blink lids + brows.
 *   • <Snout>  – nose + happy smile.
 *   • <Paws>   – two fluffy paws that rise to cover the eyes / peek.
 *
 * Because each layer is its own <motion.g>, the breathing, blinking, gaze,
 * ear-twitch, cover and peek animations all compose cleanly and never fight.
 * ---------------------------------------------------------------------- */

/* ---- palette (kept in the platform's warm/mint spirit) ---------------- */
const FUR = '#f0873e' // warm fox orange
const FUR_DARK = '#e0722a' // shadow orange
const FUR_LIGHT = '#ffb066' // highlight orange
const CREAM = '#fff6ec' // muzzle / cheeks / chest
const CREAM_SH = '#ffe9d3' // cream shadow
const INK = '#20211f' // pupils / nose outline
const NOSE = '#3a2b28' // nose
const EAR_IN = '#3a2b28' // inner ear
const BROW = '#c85f22' // eyebrow

export interface FoxMascotProps {
  state: MascotState
  gaze: Gaze
  blinking: boolean
  earTwitch: boolean
  reduce: boolean | null
}

export default function FoxMascot({
  state,
  gaze,
  blinking,
  earTwitch,
  reduce,
}: FoxMascotProps) {
  const covering = state === 'covering' || state === 'peeking'
  const peeking = state === 'peeking'

  // The eyes are visible (and gaze/blink apply) unless the paws are flat over
  // them; while peeking the fox secretly looks through the gap.
  const eyesHidden = covering && !peeking

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="absolute inset-0 h-full w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="fox-face" cx="50%" cy="38%" r="72%">
          <stop offset="0%" stopColor={FUR_LIGHT} />
          <stop offset="62%" stopColor={FUR} />
          <stop offset="100%" stopColor={FUR_DARK} />
        </radialGradient>
        <linearGradient id="fox-muzzle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CREAM} />
          <stop offset="100%" stopColor={CREAM_SH} />
        </linearGradient>
        <radialGradient id="fox-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff9d6b" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ff9d6b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fox-paw" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={FUR_LIGHT} />
          <stop offset="100%" stopColor={FUR} />
        </linearGradient>
        <filter id="fox-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>

      {/* soft ground shadow — static, grounds the floating character */}
      <ellipse cx={100} cy={190} rx={46} ry={7} fill="#0f2e2a" opacity={0.12} />

      <Ears earTwitch={earTwitch} reduce={reduce} />
      <Head />
      <Cheeks />

      <Eyes
        gaze={gaze}
        blinking={blinking}
        eyesHidden={eyesHidden}
        reduce={reduce}
      />

      <Snout peeking={peeking} />

      {/* Paws mount only while covering so the springy rise replays each time. */}
      <AnimatePresence>
        {covering && (
          <Paws peeking={peeking} reduce={reduce} />
        )}
      </AnimatePresence>
    </svg>
  )
}

/* =======================================================================
 * EARS
 * ===================================================================== */
function Ears({
  earTwitch,
  reduce,
}: {
  earTwitch: boolean
  reduce: boolean | null
}) {
  return (
    <g>
      {/* viewer-left ear (static, gentle idle handled by parent breathing) */}
      <g>
        <path
          d="M60 66 C 47 40, 40 28, 44 24 C 49 20, 66 34, 74 52 Z"
          fill="url(#fox-face)"
          stroke={FUR_DARK}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <path
          d="M58 58 C 51 43, 47 34, 49 31 C 53 29, 62 40, 67 51 Z"
          fill={EAR_IN}
          opacity={0.9}
        />
      </g>

      {/* viewer-right ear — this one twitches for extra life */}
      <motion.g
        style={{ transformOrigin: '135px 40px' }}
        animate={
          reduce
            ? {}
            : earTwitch
              ? { rotate: [0, -9, 4, 0] }
              : { rotate: 0 }
        }
        transition={{ duration: 0.55, ease: 'easeInOut' }}
      >
        <path
          d="M140 66 C 153 40, 160 28, 156 24 C 151 20, 134 34, 126 52 Z"
          fill="url(#fox-face)"
          stroke={FUR_DARK}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <path
          d="M142 58 C 149 43, 153 34, 151 31 C 147 29, 138 40, 133 51 Z"
          fill={EAR_IN}
          opacity={0.9}
        />
      </motion.g>
    </g>
  )
}

/* =======================================================================
 * HEAD — face silhouette + cheek ruffs + cream muzzle mask
 * ===================================================================== */
function Head() {
  return (
    <g>
      {/* fluffy cheek ruffs poking out on both sides */}
      <path
        d="M52 108 C 40 104, 33 112, 38 120 C 44 118, 49 116, 55 116 Z"
        fill={FUR_DARK}
      />
      <path
        d="M148 108 C 160 104, 167 112, 162 120 C 156 118, 151 116, 145 116 Z"
        fill={FUR_DARK}
      />

      {/* main face */}
      <path
        d="M100 52
           C 128 52, 150 70, 150 100
           C 150 128, 130 150, 100 150
           C 70 150, 50 128, 50 100
           C 50 70, 72 52, 100 52 Z"
        fill="url(#fox-face)"
        stroke={FUR_DARK}
        strokeWidth={1.2}
      />

      {/* cream muzzle / mask (the classic fox face marking) */}
      <path
        d="M100 78
           C 116 78, 126 92, 126 108
           C 126 132, 114 148, 100 148
           C 86 148, 74 132, 74 108
           C 74 92, 84 78, 100 78 Z"
        fill="url(#fox-muzzle)"
      />

      {/* forehead white blaze */}
      <path
        d="M100 56 C 108 56, 112 66, 108 78 C 104 74, 96 74, 92 78 C 88 66, 92 56, 100 56 Z"
        fill={CREAM}
        opacity={0.85}
      />
    </g>
  )
}

/* =======================================================================
 * CHEEKS — soft rosy blush
 * ===================================================================== */
function Cheeks() {
  return (
    <g filter="url(#fox-soft)">
      <ellipse cx={66} cy={112} rx={8} ry={5} fill="url(#fox-cheek)" />
      <ellipse cx={134} cy={112} rx={8} ry={5} fill="url(#fox-cheek)" />
    </g>
  )
}

/* =======================================================================
 * EYES — orbs + gaze pupils + blink lids + eyebrows
 * ===================================================================== */
function Eyes({
  gaze,
  blinking,
  eyesHidden,
  reduce,
}: {
  gaze: Gaze
  blinking: boolean
  eyesHidden: boolean
  reduce: boolean | null
}) {
  // When the paws are flat over the eyes we fade the eyes out (they're hidden
  // behind the paws anyway) and drop the lids closed.
  const lidClosed = blinking || eyesHidden

  return (
    <motion.g
      animate={{ opacity: eyesHidden ? 0 : 1 }}
      transition={{ duration: 0.15 }}
    >
      <Eye eye={EYE_LEFT} gaze={gaze} lidClosed={lidClosed} reduce={reduce} />
      <Eye eye={EYE_RIGHT} gaze={gaze} lidClosed={lidClosed} reduce={reduce} />

      {/* eyebrows — small friendly arches above each eye */}
      <path
        d={`M${EYE_LEFT.cx - 11} ${EYE_LEFT.cy - 20}
            Q ${EYE_LEFT.cx} ${EYE_LEFT.cy - 26}, ${EYE_LEFT.cx + 10} ${EYE_LEFT.cy - 21}`}
        stroke={BROW}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M${EYE_RIGHT.cx - 10} ${EYE_RIGHT.cy - 21}
            Q ${EYE_RIGHT.cx} ${EYE_RIGHT.cy - 26}, ${EYE_RIGHT.cx + 11} ${EYE_RIGHT.cy - 20}`}
        stroke={BROW}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
    </motion.g>
  )
}

function Eye({
  eye,
  gaze,
  lidClosed,
  reduce,
}: {
  eye: EyeGeometry
  gaze: Gaze
  lidClosed: boolean
  reduce: boolean | null
}) {
  // Move the pupil toward the cursor, clamped inside the orb.
  const dx = gaze.x * eye.rx * GAZE_RANGE
  const dy = gaze.y * eye.ry * GAZE_RANGE
  const px = eye.pupilX + dx
  const py = eye.pupilY + dy

  const spring = { type: 'spring' as const, stiffness: 130, damping: 18, mass: 0.4 }

  return (
    <g>
      {/* white sclera orb */}
      <ellipse
        cx={eye.cx}
        cy={eye.cy}
        rx={eye.rx}
        ry={eye.ry}
        fill="#ffffff"
        stroke="#e7d9c6"
        strokeWidth={0.8}
      />

      {/* pupil group — blink squashes it vertically to a slit */}
      <motion.g
        style={{ transformOrigin: `${eye.cx}px ${eye.cy}px` }}
        animate={{ scaleY: lidClosed && !reduce ? 0.06 : 1 }}
        transition={{ duration: 0.09, ease: 'easeInOut' }}
      >
        <motion.ellipse
          cx={px}
          cy={py}
          rx={eye.pupilW / 2}
          ry={eye.pupilH / 2}
          fill={INK}
          animate={reduce ? {} : { cx: px, cy: py }}
          transition={spring}
        />
        {/* big glossy catch-light */}
        <motion.circle
          cx={px - eye.pupilW * 0.22}
          cy={py - eye.pupilH * 0.26}
          r={eye.pupilW * 0.2}
          fill="#ffffff"
          opacity={0.95}
          animate={
            reduce
              ? {}
              : { cx: px - eye.pupilW * 0.22, cy: py - eye.pupilH * 0.26 }
          }
          transition={spring}
        />
        {/* tiny secondary sparkle */}
        <motion.circle
          cx={px + eye.pupilW * 0.16}
          cy={py + eye.pupilH * 0.16}
          r={eye.pupilW * 0.09}
          fill="#ffffff"
          opacity={0.7}
          animate={
            reduce
              ? {}
              : { cx: px + eye.pupilW * 0.16, cy: py + eye.pupilH * 0.16 }
          }
          transition={spring}
        />
      </motion.g>

      {/* upper eyelid that drops on blink / when hidden */}
      <motion.path
        d={`M${eye.cx - eye.rx - 1} ${eye.cy}
            a ${eye.rx + 1} ${eye.ry + 1} 0 0 1 ${(eye.rx + 1) * 2} 0 Z`}
        fill="url(#fox-face)"
        style={{ transformOrigin: `${eye.cx}px ${eye.cy}px` }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: lidClosed && !reduce ? 1 : 0 }}
        transition={{ duration: 0.09, ease: 'easeInOut' }}
      />
    </g>
  )
}

/* =======================================================================
 * SNOUT — nose + smiling mouth (mouth opens a bit while peeking)
 * ===================================================================== */
function Snout({ peeking }: { peeking: boolean }) {
  return (
    <g>
      {/* nose bridge line */}
      <path
        d="M100 108 L100 122"
        stroke={FUR_DARK}
        strokeWidth={1.4}
        strokeLinecap="round"
        opacity={0.35}
      />

      {/* nose */}
      <path
        d="M92 122 C 92 118, 108 118, 108 122 C 108 128, 100 132, 100 132 C 100 132, 92 128, 92 122 Z"
        fill={NOSE}
      />
      <ellipse cx={97} cy={122.5} rx={1.6} ry={1.1} fill="#ffffff" opacity={0.6} />

      {/* smile — a curious little "o" when peeking, a happy curve otherwise */}
      <motion.path
        stroke={NOSE}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        initial={false}
        animate={{
          d: peeking
            ? 'M94 138 Q100 146, 106 138 Q100 143, 94 138'
            : 'M88 137 Q100 149, 112 137',
        }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      />
    </g>
  )
}

/* =======================================================================
 * PAWS — two fluffy paws that rise to cover the eyes and part when peeking
 * ===================================================================== */
function Paws({
  peeking,
  reduce,
}: {
  peeking: boolean
  reduce: boolean | null
}) {
  const left: HandGeometry = {
    x: PAW_LEFT.x - (peeking ? PEEK_SPREAD : 0),
    y: PAW_LEFT.y + (peeking ? PEEK_DROP : 0),
    rot: PAW_LEFT.rot + (peeking ? -10 : 0),
  }
  const right: HandGeometry = {
    x: PAW_RIGHT.x + (peeking ? PEEK_SPREAD : 0),
    y: PAW_RIGHT.y + (peeking ? PEEK_DROP : 0),
    rot: PAW_RIGHT.rot + (peeking ? 10 : 0),
  }

  return (
    <>
      <Paw target={left} rest={PAW_LEFT_REST} mirror={false} reduce={reduce} />
      <Paw target={right} rest={PAW_RIGHT_REST} mirror reduce={reduce} />
    </>
  )
}

/**
 * A single paw. Drawn locally around (0,0) then translated/rotated into
 * place. The whole thing springs up from its rest pose and back down on exit.
 */
function Paw({
  target,
  rest,
  mirror,
  reduce,
}: {
  target: HandGeometry
  rest: HandGeometry
  mirror: boolean
  reduce: boolean | null
}) {
  const spring = reduce
    ? { duration: 0.001 }
    : { type: 'spring' as const, stiffness: 240, damping: 20, mass: 0.7 }

  const s = mirror ? -1 : 1

  return (
    <motion.g
      initial={{
        x: rest.x,
        y: rest.y,
        rotate: rest.rot,
        opacity: 0,
      }}
      animate={{
        x: target.x,
        y: target.y,
        rotate: target.rot,
        opacity: 1,
      }}
      exit={{
        x: rest.x,
        y: rest.y,
        rotate: rest.rot,
        opacity: 0,
      }}
      transition={spring}
      style={{ transformBox: 'fill-box' }}
    >
      <g transform={`scale(${s} 1)`}>
        {/* paw pad / mitten shape, local coords centred near (0,0) */}
        <path
          d="M-16 -2
             C -19 -16, -10 -24, 0 -24
             C 11 -24, 20 -15, 18 -1
             C 17 10, 9 17, 0 17
             C -9 17, -15 9, -16 -2 Z"
          fill="url(#fox-paw)"
          stroke={FUR_DARK}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        {/* toe separations — little fur lines */}
        <path d="M-6 -20 C -7 -10, -7 -2, -5 6" stroke={FUR_DARK} strokeWidth={1} fill="none" opacity={0.55} />
        <path d="M3 -21 C 3 -11, 3 -3, 3 6" stroke={FUR_DARK} strokeWidth={1} fill="none" opacity={0.55} />
        <path d="M11 -19 C 12 -10, 11 -2, 9 5" stroke={FUR_DARK} strokeWidth={1} fill="none" opacity={0.55} />
        {/* cream toe beans peeking at the fingertips (visible when peeking) */}
        <ellipse cx={-9} cy={-19} rx={2.6} ry={3.2} fill={CREAM} opacity={0.9} />
        <ellipse cx={0} cy={-21} rx={2.6} ry={3.2} fill={CREAM} opacity={0.9} />
        <ellipse cx={9} cy={-18} rx={2.6} ry={3.2} fill={CREAM} opacity={0.9} />
      </g>
    </motion.g>
  )
}

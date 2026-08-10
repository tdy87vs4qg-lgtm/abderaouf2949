/**
 * mascot.geometry.ts
 * ------------------------------------------------------------------
 * Geometry for the CODE-DRAWN fox mascot. There is no artwork file any
 * more — the entire character is vector-drawn in `FoxMascot.tsx`, layer
 * by layer (ears, face, eyes, snout, paws) so each part can animate on
 * its own. To make the numbers easy to reason about, everything here is
 * expressed in the SVG's own user-space, which uses a fixed viewBox:
 *
 *     VIEWBOX = 0 0 200 200
 *
 * The character is centred horizontally around x = 100 and its head sits
 * in the upper two-thirds of the box. All eye/pupil/paw coordinates below
 * are therefore plain SVG units in that 200×200 space — no fractional
 * remapping needed. Tweak a number here and only the drawing moves; the
 * animation logic in `Mascot.tsx` / `FoxMascot.tsx` stays untouched.
 */

/** The fixed SVG user-space the fox is drawn in. */
export const VIEW_W = 200
export const VIEW_H = 200

/** Aspect ratio of the mascot box (width / height). */
export const MASCOT_ASPECT = VIEW_W / VIEW_H

/**
 * One eye = a white sclera "orb" plus a dark pupil that rests at its
 * centre and glides toward the cursor. All values are SVG user units.
 */
export interface EyeGeometry {
  /** centre of the white eye orb */
  cx: number
  cy: number
  /** eye orb radii */
  rx: number
  ry: number
  /** natural resting centre of the pupil (== orb centre for a fox) */
  pupilX: number
  pupilY: number
  /** pupil radii */
  pupilW: number
  pupilH: number
}

/** Viewer-left eye (the fox's right eye). */
export const EYE_LEFT: EyeGeometry = {
  cx: 78,
  cy: 92,
  rx: 13.5,
  ry: 15,
  pupilX: 78,
  pupilY: 92,
  pupilW: 12.5,
  pupilH: 14,
}

/** Viewer-right eye (the fox's left eye). */
export const EYE_RIGHT: EyeGeometry = {
  cx: 122,
  cy: 92,
  rx: 13.5,
  ry: 15,
  pupilX: 122,
  pupilY: 92,
  pupilW: 12.5,
  pupilH: 14,
}

/**
 * How far (fraction of the orb radius) the pupil may wander from its rest
 * position while tracking the cursor. Keeps the pupil inside the sclera.
 */
export const GAZE_RANGE = 0.42

/**
 * A paw pose. The paw group is translated to (x, y) and rotated by `rot`
 * degrees around its own anchor. `x` / `y` are SVG user units; the paw art
 * itself is drawn locally around (0, 0) in FoxMascot.tsx.
 */
export interface HandGeometry {
  x: number
  y: number
  rot: number
}

/**
 * COVERING pose — the two paws rise up and press flat over the eyes so the
 * fox can't see the password being typed.
 */
export const PAW_LEFT: HandGeometry = { x: 78, y: 94, rot: -6 }
export const PAW_RIGHT: HandGeometry = { x: 122, y: 94, rot: 6 }

/**
 * REST pose — paws parked low, near the chest / bottom of the frame, so the
 * springy rise into the covering pose reads as a deliberate gesture.
 */
export const PAW_LEFT_REST: HandGeometry = { x: 70, y: 168, rot: -18 }
export const PAW_RIGHT_REST: HandGeometry = { x: 130, y: 168, rot: 18 }

/**
 * When PEEKING, the covering paws part slightly (spread sideways) and drop a
 * touch so a curious gap opens between them for the eyes to look through.
 */
export const PEEK_SPREAD = 7
export const PEEK_DROP = 6

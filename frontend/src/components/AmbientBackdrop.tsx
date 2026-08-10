/**
 * AmbientBackdrop — the persistent cinematic environment behind the site.
 *
 * PERFORMANCE: this used to run 12 infinitely-animating "star" particles,
 * two animated glow orbs, scroll-linked parallax on the photo, a grid and a
 * noise layer — all painting every frame and janking on phones. It is now a
 * fully STATIC backdrop (photo + veil + two soft glows) with zero JS-driven
 * motion, so it costs nothing to keep on screen.
 */
export default function AmbientBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="ambient-photo" />
      <div className="ambient-veil" />
      <div className="ambient-orb ambient-orb--cyan" />
      <div className="ambient-orb ambient-orb--gold" />
    </div>
  )
}

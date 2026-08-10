import type { PropsWithChildren } from 'react'
import { M } from '../lib/lazyMotion'

/**
 * PageTransition — a light fade between routes.
 *
 * PERFORMANCE: dropped the blur() filter and the vertical travel; it is now a
 * short opacity-only fade, which is essentially free to render.
 */
export default function PageTransition({ children }: PropsWithChildren) {
  return (
    <M.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </M.main>
  )
}

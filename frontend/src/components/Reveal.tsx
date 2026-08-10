import type { PropsWithChildren } from 'react'
import { M, useLazyReducedMotion } from '../lib/lazyMotion'

type RevealProps = PropsWithChildren<{
  className?: string
  delay?: number
  direction?: 'up' | 'right' | 'left'
}>

/**
 * Reveal — a light entrance animation for a block as it scrolls into view.
 *
 * PERFORMANCE: the blur() filter was removed (very costly on phones) and the
 * travel distance / duration reduced. It now animates only opacity + a small
 * transform, which the GPU handles cheaply. Honours prefers-reduced-motion.
 */
export default function Reveal({ children, className = '', delay = 0, direction = 'up' }: RevealProps) {
  const reduce = useLazyReducedMotion()
  const offset = direction === 'up' ? { y: 20 } : direction === 'right' ? { x: 20 } : { x: -20 }

  if (reduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <M.div
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-8%' }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
    >
      {children}
    </M.div>
  )
}

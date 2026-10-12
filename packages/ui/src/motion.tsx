import { motion, type Transition } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * House-standard spring for UI chrome. Use it for panels, popovers and entrances so everything
 * shares one physical feel.
 *
 * Critically damped (damping = 2 * sqrt(stiffness)), so nothing overshoots: a panel that
 * overshoots its size by a pixel resizes the map a second time when it settles back.
 */
export const UI_SPRING: Transition = { type: 'spring', damping: 36, stiffness: 320 }

/**
 * Enter-only slide and fade. Only transform and opacity change, so it never affects layout and is
 * safe inside size-observed containers. It animates once on mount and has no exit animation.
 */
export function FadeSlideIn(props: {
  x?: number
  y?: number
  /** Delay in seconds, for manual staggering. */
  delay?: number
  className?: string
  children: ReactNode
}) {
  const { x = 0, y = 0, delay = 0, className, children } = props
  return (
    <motion.div
      className={className}
      initial={{ x, y, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      transition={{ ...UI_SPRING, delay }}
    >
      {children}
    </motion.div>
  )
}

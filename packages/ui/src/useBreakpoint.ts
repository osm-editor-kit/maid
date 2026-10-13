import { useSyncExternalStore } from 'react'

/** The Tailwind screens by name, in pixels. Below `sm` the layout is for phones. */
export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const

export type Breakpoint = keyof typeof breakpoints

/**
 * Whether the window is at least as wide as the breakpoint. It reads `matchMedia` through
 * `useSyncExternalStore`, so there is no effect and no state to keep in step, and it matches the
 * `sm:` classes of Tailwind.
 */
export function useBreakpoint(breakpoint: Breakpoint) {
  const query = `(min-width: ${breakpoints[breakpoint]}px)`
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

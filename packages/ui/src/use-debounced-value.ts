import { useEffect, useState } from 'react'

/**
 * The value, as it was `delayMs` after its last change. TanStack Query's docs say to debounce the input and
 * not the query: a query keyed by this value asks once the typing pauses. With `delayMs` of 0 or less the value
 * is given back at once, so a local list asks on each change. The timer is the one effect this needs: it is a
 * clock, which no query can be.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    if (delayMs <= 0) return undefined
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return delayMs <= 0 ? value : debounced
}

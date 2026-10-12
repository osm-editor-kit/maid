import { useSyncExternalStore } from 'react'
import { absoluteTime, browserTimeZone, parseTime, preferRelative, relativeTime } from './time.ts'
import { Tooltip } from './Tooltip.tsx'

const TICK_MS = 30_000

/**
 * One clock for the whole page: a 30 s interval runs while any `<Time>` is mounted, so relative
 * times stay current without each one keeping a timer. The state is an object so that no
 * module-level variable is reassigned.
 */
const clock = {
  now: Date.now(),
  listeners: new Set<() => void>(),
  timer: undefined as ReturnType<typeof setInterval> | undefined,
}

function subscribe(listener: () => void) {
  if (clock.listeners.size === 0) {
    clock.now = Date.now()
    clock.timer = setInterval(() => {
      clock.now = Date.now()
      for (const notify of clock.listeners) notify()
    }, TICK_MS)
  }
  clock.listeners.add(listener)
  return () => {
    clock.listeners.delete(listener)
    if (clock.listeners.size === 0) clearInterval(clock.timer)
  }
}

function currentNow() {
  return clock.now
}

/** The page's clock, updated every 30 s. Read here, never `Date.now()` during render. */
function useNow(): number {
  return useSyncExternalStore(subscribe, currentNow, currentNow)
}

/**
 * A date and time. The primary form is the text and the other form is in a tooltip: relative
 * text (`5 minutes ago`) shows the local date and time on hover, and an absolute date shows how
 * long ago on hover. `primary="auto"` is relative for about four weeks, then absolute.
 * A value that is not a date is rendered as it is.
 */
export function Time(props: {
  value: string | number | Date | undefined
  primary?: 'auto' | 'relative' | 'absolute'
}) {
  const { value, primary = 'auto' } = props
  const now = useNow()
  const parsed = parseTime(value)
  if (!parsed) return value === undefined ? null : String(value)

  const relative =
    primary === 'relative' || (primary === 'auto' && preferRelative(parsed.date, now))
  const timeZone = browserTimeZone()
  const relativeText = relativeTime(parsed, now)
  const absoluteText = absoluteTime(parsed, { timeZone, now })
  // a string keeps its own form (a date-only value must not gain a time in the attribute)
  const dateTime = typeof value === 'string' ? value : parsed.date.toISOString()

  return (
    <Tooltip label={relative ? absoluteText : relativeText}>
      <time dateTime={dateTime}>{relative ? relativeText : absoluteText}</time>
    </Tooltip>
  )
}

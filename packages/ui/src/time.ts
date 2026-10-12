import { TZDate } from '@date-fns/tz'
import { differenceInCalendarDays, format, formatDistanceStrict } from 'date-fns'

/**
 * A point in time as the app shows it. `dateOnly` values (`2025-04-01`) have no time and are kept
 * as local midnight, so no time-zone shift can move them to another day.
 */
export type TimeValue = { date: Date; dateOnly: boolean }

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const FOUR_WEEKS = 28 * DAY

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/** The time zone of the browser, as IANA name (`Europe/Berlin`). */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Reads what the app stores: OSM API timestamps (`2026-09-28T07:14:00Z`), date-only values, and
 * milliseconds. Anything else, including a date that does not exist, gives `undefined`.
 */
export function parseTime(value: string | number | Date | undefined): TimeValue | undefined {
  if (value === undefined) return undefined
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : { date: value, dateOnly: false }
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { date: new Date(value), dateOnly: false } : undefined
  }
  const dateOnly = DATE_ONLY.exec(value)
  if (dateOnly) {
    const [year, month, day] = [Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3])]
    const date = new Date(year, month - 1, day)
    // `new Date` rolls 2026-02-30 over to March; that is not a date
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return undefined
    }
    return { date, dateOnly: true }
  }
  // Date.parse accepts almost anything (`"1"` is a date), so the shape is checked first
  if (!ISO_DATE_TIME.test(value)) return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : { date: new Date(time), dateOnly: false }
}

/**
 * The local date and time in `timeZone`: `13 Oct 2026, 14:05`. The year is left out when it is
 * the year of `now`, because then the reader knows it; a date-only value has no time.
 */
export function absoluteTime(
  value: TimeValue,
  options: { timeZone: string; now?: Date | number },
): string {
  const now = options.now ?? Date.now()
  // a date-only value is local midnight already; a time is shown in the chosen zone
  const at = value.dateOnly ? value.date : new TZDate(value.date.getTime(), options.timeZone)
  const nowAt = value.dateOnly ? new Date(now) : new TZDate(+now, options.timeZone)
  const day = at.getFullYear() === nowAt.getFullYear() ? 'd MMM' : 'd MMM yyyy'
  return format(at, value.dateOnly ? day : `${day}, HH:mm`)
}

/**
 * How long ago, in words: `just now`, `5 minutes ago`, `2 hours ago`, `yesterday`, `4 days ago`,
 * `3 weeks ago`, `5 months ago`. Days are counted in the browser's time zone, so `yesterday` is
 * yesterday on the wall clock. Within 24 hours the exact distance is more useful than the day.
 * date-fns has no week unit, so weeks are counted here.
 */
export function relativeTime(value: TimeValue, now: Date | number): string {
  const nowMs = +now
  const diff = nowMs - value.date.getTime()
  if (Math.abs(diff) < MINUTE) return 'just now'

  const zone = browserTimeZone()
  const nowLocal = new TZDate(nowMs, zone)
  const valueLocal = value.dateOnly ? value.date : new TZDate(value.date.getTime(), zone)
  const days = differenceInCalendarDays(nowLocal, valueLocal)

  if (!value.dateOnly && Math.abs(diff) < DAY) {
    return formatDistanceStrict(value.date, new Date(nowMs), { addSuffix: true })
  }
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days === -1) return 'tomorrow'

  const ago = days > 0
  const count = Math.abs(days)
  if (count >= 7 && count < 28) {
    const weeks = Math.floor(count / 7)
    const unit = weeks === 1 ? 'week' : 'weeks'
    return ago ? `${weeks} ${unit} ago` : `in ${weeks} ${unit}`
  }
  return formatDistanceStrict(value.date, new Date(nowMs), { addSuffix: true })
}

/**
 * Whether relative time is the better primary form: for anything less than about four weeks
 * away (past or future). Older values read better as dates.
 */
export function preferRelative(date: Date | number, now: Date | number): boolean {
  return Math.abs(+now - +date) < FOUR_WEEKS
}

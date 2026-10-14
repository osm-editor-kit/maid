import { TZDate } from '@date-fns/tz'
import { getLocale, type Locale } from '@osm-editor-kit/maid-i18n'
import {
  differenceInCalendarDays,
  format,
  formatDistanceStrict,
  type Locale as DateLocale,
} from 'date-fns'
import { de, enGB, es, fr } from 'date-fns/locale'

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

/**
 * date-fns's names for each app language. English is the British form: day first, as the app
 * writes dates (`Mon, 21 Sep`). The month and weekday names are the same in en-US.
 */
const DATE_LOCALES: Record<Locale, DateLocale> = { en: enGB, de, fr, es }

/** `Intl.RelativeTimeFormat` objects, made once per language and numeric style */
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>()

function relativeFormat(locale: Locale, numeric: 'auto' | 'always') {
  const key = `${locale}|${numeric}`
  let formatter = relativeFormats.get(key)
  if (formatter === undefined) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric })
    relativeFormats.set(key, formatter)
  }
  return formatter
}

/** The time zone of the browser, as IANA name (`Europe/Berlin`). */
export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Reads what the app stores: OSM API timestamps (`2026-09-28T07:14:00Z`), date-only values, and
 * milliseconds. Anything else, including a date that does not exist, gives `undefined`.
 */
export function parseTime(value: string | number | Date | undefined) {
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
 * The local date and time in `timeZone` with the weekday: `Tue, 13 Oct, 14:05`. The year is left
 * out when it is the year of `now`, because then the reader knows it; a date-only value has no
 * time (`Tue, 13 Oct`). The names follow the app's language unless `locale` is given.
 */
export function absoluteTime(
  value: TimeValue,
  options: { timeZone: string; now?: Date | number; locale?: Locale },
) {
  const now = options.now ?? Date.now()
  const locale = DATE_LOCALES[options.locale ?? getLocale()]
  // a date-only value is local midnight already; a time is shown in the chosen zone
  const at = value.dateOnly ? value.date : new TZDate(value.date.getTime(), options.timeZone)
  const nowAt = value.dateOnly ? new Date(now) : new TZDate(+now, options.timeZone)
  const day = at.getFullYear() === nowAt.getFullYear() ? 'EEE, d MMM' : 'EEE, d MMM yyyy'
  return format(at, value.dateOnly ? day : `${day}, HH:mm`, { locale })
}

/**
 * How long ago, in words: `now`, `5 minutes ago`, `2 hours ago`, `yesterday`, `4 days ago`,
 * `3 weeks ago`, `5 months ago`, in the app's language unless `locale` is given. Days are counted
 * in the browser's time zone, so `yesterday` is yesterday on the wall clock. Within 24 hours the
 * exact distance is more useful than the day. date-fns has no week unit, so weeks are counted
 * here. The words for the day and the week come from `Intl.RelativeTimeFormat`.
 */
export function relativeTime(value: TimeValue, now: Date | number, locale: Locale = getLocale()) {
  const nowMs = +now
  const diff = nowMs - value.date.getTime()
  if (Math.abs(diff) < MINUTE) return relativeFormat(locale, 'auto').format(0, 'second')

  const zone = browserTimeZone()
  const nowLocal = new TZDate(nowMs, zone)
  const valueLocal = value.dateOnly ? value.date : new TZDate(value.date.getTime(), zone)
  const days = differenceInCalendarDays(nowLocal, valueLocal)
  const distance = () =>
    formatDistanceStrict(value.date, new Date(nowMs), {
      addSuffix: true,
      locale: DATE_LOCALES[locale],
    })

  if (!value.dateOnly && Math.abs(diff) < DAY) return distance()
  // `0 - days` rather than `-days`: a plain zero, not -0, which `Intl` would read as a count
  if (days === 0 || days === 1 || days === -1) {
    return relativeFormat(locale, 'auto').format(0 - days, 'day')
  }

  const count = Math.abs(days)
  if (count >= 7 && count < 28) {
    const weeks = Math.floor(count / 7)
    return relativeFormat(locale, 'always').format(days > 0 ? -weeks : weeks, 'week')
  }
  return distance()
}

/**
 * Whether relative time is the better primary form: for anything less than about four weeks
 * away (past or future). Older values read better as dates.
 */
export function preferRelative(date: Date | number, now: Date | number) {
  return Math.abs(+now - +date) < FOUR_WEEKS
}

import { describe, expect, test } from 'bun:test'
import { absoluteTime, browserTimeZone, parseTime, preferRelative, relativeTime } from './time.ts'

// "now" is built in local time, so the calendar-day cases do not depend on the machine's zone
const now = new Date(2026, 9, 12, 10, 0)
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

describe('browserTimeZone', () => {
  test('is an IANA name of the browser', () => {
    expect(browserTimeZone().length).toBeGreaterThan(0)
  })
})

describe('parseTime', () => {
  test('reads the ISO strings of the OSM API as the instant they name', () => {
    const parsed = parseTime('2026-09-28T07:14:00Z')
    expect(parsed?.date.toISOString()).toBe('2026-09-28T07:14:00.000Z')
    expect(parsed?.dateOnly).toBe(false)
  })

  test('a time without a zone is local time', () => {
    expect(parseTime('2026-10-12T10:00:00')?.date).toEqual(new Date(2026, 9, 12, 10, 0))
  })

  test('a date-only value is local midnight of that day, with no time', () => {
    const parsed = parseTime('2025-04-01')
    expect(parsed?.dateOnly).toBe(true)
    expect([parsed?.date.getFullYear(), parsed?.date.getMonth(), parsed?.date.getDate()]).toEqual([
      2025, 3, 1,
    ])
    expect(parsed?.date.getHours()).toBe(0)
  })

  test('reads milliseconds and Date objects', () => {
    expect(parseTime(0)?.date.getTime()).toBe(0)
    expect(parseTime(now)?.date.getTime()).toBe(now.getTime())
  })

  test('returns undefined for anything else', () => {
    expect(parseTime(undefined)).toBeUndefined()
    expect(parseTime('not a date')).toBeUndefined()
    expect(parseTime('1')).toBeUndefined()
    expect(parseTime('2026-02-30')).toBeUndefined()
    expect(parseTime('2026-13-01T00:00:00Z')).toBeUndefined()
    expect(parseTime(Number.NaN)).toBeUndefined()
    expect(parseTime(new Date('nope'))).toBeUndefined()
    expect(parseTime('')).toBeUndefined()
  })
})

describe('absoluteTime', () => {
  const value = parseTime('2026-10-13T12:05:00Z')!

  test('shows the local date and time in the given zone, without the year of now', () => {
    expect(absoluteTime(value, { timeZone: 'Europe/Berlin', now })).toBe('13 Oct, 14:05')
    expect(absoluteTime(value, { timeZone: 'America/New_York', now })).toBe('13 Oct, 08:05')
  })

  test('shows the year when it is not the year of now', () => {
    const nextYear = new Date(2027, 0, 5)
    expect(absoluteTime(value, { timeZone: 'Europe/Berlin', now: nextYear })).toBe(
      '13 Oct 2026, 14:05',
    )
  })

  test('a date-only value has no time and no zone shift', () => {
    const date = parseTime('2025-04-01')!
    expect(absoluteTime(date, { timeZone: 'America/Los_Angeles', now })).toBe('1 Apr 2025')
    expect(absoluteTime(date, { timeZone: 'Pacific/Auckland', now: new Date(2025, 5, 1) })).toBe(
      '1 Apr',
    )
  })
})

describe('relativeTime', () => {
  const at = (value: string) => parseTime(value)!

  test('minutes and hours within a day are the exact distance', () => {
    expect(relativeTime(parseTime(minutesAgo(0.5))!, now)).toBe('just now')
    expect(relativeTime(parseTime(minutesAgo(5))!, now)).toBe('5 minutes ago')
    expect(relativeTime(parseTime(minutesAgo(120))!, now)).toBe('2 hours ago')
    expect(relativeTime(parseTime(minutesAgo(-10))!, now)).toBe('in 10 minutes')
  })

  test('the day before is yesterday, on the wall clock', () => {
    expect(relativeTime(parseTime(new Date(2026, 9, 11, 9, 0))!, now)).toBe('yesterday')
  })

  test('days and weeks', () => {
    expect(relativeTime(parseTime(new Date(2026, 9, 9, 10, 0))!, now)).toBe('3 days ago')
    expect(relativeTime(parseTime(new Date(2026, 8, 21, 10, 0))!, now)).toBe('3 weeks ago')
  })

  test('older than that is in months', () => {
    expect(relativeTime(at('2026-05-12'), now)).toBe('5 months ago')
  })

  test('a date-only value is today, yesterday or a count of days', () => {
    expect(relativeTime(at('2026-10-12'), now)).toBe('today')
    expect(relativeTime(at('2026-10-11'), now)).toBe('yesterday')
  })
})

describe('preferRelative', () => {
  test('relative for less than about four weeks, absolute for older values', () => {
    expect(preferRelative(new Date(2026, 8, 15), now)).toBe(true)
    expect(preferRelative(new Date(2026, 8, 13), now)).toBe(false)
    expect(preferRelative(new Date(2026, 9, 13), now)).toBe(true)
  })
})

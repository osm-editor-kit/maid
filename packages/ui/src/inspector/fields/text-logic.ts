import type { Field, Tags } from '@osm-editor-kit/maid-presets'

/** Whether the text is an absolute http or https URL with a host. Surrounding spaces are ignored. */
export function isValidUrl(text: string): boolean {
  const value = text.trim()
  if (value === '') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
  } catch {
    return false
  }
}

/** The first match of a regular expression in the text, or undefined (also for a bad pattern). */
function firstMatch(pattern: string, text: string): string | undefined {
  try {
    return new RegExp(pattern).exec(text)?.[0]
  } catch {
    return undefined
  }
}

/**
 * The outlink of an identifier: the value itself when it already is a URL, else the first match
 * of the pattern put into urlFormat's {value}. Undefined when there is no link to build.
 */
export function identifierLink(
  field: Pick<Field, 'urlFormat' | 'pattern'>,
  text: string,
): string | undefined {
  const value = text.trim()
  if (value === '' || field.urlFormat === undefined || field.pattern === undefined) return undefined
  if (isValidUrl(value)) return value
  const id = firstMatch(field.pattern, value)
  if (!id) return undefined
  return field.urlFormat.replace('{value}', () => encodeURIComponent(id))
}

/**
 * The key a tel value is written to: the first of the field's keys (key first) that has a value,
 * else the field's key. Without a key, the first of its keys.
 */
export function telKey(field: Pick<Field, 'key' | 'keys'>, tags: Tags): string | undefined {
  const keys = [
    ...new Set([...(field.key !== undefined ? [field.key] : []), ...(field.keys ?? [])]),
  ]
  return keys.find((key) => (tags[key] ?? '') !== '') ?? keys[0]
}

const DATE_SHAPE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return days[month - 1] ?? 0
}

/** YYYY, YYYY-MM or YYYY-MM-DD with a month from 01 to 12 and a day that exists in that month. */
export function isValidDate(text: string): boolean {
  const match = DATE_SHAPE.exec(text.trim())
  if (!match) return false
  const year = Number(match[1])
  const monthText = match[2]
  const dayText = match[3]
  if (monthText === undefined) return true
  const month = Number(monthText)
  if (month < 1 || month > 12) return false
  if (dayText === undefined) return true
  const day = Number(dayText)
  return day >= 1 && day <= daysInMonth(year, month)
}

/** The value a native date picker takes: YYYY-MM-DD when the text is a whole date, else empty. */
export function pickerDate(text: string): string {
  const value = text.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidDate(value) ? value : ''
}

/** The local calendar date of `now` as YYYY-MM-DD. */
export function todayIso(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const SET_TODAY_KEYS = new Set(['check_date', 'survey:date'])

/** The "set to today" button shows for check_date and survey:date when the text is not today. */
export function showsSetToday(key: string | undefined, text: string, today: string): boolean {
  return key !== undefined && SET_TODAY_KEYS.has(key) && text.trim() !== today
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** The basic CSS colour names OSM tags use; lower case, as hex. */
const NAMED_COLOURS = new Map<string, string>([
  ['black', '#000000'],
  ['silver', '#c0c0c0'],
  ['gray', '#808080'],
  ['grey', '#808080'],
  ['white', '#ffffff'],
  ['maroon', '#800000'],
  ['red', '#ff0000'],
  ['purple', '#800080'],
  ['fuchsia', '#ff00ff'],
  ['magenta', '#ff00ff'],
  ['green', '#008000'],
  ['lime', '#00ff00'],
  ['olive', '#808000'],
  ['yellow', '#ffff00'],
  ['navy', '#000080'],
  ['blue', '#0000ff'],
  ['teal', '#008080'],
  ['aqua', '#00ffff'],
  ['cyan', '#00ffff'],
  ['orange', '#ffa500'],
  ['brown', '#a52a2a'],
  ['pink', '#ffc0cb'],
  ['beige', '#f5f5dc'],
])

/**
 * The hex form of a colour the text names: #rgb or #rrggbb (the # is required, as in iD), or one
 * of the basic colour names. Lower case, six digits. Undefined when the text is neither.
 */
export function colourToHex(text: string): string | undefined {
  const value = text.trim()
  if (HEX.test(value)) {
    const digits = value.slice(1).toLowerCase()
    // The text matched HEX, so it is ASCII and split('') takes one character per digit
    return `#${
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits
    }`
  }
  return NAMED_COLOURS.get(value.toLowerCase())
}

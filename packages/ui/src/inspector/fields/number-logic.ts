/**
 * The logic of the number fields, headless: stepping `;`-separated numbers, reading and writing
 * speeds and heights. Ported from iD's input.js (steppers, clamp, direction wrap), roadspeed.js and
 * roadheight.js. A decimal comma is read as a decimal point and written as a dot.
 */

export type StepDirection = 1 | -1

export type StepOptions = {
  /** Step size. Default 1, as iD's field.increment. */
  increment?: number
  /** Values are not written below this. */
  minValue?: number
  /** Direction fields: compass words are accepted, and the result wraps into 0 to 359. */
  wrap?: boolean
}

/** iD's `cardinal` (modules/osm/node.ts): compass words, full names and abbreviations, to degrees. */
const COMPASS = new Map<string, number>([
  ['north', 0],
  ['n', 0],
  ['northnortheast', 22],
  ['nne', 22],
  ['northeast', 45],
  ['ne', 45],
  ['eastnortheast', 67],
  ['ene', 67],
  ['east', 90],
  ['e', 90],
  ['eastsoutheast', 112],
  ['ese', 112],
  ['southeast', 135],
  ['se', 135],
  ['southsoutheast', 157],
  ['sse', 157],
  ['south', 180],
  ['s', 180],
  ['southsouthwest', 202],
  ['ssw', 202],
  ['southwest', 225],
  ['sw', 225],
  ['westsouthwest', 247],
  ['wsw', 247],
  ['west', 270],
  ['w', 270],
  ['westnorthwest', 292],
  ['wnw', 292],
  ['northwest', 315],
  ['nw', 315],
  ['northnorthwest', 337],
  ['nnw', 337],
])

/** The degrees of a compass word (N, NE, north-east, ...), or undefined. */
export function compassDegrees(word: string) {
  return COMPASS.get(word.trim().toLowerCase())
}

/** iD's direction fields: a key with a `direction` part (`direction`, `camera:direction`). */
export function isDirectionKey(key: string) {
  return key.split(':').includes('direction')
}

// An optional sign, digits, and at most one decimal point or comma, with at least one digit.
const NUMBER = /^([+-]?)(\d*)(?:[.,](\d*))?$/

/** A plain number with a dot or a decimal comma, with its count of decimal places. */
export function parseNumber(text: string) {
  const match = NUMBER.exec(text.trim())
  if (!match) return undefined
  const [, sign = '', whole = '', fraction = ''] = match
  if (whole === '' && fraction === '') return undefined
  const value = Number(`${sign}${whole || '0'}.${fraction || '0'}`)
  return Number.isFinite(value) ? { value, decimals: fraction.length } : undefined
}

/** A number with the given decimal places, written with a dot and without a sign on zero. */
export function formatNumber(value: number, decimals: number) {
  const text = value.toFixed(Math.min(decimals, 20))
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text
}

function decimalsOf(value: number) {
  const text = String(value)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

function clamp(value: number, minValue: number | undefined) {
  return minValue === undefined ? value : Math.max(value, minValue)
}

/** The text an empty field stands for when stepping: 0, as iD does. */
function stepSource(text: string) {
  return text.trim() === '' ? '0' : text
}

/**
 * One step of a field's text. Each `;`-separated value moves by the increment, is wrapped (direction
 * fields) and clamped to minValue. Parts that are not numbers stay as they are. The decimal places
 * of a part are kept, and of the increment if it has more, so 0.2 + 0.1 gives "0.3".
 */
export function stepValue(text: string, direction: StepDirection, options: StepOptions = {}) {
  const { increment = 1, minValue, wrap = false } = options
  const stepDecimals = decimalsOf(increment)
  return stepSource(text)
    .split(';')
    .map((part) => {
      const trimmed = part.trim()
      const compass = wrap ? compassDegrees(trimmed) : undefined
      const parsed = compass !== undefined ? { value: compass, decimals: 0 } : parseNumber(trimmed)
      if (!parsed) return trimmed
      let next = parsed.value + direction * increment
      if (wrap) next = ((next % 360) + 360) % 360
      next = clamp(next, minValue)
      return formatNumber(next, Math.max(parsed.decimals, stepDecimals))
    })
    .join(';')
}

/** Whether a step changes the text: at least one value is a number (or a compass word, wrapping). */
export function canStep(text: string, wrap = false) {
  return stepSource(text)
    .split(';')
    .some((part) => {
      const trimmed = part.trim()
      return parseNumber(trimmed) !== undefined || (wrap && compassDegrees(trimmed) !== undefined)
    })
}

/**
 * A typed text as it is written: each `;`-separated number is clamped to minValue and written with a
 * dot and its own decimal places. Parts that are not numbers are kept as typed.
 */
export function normalizeNumber(text: string, minValue?: number) {
  return text
    .split(';')
    .map((part) => {
      const trimmed = part.trim()
      const parsed = parseNumber(trimmed)
      if (!parsed) return trimmed
      return formatNumber(clamp(parsed.value, minValue), parsed.decimals)
    })
    .join(';')
}

export const SPEED_UNITS = ['km/h', 'mph'] as const
export type SpeedUnit = (typeof SPEED_UNITS)[number]

/** A speed tag: `50` is km/h, `50 mph` is mph (iD: a value with `mph` in it is imperial). */
export function parseSpeed(value: string): { number: string; unit: SpeedUnit } {
  const text = value.trim()
  if (text.includes('mph')) return { number: text.replace(/mph/g, '').trim(), unit: 'mph' }
  return { number: text, unit: 'km/h' }
}

/** The tag for a speed: a plain number in km/h, `<n> mph` in mph. Empty means no tag. */
export function formatSpeed(number: string, unit: SpeedUnit) {
  const text = normalizeNumber(number.trim())
  if (text === '') return undefined
  return unit === 'mph' && parseNumber(text) !== undefined ? `${text} mph` : text
}

export const HEIGHT_UNITS = ['m', 'ft'] as const
export type HeightUnit = (typeof HEIGHT_UNITS)[number]

/**
 * A height tag: `3.5` is metres, `11'6"` is feet with `'` and inches with `"` (iD: a value with an
 * apostrophe or a quote is imperial). In metres only `primary` is used.
 */
export function parseHeight(value: string): {
  primary: string
  secondary: string
  unit: HeightUnit
} {
  const text = value.trim()
  if (text.includes("'") || text.includes('"')) {
    return {
      primary: text.match(/(-?[\d.]+)'/)?.[1] ?? '',
      secondary: text.match(/(-?[\d.]+)"/)?.[1] ?? '',
      unit: 'ft',
    }
  }
  return { primary: text, secondary: '', unit: 'm' }
}

/**
 * The tag for a height. In metres: the primary number. In feet: `<ft>'<in>"`, each part only when
 * it has a value. A part that is not a number is written as the primary text alone, as iD does.
 */
export function formatHeight(primary: string, secondary: string, unit: HeightUnit) {
  const feet = normalizeNumber(primary.trim())
  if (unit === 'm') return feet === '' ? undefined : feet
  const inches = normalizeNumber(secondary.trim())
  if (feet === '' && inches === '') return undefined
  const isNumber = (text: string) => text === '' || parseNumber(text) !== undefined
  if (!isNumber(feet) || !isNumber(inches)) return feet === '' ? undefined : feet
  return `${feet === '' ? '' : `${feet}'`}${inches === '' ? '' : `${inches}"`}`
}

import { m } from '../messages.ts'
/**
 * The pure parts of the divide mode: the numbers of columns and rows (kept in range), the key that changes them, and
 * the sentence that says why a division is refused. No React, no engine: tested in division.test.ts.
 */
import { MAX_PARTS, type DivideRefusal } from './divide.ts'

/** Which number a key changes: the columns (along the first edge) or the rows */
export type Axis = 'columns' | 'rows'

/** How many sections the area is cut into, across and down */
export type Division = { columns: number; rows: number }

/** The most sections one axis can have while the other has `other`: the total stays within MAX_PARTS */
export function largestFor(axis: Axis, division: Division): number {
  const other = axis === 'columns' ? division.rows : division.columns
  return Math.floor(MAX_PARTS / Math.max(other, 1))
}

/**
 * The division with one axis set to `value`. Whole numbers only: a fraction is rounded down. The value is kept between
 * 1 and the most that fits next to the other axis, so the total never goes over MAX_PARTS. Not a number: unchanged.
 */
export function withAxis(division: Division, axis: Axis, value: number): Division {
  if (!Number.isFinite(value)) return division
  const whole = Math.min(Math.max(Math.trunc(value), 1), largestFor(axis, division))
  return axis === 'columns'
    ? { columns: whole, rows: division.rows }
    : { columns: division.columns, rows: whole }
}

/** The division with one axis moved by `delta` (+1 or -1), kept in range as `withAxis` keeps it */
export function stepDivision(division: Division, axis: Axis, delta: 1 | -1): Division {
  const current = axis === 'columns' ? division.columns : division.rows
  return withAxis(division, axis, current + delta)
}

/** The key event fields a step reads. A real KeyboardEvent has them all. */
export type StepKey = {
  key: string
  code: string
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

/**
 * What a key press asks for: + (and =) adds one column, - (and _) takes one away; with Shift the rows change instead.
 * The key's character comes first, its code (the numeric keypad, or the key on a layout where the character differs)
 * when the character is none of these. Keys with Control, Alt or Meta are the browser's (zoom), so they ask for nothing.
 */
export function stepOfKey(event: StepKey): { axis: Axis; delta: 1 | -1 } | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) return undefined
  const delta = deltaOfCharacter(event.key) ?? deltaOfCode(event.code)
  if (delta === undefined) return undefined
  return { axis: event.shiftKey ? 'rows' : 'columns', delta }
}

function deltaOfCharacter(key: string): 1 | -1 | undefined {
  if (key === '+' || key === '=') return 1
  if (key === '-' || key === '_') return -1
  return undefined
}

function deltaOfCode(code: string): 1 | -1 | undefined {
  if (code === 'NumpadAdd' || code === 'Equal') return 1
  if (code === 'NumpadSubtract' || code === 'Minus') return -1
  return undefined
}

/** The sentence that says why a division is refused, in the page's language (read when it is shown) */
export function refusalText(reason: DivideRefusal): string {
  switch (reason) {
    case 'not_four_corners':
      return m.divide_refused_not_four_corners()
    case 'concave':
      return m.divide_refused_concave()
    case 'in_relation':
      return m.divide_refused_in_relation()
    case 'shared_edge':
      return m.divide_refused_shared_edge()
    case 'too_many_parts':
      return m.divide_refused_too_many_parts({ max: MAX_PARTS })
    case 'nothing_to_do':
      return m.divide_refused_nothing_to_do()
  }
}

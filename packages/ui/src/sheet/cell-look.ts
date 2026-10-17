/**
 * How a cell looks, as decisions on plain values (no React, no DOM): the classes of the cell and its input, the
 * box-shadow rings (active, range outline, invalid), and the length counter. Unit-tested.
 */
import type { CSSProperties } from 'react'
import { lengthNotice, MAX_VALUE_LENGTH, tooLongText } from '../inspector/logic.ts'
import type { SelectionRect } from './reducer.ts'

/** Bits of `edges`: which sides of a selected cell are the outline of the range. */
export const EDGE_TOP = 1
export const EDGE_RIGHT = 2
export const EDGE_BOTTOM = 4
export const EDGE_LEFT = 8

/** blue-500: the range outline. blue-600: the active cell. red-500: an invalid cell. */
const RANGE = '#3b82f6'
const ACTIVE = '#2563eb'
const INVALID = '#ef4444'

/** The outline sides of the cell at row `r`, column `c` of a range (0 for a cell outside it). */
export function rangeEdges(r: number, c: number, rect: SelectionRect): number {
  let edges = 0
  if (r === rect.r0) edges |= EDGE_TOP
  if (r === rect.r1) edges |= EDGE_BOTTOM
  if (c === rect.c0) edges |= EDGE_LEFT
  if (c === rect.c1) edges |= EDGE_RIGHT
  return edges
}

export type CellLook = {
  selected: boolean
  active: boolean
  editing: boolean
  invalid: boolean
  edges: number
}

/** The classes of the cell's wrapper: its hairline borders, and the fill of a selected cell. */
export function cellClassName(look: { selected: boolean }): string {
  const base =
    'relative flex min-w-0 flex-col justify-center border-r border-b border-zinc-950/10 dark:border-white/10'
  return look.selected ? `${base} bg-blue-500/10 dark:bg-blue-400/10` : base
}

/**
 * The rings of a cell as one box-shadow: the outline of the range (its edge sides), the active cell's ring (a
 * stronger one while it is edited), and a red line round an invalid cell. Undefined when there is none.
 */
export function cellStyle(look: CellLook): CSSProperties | undefined {
  const rings: string[] = []
  if (look.edges & EDGE_TOP) rings.push(`inset 0 2px 0 0 ${RANGE}`)
  if (look.edges & EDGE_BOTTOM) rings.push(`inset 0 -2px 0 0 ${RANGE}`)
  if (look.edges & EDGE_LEFT) rings.push(`inset 2px 0 0 0 ${RANGE}`)
  if (look.edges & EDGE_RIGHT) rings.push(`inset -2px 0 0 0 ${RANGE}`)
  if (look.active) rings.push(`inset 0 0 0 ${look.editing ? 3 : 2}px ${ACTIVE}`)
  if (look.invalid) rings.push(`inset 0 0 0 1px ${INVALID}`)
  return rings.length === 0 ? undefined : { boxShadow: rings.join(', ') }
}

export type InputTone = 'default' | 'muted' | 'differs' | 'changed'

/**
 * The classes of a cell's text area. It grows with its text (`field-sizing: content`), and the row with it: up to
 * two lines while the cell is only shown, up to six while it is the active cell or edited, then it scrolls. Long
 * words break anywhere, so a URL wraps too. Monospace for keys and values that are written as they are; italic for
 * a mixed value; the text is selectable only while it is edited (the grid is not selectable, so a drag selects
 * cells).
 */
export function inputClassName(look: {
  mono: boolean
  tone: InputTone
  mixed: boolean
  editing: boolean
  /** The active cell or the edited one: it may grow to six lines */
  open: boolean
}): string {
  const parts = [
    'block min-h-6 w-full min-w-0 resize-none bg-transparent px-1.5 py-1 leading-4 text-zinc-950 outline-none',
    '[field-sizing:content] [overflow-wrap:anywhere]',
    'placeholder:text-zinc-400 read-only:cursor-default aria-invalid:text-red-600',
    'dark:text-white dark:placeholder:text-zinc-500 dark:aria-invalid:text-red-400',
  ]
  // two lines of 20 px under the top padding (a third line would show in the bottom padding), or six; past that
  // the text scrolls, only where it can be read in full
  parts.push(look.open ? 'max-h-[8.25rem] overflow-y-auto' : 'max-h-[2.875rem] overflow-hidden')
  // monospace looks larger than the sans-serif of the form at the same size: smaller, so the sheet matches the labels
  // and inputs, and keys such as name:etymology fit a sidebar column. One size class only: two would fight.
  parts.push(look.mono ? 'font-mono text-xs/5' : 'text-sm/5')
  if (look.mixed) parts.push('italic placeholder:italic')
  if (look.editing) parts.push('select-text')
  if (look.tone === 'muted') parts.push('text-zinc-500 dark:text-zinc-400')
  if (look.tone === 'differs') parts.push('text-amber-700 dark:text-amber-400')
  if (look.tone === 'changed') parts.push('bg-emerald-50 dark:bg-emerald-950/30')
  return parts.join(' ')
}

/**
 * The length counter of a text, from 10 characters before the limit (lengthNotice): "250 / 255 characters", and
 * "300 / 255 characters, 45 characters too long" over it. Undefined while the text is short.
 */
export function counterText(text: string): string | undefined {
  const notice = lengthNotice(text)
  if (notice === undefined) return undefined
  const counted = `${notice.length} / ${MAX_VALUE_LENGTH} characters`
  return notice.excess > 0 ? `${counted}, ${tooLongText(notice.excess)}` : counted
}

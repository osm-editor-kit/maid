/**
 * The state of one cell against the reference column (docs/research/way-table.md, 4.4 and 4.8). Pure.
 *
 * Keys and values are compared in the chain's direction: a reversed column shows its directional keys mirrored, and
 * its values are compared mirrored. The text of a cell is the stored value, and a write goes to the stored key (plan.ts).
 */
import { mirrorKey, mirrorValue } from './mirror.ts'
import type { Column } from './types.ts'

/**
 * - reference: the reference column, the key is present
 * - same: both have the key and the values are equal in chain direction
 * - different: both have the key and the values differ
 * - added: only this column has the key
 * - missing: only the reference has the key, this column lacks it
 * - empty: neither has the key (in the reference column: the key is absent)
 */
export type CellState = 'reference' | 'same' | 'different' | 'added' | 'missing' | 'empty'

/** One key of a column, in display (chain) direction */
export type CellView = {
  /** The key as shown: mirrored when the column is reversed */
  readonly key: string
  /** The key as stored on the way */
  readonly storedKey: string
  /** The stored value (the text of the cell) */
  readonly value: string
  /** The value as seen in chain direction (the comparison value) */
  readonly compare: string
  /** The key or the value means something else from the other direction, and the column is reversed */
  readonly dependent: boolean
}

/** The display view of a column: display key to its cell view. Empty values are not keys. */
export type ColumnView = ReadonlyMap<string, CellView>

export type Cell = {
  readonly state: CellState
  /** Direction-dependent: the cell is mirrored (marked with the arrows in the table) */
  readonly dependent: boolean
  /** The stored value, when the way has the key */
  readonly value?: string
}

/** The display view of a column (see `CellView`) */
export function viewOf(column: Column): ColumnView {
  const view = new Map<string, CellView>()
  for (const [storedKey, value] of Object.entries(column.tags)) {
    if (value === '') continue
    const key = column.reversed ? mirrorKey(storedKey) : storedKey
    const compare = column.reversed ? mirrorValue(storedKey, value, column.tags) : value
    view.set(key, {
      key,
      storedKey,
      value,
      compare,
      dependent: column.reversed && (key !== storedKey || compare !== value),
    })
  }
  return view
}

/**
 * The state of the cell of `key` in a column, against the reference's view. `isReference` is true for the
 * reference column itself.
 */
export function cellState(
  reference: ColumnView,
  view: ColumnView,
  key: string,
  isReference: boolean,
): Cell {
  const cell = view.get(key)
  const ref = reference.get(key)
  const value = cell?.value

  if (isReference) return { state: cell ? 'reference' : 'empty', dependent: false, value }
  if (!cell && !ref) return { state: 'empty', dependent: false }
  if (cell && !ref) return { state: 'added', dependent: cell.dependent, value }
  if (!cell && ref) return { state: 'missing', dependent: false }
  if (cell && ref) {
    const state: CellState = cell.compare === ref.compare ? 'same' : 'different'
    return { state, dependent: cell.dependent, value }
  }
  return { state: 'empty', dependent: false }
}

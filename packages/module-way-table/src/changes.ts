/**
 * The changes of a cell in this session, for "Highlight changes" (iD's highlight edits, key G on the map). Pure.
 *
 * A column's tags now are compared with its tags in the base data (the history's base graph, the data as loaded): both
 * in the same direction (the column's `reversed`), so a mirrored key lines up with the row it is shown in. Values are
 * compared as stored.
 */
import type { CellView, ColumnView } from './cell-state.ts'

/**
 * - unchanged: the way had the key with the same value
 * - modified: the value changed
 * - created: the key is new (or the whole way is)
 * - deleted: the key was removed
 */
export type ChangeKind = 'unchanged' | 'modified' | 'created' | 'deleted'

export type CellChange = {
  readonly kind: ChangeKind
  /** The value in the base data */
  readonly before?: string
  /** The value now */
  readonly after?: string
}

/**
 * The change of `key` in a column. `before` is the column's view in the base data; undefined: the way is new in this
 * session. Undefined when the way has the key neither before nor now.
 */
export function cellChange(
  before: ColumnView | undefined,
  now: ColumnView,
  key: string,
): CellChange | undefined {
  const after: CellView | undefined = now.get(key)
  const was: CellView | undefined = before?.get(key)
  if (!was && !after) return undefined
  if (!was && after) return { kind: 'created', after: after.value }
  if (was && !after) return { kind: 'deleted', before: was.value }
  if (was && after) {
    return was.value === after.value
      ? { kind: 'unchanged', before: was.value, after: after.value }
      : { kind: 'modified', before: was.value, after: after.value }
  }
  return undefined
}

/** A change that is one: modified, created or deleted */
export function isChange(change: CellChange | undefined): boolean {
  return change !== undefined && change.kind !== 'unchanged'
}

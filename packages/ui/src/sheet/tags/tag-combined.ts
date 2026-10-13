/**
 * The Tags sheet for several features (iD's raw tag editor for several: docs/research/multi-selection.md, 1.2).
 * The rows come from the combined tags of the selection: a key that every feature has with one value is a plain
 * row; a key whose values differ, or that some features lack, is a mixed row (its value cell has no text).
 *
 * A write is not a whole tag object but a list of operations for every feature (TagSheetChange): `set` writes a
 * key to all, `remove` deletes it where present, `rename` moves each feature's own value to the new key (iD
 * keyChange). Paste adds and overrides and never removes (decision 3 of 2026-10-13). No React, no DOM.
 */
import type { Tags } from '@osm-editor-kit/maid-presets'
import type { Combined, CombinedTags } from '../../inspector/fields/shared.ts'
import { serializeTags } from '../clipboard.ts'
import type {
  CellValue,
  RowId,
  SheetBatch,
  SheetCellData,
  SheetChange,
  SheetRow,
} from '../types.ts'
import type { TagModel } from './tag-model.ts'
import {
  cleanText,
  codeUnits,
  DUPLICATE,
  GONE,
  mint,
  NO_KEY,
  NONE,
  nextOrder,
  orderRows,
  READ_ONLY,
  type ReadOnlyKeys,
  type Refusal,
  replaceRow,
  rowKey,
  rowValue,
  type RowsOptions,
  NO_TAG_ROWS,
  type TagRows,
} from './tags.ts'

/** What one gesture of the sheet asks of every selected feature. Absent lists are empty. */
export type TagSheetChange = {
  /** Writes the key on every feature (an empty value never reaches here). */
  set?: Record<string, string>
  /** Deletes the key on every feature that has it. */
  remove?: string[]
  /** Moves the value of `from` to `to` on every feature that has `from`; the other features are not changed. */
  rename?: { from: string; to: string }[]
}

/** The cell value a combined entry shows: its one value, or the mixed values (and "no tag" when some lack it). */
export function cellValueOf(entry: Combined): CellValue {
  if (entry.kind === 'one') return { kind: 'value', text: entry.value }
  const values: { text: string | undefined; count?: number }[] = entry.values.map((text) => ({
    text,
  }))
  if (entry.missing) values.push({ text: undefined })
  return { kind: 'mixed', values }
}

/** Whether a cell value holds a tag on at least one feature (a text, or a mixed value). */
function present(value: CellValue | undefined): boolean {
  if (value === undefined) return false
  return value.kind === 'mixed' || value.text !== ''
}

function sameValue(a: CellValue | undefined, b: CellValue): boolean {
  if (a === undefined || a.kind !== b.kind) return false
  if (a.kind === 'value' && b.kind === 'value') return a.text === b.text
  if (a.kind !== 'mixed' || b.kind !== 'mixed') return false
  return (
    a.values.length === b.values.length &&
    a.values.every((entry, index) => {
      const other = b.values[index]
      return other !== undefined && entry.text === other.text && entry.count === other.count
    })
  )
}

function cellData(value: CellValue, readOnly: boolean): SheetCellData {
  const tone = value.kind === 'value' && value.text === '' ? 'muted' : 'default'
  return { value, readOnly, tone }
}

/** The row of a key with its cell value. */
function rowFor(id: RowId, key: string, value: CellValue, readOnly: boolean): SheetRow {
  return {
    id,
    label: key,
    readOnly,
    cells: {
      key: cellData({ kind: 'value', text: key }, readOnly),
      value: cellData(value, readOnly),
    },
  }
}

function sameRow(row: SheetRow, key: string, value: CellValue, readOnly: boolean): boolean {
  return (
    rowKey(row) === key &&
    sameValue(row.cells.value?.value, value) &&
    (row.readOnly === true) === readOnly
  )
}

/**
 * The rows for the combined tags of the selection. Rows keep their id and place while their key is still on a
 * feature (or an incomplete row is kept); a new key gets a row; a key that no feature has any more goes.
 */
export function rowsFromCombined(
  combined: CombinedTags,
  previous: TagRows,
  options: RowsOptions = {},
): TagRows {
  const readOnlyKey = options.readOnlyKeys ?? NONE
  const keepIncomplete = options.keepIncomplete ?? true
  const keys = new Set<string>()
  const kept: SheetRow[] = []
  for (const row of previous.rows) {
    const key = rowKey(row)
    if (key === '' || keys.has(key)) continue
    const entry = Object.hasOwn(combined, key) ? combined[key] : undefined
    const incomplete =
      keepIncomplete && row.cells.value?.value.kind === 'value' && rowValue(row) === ''
    const value: CellValue | undefined =
      entry !== undefined
        ? cellValueOf(entry)
        : incomplete
          ? { kind: 'value', text: '' }
          : undefined
    if (value === undefined) continue
    const readOnly = readOnlyKey(key)
    keys.add(key)
    kept.push(sameRow(row, key, value, readOnly) ? row : rowFor(row.id, key, value, readOnly))
  }
  let nextId = previous.nextId
  const used = new Set<RowId>(kept.map((row) => row.id))
  for (const key of Object.keys(combined).sort(codeUnits)) {
    const entry = combined[key]
    if (entry === undefined || keys.has(key)) continue
    const minted = mint(nextId, used)
    nextId = minted.nextId
    used.add(minted.id)
    kept.push(rowFor(minted.id, key, cellValueOf(entry), readOnlyKey(key)))
  }
  return orderRows({ rows: kept, nextId }, options.order ?? 'hold')
}

type Work = {
  rows: SheetRow[]
  nextId: number
  set: Record<string, string>
  remove: string[]
  rename: { from: string; to: string }[]
  /** Keys written where no feature had a tag: the label says "Added". */
  added: string[]
  refused: Refusal[]
}

function refuse(work: Work, key: string, reason: string): Work {
  return { ...work, refused: [...work.refused, { key, reason }] }
}

function findRow(work: Work, id: RowId): SheetRow | undefined {
  return work.rows.find((row) => row.id === id)
}

function keyTaken(work: Work, key: string): boolean {
  return work.rows.some((row) => rowKey(row) === key)
}

/** A key is written on every feature; a key written earlier in the gesture is replaced, not doubled. */
function putSet(work: Work, key: string, value: string, wasAbsent: boolean): Work {
  const set = { ...work.set, [key]: value }
  const remove = work.remove.filter((name) => name !== key)
  const added = wasAbsent && !work.added.includes(key) ? [...work.added, key] : work.added
  return { ...work, set, remove, added }
}

function putRemove(work: Work, key: string): Work {
  const set = Object.fromEntries(Object.entries(work.set).filter(([name]) => name !== key))
  const remove = work.remove.includes(key) ? work.remove : [...work.remove, key]
  return { ...work, set, remove }
}

function removeRow(work: Work, id: RowId, readOnlyKey: ReadOnlyKeys): Work {
  const row = findRow(work, id)
  if (!row) return work
  const key = rowKey(row)
  if (row.readOnly === true || readOnlyKey(key)) return refuse(work, key, READ_ONLY)
  const next = { ...work, rows: work.rows.filter((r) => r.id !== id) }
  return present(row.cells.value?.value) ? putRemove(next, key) : next
}

/**
 * A value typed into a row. A mixed cell that is left empty writes nothing (it has no text to clear), and a
 * text on a mixed cell writes it to every feature. An empty text on a plain row removes the key everywhere.
 */
function setValue(work: Work, id: RowId, text: string, readOnlyKey: ReadOnlyKeys): Work {
  const row = findRow(work, id)
  if (!row) return refuse(work, '', GONE)
  const key = rowKey(row)
  if (row.readOnly === true || readOnlyKey(key)) return refuse(work, key, READ_ONLY)
  const value = cleanText(text)
  const cell = row.cells.value?.value
  if (cell?.kind === 'mixed') {
    if (value === '') return work
    return writeValue(work, id, key, value, false)
  }
  const was = cell?.kind === 'value' ? cell.text : ''
  if (value === was) return work
  if (value === '') {
    const next = putRemove(work, key)
    return {
      ...next,
      rows: replaceRow(next.rows, id, rowFor(id, key, { kind: 'value', text: '' }, false)),
    }
  }
  return writeValue(work, id, key, value, !present(cell))
}

function writeValue(work: Work, id: RowId, key: string, value: string, wasAbsent: boolean): Work {
  const next = putSet(work, key, value, wasAbsent)
  return {
    ...next,
    rows: replaceRow(next.rows, id, rowFor(id, key, { kind: 'value', text: value }, false)),
  }
}

/**
 * Renames a key: the row keeps its id and place. A key that no feature has (an incomplete row) is only renamed in
 * the sheet; a key on some features is a `rename` for them, and each keeps its own value.
 */
function renameKey(work: Work, id: RowId, text: string, readOnlyKey: ReadOnlyKeys): Work {
  const row = findRow(work, id)
  if (!row) return refuse(work, '', GONE)
  const oldKey = rowKey(row)
  const newKey = cleanText(text)
  if (newKey === oldKey) return work
  if (newKey === '') return removeRow(work, id, readOnlyKey)
  if (row.readOnly === true || readOnlyKey(oldKey) || readOnlyKey(newKey)) {
    return refuse(work, newKey, READ_ONLY)
  }
  if (keyTaken(work, newKey)) return refuse(work, newKey, DUPLICATE)
  const cell: CellValue = row.cells.value?.value ?? { kind: 'value', text: '' }
  const moved = present(cell)
    ? { ...work, rename: [...work.rename, { from: oldKey, to: newKey }] }
    : work
  return { ...moved, rows: replaceRow(moved.rows, id, rowFor(id, newKey, cell, false)) }
}

/** A new row from the trailing row. A key alone is an incomplete row; a key and a value is written to all. */
function insertRow(
  work: Work,
  id: RowId,
  cells: Record<string, string>,
  readOnlyKey: ReadOnlyKeys,
): Work {
  const key = cleanText(cells.key ?? '')
  const value = cleanText(cells.value ?? '')
  if (key === '') return refuse(work, '', NO_KEY)
  if (readOnlyKey(key)) return refuse(work, key, READ_ONLY)
  if (keyTaken(work, key)) return refuse(work, key, DUPLICATE)
  const taken = work.rows.some((row) => row.id === id)
  const minted = taken
    ? mint(work.nextId, new Set(work.rows.map((row) => row.id)))
    : { id, nextId: work.nextId }
  const base: Work = {
    ...work,
    nextId: minted.nextId,
    rows: [...work.rows, rowFor(minted.id, key, { kind: 'value', text: value }, false)],
  }
  return value === '' ? base : putSet(base, key, value, true)
}

function applyChange(work: Work, change: SheetChange, readOnlyKey: ReadOnlyKeys): Work {
  switch (change.type) {
    case 'set':
      if (change.col === 'key') return renameKey(work, change.row, change.text, readOnlyKey)
      if (change.col === 'value') return setValue(work, change.row, change.text, readOnlyKey)
      return refuse(work, '', 'This column cannot be changed')
    case 'clear':
      if (change.col === 'key') return removeRow(work, change.row, readOnlyKey)
      if (change.col === 'value') return setValue(work, change.row, '', readOnlyKey)
      return refuse(work, '', 'This column cannot be changed')
    case 'insert':
      return insertRow(work, change.row, change.cells, readOnlyKey)
    case 'remove':
      return removeRow(work, change.row, readOnlyKey)
  }
}

/** The undo label of a change to several features, in the words of the single-feature sheet. */
function labelOf(work: Work): string | undefined {
  const setCount = Object.keys(work.set).length
  const removed = work.remove.length
  const renamed = work.rename.length
  if (setCount + removed + renamed === 0) return undefined
  if (renamed > 0 && setCount === 0 && removed === 0) {
    return renamed === 1 ? 'Renamed a tag' : `Renamed ${renamed} tags`
  }
  if (removed > 0 && setCount === 0 && renamed === 0) {
    return removed === 1 ? 'Removed a tag' : `Removed ${removed} tags`
  }
  if (setCount > 0 && removed === 0 && renamed === 0 && work.added.length === setCount) {
    return setCount === 1 ? 'Added a tag' : `Added ${setCount} tags`
  }
  return 'Changed tags'
}

function changeOf(work: Work): TagSheetChange | undefined {
  const set = Object.keys(work.set).length > 0 ? work.set : undefined
  const remove = work.remove.length > 0 ? work.remove : undefined
  const rename = work.rename.length > 0 ? work.rename : undefined
  if (set === undefined && remove === undefined && rename === undefined) return undefined
  return {
    ...(set === undefined ? {} : { set }),
    ...(remove === undefined ? {} : { remove }),
    ...(rename === undefined ? {} : { rename }),
  }
}

export type CombinedBatchResult = {
  rows: TagRows
  /** What to write to every feature; undefined when no feature changes. */
  change: TagSheetChange | undefined
  /** The undo label; undefined exactly when `change` is. */
  label: string | undefined
  refused: Refusal[]
}

/**
 * Turns one batch of the grid into rows and the operations for the features. The rows are the state the sheet
 * shows; the features are written by the host with `change`, once, with `label`. A refused change is listed and
 * the others still apply.
 */
export function applyCombinedBatch(
  previous: TagRows,
  batch: SheetBatch,
  options: { readOnlyKeys?: ReadOnlyKeys } = {},
): CombinedBatchResult {
  const readOnlyKey = options.readOnlyKeys ?? NONE
  const start: Work = {
    rows: previous.rows,
    nextId: previous.nextId,
    set: {},
    remove: [],
    rename: [],
    added: [],
    refused: [],
  }
  const work = batch.changes.reduce((acc, change) => applyChange(acc, change, readOnlyKey), start)
  const change = changeOf(work)
  return {
    rows: { rows: work.rows, nextId: work.nextId },
    change,
    label: change === undefined ? undefined : labelOf(work),
    refused: work.refused,
  }
}

/** The tags every selected feature has with one value (the mixed keys are left out): what a paste compares with. */
export function oneValuesOf(combined: CombinedTags): Tags {
  const tags: Tags = {}
  for (const [key, entry] of Object.entries(combined)) {
    if (entry.kind === 'one') tags[key] = entry.value
  }
  return tags
}

/**
 * "Copy all" for several features: every key as `key=value`, a mixed key as `key=*` (iD's text view writes `*`
 * for a mixed value, decision D11), sorted as the sheet shows them.
 */
export function copyAllCombinedText(combined: CombinedTags): string {
  return Object.keys(combined)
    .sort(codeUnits)
    .map((key) => {
      const entry = combined[key]
      if (entry === undefined) return ''
      return serializeTags({ [key]: entry.kind === 'one' ? entry.value : '*' })
    })
    .filter((line) => line !== '')
    .join('\n')
}

/** The model of a sheet for several features: the same rules of order and incomplete rows as for one. */
export function initialCombinedModel(
  featureKey: string,
  combined: CombinedTags,
  readOnlyKeys?: ReadOnlyKeys,
): TagModel {
  const select = nextOrder('select')
  return {
    featureKey,
    seen: combined,
    rows: rowsFromCombined(combined, NO_TAG_ROWS, {
      readOnlyKeys,
      order: select.order,
      keepIncomplete: select.keepIncomplete,
    }),
    order: select.order,
    keepIncomplete: select.keepIncomplete,
    version: 0,
  }
}

/** The host changed the combined tags: the rows follow them, in the order the model has. */
export function syncCombinedModel(
  model: TagModel,
  combined: CombinedTags,
  readOnlyKeys?: ReadOnlyKeys,
): TagModel {
  return {
    ...model,
    seen: combined,
    rows: rowsFromCombined(combined, model.rows, {
      readOnlyKeys,
      order: model.order,
      keepIncomplete: model.keepIncomplete,
    }),
  }
}

export type CombinedChange = {
  model: TagModel
  change: TagSheetChange | undefined
  label: string | undefined
  refused: Refusal[]
}

/** One batch of the grid for several features: a paste sorts at once; an edit holds the order and keeps incomplete rows. */
export function changeCombinedModel(
  model: TagModel,
  batch: SheetBatch,
  readOnlyKeys?: ReadOnlyKeys,
): CombinedChange {
  const event = batch.cause === 'paste' ? 'paste' : 'edit'
  const result = applyCombinedBatch(model.rows, batch, { readOnlyKeys })
  const next = nextOrder(event)
  const sorted = next.order === 'sorted'
  return {
    model: {
      ...model,
      rows: sorted ? orderRows(result.rows, 'sorted') : result.rows,
      order: next.order,
      keepIncomplete: next.keepIncomplete,
      version: sorted ? model.version + 1 : model.version,
    },
    change: result.change,
    label: result.label,
    refused: result.refused,
  }
}

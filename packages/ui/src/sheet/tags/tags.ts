/**
 * The tags of a feature as the rows of the sheet (packages/ui/src/sheet), and back. Pure: no React, no DOM.
 *
 * The host keeps a `TagRows` (the rows and the counter of the ids it mints) beside the sheet. The sheet shows
 * the rows and mints the id of its trailing row (`t<n>`); this file mints `tag<n>`, so the two never meet.
 * Every batch from the grid goes through `applyBatch`, which gives the next tags, the next rows and ONE undo
 * label. The trailing row is not in `rows`: the sheet renders it (`trailingRow`).
 *
 * Identity: a row's id belongs to the row, not to its key. A rename from the grid keeps the id, because the
 * batch says so (a `set` on the key cell). `rowsFromTags` matches rows to tags by key: a tag that goes and comes
 * back (undo, another editor) gets a new id. Ids never repeat, because the counter only goes up.
 *
 * Incomplete rows: a key without a value is a row without a tag. Maid never writes an empty value, so a row
 * whose value is '' is incomplete by definition. `nextOrder` says when they are kept (edit, paste) and when
 * they go (select, blur).
 *
 * Order: "sorted" is iD's order. raw_tag_editor.js sorts the keys with `Object.keys(tags).sort()`, which compares
 * UTF-16 code units: digits before letters, capitals before lower case, ':' before letters. the old tag list sorted
 * with localeCompare; this is a change. "hold" keeps the order of the rows and puts new keys last.
 */
import type { Tags } from '@osm-editor-kit/maid-presets'
import { excessOf, tooLongText } from '../../inspector/logic.ts'
import { serializeTags, type TagEntry, type TagParse } from '../clipboard.ts'
import type {
  CellRef,
  PasteReport,
  RowId,
  SheetBatch,
  SheetCellData,
  SheetChange,
  SheetColumn,
  SheetRow,
} from '../types.ts'

/** The rows of the Tags sheet and the counter of the ids this file mints. */
export type TagRows = { rows: SheetRow[]; nextId: number }

export const NO_TAG_ROWS: TagRows = { rows: [], nextId: 1 }

export type OrderMode = 'sorted' | 'hold'
export type OrderEvent = 'select' | 'edit' | 'paste' | 'blur'
export type ReadOnlyKeys = (key: string) => boolean

export const NONE: ReadOnlyKeys = () => false

export type RowsOptions = {
  /** Keys that are shown and never written (iD's readOnlyTags). Default: none. */
  readOnlyKeys?: ReadOnlyKeys
  /** Default 'hold'. */
  order?: OrderMode
  /** Keep the incomplete rows (keys without a value). Default true. */
  keepIncomplete?: boolean
}

export type Refusal = { key: string; reason: string }

export type BatchResult = {
  tags: Tags
  rows: TagRows
  /** The undo label. Undefined when no tag changed: then there is no undo step. */
  label: string | undefined
  refused: Refusal[]
}

export type PasteOptions = {
  readOnlyKeys?: ReadOnlyKeys
  /** Mints the id of each new row. Must not produce `t<digits>` (the sheet's ids) nor `tag<digits>` (ours). */
  newRowId: () => RowId
}

export type PastePlan = {
  /** Absent when the paste changes nothing. */
  batch?: SheetBatch
  report: PasteReport
  /** The first pasted row's value cell. */
  focus?: CellRef
  /** Keys that appeared twice in the text: the earlier line was replaced by the later one. */
  superseded: TagParse['superseded']
}

export const READ_ONLY = 'The key is read-only'
export const DUPLICATE = 'A tag with this key exists'
export const NO_KEY = 'A tag needs a key'
export const GONE = 'The row is no longer in the sheet'
const COLUMN = 'This column cannot be changed'

/** A key or value as the sheet stores it: trimmed and in Unicode NFC. Never cut. */
export function cleanText(text: string): string {
  return text.trim().normalize('NFC')
}

/** The text of a cell, or '' when it is not a plain value. */
function textOf(cell: SheetCellData | undefined): string {
  if (!cell || cell.value.kind !== 'value') return ''
  return cell.value.text
}

export function rowKey(row: SheetRow): string {
  return textOf(row.cells.key)
}

export function rowValue(row: SheetRow): string {
  return textOf(row.cells.value)
}

/**
 * The value of a key, or undefined when the feature does not have it. An empty value is no tag (Maid writes
 * none), and `hasOwn` keeps keys such as `constructor` from reading the prototype.
 */
function tagValue(tags: Tags, key: string): string | undefined {
  if (!Object.hasOwn(tags, key)) return undefined
  const value = tags[key]
  return value === undefined || value === '' ? undefined : value
}

function presentKeys(tags: Tags): string[] {
  return Object.keys(tags).filter((key) => tagValue(tags, key) !== undefined)
}

function without(tags: Tags, key: string): Tags {
  return Object.fromEntries(Object.entries(tags).filter(([name]) => name !== key))
}

/** iD's order: UTF-16 code units, as JavaScript's default string sort. */
export function codeUnits(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function cellOf(text: string, readOnly: boolean, tone: 'default' | 'muted'): SheetCellData {
  return { value: { kind: 'value', text }, readOnly, tone }
}

/** The row for a key and its value ('' for an incomplete row). */
export function rowOf(id: RowId, key: string, value: string, readOnly: boolean): SheetRow {
  return {
    id,
    label: key,
    readOnly,
    cells: {
      key: cellOf(key, readOnly, 'default'),
      value: cellOf(value, readOnly, value === '' ? 'muted' : 'default'),
    },
  }
}

function sameRow(row: SheetRow, key: string, value: string, readOnly: boolean): boolean {
  return rowKey(row) === key && rowValue(row) === value && (row.readOnly === true) === readOnly
}

export function replaceRow(rows: SheetRow[], id: RowId, next: SheetRow): SheetRow[] {
  return rows.map((row) => (row.id === id ? next : row))
}

export function mint(nextId: number, used: ReadonlySet<RowId>): { id: RowId; nextId: number } {
  let n = nextId
  while (used.has(`tag${n}`)) n++
  return { id: `tag${n}`, nextId: n + 1 }
}

/** The order the sheet shows: by key, iD's way. Sorting a sorted list gives the same object. */
export function orderRows(state: TagRows, mode: OrderMode): TagRows {
  if (mode === 'hold') return state
  const sorted = [...state.rows].sort((a, b) => codeUnits(rowKey(a), rowKey(b)))
  return sorted.every((row, index) => row === state.rows[index])
    ? state
    : { ...state, rows: sorted }
}

/**
 * What the events of the sheet do to the order and to the incomplete rows (decision 1 and 2 of 2026-10-13).
 * A new selection sorts and drops them; an edit holds the order and keeps them; a paste sorts at once and
 * keeps them (the focus stays in the sheet); leaving the sheet sorts and drops them.
 */
export function nextOrder(event: OrderEvent): { order: OrderMode; keepIncomplete: boolean } {
  switch (event) {
    case 'select':
      return { order: 'sorted', keepIncomplete: false }
    case 'edit':
      return { order: 'hold', keepIncomplete: true }
    case 'paste':
      return { order: 'sorted', keepIncomplete: true }
    case 'blur':
      return { order: 'sorted', keepIncomplete: false }
  }
}

/**
 * The rows for the tags of a feature. Rows keep their id and their place when their key is still a tag (or an
 * incomplete row is kept); a tag without a row gets one; a row whose tag went elsewhere goes. Unchanged rows are
 * returned as the same objects, so the sheet does not re-render them.
 */
export function rowsFromTags(tags: Tags, previous: TagRows, options: RowsOptions = {}): TagRows {
  const readOnlyKey = options.readOnlyKeys ?? NONE
  const keepIncomplete = options.keepIncomplete ?? true
  const keys = new Set<string>()
  const kept: SheetRow[] = []
  for (const row of previous.rows) {
    const key = rowKey(row)
    if (key === '' || keys.has(key)) continue
    const current = tagValue(tags, key)
    if (current === undefined && !(keepIncomplete && rowValue(row) === '')) continue
    const value = current ?? ''
    const readOnly = readOnlyKey(key)
    keys.add(key)
    kept.push(sameRow(row, key, value, readOnly) ? row : rowOf(row.id, key, value, readOnly))
  }
  let nextId = previous.nextId
  const used = new Set<RowId>(kept.map((row) => row.id))
  for (const key of Object.keys(tags).sort(codeUnits)) {
    const value = tagValue(tags, key)
    if (value === undefined || keys.has(key)) continue
    const minted = mint(nextId, used)
    nextId = minted.nextId
    used.add(minted.id)
    kept.push(rowOf(minted.id, key, value, readOnlyKey(key)))
  }
  return orderRows({ rows: kept, nextId }, options.order ?? 'hold')
}

/** The columns of the Tags sheet: the key is unique within the sheet, both are cleaned and checked for 255. */
function lengthMessage(text: string): string | undefined {
  const excess = excessOf(text)
  return excess > 0 ? tooLongText(excess) : undefined
}

export const TAG_COLUMNS: SheetColumn[] = [
  {
    id: 'key',
    header: 'Key',
    width: '1fr',
    mono: true,
    unique: true,
    clean: cleanText,
    validate: lengthMessage,
  },
  {
    id: 'value',
    header: 'Value',
    width: '1fr',
    mono: true,
    clean: cleanText,
    validate: lengthMessage,
  },
]

/** The undo label of a change of tags, in the words the app uses ("Changed tags" is the engine's default). */
export function tagChangeLabel(before: Tags, after: Tags): string | undefined {
  const added = presentKeys(after).filter((key) => tagValue(before, key) === undefined).length
  const removed = presentKeys(before).filter((key) => tagValue(after, key) === undefined).length
  const changed = presentKeys(after).filter((key) => {
    const was = tagValue(before, key)
    return was !== undefined && was !== tagValue(after, key)
  }).length
  if (added + removed + changed === 0) return undefined
  if (changed === 0 && removed === 0) return added === 1 ? 'Added a tag' : `Added ${added} tags`
  if (changed === 0 && added === 0)
    return removed === 1 ? 'Removed a tag' : `Removed ${removed} tags`
  return 'Changed tags'
}

type Work = { tags: Tags; rows: SheetRow[]; nextId: number; refused: Refusal[] }

function refuse(work: Work, key: string, reason: string): Work {
  return { ...work, refused: [...work.refused, { key, reason }] }
}

function keyTaken(work: Work, key: string): boolean {
  return work.rows.some((row) => rowKey(row) === key) || tagValue(work.tags, key) !== undefined
}

function findRow(work: Work, id: RowId): SheetRow | undefined {
  return work.rows.find((row) => row.id === id)
}

function removeRow(work: Work, id: RowId, readOnlyKey: ReadOnlyKeys): Work {
  const row = findRow(work, id)
  if (!row) return work
  const key = rowKey(row)
  if (row.readOnly === true || readOnlyKey(key)) return refuse(work, key, READ_ONLY)
  return { ...work, tags: without(work.tags, key), rows: work.rows.filter((r) => r.id !== id) }
}

function setValue(work: Work, id: RowId, text: string, readOnlyKey: ReadOnlyKeys): Work {
  const row = findRow(work, id)
  if (!row) return refuse(work, '', GONE)
  const key = rowKey(row)
  if (row.readOnly === true || readOnlyKey(key)) return refuse(work, key, READ_ONLY)
  const value = cleanText(text)
  if (value === (tagValue(work.tags, key) ?? '')) return work
  const tags = value === '' ? without(work.tags, key) : { ...work.tags, [key]: value }
  return { ...work, tags, rows: replaceRow(work.rows, id, rowOf(id, key, value, false)) }
}

/** Renames the key of a row: the tag moves to the new key with its value, and the row keeps its id and place. */
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
  const value = tagValue(work.tags, oldKey)
  const rest = without(work.tags, oldKey)
  const tags = value === undefined ? rest : { ...rest, [newKey]: value }
  return { ...work, tags, rows: replaceRow(work.rows, id, rowOf(id, newKey, value ?? '', false)) }
}

/** A new row from the trailing row: a key alone is an incomplete row (no tag), a key and a value is a tag. */
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
  return {
    ...work,
    nextId: minted.nextId,
    tags: value === '' ? work.tags : { ...work.tags, [key]: value },
    rows: [...work.rows, rowOf(minted.id, key, value, false)],
  }
}

function applyChange(work: Work, change: SheetChange, readOnlyKey: ReadOnlyKeys): Work {
  switch (change.type) {
    case 'set':
      if (change.col === 'key') return renameKey(work, change.row, change.text, readOnlyKey)
      if (change.col === 'value') return setValue(work, change.row, change.text, readOnlyKey)
      return refuse(work, '', COLUMN)
    case 'clear':
      if (change.col === 'key') return removeRow(work, change.row, readOnlyKey)
      if (change.col === 'value') return setValue(work, change.row, '', readOnlyKey)
      return refuse(work, '', COLUMN)
    case 'insert':
      return insertRow(work, change.row, change.cells, readOnlyKey)
    case 'remove':
      return removeRow(work, change.row, readOnlyKey)
  }
}

/**
 * Turns every change of one gesture into the next tags and rows. The result is one undo step for the host
 * (`label`), or none when no tag changed. A change that cannot be made is refused and listed; the others
 * still apply. The order of the rows is kept: the caller sorts (`orderRows`) when the event asks for it.
 */
export function applyBatch(
  tags: Tags,
  previous: TagRows,
  batch: SheetBatch,
  options: { readOnlyKeys?: ReadOnlyKeys } = {},
): BatchResult {
  const readOnlyKey = options.readOnlyKeys ?? NONE
  const start: Work = { tags, rows: previous.rows, nextId: previous.nextId, refused: [] }
  const work = batch.changes.reduce((acc, change) => applyChange(acc, change, readOnlyKey), start)
  const label = tagChangeLabel(tags, work.tags)
  return {
    tags: label === undefined ? tags : work.tags,
    rows: { rows: work.rows, nextId: work.nextId },
    label,
    refused: work.refused,
  }
}

/**
 * What a paste does (decision 3): a key that is new is added, a key that exists gets the pasted value, and no
 * tag is ever removed. A read-only key is refused and counted. The batch is one step; the caller applies it,
 * then sorts with `orderRows(..., nextOrder('paste').order)`.
 */
export function planTagPaste(
  parsed: TagParse,
  tags: Tags,
  previous: TagRows,
  options: PasteOptions,
): PastePlan {
  const readOnlyKey = options.readOnlyKeys ?? NONE
  const report: PasteReport = {
    added: 0,
    replaced: 0,
    unchanged: 0,
    refused: parsed.refused.map((refusal) => ({
      line: refusal.line,
      text: refusal.text,
      reason: refusal.reason,
    })),
  }
  const changes: SheetChange[] = []
  const pasted: RowId[] = []
  // one entry per key, the last one wins (the parser already does this; a host's own parse may not)
  const byKey = new Map(parsed.entries.map((entry): [string, TagEntry] => [entry.key, entry]))
  for (const entry of byKey.values()) {
    const key = cleanText(entry.key)
    const value = cleanText(entry.value)
    if (key === '' || value === '') {
      report.refused.push({
        line: entry.line,
        text: `${entry.key}=${entry.value}`,
        reason: 'The line has no key or no value',
      })
      continue
    }
    const row = previous.rows.find((candidate) => rowKey(candidate) === key)
    if (readOnlyKey(key) || row?.readOnly === true) {
      report.refused.push({ line: entry.line, text: `${key}=${value}`, reason: READ_ONLY })
      continue
    }
    // A mixed row (several features, tag-combined.ts) has no single current value: a paste always writes it.
    // Copying a mixed row gives `key=*`; that line is refused, so the `*` never becomes a tag value.
    const mixed = row?.cells.value?.value.kind === 'mixed'
    if (mixed && value === '*') {
      report.refused.push({
        line: entry.line,
        text: `${key}=${value}`,
        reason: '"*" stands for several values and is not written',
      })
      continue
    }
    const current = tagValue(tags, key)
    if (row && !mixed && current === value) {
      report.unchanged += 1
    } else if (row) {
      changes.push({ type: 'set', row: row.id, col: 'value', text: value })
      pasted.push(row.id)
      if (current === undefined && !mixed) report.added += 1
      else report.replaced += 1
    } else {
      const id = options.newRowId()
      changes.push({ type: 'insert', row: id, cells: { key, value } })
      pasted.push(id)
      report.added += 1
    }
  }
  const first = pasted[0]
  return {
    batch: changes.length > 0 ? { cause: 'paste', changes } : undefined,
    report,
    focus: first === undefined ? undefined : { row: first, col: 'value' },
    superseded: parsed.superseded,
  }
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/** The line under the sheet after a paste: "5 tags pasted, 2 replaced", "No tag pasted: 2 lines could not be read". */
export function describePaste(report: PasteReport): string {
  const touched = report.added + report.replaced
  const refused = report.refused.length
  const lines = `${refused} ${plural(refused, 'line', 'lines')}`
  if (touched === 0) {
    if (refused > 0) return `No tag pasted: ${lines} could not be read`
    if (report.unchanged > 0) {
      const tags = `${report.unchanged} ${plural(report.unchanged, 'tag', 'tags')}`
      return `No tag pasted: ${tags} already ${plural(report.unchanged, 'has', 'have')} this value`
    }
    return 'No tag pasted'
  }
  let text = `${touched} ${plural(touched, 'tag', 'tags')} pasted`
  if (report.replaced > 0) text += `, ${report.replaced} replaced`
  if (report.unchanged > 0) text += `, ${report.unchanged} unchanged`
  if (refused > 0) text += `. ${lines} could not be read`
  return text
}

function linesOf(pairs: { key: string; value: string }[]): string {
  return pairs
    .map(({ key, value }) => serializeTags({ [key]: value }))
    .filter((line) => line !== '')
    .join('\n')
}

/** "Copy all": every tag as `key=value`, in the order the sheet shows (sorted). */
export function copyAllText(tags: Tags): string {
  return linesOf(
    presentKeys(tags)
      .sort(codeUnits)
      .map((key) => ({ key, value: tagValue(tags, key) ?? '' })),
  )
}

/** Copy of selected rows, in the order shown. Incomplete rows are left out; a mixed value copies as `*`. */
export function copyRowsText(rows: readonly SheetRow[]): string {
  return linesOf(
    rows.map((row) => {
      const cell = row.cells.value
      const value = cell?.value.kind === 'mixed' ? '*' : rowValue(row)
      return { key: rowKey(row), value }
    }),
  )
}

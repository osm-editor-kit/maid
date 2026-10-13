/**
 * The clipboard functions of the sheet, pure (no React, no DOM; docs/research/sheet-design.md
 * sections 3 (a) and 6): spreadsheet text (TSV) for the grid, and the tag forms of the Tags use
 * (`key=value` lines, Overpass and JOSM quoting, a JSON object).
 */
import { z } from 'zod'
import type {
  CellRef,
  ColId,
  PasteReport,
  RowId,
  SheetChange,
  SheetColumn,
  SheetRow,
} from './types.ts'

const BOM = '﻿'

/** The text clean that every commit uses: NFC, and no outer spaces. Never shortens a value. */
function clean(text: string): string {
  return text.normalize('NFC').trim()
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

/** A JSON string is read as the string it holds (iD's `unstringify`); anything else stays as it is. */
function unquote(text: string): string {
  if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) return text
  const parsed = parseJson(text)
  const string = z.string().safeParse(parsed.ok ? parsed.value : undefined)
  return string.success ? string.data : text
}

/** Trim, then unquote, then the clean. */
function tidy(text: string): string {
  return clean(unquote(text.trim()))
}

// ---------------------------------------------------------------------------------------------
// Spreadsheet text (TSV)
// ---------------------------------------------------------------------------------------------

/**
 * Parses clipboard text as spreadsheets write it: tabs between cells, line breaks (LF, CRLF or CR)
 * between rows, and cells in double quotes that may hold tabs and line breaks, with `""` for a
 * quote. A line break at the very end is ignored. Empty text has no rows; a single empty line is
 * one empty cell.
 */
export function parseTsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let pending = false
  let fieldStart = true
  let i = 0
  while (i < src.length) {
    const ch = src.charAt(i)
    if (fieldStart && ch === '"') {
      pending = true
      fieldStart = false
      i += 1
      while (i < src.length) {
        if (src.charAt(i) === '"') {
          if (src.charAt(i + 1) === '"') {
            cell += '"'
            i += 2
            continue
          }
          i += 1
          break
        }
        cell += src.charAt(i)
        i += 1
      }
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
      pending = true
      fieldStart = true
      i += 1
      continue
    }
    if (ch === '\r' || ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      pending = false
      fieldStart = true
      i += ch === '\r' && src.charAt(i + 1) === '\n' ? 2 : 1
      continue
    }
    cell += ch
    pending = true
    fieldStart = false
    i += 1
  }
  if (pending) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function quoteTsvCell(cell: string): string {
  return /["\t\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell
}

/**
 * Writes rows as spreadsheets read them: tabs, `\n` between rows, no line break at the end.
 * A cell with a quote, a tab or a line break is quoted. A row of one empty cell is written as `""`
 * so that it is not lost at the end of the text. A row without cells is written as an empty line,
 * which reads back as one empty cell: only rows with cells round-trip exactly.
 */
export function serializeTsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => (row.length === 1 && row[0] === '' ? '""' : row.map(quoteTsvCell).join('\t')))
    .join('\n')
}

// ---------------------------------------------------------------------------------------------
// Positional paste (a block of cells onto cells or a range)
// ---------------------------------------------------------------------------------------------

export type PasteGrid = {
  /** The real rows (the trailing row is not a `SheetRow`, see types.ts) */
  rows: readonly SheetRow[]
  columns: readonly SheetColumn[]
  /**
   * The sheet's empty trailing row, when it has one. It is the position just past `rows`: a cell
   * on it is written as an insert. The first block row that lands on it, and every row past it,
   * becomes an insert with a minted id. Without it, rows past the last row are refused.
   */
  trailingId?: RowId
  /** Mints the id of each inserted row */
  newRowId: () => RowId
}

/** The text pasted and the selected cells; no selected cells means the target alone. */
export type PasteState = { text: string; selection: readonly CellRef[] }

export type PositionalPlan = { changes: SheetChange[]; report: PasteReport }

/**
 * Plans a paste of spreadsheet text, as a spreadsheet does it:
 * - one value fills the whole selected range; a block starts at the top left of the range (or at
 *   the target) and is written as it is, even when it is larger than the range;
 * - a cell that would be written past the last column is dropped and refused;
 * - a block row on the trailing row, or past it, is an insert (the trailing row's first commit);
 * - a read-only cell is refused when the text would change it, and counted as unchanged when the
 *   text is the same;
 * - an empty text clears a cell; an empty text on an empty cell changes nothing.
 * Each refused cell is one entry in `report.refused`, with the block row as its line (1 for a
 * single value). Cleaning follows the column's `clean`.
 */
export function planPositionalPaste(
  grid: PasteGrid,
  target: CellRef,
  state: PasteState,
): PositionalPlan {
  const report: PasteReport = { added: 0, replaced: 0, unchanged: 0, refused: [] }
  const block = parseTsv(state.text)
  const rowIndex = new Map<RowId, number>()
  grid.rows.forEach((row, index) => rowIndex.set(row.id, index))
  // The trailing row is the position just past the last real row
  const positionOf = (id: RowId): number | undefined =>
    id === grid.trailingId ? grid.rows.length : rowIndex.get(id)
  const colIndex = new Map<ColId, number>()
  grid.columns.forEach((col, index) => colIndex.set(col.id, index))

  const picked = state.selection.length > 0 ? state.selection : [target]
  let top = Infinity
  let bottom = -1
  let left = Infinity
  let right = -1
  for (const cell of picked) {
    const r = positionOf(cell.row)
    const c = colIndex.get(cell.col)
    if (r === undefined || c === undefined) continue
    top = Math.min(top, r)
    bottom = Math.max(bottom, r)
    left = Math.min(left, c)
    right = Math.max(right, c)
  }
  if (bottom < 0 || block.length === 0) return { changes: [], report }

  type Write = { row: number; col: number; text: string; line: number }
  const writes: Write[] = []
  const single = block.length === 1 && block[0]?.length === 1
  if (single) {
    const value = block[0]?.[0] ?? ''
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) writes.push({ row: r, col: c, text: value, line: 1 })
    }
  } else {
    block.forEach((cells, i) =>
      cells.forEach((text, j) => writes.push({ row: top + i, col: left + j, text, line: i + 1 })),
    )
  }

  const changes: SheetChange[] = []
  const inserts = new Map<number, Record<ColId, string>>()
  const refuse = (w: Write, reason: string) =>
    report.refused.push({ line: w.line, text: w.text, reason })

  for (const w of writes) {
    const col = grid.columns[w.col]
    if (col === undefined) {
      if (w.text !== '') refuse(w, 'outside the sheet')
      continue
    }
    if (w.row >= grid.rows.length) {
      if (grid.trailingId === undefined) {
        if (w.text !== '') refuse(w, 'below the last row')
        continue
      }
      if (col.readOnly === true) {
        if (w.text !== '') refuse(w, 'read-only')
        continue
      }
      const text = col.clean ? col.clean(w.text) : w.text
      if (text === '') continue
      const cells: Record<ColId, string> = inserts.get(w.row) ?? {}
      cells[col.id] = text
      inserts.set(w.row, cells)
      report.added += 1
      continue
    }

    const row = grid.rows[w.row]
    if (row === undefined) continue
    const cell = row.cells[col.id]
    const current = cell?.value
    // undefined: several values (mixed); '' for an absent or empty cell
    const currentText =
      current === undefined ? '' : current.kind === 'value' ? current.text : undefined
    const next = col.clean ? col.clean(w.text) : w.text
    const readOnly = row.readOnly === true || col.readOnly === true || cell?.readOnly === true
    if (readOnly) {
      if (next === currentText) report.unchanged += 1
      else refuse(w, 'read-only')
      continue
    }
    if (currentText === undefined) {
      if (next === '') {
        report.unchanged += 1
        continue
      }
      changes.push({ type: 'set', row: row.id, col: col.id, text: next })
      report.replaced += 1
      continue
    }
    if (next === currentText) {
      report.unchanged += 1
      continue
    }
    if (next === '') {
      changes.push({ type: 'clear', row: row.id, col: col.id })
      report.replaced += 1
      continue
    }
    changes.push({ type: 'set', row: row.id, col: col.id, text: next })
    if (currentText === '') report.added += 1
    else report.replaced += 1
  }

  const sortedInserts = [...inserts].sort(([a], [b]) => a - b)
  for (const [, cells] of sortedInserts) {
    changes.push({ type: 'insert', row: grid.newRowId(), cells })
  }
  return { changes, report }
}

// ---------------------------------------------------------------------------------------------
// Tags as text (paste and copy of the Tags use)
// ---------------------------------------------------------------------------------------------

export type TagEntry = { key: string; value: string; line: number }
export type TagRefusal = { line: number; text: string; reason: string }
export type TagParse = {
  /** One entry per key, in the order the key first appears, with the value and line of its last appearance */
  entries: TagEntry[]
  /** Each refused line (line 0 for an entry of a JSON object, which is not a line) */
  refused: TagRefusal[]
  /** A key that appears again: the earlier line is replaced by the later one */
  superseded: { key: string; line: number; by: number }[]
}

type TagSink = ReturnType<typeof tagSink>

function tagSink() {
  const entries = new Map<string, TagEntry>()
  const refused: TagRefusal[] = []
  const superseded: TagParse['superseded'] = []
  const refuse = (line: number, text: string, reason: string): void => {
    refused.push({ line, text, reason })
  }
  const add = (line: number, text: string, key: string, value: string): void => {
    if (key === '') return refuse(line, text, 'empty key')
    if (value === '') return refuse(line, text, 'empty value')
    const earlier = entries.get(key)
    if (earlier !== undefined) superseded.push({ key, line: earlier.line, by: line })
    entries.set(key, { key, value, line })
  }
  const result = (): TagParse => ({ entries: [...entries.values()], refused, superseded })
  return { refuse, add, result }
}

const jsonObject = z.record(z.string(), z.unknown())
const jsonText = z.union([z.string(), z.number(), z.boolean()])

/** A JSON object of values: the tags (or the object under `tags` or `properties`). */
function readJsonTags(json: unknown, sink: TagSink): void {
  const top = jsonObject.safeParse(json)
  if (!top.success) {
    sink.refuse(0, '', 'not an object')
    return
  }
  const nested = jsonObject.safeParse(top.data.tags ?? top.data.properties)
  const source = nested.success ? nested.data : top.data
  for (const [key, raw] of Object.entries(source)) {
    const value = jsonText.safeParse(raw)
    if (!value.success) {
      sink.refuse(0, key, 'not a text')
      continue
    }
    sink.add(0, key, clean(key), clean(String(value.data)))
  }
}

type PairSplit = { ok: true; key: string; value: string } | { ok: false; reason: string }

/** A key in double quotes, followed by `=` or a tab (Overpass and JOSM: `"key"="value"`). */
function quotedKeyPair(part: string): { key: string; value: string } | undefined {
  const head = part.trimStart()
  if (!head.startsWith('"')) return undefined
  let close = -1
  for (let i = 1; i < head.length && close < 0; i++) {
    const ch = head.charAt(i)
    if (ch === '\\') i += 1
    else if (ch === '"') close = i
  }
  if (close < 0) return undefined
  let at = close + 1
  while (head.charAt(at) === ' ') at += 1
  const separator = head.charAt(at)
  if (separator !== '=' && separator !== '\t') return undefined
  return {
    key: clean(unquote(head.slice(0, close + 1))),
    value: tidy(head.slice(at + 1)),
  }
}

/** The first tab or `=` of the line, whichever comes first; -1 when there is neither. */
function plainSeparator(part: string): number {
  const equals = part.indexOf('=')
  const tab = part.indexOf('\t')
  if (tab >= 0 && (equals < 0 || tab < equals)) return tab
  return equals
}

function splitPair(part: string): PairSplit {
  const quoted = quotedKeyPair(part)
  if (quoted !== undefined) return { ok: true, ...quoted }
  const at = plainSeparator(part)
  if (at < 0) return { ok: false, reason: 'no separator' }
  return { ok: true, key: tidy(part.slice(0, at)), value: tidy(part.slice(at + 1)) }
}

/** A line in Overpass form, `[k=v][k2=v2]`, gives its parts; any other line is one part. */
function overpassParts(raw: string): string[] {
  const body = raw.trim()
  if (body.length >= 2 && body.startsWith('[') && body.endsWith(']')) {
    return body.slice(1, -1).split('][')
  }
  return [raw]
}

function readLine(raw: string, line: number, sink: TagSink): void {
  const body = raw.trim()
  if (body === '' || body.startsWith('#') || body.startsWith('//')) return
  for (const part of overpassParts(raw)) {
    const text = part.trim()
    if (text === '') continue
    const pair = splitPair(part)
    if (!pair.ok) sink.refuse(line, text, pair.reason)
    else sink.add(line, text, pair.key, pair.value)
  }
}

/**
 * Reads tags from pasted text. Tried in this order:
 * 1. The text starts with `{` and is JSON: an object of text values (numbers and booleans become
 *    text; `null`, arrays and objects are refused per key). An object under `tags` or `properties`
 *    is used instead when it is an object. Starts with `[` and is a JSON array: refused as a whole.
 * 2. Else line by line (LF, CRLF or CR). Empty lines and lines starting with `#` or `//` are
 *    skipped. A pair of surrounding `[` `]` is removed and `][` splits a line (Overpass).
 *    A tab before any `=` separates key from value; else the first `=` does (the value may hold
 *    more `=`). Both sides are trimmed, a value in double quotes is read as a JSON string, then
 *    NFC and trim. A key in double quotes may hold `=`.
 * Refused: no separator, an empty key, an empty value (never a removal). A key or value over 255
 * characters is kept. A BOM at the start is ignored.
 */
export function parseTagText(text: string): TagParse {
  const src = text.startsWith(BOM) ? text.slice(1) : text
  const sink = tagSink()
  const body = src.trim()
  if (body.startsWith('{')) {
    const json = parseJson(body)
    if (json.ok) {
      readJsonTags(json.value, sink)
      return sink.result()
    }
  } else if (body.startsWith('[')) {
    const json = parseJson(body)
    if (json.ok && z.array(z.unknown()).safeParse(json.value).success) {
      sink.refuse(0, body, 'a JSON array, not tags')
      return sink.result()
    }
  }
  src.split(/\r\n|\n|\r/).forEach((raw, index) => readLine(raw, index + 1, sink))
  return sink.result()
}

function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 32) return true
  }
  return false
}

function needsQuotes(text: string): boolean {
  return text.includes('"') || text.includes('\\') || hasControl(text)
}

function keyText(key: string): string {
  const special =
    key.includes('=') || key.startsWith('#') || key.startsWith('[') || key.startsWith('/')
  return special || needsQuotes(key) ? JSON.stringify(key) : key
}

/**
 * Writes tags as `key=value` lines, in the order given, with no line break at the end. A key or a
 * value is written as a JSON string (in double quotes, with `\"`, `\\`, `\n`, `\t` escapes) when it
 * holds a quote, a backslash or a control character, and a key also when it holds `=` or starts
 * with `#`, `[` or `/`. Empty keys and values are left out. Outer spaces are not kept (the parse
 * trims them, as iD does).
 */
export function serializeTags(tags: Readonly<Record<string, string>>): string {
  return Object.entries(tags)
    .filter(([key, value]) => key !== '' && value !== '')
    .map(([key, value]) => `${keyText(key)}=${needsQuotes(value) ? JSON.stringify(value) : value}`)
    .join('\n')
}

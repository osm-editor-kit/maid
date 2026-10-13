/**
 * What a paste and a copy do in the Tags sheet (design section 6), as plain functions: which route a paste takes,
 * the plan of each route, and the text of a copy of some cells. No React, no DOM.
 */
import type { Tags } from '@osm-editor-kit/maid-presets'
import { parseTagText, planPositionalPaste } from '../clipboard.ts'
import type {
  CellRef,
  ColId,
  PasteReport,
  RowId,
  SheetChange,
  SheetColumn,
  SheetRow,
} from '../types.ts'
import {
  copyRowsText,
  planTagPaste,
  rowKey,
  rowValue,
  type ReadOnlyKeys,
  type TagRows,
} from './tags.ts'

/**
 * - `native`: the browser pastes into the input (edit mode, a value cell, or a key cell with plain text).
 * - `tags`: the text is `key=value` lines (planTagPaste).
 * - `positional`: one line into value cells (a single value, filling a range).
 * - `refuse`: several lines into one value cell, which one value cannot take.
 */
export type PasteRoute = 'native' | 'tags' | 'positional' | 'refuse'

export function tagPasteRoute(input: {
  text: string
  editing: boolean
  /** The anchor is in the key column */
  anchorIsKey: boolean
  /** The anchor is not a row of the sheet: the trailing row */
  anchorOnNewRow: boolean
  selectionHasKey: boolean
  oneLine: boolean
  /** Every line of the text reads as a tag */
  linesParse: boolean
}): PasteRoute {
  if (input.editing) {
    // In an open edit only a key cell takes tags, and only when the text is more than a key
    return input.anchorIsKey && /[=\t\r\n]/.test(input.text) ? 'tags' : 'native'
  }
  if (input.anchorIsKey || input.anchorOnNewRow || input.selectionHasKey) return 'tags'
  if (input.oneLine) return 'positional'
  return input.linesParse ? 'tags' : 'refuse'
}

export type TagPasteInput = {
  text: string
  rows: SheetRow[]
  columns: SheetColumn[]
  anchor: CellRef
  selection: CellRef[]
  editing: boolean
  newRowId: () => RowId
}

export type TagPasteContext = {
  tags: Tags
  previous: TagRows
  readOnlyKeys?: ReadOnlyKeys
}

export type TagPasteResult =
  | { changes: SheetChange[]; report: PasteReport; focus?: CellRef }
  | 'native'

/** The paste plan of the Tags sheet, for the grid's `clipboard.plan`. */
export function planTagsPaste(input: TagPasteInput, context: TagPasteContext): TagPasteResult {
  const parsed = parseTagText(input.text)
  const route = tagPasteRoute({
    text: input.text,
    editing: input.editing,
    anchorIsKey: input.anchor.col === 'key',
    anchorOnNewRow: !input.rows.some((row) => row.id === input.anchor.row),
    selectionHasKey: input.selection.some((cell) => cell.col === 'key'),
    oneLine: !/[\r\n]/.test(input.text),
    linesParse: parsed.refused.length === 0,
  })
  switch (route) {
    case 'native':
      return 'native'
    case 'refuse': {
      const firstLine = input.text.split(/\r\n|\n|\r/)[0] ?? ''
      return {
        changes: [],
        report: {
          added: 0,
          replaced: 0,
          unchanged: 0,
          refused: [{ line: 1, text: firstLine, reason: 'Several lines cannot go into one value' }],
        },
      }
    }
    case 'positional':
      return planPositionalPaste(
        { rows: input.rows, columns: input.columns, newRowId: input.newRowId },
        input.anchor,
        { text: input.text, selection: input.selection },
      )
    case 'tags': {
      const plan = planTagPaste(parsed, context.tags, context.previous, {
        readOnlyKeys: context.readOnlyKeys,
        newRowId: input.newRowId,
      })
      return {
        changes: plan.batch?.changes ?? [],
        report: plan.report,
        ...(plan.focus === undefined ? {} : { focus: plan.focus }),
      }
    }
  }
}

/**
 * The text of a copy of some cells. Both columns: `key=value` lines (copyRowsText). The key column alone: the keys.
 * The value column alone: the values. One per line, in the order of the rows.
 */
export function serializeTagCells(rows: readonly SheetRow[], cols: readonly ColId[]): string {
  const hasKey = cols.includes('key')
  const hasValue = cols.includes('value')
  if (hasKey && hasValue) return copyRowsText(rows)
  if (hasKey) return rows.map(rowKey).join('\n')
  if (hasValue) {
    return rows
      .map((row) => (row.cells.value?.value.kind === 'mixed' ? '*' : rowValue(row)))
      .join('\n')
  }
  return ''
}

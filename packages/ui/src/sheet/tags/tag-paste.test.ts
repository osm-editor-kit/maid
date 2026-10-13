import { describe, expect, it } from 'bun:test'
import type { Tags } from '@osm-editor-kit/maid-presets'
import type { SheetRow } from '../types.ts'
import { planTagsPaste, serializeTagCells, tagPasteRoute } from './tag-paste.ts'
import { rowsFromTags, NO_TAG_ROWS, TAG_COLUMNS } from './tags.ts'

const base = {
  text: 'surface=asphalt',
  editing: false,
  anchorIsKey: false,
  anchorOnNewRow: false,
  selectionHasKey: false,
  oneLine: true,
  linesParse: true,
}

describe('tagPasteRoute: which path a paste takes', () => {
  it('in an open edit only a key cell takes tags, and only for text with = or a tab or a line break', () => {
    expect(tagPasteRoute({ ...base, text: 'plain', editing: true, anchorIsKey: true })).toBe(
      'native',
    )
    expect(tagPasteRoute({ ...base, editing: true, anchorIsKey: true, text: 'a=b' })).toBe('tags')
    expect(tagPasteRoute({ ...base, editing: true, anchorIsKey: true, text: 'plain' })).toBe(
      'native',
    )
    expect(tagPasteRoute({ ...base, editing: true, anchorIsKey: false, text: 'a=b' })).toBe(
      'native',
    )
  })

  it('a key cell, the trailing row or a selection with keys takes tags', () => {
    expect(tagPasteRoute({ ...base, anchorIsKey: true })).toBe('tags')
    expect(tagPasteRoute({ ...base, anchorOnNewRow: true })).toBe('tags')
    expect(tagPasteRoute({ ...base, selectionHasKey: true })).toBe('tags')
  })

  it('a single line in a value cell is that value, filling the range', () => {
    expect(tagPasteRoute({ ...base, text: 'https://example.org/?a=1' })).toBe('positional')
  })

  it('several lines in a value cell are tags when every line reads, else refused whole', () => {
    expect(tagPasteRoute({ ...base, oneLine: false, linesParse: true })).toBe('tags')
    expect(tagPasteRoute({ ...base, oneLine: false, linesParse: false })).toBe('refuse')
  })
})

const names: Tags = { highway: 'residential', name: 'A' }
function sheetRows(tags: Tags): SheetRow[] {
  return rowsFromTags(tags, NO_TAG_ROWS).rows
}
let counter = 0
const newRowId = () => {
  counter += 1
  return `new-${counter}`
}

describe('planTagsPaste: the plan of a paste into the Tags sheet', () => {
  it('a line with a key that is new is an insert; the report counts it', () => {
    const rows = sheetRows(names)
    const previous = rowsFromTags(names, NO_TAG_ROWS)
    const plan = planTagsPaste(
      {
        text: 'surface=asphalt',
        rows,
        columns: TAG_COLUMNS,
        anchor: { row: rows[0]?.id ?? '', col: 'key' },
        selection: [{ row: rows[0]?.id ?? '', col: 'key' }],
        editing: false,
        newRowId,
      },
      { tags: names, previous },
    )
    if (plan === 'native') throw new Error('expected a plan')
    expect(plan.report.added).toBe(1)
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]?.type).toBe('insert')
  })

  it('in an open edit, plain text is left to the browser', () => {
    const rows = sheetRows(names)
    const plan = planTagsPaste(
      {
        text: 'plain',
        rows,
        columns: TAG_COLUMNS,
        anchor: { row: rows[0]?.id ?? '', col: 'key' },
        selection: [],
        editing: true,
        newRowId,
      },
      { tags: names, previous: rowsFromTags(names, NO_TAG_ROWS) },
    )
    expect(plan).toBe('native')
  })

  it('several lines into a value cell with one that does not read: nothing changes, refused as a whole', () => {
    const rows = sheetRows(names)
    const plan = planTagsPaste(
      {
        text: 'a=1\nfoo',
        rows,
        columns: TAG_COLUMNS,
        anchor: { row: rows[1]?.id ?? '', col: 'value' },
        selection: [{ row: rows[1]?.id ?? '', col: 'value' }],
        editing: false,
        newRowId,
      },
      { tags: names, previous: rowsFromTags(names, NO_TAG_ROWS) },
    )
    if (plan === 'native') throw new Error('expected a plan')
    expect(plan.changes).toHaveLength(0)
    expect(plan.report.refused.map((line) => line.reason)).toEqual([
      'Several lines cannot go into one value',
    ])
  })
})

describe('serializeTagCells: what a copy of some cells writes', () => {
  const rows = sheetRows({ highway: 'residential', name: 'A', surface: 'asphalt' })
  it('both columns: key=value lines', () => {
    expect(serializeTagCells(rows, ['key', 'value'])).toBe(
      'highway=residential\nname=A\nsurface=asphalt',
    )
  })
  it('the key column alone: the keys', () => {
    expect(serializeTagCells(rows, ['key'])).toBe('highway\nname\nsurface')
  })
  it('the value column alone: the values', () => {
    expect(serializeTagCells(rows, ['value'])).toBe('residential\nA\nasphalt')
  })
})

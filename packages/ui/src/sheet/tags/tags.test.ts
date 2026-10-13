import { describe, expect, it } from 'bun:test'
import type { Tags } from '@osm-editor-kit/maid-presets'
import { parseTagText } from '../clipboard.ts'
import type { SheetBatch, SheetChange, SheetRow } from '../types.ts'
import {
  applyBatch,
  copyAllText,
  copyRowsText,
  describePaste,
  NO_TAG_ROWS,
  nextOrder,
  orderRows,
  planTagPaste,
  rowKey,
  rowsFromTags,
  rowValue,
  TAG_COLUMNS,
  tagChangeLabel,
  type TagRows,
} from './tags.ts'

const DUPLICATE = 'A tag with this key exists'
const READ_ONLY = 'The key is read-only'

function nth(state: TagRows, index: number): SheetRow {
  const row = state.rows[index]
  if (!row) throw new Error(`no row at ${index}`)
  return row
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value')
  return value
}

function keys(state: TagRows): string[] {
  return state.rows.map(rowKey)
}

/** The tags the rows hold: a row with a value is a tag, an incomplete row is not. */
function tagsOfRows(state: TagRows): Tags {
  return Object.fromEntries(
    state.rows
      .filter((row) => rowValue(row) !== '')
      .map((row): [string, string] => [rowKey(row), rowValue(row)]),
  )
}

function batch(...changes: SheetChange[]): SheetBatch {
  return { cause: 'edit', changes }
}

// the feature of most tests: highway (tag1) and name (tag2), in that order
const TWO: Tags = { highway: 'residential', name: 'A' }
function twoRows(): TagRows {
  return rowsFromTags(TWO, NO_TAG_ROWS)
}

describe('rowsFromTags: one row per tag', () => {
  it('gives a row per tag with a key cell and a value cell (F-ui-18: an input pair per tag)', () => {
    const state = rowsFromTags({ highway: 'residential' }, NO_TAG_ROWS)
    expect(state.rows).toHaveLength(1)
    const row = nth(state, 0)
    expect(row.label).toBe('highway')
    expect(row.cells.key?.value).toEqual({ kind: 'value', text: 'highway' })
    expect(row.cells.value?.value).toEqual({ kind: 'value', text: 'residential' })
  })

  it("no tags: no rows, the trailing row is the sheet's (F-ui-18: an empty pair for no tags)", () => {
    const state = rowsFromTags({}, NO_TAG_ROWS)
    expect(state.rows).toEqual([])
    expect(state.nextId).toBe(NO_TAG_ROWS.nextId)
  })

  it('sorts as iD does: code units, digits and capitals first, ":" before letters', () => {
    const tags: Tags = {
      'name:en': '1',
      name: '2',
      Name: '3',
      'addr:city': '4',
      addr: '5',
      '2': '6',
      _x: '7',
    }
    const state = rowsFromTags(tags, NO_TAG_ROWS, { order: 'sorted' })
    expect(keys(state)).toEqual(['2', 'Name', '_x', 'addr', 'addr:city', 'name', 'name:en'])
  })

  it('hold keeps the previous order and puts new keys last, in key order', () => {
    const first = rowsFromTags({ name: 'A', highway: 'x' }, NO_TAG_ROWS, { order: 'sorted' })
    expect(keys(first)).toEqual(['highway', 'name'])
    const next = rowsFromTags({ name: 'A', highway: 'x', surface: 'p', access: 'y' }, first)
    expect(keys(next)).toEqual(['highway', 'name', 'access', 'surface'])
    const sorted = rowsFromTags({ name: 'A', highway: 'x', surface: 'p', access: 'y' }, first, {
      order: 'sorted',
    })
    expect(keys(sorted)).toEqual(['access', 'highway', 'name', 'surface'])
  })

  it('a tag that goes and comes back gets a new id, and ids never repeat', () => {
    const first = rowsFromTags({ highway: 'x' }, NO_TAG_ROWS)
    const gone = rowsFromTags({}, first)
    const back = rowsFromTags({ highway: 'x' }, gone)
    expect(gone.rows).toEqual([])
    expect(nth(back, 0).id).not.toBe(nth(first, 0).id)
  })

  it('returns the same row objects for unchanged tags', () => {
    const first = twoRows()
    const again = rowsFromTags(TWO, first)
    expect(nth(again, 0)).toBe(nth(first, 0))
    expect(nth(again, 1)).toBe(nth(first, 1))
  })

  it('a read-only key is shown read-only, and its row and cells say so', () => {
    const state = rowsFromTags({ source: 'survey', highway: 'x' }, NO_TAG_ROWS, {
      readOnlyKeys: (key) => key === 'source',
      order: 'sorted',
    })
    expect(nth(state, 0).label).toBe('highway')
    expect(nth(state, 0).readOnly).toBe(false)
    expect(nth(state, 1).readOnly).toBe(true)
    expect(nth(state, 1).cells.value?.readOnly).toBe(true)
  })

  it('an incomplete row survives "edit" and is dropped after "blur"', () => {
    const before = twoRows()
    const cleared = applyBatch(TWO, before, batch({ type: 'clear', row: 'tag1', col: 'value' }))
    expect(cleared.tags).toEqual({ name: 'A' })
    const held = rowsFromTags(cleared.tags, cleared.rows, nextOrder('edit'))
    expect(keys(held)).toEqual(['highway', 'name'])
    expect(rowValue(nth(held, 0))).toBe('')
    const left = rowsFromTags(cleared.tags, cleared.rows, nextOrder('blur'))
    expect(keys(left)).toEqual(['name'])
  })

  it('a tag removed elsewhere removes its row, the others keep their ids', () => {
    const state = rowsFromTags({ highway: 'x', name: 'A' }, NO_TAG_ROWS)
    const next = rowsFromTags({ name: 'A' }, state)
    expect(keys(next)).toEqual(['name'])
    expect(nth(next, 0).id).toBe(nth(state, 1).id)
  })
})

describe('nextOrder: when the sheet sorts and keeps incomplete rows', () => {
  it('select sorts and drops, edit holds and keeps, paste sorts and keeps, blur sorts and drops', () => {
    expect(nextOrder('select')).toEqual({ order: 'sorted', keepIncomplete: false })
    expect(nextOrder('edit')).toEqual({ order: 'hold', keepIncomplete: true })
    expect(nextOrder('paste')).toEqual({ order: 'sorted', keepIncomplete: true })
    expect(nextOrder('blur')).toEqual({ order: 'sorted', keepIncomplete: false })
  })
})

describe('orderRows', () => {
  it('sorted sorts by key; a list that is sorted already comes back as the same object', () => {
    const state = { rows: [...twoRows().rows].reverse(), nextId: 3 }
    const sorted = orderRows(state, 'sorted')
    expect(keys(sorted)).toEqual(['highway', 'name'])
    expect(orderRows(sorted, 'sorted')).toBe(sorted)
  })

  it('hold returns the state as it is', () => {
    const state = { rows: [...twoRows().rows].reverse(), nextId: 3 }
    expect(orderRows(state, 'hold')).toBe(state)
  })
})

describe("applyBatch: the grid's changes become tags and rows", () => {
  it('a rename keeps the row id, the value and the place', () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'set', row: 'tag1', col: 'key', text: 'road' }),
    )
    expect(result.tags).toEqual({ road: 'residential', name: 'A' })
    expect(keys(result.rows)).toEqual(['road', 'name'])
    expect(nth(result.rows, 0).id).toBe('tag1')
    expect(result.label).toBe('Changed tags')
    // the rows match the tags without a further change, so the identity survives a re-read
    expect(nth(rowsFromTags(result.tags, result.rows), 0).id).toBe('tag1')
  })

  it('renaming an incomplete row keeps it incomplete', () => {
    const cleared = applyBatch(TWO, twoRows(), batch({ type: 'clear', row: 'tag1', col: 'value' }))
    const renamed = applyBatch(
      cleared.tags,
      cleared.rows,
      batch({ type: 'set', row: 'tag1', col: 'key', text: 'road' }),
    )
    expect(keys(renamed.rows)).toEqual(['road', 'name'])
    expect(rowValue(nth(renamed.rows, 0))).toBe('')
    expect(renamed.label).toBeUndefined()
  })

  it('a value change keeps the row id', () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'set', row: 'tag1', col: 'value', text: 'primary' }),
    )
    expect(result.tags).toEqual({ highway: 'primary', name: 'A' })
    expect(nth(result.rows, 0).id).toBe('tag1')
    expect(result.label).toBe('Changed tags')
  })

  it('clearing a value keeps the row as an incomplete row and drops the tag', () => {
    const result = applyBatch(TWO, twoRows(), batch({ type: 'clear', row: 'tag1', col: 'value' }))
    expect(result.tags).toEqual({ name: 'A' })
    expect(keys(result.rows)).toEqual(['highway', 'name'])
    expect(nth(result.rows, 0).id).toBe('tag1')
    expect(rowValue(nth(result.rows, 0))).toBe('')
    expect(result.label).toBe('Removed a tag')
  })

  it('setting a value to blanks is the same as clearing it', () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'set', row: 'tag1', col: 'value', text: '   ' }),
    )
    expect(result.tags).toEqual({ name: 'A' })
    expect(rowValue(nth(result.rows, 0))).toBe('')
  })

  it('clearing a key removes the tag and the row', () => {
    const result = applyBatch(TWO, twoRows(), batch({ type: 'clear', row: 'tag2', col: 'key' }))
    expect(result.tags).toEqual({ highway: 'residential' })
    expect(keys(result.rows)).toEqual(['highway'])
    expect(result.label).toBe('Removed a tag')
  })

  it('renaming a key to nothing removes the tag and the row', () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'set', row: 'tag2', col: 'key', text: '  ' }),
    )
    expect(result.tags).toEqual({ highway: 'residential' })
    expect(keys(result.rows)).toEqual(['highway'])
  })

  it('removing a row removes its tag (F-ui-18: the remove button)', () => {
    const result = applyBatch(TWO, twoRows(), batch({ type: 'remove', row: 'tag1' }))
    expect(result.tags).toEqual({ name: 'A' })
    expect(keys(result.rows)).toEqual(['name'])
  })

  it('several removed rows in one batch are one result, labelled with the count', () => {
    const tags: Tags = { a: '1', b: '2', c: '3' }
    const rows = rowsFromTags(tags, NO_TAG_ROWS)
    const result = applyBatch(
      tags,
      rows,
      batch(
        { type: 'remove', row: 'tag1' },
        { type: 'remove', row: 'tag2' },
        { type: 'remove', row: 'tag3' },
      ),
    )
    expect(result.tags).toEqual({})
    expect(result.rows.rows).toEqual([])
    expect(result.label).toBe('Removed 3 tags')
  })

  it('a key alone from the trailing row is an incomplete row, with no tag and no undo step', () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'insert', row: 't5', cells: { key: 'surface' } }),
    )
    expect(result.tags).toBe(TWO)
    expect(result.label).toBeUndefined()
    expect(keys(result.rows)).toEqual(['highway', 'name', 'surface'])
    expect(nth(result.rows, 2).id).toBe('t5')
    expect(rowValue(nth(result.rows, 2))).toBe('')
  })

  it('a key and a value from the trailing row add a tag at the end, in one step (F-ui-18: a pair at the end)', () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'insert', row: 't5', cells: { key: 'surface', value: 'asphalt' } }),
    )
    expect(result.tags).toEqual({ highway: 'residential', name: 'A', surface: 'asphalt' })
    expect(keys(result.rows)).toEqual(['highway', 'name', 'surface'])
    expect(nth(result.rows, 2).id).toBe('t5')
    expect(result.label).toBe('Added a tag')
    expect(result.refused).toEqual([])
  })

  it('an insert whose key exists is refused and reported; nothing changes', () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'insert', row: 't5', cells: { key: 'highway', value: 'x' } }),
    )
    expect(result.tags).toBe(TWO)
    expect(result.label).toBeUndefined()
    expect(keys(result.rows)).toEqual(['highway', 'name'])
    expect(result.refused).toEqual([{ key: 'highway', reason: DUPLICATE }])
  })

  it('a rename onto a key that exists is refused and reported', () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'set', row: 'tag1', col: 'key', text: 'name' }),
    )
    expect(result.tags).toBe(TWO)
    expect(keys(result.rows)).toEqual(['highway', 'name'])
    expect(result.refused).toEqual([{ key: 'name', reason: DUPLICATE }])
  })

  it('an incomplete key counts as an existing key for the trailing row too', () => {
    const cleared = applyBatch(TWO, twoRows(), batch({ type: 'clear', row: 'tag1', col: 'value' }))
    const result = applyBatch(
      cleared.tags,
      cleared.rows,
      batch({ type: 'insert', row: 't5', cells: { key: 'highway' } }),
    )
    expect(keys(result.rows)).toEqual(['highway', 'name'])
    expect(result.refused).toHaveLength(1)
  })

  it('keys and values are trimmed and in NFC; a value is never cut', () => {
    const decomposed = 'Café'
    const long = 'x'.repeat(300)
    const result = applyBatch(
      TWO,
      twoRows(),
      batch(
        { type: 'set', row: 'tag1', col: 'value', text: `  ${decomposed}  ` },
        { type: 'set', row: 'tag2', col: 'value', text: long },
      ),
    )
    expect(result.tags.highway).toBe('Café')
    expect(result.tags.name).toBe(long)
  })

  it('a key that is typed with spaces is stored trimmed', () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'insert', row: 't5', cells: { key: '  surface ', value: 'asphalt' } }),
    )
    expect(result.tags.surface).toBe('asphalt')
  })

  it("an insert whose id is taken is given a new one (the sheet's id is not trusted)", () => {
    const result = applyBatch(
      TWO,
      twoRows(),
      batch({ type: 'insert', row: 'tag1', cells: { key: 'surface' } }),
    )
    expect(keys(result.rows)).toEqual(['highway', 'name', 'surface'])
    const ids = result.rows.rows.map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(nth(result.rows, 2).id).toBe('tag3')
  })

  it('a change of a read-only key is refused in every form, and the tags do not change', () => {
    const tags: Tags = { source: 'survey', highway: 'x' }
    const options = { readOnlyKeys: (key: string) => key === 'source' }
    const rows = rowsFromTags(tags, NO_TAG_ROWS, { ...options, order: 'sorted' })
    // highway is tag1, source is tag2
    const cases: SheetBatch[] = [
      batch({ type: 'set', row: 'tag2', col: 'key', text: 'origin' }),
      batch({ type: 'set', row: 'tag2', col: 'value', text: 'other' }),
      batch({ type: 'clear', row: 'tag2', col: 'value' }),
      batch({ type: 'remove', row: 'tag2' }),
      batch({ type: 'insert', row: 't9', cells: { key: 'source', value: 'x' } }),
      batch({ type: 'set', row: 'tag1', col: 'key', text: 'source' }),
    ]
    for (const change of cases) {
      const result = applyBatch(tags, rows, change, options)
      expect(result.tags).toBe(tags)
      expect(result.label).toBeUndefined()
      expect(result.refused).toHaveLength(1)
      expect(result.refused[0]?.reason).toBe(READ_ONLY)
    }
  })

  it('the labels: one add, a count of removals, a change', () => {
    expect(tagChangeLabel({}, { a: '1' })).toBe('Added a tag')
    expect(tagChangeLabel({}, { a: '1', b: '2', c: '3' })).toBe('Added 3 tags')
    expect(tagChangeLabel({ a: '1', b: '2', c: '3' }, {})).toBe('Removed 3 tags')
    expect(tagChangeLabel({ a: '1' }, { a: '2' })).toBe('Changed tags')
    expect(tagChangeLabel({ a: '1' }, { b: '1' })).toBe('Changed tags')
    expect(tagChangeLabel({ a: '1' }, { a: '1' })).toBeUndefined()
  })
})

describe("the sheet's columns", () => {
  it('the key is unique; both columns are checked for 255 characters and the text is never cut', () => {
    const key = TAG_COLUMNS.find((column) => column.id === 'key')
    const value = TAG_COLUMNS.find((column) => column.id === 'value')
    const row = nth(twoRows(), 0)
    expect(key?.unique).toBe(true)
    expect(value?.validate?.('x'.repeat(255), row)).toBeUndefined()
    expect(value?.validate?.('x'.repeat(256), row)).toBe('1 character too long')
    expect(key?.validate?.('x'.repeat(258), row)).toBe('3 characters too long')
  })
})

describe('planTagPaste and describePaste (decision 3: add and override, never remove)', () => {
  function minter(): () => string {
    let n = 0
    return () => {
      n += 1
      return `new${n}`
    }
  }

  it('three lines, one key that exists: two inserts and one set in one batch, and the sentence', () => {
    const plan = planTagPaste(parseTagText('surface=asphalt\nname=B\nlit=yes'), TWO, twoRows(), {
      newRowId: minter(),
    })
    const changes = required(plan.batch).changes
    expect(plan.batch?.cause).toBe('paste')
    expect(changes.map((change) => change.type)).toEqual(['insert', 'set', 'insert'])
    expect(plan.report).toEqual({ added: 2, replaced: 1, unchanged: 0, refused: [] })
    expect(describePaste(plan.report)).toBe('3 tags pasted, 1 replaced')
    expect(plan.focus).toEqual({ row: 'new1', col: 'value' })

    const result = applyBatch(TWO, twoRows(), required(plan.batch))
    expect(result.tags).toEqual({
      highway: 'residential',
      name: 'B',
      surface: 'asphalt',
      lit: 'yes',
    })
    expect(result.label).toBe('Changed tags')
  })

  it('a paste never removes a tag', () => {
    const tags: Tags = { a: '1', b: '2' }
    const rows = rowsFromTags(tags, NO_TAG_ROWS)
    const plan = planTagPaste(parseTagText('a=3'), tags, rows, { newRowId: minter() })
    expect(required(plan.batch).changes.map((change) => change.type)).toEqual(['set'])
    const result = applyBatch(tags, rows, required(plan.batch))
    expect(result.tags).toEqual({ a: '3', b: '2' })
  })

  it('a value the feature already has is unchanged: no batch, and the sentence says so', () => {
    const plan = planTagPaste(parseTagText('name=A'), TWO, twoRows(), { newRowId: minter() })
    expect(plan.batch).toBeUndefined()
    expect(plan.report.unchanged).toBe(1)
    expect(describePaste(plan.report)).toBe('No tag pasted: 1 tag already has this value')
  })

  it('a key twice: the last line wins and the earlier one is listed as superseded', () => {
    const plan = planTagPaste(parseTagText('maxspeed=30\n\n# note\nmaxspeed=50'), {}, NO_TAG_ROWS, {
      newRowId: minter(),
    })
    expect(plan.superseded).toEqual([{ key: 'maxspeed', line: 1, by: 4 }])
    const result = applyBatch({}, NO_TAG_ROWS, required(plan.batch))
    expect(result.tags).toEqual({ maxspeed: '50' })
    expect(describePaste(plan.report)).toBe('1 tag pasted')
  })

  it('lines that cannot be read are named and counted: "No tag pasted: 2 lines could not be read"', () => {
    const plan = planTagPaste(parseTagText('foo\n=bar'), TWO, twoRows(), { newRowId: minter() })
    expect(plan.batch).toBeUndefined()
    expect(plan.report.refused.map((refusal) => refusal.line)).toEqual([1, 2])
    expect(describePaste(plan.report)).toBe('No tag pasted: 2 lines could not be read')
  })

  it('a read-only key is neither overwritten nor added, and is counted as refused', () => {
    const tags: Tags = { source: 'survey', highway: 'x' }
    const options = { readOnlyKeys: (key: string) => key === 'source' }
    const rows = rowsFromTags(tags, NO_TAG_ROWS, { ...options, order: 'sorted' })
    const plan = planTagPaste(parseTagText('source=other\nname=A'), tags, rows, {
      ...options,
      newRowId: minter(),
    })
    expect(plan.report.refused).toEqual([{ line: 1, text: 'source=other', reason: READ_ONLY }])
    expect(plan.report.added).toBe(1)
    expect(describePaste(plan.report)).toBe('1 tag pasted. 1 line could not be read')
    expect(
      required(plan.batch).changes.some((change) => change.type === 'set' && change.row === 'tag2'),
    ).toBe(false)
    const result = applyBatch(tags, rows, required(plan.batch), options)
    expect(result.tags).toEqual({ source: 'survey', highway: 'x', name: 'A' })
  })

  it('after a paste the rows are sorted (the paste sorts at once), and the focus is on the first pasted value', () => {
    const first = rowsFromTags({ name: 'A' }, NO_TAG_ROWS)
    const held = rowsFromTags({ name: 'A', highway: 'x' }, first)
    expect(keys(held)).toEqual(['name', 'highway'])
    const plan = planTagPaste(parseTagText('access=yes'), { name: 'A', highway: 'x' }, held, {
      newRowId: minter(),
    })
    expect(plan.focus).toEqual({ row: 'new1', col: 'value' })
    const applied = applyBatch({ name: 'A', highway: 'x' }, held, required(plan.batch))
    expect(keys(applied.rows)).toEqual(['name', 'highway', 'access'])
    const sorted = orderRows(applied.rows, nextOrder('paste').order)
    expect(keys(sorted)).toEqual(['access', 'highway', 'name'])
  })

  it('describePaste: singular, plural and the refusals', () => {
    const report = (added: number, replaced: number, unchanged: number, refused: number) => ({
      added,
      replaced,
      unchanged,
      refused: Array.from({ length: refused }, (_, index) => ({
        line: index + 1,
        text: 'x',
        reason: 'r',
      })),
    })
    expect(describePaste(report(1, 0, 0, 0))).toBe('1 tag pasted')
    expect(describePaste(report(3, 2, 0, 0))).toBe('5 tags pasted, 2 replaced')
    expect(describePaste(report(0, 1, 0, 0))).toBe('1 tag pasted, 1 replaced')
    expect(describePaste(report(2, 0, 1, 1))).toBe(
      '2 tags pasted, 1 unchanged. 1 line could not be read',
    )
    expect(describePaste(report(0, 0, 0, 1))).toBe('No tag pasted: 1 line could not be read')
    expect(describePaste(report(0, 0, 0, 2))).toBe('No tag pasted: 2 lines could not be read')
    expect(describePaste(report(0, 0, 1, 0))).toBe('No tag pasted: 1 tag already has this value')
    expect(describePaste(report(0, 0, 2, 0))).toBe('No tag pasted: 2 tags already have this value')
    expect(describePaste(report(0, 0, 0, 0))).toBe('No tag pasted')
  })
})

describe('copy', () => {
  it('copyAllText: every tag as key=value, sorted, quoted where the text needs it', () => {
    const text = copyAllText({ name: 'Café "Zur Post"', highway: 'residential', 'a=b': 'x' })
    expect(text).toBe('"a=b"=x\nhighway=residential\nname="Café \\"Zur Post\\""')
  })

  it('copyRowsText: the rows in the order shown, incomplete rows left out, a mixed value as *', () => {
    const cleared = applyBatch(TWO, twoRows(), batch({ type: 'clear', row: 'tag1', col: 'value' }))
    expect(copyRowsText(cleared.rows.rows)).toBe('name=A')
    const mixed: SheetRow = {
      id: 'mixed',
      label: 'source',
      cells: {
        key: { value: { kind: 'value', text: 'source' } },
        value: {
          value: {
            kind: 'mixed',
            values: [
              { text: 'a', count: 1 },
              { text: undefined, count: 1 },
            ],
          },
        },
      },
    }
    expect(copyRowsText([mixed])).toBe('source=*')
  })

  it('copy then paste changes nothing, also with quotes, "=" in a key and a line break in a value', () => {
    const tags: Tags = {
      'a=b': 'x',
      name: 'Café "Zur Post"',
      note: 'line one\nline two',
      website: 'https://example.org/?a=1&b=2',
    }
    const rows = rowsFromTags(tags, NO_TAG_ROWS)
    const text = copyAllText(tags)
    expect(copyRowsText(rows.rows)).toBe(text)
    const plan = planTagPaste(parseTagText(text), tags, rows, { newRowId: minter() })
    expect(plan.batch).toBeUndefined()
    expect(plan.report).toEqual({ added: 0, replaced: 0, unchanged: 4, refused: [] })
    expect(describePaste(plan.report)).toBe('No tag pasted: 4 tags already have this value')
  })

  function minter(): () => string {
    let n = 0
    return () => {
      n += 1
      return `new${n}`
    }
  }
})

describe('random walk: ids stay unique and the rows hold the tags', () => {
  const KEYS = ['highway', 'name', 'surface', 'lit', 'maxspeed', 'addr:city', 'Name', 'source']
  const FILLED = ['a', 'b', ' c ', 'é', 'x y', '"q"']
  const VALUES = [...FILLED, '']
  const LINES = [
    'surface=paved',
    'name=B',
    'lit',
    'bad',
    '=x',
    'name=',
    'source=1',
    'a=b=c',
    'maxspeed=30',
    'highway=primary',
    'Name=N',
    'addr:city=Berlin',
  ]
  const isReadOnly = (key: string) => key === 'source'

  // mulberry32: a seeded generator, so a failure is the same run every time
  function random(seed: number): () => number {
    let a = seed
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), a | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('200 seeded operations keep the ids unique and the rows equal to the tags after every step', () => {
    const next = random(20261013)
    const pick = <T>(items: readonly T[]): T => required(items[Math.floor(next() * items.length)])
    const check = (tags: Tags, state: TagRows) => {
      const ids = state.rows.map((row) => row.id)
      expect(new Set(ids).size).toBe(ids.length)
      const rowKeys = keys(state)
      expect(new Set(rowKeys).size).toBe(rowKeys.length)
      expect(rowKeys.every((key) => key !== '')).toBe(true)
      expect(tagsOfRows(state)).toEqual(tags)
    }

    let tags: Tags = {}
    let rows: TagRows = NO_TAG_ROWS
    let trailing = 1
    let counter = 0
    let applied = 0
    for (let step = 0; step < 200; step++) {
      const operation = Math.floor(next() * 7)
      const readOnlyKeys = { readOnlyKeys: isReadOnly }
      if (operation === 0) {
        // a change from elsewhere: undo, another editor, another feature
        const fromElsewhere: Tags = {}
        for (const key of KEYS) {
          if (next() < 0.4) fromElsewhere[key] = pick(FILLED)
        }
        tags = fromElsewhere
        rows = rowsFromTags(tags, rows, {
          ...readOnlyKeys,
          order: next() < 0.5 ? 'sorted' : 'hold',
          keepIncomplete: next() < 0.5,
        })
      } else if (operation === 1 && rows.rows.length > 0) {
        const row = pick(rows.rows)
        const result = applyBatch(
          tags,
          rows,
          batch({ type: 'set', row: row.id, col: 'value', text: pick(VALUES) }),
          readOnlyKeys,
        )
        tags = result.tags
        rows = result.rows
        if (result.label !== undefined) applied += 1
      } else if (operation === 2 && rows.rows.length > 0) {
        const row = pick(rows.rows)
        const result = applyBatch(
          tags,
          rows,
          batch({ type: 'set', row: row.id, col: 'key', text: pick(KEYS) }),
          readOnlyKeys,
        )
        tags = result.tags
        rows = result.rows
        if (result.label !== undefined) applied += 1
      } else if (operation === 3 && rows.rows.length > 0) {
        const row = pick(rows.rows)
        const change: SheetChange =
          next() < 0.5
            ? { type: 'clear', row: row.id, col: 'key' }
            : { type: 'remove', row: row.id }
        const result = applyBatch(tags, rows, batch(change), readOnlyKeys)
        tags = result.tags
        rows = result.rows
        if (result.label !== undefined) applied += 1
      } else if (operation === 4) {
        trailing += 1
        const cells: Record<string, string> = { key: pick(KEYS) }
        if (next() >= 0.5) cells.value = pick(VALUES)
        const result = applyBatch(
          tags,
          rows,
          batch({ type: 'insert', row: `t${trailing}`, cells }),
          readOnlyKeys,
        )
        tags = result.tags
        rows = result.rows
        if (result.label !== undefined) applied += 1
      } else if (operation === 5) {
        const lines = [pick(LINES), pick(LINES), pick(LINES)].slice(0, 1 + Math.floor(next() * 3))
        const plan = planTagPaste(parseTagText(lines.join('\n')), tags, rows, {
          ...readOnlyKeys,
          newRowId: () => {
            counter += 1
            return `new${counter}`
          },
        })
        if (plan.batch) {
          const result = applyBatch(tags, rows, plan.batch, readOnlyKeys)
          tags = result.tags
          rows = orderRows(result.rows, nextOrder('paste').order)
          if (result.label !== undefined) applied += 1
        }
      } else {
        const event = pick(['select', 'edit', 'blur'] as const)
        rows = rowsFromTags(tags, rows, { ...readOnlyKeys, ...nextOrder(event) })
      }
      check(tags, rows)
    }
    // the walk must have changed the tags many times, or it proves nothing
    expect(applied).toBeGreaterThan(20)
  })
})

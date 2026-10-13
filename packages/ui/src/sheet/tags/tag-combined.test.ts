import { describe, expect, test } from 'bun:test'
import type { CombinedTags } from '../../inspector/fields/shared.ts'
import { parseTagText } from '../clipboard.ts'
import type { SheetBatch, SheetRow } from '../types.ts'
import {
  applyCombinedBatch,
  changeCombinedModel,
  copyAllCombinedText,
  initialCombinedModel,
  oneValuesOf,
  rowsFromCombined,
} from './tag-combined.ts'
import { mixedValueSuggestions } from './tag-suggest.ts'
import { planTagPaste } from './tags.ts'
import { NO_TAG_ROWS, rowKey, type TagRows } from './tags.ts'

// Two features: `name` differs, `surface` is on one only, `highway` and `building` are shared.
const COMBINED: CombinedTags = {
  building: { kind: 'one', value: 'yes' },
  highway: { kind: 'one', value: 'residential' },
  name: { kind: 'mixed', values: ['A', 'B'], missing: false },
  surface: { kind: 'mixed', values: ['asphalt'], missing: true },
}

const rows = (combined: CombinedTags = COMBINED): TagRows => rowsFromCombined(combined, NO_TAG_ROWS)

const idOf = (state: TagRows, key: string): string => {
  const row = state.rows.find((candidate) => rowKey(candidate) === key)
  if (!row) throw new Error(`no row for ${key}`)
  return row.id
}

const batch = (
  changes: SheetBatch['changes'],
  cause: SheetBatch['cause'] = 'edit',
): SheetBatch => ({
  cause,
  changes,
})

describe('rowsFromCombined', () => {
  test('a shared key is a text cell; a mixed key has no text and lists its values, with "no tag"', () => {
    const state = rows()
    expect(state.rows.map(rowKey)).toEqual(['building', 'highway', 'name', 'surface'])
    const name = state.rows.find((row) => rowKey(row) === 'name') as SheetRow
    expect(name.cells.value?.value).toEqual({
      kind: 'mixed',
      values: [{ text: 'A' }, { text: 'B' }],
    })
    const surface = state.rows.find((row) => rowKey(row) === 'surface') as SheetRow
    expect(surface.cells.value?.value).toEqual({
      kind: 'mixed',
      values: [{ text: 'asphalt' }, { text: undefined }],
    })
    const building = state.rows.find((row) => rowKey(row) === 'building') as SheetRow
    expect(building.cells.value?.value).toEqual({ kind: 'value', text: 'yes' })
  })

  test('a row keeps its id when the key stays, and a key that is gone leaves', () => {
    const first = rows()
    const next = rowsFromCombined({ building: { kind: 'one', value: 'yes' } }, first)
    expect(next.rows.map(rowKey)).toEqual(['building'])
    expect(next.rows[0]?.id).toBe(idOf(first, 'building'))
  })
})

describe('applyCombinedBatch', () => {
  test('a typed value in a mixed cell is written to every feature, once', () => {
    const state = rows()
    const result = applyCombinedBatch(
      state,
      batch([{ type: 'set', row: idOf(state, 'name'), col: 'value', text: 'C' }]),
    )
    expect(result.change).toEqual({ set: { name: 'C' } })
    expect(result.label).toBe('Changed tags')
    const name = result.rows.rows.find((row) => rowKey(row) === 'name') as SheetRow
    expect(name.cells.value?.value).toEqual({ kind: 'value', text: 'C' })
  })

  test('a mixed cell left untouched writes nothing (an empty text is no clear)', () => {
    const state = rows()
    const id = idOf(state, 'name')
    expect(
      applyCombinedBatch(state, batch([{ type: 'clear', row: id, col: 'value' }])).change,
    ).toBe(undefined)
    expect(
      applyCombinedBatch(state, batch([{ type: 'set', row: id, col: 'value', text: '' }])).change,
    ).toBe(undefined)
  })

  test('removing a mixed row removes the key from every feature that has it', () => {
    const state = rows()
    const result = applyCombinedBatch(
      state,
      batch([{ type: 'remove', row: idOf(state, 'surface') }]),
    )
    expect(result.change).toEqual({ remove: ['surface'] })
    expect(result.label).toBe('Removed a tag')
  })

  test('a rename of a mixed row moves each feature own value: a rename, nothing else', () => {
    const state = rows()
    const result = applyCombinedBatch(
      state,
      batch([{ type: 'set', row: idOf(state, 'name'), col: 'key', text: 'label' }]),
    )
    expect(result.change).toEqual({ rename: [{ from: 'name', to: 'label' }] })
    expect(result.label).toBe('Renamed a tag')
    expect(result.rows.rows.map(rowKey)).toEqual(['building', 'highway', 'label', 'surface'])
  })

  test('a rename onto a key that exists is refused and nothing is written', () => {
    const state = rows()
    const result = applyCombinedBatch(
      state,
      batch([{ type: 'set', row: idOf(state, 'name'), col: 'key', text: 'building' }]),
    )
    expect(result.change).toBe(undefined)
    expect(result.refused.map((r) => r.reason)).toEqual(['A tag with this key exists'])
  })

  test('a new row with a key and a value is written to every feature; a key alone writes nothing', () => {
    const state = rows()
    const added = applyCombinedBatch(
      state,
      batch([{ type: 'insert', row: 't9', cells: { key: 'lit', value: 'yes' } }]),
    )
    expect(added.change).toEqual({ set: { lit: 'yes' } })
    expect(added.label).toBe('Added a tag')
    const keyOnly = applyCombinedBatch(
      state,
      batch([{ type: 'insert', row: 't9', cells: { key: 'lit' } }]),
    )
    expect(keyOnly.change).toBe(undefined)
    expect(keyOnly.rows.rows.map(rowKey)).toContain('lit')
  })

  test('a read-only key refuses its change and says why', () => {
    const state = rows()
    const result = applyCombinedBatch(
      state,
      batch([{ type: 'remove', row: idOf(state, 'name') }]),
      { readOnlyKeys: (key) => key === 'name' },
    )
    expect(result.change).toBe(undefined)
    expect(result.refused[0]?.reason).toBe('The key is read-only')
  })
})

describe('changeCombinedModel', () => {
  test('an edit holds the order; a paste sorts at once and bumps the version', () => {
    const model = initialCombinedModel('sel', COMBINED)
    const edit = changeCombinedModel(
      model,
      batch([{ type: 'insert', row: 't9', cells: { key: 'a', value: '1' } }]),
    )
    expect(edit.model.order).toBe('hold')
    const paste = changeCombinedModel(
      model,
      batch([{ type: 'insert', row: 't9', cells: { key: 'a', value: '1' } }], 'paste'),
    )
    expect(paste.model.order).toBe('sorted')
    expect(paste.model.version).toBe(model.version + 1)
    expect(paste.model.rows.rows[0] && rowKey(paste.model.rows.rows[0])).toBe('a')
  })
})

describe('copy and paste of several features', () => {
  test('copy all writes a mixed key as key=*, and the shared keys by value', () => {
    expect(copyAllCombinedText(COMBINED).split('\n')).toEqual([
      'building=yes',
      'highway=residential',
      'name=*',
      'surface=*',
    ])
  })

  test('oneValuesOf keeps only the shared keys', () => {
    expect(oneValuesOf(COMBINED)).toEqual({ building: 'yes', highway: 'residential' })
  })

  test('a pasted key=* for a mixed key is refused, and a pasted value replaces it for all', () => {
    const state = rows()
    const star = planTagPaste(parseTagText('name=*'), oneValuesOf(COMBINED), state, {
      newRowId: () => 'tag99',
    })
    expect(star.batch).toBe(undefined)
    expect(star.report.refused[0]?.reason).toBe('"*" stands for several values and is not written')

    const typed = planTagPaste(parseTagText('name=D'), oneValuesOf(COMBINED), state, {
      newRowId: () => 'tag99',
    })
    expect(typed.report).toMatchObject({ added: 0, replaced: 1 })
    expect(typed.batch?.changes).toEqual([
      { type: 'set', row: idOf(state, 'name'), col: 'value', text: 'D' },
    ])
  })
})

describe('mixed values as suggestions', () => {
  test('the values of a mixed row, and no "no tag" entry', () => {
    const state = rows()
    const name = state.rows.find((row) => rowKey(row) === 'name') as SheetRow
    const surface = state.rows.find((row) => rowKey(row) === 'surface') as SheetRow
    expect(mixedValueSuggestions(name).map((item) => item.value)).toEqual(['A', 'B'])
    expect(mixedValueSuggestions(surface).map((item) => item.value)).toEqual(['asphalt'])
    const building = state.rows.find((row) => rowKey(row) === 'building') as SheetRow
    expect(mixedValueSuggestions(building)).toEqual([])
  })
})

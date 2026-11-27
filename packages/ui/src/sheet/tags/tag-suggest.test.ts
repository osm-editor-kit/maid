import { describe, expect, test } from 'bun:test'
import type { SheetRow, SheetSuggestion } from '../types.ts'
import {
  keySuggestions,
  mixedValueSuggestions,
  presetSuggestions,
  sortPrefixFirst,
  toSheetSuggestions,
  valueSuggestions,
  withTagSuggestions,
  type TagSuggestSource,
} from './tag-suggest.ts'
import { TAG_COLUMNS } from './tags.ts'

const row = (id: string, key: string, value = ''): SheetRow => ({
  id,
  label: key || 'new',
  cells: {
    key: { value: { kind: 'value', text: key } },
    value: { value: { kind: 'value', text: value } },
  },
})

const items = (...values: string[]): SheetSuggestion[] => values.map((value) => ({ value }))

describe('sortPrefixFirst (iD raw tag editor sort)', () => {
  test('the items that start with the text come first, the rest keep their order', () => {
    expect(
      sortPrefixFirst('ser', items('highway', 'service', 'resident', 'sermon')).map((i) => i.value),
    ).toEqual(['service', 'sermon', 'highway', 'resident'])
  })
})

describe('keySuggestions (iD key fetcher)', () => {
  test('leaves out used keys, name_1 style keys, and keys without the text; prefix first', () => {
    const result = keySuggestions(
      'NAM',
      items('name', 'addr_name', 'name_1', 'operator', 'name:en', 'surface'),
      new Set(['operator']),
    )
    expect(result.map((i) => i.value)).toEqual(['name', 'addr_name', 'name:en'])
  })
})

describe('valueSuggestions (iD value fetcher)', () => {
  test('keeps the values that contain the text, ignoring case, prefix first', () => {
    expect(
      valueSuggestions('RES', items('residential', 'pedestrian', 'res')).map((i) => i.value),
    ).toEqual(['residential', 'res'])
  })
})

describe('toSheetSuggestions', () => {
  test('a description that says more than the value becomes the hint', () => {
    expect(
      toSheetSuggestions([
        { value: 'service', title: 'Service road' },
        { value: 'name', title: 'name' },
      ]),
    ).toEqual([{ value: 'service', hint: 'Service road' }, { value: 'name' }])
  })
})

describe('withTagSuggestions: the source as the columns suggest', () => {
  function recordingSource(): { source: TagSuggestSource; asked: string[][] } {
    const asked: string[][] = []
    const source: TagSuggestSource = {
      keys: async (query) => {
        asked.push(['keys', query])
        return [{ value: 'name' }, { value: 'operator' }, { value: 'name_2' }]
      },
      values: async (key, query) => {
        asked.push(['values', key, query])
        return [{ value: 'residential', title: 'Residential' }, { value: 'service' }]
      },
    }
    return { source, asked }
  }

  test('the key column leaves out the keys of the other rows, and asks with the text and the signal', async () => {
    const { source, asked } = recordingSource()
    const rows = [row('a', 'operator', 'Aldi'), row('b', 'highway', 'service')]
    const [keyColumn] = withTagSuggestions(TAG_COLUMNS, source, rows)
    const controller = new AbortController()
    const result = await keyColumn!.suggest!(
      { cell: { row: 'b', col: 'key' }, row: rows[1]!, text: 'na' },
      controller.signal,
    )
    expect(asked).toEqual([['keys', 'na']])
    expect(result.map((i) => i.value)).toEqual(['name'])
  })

  test('the key column keeps the feature own key of the editing row', async () => {
    const { source } = recordingSource()
    const rows = [row('a', 'name', 'x')]
    const [keyColumn] = withTagSuggestions(TAG_COLUMNS, source, rows)
    const result = await keyColumn!.suggest!(
      { cell: { row: 'a', col: 'key' }, row: rows[0]!, text: 'nam' },
      new AbortController().signal,
    )
    expect(result.map((i) => i.value)).toEqual(['name'])
  })

  test('the value column asks for the values of the row key; no key, no request', async () => {
    const { source, asked } = recordingSource()
    const rows = [row('a', 'highway', '')]
    const [, valueColumn] = withTagSuggestions(TAG_COLUMNS, source, rows)
    const signal = new AbortController().signal
    const result = await valueColumn!.suggest!(
      { cell: { row: 'a', col: 'value' }, row: rows[0]!, text: 'res' },
      signal,
    )
    expect(asked).toEqual([['values', 'highway', 'res']])
    expect(result).toEqual([{ value: 'residential', hint: 'Residential' }])
    const none = await valueColumn!.suggest!(
      { cell: { row: 'n', col: 'value' }, row: row('n', ''), text: 'res' },
      signal,
    )
    expect(none).toEqual([])
    expect(asked).toHaveLength(1)
  })

  test('both columns wait the taginfo delay of 300 ms before asking; other columns are unchanged', () => {
    const { source } = recordingSource()
    const [keyColumn, valueColumn] = withTagSuggestions(TAG_COLUMNS, source, [])
    expect(keyColumn!.suggestDelay).toBe(300)
    expect(valueColumn!.suggestDelay).toBe(300)
    expect(withTagSuggestions(TAG_COLUMNS, source, []).map((c) => c.id)).toEqual(['key', 'value'])
  })
})

describe('presetSuggestions: the values of the presets, from the closest key that has any', () => {
  const source: TagSuggestSource = {
    keys: async () => [],
    values: async () => [],
    options: (key) =>
      key === 'surface'
        ? [
            { value: 'asphalt', label: 'Asphalt' },
            { value: '', label: 'Not set' },
          ]
        : [],
  }
  test('a side key falls back to the part after the side; labels are hints, empty values go', () => {
    expect(presetSuggestions('cycleway:left:surface', source)).toEqual([
      { value: 'asphalt', hint: 'Asphalt' },
    ])
  })
  test('a source without presets gives none', () => {
    expect(presetSuggestions('surface', { keys: async () => [], values: async () => [] })).toEqual(
      [],
    )
  })
})

describe('withTagSuggestions: presets before taginfo, the right column as the value column', () => {
  const source: TagSuggestSource = {
    keys: async () => [],
    values: async () => [
      { value: 'track', title: 'track' },
      { value: 'lane', title: 'lane' },
    ],
    options: (key) => (key === 'cycleway:right' ? [{ value: 'lane', label: 'Bike lane' }] : []),
  }
  test('a side row asks for its own side key; presets first, taginfo after, each value once', async () => {
    const columns = withTagSuggestions(
      [...TAG_COLUMNS, { ...TAG_COLUMNS[1]!, id: 'right' }],
      source,
      [],
    )
    const right = columns.find((column) => column.id === 'right')
    const row: SheetRow = {
      id: 'side:cycleway:{side}',
      label: 'x',
      cells: { key: { value: { kind: 'value', text: 'cycleway:{side}' } } },
    }
    const items = await right?.suggest?.(
      { cell: { row: row.id, col: 'right' }, row, text: '' },
      new AbortController().signal,
    )
    expect(items?.map((item) => item.value)).toEqual(['lane', 'track'])
  })
})

describe('mixedValueSuggestions: the values of the cell asked about', () => {
  test('the right side of a group row offers its own values, not the left ones', () => {
    const row: SheetRow = {
      id: 'side:cycleway:{side}',
      label: 'x',
      cells: {
        value: { value: { kind: 'mixed', values: [{ text: 'lane' }, { text: 'no' }] } },
        right: { value: { kind: 'mixed', values: [{ text: 'track' }, { text: undefined }] } },
      },
    }
    expect(mixedValueSuggestions(row, 'right').map((item) => item.value)).toEqual(['track'])
    expect(mixedValueSuggestions(row).map((item) => item.value)).toEqual(['lane', 'no'])
  })
})

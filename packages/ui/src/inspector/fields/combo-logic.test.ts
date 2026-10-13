import { describe, expect, test } from 'bun:test'
import type { FieldOption } from '@osm-editor-kit/maid-presets'
import {
  filterOptions,
  matchLabel,
  shownText,
  valueFromText,
  type ComboSpec,
} from './combo-logic.ts'

const TRAFFIC: FieldOption[] = [
  { value: 'traffic_signals', label: 'Traffic Signals' },
  { value: 'stop', label: 'Stop' },
  { value: 'give_way', label: 'Give Way' },
]

function spec(overrides: Partial<ComboSpec> = {}): ComboSpec {
  return { type: 'combo', options: TRAFFIC, ...overrides }
}

describe('shownText', () => {
  test('a listed value shows its label', () => {
    expect(shownText(spec(), 'traffic_signals')).toEqual({ text: 'Traffic Signals', raw: false })
  })

  test('an unlisted value shows itself, as a raw value', () => {
    expect(shownText(spec(), 'roundabout')).toEqual({ text: 'roundabout', raw: true })
  })

  test('no value shows nothing', () => {
    expect(shownText(spec(), undefined)).toEqual({ text: '', raw: false })
    expect(shownText(spec(), '')).toEqual({ text: '', raw: false })
  })

  test('a typeCombo value yes shows as empty, not as a raw value', () => {
    expect(shownText(spec({ type: 'typeCombo' }), 'yes')).toEqual({ text: '', raw: false })
    expect(shownText(spec({ type: 'typeCombo' }), 'YES')).toEqual({ text: '', raw: false })
  })

  test('a typeCombo value other than yes is raw', () => {
    expect(shownText(spec({ type: 'typeCombo' }), 'no')).toEqual({ text: 'no', raw: true })
  })

  test('a label of a value yes wins over the typeCombo rule', () => {
    const options = [{ value: 'yes', label: 'Affirmative' }]
    expect(shownText(spec({ type: 'typeCombo', options }), 'yes')).toEqual({
      text: 'Affirmative',
      raw: false,
    })
  })
})

describe('matchLabel', () => {
  test('matches a label case-insensitively and gives the option', () => {
    expect(matchLabel(TRAFFIC, 'traffic SIGNALS')?.value).toBe('traffic_signals')
  })

  test('matches nothing for a value or an unknown label', () => {
    expect(matchLabel(TRAFFIC, 'traffic_signals')).toBeUndefined()
    expect(matchLabel(TRAFFIC, 'Roundabout')).toBeUndefined()
    expect(matchLabel(TRAFFIC, '  ')).toBeUndefined()
  })
})

describe('filterOptions', () => {
  test('empty text lists every option in order', () => {
    expect(filterOptions(TRAFFIC, '').map((o) => o.value)).toEqual([
      'traffic_signals',
      'stop',
      'give_way',
    ])
  })

  test('filters by label, case-insensitively', () => {
    expect(filterOptions(TRAFFIC, 'STO').map((o) => o.value)).toEqual(['stop'])
  })

  test('the matches keep the options order: a label prefix match does not come first', () => {
    // as iD's combobox (test/spec/ui/combobox.js: 'foobar' before 'bar' in the data order)
    const options: FieldOption[] = [
      { value: 'a', label: 'Big Stop' },
      { value: 'b', label: 'Stop Sign' },
      { value: 'c', label: 'Other' },
    ]
    expect(filterOptions(options, 'stop').map((o) => o.value)).toEqual(['a', 'b'])
  })

  test('also matches the raw value, and a space matches an underscore', () => {
    expect(filterOptions(TRAFFIC, 'give_').map((o) => o.value)).toEqual(['give_way'])
    expect(filterOptions(TRAFFIC, 'traffic signals').map((o) => o.value)).toEqual([
      'traffic_signals',
    ])
  })

  test('no match gives an empty list', () => {
    expect(filterOptions(TRAFFIC, 'zebra')).toEqual([])
  })
})

describe('valueFromText', () => {
  test('a typed label writes the option value', () => {
    expect(valueFromText(spec(), 'Give Way')).toEqual({ value: 'give_way' })
    expect(valueFromText(spec(), '  stop ')).toEqual({ value: 'stop' })
  })

  test('other text becomes snake case and lower case by default', () => {
    expect(valueFromText(spec(), 'Roundabout Lane')).toEqual({ value: 'roundabout_lane' })
  })

  test('snakeCase false keeps the spaces', () => {
    expect(valueFromText(spec({ snakeCase: false }), 'Roundabout Lane')).toEqual({
      value: 'roundabout lane',
    })
  })

  test('caseSensitive true keeps the case', () => {
    expect(valueFromText(spec({ caseSensitive: true }), 'RoundAbout')).toEqual({
      value: 'RoundAbout',
    })
  })

  test('snakeCase false and caseSensitive true together keep the text as typed', () => {
    expect(
      valueFromText(spec({ snakeCase: false, caseSensitive: true }), '  Round About  '),
    ).toEqual({ value: 'Round About' })
  })

  test('an empty text removes the tag', () => {
    expect(valueFromText(spec(), '   ')).toEqual({ value: undefined })
  })

  test('an empty typeCombo text writes yes', () => {
    expect(valueFromText(spec({ type: 'typeCombo' }), '')).toEqual({ value: 'yes' })
  })

  test('a typeCombo text yes stays yes, and a text no is written as typed', () => {
    expect(valueFromText(spec({ type: 'typeCombo' }), 'Yes')).toEqual({ value: 'yes' })
    expect(valueFromText(spec({ type: 'typeCombo' }), 'No')).toEqual({ value: 'no' })
  })

  test('customValues false refuses text that is no option', () => {
    expect(valueFromText(spec({ customValues: false }), 'Roundabout')).toBe('refused')
    expect(valueFromText(spec({ customValues: false }), 'traffic_signals')).toBe('refused')
  })

  test('customValues false still accepts a label', () => {
    expect(valueFromText(spec({ customValues: false }), 'stop')).toEqual({ value: 'stop' })
  })

  test('customValues false refuses an empty text, also for a typeCombo', () => {
    expect(valueFromText(spec({ customValues: false }), '')).toBe('refused')
    expect(valueFromText(spec({ type: 'typeCombo', customValues: false }), '')).toBe('refused')
  })

  test('a field without options writes its text as a plain value', () => {
    expect(valueFromText(spec({ options: [] }), 'Hello World')).toEqual({ value: 'hello_world' })
  })

  test('the written value is not cut at 255 characters: the field shows the excess and saving is blocked', () => {
    const long = 'a'.repeat(300)
    const write = valueFromText(spec({ options: [] }), long)
    expect(write).toEqual({ value: 'a'.repeat(300) })
  })
})

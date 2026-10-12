import { describe, expect, test } from 'bun:test'
import type { Field, FieldOption } from '@osm-editor-kit/maid-presets'
import {
  acceptSemi,
  addSemi,
  afterLastSeparator,
  chipState,
  manyAdd,
  manyCandidates,
  manyChosen,
  manyPick,
  manyRemove,
  multiAdd,
  multiChosen,
  multiKey,
  multiOptions,
  multiPrefix,
  multiSuffix,
  multiToggle,
  removeSemi,
  semiFull,
  semiList,
  semiOptions,
  semiValues,
  semiWrite,
} from './multi-logic.ts'

const PAYMENT: FieldOption[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'visa', label: 'Visa' },
  { value: 'credit_cards', label: 'Credit Cards' },
]

const SEMI: FieldOption[] = [
  { value: 'traffic_signals', label: 'Traffic Signals' },
  { value: 'stop', label: 'Stop' },
  { value: 'give_way', label: 'Give Way' },
]

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: 'test',
    type: 'combo',
    label: 'Test',
    options: [],
    universal: false,
    ...overrides,
  }
}

const semi = (overrides: Partial<Field> = {}) =>
  field({ type: 'semiCombo', key: 'traffic_calming', options: SEMI, ...overrides })
const multi = (overrides: Partial<Field> = {}) =>
  field({ type: 'multiCombo', key: 'payment:', options: PAYMENT, ...overrides })
const many = (overrides: Partial<Field> = {}) =>
  field({
    type: 'manyCombo',
    keys: ['bus', 'taxi'],
    options: [
      { value: 'bus', label: 'Bus' },
      { value: 'taxi', label: 'Taxi' },
    ],
    ...overrides,
  })

describe('semiValues and semiList', () => {
  test('a comma or a semicolon separates typed values; empty pieces go', () => {
    expect(semiValues('a,b')).toEqual(['a', 'b'])
    expect(semiValues('a; b ,, c')).toEqual(['a', 'b', 'c'])
    expect(semiValues('   ')).toEqual([])
    expect(semiValues('')).toEqual([])
  })

  test('the stored value splits at semicolons, keeping duplicates', () => {
    expect(semiList(undefined)).toEqual([])
    expect(semiList('a;b')).toEqual(['a', 'b'])
    expect(semiList('a;;b;')).toEqual(['a', 'b'])
    expect(semiList('a;a')).toEqual(['a', 'a'])
  })

  test('afterLastSeparator is the text after the last comma or semicolon', () => {
    expect(afterLastSeparator('stop')).toBe('stop')
    expect(afterLastSeparator('stop,gi')).toBe('gi')
    expect(afterLastSeparator('a;b,')).toBe('')
  })
})

describe('semiWrite', () => {
  test('joins the values with ;', () => {
    expect(semiWrite(['a', 'b'])).toBe('a;b')
    expect(semiWrite(['a'])).toBe('a')
  })

  test('no values removes the tag', () => {
    expect(semiWrite([])).toBeUndefined()
  })

  test('cuts the joined text at 255 characters', () => {
    const written = semiWrite(['a', 'x'.repeat(300)])
    expect(written).toBeDefined()
    expect(Array.from(written ?? '').length).toBe(255)
    expect(written?.startsWith('a;xxx')).toBe(true)
  })

  test('a full list is one where the joined text reaches 255 characters', () => {
    expect(semiFull(['x'.repeat(255)])).toBe(true)
    expect(semiFull(['x'.repeat(254)])).toBe(false)
    expect(semiFull(['x'.repeat(200), 'y'.repeat(60)])).toBe(true)
  })
})

describe('addSemi', () => {
  test('a label becomes its option value', () => {
    expect(addSemi(semi(), [], 'Traffic Signals')).toEqual(['traffic_signals'])
  })

  test('a text that is no option is spelled: spaces to underscores, lower case', () => {
    expect(addSemi(semi(), [], 'Speed Bump')).toEqual(['speed_bump'])
  })

  test('a comma in the typed text adds several values', () => {
    expect(addSemi(semi(), [], 'stop, give way')).toEqual(['stop', 'give_way'])
  })

  test('a value already in the list is not added twice', () => {
    expect(addSemi(semi(), ['stop'], 'stop')).toEqual(['stop'])
  })

  test('the typed text is cleaned: trimmed, empty pieces dropped', () => {
    expect(addSemi(semi(), ['stop'], '   ')).toEqual(['stop'])
    expect(addSemi(semi(), ['stop'], ' bump ,, ')).toEqual(['stop', 'bump'])
  })

  test('with customValues false, a text that is no option is refused', () => {
    const closed = semi({ customValues: false })
    expect(addSemi(closed, ['stop'], 'Unknown')).toEqual(['stop'])
    expect(addSemi(closed, [], 'Stop')).toEqual(['stop'])
  })

  test('snakeCase false keeps the spaces, caseSensitive true keeps the case', () => {
    expect(addSemi(semi({ snakeCase: false }), [], 'Speed Bump')).toEqual(['speed bump'])
    expect(addSemi(semi({ caseSensitive: true }), [], 'Speed')).toEqual(['Speed'])
  })
})

describe('acceptSemi', () => {
  test('without an option it is addSemi', () => {
    expect(acceptSemi(semi(), ['stop'], 'bump')).toEqual(['stop', 'bump'])
  })

  test('a highlighted option replaces the text after the last comma', () => {
    expect(
      acceptSemi(semi(), ['stop'], 'bump,gi', { value: 'give_way', label: 'Give Way' }),
    ).toEqual(['stop', 'bump', 'give_way'])
  })

  test('an option is added as it is, without spelling', () => {
    expect(acceptSemi(semi(), [], 'x', { value: 'Give_Way', label: 'x' })).toEqual(['Give_Way'])
  })
})

describe('removeSemi and semiOptions', () => {
  test('removing by index takes out one of two equal values', () => {
    expect(removeSemi(['a', 'a', 'b'], 0)).toEqual(['a', 'b'])
    expect(removeSemi(['a', 'a', 'b'], 1)).toEqual(['a', 'b'])
  })

  test('removing the last value leaves an empty list, which writes no tag', () => {
    expect(semiWrite(removeSemi(['a'], 0))).toBeUndefined()
  })

  test('the options are those not chosen', () => {
    expect(semiOptions(semi(), ['stop']).map((option) => option.value)).toEqual([
      'traffic_signals',
      'give_way',
    ])
  })

  test('the options skip unset entries', () => {
    const withUnset = semi({
      options: [{ value: '', label: 'None' }, ...SEMI],
    })
    expect(semiOptions(withUnset, []).map((option) => option.value)).toEqual([
      'traffic_signals',
      'stop',
      'give_way',
    ])
  })
})

describe('multiPrefix and multiKey (bug 1: never a tag named payment:)', () => {
  test('the prefix ends with a colon, added when the key lacks it', () => {
    expect(multiPrefix(multi())).toBe('payment:')
    expect(multiPrefix(multi({ key: 'payment' }))).toBe('payment:')
    expect(multiPrefix(field({ key: undefined }))).toBeUndefined()
    expect(multiPrefix(field({ key: '' }))).toBeUndefined()
  })

  test('a suffix gives prefix + suffix', () => {
    expect(multiKey(multi(), 'cash')).toBe('payment:cash')
    expect(multiKey(multi({ key: 'payment' }), 'cash')).toBe('payment:cash')
  })

  test('an empty suffix gives no tag at all', () => {
    expect(multiKey(multi(), '')).toBeUndefined()
    expect(multiKey(field({ key: undefined }), 'cash')).toBeUndefined()
  })

  test('multiAdd never writes the bare prefix, whatever the suffix', () => {
    expect(multiAdd(multi(), {}, '')).toBeUndefined()
  })
})

describe('multiSuffix', () => {
  test('a label becomes its option value', () => {
    expect(multiSuffix(multi(), 'Credit Cards')).toBe('credit_cards')
  })

  test('other text is spelled as a combo spells it', () => {
    expect(multiSuffix(multi(), 'Bit Coin')).toBe('bit_coin')
  })

  test('empty text gives nothing', () => {
    expect(multiSuffix(multi(), '  ')).toBeUndefined()
  })
})

describe('multiChosen', () => {
  const tags = {
    'payment:visa': 'yes',
    'payment:cash': 'no',
    'payment:maestro': 'main',
    'payment:': 'yes',
    payment: 'yes',
    'payment:empty': '',
    name: 'Shop',
  }

  test('one chip per tag with the prefix and a value, bare prefix and blank values left out', () => {
    expect(multiChosen(multi(), tags).map((chip) => chip.key)).toEqual([
      'payment:cash',
      'payment:visa',
      'payment:maestro',
    ])
  })

  test('chips follow the options order, unknown suffixes come last', () => {
    expect(multiChosen(multi(), tags).map((chip) => chip.suffix)).toEqual([
      'cash',
      'visa',
      'maestro',
    ])
  })

  test('the label is the option label, else the raw suffix in italics', () => {
    const chips = multiChosen(multi(), tags)
    expect(chips[0]).toMatchObject({ label: 'Cash', raw: false, state: 'no' })
    expect(chips[2]).toMatchObject({ label: 'maestro', raw: true, state: 'other' })
  })

  test('without a key there are no chips', () => {
    expect(multiChosen(field({ key: undefined }), tags)).toEqual([])
  })

  test('chipState: yes, no, anything else is mixed', () => {
    expect(chipState('yes')).toBe('yes')
    expect(chipState('NO')).toBe('no')
    expect(chipState('main')).toBe('other')
  })
})

describe('multiAdd', () => {
  test('a new suffix is written as yes', () => {
    expect(multiAdd(multi(), {}, 'cash')).toEqual({ key: 'payment:cash', value: 'yes' })
  })

  test('a suffix with the value no is set to yes', () => {
    expect(multiAdd(multi(), { 'payment:cash': 'no' }, 'cash')).toEqual({
      key: 'payment:cash',
      value: 'yes',
    })
  })

  test('a value other than no stays (language:de=main is not overwritten)', () => {
    expect(multiAdd(multi(), { 'payment:maestro': 'main' }, 'maestro')).toBeUndefined()
  })

  test('a suffix already yes writes nothing', () => {
    expect(multiAdd(multi(), { 'payment:visa': 'yes' }, 'visa')).toBeUndefined()
  })
})

describe('multiToggle and multiOptions', () => {
  const chips = multiChosen(multi(), { 'payment:cash': 'no', 'payment:visa': 'yes' })

  test('yes becomes no, no becomes yes, anything else becomes yes', () => {
    expect(multiToggle(chips[1] as (typeof chips)[number])).toEqual({
      key: 'payment:visa',
      value: 'no',
    })
    expect(multiToggle(chips[0] as (typeof chips)[number])).toEqual({
      key: 'payment:cash',
      value: 'yes',
    })
  })

  test('the input offers the options that have no chip', () => {
    expect(multiOptions(multi(), chips).map((option) => option.value)).toEqual(['credit_cards'])
  })
})

describe('manyCombo', () => {
  test('the chips are the keys with a value, in the order of keys', () => {
    const chips = manyChosen(many(), { taxi: 'yes', bus: 'no', other: 'yes' })
    expect(chips).toEqual([
      { key: 'bus', label: 'Bus', value: 'no', state: 'no' },
      { key: 'taxi', label: 'Taxi', value: 'yes', state: 'yes' },
    ])
  })

  test('no keys list nothing', () => {
    expect(manyChosen(many({ keys: undefined }), { bus: 'yes' })).toEqual([])
    expect(manyChosen(many(), {})).toEqual([])
  })

  test('the candidates are the keys without a value, with their labels', () => {
    expect(manyCandidates(many(), { bus: 'yes' })).toEqual([{ value: 'taxi', label: 'Taxi' }])
  })

  test('a key without an option label is its own label', () => {
    expect(manyChosen(many({ keys: ['ferry'], options: [] }), { ferry: 'yes' })).toEqual([
      { key: 'ferry', label: 'ferry', value: 'yes', state: 'yes' },
    ])
  })

  test('manyPick takes an exact label, case-insensitively, and nothing else', () => {
    const candidates = manyCandidates(many(), {})
    expect(manyPick(candidates, 'taxi')).toBe('taxi')
    expect(manyPick(candidates, 'Tax')).toBeUndefined()
  })

  test('adding sets the key to yes, removing deletes it', () => {
    expect(manyAdd('bus')).toEqual({ key: 'bus', value: 'yes' })
    expect(manyRemove('bus')).toEqual({ key: 'bus', value: undefined })
  })
})

import { describe, expect, it } from 'bun:test'
import { catalogue } from '@osm-editor-kit/surface-smoothness-data'
import {
  canonicalSurface,
  creditsFor,
  isKnownSmoothness,
  isKnownSurface,
  matchesQuery,
  optionStep,
  pickerView,
  smoothnessChoices,
  smoothnessCell,
  smoothnessOthers,
  smoothnessPicture,
  smoothnessTitle,
  surfaceGroups,
  surfaceOthers,
  surfacePicture,
  surfaceTitle,
  typedValue,
} from './logic.ts'

describe('which photo a surface and smoothness shows', () => {
  it('shows the matrix photo of a surface × smoothness pair that has one', () => {
    expect(smoothnessPicture('asphalt', 'good')).toEqual({
      path: 'images/surface_asphalt_good.jpg',
      kind: 'photo',
    })
  })

  it('reads a surface alias through its canonical surface', () => {
    expect(smoothnessCell('concrete:plates', 'excellent')?.photo).toBe(
      'images/surface_concrete_excellent.jpg',
    )
    expect(canonicalSurface('bricks')).toBe('paving_stones')
    expect(canonicalSurface('asphalt')).toBe('asphalt')
  })

  it("falls back to the level's emoji for a surface without a photo of that level", () => {
    // sett has no photo for excellent: the matrix has no cell for it
    expect(smoothnessCell('sett', 'excellent')).toBeUndefined()
    expect(smoothnessPicture('sett', 'excellent')).toEqual({
      kind: 'emoji',
      text: '🛹',
    })
  })

  it('shows the emoji of the level without a surface', () => {
    expect(smoothnessPicture(undefined, 'impassable')).toEqual({
      kind: 'emoji',
      text: '🚶',
    })
  })

  it('shows no picture for a value that is not a level and has no surface', () => {
    expect(smoothnessPicture(undefined, 'nonsense')).toBeUndefined()
    expect(smoothnessPicture('nonsense', 'nonsense')).toBeUndefined()
  })

  it('shows the reference photo of a surface, following aliases', () => {
    expect(surfacePicture('asphalt')).toEqual({
      path: 'images/surface_asphalt.jpg',
      kind: 'photo',
    })
    expect(surfacePicture('concrete:plates')?.path).toBe('images/surface_concrete.jpg')
    expect(surfacePicture('constructor')).toBeUndefined()
  })
})

describe('the pickers', () => {
  it('lists the surfaces in the catalogue order, the common ones first', () => {
    const groups = surfaceGroups()
    expect(groups.map((group) => group.id)).toEqual(['common', 'other'])
    const common = groups[0]!.items.map((item) => item.value)
    expect(common).toEqual([
      'asphalt',
      'concrete',
      'paving_stones',
      'sett',
      'compacted',
      'fine_gravel',
      'gravel',
    ])
    const all = groups.flatMap((group) => group.items.map((item) => item.value))
    expect(all).toHaveLength(Object.keys(catalogue.surfaces).length)
    expect(new Set(all).size).toBe(all.length)
  })

  it('gives every surface a label, and a picture only where the catalogue has one', () => {
    for (const group of surfaceGroups()) {
      for (const item of group.items) {
        expect(item.label.length).toBeGreaterThan(0)
        expect(item.picture?.kind).toBe('photo')
      }
    }
  })

  it('offers the photos of a surface, best to worst, with their descriptions', () => {
    const { photos, choices } = smoothnessChoices('sett')
    expect(photos).toBe(true)
    expect(choices.map((choice) => choice.value)).toEqual([
      'good',
      'intermediate',
      'bad',
      'very_bad',
    ])
    expect(choices[0]?.description).toContain('flat stones')
    expect(choices[0]?.picture?.kind).toBe('photo')
  })

  it('offers all levels with their emoji when there is no surface', () => {
    const { photos, choices } = smoothnessChoices(undefined)
    expect(photos).toBe(false)
    expect(choices.map((choice) => choice.value)).toEqual(Object.keys(catalogue.smoothnessLevels))
    expect(choices.every((choice) => choice.description === undefined)).toBe(true)
    expect(choices.every((choice) => choice.picture?.kind === 'emoji')).toBe(true)
  })

  it('offers all levels when the surface has no photos', () => {
    const { photos, choices } = smoothnessChoices('artificial_turf')
    expect(photos).toBe(false)
    expect(choices).toHaveLength(Object.keys(catalogue.smoothnessLevels).length)
  })

  it('lists the surface values without a card: the aliases with the title of their surface, and salt', () => {
    const others = surfaceOthers()
    expect(others.find((option) => option.value === 'concrete:plates')?.label).toBe('Concrete')
    expect(others.find((option) => option.value === 'earth')?.label).toBe('Dirt')
    expect(others.find((option) => option.value === 'salt')?.label).toBe('Salt')
    expect(others.some((option) => option.value === 'asphalt')).toBe(false)
  })

  it('lists the levels that have no card for the surface', () => {
    const shown = smoothnessChoices('asphalt').choices.map((choice) => choice.value)
    const others = smoothnessOthers(shown).map((option) => option.value)
    expect(others.length + shown.length).toBe(Object.keys(catalogue.smoothnessLevels).length)
    expect(others.some((value) => shown.includes(value))).toBe(false)
    expect(smoothnessOthers([]).map((option) => option.value)).toEqual(
      Object.keys(catalogue.smoothnessLevels),
    )
  })
})

describe('values that are not in the catalogue', () => {
  it('knows the catalogue values and their aliases, and no other', () => {
    expect(isKnownSurface('asphalt')).toBe(true)
    expect(isKnownSurface('concrete:plates')).toBe(true)
    expect(isKnownSurface('wood_chips')).toBe(false)
    expect(isKnownSurface('')).toBe(false)
    expect(isKnownSmoothness('good')).toBe(true)
    expect(isKnownSmoothness('great')).toBe(false)
  })

  it('has no title for an unknown value, so the tile can show the value itself', () => {
    expect(surfaceTitle('wood_chips')).toBeUndefined()
    expect(smoothnessTitle('great')).toBeUndefined()
    expect(surfaceTitle('asphalt')).toBe('Asphalt')
    expect(smoothnessTitle('good')).toBe('Mostly even')
  })

  it('does not take prototype members for values', () => {
    expect(isKnownSurface('constructor')).toBe(false)
    expect(isKnownSmoothness('toString')).toBe(false)
    expect(smoothnessChoices('__proto__').photos).toBe(false)
  })
})

describe('the search of a picker', () => {
  it('matches a query on the value or the label, case-insensitively', () => {
    expect(matchesQuery('asphal', 'asphalt', 'Asphalt')).toBe(true)
    expect(matchesQuery('ASPHALT', 'asphalt', 'Asphalt')).toBe(true)
    expect(matchesQuery('paving', 'paving_stones', 'Paving Stones')).toBe(true)
    expect(matchesQuery('mostly', 'good', 'Mostly even')).toBe(true)
    expect(matchesQuery('good', 'good', 'Mostly even')).toBe(true)
    expect(matchesQuery('xyz', 'asphalt', 'Asphalt')).toBe(false)
  })

  it('reads a space in the query as an underscore in the value, and the other way round', () => {
    expect(matchesQuery('fine gravel', 'fine_gravel', 'Fine Gravel')).toBe(true)
    expect(matchesQuery('fine_gravel', 'fine_gravel', 'Fine Gravel')).toBe(true)
    expect(matchesQuery('  ', 'asphalt', 'Asphalt')).toBe(true)
  })

  it('turns a typed text into the value it stands for', () => {
    expect(typedValue('  Fine Gravel ')).toBe('fine_gravel')
    expect(typedValue('concrete:plates')).toBe('concrete:plates')
  })

  it('shows all cards without a query, and the cards that match with one', () => {
    const cards = [
      { value: 'asphalt', label: 'Asphalt' },
      { value: 'gravel', label: 'Gravel' },
    ]
    expect(pickerView(cards, [], '')).toEqual({ cards, others: [], typed: undefined })
    expect(pickerView(cards, [], 'asphal')).toEqual({
      cards: [{ value: 'asphalt', label: 'Asphalt' }],
      others: [],
      typed: undefined,
    })
  })

  it('shows the other values that match, and the typed value, when no card matches', () => {
    const cards = [{ value: 'asphalt', label: 'Asphalt' }]
    const salt = { value: 'salt', label: 'Salt' }
    const others = [salt, { value: 'earth', label: 'Dirt' }]
    expect(pickerView(cards, others, 'sal')).toEqual({
      cards: [],
      others: [salt],
      typed: 'sal',
    })
    expect(pickerView(cards, others, 'Mud Hole')).toEqual({
      cards: [],
      others: [],
      typed: 'mud_hole',
    })
  })

  it('does not offer the typed value again when a listed value is it', () => {
    const cards = [{ value: 'asphalt', label: 'Asphalt' }]
    const salt = { value: 'salt', label: 'Salt' }
    const others = [salt]
    expect(pickerView(cards, others, 'salt')).toEqual({
      cards: [],
      others: [salt],
      typed: undefined,
    })
    expect(pickerView(cards, others, 'earth')).toEqual({ cards: [], others: [], typed: 'earth' })
  })

  it('moves through the options by a row in the cards, by one below them, and stops at the ends', () => {
    const down = 'ArrowDown'
    const up = 'ArrowUp'
    // 6 cards in 4 columns, then 2 values below them
    expect(optionStep(0, down, 8, 6, 4)).toBe(4)
    expect(optionStep(4, down, 8, 6, 4)).toBe(6)
    expect(optionStep(5, down, 8, 6, 4)).toBe(6)
    expect(optionStep(6, down, 8, 6, 4)).toBe(7)
    expect(optionStep(7, down, 8, 6, 4)).toBe(7)
    expect(optionStep(7, up, 8, 6, 4)).toBe(6)
    expect(optionStep(6, up, 8, 6, 4)).toBe(5)
    expect(optionStep(1, up, 8, 6, 4)).toBe(0)
    expect(optionStep(0, up, 8, 6, 4)).toBe(0)
  })

  it('goes down from the last card row to the first value below the cards', () => {
    expect(optionStep(5, 'ArrowDown', 8, 6, 4)).toBe(6)
    expect(optionStep(3, 'ArrowDown', 8, 6, 4)).toBe(6)
  })

  it('moves by one when there are no cards, and ignores other keys', () => {
    expect(optionStep(0, 'ArrowDown', 3, 0, 4)).toBe(1)
    expect(optionStep(2, 'ArrowDown', 3, 0, 4)).toBe(2)
    expect(optionStep(1, 'Enter', 3, 0, 4)).toBeUndefined()
    expect(optionStep(0, 'ArrowDown', 0, 0, 4)).toBeUndefined()
  })
})

describe('credits', () => {
  it('gives the catalogue attribution of the files shown, in the catalogue order', () => {
    const credits = creditsFor([
      'images/surface_asphalt.jpg',
      'images/surface_acrylic.jpg',
      'images/unknown.jpg',
    ])
    expect(credits.map((credit) => credit.file)).toEqual([
      'images/surface_acrylic.jpg',
      'images/surface_asphalt.jpg',
    ])
    expect(credits[0]?.license).toBe('CC-BY-SA 4.0')
    expect(credits[1]?.license).toBe('Public Domain')
  })
})

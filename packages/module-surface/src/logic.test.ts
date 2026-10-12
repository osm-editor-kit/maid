import { describe, expect, it } from 'bun:test'
import { catalogue } from '@osm-editor-kit/surface-smoothness-data'
import {
  canonicalSurface,
  creditsFor,
  gridStep,
  isKnownSmoothness,
  isKnownSurface,
  smoothnessChoices,
  smoothnessCell,
  smoothnessOptions,
  smoothnessPicture,
  smoothnessTitle,
  surfaceGroups,
  surfaceOptions,
  surfacePicture,
  surfaceTitle,
  tabStopIndex,
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

  it("falls back to the level's vehicle icon for a surface without a photo of that level", () => {
    // sett has no photo for excellent: the matrix has no cell for it
    expect(smoothnessCell('sett', 'excellent')).toBeUndefined()
    expect(smoothnessPicture('sett', 'excellent')).toEqual({
      path: 'icons/skateboard.svg',
      kind: 'vehicle',
    })
  })

  it('shows the vehicle icon of the level without a surface', () => {
    expect(smoothnessPicture(undefined, 'impassable')).toEqual({
      path: 'icons/pedestrian.svg',
      kind: 'vehicle',
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

  it('offers all levels with their vehicle icons when there is no surface', () => {
    const { photos, choices } = smoothnessChoices(undefined)
    expect(photos).toBe(false)
    expect(choices.map((choice) => choice.value)).toEqual(Object.keys(catalogue.smoothnessLevels))
    expect(choices.every((choice) => choice.description === undefined)).toBe(true)
    expect(choices.every((choice) => choice.picture?.kind === 'vehicle')).toBe(true)
  })

  it('offers all levels when the surface has no photos', () => {
    const { photos, choices } = smoothnessChoices('artificial_turf')
    expect(photos).toBe(false)
    expect(choices).toHaveLength(Object.keys(catalogue.smoothnessLevels).length)
  })

  it('lists the surface aliases with the title of their surface, and the levels in order', () => {
    const options = surfaceOptions()
    expect(options.find((option) => option.value === 'concrete:plates')?.label).toBe('Concrete')
    expect(options.find((option) => option.value === 'asphalt')?.label).toBe('Asphalt')
    expect(smoothnessOptions().map((option) => option.value)).toEqual(
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

describe('gridStep', () => {
  it('moves left and right by one and stops at the ends', () => {
    expect(gridStep(0, 'ArrowRight', 5, 4)).toBe(1)
    expect(gridStep(4, 'ArrowRight', 5, 4)).toBe(4)
    expect(gridStep(1, 'ArrowLeft', 5, 4)).toBe(0)
    expect(gridStep(0, 'ArrowLeft', 5, 4)).toBe(0)
  })

  it('moves up and down by a row and stops at the ends', () => {
    expect(gridStep(1, 'ArrowDown', 10, 4)).toBe(5)
    expect(gridStep(8, 'ArrowDown', 10, 4)).toBe(9)
    expect(gridStep(5, 'ArrowUp', 10, 4)).toBe(1)
    expect(gridStep(2, 'ArrowUp', 10, 4)).toBe(0)
  })

  it('goes to the first and the last item with Home and End', () => {
    expect(gridStep(3, 'Home', 7, 3)).toBe(0)
    expect(gridStep(3, 'End', 7, 3)).toBe(6)
  })

  it('returns undefined for keys that do not move, and for an empty grid', () => {
    expect(gridStep(0, 'Enter', 5, 4)).toBeUndefined()
    expect(gridStep(0, 'a', 5, 4)).toBeUndefined()
    expect(gridStep(0, 'ArrowRight', 0, 4)).toBeUndefined()
    expect(gridStep(0, 'ArrowRight', 5, 0)).toBeUndefined()
  })

  it('brings an index outside the grid in before it moves', () => {
    expect(gridStep(-1, 'ArrowRight', 5, 4)).toBe(1)
    expect(gridStep(9, 'ArrowLeft', 5, 4)).toBe(3)
  })

  it('walks a grid of 10 items in 4 columns in the expected cells', () => {
    // row 0: 0 1 2 3, row 1: 4 5 6 7, row 2: 8 9
    let index = 0
    index = gridStep(index, 'ArrowDown', 10, 4) ?? index
    expect(index).toBe(4)
    index = gridStep(index, 'ArrowDown', 10, 4) ?? index
    expect(index).toBe(8)
    index = gridStep(index, 'ArrowRight', 10, 4) ?? index
    expect(index).toBe(9)
    index = gridStep(index, 'ArrowUp', 10, 4) ?? index
    expect(index).toBe(5)
  })
})

describe('tabStopIndex', () => {
  it('is the chosen item, or the first when nothing or an unknown value is chosen', () => {
    const values = ['a', 'b', 'c']
    expect(tabStopIndex(values, 'b')).toBe(1)
    expect(tabStopIndex(values, undefined)).toBe(0)
    expect(tabStopIndex(values, 'z')).toBe(0)
  })
})

describe('credits', () => {
  it('gives the catalogue attribution of the files shown, in the catalogue order', () => {
    const credits = creditsFor([
      'images/surface_asphalt.jpg',
      'icons/car.svg',
      'images/unknown.jpg',
    ])
    expect(credits.map((credit) => credit.file)).toEqual([
      'images/surface_asphalt.jpg',
      'icons/car.svg',
    ])
    expect(credits[1]?.license).toBe('GPL-3.0-or-later')
  })
})

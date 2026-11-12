import { describe, expect, test } from 'bun:test'
import { suggestedFavourites } from './settings.ts'

describe('suggested favourites', () => {
  test('are numbered from 4 in their order, repeats left out', () => {
    expect(
      suggestedFavourites([
        { presetId: 'golf/green', geometry: 'area' },
        { presetId: 'golf/hole', geometry: 'line' },
        { presetId: 'golf/green', geometry: 'area' },
      ]),
    ).toEqual([
      { presetId: 'golf/green', geometry: 'area', number: '4' },
      { presetId: 'golf/hole', geometry: 'line', number: '5' },
    ])
  })
})

import { describe, expect, it } from 'bun:test'
import {
  favouritesFor,
  findFavouriteByNumber,
  freeFavouriteNumber,
  isFavouriteNumber,
  moveFavourite,
  setFavouriteNumber,
  toggleFavourite,
  type Favourite,
} from './favourites.ts'

const bench: Favourite = { presetId: 'amenity/bench', geometry: 'point', number: '4' }
const cafe: Favourite = { presetId: 'amenity/cafe', geometry: 'point', number: '5' }
const path: Favourite = { presetId: 'highway/footway', geometry: 'line', number: '6' }

describe('isFavouriteNumber', () => {
  it('takes digits without a leading zero, of any length', () => {
    for (const ok of ['1', '9', '10', '39', '888', '1234567890123456789012345']) {
      expect(isFavouriteNumber(ok)).toBe(true)
    }
  })

  it('refuses empty, zero, a leading zero, and anything that is not digits', () => {
    for (const bad of ['', '0', '00', '03', ' 3', '3 ', '-3', '3.0', '3a', 'x']) {
      expect(isFavouriteNumber(bad)).toBe(false)
    }
  })
})

describe('toggleFavourite', () => {
  it('adds a preset at the end with the lowest free number', () => {
    expect(toggleFavourite([], 'amenity/bench', 'point')).toEqual([
      { presetId: 'amenity/bench', geometry: 'point', number: '1' },
    ])
    expect(toggleFavourite([bench], 'amenity/cafe', 'point')).toEqual([
      bench,
      { presetId: 'amenity/cafe', geometry: 'point', number: '1' },
    ])
  })

  it('takes a preset out again and frees its number', () => {
    expect(toggleFavourite([bench, cafe], 'amenity/bench', 'point')).toEqual([cafe])
    expect(toggleFavourite([cafe], 'amenity/bench', 'point')).toEqual([
      cafe,
      { presetId: 'amenity/bench', geometry: 'point', number: '1' },
    ])
  })

  it('tells one preset for two geometries apart, and numbers are unique across geometries', () => {
    const asLine = toggleFavourite([bench], 'amenity/bench', 'line')
    expect(asLine).toHaveLength(2)
    // 4 is bench's as a point, so the line takes the lowest free one
    expect(asLine[1]).toEqual({ presetId: 'amenity/bench', geometry: 'line', number: '1' })
  })

  it('has no limit: the lowest number after the used ones is taken', () => {
    const many: Favourite[] = Array.from({ length: 12 }, (_, index) => ({
      presetId: `p${index}`,
      geometry: 'point',
      number: String(index + 1),
    }))
    expect(toggleFavourite(many, 'new', 'point').at(-1)?.number).toBe('13')
  })
})

describe('freeFavouriteNumber', () => {
  it('is 1 with no favourites, and the first gap otherwise', () => {
    expect(freeFavouriteNumber([])).toBe('1')
    expect(freeFavouriteNumber([bench, cafe])).toBe('1')
    expect(
      freeFavouriteNumber([
        { ...bench, number: '1' },
        { ...cafe, number: '3' },
      ]),
    ).toBe('2')
  })
})

describe('setFavouriteNumber', () => {
  it('gives a favourite a number that no favourite has', () => {
    expect(setFavouriteNumber([bench, cafe], 'amenity/bench', 'point', '39')).toEqual([
      { ...bench, number: '39' },
      cafe,
    ])
  })

  it('swaps the numbers with the favourite that has the number', () => {
    expect(setFavouriteNumber([bench, cafe], 'amenity/bench', 'point', '5')).toEqual([
      { ...bench, number: '5' },
      { ...cafe, number: '4' },
    ])
  })

  it('a favourite of another geometry can be the one that is swapped', () => {
    expect(setFavouriteNumber([bench, path], 'highway/footway', 'line', '4')).toEqual([
      { ...bench, number: '6' },
      { ...path, number: '4' },
    ])
  })

  it('changes nothing for an invalid number, an unknown favourite or its own number', () => {
    const list = [bench, cafe]
    expect(setFavouriteNumber(list, 'amenity/bench', 'point', '')).toBe(list)
    expect(setFavouriteNumber(list, 'amenity/bench', 'point', '0')).toBe(list)
    expect(setFavouriteNumber(list, 'amenity/bench', 'point', '05')).toBe(list)
    expect(setFavouriteNumber(list, 'nope', 'point', '39')).toBe(list)
    expect(setFavouriteNumber(list, 'amenity/bench', 'point', '4')).toBe(list)
  })
})

describe('moveFavourite', () => {
  const list = [bench, path, cafe]

  it('swaps a favourite with its neighbour of the same geometry, numbers stay', () => {
    expect(moveFavourite(list, 'amenity/cafe', 'point', -1)).toEqual([cafe, path, bench])
    // the neighbour is the next point, not the line in between
    expect(moveFavourite(list, 'amenity/bench', 'point', 1)).toEqual([cafe, path, bench])
  })

  it('does nothing past the first or last favourite of its geometry', () => {
    expect(moveFavourite(list, 'amenity/bench', 'point', -1)).toEqual(list)
    expect(moveFavourite(list, 'amenity/cafe', 'point', 1)).toEqual(list)
  })

  it('does nothing for an unknown preset', () => {
    expect(moveFavourite(list, 'nope', 'point', 1)).toEqual(list)
  })
})

describe('lookups', () => {
  it('finds the favourite that a number starts', () => {
    expect(findFavouriteByNumber([bench, cafe], '5')).toBe(cafe)
    expect(findFavouriteByNumber([bench, cafe], '39')).toBeUndefined()
    expect(findFavouriteByNumber([bench, cafe], '04')).toBeUndefined()
  })

  it('lists the favourites of one geometry in their order', () => {
    expect(favouritesFor([bench, path, cafe], 'point')).toEqual([bench, cafe])
    expect(favouritesFor([bench, path, cafe], 'area')).toEqual([])
  })
})

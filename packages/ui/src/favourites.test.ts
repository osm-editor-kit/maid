import { describe, expect, it } from 'bun:test'
import {
  favouritesFor,
  findFavouriteByKey,
  freeFavouriteKey,
  isFavouritesFull,
  moveFavourite,
  toggleFavourite,
  type Favourite,
} from './favourites.ts'

const bench: Favourite = { presetId: 'amenity/bench', geometry: 'point', key: '4' }
const cafe: Favourite = { presetId: 'amenity/cafe', geometry: 'point', key: '5' }
const path: Favourite = { presetId: 'highway/footway', geometry: 'line', key: '6' }

describe('toggleFavourite', () => {
  it('adds a preset at the end with the first free key, left hand first', () => {
    expect(toggleFavourite([], 'amenity/bench', 'point')).toEqual([
      { presetId: 'amenity/bench', geometry: 'point', key: '4' },
    ])
    expect(toggleFavourite([bench], 'amenity/cafe', 'point')).toEqual([
      bench,
      { presetId: 'amenity/cafe', geometry: 'point', key: '5' },
    ])
  })

  it('takes a preset out again and frees its key', () => {
    expect(toggleFavourite([bench, cafe], 'amenity/bench', 'point')).toEqual([cafe])
    expect(toggleFavourite([cafe], 'amenity/bench', 'point')).toEqual([
      cafe,
      { presetId: 'amenity/bench', geometry: 'point', key: '4' },
    ])
  })

  it('tells one preset for two geometries apart', () => {
    const asLine = toggleFavourite([bench], 'amenity/bench', 'line')
    expect(asLine).toHaveLength(2)
    expect(asLine[1]).toEqual({ presetId: 'amenity/bench', geometry: 'line', key: '5' })
  })

  it('changes nothing when every key is taken', () => {
    const full: Favourite[] = ['4', '5', '6', '7', '8', '9', '0'].map((key, index) => ({
      presetId: `p${index}`,
      geometry: 'point',
      key: key as Favourite['key'],
    }))
    expect(isFavouritesFull(full)).toBe(true)
    expect(toggleFavourite(full, 'new', 'point')).toBe(full)
    // taking one out makes room again
    expect(toggleFavourite(full, 'p3', 'point')).toHaveLength(6)
  })
})

describe('moveFavourite', () => {
  const list = [bench, path, cafe]

  it('swaps a favourite with its neighbour of the same geometry, keys stay', () => {
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

describe('keys and lookups', () => {
  it('finds the first free key and the favourite of a key', () => {
    expect(freeFavouriteKey([])).toBe('4')
    expect(freeFavouriteKey([bench])).toBe('5')
    expect(freeFavouriteKey([bench, cafe, path])).toBe('7')
    expect(findFavouriteByKey([bench, cafe], '5')).toBe(cafe)
    expect(findFavouriteByKey([bench, cafe], '6')).toBeUndefined()
  })

  it('never uses the draw keys 1, 2 and 3', () => {
    const all = toggleFavourite([], 'a', 'point')
    expect(all[0]?.key).not.toBe('1')
    expect(['1', '2', '3']).not.toContain(freeFavouriteKey([]))
  })

  it('lists the favourites of one geometry in their order', () => {
    expect(favouritesFor([bench, path, cafe], 'point')).toEqual([bench, cafe])
    expect(favouritesFor([bench, path, cafe], 'area')).toEqual([])
  })
})

import { describe, expect, it } from 'bun:test'
import {
  findLoaded,
  labelMatching,
  LOADED_LIMIT,
  planarDistance,
  type LoadedFeature,
} from './loaded.ts'

const feature = (id: string, tags: Record<string, string>): LoadedFeature => ({ id, tags })

describe('labelMatching', () => {
  it('matches the name, ignoring case, and falls back to the ref', () => {
    expect(labelMatching({ name: 'Hauptstraße' }, 'haupt')).toBe('Hauptstraße')
    expect(labelMatching({ name: 'Main Street', ref: 'B 96' }, 'b 9')).toBe('B 96')
    expect(labelMatching({ name: 'Main Street', ref: 'B 96' }, 'street')).toBe('Main Street')
  })

  it('does not match other tags', () => {
    expect(labelMatching({ amenity: 'cafe', description: 'Berlin' }, 'berlin')).toBeUndefined()
  })
})

describe('findLoaded', () => {
  const features = [
    feature('n1', { name: 'Café Berlin' }),
    feature('w2', { name: 'Berliner Straße' }),
    feature('w3', { highway: 'primary', ref: 'B 96' }),
    feature('r4', { name: 'Park', type: 'multipolygon' }),
  ]
  const places: Record<string, { lon: number; lat: number }> = {
    n1: { lon: 13.5, lat: 52.5 },
    w2: { lon: 13.41, lat: 52.5 },
    w3: { lon: 13.0, lat: 52.5 },
  }
  const placeOf = (id: string) => places[id]

  it('finds names and refs that contain the text, nearest the centre first', () => {
    const hits = findLoaded(features, 'berlin', {
      centre: { lon: 13.4, lat: 52.5 },
      placeOf,
    })
    expect(hits.map((hit) => hit.id)).toEqual(['w2', 'n1'])
    expect(hits[0]?.label).toBe('Berliner Straße')
  })

  it('puts features without a place last', () => {
    const withoutPlace = [...features, feature('w5', { name: 'Berlin Platz' })]
    const hits = findLoaded(withoutPlace, 'berlin', { centre: { lon: 13.4, lat: 52.5 }, placeOf })
    expect(hits.map((hit) => hit.id)).toEqual(['w2', 'n1', 'w5'])
    expect(hits.at(-1)?.distance).toBe(Number.POSITIVE_INFINITY)
    const unplaced = findLoaded(features, 'Park', { placeOf: () => undefined })
    expect(unplaced).toHaveLength(1)
    expect(unplaced[0]?.distance).toBe(Number.POSITIVE_INFINITY)
  })

  it('searches nothing for a text shorter than two letters', () => {
    expect(findLoaded(features, 'b', { placeOf })).toEqual([])
    expect(findLoaded(features, ' ', { placeOf })).toEqual([])
  })

  it('gives at most twenty hits by default, and the limit when asked', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      feature(`n${index + 1}`, { name: `Bank ${index}` }),
    )
    const found = findLoaded(many, 'bank', { placeOf: () => undefined })
    expect(found).toHaveLength(LOADED_LIMIT)
    expect(LOADED_LIMIT).toBe(20)
    expect(findLoaded(many, 'bank', { placeOf: () => undefined, limit: 3 })).toHaveLength(3)
  })

  it('keeps the order of the data for features at the same distance', () => {
    const same = [feature('n9', { name: 'Abc Weg' }), feature('n2', { name: 'Abd Weg' })]
    const hits = findLoaded(same, 'ab', {
      centre: { lon: 0, lat: 0 },
      placeOf: () => ({ lon: 0, lat: 0 }),
    })
    expect(hits.map((hit) => hit.id)).toEqual(['n9', 'n2'])
  })
})

describe('planarDistance', () => {
  it('is zero for the same place and grows with the distance', () => {
    const origin = { lon: 13.4, lat: 52.5 }
    expect(planarDistance(origin, origin)).toBe(0)
    expect(planarDistance(origin, { lon: 13.5, lat: 52.5 })).toBeLessThan(
      planarDistance(origin, { lon: 13.6, lat: 52.5 }),
    )
  })
})

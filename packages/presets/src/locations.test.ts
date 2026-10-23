import { describe, expect, it } from 'bun:test'
import { LocationConflation } from '@rapideditor/location-conflation'
import { defaultPresetData } from './default.ts'
import { createLocations } from './locations.ts'
import type { LonLat } from './types.ts'

// Coordinates chosen well inside their countries.
const PARIS: LonLat = [2.3522, 48.8566]
const BERLIN: LonLat = [13.405, 52.52]
const SOFIA: LonLat = [23.3219, 42.6977]
const MANILA: LonLat = [120.9842, 14.5995]
const NEW_YORK: LonLat = [-74.006, 40.7128]
const OCEAN: LonLat = [-120, -30]

describe('countryAt', () => {
  it('gives the ISO code of the country in lower case, as the address formats use it', () => {
    const locations = createLocations()
    expect(locations.countryAt(PARIS)).toBe('fr')
    expect(locations.countryAt(BERLIN)).toBe('de')
    expect(locations.countryAt(SOFIA)).toBe('bg')
    expect(locations.countryAt(MANILA)).toBe('ph')
    expect(locations.countryAt(NEW_YORK)).toBe('us')
  })

  it('gives undefined outside every country', () => {
    expect(createLocations().countryAt(OCEAN)).toBeUndefined()
  })

  it('answers the same for the same point again', () => {
    const locations = createLocations()
    expect(locations.countryAt(PARIS)).toBe('fr')
    expect(locations.countryAt(BERLIN)).toBe('de')
    expect(locations.countryAt(PARIS)).toBe('fr')
  })
})

// Hong Kong and Macao lie in China and Greenland in Denmark; the territory comes first, as iD's address field tries it.
const HONG_KONG: LonLat = [114.1694, 22.3193]
const MACAO: LonLat = [113.5439, 22.1987]
const GREENLAND: LonLat = [-51.7214, 64.1836]

describe('countryCodesAt', () => {
  it('gives the territory, then the country, in lower case and each once', () => {
    const locations = createLocations()
    expect(locations.countryCodesAt(HONG_KONG)).toEqual(['hk', 'cn'])
    expect(locations.countryCodesAt(MACAO)).toEqual(['mo', 'cn'])
    expect(locations.countryCodesAt(GREENLAND)).toEqual(['gl', 'dk'])
    expect(locations.countryCodesAt(BERLIN)).toEqual(['de'])
  })

  it('gives no code outside every country', () => {
    expect(createLocations().countryCodesAt(OCEAN)).toEqual([])
  })

  it('keeps countryAt to the country alone', () => {
    const locations = createLocations()
    expect(locations.countryAt(HONG_KONG)).toBe('cn')
    expect(locations.countryAt(GREENLAND)).toBe('dk')
    expect(locations.countryAt(BERLIN)).toBe('de')
  })
})

describe('matchesLocation', () => {
  it('holds everywhere when there is no location set', () => {
    expect(createLocations().matchesLocation(undefined, PARIS)).toBe(true)
  })

  it('holds for an included country and not for another', () => {
    const locations = createLocations()
    expect(locations.matchesLocation({ include: ['de'] }, BERLIN)).toBe(true)
    expect(locations.matchesLocation({ include: ['de'] }, PARIS)).toBe(false)
  })

  it('takes codes in any case, as iD does', () => {
    const locations = createLocations()
    expect(locations.matchesLocation({ include: ['DE'] }, BERLIN)).toBe(true)
    expect(locations.matchesLocation({ include: ['de'] }, BERLIN)).toBe(true)
  })

  it('holds for a group of countries (the union of include)', () => {
    const locations = createLocations()
    const set = { include: ['DE', 'AT', 'CH'] }
    expect(locations.matchesLocation(set, BERLIN)).toBe(true)
    expect(locations.matchesLocation(set, PARIS)).toBe(false)
  })

  it('takes the exclusions away from the included world', () => {
    const locations = createLocations()
    const set = { include: ['Planet'], exclude: ['fr'] }
    expect(locations.matchesLocation(set, PARIS)).toBe(false)
    expect(locations.matchesLocation(set, BERLIN)).toBe(true)
    expect(locations.matchesLocation(set, NEW_YORK)).toBe(true)
  })

  it('reads Planet, 001 and Q2 as the world', () => {
    const locations = createLocations()
    for (const world of ['Planet', '001', 'Q2']) {
      expect(locations.matchesLocation({ include: [world] }, PARIS)).toBe(true)
      expect(locations.matchesLocation({ include: [world] }, OCEAN)).toBe(true)
    }
  })

  it('reads a region by its Wikidata id and its code', () => {
    const locations = createLocations()
    expect(locations.matchesLocation({ include: ['Q46'] }, PARIS)).toBe(true)
    expect(locations.matchesLocation({ include: ['Q46'] }, NEW_YORK)).toBe(false)
    expect(locations.matchesLocation({ include: ['EU'] }, BERLIN)).toBe(true)
    expect(locations.matchesLocation({ include: ['EU'] }, NEW_YORK)).toBe(false)
  })

  it('holds everywhere for a set that cannot be read, as iD falls back to the world', () => {
    expect(createLocations().matchesLocation({}, PARIS)).toBe(true)
  })

  it('holds everywhere for a code that is not a region: iD falls back to the world for a set it cannot read', () => {
    expect(createLocations().matchesLocation({ include: ['zz'] }, PARIS)).toBe(true)
  })

  it('does not change the set it is given', () => {
    const set = { include: ['de'] }
    createLocations().matchesLocation(set, BERLIN)
    expect(set).toEqual({ include: ['de'] })
  })

  it('answers a set that is registered after a point was asked about', () => {
    // The answer for the last point is cached. A new set must not be answered from the old answer.
    const locations = createLocations()
    expect(locations.matchesLocation({ include: ['de'] }, PARIS)).toBe(false)
    expect(locations.matchesLocation({ include: ['fr'] }, PARIS)).toBe(true)
    expect(locations.matchesLocation({ include: ['de'] }, PARIS)).toBe(false)
  })

  it('gives the same answer for the same set and point, whichever object carries the set', () => {
    const locations = createLocations()
    expect(locations.matchesLocation({ include: ['ph'] }, MANILA)).toBe(true)
    expect(locations.matchesLocation({ include: ['ph'] }, MANILA)).toBe(true)
    expect(locations.matchesLocation({ include: ['ph'] }, PARIS)).toBe(false)
  })
})

// The fast path for sets of country-coder regions (locations.ts) must give the answer of location-conflation's polygons.
describe('matchesLocation against location-conflation', () => {
  const sets = (() => {
    const found = new Map<string, { include?: string[]; exclude?: string[] }>()
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk)
      if (typeof value !== 'object' || value === null) return
      const record = value as Record<string, unknown>
      const set = record.locationSet
      if (set && typeof set === 'object')
        found.set(JSON.stringify(set), set as { include?: string[] })
      for (const child of Object.values(record)) walk(child)
    }
    walk(defaultPresetData.presets)
    walk(defaultPresetData.fields)
    // shapes the data may not have yet
    for (const set of [
      { include: ['Q46'] },
      { include: ['eu'] },
      { include: ['de', 'at', 'ch'] },
      { include: ['Planet'], exclude: ['us', 'Q46'] },
      { include: ['001'], exclude: ['gb'] },
      { include: ['Q46'], exclude: ['gb', 'ie'] },
      { include: ['pr'] },
      { include: ['ic', 'es'] },
    ])
      found.set(JSON.stringify(set), set)
    return [...found.values()]
  })()

  // a lattice over the world, the places where groups and territories differ from their country, and the ocean
  const points: LonLat[] = []
  for (let lon = -179; lon <= 179; lon += 3.7)
    for (let lat = -80; lat <= 80; lat += 3.1) points.push([lon, lat])
  points.push(
    PARIS,
    BERLIN,
    SOFIA,
    MANILA,
    NEW_YORK,
    OCEAN,
    [-17.9, 28.5], // the Canary Islands
    [-2.9, 35.9], // Melilla
    [-66.1, 18.4], // Puerto Rico
    [-2.1, 49.2], // Jersey
    [-4.5, 54.2], // the Isle of Man
    [12.45, 41.9], // the Vatican
    [-61.5, 12.1], // Grenada
    [55.5, -21.1], // Reunion
    [-52.3, 4.9], // French Guiana
    [-8.6, 41.1], // Porto
    [-149.9, 61.2], // Alaska
    [-155.5, 19.6], // Hawaii
    [33.4, 35.1], // Cyprus
    [24.9, 60.2], // Helsinki
    [-21.9, 64.1], // Reykjavik
    [37.6, 55.7], // Moscow
    [28.9, 41.0], // Istanbul
  )

  it(`gives the answer of the polygons for ${sets.length} sets at every point`, () => {
    const reference = new LocationConflation()
    const locations = createLocations()
    const mismatches: string[] = []
    for (const set of sets) {
      const [registered] = reference.registerLocationSets([
        { locationSet: { include: set.include?.slice(), exclude: set.exclude?.slice() } },
      ])
      const id = registered?.locationSetID
      for (const point of points) {
        const expected =
          id === undefined ? true : reference.locationSetsAt([point[0], point[1]]).has(id)
        if (locations.matchesLocation(set, point) !== expected)
          mismatches.push(
            `${JSON.stringify(set)} at ${point.join(',')}: expected ${String(expected)}`,
          )
      }
    }
    expect(mismatches.slice(0, 20)).toEqual([])
  })
})

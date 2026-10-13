import { describe, expect, it } from 'bun:test'
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

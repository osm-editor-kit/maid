// Adopted from iD test/spec/presets/collection.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { createPresets } from './presets.ts'
import type { Preset, Presets } from './types.ts'

type Raw = Record<string, unknown>

// The presets of iD's test. iD's names are in English already; Maid reads them from the raw data when
// there is no translation, so the `__TEST/` ids are kept only to match iD's test.
const POINT: Raw = { name: 'Point', tags: {}, geometry: ['point'], matchScore: 0.1 }

const RAW: Record<string, Raw> = {
  point: POINT,
  line: { name: 'Line', tags: {}, geometry: ['line'], matchScore: 0.1 },
  area: { name: 'Area', tags: { area: 'yes' }, geometry: ['area'], matchScore: 0.1 },
  '__TEST/amenity/bbq': { name: 'Grill', tags: { amenity: 'bbq' }, geometry: ['point'], terms: [] },
  '__TEST/amenity/grit_bin': {
    name: 'Sandpit',
    tags: { amenity: 'grit_bin' },
    geometry: ['point'],
    terms: [],
  },
  '__TEST/highway/residential': {
    name: 'Residential Area',
    tags: { highway: 'residential' },
    geometry: ['point', 'area'],
    terms: [],
  },
  '__TEST/landuse/grass1': {
    name: 'Grass',
    tags: { landuse: 'grass' },
    geometry: ['point', 'area'],
    terms: [],
  },
  '__TEST/landuse/grass2': {
    name: 'Ğṝȁß',
    tags: { landuse: 'ğṝȁß' },
    geometry: ['point', 'area'],
    terms: [],
  },
  '__TEST/leisure/park': {
    name: 'Park',
    tags: { leisure: 'park' },
    geometry: ['point', 'area'],
    aliases: ['Field'],
    terms: ['grass'],
    matchScore: 0.5,
  },
  '__TEST/amenity/parking': {
    name: 'Parking',
    tags: { amenity: 'parking' },
    geometry: ['point', 'area'],
    terms: ['cars'],
  },
  '__TEST/leisure/pitch/soccer': {
    name: 'Soccer Field',
    tags: { leisure: 'pitch', sport: 'soccer' },
    geometry: ['point', 'area'],
    terms: ['fußball'],
  },
  '__TEST/leisure/pitch/american_football': {
    name: 'Football Field',
    tags: { leisure: 'pitch', sport: 'american_football' },
    geometry: ['point', 'area'],
    terms: ['gridiron'],
  },
}

function presetsOf(presets: Record<string, Raw>): Presets {
  return createPresets({ presets, fields: {}, translations: {} })
}

function get(presets: Presets, id: string): Preset {
  const preset = presets.preset(id)
  if (!preset) throw new Error(`no preset ${id}`)
  return preset
}

/** The position of a preset in a list, by id: iD's `collection.indexOf` in the test expectations. */
function at(list: Preset[], id: string): number {
  return list.findIndex((preset) => preset.id === id)
}

const presets = presetsOf(RAW)

describe('iD.presetCollection', () => {
  describe('#item', () => {
    it('fetches a preset by id', () => {
      expect(presets.preset('__TEST/highway/residential')).toEqual(
        get(presets, '__TEST/highway/residential'),
      )
      expect(get(presets, '__TEST/highway/residential').name).toBe('Residential Area')
    })
  })

  describe('#matchGeometry', () => {
    it('returns a new collection only containing presets matching a geometry', () => {
      const area = presets.search('', 'area', 1000)
      for (const id of [
        'area',
        '__TEST/highway/residential',
        '__TEST/leisure/park',
        '__TEST/leisure/pitch/soccer',
        '__TEST/leisure/pitch/american_football',
      ]) {
        expect(area.map((p) => p.id)).toContain(id)
      }
      expect(area.every((p) => p.geometry.includes('area'))).toBe(true)
    })
  })

  describe('#search', () => {
    it('matches leading name', () => {
      const result = presets.search('resid', 'area')
      expect(at(result, '__TEST/highway/residential')).toEqual(0) // 1. 'Residential' (by name)
    })

    it('returns alternate matches in correct order', () => {
      const result = presets.search('gri', 'point')
      expect(at(result, '__TEST/amenity/bbq'), 'Grill').toEqual(0) // 1. 'Grill' (leading name)
      expect(at(result, '__TEST/leisure/pitch/american_football'), 'Football').toEqual(1) // 2. 'Football' (leading term 'gridiron')
      expect(at(result, '__TEST/amenity/grit_bin'), 'Sandpit').toEqual(2) // 3. 'Sandpit' (leading tag value 'grit_bin')
      expect(at(result, '__TEST/landuse/grass1'), 'Grass').toBeGreaterThanOrEqual(3) // 4. 'Grass' (similar name)
      expect(at(result, '__TEST/landuse/grass1'), 'Grass').toBeLessThanOrEqual(5)
      expect(at(result, '__TEST/landuse/grass2'), 'Ğṝȁß').toBeGreaterThanOrEqual(3) // 5. 'Ğṝȁß' (similar name)
      expect(at(result, '__TEST/landuse/grass2'), 'Ğṝȁß').toBeLessThanOrEqual(5)
      expect(at(result, '__TEST/leisure/park'), 'Park').toBeGreaterThanOrEqual(3) // 6. 'Park' (similar term 'grass')
      expect(at(result, '__TEST/leisure/park'), 'Park').toBeLessThanOrEqual(5)
    })

    it('matches alias', () => {
      const result = presets.search('Field', 'area')
      expect(at(result, '__TEST/leisure/park')).toEqual(0) // 1. 'Park' (by alias)
    })

    it('sorts preset with matchScore penalty below others', () => {
      const result = presets.search('par', 'point')
      expect(at(result, '__TEST/amenity/parking'), 'Parking').toEqual(0) // 1. 'Parking' (default matchScore)
      expect(at(result, '__TEST/leisure/park'), 'Park').toEqual(1) // 2. 'Park' (low matchScore)
    })

    it('ignores matchScore penalty for exact name match', () => {
      const result = presets.search('park', 'point')
      expect(at(result, '__TEST/leisure/park'), 'Park').toEqual(0) // 1. 'Park' (low matchScore)
      expect(at(result, '__TEST/amenity/parking'), 'Parking').toEqual(1) // 2. 'Parking' (default matchScore)
    })

    it('considers diacritics on exact matches', () => {
      const result = presets.search('ğṝȁ', 'point')
      expect(at(result, '__TEST/landuse/grass2'), 'Ğṝȁß').toEqual(0) // 1. 'Ğṝȁß'  (leading name)
      expect(at(result, '__TEST/landuse/grass1'), 'Grass').toEqual(1) // 2. 'Grass' (similar name)
    })

    it('replaces diacritics on fuzzy matches', () => {
      const result = presets.search('graß', 'point')
      expect(at(result, '__TEST/landuse/grass1'), 'Grass').toBeGreaterThanOrEqual(0) // 1. 'Grass' (similar name)
      expect(at(result, '__TEST/landuse/grass1'), 'Grass').toBeLessThanOrEqual(1)
      expect(at(result, '__TEST/landuse/grass2'), 'Ğṝȁß').toBeGreaterThanOrEqual(0) // 2. 'Ğṝȁß'  (similar name)
      expect(at(result, '__TEST/landuse/grass2'), 'Ğṝȁß').toBeLessThanOrEqual(1)
    })

    it('includes the appropriate fallback preset', () => {
      expect(
        presets.search('foo', 'point').map((p) => p.id),
        'point',
      ).toContain('point')
      expect(
        presets.search('foo', 'line').map((p) => p.id),
        'line',
      ).toContain('line')
      expect(
        presets.search('foo', 'area').map((p) => p.id),
        'area',
      ).toContain('area')
    })

    it('excludes presets with searchable: false', () => {
      const local = presetsOf({
        excluded: {
          name: 'excluded',
          tags: { amenity: 'excluded' },
          geometry: ['point'],
          searchable: false,
        },
        point: POINT,
      })
      expect(local.search('excluded', 'point').map((p) => p.id)).not.toContain('excluded')
    })

    it('matches tag key=value', () => {
      const result = presets.search('landuse=grass', 'area')
      expect(at(result, '__TEST/landuse/grass1')).toEqual(0) // 1. 'Grass' (by tag key=value)
    })

    it('matches tag key=value in addTags', () => {
      const local = presetsOf({
        '__TEST/education/school': {
          name: 'School',
          tags: { education: 'school' },
          addTags: { amenity: 'school', education: 'school' },
          geometry: ['point', 'area'],
          terms: [],
        },
        point: POINT,
      })
      const result = local.search('amenity=school', 'point')
      expect(at(result, '__TEST/education/school')).toEqual(0)
    })

    it.each([
      'private grill',
      'very private and secret mysterious grill',
      'private grill in garden',
    ])('returns matches also when search term includes the preset name as substring', (search) => {
      const result = presets.search(search, 'point')
      expect(at(result, '__TEST/amenity/bbq'), 'Grill').toEqual(0)
    })
  })
})

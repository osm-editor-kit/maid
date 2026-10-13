// Adopted from iD test/spec/presets/index.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { createPresets } from './presets.ts'
import type { Presets } from './types.ts'

type Raw = Record<string, unknown>

// Maid builds the whole index once, in createPresets, from the data it is given. iD's presetIndex loads its
// data with the file fetcher and then matches entities against it: Maid takes the geometry as an argument.
function presetsOf(presets: Record<string, Raw>): Presets {
  return createPresets({ presets, fields: {}, translations: {} })
}

describe('iD.presetIndex', () => {
  describe('#init', () => {
    // The fallback presets are built in, one for each geometry. iD's graph is replaced by the geometry.
    const presets = presetsOf({})

    it('has a fallback point preset', () => {
      expect(presets.match({}, 'point').id).toEqual('point')
    })

    it('has a fallback line preset', () => {
      expect(presets.match({}, 'line').id).toEqual('line')
    })

    it('has a fallback area preset', () => {
      expect(presets.match({ area: 'yes' }, 'area').id).toEqual('area')
    })

    it('has a fallback relation preset', () => {
      expect(presets.match({}, 'relation').id).toEqual('relation')
    })
  })

  describe('#match', () => {
    const testPresets = {
      residential: { tags: { highway: 'residential' }, geometry: ['line'] },
      park: { tags: { leisure: 'park' }, geometry: ['point', 'area'] },
    }

    it('returns a collection containing presets matching a geometry and tags', () => {
      const presets = presetsOf(testPresets)
      expect(presets.match({ highway: 'residential' }, 'line').id).toEqual('residential')
    })

    it('returns the appropriate fallback preset when no tags match', () => {
      const presets = presetsOf(testPresets)
      expect(presets.match({}, 'point').id).toEqual('point')
      expect(presets.match({ foo: 'bar' }, 'line').id).toEqual('line')
    })

    it('matches vertices on a line as points', () => {
      // park has no vertex geometry, so a vertex with leisure=park falls back to the point preset
      const presets = presetsOf(testPresets)
      expect(presets.match({ leisure: 'park' }, 'vertex').id).toEqual('point')
    })
  })

  describe('#areaKeys', () => {
    const testPresets = {
      'amenity/fuel/shell': {
        tags: { amenity: 'fuel' },
        geometry: ['point', 'area'],
        suggestion: true,
      },
      'highway/foo': { tags: { highway: 'foo' }, geometry: ['area'] },
      'leisure/track': { tags: { leisure: 'track' }, geometry: ['line', 'area'] },
      natural: { tags: { natural: '*' }, geometry: ['point', 'vertex', 'area'] },
      'natural/peak': { tags: { natural: 'peak' }, geometry: ['point', 'vertex'] },
      'natural/tree_row': { tags: { natural: 'tree_row' }, geometry: ['line'] },
      'natural/wood': { tags: { natural: 'wood' }, geometry: ['point', 'area'] },
    }

    it('includes keys for presets with area geometry', () => {
      expect(presetsOf(testPresets).areaKeys()).toHaveProperty('natural')
    })

    it('discards key-values for presets with a line geometry', () => {
      const areaKeys = presetsOf(testPresets).areaKeys()
      expect(areaKeys.natural).toHaveProperty('tree_row')
      expect(areaKeys.natural?.tree_row).toBe(true)
    })

    it('discards key-values for presets with both area and line geometry', () => {
      expect(presetsOf(testPresets).areaKeys().leisure).toHaveProperty('track')
    })

    it('does not discard key-values for presets with neither area nor line geometry', () => {
      expect(presetsOf(testPresets).areaKeys().natural).not.toHaveProperty('peak')
    })

    it("does not discard generic '*' key-values", () => {
      expect(presetsOf(testPresets).areaKeys().natural).not.toHaveProperty('natural')
    })

    it("ignores keys like 'highway' that are assumed to be lines", () => {
      expect(presetsOf(testPresets).areaKeys()).not.toHaveProperty('highway')
    })

    it('ignores suggestion presets', () => {
      expect(presetsOf(testPresets).areaKeys()).not.toHaveProperty('amenity')
    })
  })

  describe('#addablePresetIDs', () => {
    // needs F-presets-2
    it.todo('addablePresetIDs is initially null', () => {})
    // needs F-presets-2
    it.todo('can set and get addablePresetIDs', () => {})
    // needs F-presets-2
    it.todo('ignores invalid IDs in addablePresetIDs', () => {})
    // needs F-presets-2
    it.todo('addablePresetIDs are default presets', () => {})
  })

  describe('#build', () => {
    // needs F-presets-6
    it.todo('builds presets from provided', () => {})
    // needs F-presets-6
    it.todo("configures presets' initial visibility", () => {})
  })

  describe('expected matches', () => {
    const testPresets = {
      building: { name: 'Building', tags: { building: 'yes' }, geometry: ['area'] },
      'type/multipolygon': {
        name: 'Multipolygon',
        geometry: ['area', 'relation'],
        tags: { type: 'multipolygon' },
        searchable: false,
        matchScore: 0.1,
      },
      address: {
        name: 'Address',
        geometry: ['point', 'vertex', 'area'],
        tags: { 'addr:*': '*' },
        matchScore: 0.15,
      },
      'highway/pedestrian_area': {
        name: 'Pedestrian Area',
        geometry: ['area'],
        tags: { highway: 'pedestrian', area: 'yes' },
      },
    }

    // A multipolygon relation is matched as an area: iD's entity geometry gives 'area' for it.
    it('prefers building to multipolygon', () => {
      const presets = presetsOf(testPresets)
      expect(presets.match({ type: 'multipolygon', building: 'yes' }, 'area').id).toEqual(
        'building',
      )
    })

    it('prefers building to address', () => {
      const presets = presetsOf(testPresets)
      expect(
        presets.match({ area: 'yes', building: 'yes', 'addr:housenumber': '1234' }, 'area').id,
      ).toEqual('building')
    })

    it('prefers pedestrian to area', () => {
      const presets = presetsOf(testPresets)
      expect(presets.match({ area: 'yes', highway: 'pedestrian' }, 'area').id).toEqual(
        'highway/pedestrian_area',
      )
    })
  })

  describe('#fromExternal', () => {
    // needs F-presets-7
    it.todo('builds presets w/external sources set to addable', () => {})
    // needs F-presets-7
    it.todo('makes only the external presets initially addable', () => {})
  })

  describe('PresetIndex.recents', () => {
    // ported in browse.test.ts ("fills all recent slots even when some remembered presets are not in the region (iD #11405)"):
    // the recents are the editor's list of ids, read by browseOf
  })
})

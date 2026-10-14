// Adopted from iD test/spec/presets/preset.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { createPresets } from './presets.ts'
import type { Preset, Presets } from './types.ts'

type Raw = Record<string, unknown>

// iD's tests set osmAreaKeys to { building, natural } for the setTags and unsetTags tests. These two presets
// give Maid the same area keys, and every test below adds its own presets on top.
const AREA_KEY_PRESETS: Record<string, Raw> = {
  building: { tags: { building: 'yes' }, geometry: ['area'] },
  natural: { tags: { natural: '*' }, geometry: ['area'] },
}

function presetsOf(presets: Record<string, Raw>, fields: Record<string, Raw> = {}): Presets {
  return createPresets({ presets: { ...AREA_KEY_PRESETS, ...presets }, fields, translations: {} })
}

function get(presets: Presets, id: string): Preset {
  const preset = presets.preset(id)
  if (!preset) throw new Error(`no preset ${id}`)
  return preset
}

describe('iD.presetPreset', () => {
  describe('#fields', () => {
    it('has no fields by default', () => {
      const presets = presetsOf({ test: {} })
      expect(presets.fieldsFor(get(presets, 'test'), {}, 'point')).toEqual([])
    })
  })

  describe('#moreFields', () => {
    it('has no moreFields by default', () => {
      const presets = presetsOf({ test: {} })
      expect(presets.moreFieldsFor(get(presets, 'test'), {}, 'point')).toEqual([])
    })
  })

  describe('#matchGeometry', () => {
    it("returns false if it doesn't match", () => {
      const presets = presetsOf({ test: { geometry: ['line'] } })
      expect(presets.matchGeometry(get(presets, 'test'), 'point')).toEqual(false)
    })

    it('returns true if it does match', () => {
      const presets = presetsOf({ test: { geometry: ['point', 'line'] } })
      expect(presets.matchGeometry(get(presets, 'test'), 'point')).toEqual(true)
    })
  })

  describe('#matchAllGeometry', () => {
    it("returns false if they don't all match", () => {
      const presets = presetsOf({ test: { geometry: ['line'] } })
      expect(presets.matchAllGeometry(get(presets, 'test'), ['point', 'line'])).toEqual(false)
    })

    it('returns true if they do all match', () => {
      const presets = presetsOf({ test: { geometry: ['point', 'line'] } })
      expect(presets.matchAllGeometry(get(presets, 'test'), ['point', 'line'])).toEqual(true)
    })
  })

  describe('#matchScore', () => {
    it('returns -1 if preset does not match tags', () => {
      const presets = presetsOf({ test: { tags: { foo: 'bar' } } })
      expect(presets.matchScore(get(presets, 'test'), { highway: 'motorway' })).toEqual(-1)
    })

    it('returns the value of the matchScore property when matched', () => {
      const presets = presetsOf({ test: { tags: { highway: 'motorway' }, matchScore: 0.2 } })
      expect(presets.matchScore(get(presets, 'test'), { highway: 'motorway' })).toEqual(0.2)
    })

    it('defaults to the number of matched tags', () => {
      const one = presetsOf({ test: { tags: { highway: 'residential' } } })
      expect(one.matchScore(get(one, 'test'), { highway: 'residential' })).toEqual(1)

      const two = presetsOf({ test: { tags: { highway: 'service', service: 'alley' } } })
      expect(two.matchScore(get(two, 'test'), { highway: 'service', service: 'alley' })).toEqual(2)
    })

    it('counts * as a match for any value with score 0.5', () => {
      const presets = presetsOf({ test: { tags: { building: '*' } } })
      expect(presets.matchScore(get(presets, 'test'), { building: 'yep' })).toEqual(0.5)
    })

    it('boosts matchScore for additional matches in addTags', () => {
      const presets = presetsOf({
        'shop/supermarket/walmart_supercenter': {
          tags: { 'brand:wikidata': 'Q483551', shop: 'supermarket' },
          addTags: { name: 'Walmart Supercenter' },
        },
        'shop/supermarket/walmart_market': {
          tags: { 'brand:wikidata': 'Q483551', shop: 'supermarket' },
          addTags: { name: 'Walmart Neighborhood Market' },
        },
      })
      const supercenterPreset = get(presets, 'shop/supermarket/walmart_supercenter')
      const marketPreset = get(presets, 'shop/supermarket/walmart_market')

      const supercenter = {
        'brand:wikidata': 'Q483551',
        shop: 'supermarket',
        name: 'Walmart Supercenter',
      }
      const market = {
        'brand:wikidata': 'Q483551',
        shop: 'supermarket',
        name: 'Walmart Neighborhood Market',
      }

      expect(presets.matchScore(supercenterPreset, supercenter)).toBeGreaterThan(
        presets.matchScore(marketPreset, supercenter),
      )
      expect(presets.matchScore(marketPreset, market)).toBeGreaterThan(
        presets.matchScore(supercenterPreset, market),
      )
    })
  })

  describe('isFallback', () => {
    it('returns true if preset has no tags', () => {
      const presets = presetsOf({ point: { tags: {} } })
      expect(presets.isFallback(get(presets, 'point'))).toEqual(true)
    })

    it("returns true if preset has a single 'area' tag", () => {
      const presets = presetsOf({ area: { tags: { area: 'yes' } } })
      expect(presets.isFallback(get(presets, 'area'))).toEqual(true)
    })

    it("returns false if preset has a single non-'area' tag", () => {
      const presets = presetsOf({ building: { tags: { building: 'yes' } } })
      expect(presets.isFallback(get(presets, 'building'))).toEqual(false)
    })

    it('returns false if preset has multiple tags', () => {
      const presets = presetsOf({ building: { tags: { area: 'yes', building: 'yes' } } })
      expect(presets.isFallback(get(presets, 'building'))).toEqual(false)
    })

    // the four generic presets are seeded (iD's presets/index.js), so every presetsOf has them
    it('is true for the generic point, line and relation presets (no tags)', () => {
      const presets = presetsOf({})
      expect(presets.isFallback(get(presets, 'point'))).toEqual(true)
      expect(presets.isFallback(get(presets, 'line'))).toEqual(true)
      expect(presets.isFallback(get(presets, 'relation'))).toEqual(true)
    })

    it('is true for the generic area preset (area=yes only)', () => {
      const presets = presetsOf({})
      expect(get(presets, 'area').tags).toEqual({ area: 'yes' })
      expect(presets.isFallback(get(presets, 'area'))).toEqual(true)
    })

    it('is false for a preset with a tag of its own, on any geometry', () => {
      const presets = presetsOf({
        bench: { tags: { amenity: 'bench' }, geometry: ['point', 'vertex'] },
        route: { tags: { type: 'route' }, geometry: ['relation'] },
        footway: { tags: { highway: 'footway', area: 'yes' }, geometry: ['area'] },
      })
      expect(presets.isFallback(get(presets, 'bench'))).toEqual(false)
      expect(presets.isFallback(get(presets, 'route'))).toEqual(false)
      expect(presets.isFallback(get(presets, 'footway'))).toEqual(false)
    })

    // the model asks the match, not the preset by id: a bare feature matches a fallback, a tagged one does not
    it('answers the same for the preset a match finds', () => {
      const presets = presetsOf({
        bench: { tags: { amenity: 'bench' }, geometry: ['point', 'vertex'] },
        route: { tags: { type: 'route' }, geometry: ['relation'] },
      })
      const answer = (
        tags: Record<string, string>,
        geometry: 'point' | 'vertex' | 'area' | 'relation',
      ) => presets.isFallback(presets.match(tags, geometry))
      expect(answer({}, 'point')).toEqual(true)
      expect(answer({}, 'vertex')).toEqual(true)
      expect(answer({ area: 'yes' }, 'area')).toEqual(true)
      expect(answer({}, 'relation')).toEqual(true)
      expect(answer({ amenity: 'bench' }, 'point')).toEqual(false)
      expect(answer({ amenity: 'bench' }, 'vertex')).toEqual(false)
      expect(answer({ type: 'route' }, 'relation')).toEqual(false)
    })
  })

  describe('#setTags', () => {
    it('adds match tags', () => {
      const presets = presetsOf({ test: { tags: { highway: 'residential' } } })
      expect(presets.applyPreset({}, get(presets, 'test'), 'line')).toEqual({
        highway: 'residential',
      })
    })

    it("adds wildcard tags with value 'yes'", () => {
      const presets = presetsOf({ test: { tags: { natural: '*' } } })
      expect(presets.applyPreset({}, get(presets, 'test'), 'area')).toEqual({ natural: 'yes' })
    })

    it('prefers to add tags of addTags property', () => {
      const presets = presetsOf({ test: { tags: { building: '*' }, addTags: { building: 'ok' } } })
      expect(presets.applyPreset({}, get(presets, 'test'), 'area')).toEqual({ building: 'ok' })
    })

    it('adds default tags of fields with matching geometry', () => {
      const presets = presetsOf(
        { test: { fields: ['field'] } },
        { field: { key: 'building', geometry: ['area'], default: 'yes', type: 'check' } },
      )
      expect(presets.applyPreset({}, get(presets, 'test'), 'area')).toEqual({
        area: 'yes',
        building: 'yes',
      })
    })

    it('adds no default tags of fields with non-matching geometry', () => {
      const presets = presetsOf(
        { test: { fields: ['field'] } },
        { field: { key: 'building', geometry: ['area'], default: 'yes', type: 'check' } },
      )
      expect(presets.applyPreset({}, get(presets, 'test'), 'point')).toEqual({})
    })

    describe('for a preset with no tag in areaKeys', () => {
      const presets = presetsOf({
        test: { geometry: ['line', 'area'], tags: { name: 'testname', highway: 'pedestrian' } },
      })
      const preset = get(presets, 'test')

      it("doesn't add area=yes to non-areas", () => {
        expect(presets.applyPreset({}, preset, 'line')).toEqual({
          name: 'testname',
          highway: 'pedestrian',
        })
      })

      it('adds area=yes to areas', () => {
        expect(presets.applyPreset({}, preset, 'area')).toEqual({
          name: 'testname',
          highway: 'pedestrian',
          area: 'yes',
        })
      })
    })

    describe('for a preset with a tag in areaKeys', () => {
      it("doesn't add area=yes automatically", () => {
        const presets = presetsOf({
          test: { geometry: ['area'], tags: { name: 'testname', building: 'yes' } },
        })
        expect(presets.applyPreset({}, get(presets, 'test'), 'area')).toEqual({
          name: 'testname',
          building: 'yes',
        })
      })

      it('does add area=yes if asked to', () => {
        const presets = presetsOf({
          test: { geometry: ['area'], tags: { name: 'testname', area: 'yes' } },
        })
        expect(presets.applyPreset({}, get(presets, 'test'), 'area')).toEqual({
          name: 'testname',
          area: 'yes',
        })
      })
    })
  })

  describe('#unsetTags', () => {
    it('removes tags that match preset tags', () => {
      const presets = presetsOf({ test: { tags: { highway: 'residential' } } })
      expect(presets.unsetTags({ highway: 'residential' }, get(presets, 'test'), 'area')).toEqual(
        {},
      )
    })

    it('removes tags that match field default tags', () => {
      const presets = presetsOf(
        { test: { fields: ['field'] } },
        { field: { key: 'building', geometry: ['area'], default: 'yes', type: 'check' } },
      )
      expect(presets.unsetTags({ building: 'yes' }, get(presets, 'test'), 'area')).toEqual({})
    })

    it('removes area=yes', () => {
      const presets = presetsOf({ test: { tags: { highway: 'pedestrian' } } })
      expect(
        presets.unsetTags({ highway: 'pedestrian', area: 'yes' }, get(presets, 'test'), 'area'),
      ).toEqual({})
    })

    it('preserves tags that do not match field default value', () => {
      const presets = presetsOf(
        { test: { fields: ['field'] } },
        { field: { key: 'building', geometry: ['area'], default: 'yes', type: 'check' } },
      )
      expect(presets.unsetTags({ building: 'yep' }, get(presets, 'test'), 'area')).toEqual({
        building: 'yep',
      })
    })

    it('preserves tags that do match field default value, but do not match geometry', () => {
      const presets = presetsOf(
        { test: { fields: ['field'] } },
        { field: { key: 'building', geometry: ['area'], default: 'yes', type: 'check' } },
      )
      expect(presets.unsetTags({ building: 'yes' }, get(presets, 'test'), 'line')).toEqual({
        building: 'yes',
      })
    })

    it('preserves tags that are not listed in removeTags', () => {
      const presets = presetsOf({ test: { tags: { a: 'b' }, removeTags: {} } })
      expect(presets.unsetTags({ a: 'b' }, get(presets, 'test'), 'area')).toEqual({ a: 'b' })
    })

    it('preserves field default tags when "skipFieldDefaults" flag is on', () => {
      const presets = presetsOf(
        { test: { fields: ['field'] } },
        { field: { key: 'building', geometry: ['area'], default: 'yes', type: 'check' } },
      )
      expect(
        presets.unsetTags({ building: 'yes' }, get(presets, 'test'), 'area', undefined, {
          skipFieldDefaults: true,
        }),
      ).toEqual({ building: 'yes' })
    })

    it('preserves "ignoringKeys" tags', () => {
      const presets = presetsOf({ test: { tags: { a: 'a', b: 'b' } } })
      expect(presets.unsetTags({ a: 'a', b: 'b' }, get(presets, 'test'), 'area', ['b'])).toEqual({
        b: 'b',
      })
    })

    it('preserves "ignoringKeys" tags from default fields', () => {
      const presets = presetsOf(
        { test: { fields: ['field'] } },
        { field: { key: 'b', geometry: ['area'], default: 'default', type: 'check' } },
      )
      expect(presets.unsetTags({ b: 'default' }, get(presets, 'test'), 'area', ['b'])).toEqual({
        b: 'default',
      })
    })

    it('uses tags from addTags if removeTags is not defined', () => {
      const presets = presetsOf({ test: { tags: { a: 'b' }, addTags: { remove: 'me' } } })
      expect(presets.unsetTags({ a: 'b', remove: 'me' }, get(presets, 'test'), 'area')).toEqual({
        a: 'b',
      })
    })
  })

  describe('#addable', () => {
    // needs F-presets-2
    it.todo('sets/gets addability of preset', () => {})
  })
})

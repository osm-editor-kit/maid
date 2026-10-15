// iD's location sets (`locationSet`) in presets and fields. The schema cases use the bundled data; the default
// rule uses a small fixture. Each rule names the iD code it follows. Paris and Berlin are in France and
// Germany, Sofia in Bulgaria, Manila in the Philippines, New York and London in the US and the UK.
import { describe, expect, it } from 'bun:test'
import { defaultPresets as presets } from './default.ts'
import { createPresets } from './presets.ts'
import type { LonLat, Preset, Presets, Tags } from './types.ts'

const PARIS: LonLat = [2.3522, 48.8566]
const BERLIN: LonLat = [13.405, 52.52]
const SOFIA: LonLat = [23.3219, 42.6977]
const MANILA: LonLat = [120.9842, 14.5995]
const NEW_YORK: LonLat = [-74.006, 40.7128]
const LONDON: LonLat = [-0.1276, 51.5072]

function presetOf(id: string): Preset {
  const preset = presets.preset(id)
  if (!preset) throw new Error(`no preset ${id}`)
  return preset
}

function idsOf(list: Preset[]) {
  return list.map((preset) => preset.id)
}

function fieldIdsOf(list: { id: string }[]) {
  return list.map((field) => field.id)
}

const CROSSING_TAGS: Tags = { highway: 'crossing', crossing: 'uncontrolled' }

describe('as iD: crossing:markings, the defaults of location-bound fields', () => {
  // iD's preset.fields(loc) keeps the four crossing/markings_yes* fields, and each has the default `yes`
  // inside its own location set. Together the four cover the world, so iD writes `yes` everywhere. What the
  // location changes is which of them is shown, and the options it lists.
  it('as iD: the default is written in Paris and in Berlin, each by the field that holds there', () => {
    const uncontrolled = presetOf('highway/crossing/uncontrolled')
    for (const loc of [PARIS, BERLIN]) {
      const tags = presets.applyPreset({}, uncontrolled, 'vertex', undefined, { loc })
      expect(tags['crossing:markings']).toBe('yes')
    }
  })

  it('as iD: in Paris the base field is shown, in Berlin the DE-AT-CH variant, and without a location all four', () => {
    const uncontrolled = presetOf('highway/crossing/uncontrolled')
    const markings = (loc?: LonLat) =>
      fieldIdsOf(presets.fieldsFor(uncontrolled, CROSSING_TAGS, 'vertex', loc)).filter((id) =>
        id.startsWith('crossing/markings_yes'),
      )
    expect(markings(PARIS)).toEqual(['crossing/markings_yes'])
    expect(markings(BERLIN)).toEqual(['crossing/markings_yes-DE-AT-CH'])
    expect(markings()).toEqual([
      'crossing/markings_yes',
      'crossing/markings_yes-BG',
      'crossing/markings_yes-DE-AT-CH',
      'crossing/markings_yes-PL',
    ])
  })

  it('the variant shown in Berlin lists its own options', () => {
    const uncontrolled = presetOf('highway/crossing/uncontrolled')
    const berlin = presets
      .fieldsFor(uncontrolled, CROSSING_TAGS, 'vertex', BERLIN)
      .find((field) => field.id === 'crossing/markings_yes-DE-AT-CH')
    expect(berlin?.options.map((option) => option.value)).toEqual([
      'zebra',
      'yes',
      'no',
      'dots',
      'dashes',
      'surface',
    ])
  })

  it('as iD: removing the preset takes the default back only where the field holds', () => {
    const uncontrolled = presetOf('highway/crossing/uncontrolled')
    const tags = { ...CROSSING_TAGS, 'crossing:markings': 'yes' }
    expect(presets.unsetTags(tags, uncontrolled, 'vertex', undefined, { loc: PARIS })).toEqual({})
    expect(presets.unsetTags(tags, uncontrolled, 'vertex', undefined, { loc: BERLIN })).toEqual({})
  })
})

describe('location sets: a field default is written only where its location set holds', () => {
  // iD's preset.setTags calls fields(loc): a default is written only by a field of the preset's own list whose
  // location set holds at the feature (as the crossing case, with a single field to keep it simple).
  const fixture = createPresets({
    presets: {
      'test/thing': { name: 'Thing', tags: { test: 'thing' }, geometry: ['point'], fields: ['f'] },
    },
    fields: {
      f: { type: 'check', key: 'test:default', default: 'yes', locationSet: { include: ['de'] } },
    },
    translations: {},
  })
  const thing = (() => {
    const preset = fixture.preset('test/thing')
    if (!preset) throw new Error('no fixture preset')
    return preset
  })()

  it('is written where the location set holds, not elsewhere', () => {
    expect(fixture.setTags({ test: 'thing' }, thing, 'point', { loc: BERLIN })).toEqual({
      test: 'thing',
      'test:default': 'yes',
    })
    expect(fixture.setTags({ test: 'thing' }, thing, 'point', { loc: PARIS })).toEqual({
      test: 'thing',
    })
  })

  it('is written everywhere without a location, as before', () => {
    expect(fixture.setTags({ test: 'thing' }, thing, 'point')).toEqual({
      test: 'thing',
      'test:default': 'yes',
    })
  })

  it('is taken back only where the location set holds', () => {
    const tagged = { test: 'thing', 'test:default': 'yes' }
    expect(fixture.unsetTags(tagged, thing, 'point', undefined, { loc: BERLIN })).toEqual({})
    // the preset's own tag goes in either case; only the default stays where its location set does not hold
    expect(fixture.unsetTags(tagged, thing, 'point', undefined, { loc: PARIS })).toEqual({
      'test:default': 'yes',
    })
  })

  it('is not written by applyPreset in a place where it does not hold', () => {
    expect(fixture.applyPreset({}, thing, 'point', undefined, { loc: PARIS })).toEqual({
      test: 'thing',
    })
  })
})

describe('location sets: presets that exist in some countries only', () => {
  // amenity/community_centre/chitalishte_BG: Bulgaria only. amenity/townhall/barangay-PH: the Philippines only.
  // highway/motorway_link-US-CA: the US and Canada only; highway/motorway_link excludes them.
  // (amenity/post_box/post_box-US was merged into amenity/post_box in id-tagging-schema 7.1.0, #2645.)
  it('is matched in Sofia, and the general preset in Paris (iD: matchTags passes over it)', () => {
    const tags = { amenity: 'community_centre', community_centre: 'chitalishte' }
    expect(presets.match(tags, 'point', SOFIA).id).toBe('amenity/community_centre/chitalishte_BG')
    expect(presets.match(tags, 'point', PARIS).id).toBe('amenity/community_centre')
  })

  it('is matched everywhere without a location, as before', () => {
    const tags = { amenity: 'community_centre', community_centre: 'chitalishte' }
    expect(presets.match(tags, 'point').id).toBe('amenity/community_centre/chitalishte_BG')
  })

  it('is matched in Manila only', () => {
    const tags = { amenity: 'townhall', 'townhall:type': 'barangay' }
    expect(presets.match(tags, 'point', MANILA).id).toBe('amenity/townhall/barangay-PH')
    expect(presets.match(tags, 'point', PARIS).id).toBe('amenity/townhall')
  })

  it('a US motorway link is matched in New York, and the general one in Paris', () => {
    const tags = { highway: 'motorway_link' }
    expect(presets.match(tags, 'line', NEW_YORK).id).toBe('highway/motorway_link-US-CA')
    expect(presets.match(tags, 'line', PARIS).id).toBe('highway/motorway_link')
  })

  it('a post box has one preset in every country: its US drive-through field is shown there only', () => {
    const tags = { amenity: 'post_box' }
    expect(presets.match(tags, 'point', NEW_YORK).id).toBe('amenity/post_box')
    expect(presets.match(tags, 'point', PARIS).id).toBe('amenity/post_box')
    const shownIn = (loc: LonLat) =>
      fieldIdsOf(presets.fieldsFor(presets.match(tags, 'point', loc), tags, 'point', loc))
    expect(shownIn(NEW_YORK)).toContain('drive_through-US')
    expect(shownIn(PARIS)).not.toContain('drive_through-US')
  })

  it('is offered by search in Sofia only', () => {
    expect(idsOf(presets.search('chitalishte', 'point', 50, SOFIA))).toContain(
      'amenity/community_centre/chitalishte_BG',
    )
    expect(idsOf(presets.search('chitalishte', 'point', 50, PARIS))).not.toContain(
      'amenity/community_centre/chitalishte_BG',
    )
  })

  it('is left out of the whole search at a place where it does not hold', () => {
    const everything = (loc?: LonLat) => idsOf(presets.search('', 'point', 100000, loc))
    expect(everything(MANILA)).toContain('amenity/townhall/barangay-PH')
    expect(everything(PARIS)).not.toContain('amenity/townhall/barangay-PH')
    expect(everything(PARIS).length).toBeLessThan(everything().length)
    expect(presets.search('barangay', 'point', 50, PARIS)).not.toContainEqual(
      presetOf('amenity/townhall/barangay-PH'),
    )
  })

  it('the limit counts only the presets offered at the place', () => {
    // the tiers hold the barangay preset first for this query; in Paris it is passed over, so the limit still
    // fills with other presets (the fallback takes the last place)
    const inParis = presets.search('barangay', 'point', 3, PARIS)
    expect(inParis).toHaveLength(3)
    expect(idsOf(inParis)).not.toContain('amenity/townhall/barangay-PH')
    expect(idsOf(presets.search('barangay', 'point', 3, MANILA))[0]).toBe(
      'amenity/townhall/barangay-PH',
    )
  })

  it('a preset that is matched is not hidden by the search of another place', () => {
    expect(idsOf(presets.search('barangay', 'point', 50, MANILA))).toContain(
      'amenity/townhall/barangay-PH',
    )
  })
})

describe('location sets: fields', () => {
  // amenity/post_box lists royal_cypher-GB and post_box/type-GB (UK only) among its own fields.
  const postBox = presetOf('amenity/post_box')
  const postTags: Tags = { amenity: 'post_box' }

  it('a field of the preset is shown in London and left out in Paris', () => {
    expect(fieldIdsOf(presets.fieldsFor(postBox, postTags, 'point', LONDON))).toEqual(
      expect.arrayContaining(['royal_cypher-GB', 'post_box/type-GB']),
    )
    expect(fieldIdsOf(presets.fieldsFor(postBox, postTags, 'point', PARIS))).not.toContain(
      'royal_cypher-GB',
    )
  })

  it('without a location, the field is shown as before', () => {
    expect(fieldIdsOf(presets.fieldsFor(postBox, postTags, 'point'))).toContain('royal_cypher-GB')
  })

  it('a field of the "Add field" list is offered in its country only', () => {
    // gnis/feature_id-US is a more field of amenity/townhall (its location set: the US).
    const townhall = presetOf('amenity/townhall')
    const tags: Tags = { amenity: 'townhall' }
    expect(fieldIdsOf(presets.moreFieldsFor(townhall, tags, 'point', NEW_YORK))).toContain(
      'gnis/feature_id-US',
    )
    expect(fieldIdsOf(presets.moreFieldsFor(townhall, tags, 'point', PARIS))).not.toContain(
      'gnis/feature_id-US',
    )
    expect(fieldIdsOf(presets.moreFieldsFor(townhall, tags, 'point'))).toContain(
      'gnis/feature_id-US',
    )
  })
})

describe('location sets: the API for a caller', () => {
  it('reports the country of a point and whether a location set holds there', () => {
    const api: Presets = presets
    expect(api.countryAt(BERLIN)).toBe('de')
    expect(api.matchesLocation({ include: ['DE', 'AT'] }, BERLIN)).toBe(true)
    expect(api.matchesLocation({ include: ['DE', 'AT'] }, PARIS)).toBe(false)
    expect(api.matchesLocation(undefined, PARIS)).toBe(true)
  })
})

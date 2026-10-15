import { describe, expect, it } from 'bun:test'
import { defaultPresetData, defaultPresets as presets } from './default.ts'
import { createPresets, optionValueOf } from './presets.ts'
import type { Geometry, Preset, PresetData, Tags } from './types.ts'

function presetOf(id: string): Preset {
  const preset = presets.preset(id)
  if (!preset) throw new Error(`no preset ${id}`)
  return preset
}

function idsOf(query: string, geometry: Geometry, limit?: number): string[] {
  return presets.search(query, geometry, limit).map((preset) => preset.id)
}

// Expected values were read from the id-tagging-schema 6.19.2 data (dist/*.min.json), not from this code. They hold for
// 7.2.0 too: the bundled data is what these tests run on.

describe('match', () => {
  it('matches amenity=cafe as a point to amenity/cafe with its name and icon', () => {
    const cafe = presets.match({ amenity: 'cafe' }, 'point')
    expect(cafe.id).toBe('amenity/cafe')
    expect(cafe.name).toBe('Cafe')
    expect(cafe.icon).toBe('maki-cafe')
    expect(cafe.geometry).toContain('point')
  })

  it('matches highway=residential as a line to highway/residential', () => {
    const road = presets.match({ highway: 'residential' }, 'line')
    expect(road.id).toBe('highway/residential')
    expect(road.name).toBe('Residential Road')
  })

  it('does not match highway=residential as an area to the line preset', () => {
    // the area preset for any highway value is `highway` (tags highway=*, searchable false)
    const area = presets.match({ highway: 'residential' }, 'area')
    expect(area.id).not.toBe('highway/residential')
    expect(area.id).toBe('highway')
  })

  it('matches building=yes as an area to the wildcard preset building', () => {
    expect(presets.match({ building: 'yes' }, 'area').id).toBe('building')
  })

  it('prefers the exact value building=house to the wildcard building', () => {
    expect(presets.match({ building: 'house' }, 'area').id).toBe('building/house')
  })

  it('falls back to the generic preset of the geometry when there are no tags', () => {
    expect(presets.match({}, 'point').id).toBe('point')
    expect(presets.match({}, 'line').id).toBe('line')
    expect(presets.match({}, 'area').id).toBe('area')
    expect(presets.match({}, 'vertex').id).toBe('point')
    expect(presets.match({}, 'relation').id).toBe('relation')
  })

  it('uses the Address preset when only addr:* tags are present', () => {
    // address has tags addr:*=* and geometry point, vertex and area
    expect(presets.match({ 'addr:housenumber': '5' }, 'point').id).toBe('address')
  })

  it('falls back to the generic preset for unknown tags', () => {
    expect(presets.match({ 'xyz:unknown': 'value' }, 'point').id).toBe('point')
  })

  it('returns the same preset object that preset(id) returns', () => {
    expect(presets.preset('amenity/cafe')).toBe(presets.match({ amenity: 'cafe' }, 'point'))
  })

  it('resolves a name that refers to another preset', () => {
    // @templates/internet_access has name {point}; shop/ice_cream has name {amenity/ice_cream}
    expect(presets.preset('@templates/internet_access')?.name).toBe('Point')
    expect(presets.preset('shop/ice_cream')?.name).toBe('Ice Cream Shop')
  })

  it('runs 100,000 matches well under a second', () => {
    const samples: Tags[] = [
      { amenity: 'cafe', name: 'Bean' },
      { highway: 'residential', lit: 'yes', surface: 'asphalt' },
      { building: 'house', 'addr:street': 'Main' },
      { building: 'yes' },
      { shop: 'bakery', opening_hours: 'Mo-Fr 08:00-18:00' },
      { natural: 'tree', species: 'Quercus robur' },
      { waterway: 'river', name: 'Spree' },
      { landuse: 'forest' },
      { leisure: 'park', name: 'Tiergarten' },
      { barrier: 'fence', material: 'wood' },
      { man_made: 'pipeline', location: 'underground' },
      { 'addr:housenumber': '1' },
      { foo: 'bar' },
      {},
    ]
    const geometries: Geometry[] = ['point', 'vertex', 'line', 'area', 'relation']
    const count = 100_000
    let sink = ''
    const started = performance.now()
    for (let i = 0; i < count; i++) {
      const tags = samples[i % samples.length] ?? {}
      const geometry = geometries[i % geometries.length] ?? 'point'
      sink = presets.match(tags, geometry).id
    }
    const elapsed = performance.now() - started
    console.log(`100,000 match calls: ${elapsed.toFixed(1)} ms (last id: ${sink})`)
    expect(elapsed).toBeLessThan(1000)
  })
})

describe('fieldsFor', () => {
  it('starts the cafe fields with name and cuisine', () => {
    const cafe = presets.preset('amenity/cafe')
    expect(cafe).toBeDefined()
    if (!cafe) return
    const ids = presets.fieldsFor(cafe, { amenity: 'cafe' }, 'point').map((field) => field.id)
    expect(ids.slice(0, 2)).toEqual(['name', 'cuisine'])
  })

  it('gives cuisine the option pizza labelled Pizza', () => {
    expect(presets.field('cuisine')?.options).toContainEqual({ value: 'pizza', label: 'Pizza' })
  })

  it('shows oneway, maxspeed and surface for a residential road', () => {
    const road = presets.preset('highway/residential')
    expect(road).toBeDefined()
    if (!road) return
    const ids = presets.fieldsFor(road, { highway: 'residential' }, 'line').map((field) => field.id)
    expect(ids).toEqual(expect.arrayContaining(['oneway', 'maxspeed', 'surface']))
  })

  it('shows lit on a residential road only when lit has a value', () => {
    const road = presets.preset('highway/residential')
    expect(road).toBeDefined()
    if (!road) return
    const without = presets
      .fieldsFor(road, { highway: 'residential' }, 'line')
      .map((field) => field.id)
    const withLit = presets
      .fieldsFor(road, { highway: 'residential', lit: 'yes' }, 'line')
      .map((field) => field.id)
    expect(without).not.toContain('lit')
    expect(withLit).toContain('lit')
  })

  it('expands the internet_access template into the cafe fields', () => {
    const cafe = presets.preset('amenity/cafe')
    expect(cafe).toBeDefined()
    if (!cafe) return
    const ids = presets.fieldsFor(cafe, { amenity: 'cafe' }, 'point').map((field) => field.id)
    expect(ids).toContain('internet_access')
  })

  it('applies internet_access/fee only while its prerequisite holds (internet_access not "no")', () => {
    // internet_access/fee: prerequisiteTag { key: internet_access, valueNot: no }
    const cafe = presets.preset('amenity/cafe')
    expect(cafe).toBeDefined()
    if (!cafe) return
    const idsFor = (tags: Tags) => presets.fieldsFor(cafe, tags, 'point').map((field) => field.id)
    expect(idsFor({ amenity: 'cafe', internet_access: 'no' })).not.toContain('internet_access/fee')
    expect(idsFor({ amenity: 'cafe', internet_access: 'wlan' })).toContain('internet_access/fee')
    // an absent tag is not "no", so the prerequisite holds
    expect(idsFor({ amenity: 'cafe' })).toContain('internet_access/fee')
  })

  it('takes the label of building for building_area_yes and shows it only for areas', () => {
    expect(presets.field('building_area_yes')?.label).toBe('Building')
    expect(presets.field('building_area_yes')?.label).toBe(presets.field('building')?.label)
    expect(presets.field('building_area_yes')?.geometry).toEqual(['area'])
    const cafe = presets.preset('amenity/cafe')
    expect(cafe).toBeDefined()
    if (!cafe) return
    const tags = { amenity: 'cafe' }
    expect(presets.fieldsFor(cafe, tags, 'area').map((field) => field.id)).toContain(
      'building_area_yes',
    )
    expect(presets.fieldsFor(cafe, tags, 'point').map((field) => field.id)).not.toContain(
      'building_area_yes',
    )
  })

  it('takes the label of oneway for oneway_yes', () => {
    expect(presets.field('oneway_yes')?.label).toBe('One Way')
  })

  it('does not list a field twice', () => {
    const cafe = presets.preset('amenity/cafe')
    expect(cafe).toBeDefined()
    if (!cafe) return
    const ids = presets
      .fieldsFor(cafe, { amenity: 'cafe', internet_access: 'wlan', phone: '+49' }, 'area')
      .map((field) => field.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('moreFieldsFor', () => {
  const bakery = presetOf('shop/bakery')
  const idsOffered = (tags: Tags, geometry: Geometry = 'point') =>
    presets.moreFieldsFor(bakery, tags, geometry).map((field) => field.id)

  it('offers Wheelchair to a shop that has no wheelchair tag', () => {
    const offered = presets.moreFieldsFor(bakery, { shop: 'bakery' }, 'point')
    const wheelchair = offered.find((field) => field.id === 'wheelchair')
    expect(wheelchair?.label).toBe('Wheelchair Access')
    expect(wheelchair?.key).toBe('wheelchair')
  })

  it('stops offering wheelchair once it has a value and shows it as a field', () => {
    const tags = { shop: 'bakery', wheelchair: 'yes' }
    expect(idsOffered(tags)).not.toContain('wheelchair')
    const shown = presets.fieldsFor(bakery, tags, 'point').map((field) => field.id)
    expect(shown).toContain('wheelchair')
  })

  it('never offers a field that fieldsFor returns, and lists each field once', () => {
    const cafe = presetOf('amenity/cafe')
    const tags = { amenity: 'cafe', internet_access: 'wlan', phone: '+49', lit: 'yes' }
    const shown = new Set(presets.fieldsFor(cafe, tags, 'point').map((field) => field.id))
    const offered = presets.moreFieldsFor(cafe, tags, 'point').map((field) => field.id)
    expect(new Set(offered).size).toBe(offered.length)
    for (const id of offered) expect(shown.has(id)).toBe(false)
  })

  it('lists the non-universal fields first, sorted by label, then the universal fields sorted by label', () => {
    const offered = presets.moreFieldsFor(bakery, { shop: 'bakery' }, 'point')
    const specific = offered.filter((field) => !field.universal)
    const general = offered.filter((field) => field.universal)
    expect(offered).toEqual([...specific, ...general])
    const labels = (fields: typeof offered) => fields.map((field) => field.label)
    expect(labels(specific)).toEqual(
      labels(specific)
        .slice()
        .sort((a, b) => a.localeCompare(b)),
    )
    expect(labels(general)).toEqual(
      labels(general)
        .slice()
        .sort((a, b) => a.localeCompare(b)),
    )
    // website is a field of the bakery since id-tagging-schema 7.2.0 (#2669), so it is no longer offered here
    const shown = presets.fieldsFor(bakery, { shop: 'bakery' }, 'point').map((field) => field.id)
    expect(shown).toContain('website')
    expect(general.map((field) => field.id)).not.toContain('website')
    expect(general.map((field) => field.id)).toContain('description')
  })

  it('offers a universal field only for the geometries it applies to (ele_node: point and vertex)', () => {
    const cafe = presetOf('amenity/cafe')
    const tags = { amenity: 'cafe' }
    expect(presets.moreFieldsFor(cafe, tags, 'point').map((f) => f.id)).toContain('ele_node')
    expect(presets.moreFieldsFor(cafe, tags, 'vertex').map((f) => f.id)).toContain('ele_node')
    expect(presets.moreFieldsFor(cafe, tags, 'area').map((f) => f.id)).not.toContain('ele_node')
    expect(presets.moreFieldsFor(cafe, tags, 'line').map((f) => f.id)).not.toContain('ele_node')
  })

  it('leaves out a field whose prerequisiteTag does not hold', () => {
    // internet_access/fee (a moreField of the bakery) is offered only while internet_access is not "no"
    expect(idsOffered({ shop: 'bakery' })).toContain('internet_access/fee')
    expect(idsOffered({ shop: 'bakery', internet_access: 'no' })).not.toContain(
      'internet_access/fee',
    )
  })
})

describe('areaKeys', () => {
  const areaKeys = presets.areaKeys()

  it('has building as an area key with no excluded values', () => {
    expect(areaKeys.building).toEqual({})
  })

  it('excludes man_made=pipeline and leisure=slipway, which are line presets', () => {
    // man_made=pipeline and leisure=slipway are addTags of line presets; both keys are area keys
    expect(areaKeys.man_made?.pipeline).toBe(true)
    expect(areaKeys.leisure?.slipway).toBe(true)
  })

  it('has no highway key, because iD ignores highway, railway, barrier and similar keys', () => {
    expect(areaKeys.highway).toBeUndefined()
  })

  it('does not exclude a value that the line presets do not add', () => {
    expect(areaKeys.man_made?.bridge).toBeUndefined()
  })
})

describe('field', () => {
  it('returns undefined for an unknown id', () => {
    expect(presets.field('no_such_field')).toBeUndefined()
    expect(presets.preset('no/such/preset')).toBeUndefined()
  })
})

describe('search', () => {
  it('ranks amenity/cafe first for "cafe"', () => {
    expect(idsOf('cafe', 'point')[0]).toBe('amenity/cafe')
  })

  it('finds amenity/cafe for "caf" near the top', () => {
    expect(idsOf('caf', 'point', 5)).toContain('amenity/cafe')
  })

  it('finds amenity/cafe by its term "espresso"', () => {
    expect(presetOf('amenity/cafe').terms).toContain('espresso')
    expect(idsOf('espresso', 'point')).toContain('amenity/cafe')
  })

  // 7.x stores aliases as an array in the translation (6.x: a newline separated string), see presets.ts wordList
  it('reads the aliases of tourism/alpine_hut from the array in the translation', () => {
    expect(presetOf('tourism/alpine_hut').aliases).toContain('Mountain Hut')
    expect(presetOf('tourism/alpine_hut').aliases).toHaveLength(5)
  })

  it('does not offer amenity/cafe for the line geometry', () => {
    expect(idsOf('cafe', 'line')).not.toContain('amenity/cafe')
  })

  it('never offers a preset with searchable: false (highway/bus_stop)', () => {
    expect(presetOf('highway/bus_stop').searchable).toBe(false)
    expect(idsOf('bus stop', 'point', 100)).not.toContain('highway/bus_stop')
    expect(presets.search('bus', 'point', 100).every((preset) => preset.searchable)).toBe(true)
  })

  it('returns the first 5 presets by name for an empty query', () => {
    expect(presets.search('', 'point', 5)).toHaveLength(5)
  })

  it('returns 50 presets by default, the point fallback last (iD: MAXRESULTS is 50)', () => {
    const found = presets.search('a', 'point')
    expect(found).toHaveLength(50)
    expect(found.at(-1)?.id).toBe('point')
  })

  it('lists a preset once', () => {
    const ids = idsOf('cafe', 'point', 100)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('runs 1,000 searches of varied queries fast enough for typing', () => {
    const queries = [
      'cafe',
      'caf',
      'bak',
      'shop',
      'a',
      'b c',
      'amenity=cafe',
      'road',
      'restaurant',
      'pizza',
      'tea',
      'espresso',
      'bus',
      'church',
      's',
      'park',
      'x',
      'building',
      'coffee shop near me',
      'playground',
    ]
    const geometries: Geometry[] = ['point', 'line', 'area', 'vertex']
    const start = performance.now()
    let found = 0
    for (let i = 0; i < 1000; i++) {
      found += presets.search(
        queries[i % queries.length] ?? '',
        geometries[i % 4] ?? 'point',
      ).length
    }
    const elapsed = performance.now() - start
    console.log(`1,000 searches: ${elapsed.toFixed(1)} ms (${found} results)`)
    // about 0.2 ms per search alone; the check runs tests next to the type-check and the linter,
    // which made it 1.2 ms. The bound only catches a search that scans far more than it should.
    expect(elapsed).toBeLessThan(5000)
  })
})

describe('applyPreset', () => {
  it('sets amenity=cafe on an untagged point', () => {
    expect(presets.applyPreset({}, presetOf('amenity/cafe'), 'point')).toEqual({ amenity: 'cafe' })
  })

  it('does not change the tags it was given', () => {
    const tags: Tags = { name: 'Corner' }
    const result = presets.applyPreset(tags, presetOf('amenity/cafe'), 'point')
    expect(result).not.toBe(tags)
    expect(tags).toEqual({ name: 'Corner' })
  })

  it('sets a * value of the preset to yes', () => {
    expect(presets.applyPreset({}, presetOf('shop'), 'point')).toEqual({ shop: 'yes' })
  })

  it('keeps an existing value of an ancillary * tag', () => {
    const wind = presetOf('power/plant/source/wind')
    expect(presets.applyPreset({}, wind, 'area')['plant:output:electricity']).toBe('yes')
    const kept = presets.applyPreset({ 'plant:output:electricity': '5 MW' }, wind, 'area')
    expect(kept['plant:output:electricity']).toBe('5 MW')
    expect(kept['plant:method']).toBe('wind_turbine')
  })

  it('removes the previous preset tags and keeps unrelated tags', () => {
    const tags: Tags = { amenity: 'cafe', name: 'Corner' }
    const result = presets.applyPreset(
      tags,
      presetOf('amenity/restaurant'),
      'point',
      presetOf('amenity/cafe'),
    )
    expect(result).toEqual({ amenity: 'restaurant', name: 'Corner' })
  })

  it('adds area=yes to an area preset whose key is not an area key (highway=pedestrian)', () => {
    const pedestrian = presetOf('highway/pedestrian_area')
    expect(presets.areaKeys().highway).toBeUndefined()
    expect(presets.applyPreset({}, pedestrian, 'area')).toEqual({
      highway: 'pedestrian',
      area: 'yes',
    })
  })

  it('does not add area=yes for building, which is an area key', () => {
    expect(presets.applyPreset({}, presetOf('building'), 'area')).toEqual({ building: 'yes' })
  })

  it('does not add area=yes on a point', () => {
    expect(presets.applyPreset({}, presetOf('highway/pedestrian_area'), 'point')).toEqual({
      highway: 'pedestrian',
    })
  })
})

describe('the unset option of a check field', () => {
  it('armrest: the option "undefined" is the unset value "", labelled as iD labels it', () => {
    expect(presets.field('armrest')?.options).toEqual([
      { value: '', label: 'Unknown' },
      { value: 'yes', label: 'One or more armrests' },
      { value: 'no', label: 'No armrests' },
    ])
  })

  it('oneway: the unset option is "" with its label; reversible and alternating stay values', () => {
    const options = presets.field('oneway')?.options ?? []
    expect(options).toEqual([
      { value: '', label: 'Assumed to be No' },
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'reversible', label: 'Reversible' },
      { value: 'alternating', label: 'Alternating' },
    ])
  })

  it('every bundled check field with "undefined" in its schema options maps it, and no bundled field offers "undefined"', () => {
    let mapped = 0
    const raws = defaultPresetData.fields as Record<string, { type?: string; options?: string[] }>
    for (const [id, raw] of Object.entries(raws)) {
      if (!raw.options?.includes('undefined')) continue
      expect(['check', 'defaultCheck', 'onewayCheck']).toContain(raw.type ?? '')
      expect(presets.field(id)?.options.map((option) => option.value)).toContain('')
      mapped++
    }
    expect(mapped).toBeGreaterThan(0)
    for (const id of Object.keys(raws)) {
      expect(
        presets.field(id)?.options.map((option) => option.value),
        id,
      ).not.toContain('undefined')
    }
  })

  it('the mapping is for the check types only: a combo, radio or multi-combo keeps "undefined" as a value', () => {
    expect(optionValueOf('check', 'undefined')).toBe('')
    expect(optionValueOf('defaultCheck', 'undefined')).toBe('')
    expect(optionValueOf('onewayCheck', 'undefined')).toBe('')
    expect(optionValueOf('check', 'yes')).toBe('yes')
    expect(optionValueOf('combo', 'undefined')).toBe('undefined')
    expect(optionValueOf('radio', 'undefined')).toBe('undefined')
    expect(optionValueOf('multiCombo', 'undefined')).toBe('undefined')
  })

  it('a combo with an option "undefined" in a data set keeps it, labelled from its translation', () => {
    const data: PresetData = {
      presets: {},
      fields: {
        pick: { key: 'pick', type: 'combo', options: ['undefined', 'yes'] },
        probe: { key: 'probe', type: 'check', options: ['undefined', 'yes', 'no'] },
      },
      translations: {
        en: {
          presets: {
            fields: {
              pick: { label: 'Pick', options: { undefined: 'Odd', yes: 'Yes' } },
              probe: { label: 'Probe', options: { undefined: 'Unknown' } },
            },
          },
        },
      },
    }
    const built = createPresets(data)
    expect(built.field('pick')?.options).toEqual([
      { value: 'undefined', label: 'Odd' },
      { value: 'yes', label: 'Yes' },
    ])
    expect(built.field('probe')?.options).toEqual([
      { value: '', label: 'Unknown' },
      { value: 'yes', label: 'yes' },
      { value: 'no', label: 'no' },
    ])
  })
})

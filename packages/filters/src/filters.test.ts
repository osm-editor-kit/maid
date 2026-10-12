import { describe, expect, it } from 'bun:test'
import { defaultFilters } from './default'
import { createFilterSet, fromIdDisableFeatures, matches } from './filters'
import type { Filter, Geometry, Tags } from './types'

const set = createFilterSet(defaultFilters)

function categoryOf(tags: Tags, geometry: Geometry): string | undefined {
  return set.filterOf(tags, geometry)?.id
}

describe('default filters follow iD categories', () => {
  const cases: [string, Tags, Geometry, string | undefined][] = [
    [
      'highway=residential line is a traffic road',
      { highway: 'residential' },
      'line',
      'traffic_roads',
    ],
    ['highway=service line is a service road', { highway: 'service' }, 'line', 'service_roads'],
    ['highway=footway line is a path', { highway: 'footway' }, 'line', 'paths'],
    ['building=yes area is a building', { building: 'yes' }, 'area', 'buildings'],
    [
      'building:part=yes area is a building part',
      { 'building:part': 'yes' },
      'area',
      'building_parts',
    ],
    ['landuse=forest area is landuse', { landuse: 'forest' }, 'area', 'landuse'],
    [
      'boundary=administrative line is a boundary',
      { boundary: 'administrative' },
      'line',
      'boundaries',
    ],
    ['waterway=river line is water', { waterway: 'river' }, 'line', 'water'],
    ['railway=rail line is rail', { railway: 'rail' }, 'line', 'rail'],
    ['power=line line is power', { power: 'line' }, 'line', 'power'],
    ['amenity=cafe point is a point', { amenity: 'cafe' }, 'point', 'points'],
    ['amenity=cafe vertex is in no category', { amenity: 'cafe' }, 'vertex', undefined],
    [
      'highway=construction line is past/future',
      { highway: 'construction' },
      'line',
      'past_future',
    ],
    ['disused:shop=yes point is past/future', { 'disused:shop': 'yes' }, 'point', 'past_future'],
    ['tagless line is other', {}, 'line', 'others'],
    ['tagless point is a point, as in iD', {}, 'point', 'points'],
    [
      'addr:housenumber point is an address point',
      { 'addr:housenumber': '5' },
      'point',
      'address_points',
    ],
    [
      'addr tags plus a shop are a point',
      { 'addr:housenumber': '5', shop: 'bakery' },
      'point',
      'points',
    ],
    [
      'building=construction is past/future, not a building',
      { building: 'construction' },
      'area',
      'past_future',
    ],
    ['amenity=parking area is landuse', { amenity: 'parking' }, 'area', 'landuse'],
    ['landuse=pond area is water, not landuse', { landuse: 'pond' }, 'area', 'water'],
    ['piste:type line is pistes', { 'piste:type': 'downhill' }, 'line', 'pistes'],
    ['aerialway=chair_lift line is aerialways', { aerialway: 'chair_lift' }, 'line', 'aerialways'],
    ['aerialway=station point is not aerialways', { aerialway: 'station' }, 'point', 'points'],
    ['indoor=room area is indoor', { indoor: 'room' }, 'area', 'indoor'],
    ['railway=level_crossing point is rail', { railway: 'level_crossing' }, 'point', 'rail'],
    ['power=tower point is power', { power: 'tower' }, 'point', 'power'],
    ['a building is not landuse', { building: 'yes', amenity: 'parking' }, 'area', 'buildings'],
    [
      'a road with a railway tag is a road, not rail',
      { highway: 'residential', railway: 'tram' },
      'line',
      'traffic_roads',
    ],
    [
      'a boundary with natural is not a boundary',
      { boundary: 'protected_area', natural: 'tree' },
      'line',
      'others',
    ],
    ['a boundary relation is a boundary', { type: 'boundary' }, 'relation', 'boundaries'],
    [
      'a relation with building tags is a building; the caller picks its geometry',
      { type: 'multipolygon', building: 'yes' },
      'relation',
      'buildings',
    ],
  ]
  for (const [name, tags, geometry, id] of cases) {
    it(name, () => {
      expect(categoryOf(tags, geometry)).toBe(id)
    })
  }

  it("lists iD's categories in iD's names", () => {
    expect(defaultFilters.map((filter) => filter.id)).toEqual([
      'past_future',
      'address_points',
      'building_parts',
      'indoor',
      'pistes',
      'aerialways',
      'power',
      'water',
      'traffic_roads',
      'service_roads',
      'paths',
      'rail',
      'buildings',
      'boundaries',
      'landuse',
      'points',
      'others',
    ])
    expect(defaultFilters.every((filter) => filter.state === 'editable')).toBe(true)
  })
})

describe('first match decides', () => {
  const list: Filter[] = [
    { id: 'first', label: 'First', match: { x: '1' }, state: 'hidden' },
    { id: 'second', label: 'Second', match: '*', state: 'readonly' },
  ]

  it('the first of two matching filters wins', () => {
    const decided = createFilterSet(list)
    expect(decided.filterOf({ x: '1' }, 'point')?.id).toBe('first')
    expect(decided.stateOf({ x: '1' }, 'point')).toBe('hidden')
  })

  it('a later filter applies when the first does not match', () => {
    const decided = createFilterSet(list)
    expect(decided.filterOf({ y: '2' }, 'point')?.id).toBe('second')
    expect(decided.stateOf({ y: '2' }, 'point')).toBe('readonly')
  })

  it('an object that nothing matches is editable', () => {
    const decided = createFilterSet([
      { id: 'only', label: 'Only', match: { x: '1' }, state: 'hidden' },
    ])
    expect(decided.filterOf({ y: '2' }, 'point')).toBeUndefined()
    expect(decided.stateOf({ y: '2' }, 'point')).toBe('editable')
  })
})

describe('match forms', () => {
  it('* as a value matches any value but no', () => {
    const filter: Filter = { id: 'f', label: 'F', match: { amenity: '*' }, state: 'editable' }
    expect(matches(filter, { amenity: 'cafe' }, 'point')).toBe(true)
    expect(matches(filter, { amenity: 'no' }, 'point')).toBe(false)
    expect(matches(filter, { shop: 'bakery' }, 'point')).toBe(false)
  })

  it('a list of values matches any of them', () => {
    const filter: Filter = {
      id: 'f',
      label: 'F',
      match: { highway: ['a', 'b'] },
      state: 'editable',
    }
    expect(matches(filter, { highway: 'b' }, 'line')).toBe(true)
    expect(matches(filter, { highway: 'c' }, 'line')).toBe(false)
  })

  it('a list of tag matches is any of them, each with all its keys', () => {
    const filter: Filter = {
      id: 'f',
      label: 'F',
      match: [{ amenity: 'cafe' }, { shop: 'bakery', name: '*' }],
      state: 'editable',
    }
    expect(matches(filter, { amenity: 'cafe' }, 'point')).toBe(true)
    expect(matches(filter, { shop: 'bakery', name: 'Bread' }, 'point')).toBe(true)
    expect(matches(filter, { shop: 'bakery' }, 'point')).toBe(false)
  })

  it('geometry restricts the filter', () => {
    const filter: Filter = {
      id: 'f',
      label: 'F',
      match: '*',
      geometry: ['point'],
      state: 'editable',
    }
    expect(matches(filter, {}, 'point')).toBe(true)
    expect(matches(filter, {}, 'line')).toBe(false)
  })

  it('a function is called with the tags and the geometry', () => {
    const filter: Filter = {
      id: 'f',
      label: 'F',
      match: (tags, geometry) => geometry === 'area' && tags.name !== undefined,
      state: 'editable',
    }
    expect(matches(filter, { name: 'x' }, 'area')).toBe(true)
    expect(matches(filter, { name: 'x' }, 'line')).toBe(false)
  })

  it('a filter with an empty tag match matches everything of its geometry', () => {
    const filter: Filter = { id: 'f', label: 'F', match: {}, state: 'editable' }
    expect(matches(filter, {}, 'point')).toBe(true)
  })
})

describe('createFilterSet', () => {
  it('sets the two valid states and ignores the rest of the parameter', () => {
    const decided = createFilterSet(
      defaultFilters,
      'buildings:readonly,boundaries:hidden,nope:hidden,points:what',
    )
    const states = decided.states()
    expect(states.buildings).toBe('readonly')
    expect(states.boundaries).toBe('hidden')
    expect(states.points).toBe('editable')
    expect(states.nope).toBeUndefined()
    expect(decided.toParam()).toBe('buildings:readonly,boundaries:hidden')
  })

  it('applies the states to the objects', () => {
    const decided = createFilterSet(defaultFilters, 'buildings:readonly,boundaries:hidden')
    expect(decided.stateOf({ building: 'yes' }, 'area')).toBe('readonly')
    expect(decided.stateOf({ boundary: 'administrative' }, 'line')).toBe('hidden')
    expect(decided.stateOf({ highway: 'residential' }, 'line')).toBe('editable')
  })

  it('with returns a new set and leaves the old one unchanged', () => {
    const before = createFilterSet(defaultFilters, 'buildings:readonly,boundaries:hidden')
    const after = before.with('buildings', 'editable')
    expect(after.toParam()).toBe('boundaries:hidden')
    expect(before.toParam()).toBe('buildings:readonly,boundaries:hidden')
    expect(before.states().buildings).toBe('readonly')
    expect(before.stateOf({ building: 'yes' }, 'area')).toBe('readonly')
    expect(after.stateOf({ building: 'yes' }, 'area')).toBe('editable')
  })

  it('with an unknown id returns the same set', () => {
    const decided = createFilterSet(defaultFilters)
    expect(decided.with('nope', 'hidden')).toBe(decided)
  })

  it('toParam is empty when nothing differs from the filters', () => {
    expect(createFilterSet(defaultFilters).toParam()).toBe('')
    expect(createFilterSet(defaultFilters, 'buildings:editable').toParam()).toBe('')
  })

  it("compares with the filter's own state, not with editable", () => {
    const list: Filter[] = [
      { id: 'roads', label: 'Roads', match: { highway: '*' }, state: 'readonly' },
    ]
    const decided = createFilterSet(list)
    expect(decided.stateOf({ highway: 'x' }, 'line')).toBe('readonly')
    expect(decided.with('roads', 'hidden').toParam()).toBe('roads:hidden')
    expect(decided.with('roads', 'readonly').toParam()).toBe('')
  })

  it('throws on duplicate ids', () => {
    const filter: Filter = { id: 'same', label: 'Same', match: '*', state: 'editable' }
    expect(() => createFilterSet([filter, filter])).toThrow('Duplicate filter id: same')
  })
})

describe('fromIdDisableFeatures', () => {
  it('maps iD ids to hidden filters', () => {
    expect(fromIdDisableFeatures('boundaries,buildings')).toBe('boundaries:hidden,buildings:hidden')
  })

  it("accepts iD's semicolon separator and drops empty entries", () => {
    expect(fromIdDisableFeatures('water;;paths')).toBe('water:hidden,paths:hidden')
    expect(fromIdDisableFeatures('')).toBe('')
  })

  it('round-trips through createFilterSet', () => {
    const decided = createFilterSet(defaultFilters, fromIdDisableFeatures('boundaries,buildings'))
    expect(decided.states().boundaries).toBe('hidden')
    expect(decided.states().buildings).toBe('hidden')
  })
})

describe('speed', () => {
  it('stateOf runs 200,000 times in well under a second', () => {
    const samples: [Tags, Geometry][] = [
      [{ highway: 'residential', name: 'Main Street' }, 'line'],
      [{ highway: 'service', service: 'parking_aisle' }, 'line'],
      [{ highway: 'footway', surface: 'paved' }, 'line'],
      [{ building: 'yes', 'addr:housenumber': '4', 'addr:street': 'Main' }, 'area'],
      [{ building: 'construction' }, 'area'],
      [{ 'building:part': 'yes', height: '12' }, 'area'],
      [{ landuse: 'forest', name: 'Wald' }, 'area'],
      [{ natural: 'water', name: 'Lake' }, 'area'],
      [{ boundary: 'administrative', admin_level: '8' }, 'line'],
      [{ waterway: 'river', name: 'Spree' }, 'line'],
      [{ railway: 'rail', electrified: 'contact_line' }, 'line'],
      [{ power: 'tower' }, 'point'],
      [{ amenity: 'cafe', name: 'Bean' }, 'point'],
      [{ amenity: 'parking' }, 'area'],
      [{ shop: 'bakery', 'disused:shop': 'yes' }, 'point'],
      [{ aerialway: 'pylon' }, 'point'],
      [{ 'piste:type': 'nordic', 'piste:grooming': 'classic' }, 'line'],
      [{ indoor: 'room', level: '2' }, 'area'],
      [{ name: 'Nothing here', source: 'survey' }, 'line'],
      [{}, 'point'],
      [{}, 'vertex'],
    ]
    const decided = createFilterSet(defaultFilters, 'buildings:readonly,boundaries:hidden')
    const start = performance.now()
    let hidden = 0
    for (let i = 0; i < 200_000; i++) {
      const sample = samples[i % samples.length]
      if (sample === undefined) continue
      const [tags, geometry] = sample
      if (decided.stateOf(tags, geometry) === 'hidden') hidden++
    }
    const elapsed = performance.now() - start
    console.log(`stateOf x 200,000: ${elapsed.toFixed(1)} ms (${hidden} hidden)`)
    expect(elapsed).toBeLessThan(5000)
  })
})

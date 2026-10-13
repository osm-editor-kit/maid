// Adopted from iD test/spec/renderer/features.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { defaultFilters } from './default'
import { createFilterSet, matches } from './filters'
import type { FilterSet, Geometry, Tags } from './types'

// iD's features are its categories; Maid's defaultFilters are the same categories in the same ids.
const byId = new Map(defaultFilters.map((filter) => [filter.id, filter]))
const set = createFilterSet(defaultFilters)

type Entity = { id: string; tags: Tags; geometry: Geometry }

// The test graph below is iD's, with iD's geometry for each entity: a way is an area only when
// area=yes (iD's isArea for a way with no nodes), a multipolygon relation is an area.
const node = (id: string, tags: Tags = {}): Entity => ({ id, tags, geometry: 'point' })
const way = (id: string, tags: Tags = {}): Entity => ({
  id,
  tags,
  geometry: tags.area === 'yes' ? 'area' : 'line',
})
const relation = (id: string, tags: Tags = {}): Entity => ({
  id,
  tags,
  geometry: tags.type === 'multipolygon' ? 'area' : 'relation',
})

const graph = new Map<string, Entity>(
  [
    // Points
    node('point_bar', { amenity: 'bar' }),
    node('point_dock', { waterway: 'dock' }),
    node('point_rail_station', { railway: 'station' }),
    node('point_generator', { power: 'generator' }),
    node('point_old_rail_station', { 'disused:railway': 'station' }),

    // Traffic Roads
    way('motorway', { highway: 'motorway' }),
    way('motorway_link', { highway: 'motorway_link' }),
    way('trunk', { highway: 'trunk' }),
    way('trunk_link', { highway: 'trunk_link' }),
    way('primary', { highway: 'primary' }),
    way('primary_link', { highway: 'primary_link' }),
    way('secondary', { highway: 'secondary' }),
    way('secondary_link', { highway: 'secondary_link' }),
    way('tertiary', { highway: 'tertiary' }),
    way('tertiary_link', { highway: 'tertiary_link' }),
    way('residential', { highway: 'residential' }),
    way('unclassified', { highway: 'unclassified' }),
    way('living_street', { highway: 'living_street' }),

    // Service Roads
    way('service', { highway: 'service' }),
    way('road', { highway: 'road' }),
    way('track', { highway: 'track' }),

    // Paths
    way('path', { highway: 'path' }),
    way('footway', { highway: 'footway' }),
    way('cycleway', { highway: 'cycleway' }),
    way('bridleway', { highway: 'bridleway' }),
    way('steps', { highway: 'steps' }),
    way('pedestrian', { highway: 'pedestrian' }),

    // Buildings
    way('building_yes', { area: 'yes', amenity: 'school', building: 'yes' }),
    way('building_no', { area: 'yes', amenity: 'school', building: 'no' }),
    way('building_part', { 'building:part': 'yes' }),
    way('garage1', { area: 'yes', amenity: 'parking', parking: 'multi-storey' }),
    way('garage2', { area: 'yes', amenity: 'parking', parking: 'sheds' }),
    way('garage3', { area: 'yes', amenity: 'parking', parking: 'carports' }),
    way('garage4', { area: 'yes', amenity: 'parking', parking: 'garage_boxes' }),
    way('building_construction', { building: 'construction' }),

    // Indoor
    way('room', { area: 'yes', indoor: 'room' }),
    way('indoor_area', { area: 'yes', indoor: 'area' }),
    way('indoor_bar', { area: 'yes', indoor: 'room', amenity: 'bar' }),
    way('corridor', { highway: 'corridor', indoor: 'yes' }),

    // Pistes
    way('downhill_piste', { 'piste:type': 'downhill' }),
    way('piste_track_combo', { 'piste:type': 'alpine', highway: 'track' }),

    // Climbing routes
    way('climbing_route', { climbing: 'route' }),

    // Aerialways
    way('gondola', { aerialway: 'gondola' }),
    way('zip_line', { aerialway: 'zip_line' }),
    way('aerialway_platform', { public_transport: 'platform', aerialway: 'yes' }),
    way('old_aerialway_station', { area: 'yes', aerialway: 'station' }),

    // Landuse
    way('forest', { area: 'yes', landuse: 'forest' }),
    way('scrub', { area: 'yes', natural: 'scrub' }),
    way('industrial', { area: 'yes', landuse: 'industrial' }),
    way('parkinglot', { area: 'yes', amenity: 'parking', parking: 'surface' }),
    way('park', { area: 'yes', leisure: 'park', parking: 'surface' }),

    // Landuse Multipolygon
    way('outer'),
    way('inner1'),
    way('inner2', { barrier: 'fence' }),
    way('inner3', { highway: 'residential' }),
    relation('retail', { landuse: 'retail', type: 'multipolygon' }),

    // Boundaries
    way('boundary', { boundary: 'administrative' }),
    way('boundary_road', { boundary: 'administrative', highway: 'primary' }),
    way('boundary_member'),
    way('boundary_member2'),
    relation('boundary_relation', { type: 'boundary', boundary: 'administrative' }),
    relation('boundary_relation2', { type: 'boundary', boundary: 'administrative' }),

    // Water
    way('water', { area: 'yes', natural: 'water' }),
    way('coastline', { natural: 'coastline' }),
    way('bay', { area: 'yes', natural: 'bay' }),
    way('pond', { area: 'yes', landuse: 'pond' }),
    way('basin', { area: 'yes', landuse: 'basin' }),
    way('reservoir', { area: 'yes', landuse: 'reservoir' }),
    way('salt_pond', { area: 'yes', landuse: 'salt_pond' }),
    way('river', { waterway: 'river' }),

    // Rail
    way('railway', { railway: 'rail' }),
    way('rail_landuse', { area: 'yes', landuse: 'railway' }),
    way('rail_disused', { railway: 'disused' }),
    way('rail_streetcar', { railway: 'tram', highway: 'residential' }),
    way('rail_trail', { railway: 'disused', highway: 'cycleway' }),

    // Power
    way('power_line', { power: 'line' }),

    // Past/Future
    way('motorway_construction', { highway: 'construction', construction: 'motorway' }),
    way('cycleway_proposed', { highway: 'proposed', proposed: 'cycleway' }),
    way('landuse_construction', { area: 'yes', landuse: 'construction' }),

    // Others
    way('fence', { barrier: 'fence' }),
    way('pipeline', { man_made: 'pipeline' }),

    // Site relation
    relation('site', { type: 'site' }),
  ].map((entity) => [entity.id, entity]),
)

/**
 * iD's getMatches for one category: does the object belong to it. Each category is judged on its
 * own tags, as in iD. `others` is what no other category takes, so it is read from the set.
 */
function belongsTo(category: string, id: string): boolean {
  const entity = graph.get(id)!
  if (category === 'others') {
    return set.categoriesOf(entity.tags, entity.geometry).some((filter) => filter.id === 'others')
  }
  return matches(byId.get(category)!, entity.tags, entity.geometry)
}

/** iD's `disabled()`: the categories that are hidden */
function disabled(s: FilterSet): string[] {
  const states = s.states()
  return Object.keys(states).filter((id) => states[id] === 'hidden')
}

/** iD's `enabled()`: the categories that are not hidden */
function enabled(s: FilterSet): string[] {
  const states = s.states()
  return Object.keys(states).filter((id) => states[id] !== 'hidden')
}

describe('iD.rendererFeatures', () => {
  describe('#keys', () => {
    it('returns feature keys', () => {
      expect(defaultFilters.map((filter) => filter.id)).toEqual(
        expect.arrayContaining([
          'points',
          'traffic_roads',
          'service_roads',
          'paths',
          'buildings',
          'landuse',
          'boundaries',
          'water',
          'rail',
          'power',
          'past_future',
          'others',
        ]),
      )
    })
  })

  describe('#disable', () => {
    it('disables features', () => {
      const after = set.with('water', 'hidden')
      expect(disabled(after)).toContain('water')
      expect(enabled(after)).not.toContain('water')
    })
  })

  describe('#enable', () => {
    it('enables features', () => {
      const after = set.with('water', 'hidden').with('water', 'editable')
      expect(disabled(after)).not.toContain('water')
      expect(enabled(after)).toContain('water')
    })
  })

  // n/a: iD's toggle() flips a category for its panel. Maid's filter button sets the state it
  // wants with with(id, state), so there is no flip to test.

  describe('#gatherStats', () => {
    // The counting is the matching: every category an object is in counts it once. The viewport
    // and the resolver are not needed here. F-features-1 (the renderer's own counts) is still open.
    it('counts features', () => {
      const counts = new Map<string, number>()
      const all = [
        node('point_bar', { amenity: 'bar' }),
        node('point_dock', { waterway: 'dock' }),
        node('point_rail_station', { railway: 'station' }),
        node('point_generator', { power: 'generator' }),
        node('point_old_rail_station', { 'disused:railway': 'station' }),
        way('motorway', { highway: 'motorway' }),
        way('building_yes', { area: 'yes', amenity: 'school', building: 'yes' }),
        way('boundary', { boundary: 'administrative' }),
        way('fence', { barrier: 'fence' }),
      ]
      for (const entity of all) {
        for (const filter of set.categoriesOf(entity.tags, entity.geometry)) {
          counts.set(filter.id, (counts.get(filter.id) ?? 0) + 1)
        }
      }
      const stats = (id: string) => counts.get(id) ?? 0

      expect(stats('boundaries')).toEqual(1)
      expect(stats('buildings')).toEqual(1)
      expect(stats('landuse')).toEqual(0)
      expect(stats('traffic_roads')).toEqual(1)
      expect(stats('service_roads')).toEqual(0)
      expect(stats('others')).toEqual(1)
      expect(stats('past_future')).toEqual(1)
      expect(stats('paths')).toEqual(0)
      expect(stats('points')).toEqual(5)
      expect(stats('power')).toEqual(1)
      expect(stats('rail')).toEqual(1)
      expect(stats('water')).toEqual(1)
    })
  })

  describe('matching', () => {
    it('matches points', () => {
      for (const id of [
        'point_bar',
        'point_dock',
        'point_rail_station',
        'point_generator',
        'point_old_rail_station',
      ]) {
        expect(belongsTo('points', id)).toBe(true)
      }
      for (const id of [
        'motorway',
        'service',
        'path',
        'building_yes',
        'forest',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
      ]) {
        expect(belongsTo('points', id)).toBe(false)
      }
    })

    it('matches traffic roads', () => {
      for (const id of [
        'motorway',
        'motorway_link',
        'trunk',
        'trunk_link',
        'primary',
        'primary_link',
        'secondary',
        'secondary_link',
        'tertiary',
        'tertiary_link',
        'residential',
        'living_street',
        'unclassified',
        'boundary_road',
        'inner3',
      ]) {
        expect(belongsTo('traffic_roads', id)).toBe(true)
      }
      for (const id of [
        'point_bar',
        'service',
        'road',
        'track',
        'path',
        'building_yes',
        'forest',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
      ]) {
        expect(belongsTo('traffic_roads', id)).toBe(false)
      }
    })

    it('matches service roads', () => {
      for (const id of ['service', 'road', 'track', 'piste_track_combo']) {
        expect(belongsTo('service_roads', id)).toBe(true)
      }
      for (const id of [
        'point_bar',
        'motorway',
        'unclassified',
        'living_street',
        'path',
        'building_yes',
        'forest',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
      ]) {
        expect(belongsTo('service_roads', id)).toBe(false)
      }
    })

    it('matches paths', () => {
      for (const id of ['path', 'footway', 'cycleway', 'bridleway', 'steps', 'pedestrian']) {
        expect(belongsTo('paths', id)).toBe(true)
      }
      for (const id of [
        'point_bar',
        'motorway',
        'service',
        'building_yes',
        'forest',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
        'corridor',
      ]) {
        expect(belongsTo('paths', id)).toBe(false)
      }
    })

    it('matches buildings', () => {
      for (const id of ['building_yes', 'garage1', 'garage2', 'garage3', 'garage4']) {
        expect(belongsTo('buildings', id)).toBe(true)
      }
      for (const id of [
        'building_no',
        'building_construction',
        'point_bar',
        'motorway',
        'service',
        'path',
        'forest',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
      ]) {
        expect(belongsTo('buildings', id)).toBe(false)
      }
    })

    it('matches building_parts', () => {
      expect(belongsTo('building_parts', 'building_part')).toBe(true)
      for (const id of [
        'building_yes',
        'garage1',
        'garage2',
        'garage3',
        'garage4',
        'building_no',
        'point_bar',
        'motorway',
        'service',
        'path',
        'forest',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
      ]) {
        expect(belongsTo('building_parts', id)).toBe(false)
      }
    })

    it('matches indoor', () => {
      for (const id of ['room', 'indoor_area', 'indoor_bar', 'corridor']) {
        expect(belongsTo('indoor', id)).toBe(true)
      }
      for (const id of [
        'downhill_piste',
        'piste_track_combo',
        'building_part',
        'garage1',
        'garage2',
        'garage3',
        'garage4',
        'building_no',
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
        'inner3',
        'forest',
        'scrub',
        'industrial',
        'parkinglot',
        'rail_landuse',
        'landuse_construction',
        'retail',
        'outer',
        'inner1',
        'inner2',
      ]) {
        expect(belongsTo('indoor', id)).toBe(false)
      }
    })

    it('matches pistes', () => {
      for (const id of ['downhill_piste', 'piste_track_combo']) {
        expect(belongsTo('pistes', id)).toBe(true)
      }
      for (const id of [
        'room',
        'indoor_area',
        'indoor_bar',
        'corridor',
        'building_part',
        'garage1',
        'garage2',
        'garage3',
        'garage4',
        'building_no',
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
        'inner3',
        'forest',
        'scrub',
        'industrial',
        'parkinglot',
        'rail_landuse',
        'landuse_construction',
        'retail',
        'outer',
        'inner1',
        'inner2',
      ]) {
        expect(belongsTo('pistes', id)).toBe(false)
      }
    })

    it('matches aerialways', () => {
      for (const id of ['gondola', 'zip_line']) {
        expect(belongsTo('aerialways', id)).toBe(true)
      }
      for (const id of [
        'aerialway_platform',
        'old_aerialway_station',
        'downhill_piste',
        'piste_track_combo',
        'room',
        'indoor_area',
        'indoor_bar',
        'corridor',
        'building_part',
        'garage1',
        'garage2',
        'garage3',
        'garage4',
        'building_no',
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
        'inner3',
        'forest',
        'scrub',
        'industrial',
        'parkinglot',
        'rail_landuse',
        'landuse_construction',
        'retail',
        'outer',
        'inner1',
        'inner2',
      ]) {
        expect(belongsTo('aerialways', id)).toBe(false)
      }
    })

    it('matches landuse', () => {
      for (const id of [
        'forest',
        'scrub',
        'industrial',
        'parkinglot',
        'building_no',
        'rail_landuse',
        'landuse_construction',
        'retail',
      ]) {
        expect(belongsTo('landuse', id)).toBe(true)
      }
      for (const id of [
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
        'inner3',
      ]) {
        expect(belongsTo('landuse', id)).toBe(false)
      }
    })

    // needs F-features-5: the untagged members of a multipolygon take the category of the relation
    it.todo('matches landuse (non-interesting members of a landuse multipolygon)', () => {})

    it('matches boundaries', () => {
      for (const id of ['boundary', 'boundary_relation', 'boundary_relation2']) {
        expect(belongsTo('boundaries', id)).toBe(true)
      }
      for (const id of [
        'boundary_road',
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'forest',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
      ]) {
        expect(belongsTo('boundaries', id)).toBe(false)
      }
    })

    // needs F-features-5: ways that are members of a boundary relation take its category (#5601)
    it.todo('matches boundaries (ways that are part of boundary relations)', () => {})

    it('matches water', () => {
      for (const id of [
        'point_dock',
        'water',
        'coastline',
        'bay',
        'pond',
        'basin',
        'reservoir',
        'salt_pond',
        'river',
      ]) {
        expect(belongsTo('water', id)).toBe(true)
      }
      for (const id of [
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'forest',
        'boundary',
        'boundary_member',
        'railway',
        'power_line',
        'motorway_construction',
        'fence',
      ]) {
        expect(belongsTo('water', id)).toBe(false)
      }
    })

    it('matches rail', () => {
      for (const id of ['point_rail_station', 'railway', 'rail_landuse']) {
        expect(belongsTo('rail', id)).toBe(true)
      }
      for (const id of [
        'rail_streetcar',
        'rail_trail',
        'point_old_rail_station',
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'forest',
        'boundary',
        'boundary_member',
        'water',
        'power_line',
        'motorway_construction',
        'fence',
      ]) {
        expect(belongsTo('rail', id)).toBe(false)
      }
    })

    it('matches power', () => {
      for (const id of ['point_generator', 'power_line']) {
        expect(belongsTo('power', id)).toBe(true)
      }
      for (const id of [
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'forest',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'motorway_construction',
        'fence',
      ]) {
        expect(belongsTo('power', id)).toBe(false)
      }
    })

    it('matches past/future', () => {
      for (const id of [
        'building_construction',
        'point_old_rail_station',
        'rail_disused',
        'motorway_construction',
        'cycleway_proposed',
        'landuse_construction',
      ]) {
        expect(belongsTo('past_future', id)).toBe(true)
      }
      for (const id of [
        'rail_trail',
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'forest',
        'boundary',
        'boundary_member',
        'water',
        'railway',
        'power_line',
        'fence',
      ]) {
        expect(belongsTo('past_future', id)).toBe(false)
      }
    })

    it('matches others', () => {
      for (const id of ['fence', 'pipeline']) {
        expect(belongsTo('others', id)).toBe(true)
      }
      for (const id of [
        'point_bar',
        'motorway',
        'service',
        'path',
        'building_yes',
        'forest',
        'boundary',
        'water',
        'railway',
        'power_line',
        'motorway_construction',
        'retail',
        'inner3',
      ]) {
        expect(belongsTo('others', id)).toBe(false)
      }
    })

    // needs F-features-5: untagged members of multipolygons and boundary relations are not "others"
    it.todo('matches others (members of multipolygons and boundary relations)', () => {})
  })

  describe('hiding', () => {
    // needs F-features-5: a hidden multipolygon hides its untagged member ways
    it.todo('hides uninteresting (e.g. untagged or "other") member ways on a hidden multipolygon relation', () => {})

    // needs F-features-4: objects that are not saved yet (no version) are never hidden by a filter
    it.todo('hides only versioned entities', () => {})

    // needs F-features-3: forceVisible keeps the given objects visible while their category is hidden
    it.todo('#forceVisible', () => {})

    // needs F-features-2: a category with too many objects in view is hidden automatically
    it.todo('auto-hides features', () => {})

    // needs F-features-2: the auto-hide threshold doubles with the viewport
    it.todo('doubles auto-hide threshold when doubling viewport size', () => {})
  })
})

import { hasTag } from './tags.ts'
import type { Tags } from './tags.ts'

// Ported from iD's crossing_ways `tagsForConnectionNodeIfAllowed` (ISC, © iD contributors), at
// commit 0194f3926. It says which tags the node joining two crossing features gets: a crossing
// for a footway on a road, a level crossing for a railway, a ford for a waterway. `null` means the
// two must not be joined at all. The `lessLikelyTags` variant is not ported (it is only used by
// iD's dynamic fixes).

export type ConnectionFeature = 'aeroway' | 'building' | 'highway' | 'railway' | 'waterway'

/** One side of a crossing: its feature type, its tags, and whether it is a line (not an area) */
export type ConnectionSide = { type: ConnectionFeature; tags: Tags; line: boolean }

/** iD's `osmPathHighwayTagValues`: highway values that do not allow motor vehicles */
const pathHighways: ReadonlySet<string> = new Set([
  'path',
  'footway',
  'cycleway',
  'bridleway',
  'pedestrian',
  'corridor',
  'steps',
  'ladder',
])

/** Highway values for which a ford is not recommended */
const highwaysDisallowingFords: ReadonlySet<string> = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
])

const crossingValues: ReadonlySet<string | undefined> = new Set([
  'marked',
  'unmarked',
  'traffic_signals',
  'uncontrolled',
])

function isPath(tags: Tags): boolean {
  return pathHighways.has(tags.highway ?? '')
}

/** The tags of the node that joins two crossing features, or `null` when they must not be joined */
export function connectionTagsFor(one: ConnectionSide, two: ConnectionSide): Tags | null {
  const bothLines = one.line && two.line
  const featureTypes = [one.type, two.type].sort().join('-')

  if (featureTypes === 'aeroway-aeroway') return {}
  if (featureTypes === 'aeroway-highway') {
    const isService = one.tags.highway === 'service' || two.tags.highway === 'service'
    // only significant roads get the aeroway=aircraft_crossing tag
    return isService || isPath(one.tags) || isPath(two.tags) ? {} : { aeroway: 'aircraft_crossing' }
  }
  if (featureTypes === 'aeroway-railway') {
    return { aeroway: 'aircraft_crossing', railway: 'level_crossing' }
  }
  if (featureTypes === 'aeroway-waterway') return null

  if (one.type === two.type) {
    if (one.type === 'highway') {
      const onePath = isPath(one.tags)
      const twoPath = isPath(two.tags)
      // one feature is a path but not both
      if ((onePath || twoPath) && onePath !== twoPath) {
        if (!bothLines) return {}
        const road = onePath ? two : one
        const path = onePath ? one : two
        // don't mark path connections with tracks as crossings
        if (road.tags.highway === 'track') return {}
        // a sidewalk crossing a service road is unremarkable
        if (road.tags.highway === 'service' && path.tags.highway === 'footway') {
          if (path.tags.footway === 'sidewalk') return {}
        }
        if (crossingValues.has(path.tags.crossing)) {
          // if the path is a crossing, match the crossing type and markings
          const tags: Record<string, string> = {
            highway: 'crossing',
            crossing: path.tags.crossing ?? '',
          }
          const markings = path.tags['crossing:markings']
          if (markings !== undefined) tags['crossing:markings'] = markings
          return tags
        }
        // don't add a `crossing` subtag to ambiguous crossings
        return { highway: 'crossing' }
      }
      return {}
    }
    if (one.type === 'waterway') return {}
    if (one.type === 'railway') return { railway: 'railway_crossing' }
    return null
  }

  if (featureTypes.includes('highway') && featureTypes.includes('railway')) {
    if (!bothLines) return {}
    const isTram = one.tags.railway === 'tram' || two.tags.railway === 'tram'
    if (isPath(one.tags) || isPath(two.tags)) {
      // path-tram connections use this tag, other path-rail connections the other one
      return isTram ? { railway: 'tram_crossing' } : { railway: 'crossing' }
    }
    // path-tram connections use this tag, other road-rail connections the other one
    return isTram ? { railway: 'tram_level_crossing' } : { railway: 'level_crossing' }
  }

  if (featureTypes.includes('highway') && featureTypes.includes('waterway')) {
    // no fords on structures
    if (hasTag(one.tags.tunnel) && hasTag(two.tags.tunnel)) return null
    if (hasTag(one.tags.bridge) && hasTag(two.tags.bridge)) return null
    if (highwaysDisallowingFords.has(one.tags.highway ?? '')) return null
    if (highwaysDisallowingFords.has(two.tags.highway ?? '')) return null
    return bothLines ? { ford: 'yes' } : {}
  }

  return null
}

// Where presets and fields apply: iD's location sets and the country of a point. A headless wrapper around the two
// packages iD uses: `@rapideditor/location-conflation` (iD's `locationManager`, modules/core/location_manager.ts:
// one LocationConflation instance, `registerLocationSets` and `locationSetsAt`) and `@rapideditor/country-coder`
// (iD's `countryCoder.iso1A2Code(center)` in modules/ui/fields/address.js). Both ship their borders as data.
import { feature as regionFeature, iso1A2Code, wikidataQIDs } from '@rapideditor/country-coder'
import { LocationConflation } from '@rapideditor/location-conflation'
import type { LocationSet, LonLat } from './types.ts'

/** iD's id of the world location set. `Planet`, `001` and `Q2` all resolve to it. */
const WORLD = '+[Q2]'

export type Locations = {
  /** ISO 3166-1 alpha-2 code in lower case, or undefined outside every country (iD's iso1A2Code). */
  countryAt(loc: LonLat): string | undefined
  /**
   * The countries of a point, most specific first, as iD's address field looks them up: the territory (`hk`, `gl`),
   * then the country (`cn`, `dk`). Lower case, each once; empty outside every country.
   * `countryAt` is the country alone.
   */
  countryCodesAt(loc: LonLat): readonly string[]
  /** True when there is no location set, or when the set holds at `loc` (iD's `locationSetsAt(loc).has(id)`). */
  matchesLocation(locationSet: LocationSet | undefined, loc: LonLat): boolean
}

/** The Wikidata id country-coder gives the world (`Planet`, `001`, `Q2`) */
const WORLD_QID = 'Q2'

/**
 * A location set made only of country-coder regions, as lists of Wikidata ids. `locationSetsAt` of location-conflation
 * answers such a set from the regions at the point (country-coder's `featuresContaining`: the region and every group
 * that contains it) and never reads the set's polygon. What it does read is the set's `area`, which
 * `registerLocationSets` sums up while it registers the set, and for a group such as Europe (`Q46`) that means the
 * union of the polygons of all its members (polygon-clipping on big number arithmetic). That took about 90 ms of the
 * 150 ms that the first view of the dense scene needs to build its features (packages/renderer/bench/load.bench.ts,
 * cold run, bun). Nothing here needs the area, so this answers the same question from the same regions without
 * registering the set: a set holds a point when one of its included regions is at the point and none of the
 * excluded ones. A set with anything else (a point with a radius, a custom geojson, a code country-coder does not
 * know) is not a region set, and the engine reads it with all its fallbacks.
 */
type RegionSet = {
  include: readonly string[]
  exclude: readonly string[]
  /** `+[Q2]`: the world on its own, which location-conflation holds at every valid point, the sea included */
  worldOnly: boolean
}

function regionSetOf(set: LocationSet): RegionSet | undefined {
  const qids = (codes: readonly unknown[] | undefined) => {
    const out: string[] = []
    for (const code of codes ?? []) {
      if (typeof code !== 'string' && typeof code !== 'number') return undefined
      const qid = regionFeature(code)?.properties.wikidata
      if (qid === undefined) return undefined
      out.push(qid)
    }
    return out
  }
  const include = qids(set.include)
  const exclude = qids(set.exclude)
  // no include: the engine refuses the set and the caller treats it as the world
  if (!include?.length || !exclude) return undefined
  return {
    include,
    exclude,
    worldOnly: include.length === 1 && include[0] === WORLD_QID && exclude.length === 0,
  }
}

/** location-conflation answers nothing for a point that is not a valid longitude and latitude */
function isValidPoint([lon, lat]: LonLat) {
  return (
    Number.isFinite(lon) &&
    lon >= -180 &&
    lon <= 180 &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90
  )
}

function copyOf(set: LocationSet): LocationSet {
  return { include: set.include?.slice(), exclude: set.exclude?.slice() }
}

/**
 * One wrapper per presets instance. Each distinct location set is registered once (cached by object identity,
 * then by its JSON), and the answer for the last point is cached, so that the many fields of one feature cost
 * one lookup. The conflation engine is built on first use, not when the presets are created.
 */
export function createLocations(): Locations {
  const state: {
    engine?: LocationConflation
    idByObject: WeakMap<LocationSet, string>
    idByJson: Map<string, string>
    regionSets: WeakMap<LocationSet, RegionSet | null>
    regions?: { loc: LonLat; value: ReadonlySet<string> }
    hits?: { loc: LonLat; value: ReadonlyMap<string, number> }
    country?: { loc: LonLat; value: string | undefined }
    countries?: { loc: LonLat; value: readonly string[] }
  } = { idByObject: new WeakMap(), idByJson: new Map(), regionSets: new WeakMap() }

  function engine() {
    if (state.engine === undefined) state.engine = new LocationConflation()
    return state.engine
  }

  // as iD: registerLocationSets gives the set its locationSetID. A set that cannot be read is the world.
  // The registered object is a copy, so that the caller's data is not changed.
  function idOf(locationSet: LocationSet): string {
    const known = state.idByObject.get(locationSet)
    if (known !== undefined) return known
    const json = JSON.stringify(locationSet)
    let id = state.idByJson.get(json)
    if (id === undefined) {
      const [registered] = engine().registerLocationSets([{ locationSet: copyOf(locationSet) }])
      id = registered?.locationSetID ?? WORLD
      state.idByJson.set(json, id)
      // a new set is now in the index, so an answer cached for the last point may lack it
      state.hits = undefined
    }
    state.idByObject.set(locationSet, id)
    return id
  }

  /** The regions at a point, for the last point asked (the many fields of one feature ask again) */
  function regionsAt(loc: LonLat) {
    const last = state.regions
    if (last && last.loc[0] === loc[0] && last.loc[1] === loc[1]) return last.value
    const value = new Set(wikidataQIDs([loc[0], loc[1]]))
    state.regions = { loc: [loc[0], loc[1]], value }
    return value
  }

  function regionSet(locationSet: LocationSet) {
    let known = state.regionSets.get(locationSet)
    if (known === undefined) {
      known = regionSetOf(locationSet) ?? null
      state.regionSets.set(locationSet, known)
    }
    return known
  }

  function hitsAt(loc: LonLat) {
    const last = state.hits
    if (last && last.loc[0] === loc[0] && last.loc[1] === loc[1]) return last.value
    const value = engine().locationSetsAt([loc[0], loc[1]])
    state.hits = { loc: [loc[0], loc[1]], value }
    return value
  }

  return {
    countryAt(loc) {
      const last = state.country
      if (last && last.loc[0] === loc[0] && last.loc[1] === loc[1]) return last.value
      const code = iso1A2Code([loc[0], loc[1]])
      const value = code ? code.toLowerCase() : undefined
      state.country = { loc: [loc[0], loc[1]], value }
      return value
    },
    countryCodesAt(loc) {
      const last = state.countries
      if (last && last.loc[0] === loc[0] && last.loc[1] === loc[1]) return last.value
      // iD: iso1A2Code with the territory level first, then the country level (address.js, updateForCountryCodes)
      const codes = [
        iso1A2Code([loc[0], loc[1]], { level: 'territory' }),
        iso1A2Code([loc[0], loc[1]]),
      ]
      const value = [...new Set(codes.flatMap((code) => (code ? [code.toLowerCase()] : [])))]
      state.countries = { loc: [loc[0], loc[1]], value }
      return value
    },
    matchesLocation(locationSet, loc) {
      if (locationSet === undefined) return true
      const regions = isValidPoint(loc) ? regionSet(locationSet) : null
      if (regions) {
        if (regions.worldOnly) return true
        const here = regionsAt(loc)
        return (
          regions.include.some((qid) => here.has(qid)) &&
          !regions.exclude.some((qid) => here.has(qid))
        )
      }
      // the id first: registering a new set resets the cached hits, so they must be read after it
      const id = idOf(locationSet)
      return hitsAt(loc).has(id)
    },
  }
}

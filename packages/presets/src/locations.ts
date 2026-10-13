// Where presets and fields apply: iD's location sets and the country of a point. A headless wrapper around the two
// packages iD uses: `@rapideditor/location-conflation` (iD's `locationManager`, modules/core/location_manager.ts:
// one LocationConflation instance, `registerLocationSets` and `locationSetsAt`) and `@rapideditor/country-coder`
// (iD's `countryCoder.iso1A2Code(center)` in modules/ui/fields/address.js). Both ship their borders as data.
import { iso1A2Code } from '@rapideditor/country-coder'
import { LocationConflation } from '@rapideditor/location-conflation'
import type { LocationSet, LonLat } from './types.ts'

/** iD's id of the world location set. `Planet`, `001` and `Q2` all resolve to it. */
const WORLD = '+[Q2]'

export type Locations = {
  /** ISO 3166-1 alpha-2 code in lower case, or undefined outside every country (iD's iso1A2Code). */
  countryAt(loc: LonLat): string | undefined
  /** True when there is no location set, or when the set holds at `loc` (iD's `locationSetsAt(loc).has(id)`). */
  matchesLocation(locationSet: LocationSet | undefined, loc: LonLat): boolean
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
    hits?: { loc: LonLat; value: ReadonlyMap<string, number> }
    country?: { loc: LonLat; value: string | undefined }
  } = { idByObject: new WeakMap(), idByJson: new Map() }

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
    matchesLocation(locationSet, loc) {
      if (locationSet === undefined) return true
      // the id first: registering a new set resets the cached hits, so they must be read after it
      const id = idOf(locationSet)
      return hitsAt(loc).has(id)
    },
  }
}

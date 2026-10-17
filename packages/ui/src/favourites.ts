import type { Geometry } from '@osm-editor-kit/maid-presets'

/**
 * A favourite feature type: a preset for one geometry, and the number that starts it. Holding the
 * modifier key and typing the number starts it (packages/shell/src/components/favourites-keys.ts). The number is
 * given when the favourite is made and stays until the favourite is removed or the person changes
 * it, so reordering or removing other favourites does not move it.
 */
export type Favourite = {
  presetId: string
  geometry: Geometry
  number: FavouriteNumber
}

/**
 * A favourite's number, kept as text: a positive integer without a leading zero, as many digits as
 * wanted. Numbers are unique among all favourites, whatever their geometry.
 */
export type FavouriteNumber = string

/**
 * The numbers that are the editor's own keys: 1, 2 and 3 add a point, a line and an area (and 33 the next area
 * tool). A favourite never has one of them, so its number never reads like those keys. Decided by Tobias, 2026-10-17.
 */
export const RESERVED_FAVOURITE_NUMBERS: readonly string[] = ['1', '2', '3']

/** True for a number a favourite can have: digits only, the first one not zero, and not one of the editor's keys */
export function isFavouriteNumber(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value) && !RESERVED_FAVOURITE_NUMBERS.includes(value)
}

/** The lowest number no favourite uses and the editor does not keep: 4 when there are none */
export function freeFavouriteNumber(favourites: Favourite[]): FavouriteNumber {
  const taken = new Set(favourites.map((favourite) => favourite.number))
  let number = 1
  while (taken.has(String(number)) || !isFavouriteNumber(String(number))) number++
  return String(number)
}

/**
 * Favourites stored before 1, 2 and 3 were kept for the editor: each of them gets the lowest free number instead, in
 * the order of the list. The others keep theirs.
 */
export function withoutReservedNumbers(favourites: Favourite[]): Favourite[] {
  const kept = favourites.filter((favourite) => isFavouriteNumber(favourite.number))
  if (kept.length === favourites.length) return favourites
  const result: Favourite[] = []
  for (const favourite of favourites) {
    if (isFavouriteNumber(favourite.number)) {
      result.push(favourite)
      continue
    }
    const number = freeFavouriteNumber([...kept, ...result])
    result.push({ ...favourite, number })
  }
  return result
}

/** The favourite that a number starts, if one has that number */
export function findFavouriteByNumber(favourites: Favourite[], number: string) {
  return favourites.find((favourite) => favourite.number === number)
}

/** The favourites for one geometry, in their order */
export function favouritesFor(favourites: Favourite[], geometry: Geometry) {
  return favourites.filter((favourite) => favourite.geometry === geometry)
}

function indexOf(favourites: Favourite[], presetId: string, geometry: Geometry) {
  return favourites.findIndex(
    (favourite) => favourite.presetId === presetId && favourite.geometry === geometry,
  )
}

/**
 * Makes the preset a favourite for the geometry, at the end, with the lowest free number; or takes
 * it out again if it is one. Taking a favourite out frees its number.
 */
export function toggleFavourite(favourites: Favourite[], presetId: string, geometry: Geometry) {
  const index = indexOf(favourites, presetId, geometry)
  if (index >= 0) return favourites.filter((_, at) => at !== index)
  return [...favourites, { presetId, geometry, number: freeFavouriteNumber(favourites) }]
}

/**
 * Gives a favourite a new number. A number that another favourite has is swapped: that favourite
 * gets the number this one had. An invalid number (see `isFavouriteNumber`) or a favourite that is
 * not in the list changes nothing, and the same list is returned.
 */
export function setFavouriteNumber(
  favourites: Favourite[],
  presetId: string,
  geometry: Geometry,
  number: string,
) {
  if (!isFavouriteNumber(number)) return favourites
  const index = indexOf(favourites, presetId, geometry)
  const current = favourites[index]
  if (!current || current.number === number) return favourites
  const other = favourites.findIndex((favourite) => favourite.number === number)
  return favourites.map((favourite, at) => {
    if (at === index) return { ...favourite, number }
    if (at === other) return { ...favourite, number: current.number }
    return favourite
  })
}

/**
 * Moves a favourite one place up (-1) or down (+1) among the favourites of its geometry. Only the
 * order changes: the two favourites trade places in the list, and their numbers stay with them.
 * Moving past the first or the last favourite of the geometry changes nothing.
 */
export function moveFavourite(
  favourites: Favourite[],
  presetId: string,
  geometry: Geometry,
  delta: 1 | -1,
) {
  const positions = favourites.flatMap((favourite, index) =>
    favourite.geometry === geometry ? [index] : [],
  )
  const at = positions.findIndex((index) => favourites[index]?.presetId === presetId)
  const from = positions[at]
  const to = positions[at + delta]
  if (from === undefined || to === undefined) return favourites
  const moved = favourites[from]
  const other = favourites[to]
  if (!moved || !other) return favourites
  const next = [...favourites]
  next[from] = other
  next[to] = moved
  return next
}

import type { Geometry } from '@osm-editor-kit/maid-presets'

/**
 * A favourite feature type: a preset for one geometry, and the number key that starts it. The key
 * is given when the favourite is made and stays until the favourite is removed, so reordering or
 * removing other favourites does not move it.
 */
export type Favourite = {
  presetId: string
  geometry: Geometry
  key: FavouriteKey
}

/**
 * The number keys favourites can use, in the order new favourites take them. 1, 2 and 3 start the
 * draw modes, so the keys are 4 to 9 and 0. The keys the left hand reaches (4, 5) come first.
 */
export const FAVOURITE_KEYS = ['4', '5', '6', '7', '8', '9', '0'] as const
export type FavouriteKey = (typeof FAVOURITE_KEYS)[number]

/** The most favourites there can be: one per key */
export const MAX_FAVOURITES = FAVOURITE_KEYS.length

/** The first key no favourite uses, or undefined when every key is taken */
export function freeFavouriteKey(favourites: Favourite[]) {
  return FAVOURITE_KEYS.find((key) => !favourites.some((favourite) => favourite.key === key))
}

/** True when every number key is taken: no more favourites can be made */
export function isFavouritesFull(favourites: Favourite[]) {
  return freeFavouriteKey(favourites) === undefined
}

/** The favourite that a number key starts, if one has that key */
export function findFavouriteByKey(favourites: Favourite[], key: string) {
  return favourites.find((favourite) => favourite.key === key)
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
 * Makes the preset a favourite for the geometry, at the end, with the first free key; or takes it
 * out again if it is one. When every key is taken, a new favourite changes nothing and the same
 * list is returned.
 */
export function toggleFavourite(favourites: Favourite[], presetId: string, geometry: Geometry) {
  const index = indexOf(favourites, presetId, geometry)
  if (index >= 0) return favourites.filter((_, at) => at !== index)
  const key = freeFavouriteKey(favourites)
  if (!key) return favourites
  return [...favourites, { presetId, geometry, key }]
}

/**
 * Moves a favourite one place up (-1) or down (+1) among the favourites of its geometry. Only the
 * order changes: the two favourites trade places in the list, and their keys stay with them.
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

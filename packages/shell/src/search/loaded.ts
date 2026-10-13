/**
 * The features in the loaded data whose name, or else whose ref, contains the search text. Pure: the
 * caller gives the features and where each one is. Nothing is fetched. The hits are the nearest to the
 * centre of the view first, at most `LOADED_LIMIT`.
 */

export const LOADED_LIMIT = 20
/** A shorter text would match nearly every feature: it is not searched */
export const MIN_LOADED_QUERY = 2

export interface LoadedFeature {
  /** The engine's id: `n123`, `w45`, `r6` */
  id: string
  tags: Readonly<Record<string, string>>
}

export interface LoadedHit {
  id: string
  /** The name, or the ref when only the ref matches */
  label: string
  /** Degrees in a plane, for the order only; Infinity when the feature has no place */
  distance: number
}

export interface LoadedOptions {
  /** The centre of the view, lon and lat. Without it the hits are not ordered by distance. */
  centre?: { lon: number; lat: number }
  /** Where a feature is, lon and lat: undefined when it has no place */
  placeOf: (id: string) => { lon: number; lat: number } | undefined
  limit?: number
}

/** The label of a feature whose name or ref contains `needle` (lower case), or undefined */
export function labelMatching(
  tags: Readonly<Record<string, string>>,
  needle: string,
): string | undefined {
  const name = tags.name
  if (name && name.toLowerCase().includes(needle)) return name
  const ref = tags.ref
  if (ref && ref.toLowerCase().includes(needle)) return ref
  return undefined
}

/** The distance in degrees, the longitude scaled by the cosine of the latitude: enough to order by */
export function planarDistance(
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
) {
  const scale = Math.cos((from.lat * Math.PI) / 180)
  return Math.hypot((to.lon - from.lon) * scale, to.lat - from.lat)
}

export function findLoaded(
  features: Iterable<LoadedFeature>,
  query: string,
  options: LoadedOptions,
): LoadedHit[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < MIN_LOADED_QUERY) return []
  const matches: { id: string; label: string }[] = []
  for (const feature of features) {
    const label = labelMatching(feature.tags, needle)
    if (label !== undefined) matches.push({ id: feature.id, label })
  }
  const { centre } = options
  const hits = matches.map(({ id, label }) => {
    const place = options.placeOf(id)
    const distance = centre && place ? planarDistance(centre, place) : Number.POSITIVE_INFINITY
    return { id, label, distance }
  })
  // a stable sort: features at the same distance keep the order of the data
  hits.sort((a, b) => a.distance - b.distance)
  return hits.slice(0, options.limit ?? LOADED_LIMIT)
}

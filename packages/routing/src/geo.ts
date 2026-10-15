// Great-circle distance in metres, on the sphere the router uses. The A* heuristic is the same
// distance, so it never overestimates a route built from these lengths.

/** Mean earth radius of the haversine formula, in metres */
export const EARTH_RADIUS_M = 6371008.8

/** Metres per degree of latitude on this sphere (longitude degrees shrink with cos(lat)) */
export const METRES_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180

/** Great-circle distance in metres between two lon/lat points */
export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

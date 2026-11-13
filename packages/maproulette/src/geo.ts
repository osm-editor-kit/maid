/** Great-circle distance, for the picks of nearby tasks */

const EARTH_RADIUS_M = 6371008.8

/** The distance in metres between two [lng, lat] points (haversine) */
export function distanceMeters(a: readonly [number, number], b: readonly [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

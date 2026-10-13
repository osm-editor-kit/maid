/**
 * A flat frame for drawing a few lines in a small SVG box (a junction, a sketch of roads). Positions are lon/lat;
 * the frame is metres around the centre of their bounds, scaled to fit the box, north up (y grows downwards, as in
 * SVG). Headless and dependency-free: no map, no projection library, no second MapLibre map.
 */

/** [lon, lat] in degrees */
export type LonLat = readonly [number, number]

export type MiniMapBox = {
  /** Width and height of the box in SVG units */
  width: number
  height: number
  /** Space kept free on every side, in SVG units */
  padding: number
}

export type MiniMapFrame = {
  /** SVG units per metre */
  scale: number
  /** The SVG position of a lon/lat point */
  project: (point: LonLat) => [number, number]
}

const METRES_PER_DEGREE_LATITUDE = 111_320

/**
 * The frame that fits all points of all lines into the box, centred. `minSpan` (metres) keeps one point or a short
 * road from being drawn huge. Undefined when there are no points.
 */
export function fitMiniMap(
  lines: readonly (readonly LonLat[])[],
  box: MiniMapBox,
  minSpan: number = 20,
): MiniMapFrame | undefined {
  const points = lines.flat()
  if (points.length === 0) return undefined

  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }

  const centreLon = (minLon + maxLon) / 2
  const centreLat = (minLat + maxLat) / 2
  const metresPerDegreeLongitude =
    METRES_PER_DEGREE_LATITUDE * Math.cos((centreLat * Math.PI) / 180)
  const spanX = Math.max((maxLon - minLon) * metresPerDegreeLongitude, minSpan)
  const spanY = Math.max((maxLat - minLat) * METRES_PER_DEGREE_LATITUDE, minSpan)

  const scale = Math.min(
    (box.width - 2 * box.padding) / spanX,
    (box.height - 2 * box.padding) / spanY,
  )
  const originX = box.width / 2
  const originY = box.height / 2

  return {
    scale,
    project: ([lon, lat]) => [
      originX + (lon - centreLon) * metresPerDegreeLongitude * scale,
      originY - (lat - centreLat) * METRES_PER_DEGREE_LATITUDE * scale,
    ],
  }
}

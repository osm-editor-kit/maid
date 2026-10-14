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
 * The frame that fits all points of all lines into the box. `minSpan` (metres) keeps one point or a short road from
 * being drawn huge: the frame is at least that wide and high. `bearing` turns the frame the way a map is turned: a map
 * at bearing B shows the compass direction θ at θ - B on the screen (MapLibre's bearing, counter-clockwise), so 0 is
 * north up. The frame fits the turned points. Undefined when there are no points.
 *
 * By default the bounds of the points are centred in the box. With `around` the frame is centred on that point
 * instead (a junction stays in the middle), and the scale is set by the farthest point on each side of it: the
 * drawing fills the box as far as its widest side allows, and `minSpan` then means the least half-span on each side.
 */
export function fitMiniMap(
  lines: readonly (readonly LonLat[])[],
  box: MiniMapBox,
  minSpan: number = 20,
  bearing: number = 0,
  around?: LonLat,
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

  const [centreLon, centreLat] = around ?? [(minLon + maxLon) / 2, (minLat + maxLat) / 2]
  const metresPerDegreeLongitude =
    METRES_PER_DEGREE_LATITUDE * Math.cos((centreLat * Math.PI) / 180)

  // metres east (x) and north (y) of the centre, turned counter-clockwise by the bearing
  const radians = (bearing * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const turned = ([lon, lat]: LonLat): [number, number] => {
    const east = (lon - centreLon) * metresPerDegreeLongitude
    const north = (lat - centreLat) * METRES_PER_DEGREE_LATITUDE
    return [east * cos - north * sin, east * sin + north * cos]
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of points) {
    const [x, y] = turned(point)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  let spanX: number
  let spanY: number
  let middleX: number
  let middleY: number
  if (around) {
    // centred on the point: each side reaches its farthest point, and each side is at least half of `minSpan`
    spanX = 2 * Math.max(Math.abs(minX), Math.abs(maxX), minSpan / 2)
    spanY = 2 * Math.max(Math.abs(minY), Math.abs(maxY), minSpan / 2)
    middleX = 0
    middleY = 0
  } else {
    spanX = Math.max(maxX - minX, minSpan)
    spanY = Math.max(maxY - minY, minSpan)
    middleX = (minX + maxX) / 2
    middleY = (minY + maxY) / 2
  }

  const scale = Math.min(
    (box.width - 2 * box.padding) / spanX,
    (box.height - 2 * box.padding) / spanY,
  )
  const originX = box.width / 2
  const originY = box.height / 2

  return {
    scale,
    project: (point) => {
      const [x, y] = turned(point)
      return [originX + (x - middleX) * scale, originY - (y - middleY) * scale]
    },
  }
}

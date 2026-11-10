/**
 * Lines in metres for side paths: length, distance, projection, which side of a line a point is on, and the line
 * parallel to a road. Ported from the iD fork iD-Radnetz (`modules/sidepath/offset_line.ts`, FixMyBerlin, ISC). Each
 * function works in a local equirectangular plane around its input, good enough for the length of a street.
 */

/** A position as [lon, lat] */
export type Loc = [number, number]

/** One degree of latitude in metres (WGS84 equatorial radius times pi / 180, as iD's geoMetersToLat) */
const METRES_PER_DEGREE = (6378137 * Math.PI) / 180

function metresPerDegreeLon(lat: number) {
  return METRES_PER_DEGREE * Math.cos((lat * Math.PI) / 180)
}

/** The line as x/y metres around `origin`'s latitude, with `origin` at 0/0 */
function toPlane(line: readonly Loc[], origin: Loc): Array<[number, number]> {
  const kx = metresPerDegreeLon(origin[1])
  return line.map((loc) => [(loc[0] - origin[0]) * kx, (loc[1] - origin[1]) * METRES_PER_DEGREE])
}

/** Length of a line in metres */
export function lineLengthMetres(locs: readonly Loc[]): number {
  if (locs.length < 2) return 0
  const xy = toPlane(locs, locs[0]!)
  let length = 0
  for (let i = 1; i < xy.length; i++)
    length += Math.hypot(xy[i]![0] - xy[i - 1]![0], xy[i]![1] - xy[i - 1]![1])
  return length
}

export type LineProjection = {
  /** The nearest point of the line */
  loc: Loc
  /** Metres from the point to it */
  distance: number
  /** Metres from the start of the line to it */
  along: number
  /** It lies on the segment from this node index to the next */
  index: number
  /**
   * Which side of the line the point is on, looking along the line at the nearest segment: `right`, `left`, or
   * `undefined` when the point is on the line or beyond one of its ends
   */
  side: 'left' | 'right' | undefined
}

/** The nearest point of a line to a point, where on the line it is and on which side the point lies */
export function projectOnLine(point: Loc, line: readonly Loc[]): LineProjection {
  const kx = metresPerDegreeLon(point[1])
  const xy = toPlane(line, point)
  let best: LineProjection = {
    loc: line[0]!,
    distance: Math.hypot(xy[0]![0], xy[0]![1]),
    along: 0,
    index: 0,
    side: undefined,
  }
  let walked = 0
  for (let i = 1; i < xy.length; i++) {
    const [ax, ay] = xy[i - 1]!
    const dx = xy[i]![0] - ax
    const dy = xy[i]![1] - ay
    const length = Math.hypot(dx, dy)
    if (length) {
      const raw = -(ax * dx + ay * dy) / (length * length)
      const share = Math.max(0, Math.min(1, raw))
      const px = ax + share * dx
      const py = ay + share * dy
      const distance = Math.hypot(px, py)
      if (distance < best.distance) {
        // the point is at 0/0: the cross product of the segment and the way from the segment to the point
        const cross = dx * -py - dy * -px
        const beyondEnd = (i === 1 && raw < 0) || (i === xy.length - 1 && raw > 1)
        best = {
          loc: [point[0] + px / kx, point[1] + py / METRES_PER_DEGREE],
          distance,
          along: walked + share * length,
          index: i - 1,
          side: beyondEnd || Math.abs(cross) < 1e-9 ? undefined : cross > 0 ? 'left' : 'right',
        }
      }
    }
    walked += length
  }
  return best
}

/** Metres from a point to the nearest point of a line */
export function distanceToLineMetres(point: Loc, line: readonly Loc[]): number {
  return projectOnLine(point, line).distance
}

/** The nodes of the line plus points at most `step` metres apart in between */
export function samplePoints(locs: readonly Loc[], step: number): Loc[] {
  if (!locs.length) return []
  const points: Loc[] = [locs[0]!]
  for (let i = 1; i < locs.length; i++) {
    const a = locs[i - 1]!
    const b = locs[i]!
    const pieces = Math.max(1, Math.ceil(lineLengthMetres([a, b]) / step))
    for (let piece = 1; piece <= pieces; piece++) {
      const share = piece / pieces
      points.push([a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share])
    }
  }
  return points
}

/**
 * A line parallel to `locs`, `metres` to the right (or left) of its direction. Each vertex moves along the average
 * normal of its two segments, scaled so both segments keep the distance; very sharp angles are capped at twice the
 * distance so the line does not shoot off.
 */
export function offsetLine(locs: readonly Loc[], metres: number, side: 'left' | 'right'): Loc[] {
  if (locs.length < 2) return locs.slice()
  const lat0 = locs.reduce((sum, loc) => sum + loc[1], 0) / locs.length
  const kx = metresPerDegreeLon(lat0)
  const points = locs.map(([lon, lat]) => [lon * kx, lat * METRES_PER_DEGREE] as [number, number])
  const sign = side === 'right' ? 1 : -1

  // right-hand unit normal of each segment (x east, y north)
  const normals = points.slice(1).map((point, i) => {
    const dx = point[0] - points[i]![0]
    const dy = point[1] - points[i]![1]
    const length = Math.hypot(dx, dy) || 1
    return [dy / length, -dx / length] as [number, number]
  })

  return points.map((point, i) => {
    const before = normals[i - 1] ?? normals[i]!
    const after = normals[i] ?? normals[i - 1]!
    let nx = before[0] + after[0]
    let ny = before[1] + after[1]
    const length = Math.hypot(nx, ny)
    if (length < 1e-9) {
      // the line turns back on itself: use one segment's normal
      ;[nx, ny] = before
    } else {
      nx /= length
      ny /= length
    }
    const cos = nx * before[0] + ny * before[1]
    const distance = (sign * metres) / Math.max(cos, 0.5)
    return [(point[0] + nx * distance) / kx, (point[1] + ny * distance) / METRES_PER_DEGREE] as Loc
  })
}

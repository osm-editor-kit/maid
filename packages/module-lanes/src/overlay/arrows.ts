/**
 * Turn arrows on the lane bands: points along each band, offset from the way as the band is, with the angle each arrow
 * is drawn at. Pure, in planar metres around the way (good enough for the length of a road). A lane with a turn value
 * gets an arrow per token (`left;through` two arrows from one base); a lane without one an arrow along its travel.
 */
import type { LaneBand } from './scene-bands.ts'

/** The angle of a turn token, clockwise from straight ahead, in degrees; undefined for `none` and unknown tokens */
export const TURN_ANGLE: Record<string, number> = {
  through: 0,
  slight_right: 40,
  right: 90,
  sharp_right: 135,
  slight_left: -40,
  left: -90,
  sharp_left: -135,
  reverse: 180,
  merge_to_right: 25,
  merge_to_left: -25,
}

export type ArrowPoint = {
  coordinates: [number, number]
  /** Clockwise from north, the direction the icon points */
  rotate: number
  slotId: string
  /** The token, or `travel` for a lane without a turn value */
  token: string
}

const METRES_PER_DEGREE = 111_320

/** The angles a lane's arrows point at, relative to its travel */
function anglesOf(turn: string | undefined): { token: string; angle: number }[] {
  if (turn === undefined || turn.trim() === '') return [{ token: 'travel', angle: 0 }]
  const found = turn
    .split(';')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => TURN_ANGLE[token] !== undefined)
    .map((token) => ({ token, angle: TURN_ANGLE[token]! }))
  return found.length > 0
    ? found
    : turn.trim().toLowerCase() === 'none'
      ? [{ token: 'travel', angle: 0 }]
      : []
}

/**
 * The arrow points of the bands on a way. `reverseOneway`: the way is `oneway=-1`, so its forward lanes run against
 * the drawing. Arrows sit every `spacing` metres, the last one `fromEnd` metres before the end the lane runs to (where a
 * turn arrow is painted on the road).
 */
export function arrowPoints(
  bands: readonly LaneBand[],
  coordinates: readonly [number, number][],
  options: { reverseOneway: boolean; spacing?: number; fromEnd?: number },
): ArrowPoint[] {
  const { reverseOneway, spacing = 30, fromEnd = 12 } = options
  if (coordinates.length < 2 || bands.length === 0) return []
  const lat0 = coordinates[0]![1]
  const kx = METRES_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180)
  const ky = METRES_PER_DEGREE
  const xy = coordinates.map(([lon, lat]) => [lon * kx, lat * ky] as const)
  const lengths = xy.slice(1).map(([x, y], i) => Math.hypot(x - xy[i]![0], y - xy[i]![1]))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total < 4) return []

  /** Point and bearing (clockwise from north, of the drawing) at a distance along the way */
  const at = (distance: number) => {
    let left = distance
    for (let i = 0; i < lengths.length; i++) {
      const length = lengths[i]!
      if (left <= length || i === lengths.length - 1) {
        const [x0, y0] = xy[i]!
        const [x1, y1] = xy[i + 1]!
        const t = length === 0 ? 0 : Math.min(1, left / length)
        const bearing = (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI
        return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, bearing }
      }
      left -= length
    }
    return undefined
  }

  const points: ArrowPoint[] = []
  for (const band of bands) {
    const angles = anglesOf(band.turn)
    if (angles.length === 0) continue
    // the lane runs with the drawing unless it is a backward lane, or a forward lane of a oneway=-1 road
    const against =
      (band.direction === 'backward') !== (reverseOneway && band.direction === 'forward')
    const bothWays = band.direction === 'both_ways'
    // distances along the drawing where the arrows go, the last one shortly before the end the lane runs to
    const distances: number[] = []
    for (let d = Math.min(fromEnd, total / 2); d < total; d += spacing) distances.push(d)
    for (const d of distances) {
      const along = against ? d : total - d
      const place = at(along)
      if (!place) continue
      const right = ((place.bearing + 90) * Math.PI) / 180
      const x = place.x + Math.sin(right) * band.offsetMetres
      const y = place.y + Math.cos(right) * band.offsetMetres
      const travel = place.bearing + (against ? 180 : 0)
      const lonLat: [number, number] = [x / kx, y / ky]
      if (bothWays) {
        points.push({
          coordinates: lonLat,
          rotate: norm(place.bearing),
          slotId: band.slotId,
          token: 'travel',
        })
        points.push({
          coordinates: lonLat,
          rotate: norm(place.bearing + 180),
          slotId: band.slotId,
          token: 'travel',
        })
        continue
      }
      for (const { token, angle } of angles)
        points.push({
          coordinates: lonLat,
          rotate: norm(travel + angle),
          slotId: band.slotId,
          token,
        })
    }
  }
  return points
}

function norm(angle: number): number {
  return Math.round((((angle % 360) + 360) % 360) * 10) / 10
}

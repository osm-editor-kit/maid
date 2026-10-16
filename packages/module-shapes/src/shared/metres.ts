/**
 * The local frame in metres that cut, divide and merge share: an equirectangular projection around the centre of a set
 * of positions, so one unit is one metre near that centre. At the scale of a building or a parking lot the error is far
 * below a millimetre. The rectangle keeps the map's Mercator projection (rectangle.ts), because its corners need right
 * angles on the screen.
 */
import type { Pt } from './vector.ts'

/** A position as [lon, lat] */
export type Loc = [number, number]

/** WGS84 equatorial radius in metres: one degree of latitude is this times pi / 180 */
const EARTH_RADIUS = 6378137

/** The origin of the frame, and the metres per degree of longitude (kx) and of latitude (ky) at that origin */
export interface Frame {
  lon0: number
  lat0: number
  kx: number
  ky: number
}

/**
 * The frame centred on the mean position of the locations.
 * @param   locs - Positions, at least one
 * @return  The frame
 */
export function frameAt(locs: readonly Loc[]): Frame {
  const lon0 = locs.reduce((sum, loc) => sum + loc[0], 0) / locs.length
  const lat0 = locs.reduce((sum, loc) => sum + loc[1], 0) / locs.length
  const degree = (Math.PI * EARTH_RADIUS) / 180
  return {
    lon0,
    lat0,
    kx: degree * Math.cos((lat0 * Math.PI) / 180),
    ky: degree,
  }
}

/**
 * A position in local metres.
 * @param   frame - The frame
 * @param   loc   - Position in [lon, lat]
 * @return  The position in metres, x east and y north
 */
export function toMetres(frame: Frame, loc: Loc): Pt {
  return { x: (loc[0] - frame.lon0) * frame.kx, y: (loc[1] - frame.lat0) * frame.ky }
}

/**
 * A position in [lon, lat] from local metres.
 * @param   frame - The frame
 * @param   p     - Position in metres
 * @return  The position in [lon, lat]
 */
export function toLoc(frame: Frame, p: Pt): Loc {
  return [frame.lon0 + p.x / frame.kx, frame.lat0 + p.y / frame.ky]
}

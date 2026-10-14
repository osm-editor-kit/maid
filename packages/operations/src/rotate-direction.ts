// Rotate (R) for a point with a direction tag: which tag turns, and how its value is written.
// Ported from iD's branch rotate-point-direction (ISC, © iD contributors): modules/util/direction_degrees.ts,
// modules/util/direction_field.ts and modules/actions/rotate_point_direction.ts. Headless: plain
// functions on tags. The preset fallback of iD (a numeric direction field for a point with no tag yet)
// is not here: operations has no presets, so a point without a direction tag does not turn.

/** Compass names as OSM azimuths, as the data model's `OsmNode.directions` reads them (lower case) */
const CARDINAL: Record<string, number> = {
  north: 0,
  n: 0,
  northnortheast: 22,
  nne: 22,
  northeast: 45,
  ne: 45,
  eastnortheast: 67,
  ene: 67,
  east: 90,
  e: 90,
  eastsoutheast: 112,
  ese: 112,
  southeast: 135,
  se: 135,
  southsoutheast: 157,
  sse: 157,
  south: 180,
  s: 180,
  southsouthwest: 202,
  ssw: 202,
  southwest: 225,
  sw: 225,
  westsouthwest: 247,
  wsw: 247,
  west: 270,
  w: 270,
  westnorthwest: 292,
  wnw: 292,
  northwest: 315,
  nw: 315,
  northnorthwest: 337,
  nnw: 337,
}

/** Degrees in [0, 360) */
export function normalizeAzimuthDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** One `;` segment as degrees in [0, 360): a compass name or a number. Undefined for anything else. */
export function parseDirectionDegreesSegment(value: string): number | undefined {
  const text = (value || '').trim().toLowerCase()
  if (!text) return undefined
  if (CARDINAL[text] !== undefined) return CARDINAL[text]
  const parsed = parseFloat(text)
  if (!isFinite(parsed)) return undefined
  return normalizeAzimuthDegrees(parsed)
}

/** True if any `;` segment is an angle. `forward` and `backward` are not: they are relative. */
export function hasDirectionDegrees(value: string | undefined): boolean {
  if (value === undefined || value === '') return false
  return value.split(';').some((segment) => parseDirectionDegreesSegment(segment) !== undefined)
}

/** True for `direction` and `*:direction` tag keys */
export function isDirectionKey(key: string | undefined): boolean {
  return !!key && (key === 'direction' || key.endsWith(':direction'))
}

/**
 * The tag that R turns on a point, or undefined. A `*:direction` key with angles wins over
 * `direction` (iD: `camera:direction` before `direction`). Keys with relative values are not turned.
 */
export function rotatableDirectionKey(tags: Readonly<Record<string, string>>): string | undefined {
  let plain: string | undefined
  for (const key of Object.keys(tags)) {
    if (!isDirectionKey(key) || !hasDirectionDegrees(tags[key])) continue
    if (key !== 'direction') return key
    plain = key
  }
  return plain
}

/**
 * The value with its first angle at `targetDegrees`, and every other angle moved by the same amount:
 * a two-sided `120;300` keeps its two sides. Unreadable segments stay as they are, and a value that
 * has no angle is returned as it is. Angles are written as whole degrees; compass names become numbers.
 */
export function retargetDirectionValue(value: string | undefined, targetDegrees: number): string {
  const target = Math.round(normalizeAzimuthDegrees(targetDegrees))
  if (value === undefined || value === '') return target.toString()
  const segments = value.split(';')
  const parsed = segments.map((segment) => parseDirectionDegreesSegment(segment))
  const firstIndex = parsed.findIndex((degrees) => degrees !== undefined)
  if (firstIndex === -1) return value
  const delta = target - (parsed[firstIndex] as number)
  return segments
    .map((segment, index) => {
      const degrees = parsed[index]
      if (degrees === undefined) return segment
      return Math.round(normalizeAzimuthDegrees(degrees + delta)).toString()
    })
    .join(';')
}

/**
 * Whether the direction field shows the hint that R turns the tag. iD shows it only for a numeric
 * direction field (`type: number`), not for a relative one (`forward` and `backward`).
 */
export function showsDirectionRotateHint(field: { key?: string; fieldType?: string }): boolean {
  return isDirectionKey(field.key) && field.fieldType === 'number'
}

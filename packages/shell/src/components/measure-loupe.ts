/**
 * The magnifier of the measuring tool: the geometry of the lens, ported from the Radnetz fork's
 * `modules/measure/loupe_position.ts` (where the lens goes, so that it does not cover the tape) and
 * `modules/ui/measure_loupe.ts` (the size, the scale and the tape in the lens). Pure: no DOM and no
 * MapLibre here. MeasureLoupe.tsx draws it, with a map of the background inside the lens.
 *
 * Coordinates are CSS pixels. The map's pixels are the ones `map.project` gives (relative to the
 * map's container); the lens's are relative to the lens's top-left corner.
 */

/** A point or a size in pixels */
export type Vec = [number, number]

/** The lens: a circle of this size in CSS pixels */
export const LOUPE_SIZE = 160
export const LOUPE_RADIUS = LOUPE_SIZE / 2
/** The lens shows the background this many times larger than the map */
export const LOUPE_SCALE = 3

/** The space the lens keeps from the tape, in pixels */
const GAP = 12
/** The space from the dragged point to the lens's edge: the mouse pointer's ring (fingers use `FINGER_REACH`) */
const POINTER_REACH = 12
/** A finger covers a wider area than a pointer, so the lens stays further away from it */
export const FINGER_REACH = 28

/** Distance of point `p` to the segment `a`–`b` */
export function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq))
    : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

export type LoupeOptions = {
  /** The free space between the lens and the tape. Default 12 px. */
  gap?: number
  /** The space between the lens's edge and the dragged point: 12 px for a pointer, `FINGER_REACH` for a finger */
  reach?: number
  /** Prefer the place above the point (a finger): the lens sits over the finger, not under it */
  up?: boolean
}

/**
 * The centre of the lens (radius `radius`) for the dragged point `handle`, the other end of the tape
 * `other` and a map of `size` px. The lens is never over the tape, and its centre is at least
 * `radius + reach` from the point, so the point itself is never under the lens. The place away from
 * the tape comes first (above it with `up`), then the sides, then the diagonals, farther out when the
 * point is near an edge of the map. Without a free place, the candidate farthest from the tape.
 *
 * With `other` on top of `handle` (no first click yet) the lens goes above the point.
 */
export function loupeCenter(
  handle: Vec,
  other: Vec,
  size: Vec,
  radius: number,
  options: LoupeOptions = {},
): Vec {
  const { gap = GAP, reach = POINTER_REACH, up = false } = options
  let ux = handle[0] - other[0]
  let uy = handle[1] - other[1]
  const length = Math.hypot(ux, uy)
  if (length < 1) {
    // the ends are on top of each other: above
    ux = 0
    uy = -1
  } else {
    ux /= length
    uy /= length
  }

  const distance = radius + gap + reach
  const s = Math.SQRT1_2
  const first: Vec = up ? [0, -1] : [ux, uy]
  const directions: Vec[] = [
    first, // away from the tape, or above
    [-uy, ux],
    [uy, -ux], // the sides
    [(ux - uy) * s, (uy + ux) * s],
    [(ux + uy) * s, (uy - ux) * s],
    [(-uy - ux) * s, (ux - uy) * s],
    [(uy - ux) * s, (-ux - uy) * s], // the diagonals
  ]

  // close to the point first; farther out when the point is near a map edge or corner
  const candidates = [1, 1.6, 2.3, 3].flatMap((scale) =>
    directions.map(
      ([dx, dy]): Vec => [handle[0] + dx * distance * scale, handle[1] + dy * distance * scale],
    ),
  )
  const inside = (c: Vec) =>
    c[0] - radius >= 0 && c[1] - radius >= 0 && c[0] + radius <= size[0] && c[1] + radius <= size[1]
  const clear = (c: Vec) => distanceToSegment(c, handle, other) >= radius + gap

  const best = candidates.find((c) => inside(c) && clear(c))
  if (best) return best

  // no free place inside the map: keep it inside, as far from the tape as possible
  const clamp = (c: Vec): Vec => [
    Math.max(radius, Math.min(size[0] - radius, c[0])),
    Math.max(radius, Math.min(size[1] - radius, c[1])),
  ]
  return candidates
    .map(clamp)
    .reduce((a, b) =>
      distanceToSegment(b, handle, other) > distanceToSegment(a, handle, other) ? b : a,
    )
}

/** The tape in the lens: from its centre (the dragged point) to the other end, at the lens's scale */
export function loupeTape(handle: Vec, other: Vec, radius = LOUPE_RADIUS, scale = LOUPE_SCALE) {
  return {
    x1: radius,
    y1: radius,
    x2: radius + (other[0] - handle[0]) * scale,
    y2: radius + (other[1] - handle[1]) * scale,
  }
}

/**
 * The zoom of the lens's map for the zoom of the main map: `LOUPE_SCALE` times larger is `log2(3)`
 * zoom levels deeper, so the lens loads tiles one or two levels deeper than the map and is sharper.
 */
export function loupeZoom(mapZoom: number, scale = LOUPE_SCALE) {
  return mapZoom + Math.log2(scale)
}

/**
 * The camera of the lens's map, as `jumpTo` takes it: centred on the pointer, `loupeZoom` deeper than the main
 * map's zoom, and the main map's bearing.
 */
export function loupeCamera(
  pointer: { lon: number; lat: number },
  main: { zoom: number; bearing: number },
) {
  return {
    center: [pointer.lon, pointer.lat] as [number, number],
    zoom: loupeZoom(main.zoom),
    bearing: main.bearing,
  }
}

/**
 * The crosshair in the lens: four arms with a gap at the centre, so that the point under it stays
 * visible. Drawn twice by the lens: a white halo under a blue line.
 */
export function crossPath(radius = LOUPE_RADIUS) {
  const gap = 5
  const arm = 22
  return (
    `M${radius - arm},${radius}H${radius - gap}M${radius + gap},${radius}H${radius + arm}` +
    `M${radius},${radius - arm}V${radius - gap}M${radius},${radius + gap}V${radius + arm}`
  )
}

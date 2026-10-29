/**
 * Where the move handle of the selected feature sits on a touch device (MoveHandle.tsx). As in FMC's
 * `@osm-editor-kit/react-map-gl-draw` (`moveHandleAnchor`), it stays clear of the vertices, midpoints and outline,
 * which have their own meaning when pressed:
 * - an area: inside it, where a press does nothing else; on an area too small on screen to hold the handle beside
 *   its vertices, above its top vertex instead
 * - a line: above its northernmost vertex. A point on the line would cover a midpoint, and the middle of a bent line
 *   lies off the line
 * - a point: above it
 *
 * The handle stays on screen: with the view given, a vertex in view is taken, and an inside point out of view falls
 * back to the top vertex in view. Pure: positions in, a position out. The caller says what the feature is, how large
 * it is on screen and what the view shows.
 */

export type Loc = readonly [lon: number, lat: number]

export type HandleShape =
  | { kind: 'area'; ring: readonly Loc[]; screenSize: number }
  | { kind: 'line'; locs: readonly Loc[] }
  | { kind: 'point'; loc: Loc }

export type HandleAnchor = { lon: number; lat: number; placement: 'inside' | 'above' }

/** The view's box: `[west, south, east, north]` */
export type Bounds = readonly [number, number, number, number]

function inView([lon, lat]: Loc, view: Bounds | undefined) {
  return !view || (lon >= view[0] && lon <= view[2] && lat >= view[1] && lat <= view[3])
}

/** Below this size on screen (the larger side of its box, in CSS px) an area holds its handle above */
export const MIN_INSIDE_PX = 96

/** Whether the point is inside the ring (even-odd, the ring closed or not) */
export function insideRing([x, y]: Loc, ring: readonly Loc[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** The centroid of the ring's area; the mean of its positions when the area is zero */
function centroid(ring: readonly Loc[]): Loc | undefined {
  if (ring.length === 0) return undefined
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const cross = xj * yi - xi * yj
    area += cross
    cx += (xj + xi) * cross
    cy += (yj + yi) * cross
  }
  if (area === 0) {
    const n = ring.length
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * area), cy / (3 * area)]
}

/**
 * A point inside the ring: its centroid when that is inside, else the middle of the widest stretch of the
 * horizontal line through the centroid that lies inside (an L or a U has its centroid outside).
 */
export function interiorPoint(ring: readonly Loc[]): Loc | undefined {
  const middle = centroid(ring)
  if (!middle) return undefined
  if (insideRing(middle, ring)) return middle
  const y = middle[1]
  const crossings: number[] = []
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y) crossings.push(((xj - xi) * (y - yi)) / (yj - yi) + xi)
  }
  crossings.sort((a, b) => a - b)
  let best: Loc | undefined
  let width = 0
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const span = crossings[i + 1]! - crossings[i]!
    if (span > width) {
      width = span
      best = [(crossings[i]! + crossings[i + 1]!) / 2, y]
    }
  }
  return best
}

/** The northernmost position (the first of equals) */
export function topOf(locs: readonly Loc[]): Loc | undefined {
  let top: Loc | undefined
  for (const loc of locs) if (!top || loc[1] > top[1]) top = loc
  return top
}

/** Where the handle sits, or undefined when the shape has no position (in the view, when one is given) */
export function moveHandleAnchor(shape: HandleShape, view?: Bounds): HandleAnchor | undefined {
  const above = (locs: readonly Loc[]): HandleAnchor | undefined => {
    const loc = topOf(locs.filter((each) => inView(each, view)))
    return loc && Number.isFinite(loc[0]) && Number.isFinite(loc[1])
      ? { lon: loc[0], lat: loc[1], placement: 'above' }
      : undefined
  }
  if (shape.kind === 'point') return above([shape.loc])
  if (shape.kind === 'line') return above(shape.locs)
  if (shape.screenSize >= MIN_INSIDE_PX) {
    const inside = interiorPoint(shape.ring)
    if (inside && inView(inside, view))
      return { lon: inside[0], lat: inside[1], placement: 'inside' }
  }
  return above(shape.ring)
}

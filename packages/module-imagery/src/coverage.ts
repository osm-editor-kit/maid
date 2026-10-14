/**
 * Which "best" backgrounds cover the view, as iD decides them at start (`background.js` `init`): a layer that is best
 * for its region and not an overlay counts when the bounding box of its coverage, clipped to the view, is more than
 * half of the view. iD does that in degrees (`geoExtent.area()`), and so does this: the planar box, not the area of the
 * shape. Turf is not in the repo, so the clipping is written here (Sutherland-Hodgman against the view's rectangle).
 *
 * Pure: no ELI and no MapLibre. The coverage is ELI's GeoJSON (`getGeometry`), passed in by the caller.
 */

/** The view's box: `[west, south, east, north]` in degrees */
export type Bounds = readonly [number, number, number, number]

/** A coverage as GeoJSON gives it. Only the polygon kinds count; a point or a line covers nothing here. */
export type Coverage = { readonly type: string; readonly coordinates?: unknown }

type Position = readonly [number, number]
type Ring = readonly Position[]

function polygonsOf(coverage: Coverage): Ring[][] {
  if (coverage.type === 'Polygon') return [coverage.coordinates as Ring[]]
  if (coverage.type === 'MultiPolygon') return coverage.coordinates as Ring[][]
  return []
}

/** Clips one ring to the box (Sutherland-Hodgman, one edge at a time). The result may run along the box's edges. */
function clipRing(ring: Ring, [west, south, east, north]: Bounds): Position[] {
  let output: Position[] = ring.map(([x, y]) => [x, y])
  const edges: {
    inside: (p: Position) => boolean
    cross: (a: Position, b: Position) => Position
  }[] = [
    { inside: ([x]) => x >= west, cross: (a, b) => atX(a, b, west) },
    { inside: ([x]) => x <= east, cross: (a, b) => atX(a, b, east) },
    { inside: ([, y]) => y >= south, cross: (a, b) => atY(a, b, south) },
    { inside: ([, y]) => y <= north, cross: (a, b) => atY(a, b, north) },
  ]
  for (const edge of edges) {
    const input = output
    output = []
    if (input.length === 0) break
    let previous = input[input.length - 1]!
    for (const current of input) {
      if (edge.inside(current)) {
        if (!edge.inside(previous)) output.push(edge.cross(previous, current))
        output.push(current)
      } else if (edge.inside(previous)) {
        output.push(edge.cross(previous, current))
      }
      previous = current
    }
  }
  return output
}

/** The point where the segment a-b crosses the vertical line x */
function atX(a: Position, b: Position, x: number): Position {
  const t = (x - a[0]) / (b[0] - a[0])
  return [x, a[1] + t * (b[1] - a[1])]
}

/** The point where the segment a-b crosses the horizontal line y */
function atY(a: Position, b: Position, y: number): Position {
  const t = (y - a[1]) / (b[1] - a[1])
  return [a[0] + t * (b[0] - a[0]), y]
}

/**
 * Whether the coverage covers more than half of the view, as iD counts it. No coverage (a worldwide layer) covers the
 * whole view. A coverage with no part in the view covers nothing.
 */
export function coversMoreThanHalf(coverage: Coverage | undefined, bounds: Bounds): boolean {
  if (coverage === undefined) return true
  const [west, south, east, north] = bounds
  const viewArea = (east - west) * (north - south)
  if (!(viewArea > 0)) return false
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const polygon of polygonsOf(coverage)) {
    // the outer ring holds the holes, so its box is the polygon's
    const outer = polygon[0]
    if (outer === undefined) continue
    for (const [x, y] of clipRing(outer, bounds)) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX) return false
  return ((maxX - minX) * (maxY - minY)) / viewArea > 0.5
}

/**
 * The candidates that cover more than half of the view, in the order they are given: iD takes the first. The caller
 * passes the best background layers (not overlays) with their coverage.
 */
export function bestIds(
  candidates: readonly { id: string; coverage: Coverage | undefined }[],
  bounds: Bounds,
): string[] {
  return candidates
    .filter((item) => coversMoreThanHalf(item.coverage, bounds))
    .map((item) => item.id)
}

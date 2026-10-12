/**
 * The map's picture of the field that has the focus or the pointer on it, drawn on the selected way:
 *
 * - `side`: a blue line a few pixels off the way on one side (or both). Hidden when the visible
 *   part of the way is too curved, as the fork does (way_viewport_straightness.ts).
 * - `width`: the width as a translucent band on the ground, beside the way (on a side) or around
 *   it, with its value as a label. The band is a polygon built in metres, not a line of pixels, so
 *   it keeps its real width at every zoom and latitude: MapLibre's line-width is in pixels, and a
 *   pixel expression would need the zoom inside a data-driven expression.
 *
 * The fork's features 7 and 10 (WORKDOC.md) are the source of the rules. Pure: no MapLibre here.
 * The engine (engine.ts setFieldOverlay) puts the features into the highlight source.
 */
import type { Feature, LineString, Point, Polygon } from 'geojson'

export type Side = 'left' | 'right'
/** Which side of the way a feature is about: left or right of its direction, or both */
export type SideChoice = Side | 'both'

export type FieldOverlay =
  | { kind: 'side'; side: SideChoice }
  | {
      kind: 'width'
      /** The width on the ground, in metres */
      metres: number
      /** Absent: a band centred on the way. Else the band lies beside it, on that side or on both. */
      side?: SideChoice
      /** For a side band: metres from the way's centre line to the band's inner edge (half the road width) */
      offsetMetres?: number
      /** The text on the band. Default: the width, e.g. "3.5 m" */
      label?: string
    }

/** A position in lon/lat (degrees) */
export type LonLat = [number, number]
/** A position on screen, in CSS pixels */
export type Point2 = [number, number]
export type Viewport = { width: number; height: number }

/** The fork's thresholds (way_viewport_straightness.ts) */
export const STRAIGHTNESS = {
  /** Shorter visible paths give no side indicator */
  minVisibleLength: 40,
  maxTurnDeg: 38,
  maxTotalTurnDeg: 55,
  maxSpreadDeg: 45,
  /** Visible length divided by the chord between its ends */
  maxTortuosity: 1.15,
} as const

/** A miter at a corner of an offset band is cut when it would be longer than this many offsets */
const MITER_LIMIT = 3
const EARTH_RADIUS = 6378137

/** Whether the visible part of a way (screen points, in order) is straight enough for a side line */
export function isStraightEnough(points: Point2[], viewport: Viewport, closed: boolean): boolean {
  return straightEnough(visiblePolyline(points, viewport, closed))
}

/**
 * The part of a polyline inside the viewport, in order. Segments are clipped to the viewport's
 * rectangle; a closed way includes its closing segment.
 */
export function visiblePolyline(points: Point2[], viewport: Viewport, closed: boolean): Point2[] {
  const out: Point2[] = []
  if (points.length < 2) return out
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const range = clipToViewport(a, b, viewport)
    if (!range) continue
    appendPoint(out, lerp(a, b, range[0]))
    appendPoint(out, lerp(a, b, range[1]))
  }
  return out
}

function appendPoint(out: Point2[], p: Point2) {
  const last = out[out.length - 1]
  if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
}

function lerp(a: Point2, b: Point2, t: number): Point2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** Liang-Barsky: the parameters (0..1) of the part of segment a-b inside the viewport, or undefined */
function clipToViewport(a: Point2, b: Point2, viewport: Viewport): [number, number] | undefined {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const p = [-dx, dx, -dy, dy]
  const q = [a[0], viewport.width - a[0], a[1], viewport.height - a[1]]
  let t0 = 0
  let t1 = 1
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!
    const qi = q[i]!
    if (pi === 0) {
      if (qi < 0) return undefined
      continue
    }
    const r = qi / pi
    if (pi < 0) {
      if (r > t1) return undefined
      if (r > t0) t0 = r
    } else {
      if (r < t0) return undefined
      if (r < t1) t1 = r
    }
  }
  return [t0, t1]
}

/** The fork's rule on a visible polyline: length, turns, spread of headings, and how straight the chord is */
function straightEnough(points: Point2[]): boolean {
  if (points.length < 2) return false
  let length = 0
  for (let i = 0; i < points.length - 1; i++) length += distance(points[i]!, points[i + 1]!)
  if (length < STRAIGHTNESS.minVisibleLength) return false

  const headings: number[] = []
  let maxTurn = 0
  let totalTurn = 0
  for (let i = 0; i < points.length - 1; i++) {
    const heading = Math.atan2(points[i + 1]![1] - points[i]![1], points[i + 1]![0] - points[i]![0])
    if (headings.length > 0) {
      const turn =
        (Math.abs(angleDifference(heading, headings[headings.length - 1]!)) * 180) / Math.PI
      maxTurn = Math.max(maxTurn, turn)
      totalTurn += turn
    }
    headings.push(heading)
  }
  const spread = (headingSpread(headings) * 180) / Math.PI
  const chord = distance(points[0]!, points[points.length - 1]!)
  const tortuosity = chord > 1 ? length / chord : Number.POSITIVE_INFINITY

  return (
    maxTurn <= STRAIGHTNESS.maxTurnDeg &&
    totalTurn <= STRAIGHTNESS.maxTotalTurnDeg &&
    spread <= STRAIGHTNESS.maxSpreadDeg &&
    tortuosity <= STRAIGHTNESS.maxTortuosity
  )
}

function distance(a: Point2, b: Point2) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

function angleDifference(a: number, b: number) {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/** The smallest arc (radians) that contains all headings on a circle */
function headingSpread(headings: number[]) {
  if (headings.length < 2) return 0
  const sorted = [...headings].sort((a, b) => a - b)
  let maxGap = 0
  for (let i = 0; i < sorted.length; i++) {
    const gap =
      i === sorted.length - 1 ? sorted[0]! + 2 * Math.PI - sorted[i]! : sorted[i + 1]! - sorted[i]!
    maxGap = Math.max(maxGap, gap)
  }
  return 2 * Math.PI - maxGap
}

/** A flat frame in metres around `origin`: x east, y north. Good for a band a few tens of metres wide. */
function frame(origin: LonLat) {
  const [lon0, lat0] = origin
  const degree = (Math.PI / 180) * EARTH_RADIUS
  const cos = Math.cos((lat0 * Math.PI) / 180)
  return {
    to: ([lon, lat]: LonLat): Point2 => [(lon - lon0) * degree * cos, (lat - lat0) * degree],
    from: ([x, y]: Point2): LonLat => [lon0 + x / (degree * cos), lat0 + y / degree],
  }
}

/**
 * A polyline moved sideways by `distance` metres: positive is left of its direction (north up,
 * so left is the anticlockwise normal). A corner is extended as a miter, up to MITER_LIMIT.
 */
export function offsetLine(points: Point2[], distance: number): Point2[] {
  const normals = points.slice(1).map((p, i) => {
    const a = points[i]!
    const dx = p[0] - a[0]
    const dy = p[1] - a[1]
    const length = Math.hypot(dx, dy) || 1
    return [-dy / length, dx / length] as Point2
  })
  return points.map((p, i) => {
    const before = normals[i - 1] ?? normals[i]!
    const after = normals[i] ?? normals[i - 1]!
    let nx = before[0] + after[0]
    let ny = before[1] + after[1]
    const length = Math.hypot(nx, ny)
    if (length < 1e-6) {
      nx = after[0]
      ny = after[1]
    } else {
      nx /= length
      ny /= length
    }
    const cos = nx * after[0] + ny * after[1]
    const scale = Math.min(1 / Math.max(cos, 1e-6), MITER_LIMIT)
    return [p[0] + nx * distance * scale, p[1] + ny * distance * scale] as Point2
  })
}

/** The point a label sits on: the middle of a polyline (the middle vertex, or between the two middle ones) */
function middleOf(points: Point2[]): Point2 {
  const n = points.length
  if (n % 2 === 1) return points[(n - 1) / 2]!
  const a = points[n / 2 - 1]!
  const b = points[n / 2]!
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** A width as the text on its band: "3.5 m" */
export function formatMetres(metres: number): string {
  return `${Number(metres.toFixed(2))} m`
}

/**
 * The features that draw `overlay` on the way `line` (lon/lat, at least two points). Nothing when a
 * side line would be hidden: the visible part of the way is too curved or too short on screen.
 * `project` gives the screen position of a lon/lat, and `viewport` the map's size in CSS pixels.
 */
export function fieldOverlayFeatures(
  overlay: FieldOverlay,
  line: LonLat[],
  options: { closed: boolean; viewport: Viewport; project: (p: LonLat) => Point2 },
): Feature[] {
  if (line.length < 2) return []
  if (overlay.kind === 'side') {
    const screen = line.map(options.project)
    if (!isStraightEnough(screen, options.viewport, options.closed)) return []
    return sidesOf(overlay.side).map((side) => ({
      type: 'Feature',
      properties: { id: `field-side-${side}`, state: 'field-side', side },
      geometry: { type: 'LineString', coordinates: line } satisfies LineString,
    }))
  }

  const metres = overlay.metres
  if (!(metres > 0)) return []
  const to = frame(line[0]!)
  const centre = line.map(to.to)
  // a centred band runs from +half to -half; a side band from the road's edge out by the width
  const bands: { id: string; from: number; to: number }[] = []
  if (overlay.side === undefined) {
    bands.push({ id: 'field-band-way', from: metres / 2, to: -metres / 2 })
  } else {
    const edge = overlay.offsetMetres ?? 0
    for (const side of sidesOf(overlay.side)) {
      const sign = side === 'left' ? 1 : -1
      bands.push({
        id: `field-band-${side}`,
        from: sign * edge,
        to: sign * (edge + metres),
      })
    }
  }

  const features: Feature[] = []
  for (const band of bands) {
    const inner = offsetLine(centre, band.from)
    const outer = offsetLine(centre, band.to).reverse()
    const ring = [...inner, ...outer].map(to.from)
    ring.push(ring[0]!)
    features.push({
      type: 'Feature',
      properties: { id: band.id, state: 'field-band' },
      geometry: { type: 'Polygon', coordinates: [ring] } satisfies Polygon,
    })
    const at = to.from(middleOf(offsetLine(centre, (band.from + band.to) / 2)))
    features.push({
      type: 'Feature',
      properties: {
        id: `${band.id}-label`,
        state: 'field-label',
        label: overlay.label ?? formatMetres(metres),
      },
      geometry: { type: 'Point', coordinates: at } satisfies Point,
    })
  }
  return features
}

function sidesOf(choice: SideChoice): Side[] {
  return choice === 'both' ? ['left', 'right'] : [choice]
}

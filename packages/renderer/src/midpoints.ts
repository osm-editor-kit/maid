/**
 * The midpoint handles of the selected ways, as iD draws them (svg/midpoints.ts): one handle in the
 * middle of each segment that is long enough on screen. Pressing one adds a node there (engine.ts).
 *
 * Pure: segments in screen pixels in, GeoJSON points out. No map, no data. The engine projects the
 * nodes of the selection, drops what cannot be changed and puts the points in the highlight source.
 *
 * Differs from iD: a segment whose middle is outside the view gets no handle. iD puts it on the
 * edge of the view instead. Maid asks for none off screen, so a long way with thousands of nodes
 * builds only the handles that can be seen.
 */
import type { Feature, Point as GeoPoint } from 'geojson'

/** iD: a segment gets a handle only when it is longer than this on screen, not counting equal (svg/midpoints.ts) */
export const MIDPOINT_MIN_PX = 40

/** A place on the screen, in CSS pixels from the top left corner of the map */
export type ScreenPoint = { x: number; y: number }
/** A place on the ground: [longitude, latitude] */
export type LonLatPoint = [lon: number, lat: number]

/** One segment of a way: its two nodes, in the order of the way, and where they are on screen */
export type Segment = { edge: [string, string]; a: ScreenPoint; b: ScreenPoint }

export type MidpointProperties = {
  /** The feature id (the source promotes it): the same for a segment in either direction */
  id: string
  /** The highlight layer draws the handles by this state */
  state: 'midpoint'
  /** The two nodes of the segment, in the order of the first way that has it */
  edge: [string, string]
}

export type MidpointFeature = Feature<GeoPoint, MidpointProperties>

/** The id of the handle of a segment: the same whichever way it is walked in */
export function midpointId(edge: readonly [string, string]) {
  return `midpoint:${[...edge].sort().join(':')}`
}

/** The segments of a way, from its projected nodes in order. The closing segment of a closed way is one of them. */
export function segmentsOf(nodes: readonly (ScreenPoint & { id: string })[]) {
  const out: Segment[] = []
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i]!
    const b = nodes[i + 1]!
    out.push({ edge: [a.id, b.id], a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } })
  }
  return out
}

/**
 * The handles of these segments. A segment gets one when its screen length is over MIDPOINT_MIN_PX and
 * its middle is inside the view (`view` is the map's size in pixels, from its top left corner).
 * The same segment in two selected ways gets one handle. `unproject` gives the ground place of a
 * screen point; the handle sits there, on the middle of the drawn line.
 */
export function midpointFeatures(
  segments: readonly Segment[],
  view: { width: number; height: number },
  unproject: (point: ScreenPoint) => LonLatPoint,
) {
  const out = new Map<string, MidpointFeature>()
  for (const { edge, a, b } of segments) {
    const id = midpointId(edge)
    if (out.has(id)) continue
    if (Math.hypot(b.x - a.x, b.y - a.y) <= MIDPOINT_MIN_PX) continue
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if (middle.x < 0 || middle.y < 0 || middle.x > view.width || middle.y > view.height) continue
    out.set(id, {
      type: 'Feature',
      properties: { id, state: 'midpoint', edge: [edge[0], edge[1]] },
      geometry: { type: 'Point', coordinates: unproject(middle) },
    })
  }
  return [...out.values()]
}

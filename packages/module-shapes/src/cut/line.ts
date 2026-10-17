/**
 * The cut's line as data: its points in order (the first and the last are the ends), the midpoints between them, and the
 * GeoJSON the map draws. Pure: no map, no editor.
 */
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'
import { frameAt, toMetres, type Loc } from '../shared/metres.ts'
import { distance, item } from '../shared/vector.ts'

/** The line: its points in order, at least two. The first and the last are the ends. */
export type Line = readonly Loc[]

/** The outline of one piece, closed: its first position again at the end */
export type Ring = readonly Loc[]

/** The GeoJSON source of the preview, and the layers of its handles: a press on one starts a drag (mode.ts) */
export const CUT_SOURCE = 'cut-preview'
export const POINT_LAYER = 'cut-point'
export const MIDPOINT_LAYER = 'cut-midpoint'
/**
 * The invisible layers over the handles: a press within HANDLE_HIT_RADIUS pixels of a handle takes it, so a finger
 * finds the dot as a mouse does. The point's layer is last, so a point that lies over a midpoint is the one taken.
 */
export const MIDPOINT_HIT_LAYER = 'cut-midpoint-hit'
export const POINT_HIT_LAYER = 'cut-point-hit'
export const HANDLE_HIT_LAYERS: readonly string[] = [MIDPOINT_HIT_LAYER, POINT_HIT_LAYER]
/** The radius of a point's dot and of a midpoint's dot, in pixels (CutOnMap.tsx draws them) */
export const POINT_RADIUS = 7
export const MIDPOINT_RADIUS = 4
/** The radius of a handle's hit area, in pixels: wider than either dot */
export const HANDLE_HIT_RADIUS = 14

/** A handle on the map: a point of the line, or the midpoint of a segment (`index` is the segment's first point) */
export type HandleRef = { kind: 'point' | 'midpoint'; index: number }

/** The name a handle has in the map's features (the `handle` property) */
export function handleName(ref: HandleRef): string {
  return `${ref.kind}:${ref.index}`
}

/** The handle a name stands for; undefined for any other name */
export function handleOf(name: string): HandleRef | undefined {
  const [kind, digits] = name.split(':')
  if (digits === undefined || digits === '') return undefined
  const index = Number(digits)
  if ((kind !== 'point' && kind !== 'midpoint') || !Number.isInteger(index)) return undefined
  return { kind, index }
}

/** The points with the one at `index` moved to a place. A copy: the points given are not changed. */
export function replacePoint(points: Line, index: number, loc: Loc): Line {
  return points.map((point, i) => (i === index ? loc : point))
}

/** The points with a new one at `index`: the points from there on move one place along */
export function insertPoint(points: Line, index: number, loc: Loc): Line {
  return [...points.slice(0, index), loc, ...points.slice(index)]
}

/** The midpoint of the segment that starts at point `segment` (in lon and lat: the segments are short) */
export function midpointOf(points: Line, segment: number): Loc {
  const from = item(points, segment)
  const to = item(points, segment + 1)
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
}

/**
 * The end that a click moves: the first or the last point, whichever is nearer to the click, in metres. A tie goes to
 * the first. The click needs no handle under it.
 * @param   points - The points of the line
 * @param   loc    - Where the click is
 * @return  The index of the end: 0, or the index of the last point
 */
export function nearestEnd(points: Line, loc: Loc): number {
  const last = points.length - 1
  // the frame only sets the scale: at the size of an area one metre is one metre everywhere in it
  const frame = frameAt([item(points, 0), item(points, last), loc])
  const at = toMetres(frame, loc)
  const fromFirst = distance(toMetres(frame, item(points, 0)), at)
  const fromLast = distance(toMetres(frame, item(points, last)), at)
  return fromLast < fromFirst ? last : 0
}

/** What the preview draws, by `kind`: the line, its points, its midpoints, and the pieces the line makes */
export type CutShapeKind = 'line' | 'point' | 'midpoint' | 'piece'

/**
 * The GeoJSON of the preview: the line through its points, a point for each (named by its `handle`), a midpoint between
 * each two neighbours, and each piece as a polygon. Without pieces (the line is refused) only the line is drawn with
 * its handles.
 * @param   points - The points of the line
 * @param   pieces - The rings of the pieces the line makes, or undefined when it is refused
 * @return  The feature collection for the preview source
 */
export function cutShapes(points: Line, pieces: readonly Ring[] | undefined): FeatureCollection {
  const features: Feature<LineString | Point | Polygon>[] = [
    {
      type: 'Feature',
      properties: { kind: 'line' satisfies CutShapeKind },
      geometry: { type: 'LineString', coordinates: points.map((loc) => [loc[0], loc[1]]) },
    },
    ...points.map(
      (loc, index): Feature<Point> => ({
        type: 'Feature',
        properties: {
          kind: 'point' satisfies CutShapeKind,
          handle: handleName({ kind: 'point', index }),
        },
        geometry: { type: 'Point', coordinates: [loc[0], loc[1]] },
      }),
    ),
    ...points.slice(0, -1).map((_, segment): Feature<Point> => {
      const loc = midpointOf(points, segment)
      return {
        type: 'Feature',
        properties: {
          kind: 'midpoint' satisfies CutShapeKind,
          handle: handleName({ kind: 'midpoint', index: segment }),
        },
        geometry: { type: 'Point', coordinates: [loc[0], loc[1]] },
      }
    }),
  ]
  for (const ring of pieces ?? []) {
    features.push({
      type: 'Feature',
      properties: { kind: 'piece' satisfies CutShapeKind },
      geometry: { type: 'Polygon', coordinates: [ring.map((loc) => [loc[0], loc[1]])] },
    })
  }
  return { type: 'FeatureCollection', features }
}

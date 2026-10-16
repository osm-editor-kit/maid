/**
 * The drawn line of a cut as data: the points the person clicked, where a click puts one, and the GeoJSON the preview
 * draws. Pure: no map, no editor.
 */
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { Loc } from './cut.ts'

/** The points with one more at the end */
export function withPoint(points: readonly Loc[], loc: Loc): Loc[] {
  return [...points, loc]
}

/** The points without the last one; nothing when there are none */
export function withoutLast(points: readonly Loc[]): Loc[] {
  return points.slice(0, -1)
}

/**
 * Where a click puts its point: the place it snaps to (a node, or the nearest place on a way), or the pointer's own
 * place when nothing is under it. A copy, so the point does not share an array with the snap target.
 */
export function clickedAt(lon: number, lat: number, target?: { loc: Loc }): Loc {
  return target ? [target.loc[0], target.loc[1]] : [lon, lat]
}

/** What the preview draws, by `kind`: the drawn line, the rubber band from the last point to the pointer, the points, the chord */
export type CutShapeKind = 'drawn' | 'band' | 'point' | 'chord'

function lineOf(points: readonly Loc[], kind: Exclude<CutShapeKind, 'point'>): Feature<LineString> {
  return {
    type: 'Feature',
    properties: { kind },
    geometry: { type: 'LineString', coordinates: points.map((loc) => [loc[0], loc[1]]) },
  }
}

/**
 * The GeoJSON of the preview. The drawn line and the chord are lines; the rubber band joins the last point to the
 * pointer, so the next segment shows before it is clicked; each clicked point is a point.
 * @param   points  - The clicked points
 * @param   pointer - Where the pointer is now, if it is on the map
 * @param   chord   - The chord that Enter would cut, when the line makes a valid cut
 * @return  The feature collection for the preview source
 */
export function cutShapes(
  points: readonly Loc[],
  pointer: Loc | undefined,
  chord: readonly Loc[] | undefined,
): FeatureCollection {
  const features: Feature<LineString | Point>[] = []
  if (points.length >= 2) features.push(lineOf(points, 'drawn'))
  const last = points[points.length - 1]
  if (last && pointer) features.push(lineOf([last, pointer], 'band'))
  for (const loc of points) {
    features.push({
      type: 'Feature',
      properties: { kind: 'point' },
      geometry: { type: 'Point', coordinates: [loc[0], loc[1]] },
    })
  }
  if (chord && chord.length >= 2) features.push(lineOf(chord, 'chord'))
  return { type: 'FeatureCollection', features }
}

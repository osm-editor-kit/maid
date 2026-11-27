// The point in the middle of a line that carries its centre glyph (layers.ts `line-*-centre`, ADR 0017).
// MapLibre's `symbol-placement: line-center` works on each tile's piece of a line, so a line across a tile border got
// one centre glyph per piece. One point per way, made here from its line feature, gives exactly one.
import type { Feature, LineString, Point, Position } from 'geojson'

/** Mercator y of a latitude, in degrees like the longitude, so lengths and angles are those on the screen */
function mercatorY(lat: number) {
  const phi = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180
  return (Math.log(Math.tan(Math.PI / 4 + phi / 2)) * 180) / Math.PI
}

/**
 * The middle of a line by its length on the map (Mercator, as MapLibre's `line-center` measures it) and the rotation of
 * its glyph there: the screen angle of the line's direction, in degrees clockwise from east, for `icon-rotate` with
 * `icon-rotation-alignment: map`. Undefined for a line without length.
 */
export function lineMiddle(
  coords: readonly Position[],
): { at: Position; rotate: number } | undefined {
  const pts = coords.map((c) => [c[0]!, mercatorY(c[1]!)] as const)
  let total = 0
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1])
  if (!(total > 0)) return undefined
  let left = total / 2
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!
    const [x1, y1] = pts[i]!
    const length = Math.hypot(x1 - x0, y1 - y0)
    if (length === 0) continue
    if (left <= length || i === pts.length - 1) {
      const t = Math.min(1, left / length)
      const a = coords[i - 1]!
      const b = coords[i]!
      const lon = a[0]! + (b[0]! - a[0]!) * t
      // along the segment in Mercator, back to a latitude
      const y = y0 + (y1 - y0) * t
      const lat = ((2 * Math.atan(Math.exp((y * Math.PI) / 180)) - Math.PI / 2) * 180) / Math.PI
      // the screen's y runs south: a line going north turns the glyph counter-clockwise
      const rotate = (Math.atan2(-(y1 - y0), x1 - x0) * 180) / Math.PI
      // `|| 0`: no -0 in the data
      return { at: [lon, lat], rotate: Math.round(rotate * 100) / 100 || 0 }
    }
    left -= length
  }
  return undefined
}

/**
 * The centre point of a line feature: the same id and properties (the glyph's kind, size, level and lens opacity are
 * read from them), with its rotation as `br`. Undefined for a feature that is not a line with length.
 */
export function lineCentre(feature: Feature): Feature<Point> | undefined {
  if (feature.geometry?.type !== 'LineString') return undefined
  const middle = lineMiddle((feature.geometry as LineString).coordinates)
  if (!middle) return undefined
  return {
    type: 'Feature',
    ...(feature.id !== undefined ? { id: feature.id } : {}),
    properties: { ...feature.properties, br: middle.rotate },
    geometry: { type: 'Point', coordinates: middle.at },
  }
}

/**
 * The update of a centre source for an update of its line source: the centres of the lines that are added, and the
 * removals, plus the lines that lost their length (their old centre goes).
 */
export function centreDiff(add: readonly Feature[], remove: readonly (string | number)[]) {
  const centres: Feature<Point>[] = []
  const gone = [...remove]
  for (const feature of add) {
    const centre = lineCentre(feature)
    if (centre) centres.push(centre)
    else if (feature.id !== undefined) gone.push(feature.id)
  }
  return { add: centres, remove: gone }
}

/**
 * The extrude on the map as GeoJSON: a handle in the middle of each side, the way as it would be during a pull and the
 * distance next to the pulled side, plus the names of the layers that draw them. Pure: no map, no editor.
 */
import type { Feature, FeatureCollection } from 'geojson'
import { toLoc } from '../shared/metres.ts'
import type { ExtrudePull } from './extrude-store.ts'
import { previewLocs, type ExtrudeWay, type Side } from './extrude.ts'

/** The GeoJSON source of the extrude, and the layers of its handles: a press on one starts a pull (mode.ts) */
export const EXTRUDE_SOURCE = 'extrude-sides'
export const HANDLE_LAYER = 'extrude-handle'
/** The invisible layer over the handles: a press within HANDLE_HIT_RADIUS pixels takes the handle, for a finger too */
export const HANDLE_HIT_LAYER = 'extrude-handle-hit'
export const HANDLE_HIT_LAYERS: readonly string[] = [HANDLE_HIT_LAYER]
export const HANDLE_RADIUS = 5
export const HANDLE_HIT_RADIUS = 14

const PREFIX = 'extrude:'

/** The name a side's handle has in the map's features (the `handle` property): its index in the way */
export function handleName(side: Side): string {
  return `${PREFIX}${side.index}`
}

/** The index of the side a name stands for; undefined for any other name */
export function sideIndexOf(name: string): number | undefined {
  if (!name.startsWith(PREFIX)) return undefined
  const index = Number(name.slice(PREFIX.length))
  return Number.isInteger(index) && index >= 0 ? index : undefined
}

/**
 * What the map draws: with no pull, a handle on each side; during a pull, the way as it would be (a line, an area also
 * as a fill), a handle on the pulled side where it is now, and the distance next to it.
 * @param   way   - The way in metres
 * @param   sides - Its sides
 * @param   pull  - The pull under way, if any
 * @param   label - The distance as text, e.g. "2,5 m", during a pull
 * @return  The features
 */
export function extrudeShapes(
  way: ExtrudeWay,
  sides: readonly Side[],
  pull: ExtrudePull | undefined,
  label?: string,
): FeatureCollection {
  const features: Feature[] = []
  const handle = (side: Side, at: { x: number; y: number }): Feature => ({
    type: 'Feature',
    properties: { kind: 'handle', handle: handleName(side) },
    geometry: { type: 'Point', coordinates: toLoc(way.frame, at) },
  })
  if (!pull) {
    for (const side of sides) features.push(handle(side, side.middle))
    return { type: 'FeatureCollection', features }
  }
  const coordinates = previewLocs(way, pull.result)
  if (way.closed)
    features.push({
      type: 'Feature',
      properties: { kind: 'preview-fill' },
      geometry: { type: 'Polygon', coordinates: [coordinates] },
    })
  features.push({
    type: 'Feature',
    properties: { kind: 'preview-line' },
    geometry: { type: 'LineString', coordinates },
  })
  const [a, b] = pull.result.side
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  features.push(handle(pull.side, middle))
  if (label !== undefined) {
    // the label a little beyond the side, on the side it moved to, so the handle does not cover it
    const away = pull.distance < 0 ? -1 : 1
    const n = pull.side.normal
    const offset = Math.max(1.5, Math.min(4, pull.side.length / 4))
    features.push({
      type: 'Feature',
      properties: { kind: 'distance', label },
      geometry: {
        type: 'Point',
        coordinates: toLoc(way.frame, {
          x: middle.x + n.x * offset * away,
          y: middle.y + n.y * offset * away,
        }),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

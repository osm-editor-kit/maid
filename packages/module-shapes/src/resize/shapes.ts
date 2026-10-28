/**
 * The resize box as GeoJSON for the map: its outline, its eight handles, the size label and the features as they would
 * be, plus the names and sizes of the layers that draw them. Pure: no map, no editor.
 */
import type { Feature, FeatureCollection } from 'geojson'
import type { Loc } from '../shared/metres.ts'
import { cornersOf, handleAt, HANDLES, type Extent, type Handle } from './box.ts'
import { locOf, type ResizeBox, type ResizePreview } from './resize.ts'

/** The GeoJSON source of the box, and the layers of its handles: a press on one starts a drag (mode.ts) */
export const RESIZE_SOURCE = 'resize-box'
export const HANDLE_LAYER = 'resize-handle'
/** The invisible layer over the handles: a press within HANDLE_HIT_RADIUS pixels takes the handle, for a finger too */
export const HANDLE_HIT_LAYER = 'resize-handle-hit'
export const HANDLE_HIT_LAYERS: readonly string[] = [HANDLE_HIT_LAYER]
/** The radius of a corner handle and of an edge handle, in pixels (ResizeOnMap.tsx draws them) */
export const CORNER_RADIUS = 6
export const EDGE_RADIUS = 5
export const HANDLE_HIT_RADIUS = 14

const PREFIX = 'resize:'

/** The name a handle has in the map's features (the `handle` property) */
export function handleName(handle: Handle): string {
  return `${PREFIX}${handle}`
}

/** The handle a name stands for; undefined for any other name */
export function handleOf(name: string): Handle | undefined {
  if (!name.startsWith(PREFIX)) return undefined
  const handle = name.slice(PREFIX.length)
  return (HANDLES as readonly string[]).includes(handle) ? (handle as Handle) : undefined
}

/**
 * The box on the map: the outline, the handles (corners first in the list's order, then the edges) and, when given, a
 * label with the size at the centre.
 * @param   box    - The box when the resize started (its frame and axes)
 * @param   extent - The box now
 * @param   label  - The text at the centre, e.g. "40,0 × 20,0 m"
 * @return  The features
 */
export function boxShapes(box: ResizeBox, extent: Extent, label?: string): FeatureCollection {
  const ring = cornersOf(extent).map((q) => locOf(box, q))
  const features: Feature[] = [
    {
      type: 'Feature',
      properties: { kind: 'outline' },
      geometry: { type: 'LineString', coordinates: [...ring, ring[0]!] },
    },
  ]
  for (const handle of HANDLES) {
    features.push({
      type: 'Feature',
      properties: { kind: handle.length === 2 ? 'corner' : 'edge', handle: handleName(handle) },
      geometry: { type: 'Point', coordinates: locOf(box, handleAt(extent, handle)) },
    })
  }
  if (label !== undefined) {
    const centre = {
      x: (extent.minU + extent.maxU) / 2,
      y: (extent.minV + extent.maxV) / 2,
    }
    features.push({
      type: 'Feature',
      properties: { kind: 'size', label },
      geometry: { type: 'Point', coordinates: locOf(box, centre) },
    })
  }
  return { type: 'FeatureCollection', features }
}

/**
 * Whether a place is inside the box: a click there keeps the mode, a click outside applies the resize.
 * @param   extent - The box now
 * @param   q      - The place, along the box's axes
 * @return  True inside or on the outline
 */
export function insideBox(extent: Extent, q: { x: number; y: number }): boolean {
  return q.x >= extent.minU && q.x <= extent.maxU && q.y >= extent.minV && q.y <= extent.maxV
}

/**
 * The features as they would be with the box now: each way of the preview as a line (an area also as a fill) and each
 * point on its own, kinds `preview-line`, `preview-fill` and `preview-point`. The data stays as it is until the resize is
 * kept, so the map shows the old shape under the new one.
 * @param   preview   - The ways and points (`previewOf`)
 * @param   positions - Where each node of the box is now (`movesFor`)
 * @return  The features
 */
export function previewShapes(
  preview: ResizePreview,
  positions: ReadonlyMap<string, Loc>,
): Feature[] {
  const features: Feature[] = []
  const place = (node: string | Loc) => (typeof node === 'string' ? positions.get(node)! : node)
  for (const way of preview.ways) {
    const coordinates = way.nodes.map(place)
    if (way.area)
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
  }
  for (const id of preview.points)
    features.push({
      type: 'Feature',
      properties: { kind: 'preview-point' },
      geometry: { type: 'Point', coordinates: place(id) },
    })
  return features
}

import { defineModule } from '@osm-editor-kit/maid-core'
import type { MapLayerItem } from '@osm-editor-kit/maid-renderer'
import type { DataSource } from '../config'

/** Bounding box as [west, south, east, north] */
export type Bbox = [west: number, south: number, east: number, north: number]

/**
 * The extent of the fixture a config's scene is cut from, for `sceneBounds`. `bboxes` is the app's table, from
 * its fixtures' meta files. None for a server's data and for a scene the table does not know.
 */
export function fixtureBounds(
  config: { source: DataSource; scene: string },
  bboxes: Readonly<Record<string, Bbox>>,
): Bbox | undefined {
  return config.source === 'mock' ? bboxes[config.scene] : undefined
}

/** Draws the outline of a bounding box as a dashed line, e.g. the extent of a fixture. */
export function sceneBounds({ bbox }: { bbox: Bbox }) {
  const [west, south, east, north] = bbox
  const outline: MapLayerItem = {
    id: 'scene-bounds',
    source: {
      id: 'scene-bounds',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        },
      },
    },
    layers: [
      {
        id: 'scene-bounds-outline',
        type: 'line',
        paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [3, 2] },
      },
    ],
  }
  return defineModule({
    id: 'scene-bounds',
    setup(api) {
      api.register('map.layer', outline)
    },
  })
}

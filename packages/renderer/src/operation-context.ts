// What an operation looks at: the current graph, the selection and the part of the map in view (the engine's operationContext()).
// Pure over its arguments: the caller passes the map, the data and the selection.
import type { OperationContext } from '@osm-editor-kit/maid-operations'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { OsmData } from './data'

export function operationContextOf(
  map: MapLibreMap | undefined,
  data: OsmData,
  selectedIds: string[],
): OperationContext {
  // the view lets an operation refuse a feature that is mostly outside it ("too large", as iD)
  // under a turn the view is a quadrilateral: its four canvas corners, unprojected (pitch is 0); see extent.ts
  const bounds = map?.getBounds()
  const { clientWidth: width, clientHeight: height } = map?.getContainer() ?? {
    clientWidth: 0,
    clientHeight: 0,
  }
  const viewPolygon =
    map && width > 0 && height > 0
      ? (
          [
            [0, 0],
            [width, 0],
            [width, height],
            [0, height],
          ] as [number, number][]
        ).map(([x, y]): [number, number] => {
          const at = map.unproject([x, y])
          return [at.lng, at.lat]
        })
      : undefined
  return {
    graph: data.history.staging.graph,
    selected: selectedIds,
    viewExtent: bounds && {
      min: [bounds.getWest(), bounds.getSouth()],
      max: [bounds.getEast(), bounds.getNorth()],
    },
    viewPolygon,
  }
}

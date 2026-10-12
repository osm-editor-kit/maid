/**
 * Extension points that the renderer declares. Importing this file (index.ts does) merges them
 * into the `ExtensionPoints` of maid-core, so every app that uses the renderer can register items.
 */
import { defineModule, type Editor, type MaidModule } from '@osm-editor-kit/maid-core'
import type { Operation } from '@osm-editor-kit/maid-operations'
import type { Feature, FeatureCollection } from 'geojson'
import type { ComponentType } from 'react'
import type { LayerProps } from 'react-map-gl/maplibre'

/** Omit per member of a union. A plain `Omit` would keep only one kind of layer. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** The props of one layer. The source comes from the item's `source`, so it is left out. */
export type MapLayerProps = DistributiveOmit<LayerProps, 'source'>

/** A GeoJSON source and the layers that draw it, drawn on top of the OSM layers. */
export type MapLayerItem = {
  id: string
  source: { id: string; data: FeatureCollection | Feature }
  /** Layers of this source. Ids are unique on the map. */
  layers: MapLayerProps[]
}

/**
 * The id of an invisible layer right below the OSM layers. A layer with `beforeId` set to it is
 * drawn under the OSM data (a background); a layer without `beforeId` is drawn on top of it.
 */
export const BELOW_OSM_LAYER = 'maid-below-osm'

export type MapContentProps = {
  editor: Editor
  /** Pass as `beforeId` to draw under the OSM data */
  belowOsm: typeof BELOW_OSM_LAYER
}

/**
 * Anything a module draws on the map itself: a component rendered inside the map, which brings
 * its own `<Source>` and `<Layer>` elements of any kind (raster, vector, GeoJSON) and can use
 * `useMap`. For a plain GeoJSON overlay `map.layer` is less work.
 */
export type MapContentItem = { id: string; component: ComponentType<MapContentProps> }

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    'map.layer': MapLayerItem
    'map.content': MapContentItem
    /** Something the editor can do to the selection: shown in the edit menu, run with its key */
    'edit.operation': Operation
  }
}

/** A module that adds operations to the edit menu, for example `defaultOperations` of maid-operations */
export function operations(list: Operation[]): MaidModule {
  return defineModule({
    id: 'operations',
    setup(api) {
      for (const operation of list) api.register('edit.operation', operation)
    },
  })
}

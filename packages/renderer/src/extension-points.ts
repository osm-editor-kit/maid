/**
 * Extension points that the renderer declares. Importing this file (index.ts does) merges them
 * into the `ExtensionPoints` of maid-core, so every app that uses the renderer can register items.
 */
import type { Feature, FeatureCollection } from 'geojson'
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

declare module '@osm-editor-kit/maid-core' {
  interface ExtensionPoints {
    'map.layer': MapLayerItem
  }
}

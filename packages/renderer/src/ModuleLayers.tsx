import type { Editor } from '@osm-editor-kit/maid-core'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { Fragment } from 'react'
import { type LayerProps, Layer, Source } from 'react-map-gl/maplibre'
import type { MaidEngine } from './engine'
import { BELOW_OSM_LAYER, type MapLayerProps } from './extension-points'

/** A layer of a module's source: react-map-gl takes the source as the layer's `source` prop, named by its id */
function layerOn(source: string, layer: MapLayerProps): LayerProps {
  return { ...layer, source } as LayerProps
}

/**
 * Draws the `map.layer` items that modules registered with the editor, on top of the OSM layers,
 * and what they draw themselves (`map.content`). `engine` is passed on to the `map.content` items.
 * Re-renders when items are added or removed. Must be a child of the map.
 *
 * The sources and layers are siblings (a flat list, not layers nested under their source), each layer
 * names its source (react-map-gl skill, flat source and layer).
 */
export function ModuleLayers({ editor, engine }: { editor: Editor; engine?: MaidEngine }) {
  const items = useExtensionPoint(editor, 'map.layer')
  const contents = useExtensionPoint(editor, 'map.content')
  return (
    <>
      {items.map((item) => (
        <Fragment key={item.id}>
          <Source id={item.source.id} type="geojson" data={item.source.data} />
          {item.layers.map((layer) => (
            <Layer key={layer.id} {...layerOn(item.source.id, layer)} />
          ))}
        </Fragment>
      ))}
      {contents.map((content) => (
        <content.component
          key={content.id}
          editor={editor}
          belowOsm={BELOW_OSM_LAYER}
          engine={engine}
        />
      ))}
    </>
  )
}

import type { Editor } from '@osm-editor-kit/maid-core'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { BELOW_OSM_LAYER } from './extension-points'

/**
 * Draws the `map.layer` items that modules registered with the editor, on top of the OSM layers,
 * and what they draw themselves (`map.content`).
 * Re-renders when items are added or removed. Must be a child of the map.
 */
export function ModuleLayers({ editor }: { editor: Editor }) {
  const items = useExtensionPoint(editor, 'map.layer')
  const contents = useExtensionPoint(editor, 'map.content')
  return (
    <>
      {items.map((item) => (
        <Source key={item.id} id={item.source.id} type="geojson" data={item.source.data}>
          {item.layers.map((layer) => (
            <Layer key={layer.id} {...layer} />
          ))}
        </Source>
      ))}
      {contents.map((content) => (
        <content.component key={content.id} editor={editor} belowOsm={BELOW_OSM_LAYER} />
      ))}
    </>
  )
}

import type { Editor } from '@osm-editor-kit/maid-core'
import { useSyncExternalStore } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'

/**
 * Draws the `map.layer` items that modules registered with the editor, on top of the OSM layers.
 * Re-renders when items are added or removed. Must be a child of the map.
 */
export function ModuleLayers({ editor }: { editor: Editor }) {
  const registry = editor.registry('map.layer')
  // `list()` returns the same array until the registry changes, as useSyncExternalStore needs.
  // The arrows are memoized by the React Compiler, so the store is not resubscribed on each render.
  const items = useSyncExternalStore(
    (listener) => registry.subscribe(listener),
    () => registry.list(),
  )
  return (
    <>
      {items.map((item) => (
        <Source key={item.id} id={item.source.id} type="geojson" data={item.source.data}>
          {item.layers.map((layer) => (
            <Layer key={layer.id} {...layer} />
          ))}
        </Source>
      ))}
    </>
  )
}

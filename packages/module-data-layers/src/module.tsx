import { Square3Stack3DIcon } from '@heroicons/react/20/solid'
import { defineModule } from '@osm-editor-kit/maid-core'
import { checkConfigLayers, type DataLayerConfig } from './config.ts'
import { createMapContent } from './MapLayers.tsx'
import { createPanel } from './Panel.tsx'
import { createDataLayerStore } from './store.ts'

export type DataLayersOptions = {
  /**
   * Layers the editor's config brings. They are shown first, cannot be removed, and can be hidden.
   * Checked here: a broken one throws with every problem named.
   */
  layers?: DataLayerConfig[]
}

/**
 * The data layers module: other data (GeoJSON, PMTiles, vector tiles) drawn under the OSM data,
 * and a "Data layers" flyout to show, hide, add and remove them. Added layers and what is hidden
 * are stored in the browser under `maid:data-layers`; files are kept until a reload.
 */
export function dataLayers(options: DataLayersOptions = {}) {
  const layers = checkConfigLayers(options.layers ?? [])
  const useStore = createDataLayerStore()
  const MapContent = createMapContent(useStore, layers)
  const Panel = createPanel(useStore, layers)
  return defineModule({
    id: 'data-layers',
    setup(api) {
      api.register('map.content', { id: 'data-layers', component: MapContent })
      api.register('topbar.panel', {
        id: 'data-layers',
        label: 'Data layers',
        icon: <Square3Stack3DIcon aria-hidden="true" />,
        component: Panel,
        width: 'w-[28rem]',
      })
    },
  })
}

import { Square3Stack3DIcon } from '@heroicons/react/20/solid'
import { defineModule } from '@osm-editor-kit/maid-core'
import { lazyComponent, PANEL_FALLBACK } from '@osm-editor-kit/maid-ui'
import { checkConfigLayers, type DataLayerConfig } from './config.ts'
import { createMapContent } from './MapLayers.tsx'
import { registerPmtilesProtocol } from './pmtiles.ts'
import { parseAsDataLink } from './url.ts'

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
 *
 * The URL parameter `data` names one remote GeoJSON, GPX or PMTiles address that is shown as a layer while the URL
 * names it (url.ts, link.ts). Its iD name is `gpx`, so iD's GPX links map onto it. A link alone writes nothing to storage.
 */
export function dataLayers(options: DataLayersOptions = {}) {
  const layers = checkConfigLayers(options.layers ?? [])
  return defineModule({
    id: 'data-layers',
    setup(api) {
      // the PMTiles protocol, once per editor, before any pmtiles:// layer is drawn (a map content of this module)
      registerPmtilesProtocol()
      const link = api.urlParam({
        name: 'data',
        parser: parseAsDataLink,
        options: { history: 'replace' },
        iD: { name: 'gpx' },
      })
      // the map layer reads the PMTiles archives through the editor's fetch, and its query client is the editor's
      const MapContent = createMapContent(layers, api.editor.fetch, link)
      // the form's checks of an address go through the editor's fetch (the `data` gate)
      // the panel's code is a chunk of its own: it loads when the flyout opens (or in idle time after the first view)
      const Panel = lazyComponent(
        () =>
          import('./Panel.tsx').then((panel) => ({
            default: panel.createPanel(layers, api.editor.fetch, link),
          })),
        PANEL_FALLBACK,
      )
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

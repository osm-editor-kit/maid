/**
 * Terrain: the relief of the ground under the OSM data, and the ground in 3D with a tilted map. For editors where the
 * height matters (climbing: crags, boulders and the routes on a rock face). Elevation from Mapterhorn; see terrain.ts
 * for why not from the editor layer index, and the panel's notice on the licences.
 */
import { MapIcon } from '@heroicons/react/24/outline'
import { defineModule } from '@osm-editor-kit/maid-core'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { m } from './messages.ts'
import { MAX_PITCH, parseAsTerrain } from './terrain.ts'
import { TerrainLayers } from './TerrainLayers.tsx'
import { TerrainPanel } from './TerrainPanel.tsx'

export { MAPTERHORN, parseAsTerrain, type TerrainMode } from './terrain.ts'

export function terrain() {
  return defineModule({
    id: 'terrain',
    setup(api) {
      const handle = api.urlParam({
        name: 'terrain',
        parser: parseAsTerrain,
        options: { history: 'replace', clearOnDefault: true },
      })
      // the map may tilt in this editor (the shell keeps it flat otherwise); the 3D view tilts it on its own
      api.register('map.view', { id: 'terrain', maxPitch: MAX_PITCH })
      function Layers(props: MapContentProps) {
        return <TerrainLayers {...props} handle={handle} />
      }
      api.register('map.content', { id: 'terrain', component: Layers })
      function Panel() {
        return <TerrainPanel handle={handle} />
      }
      api.register('topbar.panel', {
        id: 'terrain',
        get label() {
          return m.terrain_label()
        },
        icon: <MapIcon aria-hidden="true" className="size-5" />,
        component: Panel,
        width: 'w-80',
      })
    },
  })
}

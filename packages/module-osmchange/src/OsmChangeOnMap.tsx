import type { Editor } from '@osm-editor-kit/maid-core'
import type { OsmNode } from '@osm-editor-kit/maid-model'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import type { ExpressionSpecification } from 'maplibre-gl'
import { Layer, Source } from 'react-map-gl/maplibre'
import { ACTION_COLOUR, planFeatures } from './features.ts'
import {
  type OsmChangeStore,
  useOsmChangeChoices,
  useOsmChangeHighlight,
  useOsmChangeSession,
} from './osmchange-store.ts'
import { planOf } from './plan.ts'

const COLOUR: ExpressionSpecification = [
  'match',
  ['get', 'tone'],
  'create',
  ACTION_COLOUR.create,
  'modify',
  ACTION_COLOUR.modify,
  'delete',
  ACTION_COLOUR.delete,
  ACTION_COLOUR.skip,
]

function locOf(editor: Editor, key: string): [number, number] | undefined {
  const entity = editor.history.staging.graph.hasEntity(key) as OsmNode | undefined
  return entity?.loc
}

/** The open import on the map, above the OSM data and under the map's own handles; nothing without one */
export function createOsmChangeOnMap(store: OsmChangeStore) {
  return function OsmChangeOnMap({ editor }: MapContentProps) {
    const session = useOsmChangeSession(store)
    const choices = useOsmChangeChoices(store)
    const shown = useOsmChangeHighlight(store)
    if (!session || !shown) return null
    const plan = planOf(session.file, session.states, session.parents, choices, session.matches)
    const data = planFeatures(plan, (key) => locOf(editor, key))
    return (
      <Source id="osmchange" type="geojson" data={data}>
        <Layer
          id="osmchange-before-line"
          type="line"
          filter={[
            'all',
            ['==', ['geometry-type'], 'LineString'],
            ['==', ['get', 'side'], 'before'],
          ]}
          paint={{
            'line-color': COLOUR,
            'line-width': 3,
            'line-opacity': 0.6,
            'line-dasharray': [2, 2],
          }}
        />
        <Layer
          id="osmchange-after-line"
          type="line"
          filter={[
            'all',
            ['==', ['geometry-type'], 'LineString'],
            ['==', ['get', 'side'], 'after'],
          ]}
          paint={{
            'line-color': COLOUR,
            'line-width': ['case', ['get', 'decide'], 6, 4],
            'line-opacity': 0.85,
          }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
        <Layer
          id="osmchange-before-point"
          type="circle"
          filter={['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'side'], 'before']]}
          paint={{
            'circle-radius': 7,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': COLOUR,
            'circle-stroke-width': 2,
            'circle-stroke-opacity': 0.7,
          }}
        />
        <Layer
          id="osmchange-after-point"
          type="circle"
          filter={['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'side'], 'after']]}
          paint={{
            'circle-radius': ['case', ['get', 'decide'], 9, 6],
            'circle-color': COLOUR,
            'circle-opacity': 0.55,
            'circle-stroke-color': '#18181b',
            'circle-stroke-width': ['case', ['get', 'decide'], 2, 0],
          }}
        />
      </Source>
    )
  }
}

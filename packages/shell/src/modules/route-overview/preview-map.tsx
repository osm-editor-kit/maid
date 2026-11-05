/**
 * The preview of the route whose overview is on screen, on the map: the simplified lines of the members that are not
 * loaded, thin and dashed, under the OSM data, so the loaded ways and their arrows stay on top. A row hovered in the
 * overview makes its line strong here (the engine's hover target, which the OSM layers cannot show for a feature that
 * is not loaded). A member that is loaded is not drawn: its real shape replaces the preview.
 *
 * Registered on `map.content` next to the relation's own drawing (relations.tsx).
 */
import { OsmRelation } from '@osm-editor-kit/maid-model'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { useSyncExternalStore } from 'react'
import { Layer, Source, type LayerProps } from 'react-map-gl/maplibre'
import { useShell } from '../../shell-context'
import { colourOf } from '../relations-logic.ts'
import { dataVersion } from './data-version.ts'
import { existingPreviewStore, type PreviewStore } from './preview-store.ts'

const SOURCE = 'route-preview'
const NEUTRAL = '#7c3aed'
const NOTHING = () => () => {}

type Feature = {
  type: 'Feature'
  properties: { id: string }
  geometry: { type: 'LineString'; coordinates: [number, number][] }
}

function asLayer(spec: object): LayerProps {
  return spec as unknown as LayerProps
}

// the drawing is made again only when the preview, the relation or the loaded data change, not on hover
const drawings = new WeakMap<
  object,
  { key: string; data: { type: 'FeatureCollection'; features: Feature[] } }
>()

export function RoutePreviewOnMap({ editor, belowOsm }: MapContentProps) {
  'use no memo'
  // not compiled: the graph and the store are objects that stay the same when their contents change
  const { engine } = useShell()
  const store: PreviewStore | undefined = existingPreviewStore(editor)
  useSyncExternalStore(store?.subscribe ?? NOTHING, () =>
    store ? `${store.shown()}|${store.state(store.shown() ?? '').status}` : '',
  )
  const hovered = useSyncExternalStore(engine.subscribeHover, engine.hoverTarget)
  const version = dataVersion(editor.history)
  const id = store?.shown()
  const state = id ? store?.state(id) : undefined
  const entry = state && 'entry' in state ? state.entry : undefined
  const graph = editor.history.staging.graph
  const relation = id ? graph.hasEntity(id) : undefined
  if (!entry || !(relation instanceof OsmRelation)) return null
  const key = `${relation.id}|${version}`
  let drawing = drawings.get(entry)
  if (!drawing || drawing.key !== key) {
    const features: Feature[] = []
    for (const member of relation.members) {
      if (member.type !== 'way' || graph.hasEntity(member.id)) continue
      const line = entry.preview.ways.get(member.id)?.line
      if (line)
        features.push({
          type: 'Feature',
          properties: { id: member.id },
          geometry: { type: 'LineString', coordinates: line.map(([lon, lat]) => [lon, lat]) },
        })
    }
    drawing = { key, data: { type: 'FeatureCollection', features } }
    drawings.set(entry, drawing)
  }
  const colour = colourOf(relation) ?? NEUTRAL
  return (
    <>
      <Source id={SOURCE} type="geojson" data={drawing.data} />
      <Layer
        {...asLayer({
          id: 'route-preview-line',
          type: 'line',
          source: SOURCE,
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            'line-color': colour,
            'line-width': ['case', ['==', ['get', 'id'], hovered ?? ''], 6, 2.5],
            'line-opacity': ['case', ['==', ['get', 'id'], hovered ?? ''], 0.9, 0.55],
            'line-dasharray': [2, 1.5],
          },
        })}
        beforeId={belowOsm}
      />
    </>
  )
}

import { m } from '@osm-editor-kit/maid-i18n'
import type { Issue } from '@osm-editor-kit/maid-validation'
import { useMemo } from 'react'
import { Layer, Source, type LayerProps } from 'react-map-gl/maplibre'

type FeatureCollection = {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { id: string; rule: string }
  }[]
}

/**
 * The issues that are marked on the map as well as listed: those of a place that one cannot see at the zoom one edits
 * at. Two points of a way a few centimetres apart look like one point; the ring says that there are two.
 */
export const ON_MAP_RULES: ReadonlySet<string> = new Set(['close_nodes'])

const SOURCE = 'validation-on-map'
/** Amber, as the warnings of the sidebar and the gap rings of a route */
const AMBER = '#f59e0b'

function asLayer(spec: object): LayerProps {
  return spec as unknown as LayerProps
}

/** The issues of `ON_MAP_RULES` that have a place, as points with the rule and the issue's id */
export function onMapFeatures(issues: readonly Issue[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: issues.flatMap((issue) =>
      ON_MAP_RULES.has(issue.rule) && issue.loc
        ? [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [issue.loc[0], issue.loc[1]] },
              properties: { id: issue.id, rule: issue.rule },
            },
          ]
        : [],
    ),
  }
}

/**
 * A ring around each such issue, the same size at every zoom, with its name from zoom 17. It takes no clicks: a click
 * there selects the points or the way under it, and the inspector shows the issue with its fix ("Merge these points").
 */
export function IssuesOnMap({ issues }: { issues: readonly Issue[] }) {
  const data = useMemo(() => onMapFeatures(issues), [issues])
  if (data.features.length === 0) return null
  return (
    <>
      <Source id={SOURCE} type="geojson" data={data} />
      <Layer
        {...asLayer({
          id: 'validation-on-map-halo',
          type: 'circle',
          source: SOURCE,
          paint: {
            'circle-radius': 11,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 5,
            'circle-stroke-opacity': 0.8,
          },
        })}
      />
      <Layer
        {...asLayer({
          id: 'validation-on-map-ring',
          type: 'circle',
          source: SOURCE,
          paint: {
            'circle-radius': 11,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': AMBER,
            'circle-stroke-width': 2.5,
          },
        })}
      />
      <Layer
        {...asLayer({
          id: 'validation-on-map-label',
          type: 'symbol',
          source: SOURCE,
          minzoom: 17,
          layout: {
            'text-field': m.issues_close_points_map(),
            'text-font': ['Open Sans Semibold'],
            'text-size': 11,
            'text-anchor': 'left',
            'text-offset': [1.4, 0],
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#92400e',
            'text-halo-color': '#fff',
            'text-halo-width': 1.5,
          },
        })}
      />
    </>
  )
}

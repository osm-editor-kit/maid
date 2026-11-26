/**
 * A filter of the lanes editor: the points that say something about the lanes of a road (traffic signs, stops,
 * signals, give way and stop signs, crossings, traffic calming, barriers on the road) stay on the map, read-only,
 * while the other points and the shops are hidden (Tobias, 2026-11-26: "POIs standardmäßig verstecken"). A `rule`, so
 * it decides before the `points` category does (packages/filters README, "Kinds").
 */
import type { Filter } from '@osm-editor-kit/maid-filters'

type Tags = Readonly<Record<string, string | undefined>>

const HIGHWAY_POINTS = new Set([
  'bus_stop',
  'traffic_signals',
  'stop',
  'give_way',
  'crossing',
  'speed_camera',
  'traffic_mirror',
  'turning_circle',
  'turning_loop',
  'mini_roundabout',
])

/** A point about the road and its lanes */
export function isStreetPoint(tags: Tags): boolean {
  return (
    (tags.traffic_sign !== undefined && tags.traffic_sign !== 'no') ||
    (tags.highway !== undefined && HIGHWAY_POINTS.has(tags.highway)) ||
    tags.public_transport === 'platform' ||
    tags.public_transport === 'stop_position' ||
    (tags.traffic_calming !== undefined && tags.traffic_calming !== 'no') ||
    (tags.barrier !== undefined && tags.barrier !== 'no')
  )
}

export const streetPoints: Filter = {
  id: 'street_points',
  label: 'Signs, Stops and Road Points',
  match: isStreetPoint,
  geometry: ['point'],
  state: 'readonly',
  kind: 'rule',
}

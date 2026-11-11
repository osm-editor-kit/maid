/**
 * The map style "Bicycle infrastructure": the legend of the bicycle editor's default look, with everything but the
 * highways dimmed. The lines themselves are drawn by the map content (BikeInfraOnMap), with or without this lens: a lens
 * restyles the features of the OSM data only. Its rules are legend-only (a key no feature has, as in the parking lens):
 * a lens panel lists the rules, and `Lens` has no legend of its own.
 */
import type { Lens } from '@osm-editor-kit/maid-style'
import { GROUPS, type GroupId } from './groups.ts'
import { m } from './messages.ts'
import { BIKE_LENS_ID } from './shown.ts'

/** The legend text of a group, in the page's language */
export function groupLabel(id: GroupId): string {
  switch (id) {
    case 'separated':
      return m.group_separated()
    case 'lane':
      return m.group_lane()
    case 'sharedMotor':
      return m.group_shared_motor()
    case 'footSegregated':
      return m.group_foot_segregated()
    case 'footShared':
      return m.group_foot_shared()
    case 'footwayBicycle':
      return m.group_footway_bicycle()
    case 'needsClarification':
      return m.group_needs_clarification()
  }
}

export const bikeInfrastructureLens: Lens = {
  id: BIKE_LENS_ID,
  get name() {
    return m.lens_name()
  },
  get description() {
    return m.lens_description()
  },
  geometry: ['line', 'area'],
  rest: 'dim',
  rules: [
    ...GROUPS.map((group) => ({
      match: { 'maid:legend': `bike-${group.id}` },
      color: group.colour,
      ...(group.dashed ? { dash: [4, 3] } : {}),
      get label() {
        return groupLabel(group.id)
      },
    })),
    {
      match: { 'maid:legend': 'bike-separate' },
      color: '#174ed9',
      width: 1.5,
      dash: [1, 2],
      get label() {
        return m.legend_separate()
      },
    },
    // roads and paths keep their own look: the lens only dims everything else
    { match: { highway: true }, opacity: 1 },
  ],
}

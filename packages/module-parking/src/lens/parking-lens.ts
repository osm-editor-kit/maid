/**
 * The map style "Parking": the parking areas coloured by their category (the JOSM colours), roads kept in their own
 * colours, everything else dimmed. The side lines of roads are drawn by the map content (ParkingSidesOnMap), not by this
 * lens: a lens restyles the features of the OSM data only. The side lines' own categories are legend-only rules below.
 *
 * Rules: first match decides (4c of the parking document). The file's "dash" and fill are not in the lens (a lens has
 * colour, width, dash and opacity); the strips of the areas are drawn by the layers. Conditional values are matched by
 * key only (`restriction:conditional` is set), not by the value: the lens can not match a substring.
 */
import type { Lens } from '@osm-editor-kit/maid-style'
import { m } from '../messages.ts'
import { CATEGORIES } from './categories.ts'

const parking = { amenity: 'parking' } as const

export const parkingLens: Lens = {
  id: 'parking',
  get name() {
    return m.lens_name()
  },
  get description() {
    return m.lens_description()
  },
  geometry: ['line', 'area'],
  rest: 'dim',
  rules: [
    {
      match: { ...parking, warnings: true },
      color: CATEGORIES.warnings.colour,
      get label() {
        return CATEGORIES.warnings.label
      },
    },
    {
      match: { ...parking, restriction: 'loading_only' },
      color: CATEGORIES.loading_only.colour,
      get label() {
        return CATEGORIES.loading_only.label
      },
    },
    {
      match: { ...parking, restriction: 'charging_only' },
      color: CATEGORIES.charging_only.colour,
      get label() {
        return CATEGORIES.charging_only.label
      },
    },
    {
      match: { ...parking, disabled: true },
      color: CATEGORIES.disabled.colour,
      get label() {
        return CATEGORIES.disabled.label
      },
    },
    { match: { ...parking, 'disabled:conditional': true }, color: CATEGORIES.disabled.colour },
    {
      match: { ...parking, restriction: ['no_stopping', 'no_parking'] },
      color: CATEGORIES.no_stopping.colour,
      get label() {
        return CATEGORIES.no_stopping.label
      },
    },
    {
      match: { ...parking, restriction: true },
      color: CATEGORIES.restricted.colour,
      get label() {
        return CATEGORIES.restricted.label
      },
    },
    { match: { ...parking, 'restriction:conditional': true }, color: CATEGORIES.restricted.colour },
    {
      match: { ...parking, access: ['private', 'permissive', 'customers', 'no'] },
      color: CATEGORIES.restricted.colour,
    },
    { match: { ...parking, 'access:conditional': true }, color: CATEGORIES.restricted.colour },
    {
      match: { ...parking, fee: 'yes' },
      color: CATEGORIES.paid.colour,
      get label() {
        return CATEGORIES.paid.label
      },
    },
    { match: { ...parking, 'fee:conditional': true }, color: CATEGORIES.paid.colour },
    {
      match: { ...parking, maxstay: true },
      color: CATEGORIES.time_limit.colour,
      get label() {
        return CATEGORIES.time_limit.label
      },
    },
    { match: { ...parking, 'maxstay:conditional': true }, color: CATEGORIES.time_limit.colour },
    {
      match: { ...parking, fee: 'no' },
      color: CATEGORIES.free.colour,
      get label() {
        return CATEGORIES.free.label
      },
    },
    // Legend only: the side lines of roads (ParkingSidesOnMap) in the categories no rule above names. A lens panel lists
    // the rules, and `Lens` has no legend of its own, so these rules name a key no feature has and draw nothing.
    ...(['parked', 'no_parking_side', 'not_mapped'] as const).map((id) => ({
      match: { 'maid:legend': `parking-side-${id}` },
      color: CATEGORIES[id].colour,
      get label() {
        return CATEGORIES[id].label
      },
    })),
    // roads keep their own look: the lens only dims everything else
    { match: { highway: true }, opacity: 1 },
  ],
}

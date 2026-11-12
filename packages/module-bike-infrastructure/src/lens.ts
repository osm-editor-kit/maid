/**
 * The map style "Bicycle infrastructure": the bicycle editor's default look with everything but the highways dimmed,
 * and its chosen legend (`bikeLegend`). The lines themselves are drawn by the map content (BikeInfraOnMap), with or
 * without this lens: a lens restyles the features of the OSM data only.
 */
import type { Lens, LensLegend, LensLegendEntry } from '@osm-editor-kit/maid-style'
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

/** A dash in line widths, as the map's dashed lines (layers.ts) */
const DASH = [2, 1.5]

/**
 * The chosen legend of the bicycle infrastructure: the groups, then what the shapes mean (a line at the road's edge,
 * the kerb lines of a sidepath, the dotted side, the sign). Shown for the lens and for the editor's look without a lens.
 * A getter per text, so it is read in the page's language.
 */
export const bikeLegend: LensLegend = {
  get entries(): LensLegendEntry[] {
    return [
      ...GROUPS.map((group): LensLegendEntry => ({
        label: groupLabel(group.id),
        color: group.colour,
        casing: true,
        ...(group.dashed ? { dash: DASH } : {}),
      })),
      { label: m.legend_on_road(), color: '#0098f0', road: true },
      { label: m.legend_sidepath(), color: '#174ed9', casing: true, kerbs: true },
      { label: m.legend_separate(), color: '#174ed9', width: 1.5, dash: [1, 2], road: true },
      { label: m.legend_sign(), color: '#174ed9', casing: true, sign: true },
    ]
  },
  get note() {
    return m.legend_note()
  },
}

export const bikeInfrastructureLens: Lens = {
  id: BIKE_LENS_ID,
  get name() {
    return m.lens_name()
  },
  get description() {
    return m.lens_description()
  },
  legend: bikeLegend,
  geometry: ['line', 'area'],
  rest: 'dim',
  // roads and paths keep their own look: the lens only dims everything else, the lines are the map content's.
  // Buildings keep theirs too: dimmed to a quarter they vanish on aerial imagery (as in the parking lens).
  rules: [
    { match: { building: true }, opacity: 1 },
    { match: { highway: true }, opacity: 1 },
  ],
}

/** What the lenses panel says about the bicycle editor's look without a lens (`lenses({ defaultLook })`) */
export const bikeDefaultLook = {
  get description() {
    return m.default_description()
  },
  legend: bikeLegend,
}

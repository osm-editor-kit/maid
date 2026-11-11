/**
 * The look of the bicycle infrastructure on the map: every TILDA category (`@tilda-geo/bicycle-infrastructure`) belongs to
 * one group, and a group has one colour and dash. Pure data, read by the layers (layers.ts), the legend (lens.ts) and
 * the tests.
 *
 * The colours follow tilda-geo's map styles "Führungsform einfach" and "Führungsform detailliert"
 * (`bikelanes_default.ts`, `bikelanes_details.ts`), cut down to one rule: **blue** is infrastructure for bicycles alone
 * (dark blue when it is built apart from motor traffic, light blue on the carriageway, dashed when shared with motor
 * vehicles), **pink** is infrastructure shared with people on foot (solid for a foot and cycle path, dashed for a
 * footway or pedestrian area where bicycles are allowed). Purple and dashed is what TILDA cannot classify. The
 * subcategories (`_adjoining`, `_isolated`, `_advisory`, ...) keep the look of their category; layers.ts adds a marker
 * for some of them (a sidepath, a road that has a separately mapped cycleway).
 */
import { CATEGORY_DEFINITIONS } from '@tilda-geo/bicycle-infrastructure'

export type GroupId =
  | 'separated'
  | 'lane'
  | 'sharedMotor'
  | 'footSegregated'
  | 'footShared'
  | 'footwayBicycle'
  | 'needsClarification'

export type Group = {
  id: GroupId
  colour: string
  dashed: boolean
  /** The TILDA categories of the group, subcategories included */
  categories: readonly string[]
}

/** In the order of the legend: bicycles alone first, then with people on foot, then the unclear */
export const GROUPS: readonly Group[] = [
  {
    id: 'separated',
    colour: '#174ed9',
    dashed: false,
    categories: [
      'cycleway_adjoining',
      'cycleway_isolated',
      'cycleway_adjoiningOrIsolated',
      'cyclewayOnHighwayProtected',
      'bicycleRoad',
    ],
  },
  {
    id: 'lane',
    colour: '#0098f0',
    dashed: false,
    categories: [
      'cyclewayOnHighway_exclusive',
      'cyclewayOnHighway_advisory',
      'cyclewayOnHighway_advisoryOrExclusive',
      'cyclewayOnHighwayBetweenLanes',
      'cyclewayLink',
      'crossing',
    ],
  },
  {
    id: 'sharedMotor',
    colour: '#0098f0',
    dashed: true,
    categories: [
      'sharedMotorVehicleLane',
      'bicycleRoad_vehicleDestination',
      'sharedBusLaneBusWithBike',
      'sharedBusLaneBikeWithBus',
    ],
  },
  {
    id: 'footSegregated',
    colour: '#c026d3',
    dashed: false,
    categories: [
      'footAndCyclewaySegregated_adjoining',
      'footAndCyclewaySegregated_isolated',
      'footAndCyclewaySegregated_adjoiningOrIsolated',
    ],
  },
  {
    id: 'footShared',
    colour: '#e949ac',
    dashed: false,
    categories: [
      'footAndCyclewayShared_adjoining',
      'footAndCyclewayShared_isolated',
      'footAndCyclewayShared_adjoiningOrIsolated',
    ],
  },
  {
    id: 'footwayBicycle',
    colour: '#f08ed5',
    dashed: true,
    categories: [
      'footwayBicycleYes_adjoining',
      'footwayBicycleYes_isolated',
      'footwayBicycleYes_adjoiningOrIsolated',
      'pedestrianAreaBicycleYes',
    ],
  },
  {
    id: 'needsClarification',
    colour: '#a97bea',
    dashed: true,
    categories: ['needsClarification'],
  },
]

/** Categories that say there is no bicycle infrastructure here (or that it is mapped as a way of its own) */
export const NO_INFRASTRUCTURE = ['data_no', 'separate_geometry', 'not_expected'] as const

const BY_CATEGORY = new Map<string, Group>(
  GROUPS.flatMap((group) => group.categories.map((category) => [category, group] as const)),
)

/** The group of a TILDA category, undefined for the categories without infrastructure */
export function groupOf(category: string): Group | undefined {
  return BY_CATEGORY.get(category)
}

/** Every category TILDA can give, from the package: the tests check that each one has a group or is no infrastructure */
export const ALL_CATEGORIES: readonly string[] = CATEGORY_DEFINITIONS.map(
  (definition) => definition.id,
)

/** The subcategory part of an id: `adjoining`, `isolated`, `adjoiningOrIsolated`, `advisory`, ...; undefined for none */
export function subcategoryOf(category: string): string | undefined {
  const at = category.indexOf('_')
  return at === -1 ? undefined : category.slice(at + 1)
}

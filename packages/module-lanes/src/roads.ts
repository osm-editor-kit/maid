/**
 * Which ways have lanes: roads for motor traffic. Residential roads, living streets and service roads count, but a
 * missing lane tag on them is no gap (most have no markings), so the lens shows them muted.
 */
export const MAIN_ROADS = [
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'road',
  'busway',
]
export const MINOR_ROADS = ['residential', 'living_street', 'service']
export const LANE_ROADS = [...MAIN_ROADS, ...MINOR_ROADS]

/** True for a way the lanes section is shown on */
export function isLaneRoad(tags: Readonly<Record<string, string | undefined>>): boolean {
  const highway = tags.highway
  return highway !== undefined && LANE_ROADS.includes(highway)
}

/** Keys that hold more than a count: a value per lane */
export const RICH_KEYS = [
  'turn:lanes',
  'turn:lanes:forward',
  'turn:lanes:backward',
  'turn:lanes:both_ways',
  'width:lanes',
  'width:lanes:forward',
  'width:lanes:backward',
  'bus:lanes',
  'bus:lanes:forward',
  'bus:lanes:backward',
  'psv:lanes',
  'psv:lanes:forward',
  'psv:lanes:backward',
  'bicycle:lanes',
  'bicycle:lanes:forward',
  'bicycle:lanes:backward',
  'vehicle:lanes',
  'vehicle:lanes:forward',
  'vehicle:lanes:backward',
  'access:lanes',
  'access:lanes:forward',
  'access:lanes:backward',
]

import { OsmNode, OsmWay, actionReverse } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import type { Tags } from '../tags.ts'
import type { Fix, Issue, Rule, RuleContext } from '../types.ts'

// Ported from iD's impossible_oneway (ISC, © iD contributors), at commit 0194f3926. iD's way methods
// isOneWay() and isOneWayBackwards() check the tag dictionaries, not the schema's rulesets, so the
// dictionaries are copied here: a headless validation has no schema loaded. The check that a node's
// tile is loaded is left out: every node in the graph is loaded. The "continue drawing" fix is not
// here, because it opens a draw mode and is not a model action.

type Dictionary = ReadonlyMap<string, ReadonlySet<string>>

/** iD's osmOneWayForwardTags, osmOneWayBackwardTags and osmOneWayBiDirectionalTags, merged */
const oneWayValues: Dictionary = new Map(
  [
    [
      'aerialway',
      [
        'chair_lift',
        'drag_lift',
        'j-bar',
        'magic_carpet',
        'mixed_lift',
        'platter',
        'rope_tow',
        't-bar',
        'zip_line',
      ],
    ],
    ['conveying', ['forward', 'backward', 'reversible']],
    ['highway', ['motorway']],
    ['junction', ['circular', 'roundabout']],
    ['man_made', ['goods_conveyor', 'piste:halfpipe']],
    ['oneway', ['yes', '-1', 'alternating', 'reversible']],
    ['piste:type', ['downhill', 'sled', 'yes']],
    [
      'seamark:type',
      ['two-way_route', 'recommended_traffic_lane', 'separation_lane', 'separation_roundabout'],
    ],
    [
      'waterway',
      [
        'canal',
        'ditch',
        'drain',
        'fish_pass',
        'flowline',
        'pressurised',
        'river',
        'spillway',
        'stream',
        'tidal_channel',
      ],
    ],
  ].map(([key, values]) => [key as string, new Set(values as string[])]),
)

/** iD's osmOneWayBackwardTags */
const backwardValues: Dictionary = new Map([
  ['conveying', new Set(['backward'])],
  ['oneway', new Set(['-1'])],
])

/** iD's osmRoutableHighwayTagValues */
export const routableHighways: ReadonlySet<string> = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
  'unclassified',
  'road',
  'service',
  'track',
  'living_street',
  'bus_guideway',
  'busway',
  'path',
  'footway',
  'cycleway',
  'bridleway',
  'pedestrian',
  'corridor',
  'steps',
  'ladder',
])

/** iD's osmFlowingWaterwayTagValues */
const flowingWaterways: ReadonlySet<string> = new Set([
  'canal',
  'ditch',
  'drain',
  'fish_pass',
  'flowline',
  'river',
  'stream',
  'tidal_channel',
  'pressurised',
])

/** Tags that imply oneway-ness of a highway are not counted for one: iD's ignoreNonHighwayKeys */
const ignoreNonHighwayKeys: ReadonlySet<string> = new Set([
  'piste:type',
  'aerialway',
  'man_made',
  'seamark:type',
  'waterway',
])

type WayType = 'highway' | 'waterway'

/** Whether a tag has a value in the dictionary, ignoring the keys given (as iD's utilCheckTagDictionary) */
function hasValue(
  tags: Tags,
  dictionary: Dictionary,
  ignored: ReadonlySet<string> = new Set(),
): boolean {
  return Object.entries(tags).some(
    ([key, value]) =>
      !ignored.has(key) && value !== undefined && dictionary.get(key)?.has(value) === true,
  )
}

/** iD's OsmWay.isOneWay: `oneway=no` is never one-way */
function isOneWay(tags: Tags): boolean {
  return tags.oneway !== 'no' && hasValue(tags, oneWayValues)
}

/** iD's OsmWay.isOneWayBackwards */
function isOneWayBackwards(tags: Tags): boolean {
  return tags.oneway !== 'no' && hasValue(tags, backwardValues)
}

/** iD's typeForWay: a highway first, then a flowing waterway, only for lines */
function typeOf(way: OsmWay, graph: Graph): WayType | undefined {
  if (way.geometry(graph) !== 'line') return undefined
  if (way.tags.highway !== undefined && routableHighways.has(way.tags.highway)) return 'highway'
  if (way.tags.waterway !== undefined && flowingWaterways.has(way.tags.waterway)) return 'waterway'
  return undefined
}

/** A node that occurs twice in a way, a loop at that node */
function occursMoreThanOnce(way: OsmWay, nodeId: string): boolean {
  return way.nodes.filter((id) => id === nodeId).length > 1
}

/** Entrances, parking entrances, springs and drains, and other roads or waterbodies at the node */
function isConnectedViaOtherTypes(
  way: OsmWay,
  node: OsmNode,
  type: WayType,
  graph: Graph,
): boolean {
  if (type === 'highway') {
    if (node.tags.entrance !== undefined && node.tags.entrance !== 'no') return true
    if (node.tags.amenity === 'parking_entrance') return true
  } else if (node.id === way.first()) {
    // Several waterways may start at the same spring
    if (node.tags.natural === 'spring') return true
  } else if (node.tags.manhole === 'drain') {
    // Several waterways may end at the same drain
    return true
  }

  return graph.parentWays(node).some((parent) => {
    if (parent.id === way.id) return false
    if (type === 'waterway') {
      // Several waterways may start or end at a water body at the same node
      return parent.tags.natural === 'water' || parent.tags.natural === 'coastline'
    }
    // Highway areas, ferry routes and routable multipolygons connect a road
    if (parent.geometry(graph) === 'area' && isRoutable(parent.tags.highway)) return true
    if (parent.tags.route === 'ferry') return true
    return graph
      .parentRelations(parent)
      .some(
        (relation) =>
          (relation.tags.type === 'route' && relation.tags.route === 'ferry') ||
          (relation.isMultipolygon() && isRoutable(relation.tags.highway)),
      )
  })
}

function isRoutable(value: string | undefined): boolean {
  return value !== undefined && routableHighways.has(value)
}

/** The way reversed, when the ways it meets point the other way: the fix iD offers first */
function reverseFix(wayId: string): Fix {
  return {
    id: 'reverse_feature',
    label: 'Reverse this feature',
    annotation: 'Reversed a line.',
    actions: () => [actionReverse(wayId)],
  }
}

/**
 * The issue at one end of a one-way way, or `undefined` when that end is connected: a road or
 * waterway meets other features of its kind that take the flow away from the end, or it is an
 * entrance, a spring, a drain or a water body.
 */
function issueAt(
  way: OsmWay,
  nodeId: string,
  type: WayType,
  context: RuleContext,
): Issue | undefined {
  const graph = context.graph
  // The start of the way, unless it is drawn backwards
  const isFirst = (nodeId === way.first()) !== isOneWayBackwards(way.tags)
  if (occursMoreThanOnce(way, nodeId)) return undefined

  const node = graph.hasEntity(nodeId)
  if (!(node instanceof OsmNode)) return undefined
  if (isConnectedViaOtherTypes(way, node, type, graph)) return undefined

  // Ways of the same kind at the node, without this way
  const sameType = graph
    .parentWays(node)
    .filter((parent) => parent.id !== way.id && typeOf(parent, graph) === type)
  // Waterways may start or end on their own
  if (type === 'waterway' && sameType.length === 0) return undefined

  // Connected to a feature that is not one-way: that is not an impossible one-way
  const oneways = sameType.filter((parent) => isOneWay(parent.tags))
  if (oneways.length < sameType.length) return undefined

  // A one-way that leads away from this node, or the same end of a way that comes back to it
  const connected = oneways.some((other) => {
    const endpoint = isFirst !== isOneWayBackwards(other.tags) ? other.first() : other.last()
    return endpoint !== nodeId || occursMoreThanOnce(other, nodeId)
  })
  if (connected) return undefined

  const name = way.tags.name || 'This feature'
  const placement = isFirst ? 'start' : 'end'
  const message =
    type === 'waterway'
      ? `${name} ${isFirst ? 'flows away from' : 'flows against'} a connected waterway`
      : `${name} ${isFirst ? 'is unreachable' : 'has no outlet'}`
  const loc = node.loc as [number, number]

  return {
    id: `impossible_oneway:${way.id}:${node.id}`,
    rule: 'impossible_oneway',
    severity: 'warning',
    message,
    entityIds: [way.id, node.id],
    loc,
    fixes: oneways.length > 0 ? [reverseFix(way.id)] : [],
    data: { type, placement },
  }
}

/**
 * A one-way road or waterway whose start or end leads nowhere (a road that is unreachable or has
 * no outlet), or a waterway that flows against or away from the waterways it meets. The issue is
 * about the way and the node at its end. The fix reverses the way, when the ways it meets point
 * the other way.
 */
export const impossibleOneway: Rule = {
  id: 'impossible_oneway',
  label: 'Impossible one-ways',
  validate(entity: OsmEntity, context: RuleContext): Issue[] {
    if (!(entity instanceof OsmWay)) return []
    const graph = context.graph
    if (entity.geometry(graph) !== 'line' || entity.isClosed()) return []
    const type = typeOf(entity, graph)
    if (!type || !isOneWay(entity.tags)) return []
    // A highway is one-way by its own tags, not by a tag that another feature (a lift, a piste) implies
    if (type === 'highway') {
      const strict = Object.fromEntries(
        Object.entries(entity.tags).filter(([key]) => !ignoreNonHighwayKeys.has(key)),
      )
      if (!hasValue(strict, oneWayValues)) return []
    }

    const ends = [entity.first(), entity.last()]
    return ends.flatMap((nodeId) => {
      const issue = nodeId ? issueAt(entity, nodeId, type, context) : undefined
      return issue ? [issue] : []
    })
  },
}

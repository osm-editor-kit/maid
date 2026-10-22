import { levelsOf } from '@osm-editor-kit/maid-levels'
import { OsmWay, actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import type { Rule } from '../types.ts'

export const STAIRS_LEVEL_MISSING_RULE_ID = 'stairs_level_missing'
export const STAIRS_LEVEL_UNREACHED_RULE_ID = 'stairs_level_unreached'

type Tags = Readonly<Record<string, string>>

/** Footways that can carry an incline, a ramp or a conveyor */
const PEDESTRIAN_HIGHWAYS = new Set(['footway', 'path', 'pedestrian'])

/** Indoor features that are not connectors: a corridor and a room hold one level, an area is a region */
const NOT_CONNECTOR_INDOOR = new Set(['corridor', 'room', 'area'])

/**
 * Steps, a conveyor, a ramp, or an incline on a footway or path: the ways that take people from one level to
 * another. Never a corridor, a room, an area or a road.
 */
function isConnector(tags: Tags) {
  if (tags.highway === 'corridor' || tags.area === 'yes') return false
  if (tags.indoor !== undefined && NOT_CONNECTOR_INDOOR.has(tags.indoor)) return false
  if (tags.highway === 'steps') return true
  // A road, or any other highway that is not a footway, path or pedestrian way, is never a connector
  if (tags.highway !== undefined && !PEDESTRIAN_HIGHWAYS.has(tags.highway)) return false
  if (tags.conveying !== undefined || tags.ramp === 'yes') return true
  return tags.incline !== undefined && tags.highway !== undefined
}

/**
 * The levels of the other ways that meet a node. Connectors are left out: their level is what the rules decide,
 * so a connector that meets another connector must not count the other one's level as a fact.
 */
function levelsAt(graph: Graph, nodeId: string, connector: OsmWay): number[] {
  const node = graph.hasEntity(nodeId)
  if (!node) return []
  const levels = new Set<number>()
  for (const parent of graph.parentWays(node)) {
    if (parent.id === connector.id || isConnector(parent.tags)) continue
    for (const level of levelsOf(parent.tags).levels) levels.add(level)
  }
  return [...levels].sort((a, b) => a - b)
}

/** The first and the last node of a way, or undefined when it has fewer than two nodes */
function endsOf(way: OsmWay): [string, string] | undefined {
  const first = way.nodes[0]
  const last = way.nodes[way.nodes.length - 1]
  if (way.nodes.length < 2 || first === undefined || last === undefined) return undefined
  return [first, last]
}

/**
 * A connector with one level or none, whose first node touches other ways on one level `a` and whose last node
 * touches other ways on one level `b`, `a` not `b`: the steps connect two levels, so they should say so. The fix
 * sets `level=min;max` and `incline` (up when the way climbs from `a` to `b`, down otherwise).
 */
export const stairsLevelMissing: Rule = {
  id: STAIRS_LEVEL_MISSING_RULE_ID,
  label: 'Stairs level missing',
  validate(entity, context) {
    if (!(entity instanceof OsmWay) || !isConnector(entity.tags)) return []
    if (levelsOf(entity.tags).levels.length > 1) return []
    const ends = endsOf(entity)
    if (!ends) return []
    const atFirst = levelsAt(context.graph, ends[0], entity)
    const atLast = levelsAt(context.graph, ends[1], entity)
    const [a] = atFirst
    const [b] = atLast
    if (atFirst.length !== 1 || atLast.length !== 1 || a === undefined || b === undefined) return []
    if (a === b) return []

    const low = Math.min(a, b)
    const high = Math.max(a, b)
    const level = `${low};${high}`
    const incline = a < b ? 'up' : 'down'
    const name = entity.tags.name ?? 'Steps'
    const current = entity.tags.level ?? 'none'
    return [
      {
        id: `${STAIRS_LEVEL_MISSING_RULE_ID}:${entity.id}`,
        rule: STAIRS_LEVEL_MISSING_RULE_ID,
        severity: 'warning',
        message: `${name} connect level ${a} and ${b} but have level=${current}`,
        entityIds: [entity.id],
        fixes: [
          {
            id: `set_stairs_level:${level}`,
            label: `Set level=${level}`,
            annotation: `Set level=${level} and incline=${incline}`,
            actions(graph: Graph) {
              const latest = graph.hasEntity(entity.id)
              if (!latest) return []
              return [actionChangeTags(entity.id, { ...latest.tags, level, incline })]
            },
          },
        ],
      },
    ]
  },
}

/**
 * A connector with two or more levels of which some level is reached by neither end: no other way at either end
 * has that level. Nothing to fix by itself, the person has to look at the connection.
 */
export const stairsLevelUnreached: Rule = {
  id: STAIRS_LEVEL_UNREACHED_RULE_ID,
  label: 'Stairs level unreached',
  validate(entity, context) {
    if (!(entity instanceof OsmWay) || !isConnector(entity.tags)) return []
    const levels = levelsOf(entity.tags).levels
    if (levels.length < 2) return []
    const ends = endsOf(entity)
    if (!ends) return []
    const reached = new Set([
      ...levelsAt(context.graph, ends[0], entity),
      ...levelsAt(context.graph, ends[1], entity),
    ])
    // stairs whose ends touch no level at all are not mapped into their surroundings yet: nothing to compare
    if (reached.size === 0) return []
    const name = entity.tags.name ?? 'Steps'
    return levels
      .filter((level) => !reached.has(level))
      .map((level) => ({
        id: `${STAIRS_LEVEL_UNREACHED_RULE_ID}:${entity.id}:${level}`,
        rule: STAIRS_LEVEL_UNREACHED_RULE_ID,
        severity: 'warning' as const,
        message: `${name} do not reach level ${level}`,
        entityIds: [entity.id],
        fixes: [],
      }))
  },
}

/**
 * Whether a vertex is a junction where turns can be restricted. Its own small file: the module's entry asks this for
 * every selected node, and the sketch and the click cycle stay in the section's lazy chunk.
 */
import { OsmNode, type Graph } from '@osm-editor-kit/maid-model'

/**
 * The highways that turn restrictions are about: the list of `isRoad` in the model's `osmIntersection` (iD's
 * `osm/intersection.js`), which keeps it to itself. Paths, footways and cycleways are not in it.
 */
const ROADS: ReadonlySet<string> = new Set([
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
  'residential',
  'unclassified',
  'living_street',
  'service',
  'busway',
  'road',
  'track',
])

/**
 * A junction is a vertex that three or more road arms leave. iD shows its restrictions field when the intersection
 * has more than two ways after it split them at the vertex, so a road that passes through counts as two arms: a side
 * road that meets a through road is a junction, although the vertex has only two ways.
 */
export function isJunction(graph: Graph, id: EntityID): boolean {
  const node = graph.hasEntity(id)
  if (!(node instanceof OsmNode)) return false
  let arms = 0
  for (const way of graph.parentWays(node)) {
    if (!ROADS.has(way.tags.highway ?? '') || way.isArea() || way.isDegenerate()) continue
    const last = way.nodes.length - 1
    way.nodes.forEach((nodeID, index) => {
      if (nodeID !== id) return
      if (index > 0) arms += 1
      if (index < last) arms += 1
    })
    if (arms > 2) return true
  }
  return false
}

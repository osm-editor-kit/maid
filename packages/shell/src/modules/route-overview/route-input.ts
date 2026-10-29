import type { Graph, OsmRelation } from '@osm-editor-kit/maid-model'
import { OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { LonLat, RouteInput } from '@osm-editor-kit/maid-route-analysis'

/**
 * The plain data the route analysis reads, from the graph as it is now (unsaved edits included): the members, the
 * node lists of the loaded member ways, the positions of their nodes and of node members, the tags of loaded
 * members, and for each node of a member way how many ways that are not members use it (junctions with the loaded
 * network). Members that are not in the graph are left out of `ways` and `nodes`, so the analysis lists them as not
 * loaded.
 */
export function routeInputOf(graph: Graph, relation: OsmRelation): RouteInput {
  const ways = new Map<string, readonly string[]>()
  const nodes = new Map<string, LonLat>()
  const memberTags = new Map<string, Readonly<Record<string, string>>>()
  const outsideWays = new Map<string, number>()
  const memberIds = new Set(relation.members.map((member) => member.id))
  const position = (id: string) => {
    if (nodes.has(id)) return
    const node = graph.hasEntity(id)
    const loc = node instanceof OsmNode ? node.loc : undefined
    if (loc) nodes.set(id, [loc[0], loc[1]])
  }
  for (const member of relation.members) {
    const entity = graph.hasEntity(member.id)
    if (!entity) continue
    if (Object.keys(entity.tags).length > 0) memberTags.set(member.id, entity.tags)
    if (entity instanceof OsmWay) {
      ways.set(member.id, entity.nodes)
      for (const id of entity.nodes) position(id)
    } else if (entity instanceof OsmNode) position(member.id)
  }
  for (const nodeIds of ways.values()) {
    for (const id of nodeIds) {
      if (outsideWays.has(id)) continue
      const node = graph.hasEntity(id)
      if (!node) continue
      let outside = 0
      for (const parent of graph.parentWays(node)) if (!memberIds.has(parent.id)) outside++
      outsideWays.set(id, outside)
    }
  }
  return {
    tags: relation.tags,
    members: relation.members.map((member) => ({
      type: member.type,
      id: member.id,
      role: member.role,
    })),
    ways,
    nodes,
    memberTags,
    outsideWays,
  }
}

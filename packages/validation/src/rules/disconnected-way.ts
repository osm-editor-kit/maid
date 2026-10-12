import { OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { deleteFeatureFix } from '../fixes.ts'
import { isRoutableHighway } from '../tags.ts'
import type { Issue, Rule } from '../types.ts'

/** Routable ways: a routable highway, a ferry route, or a highway multipolygon or ferry relation */
function isRoutableWay(way: OsmWay, graph: Graph, ignoreInnerWays: boolean): boolean {
  if (isRoutableHighway(way.tags.highway) || way.tags.route === 'ferry') return true
  return graph.parentRelations(way).some((relation) => {
    if (relation.tags.type === 'route' && relation.tags.route === 'ferry') return true
    return (
      relation.isMultipolygon() &&
      isRoutableHighway(relation.tags.highway) &&
      (!ignoreInnerWays || relation.memberById(way.id)?.role !== 'inner')
    )
  })
}

/** Elevators are features of their own in the routing network */
function isRoutableNode(node: OsmNode): boolean {
  return node.tags.highway === 'elevator'
}

/** Entrances (not `entrance=no`) and parking entrances connect a route to the wider network */
function isConnectedVertex(vertex: OsmNode): boolean {
  if (vertex.tags.entrance && vertex.tags.entrance !== 'no') return true
  return vertex.tags.amenity === 'parking_entrance'
}

/**
 * Rapid's flood fill over shared nodes. Returns the island around the entity, or `undefined` when
 * the entity is not routable or the island reaches the rest of the network. The rest of the
 * network is a connected vertex (entrance, parking entrance) or a routable way that this run does
 * not validate: a road that was not changed is part of the network, not a loose island.
 */
function routingIslandOf(
  entity: OsmEntity,
  graph: Graph,
  validated: ReadonlySet<string>,
): Map<string, OsmEntity> | undefined {
  const island = new Map<string, OsmEntity>()
  const waysToCheck: OsmWay[] = []

  // False when a parent way reaches the rest of the network
  const queueParentWays = (node: OsmNode): boolean => {
    for (const parent of graph.parentWays(node)) {
      if (island.has(parent.id) || !isRoutableWay(parent, graph, false)) continue
      if (!validated.has(parent.id)) return false
      island.set(parent.id, parent)
      waysToCheck.push(parent)
    }
    return true
  }

  if (entity instanceof OsmWay && isRoutableWay(entity, graph, true)) {
    island.set(entity.id, entity)
    waysToCheck.push(entity)
  } else if (entity instanceof OsmNode && isRoutableNode(entity)) {
    island.set(entity.id, entity)
    if (!queueParentWays(entity)) return undefined
  } else {
    return undefined
  }

  for (let way = waysToCheck.pop(); way; way = waysToCheck.pop()) {
    for (const vertexId of way.nodes) {
      const vertex = graph.hasEntity(vertexId)
      if (!(vertex instanceof OsmNode)) continue
      if (isConnectedVertex(vertex)) return undefined
      if (isRoutableNode(vertex)) island.set(vertex.id, vertex)
      if (!queueParentWays(vertex)) return undefined
    }
  }
  return island
}

/**
 * Routable features that form an island with no link to the rest of the network. The island is
 * made of validated ways only: an island that reaches a way this run does not validate is part of
 * the network. The message is about the entity validated. A single feature gets "Delete this feature"; a group gets no fix,
 * because the person has to connect it by hand.
 */
export const disconnectedWay: Rule = {
  id: 'disconnected_way',
  label: 'Disconnected roads',
  validate(entity, context): Issue[] {
    const island = routingIslandOf(entity, context.graph, context.validated)
    if (!island) return []

    const members = [...island.values()]
    const others = members
      .map((member) => member.id)
      .filter((id) => id !== entity.id)
      .sort()
    const entityIds = [entity.id, ...others]
    const name = entity.tags.name

    return [
      {
        id: `disconnected_way:${[...entityIds].sort().join(',')}`,
        rule: 'disconnected_way',
        severity: 'warning',
        message: `${name || 'This road'} is not connected to other roads`,
        entityIds,
        fixes: members.length === 1 ? [deleteFeatureFix(entity)] : [],
      },
    ]
  },
}

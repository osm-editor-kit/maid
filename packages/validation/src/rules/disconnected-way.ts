import { OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { deleteFeatureFix } from '../fixes.ts'
import { isRoutableHighway } from '../tags.ts'
import type { Rule, RuleContext } from '../types.ts'

// Ported from iD's disconnected_way (ISC, © iD contributors), at commit 0194f3926, with Maid's
// rule that a feature the run does not validate is part of the network.

/** Aerialways connect for the routing network, except `aerialway=no` and `goods` */
function isAerialway(way: OsmWay) {
  const value = way.tags.aerialway
  return value !== undefined && value !== 'no' && value !== 'goods'
}

/** Routable ways: a routable highway, a ferry route, or an aerialway (iD #9406) */
function isRoutableWay(way: OsmWay, graph: Graph) {
  if (isRoutableHighway(way.tags.highway) || way.tags.route === 'ferry') return true
  if (isAerialway(way)) return true
  return graph
    .parentRelations(way)
    .some((relation) => relation.tags.type === 'route' && relation.tags.route === 'ferry')
}

/** A multipolygon whose type is a routable highway: the area is the road, not its outer way */
function isRoutableRelation(relation: OsmRelation) {
  return relation.isMultipolygon() && isRoutableHighway(relation.tags.highway)
}

/** Golf paths (iD #11863) and aerialways are not checked by themselves, but still connect */
function shouldSkipAsEntity(way: OsmWay) {
  if (way.tags.golf === 'path' || way.tags.golf === 'cartpath') return true
  return way.tags.aerialway !== undefined && way.tags.aerialway !== ''
}

/** Elevators are features of their own in the routing network */
function isRoutableNode(node: OsmNode) {
  return node.tags.highway === 'elevator'
}

/** Entrances (not `entrance=no`) and parking entrances connect a route to the wider network */
function isConnectedVertex(vertex: OsmNode) {
  if (vertex.tags.entrance && vertex.tags.entrance !== 'no') return true
  return vertex.tags.amenity === 'parking_entrance'
}

/** The nodes that connect a way, or the outer ways of a multipolygon */
function verticesOf(item: OsmWay | OsmRelation, graph: Graph) {
  const ways: OsmWay[] = []
  if (item instanceof OsmWay) {
    ways.push(item)
  } else {
    for (const member of item.members) {
      if (member.type !== 'way' || member.role !== 'outer') continue
      const way = graph.hasEntity(member.id)
      if (way instanceof OsmWay) ways.push(way)
    }
  }
  const nodes: OsmNode[] = []
  for (const way of ways) {
    for (const nodeId of way.nodes) {
      const node = graph.hasEntity(nodeId)
      if (node instanceof OsmNode) nodes.push(node)
    }
  }
  return nodes
}

/**
 * Rapid's and iD's flood fill over shared nodes. Returns the island around the entity, or
 * `undefined` when the entity is not routable or the island reaches the rest of the network. The
 * rest of the network is a connected vertex (entrance, parking entrance) or a routable way or
 * multipolygon that this run does not validate: a road that was not changed is part of the network.
 */
function routingIslandOf(
  entity: OsmEntity,
  graph: Graph,
  validated: ReadonlySet<string>,
  island: Map<string, OsmEntity>,
) {
  const toCheck: Array<OsmWay | OsmRelation> = []

  // False when a parent way or multipolygon reaches the rest of the network
  const queueParents = (node: OsmNode) => {
    for (const parent of graph.parentWays(node)) {
      if (!island.has(parent.id) && isRoutableWay(parent, graph)) {
        if (!validated.has(parent.id)) return false
        island.set(parent.id, parent)
        toCheck.push(parent)
      }
      // A routable multipolygon counts even when its outer way is not routable by itself
      for (const relation of graph.parentRelations(parent)) {
        if (island.has(relation.id) || !isRoutableRelation(relation)) continue
        if (!validated.has(relation.id)) return false
        island.set(relation.id, relation)
        toCheck.push(relation)
      }
    }
    return true
  }

  if (entity instanceof OsmWay && isRoutableWay(entity, graph) && !shouldSkipAsEntity(entity)) {
    island.set(entity.id, entity)
    toCheck.push(entity)
  } else if (entity instanceof OsmRelation && isRoutableRelation(entity)) {
    island.set(entity.id, entity)
    toCheck.push(entity)
  } else if (entity instanceof OsmNode && isRoutableNode(entity)) {
    island.set(entity.id, entity)
    if (!queueParents(entity)) return undefined
  } else {
    return undefined
  }

  for (let item = toCheck.pop(); item; item = toCheck.pop()) {
    for (const vertex of verticesOf(item, graph)) {
      if (isConnectedVertex(vertex)) return undefined
      if (isRoutableNode(vertex)) island.set(vertex.id, vertex)
      if (!queueParents(vertex)) return undefined
    }
  }
  return island
}

/**
 * The island of a way, found once per run. Whether the flood from a road reaches the rest of the network
 * depends on the connected roads, not on the road: so every road the flood reached gets the same answer
 * (an island, or none), and a validation of a whole network floods each of its parts once, not once per road.
 * Ways that never start an island (golf paths, aerialways) are left out: they answer for themselves.
 */
function islandOfWay(entity: OsmEntity, context: RuleContext) {
  if (!(entity instanceof OsmWay))
    return routingIslandOf(entity, context.graph, context.validated, new Map())
  const key = `disconnected_way:${entity.id}`
  const known = context.memo.get(key)
  if (known === null) return undefined
  if (known instanceof Map) return known
  const reached = new Map<string, OsmEntity>()
  const island = routingIslandOf(entity, context.graph, context.validated, reached)
  const answer = island ?? null
  for (const member of reached.values()) {
    if (member instanceof OsmWay && shouldSkipAsEntity(member)) continue
    context.memo.set(`disconnected_way:${member.id}`, answer)
  }
  context.memo.set(key, answer)
  return island
}

/**
 * Routable features that form an island with no link to the rest of the network. The island is
 * made of validated features only: an island that reaches a feature this run does not validate is
 * part of the network. The issue is about the island, not about the entity the run started from: its
 * first entity, and the name in its message, are the island's lowest id, so the same island gives the
 * same issue whichever of its features is validated first. A single feature gets "Delete this
 * feature"; a group gets no fix, because the person has to connect it by hand.
 */
export const disconnectedWay: Rule = {
  id: 'disconnected_way',
  label: 'Disconnected roads',
  validate(entity, context) {
    const island = islandOfWay(entity, context)
    if (!island) return []

    const members = [...island.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const [lowest] = members
    if (!lowest) return []
    const entityIds = members.map((member) => member.id)
    const name = lowest.tags.name

    return [
      {
        id: `disconnected_way:${entityIds.join(',')}`,
        rule: 'disconnected_way',
        severity: 'warning',
        message: `${name || 'This road'} is not connected to other roads`,
        entityIds,
        fixes: members.length === 1 ? [deleteFeatureFix(lowest)] : [],
      },
    ]
  },
}

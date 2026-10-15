// The features that an on-demand check looks at, around the one the person selected: the feature itself, the
// ways it is in, the relations it and those ways are in, and, for a relation, its loaded members.
import { OsmRelation } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'

/** The most members of a relation that one check takes. More are left out, and the check says how many. */
export const ON_DEMAND_MEMBER_CAP = 500

export type Neighbourhood = {
  /** The ids to check: the feature first, then the others in the order they were found. Only loaded ones. */
  ids: string[]
  /** How many loaded members of a relation were left out by the cap. Zero for a feature that is not a relation. */
  omittedMembers: number
}

/**
 * The neighbourhood of one feature in `graph`, for an on-demand check. Only what the graph holds is named (nothing
 * is fetched). A feature that the graph does not hold has no neighbourhood.
 */
export function neighbourhoodOf(
  graph: Graph,
  entityId: string,
  options: { maxMembers?: number } = {},
): Neighbourhood {
  const entity = graph.hasEntity(entityId)
  if (!entity) return { ids: [], omittedMembers: 0 }
  const ids = new Set<string>([entityId])

  // the ways of a node, and the relations of the feature and of those ways
  const ways = [...graph.parentWays(entity)]
  for (const way of ways) ids.add(way.id)
  for (const relation of graph.parentRelations(entity)) ids.add(relation.id)
  for (const way of ways) for (const relation of graph.parentRelations(way)) ids.add(relation.id)

  // a relation: its loaded members, the first ones up to the cap
  let omittedMembers = 0
  if (entity instanceof OsmRelation) {
    const cap = options.maxMembers ?? ON_DEMAND_MEMBER_CAP
    const loaded = entity.members.filter((member) => graph.hasEntity(member.id) !== undefined)
    for (const member of loaded.slice(0, cap)) ids.add(member.id)
    omittedMembers = Math.max(0, loaded.length - cap)
  }

  return { ids: [...ids], omittedMembers }
}

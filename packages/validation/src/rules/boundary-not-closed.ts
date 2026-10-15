import { OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import { nodeLoc } from '../geo.ts'
import type { Issue, Rule } from '../types.ts'

// Maid's own check, after iD issue 8286 (a boundary whose outer ways do not close into rings). No iD code is ported:
// the check is the parity of the ends. Every node where a closed ring passes is the end of two ways (or of a closed
// way, which counts its first node twice), so a node that is the end of an odd number of outer ways is an open end.

/**
 * A boundary relation: `type=boundary` (the boundary=administrative ones included), or a multipolygon that carries a
 * `boundary` key, as the boundary renderers draw it.
 */
function isBoundary(relation: OsmRelation) {
  const type = relation.tags.type?.trim()
  return type === 'boundary' || (type === 'multipolygon' && relation.tags.boundary !== undefined)
}

/**
 * The open ends of the outer ways of a boundary: one warning per open end, at the end, with no fix. Only judged when
 * every outer member is a loaded way: an incomplete relation is not judged, as its ends may be in ways not loaded.
 * The issue names the relation, the node (when loaded) and the outer ways that end there.
 */
export const boundaryNotClosed: Rule = {
  id: 'boundary_not_closed',
  label: 'Boundary not closed',
  validate(entity, { graph }) {
    if (!(entity instanceof OsmRelation) || !isBoundary(entity)) return []

    const outers: OsmWay[] = []
    for (const member of entity.members) {
      if (member.role !== 'outer') continue
      const way = member.type === 'way' ? graph.hasEntity(member.id) : undefined
      if (!(way instanceof OsmWay) || way.nodes.length === 0) return []
      outers.push(way)
    }
    if (outers.length === 0) return []

    // the outer ways that end at each node; a closed way ends at its first node twice
    const endsAt = new Map<string, OsmWay[]>()
    for (const way of outers) {
      for (const node of [way.first(), way.last()]) {
        if (node === undefined) continue
        const ways = endsAt.get(node)
        if (ways) ways.push(way)
        else endsAt.set(node, [way])
      }
    }

    const issues: Issue[] = []
    for (const [node, ways] of endsAt) {
      if (ways.length % 2 === 0) continue
      const wayIds = [...new Set(ways.map((way) => way.id))]
      const nodeIsLoaded = graph.hasEntity(node) !== undefined
      const loc = nodeLoc(graph, node)
      issues.push({
        id: `boundary_not_closed:${entity.id}:${node}`,
        rule: 'boundary_not_closed',
        severity: 'warning',
        message: `The boundary ${entity.id} does not close at ${node}: the outer ways ${wayIds.join(', ')} end there unpaired`,
        entityIds: [entity.id, ...(nodeIsLoaded ? [node] : []), ...wayIds],
        ...(loc ? { loc } : {}),
        fixes: [],
        data: { node },
      } satisfies Issue)
    }
    return issues
  },
}

import { OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import { nodeLoc, touchPoints } from '../geo.ts'
import type { Issue, Rule } from '../types.ts'

// Maid's own check, after iD issue 11374 (a route whose ways do not join). `routeJoins` is the one place that decides
// where a route has a gap: the relations sidebar and the map use it too (packages/shell/src/modules/relations-logic.ts).

/** Roles of stop and platform members (also the PTv2 variants such as `stop_entry_only`): not part of a route's way chain */
const STOP_OR_PLATFORM_ROLE = /^(stop|platform)(_|$)/

/** How two consecutive way members join. `unknown` when one of them is not loaded (or has no nodes). */
export type RouteJoin = 'connected' | 'gap' | 'unknown'

/** Two loaded ways join when they share a node where they meet (their ends, or the nodes of a closed way) */
export function joinOf(a: OsmWay | undefined, b: OsmWay | undefined): RouteJoin {
  if (!a || !b || a.nodes.length === 0 || b.nodes.length === 0) return 'unknown'
  const atB = new Set(touchPoints(b))
  return touchPoints(a).some((node) => atB.has(node)) ? 'connected' : 'gap'
}

/**
 * For each pair of consecutive way members of a route (stops, platforms and node members are skipped), whether they
 * join. `index` is the position of the earlier member in `relation.members`. Only `type=route` is checked: other
 * relations, `route_master` included, give nothing.
 */
export function routeJoins(graph: Graph, relation: OsmRelation) {
  if (relation.tags.type?.trim() !== 'route') return []
  const chain: { index: number; way: OsmWay | undefined }[] = []
  relation.members.forEach((member, index) => {
    if (member.type !== 'way' || STOP_OR_PLATFORM_ROLE.test(member.role)) return
    const entity = graph.hasEntity(member.id)
    chain.push({ index, way: entity instanceof OsmWay ? entity : undefined })
  })
  const joins: {
    index: number
    before: OsmWay | undefined
    after: OsmWay | undefined
    join: RouteJoin
  }[] = []
  for (let i = 1; i < chain.length; i++) {
    const before = chain[i - 1]
    const after = chain[i]
    if (!before || !after) continue
    joins.push({
      index: before.index,
      before: before.way,
      after: after.way,
      join: joinOf(before.way, after.way),
    })
  }
  return joins
}

/** The point where two ways are closest, the midpoint of their two nearest ends: where the gap is shown */
function gapLocation(graph: Graph, a: OsmWay, b: OsmWay): [number, number] | undefined {
  let best: { distance: number; loc: [number, number] } | undefined
  for (const endA of [a.first(), a.last()]) {
    for (const endB of [b.first(), b.last()]) {
      const pa = endA === undefined ? undefined : nodeLoc(graph, endA)
      const pb = endB === undefined ? undefined : nodeLoc(graph, endB)
      if (!pa || !pb) continue
      const distance = (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2
      if (!best || distance < best.distance)
        best = { distance, loc: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2] }
    }
  }
  return best?.loc
}

/**
 * A route whose consecutive ways do not join: one warning per gap, at the gap, with no fix (the person joins the ways or
 * adds the missing way). Checked on the relation: the validator checks the parent relations of a changed way. A pair
 * with a member not loaded is not judged. The id has the two ways, not the index, so it stays when members move.
 */
export const routeGap: Rule = {
  id: 'route_gap',
  label: 'Route gap',
  validate(entity, { graph }) {
    if (!(entity instanceof OsmRelation)) return []
    const issues: Issue[] = []
    for (const { index, before, after, join } of routeJoins(graph, entity)) {
      if (join !== 'gap' || !before || !after) continue
      const loc = gapLocation(graph, before, after)
      issues.push({
        id: `route_gap:${entity.id}:${before.id}:${after.id}`,
        rule: 'route_gap',
        severity: 'warning',
        message: `The route ${entity.id} has a gap: ${before.id} and ${after.id} do not meet`,
        entityIds: [entity.id, before.id, after.id],
        ...(loc ? { loc } : {}),
        fixes: [],
        data: { index },
      } satisfies Issue)
    }
    return issues
  },
}

import { OsmNode, OsmRelation, OsmWay, actionDeleteRelation } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import { locationOf, touchPoints } from '../geo.ts'
import type { Fix, Issue, Rule } from '../types.ts'

// Maid's own check, after iD issue 9346 (a turn restriction whose members do not connect). iD has no such check here,
// so the rule is written from the wiki's definition: the from way and the to way each touch the via (a node, or ways),
// and every member is loaded and has one of the roles from, via, to.
//
// The structure (one from, one to unless no_entry or no_exit, at least one via, ways for from and to) is
// `isValidRestriction`, which `turn_restriction_incomplete` (module-turn-restrictions) reports as an error. This rule
// only looks at a relation that passes it, so one broken restriction is not reported twice. The one thing that
// `isValidRestriction` lets through and this rule reports: a no_entry or no_exit without any from or to way.

/** A member the edits deleted: still listed, but no longer in the graph. `isDeleted` tells it from one that is not loaded. */
function isDeleted(graph: Graph, id: string) {
  return graph.local.entities.has(id) && graph.local.entities.get(id) === undefined
}

/** Whether one of the via members (nodes, or ways) is where the way meets: its ends, or every node of a closed way */
function touchesVia(way: OsmWay, via: readonly (OsmNode | OsmWay)[]) {
  const ends = new Set(touchPoints(way))
  return via.some((member) =>
    member instanceof OsmNode
      ? ends.has(member.id)
      : member instanceof OsmWay && touchPoints(member).some((node) => ends.has(node)),
  )
}

/** Deletes the turn restriction, as one undo step. The members stay: they are the person's ways, and the parents are kept. */
function deleteRestrictionFix(relationId: string): Fix {
  return {
    id: 'delete_restriction',
    label: 'Delete the turn restriction',
    annotation: 'Deleted a turn restriction',
    // allowUntaggedMembers: the default would delete the untagged members of the restriction too
    actions: (graph) =>
      graph.hasEntity(relationId) instanceof OsmRelation
        ? [actionDeleteRelation(relationId, false, true)]
        : [],
  }
}

/**
 * A turn restriction that does not connect: a from or to way that does not touch the via, a member the edits deleted,
 * a member with another role, or a no_entry or no_exit without a from or to way. One warning per relation, listing the
 * problems. The fix (delete the restriction) is offered only when a from or to way was deleted: then it is clearly
 * right. A relation with a member not loaded is not judged.
 */
export const restrictionBroken: Rule = {
  id: 'restriction_broken',
  label: 'Broken turn restriction',
  validate(entity, { graph }) {
    if (!(entity instanceof OsmRelation)) return []
    if (!entity.isRestriction() || !entity.isValidRestriction()) return []

    const problems: string[] = []
    const deletedFromOrTo: string[] = []
    const loaded = new Map<string, OsmWay | OsmNode>()
    const from: OsmWay[] = []
    const via: (OsmWay | OsmNode)[] = []
    const to: OsmWay[] = []
    let froms = 0
    let tos = 0

    for (const member of entity.members) {
      const current = graph.hasEntity(member.id)
      if (!current) {
        if (!isDeleted(graph, member.id)) return [] // not loaded: not judged
        if (member.role === 'from' || member.role === 'to') {
          deletedFromOrTo.push(member.id)
          problems.push(`the ${member.role} way ${member.id} was deleted`)
        } else {
          problems.push(`the ${member.role || 'untagged'} member ${member.id} was deleted`)
        }
        if (member.role === 'from') froms++
        if (member.role === 'to') tos++
        continue
      }
      if (current instanceof OsmWay || current instanceof OsmNode) loaded.set(member.id, current)
      if (member.role === 'from') {
        froms++
        if (current instanceof OsmWay) from.push(current)
      } else if (member.role === 'to') {
        tos++
        if (current instanceof OsmWay) to.push(current)
      } else if (member.role === 'via') {
        if (current instanceof OsmWay || current instanceof OsmNode) via.push(current)
      } else {
        problems.push(`the member ${member.id} has the role "${member.role}", not from, via or to`)
      }
    }

    if (froms === 0) problems.push('it has no from way')
    if (tos === 0) problems.push('it has no to way')

    // every from and to way must meet the via; checked only when some via is loaded
    if (via.length > 0) {
      for (const way of [...from, ...to]) {
        if (!touchesVia(way, via)) problems.push(`the way ${way.id} does not touch the via`)
      }
    }

    if (problems.length === 0) return []

    const firstPlace = [...via, ...from, ...to]
      .map((member) => locationOf(member, graph))
      .find((loc) => loc !== undefined)
    const entityIds = [entity.id, ...loaded.keys()]
    return [
      {
        id: `restriction_broken:${entity.id}`,
        rule: 'restriction_broken',
        severity: 'warning',
        message: `The turn restriction ${entity.id} is broken: ${problems.join('; ')}`,
        entityIds,
        ...(firstPlace ? { loc: firstPlace } : {}),
        fixes: deletedFromOrTo.length > 0 ? [deleteRestrictionFix(entity.id)] : [],
        data: { problems },
      } satisfies Issue,
    ]
  },
}

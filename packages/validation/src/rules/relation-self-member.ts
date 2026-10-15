import { OsmRelation, actionDeleteMember } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import type { Fix, Issue, Rule } from '../types.ts'

// A relation that is its own member, directly or through sub relations: iD issue 7983, a relation that contains itself
// makes its members' extent and the relation's own rendering loop. iD has no rule with this name; the id is Maid's.
// Checked on the relation only: the validator checks the relations of every changed relation (`entitiesToValidate`).

const rule = 'relation_self_member'

/** How many relations a chain of sub relations is followed through. A route's chain is shorter than this. */
const MAX_DEPTH = 8

/** The membership at this index, when it is still the membership the issue is about */
function isMemberAt(graph: Graph, relationId: string, memberId: string, index: number) {
  const relation = graph.hasEntity(relationId)
  if (!(relation instanceof OsmRelation)) return false
  const member = relation.members[index]
  return member?.type === 'relation' && member.id === memberId
}

/**
 * Removes the membership, as missing_role's remove fix does: one undo step. A relation left with no member is deleted,
 * as iD's remove_from_relation does.
 */
function removeFix(relationId: string, memberId: string, index: number): Fix {
  return {
    id: 'remove_from_relation',
    label: 'Remove from relation',
    annotation: 'Removed a member from the relation',
    actions: (graph) =>
      isMemberAt(graph, relationId, memberId, index)
        ? // as iD's remove_from_relation: a relation left with no members is deleted
          [actionDeleteMember(relationId, index)]
        : [],
  }
}

/**
 * The relations from `relation` on to `target`, through sub relations, as their ids (the last one is `target`), or
 * undefined when no chain of at most MAX_DEPTH relations leads back. A relation that is not loaded ends a chain.
 */
function chainTo(
  graph: Graph,
  relation: OsmRelation,
  target: string,
  seen: Set<string>,
  depth: number,
): string[] | undefined {
  for (const member of relation.members) {
    if (member.type !== 'relation') continue
    if (member.id === target) return [member.id]
    if (depth >= MAX_DEPTH || seen.has(member.id)) continue
    seen.add(member.id)
    const sub = graph.hasEntity(member.id)
    if (!(sub instanceof OsmRelation)) continue
    const rest = chainTo(graph, sub, target, seen, depth + 1)
    if (rest) return [member.id, ...rest]
  }
  return undefined
}

/**
 * Relations that contain themselves. A direct membership has a fix that removes it. A chain through sub relations has
 * none: which membership of the chain is wrong is for the person to see, so the issue names the membership and stops.
 */
export const relationSelfMember: Rule = {
  id: rule,
  label: 'Relation contains itself',
  validate(entity, { graph }) {
    if (!(entity instanceof OsmRelation)) return []
    const issues: Issue[] = []
    entity.members.forEach((member, index) => {
      if (member.type !== 'relation') return
      const id = `${rule}:${entity.id}:${index}`
      if (member.id === entity.id) {
        issues.push({
          id,
          rule,
          severity: 'warning',
          message: `The relation ${entity.id} is a member of itself`,
          entityIds: [entity.id],
          fixes: [removeFix(entity.id, member.id, index)],
          data: { index },
        })
        return
      }
      const sub = graph.hasEntity(member.id)
      if (!(sub instanceof OsmRelation)) return
      const chain = chainTo(graph, sub, entity.id, new Set([entity.id, sub.id]), 1)
      if (!chain) return
      const through = [sub.id, ...chain].slice(0, -1)
      issues.push({
        id,
        rule,
        severity: 'warning',
        message: `The relation ${entity.id} contains itself through ${through.join(', ')}`,
        entityIds: [entity.id, sub.id],
        fixes: [],
        data: { index, chain: through },
      })
    })
    return issues
  },
}

import { OsmNode, OsmRelation, OsmWay, actionDeleteMembers } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { locationOf } from '../geo.ts'
import type { Fix, Issue, RelationRoles, Rule } from '../types.ts'

// Ported from iD's relation_members (ISC, © iD contributors), at PR 12994: only the duplicate_member subtype. iD's
// other subtypes (too_few, too_many, invalid_geometry, invalid_tags, wrong_role, role_not_allowed) are not ported.
// iD's "suggestion" severity is a warning here, because Maid's Severity has no suggestion.
// Needs the presets (`context.presets`): nothing until they are made, and nothing for a relation without a member schema.

type Member = OsmRelation['members'][number]

function kindOf(entity: OsmEntity) {
  if (entity instanceof OsmNode) return 'node'
  if (entity instanceof OsmWay) return 'way'
  return 'relation'
}

/** The indexes of the members of the relation that match, in order */
function indexesOf(
  graph: Graph,
  relationId: string,
  matches: (member: Member) => boolean,
): number[] {
  const relation = graph.hasEntity(relationId)
  if (!(relation instanceof OsmRelation)) return []
  const indexes: number[] = []
  relation.members.forEach((member, index) => {
    if (matches(member)) indexes.push(index)
  })
  return indexes
}

/**
 * Same role everywhere: one fix, which keeps the first membership and deletes the others. The indexes are worked out
 * on the graph the fix is chosen on, so an undo step is one change of the relation.
 */
function keepFirstFix(relationId: string, memberId: string): Fix {
  return {
    id: 'remove_from_relation',
    label: 'Remove from relation',
    annotation: 'Removed the duplicate members from the relation',
    actions: (graph) => {
      const indexes = indexesOf(graph, relationId, (member) => member.id === memberId).slice(1)
      return indexes.length > 0 ? [actionDeleteMembers(relationId, indexes)] : []
    },
  }
}

/** Different roles: one fix per role, which deletes the members with that role (iD's remove_from_relation_with_role) */
function removeRoleFix(
  relationId: string,
  memberId: string,
  role: string,
  label: string,
  count: number,
): Fix {
  return {
    id: `remove_role:${role}`,
    label: `Remove the "${label}" ${count === 1 ? 'member' : 'members'}`,
    annotation: 'Removed the duplicate members from the relation',
    actions: (graph) => {
      const indexes = indexesOf(
        graph,
        relationId,
        (member) => member.id === memberId && member.role === role,
      )
      return indexes.length > 0 ? [actionDeleteMembers(relationId, indexes)] : []
    },
  }
}

/**
 * The entities that are members of one relation more than once, as iD's validateDuplicateMembers: one issue per
 * entity. Its id has no index, so it stays the same when the members are removed.
 */
function duplicateIssues(relation: OsmRelation, roles: RelationRoles, graph: Graph): Issue[] {
  const issues: Issue[] = []
  const occurrences = new Map<string, Member[]>()
  for (const member of relation.members) {
    const list = occurrences.get(member.id) ?? []
    list.push(member)
    occurrences.set(member.id, list)
  }

  for (const [memberId, members] of occurrences) {
    if (members.length < 2) continue
    const entity = graph.hasEntity(memberId)
    const loc = entity ? locationOf(entity, graph) : undefined
    const subject = `The ${entity ? kindOf(entity) : 'member'} ${memberId}`
    const roleIds = [...new Set(members.map((member) => member.role))]
    const fixes =
      roleIds.length === 1
        ? [keepFirstFix(relation.id, memberId)]
        : roleIds.map((role) => {
            const label = roles[role]?.label || role || 'no role'
            const count = members.filter((member) => member.role === role).length
            return removeRoleFix(relation.id, memberId, role, label, count)
          })

    issues.push({
      id: `relation_members:duplicate_member:${memberId}:${relation.id}`,
      rule: 'relation_members',
      severity: 'warning',
      message: `${subject} is included multiple times in the relation ${relation.id}`,
      entityIds: [memberId, relation.id],
      ...(loc ? { loc } : {}),
      fixes,
      data: { subtype: 'duplicate_member', count: members.length, roles: roleIds },
    })
  }

  return issues
}

/**
 * Relation members that a relation's schema does not allow twice. Checked from both sides: an entity asks its parent
 * relations, and a relation checks itself.
 */
export const relationMembers: Rule = {
  id: 'relation_members',
  label: 'Relation members',
  validate(entity, { graph, presets }) {
    if (!presets) return []

    const relations = new Map<string, OsmRelation>()
    for (const relation of graph.parentRelations(entity)) relations.set(relation.id, relation)
    if (entity instanceof OsmRelation) relations.set(entity.id, entity)

    const issues: Issue[] = []
    for (const relation of relations.values()) {
      const roles = presets.relationRoles(relation.tags)
      if (Object.keys(roles).length === 0) continue
      if (presets.allowsDuplicateMembers(relation.tags)) continue
      issues.push(...duplicateIssues(relation, roles, graph))
    }
    return issues
  },
}

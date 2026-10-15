import {
  OsmNode,
  OsmRelation,
  OsmWay,
  actionChangeMember,
  actionDeleteMember,
} from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { locationOf } from '../geo.ts'
import type { Fix, Issue, PresetLookup, RelationRoles, Rule } from '../types.ts'

// Ported from iD's missing_role (ISC, © iD contributors), at PR 12990: a node or a way is checked against the
// relations it is a member of, and a relation against its members. The roles come from the relation's schema
// (`presets.relationRoles`); a fix offers the roles that are valid for the member's geometry and tags.
// A multipolygon without a member schema (presets without one, or no presets at all) keeps the roles it always had
// (outer and inner, with no geometry filter): that is the fallback. id-tagging-schema 7.3.0 has a schema for it.

/** A member without a role, or with only spaces as its role */
function isMissingRole(role: string | undefined) {
  return !role || role.trim().length === 0
}

function kindOf(entity: OsmEntity) {
  if (entity instanceof OsmNode) return 'node'
  if (entity instanceof OsmWay) return 'way'
  return 'relation'
}

/** The roles of a multipolygon when the presets give it none: outer and inner, valid for any member */
const multipolygonRoles: RelationRoles = {
  outer: { label: '', member: { role: 'outer' } },
  inner: { label: '', member: { role: 'inner' } },
}

/**
 * The roles a relation's members take, or undefined when no check applies: the relation has no schema (and is not a
 * multipolygon), or its schema allows the empty role. Without presets (not made yet), only a multipolygon is checked.
 */
function roleSchemaOf(
  relation: OsmRelation,
  presets: PresetLookup | undefined,
): RelationRoles | undefined {
  const roles = presets?.relationRoles(relation.tags) ?? {}
  if (Object.keys(roles).length === 0)
    return relation.isMultipolygon() ? multipolygonRoles : undefined
  if (Object.hasOwn(roles, '')) return undefined
  return roles
}

/**
 * The roles that fit this member: the schema's roles filtered by the presets, without a role whose `max` the
 * relation has reached already (as Kyle's relation validator); the multipolygon fallback as it is.
 */
function fittingRoles(
  member: OsmEntity,
  relation: OsmRelation,
  roles: RelationRoles,
  presets: PresetLookup | undefined,
  graph: Graph,
) {
  if (roles === multipolygonRoles || presets === undefined) return roles
  const fitting = presets.memberRoles(relation.tags, member.geometry(graph), member.tags)
  return Object.fromEntries(
    Object.entries(fitting).filter(([role, { member: rule }]) => {
      if (rule.max === undefined) return true
      const count = relation.members.filter((other) => other.role === role).length
      return count < rule.max
    }),
  )
}

/** The member at `index` of the relation, when it is still the member the issue is about */
function memberAt(graph: Graph, relationId: string, memberId: string, index: number) {
  const relation = graph.hasEntity(relationId)
  if (!(relation instanceof OsmRelation)) return undefined
  const member = relation.members[index]
  if (!member || member.id !== memberId) return undefined
  return { relation, member }
}

/** Sets the member's role, as iD's makeAddRoleFix: one undo step, the member keeps its type and id */
function setRoleFix(
  relationId: string,
  memberId: string,
  index: number,
  role: string,
  label: string,
): Fix {
  return {
    id: `set_role:${role}`,
    label: `Set as ${label}`,
    annotation: `Set the role of a member to ${label}`,
    actions: (graph) => {
      const found = memberAt(graph, relationId, memberId, index)
      if (!found) return []
      return [actionChangeMember(relationId, { ...found.member, role }, index)]
    },
  }
}

/** Removes the member from the relation, as iD's remove_from_relation */
function removeFix(relationId: string, memberId: string, index: number): Fix {
  return {
    id: 'remove_from_relation',
    label: 'Remove from relation',
    annotation: 'Removed a member from the relation',
    actions: (graph) => {
      if (!memberAt(graph, relationId, memberId, index)) return []
      return [actionDeleteMember(relationId, index)]
    },
  }
}

/** One issue per member that has no role: the role is needed. The fixes are the roles valid for the member, then removal. */
function makeIssue(
  member: OsmEntity,
  relation: OsmRelation,
  index: number,
  options: RelationRoles,
  graph: Graph,
) {
  const loc = locationOf(member, graph)
  const where = relation.isMultipolygon()
    ? `in the multipolygon ${relation.id}, so it is not known to be outer or inner`
    : `in the relation ${relation.id}`
  const fixes: Fix[] = Object.entries(options).map(([role, definition]) =>
    setRoleFix(relation.id, member.id, index, role, definition.label || role),
  )
  fixes.push(removeFix(relation.id, member.id, index))
  return {
    id: `missing_role:${member.id}:${relation.id}:${index}`,
    rule: 'missing_role',
    severity: 'warning',
    message: `The ${kindOf(member)} ${member.id} has no role ${where}`,
    entityIds: [member.id, relation.id],
    ...(loc ? { loc } : {}),
    fixes,
    data: { index },
  } satisfies Issue
}

/**
 * Members without a role. Checked from both sides, as iD does: a node or a way asks its parent relations, and a
 * relation asks each of its members. The two findings of one missing role are one issue (same id, from the index).
 */
export const missingRole: Rule = {
  id: 'missing_role',
  label: 'Missing role',
  validate(entity, { graph, presets }) {
    const issues: Issue[] = []

    if (entity instanceof OsmNode || entity instanceof OsmWay) {
      for (const relation of graph.parentRelations(entity)) {
        const roles = roleSchemaOf(relation, presets)
        if (!roles) continue
        relation.members.forEach((member, index) => {
          if (member.id === entity.id && isMissingRole(member.role)) {
            const options = fittingRoles(entity, relation, roles, presets, graph)
            issues.push(makeIssue(entity, relation, index, options, graph))
          }
        })
      }
    } else if (entity instanceof OsmRelation) {
      const roles = roleSchemaOf(entity, presets)
      if (roles) {
        entity.members.forEach((member, index) => {
          const memberEntity = graph.hasEntity(member.id)
          if (memberEntity && isMissingRole(member.role)) {
            const options = fittingRoles(memberEntity, entity, roles, presets, graph)
            issues.push(makeIssue(memberEntity, entity, index, options, graph))
          }
        })
      }
    }

    return issues
  },
}

import {
  OsmNode,
  OsmRelation,
  OsmWay,
  actionChangeMember,
  actionDeleteMember,
  actionDeleteMembers,
} from '@osm-editor-kit/maid-model'
import type { Action, Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { locationOf } from '../geo.ts'
import type { Fix, Issue, PresetLookup, RelationMemberRule, RelationRoles, Rule } from '../types.ts'

// Ported from iD's relation_members (ISC, © iD contributors), at PR 12994: the duplicate_member subtype. iD's
// suggestion severity is a warning here, because Maid's Severity has no suggestion.
//
// The schema subtypes are ported from Kyle's fork of iD (k-yle/iD a9b0a9ba6, modules/validations/relation.js, the
// same validation that iD's parts 12991 to 12994 are built from): too_few, too_many, invalid_tags, wrong_role,
// invalid_geometry and role_not_allowed. Their messages are Kyle's, with the names of the features replaced by their
// kind and id (Maid has no display names here). The fixes Kyle's code has a title for but no action for are left out:
// adding a member to a relation, changing the tags or the geometry of a member are choices the person makes.
//
// Needs the presets (`context.presets`): nothing until they are made, and nothing for a relation without a schema
// that has members (no schema = no issue; the multipolygon fallback of missing_role does not apply here).

type Member = OsmRelation['members'][number]

/** One role of a relation's schema, as iD's schema categories: the role, its label (the role when none) and its rule */
type Category = { role: string; label: string; rule: RelationMemberRule }

const rule = 'relation_members'

function kindOf(entity: OsmEntity) {
  if (entity instanceof OsmNode) return 'node'
  if (entity instanceof OsmWay) return 'way'
  return 'relation'
}

/** iD's formatRole: the role's label in curly quotes */
function quoted(label: string) {
  return `“${label}”`
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

/** Whether the member at `index` is still the member the issue is about */
function isMemberAt(graph: Graph, relationId: string, memberId: string, index: number) {
  const relation = graph.hasEntity(relationId)
  if (!(relation instanceof OsmRelation)) return false
  return relation.members[index]?.id === memberId
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

/** Removes the member the issue is about, as iD's remove_from_relation: the occurrence at this index */
function removeMemberFix(relationId: string, memberId: string, index: number): Fix {
  return {
    id: 'remove_from_relation',
    label: 'Remove from relation',
    annotation: 'Removed a member from the relation',
    actions: (graph) =>
      isMemberAt(graph, relationId, memberId, index) ? [actionDeleteMember(relationId, index)] : [],
  }
}

/** Gives every membership of the member the role, as iD's makeChangeRoleFix: one undo step */
function changeRoleFix(relationId: string, memberId: string, role: string, label: string): Fix {
  return {
    id: `change_role:${role}`,
    label: `Change role to ${quoted(label)}`,
    annotation: 'Changed the role of a member',
    actions: (graph) => {
      const relation = graph.hasEntity(relationId)
      if (!(relation instanceof OsmRelation)) return []
      const actions: Action[] = []
      relation.members.forEach((member, index) => {
        if (member.id === memberId) {
          actions.push(actionChangeMember(relationId, { ...member, role }, index))
        }
      })
      return actions
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
      rule,
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

/** The roles of a relation's schema, in the schema's order, with the label a role shows (the role when it has none) */
function categoriesOf(roles: RelationRoles): Category[] {
  return Object.entries(roles).map(([role, { label, member }]) => ({
    role,
    label: label || role,
    rule: member,
  }))
}

/**
 * The schema checks of one relation, as iD's validateAgainstSchema. The counts (too few, too many) need every member
 * to be downloaded, as in iD; the member checks skip the members that are not downloaded.
 */
function schemaIssues(
  relation: OsmRelation,
  roles: RelationRoles,
  graph: Graph,
  presets: PresetLookup,
): Issue[] {
  const categories = categoriesOf(roles)
  const categoryOf = (role: string) => categories.find((category) => category.role === role)
  const relationRef = `the relation ${relation.id}`
  const issues: Issue[] = []

  // The roles a member fits, by its tags and by its geometry, each worked out once per member
  const fits = new Map<string, { tags: Set<string>; geometry: Set<string> }>()
  const fitOf = (entity: OsmEntity) => {
    const known = fits.get(entity.id)
    if (known) return known
    const fit = {
      tags: new Set(Object.keys(presets.memberRoles(relation.tags, undefined, entity.tags))),
      geometry: new Set(
        Object.keys(presets.memberRoles(relation.tags, entity.geometry(graph), undefined)),
      ),
    }
    fits.set(entity.id, fit)
    return fit
  }
  const fitsRole = (entity: OsmEntity, role: string) => {
    const fit = fitOf(entity)
    return fit.tags.has(role) && fit.geometry.has(role)
  }

  // Roles whose maximum is reached: no fix may add a member to them
  const notAllowed = new Set<string>()

  const fullyDownloaded = relation.members.every((member) => graph.hasEntity(member.id))
  if (fullyDownloaded) {
    for (const category of categories) {
      const count = relation.members.filter((member) => {
        const entity = graph.hasEntity(member.id)
        return (
          entity !== undefined && member.role === category.role && fitsRole(entity, category.role)
        )
      }).length
      const { min, max } = category.rule
      const role = quoted(category.label)

      if (min && count < min) {
        issues.push(
          relationIssue(relation, graph, 'too_few', category.role, {
            message: `${capitalized(relationRef)} does not have enough members with the role ${role}`,
            min,
            count,
          }),
        )
      }
      if (max && count > max) {
        issues.push(
          relationIssue(relation, graph, 'too_many', category.role, {
            message: `${capitalized(relationRef)} has too many members with the role ${role}`,
            max,
            count,
          }),
        )
      }
      if (max && count >= max) notAllowed.add(category.role)
    }
  }

  relation.members.forEach((member, index) => {
    const entity = graph.hasEntity(member.id)
    if (!entity) return
    const matching = categoryOf(member.role)
    // a member without a role is missing_role's (with its "Set as …" fixes): one issue, not two, unlike iD
    if (!matching && member.role.trim() === '') return
    const fit = fitOf(entity)
    const who = `The ${kindOf(entity)} ${entity.id}`
    const loc = locationOf(entity, graph)
    const base = {
      relationId: relation.id,
      memberId: member.id,
      index,
      entityIds: [member.id, relation.id],
      loc,
    }

    if (matching) {
      if (!fit.tags.has(matching.role)) {
        // iD: invalid_tags when the role has tag patterns, else wrong_role. The roles that fit these tags and geometry
        // are offered, without those whose maximum is reached.
        const expectedRoles = categories
          .filter((category) => fit.tags.has(category.role) && fit.geometry.has(category.role))
          .map((category) => category.role)
          .filter((role) => !notAllowed.has(role))
        const subtype = matching.rule.matchTags?.length ? 'invalid_tags' : 'wrong_role'
        issues.push(
          memberIssue(base, subtype, {
            message:
              subtype === 'invalid_tags'
                ? `${who} needs different tags`
                : `${who} has the wrong role within ${relationRef}`,
            fixes: [
              ...expectedRoles.map((role) =>
                changeRoleFix(relation.id, member.id, role, labelOf(categories, role)),
              ),
              removeMemberFix(relation.id, member.id, index),
            ],
            data: { role: member.role, expectedRoles },
          }),
        )
      }
      if (!fit.geometry.has(matching.role)) {
        issues.push(
          memberIssue(base, 'invalid_geometry', {
            message: `${who} can’t have this geometry, since it belongs to ${relationRef}`,
            fixes: [removeMemberFix(relation.id, member.id, index)],
            data: { role: member.role, expectedGeometry: matching.rule.geometry ?? [] },
          }),
        )
      }
    } else {
      // iD: the role is invalid when another role fits this member; no role fits, the role is not allowed at all
      const candidates = categories.filter(
        (category) => fit.tags.has(category.role) && fit.geometry.has(category.role),
      )
      if (candidates.length > 0) {
        const expectedRoles = candidates
          .map((category) => category.role)
          .filter((role) => !notAllowed.has(role))
        issues.push(
          memberIssue(base, 'wrong_role', {
            message: `${who} has the wrong role within ${relationRef}`,
            fixes: [
              ...expectedRoles.map((role) =>
                changeRoleFix(relation.id, member.id, role, labelOf(categories, role)),
              ),
              removeMemberFix(relation.id, member.id, index),
            ],
            data: { role: member.role, expectedRoles },
          }),
        )
      } else {
        issues.push(
          memberIssue(base, 'role_not_allowed', {
            message: `${capitalized(relationRef)} cannot have a member with the role “${member.role}”`,
            fixes: [removeMemberFix(relation.id, member.id, index)],
            data: { role: member.role },
          }),
        )
      }
    }
  })

  return issues
}

function capitalized(text: string) {
  return `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`
}

/** The label of a role of the categories, the role itself when it has none */
function labelOf(categories: Category[], role: string) {
  return categories.find((category) => category.role === role)?.label ?? role
}

/** An issue about a relation as a whole: a count of its members. The fixes need an action that Maid does not have. */
function relationIssue(
  relation: OsmRelation,
  graph: Graph,
  subtype: string,
  role: string,
  details: { message: string } & Record<string, unknown>,
): Issue {
  const { message, ...data } = details
  const loc = locationOf(relation, graph)
  return {
    id: `relation_members:${subtype}:${relation.id}:${role}`,
    rule,
    severity: 'warning',
    message,
    entityIds: [relation.id],
    ...(loc ? { loc } : {}),
    fixes: [],
    data: { subtype, role, ...data },
  }
}

/** An issue about one membership of an entity in a relation: the id has the index, as missing_role's */
function memberIssue(
  base: {
    relationId: string
    memberId: string
    index: number
    entityIds: string[]
    loc: [number, number] | undefined
  },
  subtype: string,
  details: { message: string; fixes: Fix[]; data: Record<string, unknown> },
): Issue {
  return {
    id: `relation_members:${subtype}:${base.memberId}:${base.relationId}:${base.index}`,
    rule,
    severity: 'warning',
    message: details.message,
    entityIds: base.entityIds,
    ...(base.loc ? { loc: base.loc } : {}),
    fixes: details.fixes,
    data: { subtype, ...details.data },
  }
}

/**
 * Relation members that a relation's schema does not allow, from the schema of the relation (iD's relation validator):
 * duplicate members, too few or too many members of a role, a role that is wrong or not allowed, and a member whose
 * tags or geometry do not fit its role. Checked from both sides: an entity asks its parent relations, and a relation
 * checks itself.
 */
export const relationMembers: Rule = {
  id: rule,
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
      if (!presets.allowsDuplicateMembers(relation.tags)) {
        issues.push(...duplicateIssues(relation, roles, graph))
      }
      issues.push(...schemaIssues(relation, roles, graph, presets))
    }
    return issues
  },
}

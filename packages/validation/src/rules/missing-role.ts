import { OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { Graph, OsmEntity } from '@osm-editor-kit/maid-model'
import { locationOf } from '../geo.ts'
import type { Issue, Rule } from '../types.ts'

/** A member without a role, or with only spaces as its role, in a multipolygon */
function isMissingRole(role: string | undefined) {
  return !role || role.trim().length === 0
}

function kindOf(entity: OsmEntity) {
  if (entity instanceof OsmNode) return 'node'
  if (entity instanceof OsmWay) return 'way'
  return 'relation'
}

/** One issue per member of a multipolygon that has no role: `outer` or `inner` is needed */
function makeIssue(member: OsmEntity, relation: OsmRelation, index: number, graph: Graph) {
  const loc = locationOf(member, graph)
  return {
    id: `missing_role:${member.id}:${relation.id}:${index}`,
    rule: 'missing_role',
    severity: 'warning',
    message: `The ${kindOf(member)} ${member.id} has no role in the multipolygon ${relation.id}, so it is not known to be outer or inner`,
    entityIds: [member.id, relation.id],
    ...(loc ? { loc } : {}),
    fixes: [],
    data: { index },
  } satisfies Issue
}

/**
 * Members of a multipolygon without a role. Checked from both sides, as iD does: a way asks its
 * parent multipolygons, and a multipolygon asks each of its members. Maid offers no fix yet: setting
 * the role and removing the member change the relation's members, not a tag, so they are a todo
 * in the validations report.
 */
export const missingRole: Rule = {
  id: 'missing_role',
  label: 'Missing role',
  validate(entity, { graph }) {
    const issues: Issue[] = []

    if (entity instanceof OsmWay) {
      for (const relation of graph.parentRelations(entity)) {
        if (!relation.isMultipolygon()) continue
        const index = relation.members.findIndex((member) => member.id === entity.id)
        if (index < 0) continue
        const member = relation.members[index]
        if (member && isMissingRole(member.role)) {
          issues.push(makeIssue(entity, relation, index, graph))
        }
      }
    } else if (entity instanceof OsmRelation && entity.isMultipolygon()) {
      entity.members.forEach((member, index) => {
        const memberEntity = graph.hasEntity(member.id)
        if (memberEntity && isMissingRole(member.role)) {
          issues.push(makeIssue(memberEntity, entity, index, graph))
        }
      })
    }

    return issues
  },
}

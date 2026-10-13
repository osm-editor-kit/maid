import { m } from '@osm-editor-kit/maid-i18n'
import { OsmRelation } from '@osm-editor-kit/maid-model'
import type { Issue, Rule } from '@osm-editor-kit/maid-validation'

export const TURN_RESTRICTION_RULE_ID = 'turn_restriction_incomplete'

/**
 * A `type=restriction` relation that lacks its members: one `from` way, one `via` node or ways, one `to` way
 * (`OsmRelation.isValidRestriction`, as iD checks it). No fix: the person adds the member or removes the relation.
 */
export const turnRestrictionIncomplete: Rule = {
  id: TURN_RESTRICTION_RULE_ID,
  get label() {
    return m.turn_restrictions_rule_label()
  },
  validate(entity) {
    if (!(entity instanceof OsmRelation)) return []
    if (!entity.isRestriction() || entity.isValidRestriction()) return []
    const issue: Issue = {
      id: `${TURN_RESTRICTION_RULE_ID}:${entity.id}`,
      rule: TURN_RESTRICTION_RULE_ID,
      severity: 'error',
      message: m.turn_restrictions_rule_message(),
      entityIds: [entity.id],
      fixes: [],
    }
    return [issue]
  },
}

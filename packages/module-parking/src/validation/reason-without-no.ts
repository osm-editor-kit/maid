import type { Issue, Rule } from '@osm-editor-kit/maid-validation'
import { readSide, sideKey } from '../sides.ts'
import { featureName, issueFor, sourceKey } from './shared.ts'

export const RULE_ID = 'parking_reason_without_no'

/**
 * `parking:<side>:reason` on a side that is not `parking:<side>=no`. The documents use the reason only together with
 * `no` (qa-markings-obstacles-process.md 5.1: "Use with =no"; project-decisions D4, D7; entries S5, O3, S15). No fix:
 * either the position or the reason is wrong.
 *
 * The opposite check, "every `no` needs a reason" (project-decisions R2), is not a rule on purpose: the Q&A calls the
 * reason optional (O3), and `no` without a reason is the normal tagging of most roads, so it would fire on almost
 * every road a mapper touches. The reason is offered instead, as buttons and as a field.
 */
export const reasonWithoutNo: Rule = {
  id: RULE_ID,
  label: 'A reason for no parking on a side that has parking',
  validate(entity) {
    const tags = entity.tags
    const feature = featureName(tags)
    const issues: Issue[] = []
    for (const side of ['left', 'right'] as const) {
      const reason = readSide(tags, side, 'reason')
      if (reason === undefined || readSide(tags, side) === 'no') continue
      const described = `${sourceKey(tags, side, 'reason')}=${reason}`
      issues.push(
        issueFor({
          rule: RULE_ID,
          entity,
          part: `:${side}`,
          feature,
          tags: described,
          message: `${feature} has ${described}, but the ${side} side is not ${sideKey(side)}=no: the reason belongs to a side without parking`,
          fixes: [],
        }),
      )
    }
    return issues
  },
}

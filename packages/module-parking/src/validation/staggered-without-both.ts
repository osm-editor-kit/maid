import type { Rule } from '@osm-editor-kit/maid-validation'
import { featureName, issueFor } from './shared.ts'

export const RULE_ID = 'parking_staggered_without_both'

/**
 * `parking:both:staggered=yes` is written in addition to `parking:both=*` (project-decisions D3). Without
 * the `both` value the staggered flag has nothing to describe. No fix: the value is a mapper's choice.
 */
export const staggeredWithoutBoth: Rule = {
  id: RULE_ID,
  label: 'Staggered parking without a both value',
  validate(entity) {
    const tags = entity.tags
    if (tags['parking:both:staggered'] !== 'yes' || tags['parking:both']) return []
    const feature = featureName(tags)
    return [
      issueFor({
        rule: RULE_ID,
        entity,
        feature,
        tags: 'parking:both:staggered=yes',
        message: `${feature} has parking:both:staggered=yes without parking:both: staggered parking is given in addition to parking:both`,
        fixes: [],
      }),
    ]
  },
}

import type { Rule } from '@osm-editor-kit/maid-validation'
import { m } from '../messages.ts'
import { featureName, issueFor } from './shared.ts'

export const RULE_ID = 'parking_staggered_without_both'

/**
 * `parking:both:staggered=yes` is written in addition to `parking:both=*` (project-decisions D3). Without
 * the `both` value the staggered flag has nothing to describe. No fix: the value is a mapper's choice.
 */
export const staggeredWithoutBoth: Rule = {
  id: RULE_ID,
  get label() {
    return m.valid_staggered_label()
  },
  validate(entity) {
    const tags = entity.tags
    if (tags['parking:both:staggered'] !== 'yes' || tags['parking:both']) return []
    const feature = featureName(tags)
    return [
      issueFor({
        rule: RULE_ID,
        entity,
        tags: 'parking:both:staggered=yes',
        message: m.valid_staggered_message({ feature, tags: 'parking:both:staggered=yes' }),
        fixes: [],
      }),
    ]
  },
}

import type { Issue, Rule } from '@osm-editor-kit/maid-validation'
import { sideKey } from '../sides.ts'
import { featureName, issueFor } from './shared.ts'

export const RULE_ID = 'parking_fee_conditional'

/**
 * `parking:<side>:fee=yes` together with `parking:<side>:fee:conditional=yes …` (qa-traffic-signs 4.4, V7,
 * entry 6). The suggested repair (`fee=yes` with `fee:conditional=no @ (free hours)`) needs the hours, so
 * there is no fix.
 */
export const feeConditional: Rule = {
  id: RULE_ID,
  label: 'Fee and a conditional fee of yes',
  validate(entity) {
    const tags = entity.tags
    const feature = featureName(tags)
    const issues: Issue[] = []
    for (const side of ['left', 'right', 'both'] as const) {
      const fee = tags[sideKey(side, 'fee')]
      const conditional = tags[sideKey(side, 'fee:conditional')]
      if (fee !== 'yes' || !conditional || !/^yes\b/.test(conditional.trim())) continue
      const described = `${sideKey(side, 'fee')}=yes, ${sideKey(side, 'fee:conditional')}=${conditional}`
      issues.push(
        issueFor({
          rule: RULE_ID,
          entity,
          part: `:${side}`,
          feature,
          tags: described,
          message: `${feature} has ${described}: the fee is both always and conditionally yes`,
          fixes: [],
        }),
      )
    }
    return issues
  },
}

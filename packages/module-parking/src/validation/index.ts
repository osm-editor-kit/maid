import type { Rule } from '@osm-editor-kit/maid-validation'
import { bothConflictsSide } from './both-side-conflict.ts'
import { conditionalSyntax } from './conditional-syntax.ts'
import { feeConditional } from './fee-conditional.ts'
import { legacySchema } from './legacy-schema.ts'
import { reasonWithoutNo } from './reason-without-no.ts'
import { restrictionOnParkingSide } from './restriction-on-parking-side.ts'
import { shoulderWithoutInformal } from './shoulder-informal.ts'
import { staggeredWithoutBoth } from './staggered-without-both.ts'
import { weekdayComma } from './weekday-comma.ts'

export { FIXES_DE, MESSAGES_DE } from './messages-de.ts'
export {
  bothConflictsSide,
  conditionalSyntax,
  feeConditional,
  legacySchema,
  reasonWithoutNo,
  restrictionOnParkingSide,
  shoulderWithoutInformal,
  staggeredWithoutBoth,
  weekdayComma,
}

/** The rules for parking tags. The app lists them after the default ones: `validation({ rules: [...defaultRules, ...parkingRules] })`. */
export const parkingRules: Rule[] = [
  restrictionOnParkingSide,
  reasonWithoutNo,
  bothConflictsSide,
  legacySchema,
  conditionalSyntax,
  weekdayComma,
  feeConditional,
  staggeredWithoutBoth,
  shoulderWithoutInformal,
]

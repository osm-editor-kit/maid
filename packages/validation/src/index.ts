// Headless validation for Maid: rules that look at entities and their neighbours, and a validator
// that keeps what they found. No map, no React, no DOM.

import { almostJunction } from './rules/almost-junction.ts'
import { crossingWays } from './rules/crossing-ways.ts'
import { disconnectedWay } from './rules/disconnected-way.ts'
import { impossibleOneway } from './rules/impossible-oneway.ts'
import { incompatibleSource } from './rules/incompatible-source.ts'
import { invalidFormat } from './rules/invalid-format.ts'
import { missingRole } from './rules/missing-role.ts'
import { missingTag } from './rules/missing-tag.ts'
import { mutuallyExclusiveTags } from './rules/mutually-exclusive-tags.ts'
import { osmApiLimits } from './rules/osm-api-limits.ts'
import { privateData } from './rules/private-data.ts'
import type { Rule } from './types.ts'

export { createValidator } from './validator.ts'
export { compareSharedIssues, sharedIssues } from './shared-issues.ts'
export { missingTag } from './rules/missing-tag.ts'
export { disconnectedWay } from './rules/disconnected-way.ts'
export { crossingWays } from './rules/crossing-ways.ts'
export { almostJunction } from './rules/almost-junction.ts'
export { impossibleOneway } from './rules/impossible-oneway.ts'
export { incompatibleSource } from './rules/incompatible-source.ts'
export { invalidFormat } from './rules/invalid-format.ts'
export { missingRole } from './rules/missing-role.ts'
export { mutuallyExclusiveTags } from './rules/mutually-exclusive-tags.ts'
export { osmApiLimits } from './rules/osm-api-limits.ts'
export { privateData } from './rules/private-data.ts'
export type * from './types.ts'

/** The rules Maid runs unless a caller passes its own */
export const defaultRules: Rule[] = [
  missingTag,
  disconnectedWay,
  crossingWays,
  // reports less than iD for now: it has no query for the ways beyond a road's end (F-validations-21)
  almostJunction,
  impossibleOneway,
  invalidFormat,
  mutuallyExclusiveTags,
  incompatibleSource,
  privateData,
  missingRole,
  osmApiLimits,
]
